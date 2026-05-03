// =============================================================
// FinFlow — Página: Configurações (Categorias & Subcategorias)
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { getTheme, setTheme } from '../lib/theme.js';

// -----------------------------
// State
// -----------------------------
let cachedCategorias    = [];
let cachedSubcategorias = [];
let cachedProjetos      = [];
let cachedDividas       = [];

// Modal state
let editingCatId  = null; // null = nova, string = editar existente
let editingSubId  = null; // null = nova, string = editar existente
let newSubCatId   = null; // categoria_id pra nova subcategoria
let pendingDelete = null; // { type: 'cat'|'sub', id }

const SUPER_BLOCOS = [
  { id: 'contribuicao', label: 'Contribuição', grupos: ['receitas', 'dividas'],  accent: 'var(--color-success)' },
  { id: 'sonhos',       label: 'Sonhos',       grupos: ['investimentos'],        accent: 'var(--color-primary)' },
  { id: 'custo_vida',   label: 'Custo de vida', grupos: ['custo_vida'],          accent: 'var(--color-secondary)' },
];

// SVG icons inline
const ICON_LINK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const ICON_PLUS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('configuracoes');
  await loadAll();
  renderTree();
  updateStickyThTop();
  bindTabEvents();
  bindDropdownEvents();
  bindModalEvents();
  bindThemeEvents();
  initVinculoPopover();
  window.addEventListener('resize', updateStickyThTop);
});

// -----------------------------
// Sticky thead offset
// -----------------------------
function updateStickyThTop() {
  const toolbar = document.getElementById('cfg-panel-toolbar');
  if (!toolbar || toolbar.classList.contains('hidden')) return;
  const h = toolbar.offsetHeight;
  document.documentElement.style.setProperty('--cfg-th-sticky-top', `calc(var(--header-height) + ${h}px)`);
}

// -----------------------------
// Loaders
// -----------------------------
async function loadAll() {
  const [cats, subs, projs, divs] = await Promise.all([
    supabase.from('categorias').select('*').order('ordem'),
    supabase.from('subcategorias').select('*').neq('status', 'arquivada'),
    supabase.from('projetos_investimento').select('id, nome, cor, meta_valor, saldo_inicial').order('nome'),
    supabase.from('dividas').select('id, nome, valor_total, valor_pago, credor, status').order('nome'),
  ]);

  cachedCategorias    = cats.data  || [];
  cachedSubcategorias = subs.data  || [];
  cachedProjetos      = projs.data || [];
  cachedDividas       = divs.data  || [];

  document.getElementById('cfg-loading').classList.add('hidden');
  document.getElementById('cfg-tree').classList.remove('hidden');
}

async function reloadAll() {
  document.getElementById('cfg-tree').innerHTML = '';
  await loadAll();
  renderTree();
}

// -----------------------------
// Render
// -----------------------------
function renderTree() {
  const container = document.getElementById('cfg-tree');

  const subsBycat = new Map();
  for (const cat of cachedCategorias) subsBycat.set(cat.id, []);
  for (const sub of cachedSubcategorias) {
    if (subsBycat.has(sub.categoria_id)) subsBycat.get(sub.categoria_id).push(sub);
  }
  for (const arr of subsBycat.values()) {
    arr.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }));
  }

  const html = SUPER_BLOCOS.map((bloco) => {
    const cats = cachedCategorias.filter((c) => bloco.grupos.includes(c.grupo || 'custo_vida'));
    if (!cats.length) return '';

    let bodySections = '';
    for (const cat of cats) {
      const subs      = subsBycat.get(cat.id) || [];
      const isDefault = cat.is_default;

      const catActions = `
        <div class="cfg-cat-inline-actions">
          ${!isDefault ? `<button class="btn-icon" data-edit-cat="${cat.id}" title="Editar categoria">${ICON_EDIT}</button>` : ''}
          ${!isDefault && subs.length === 0 ? `<button class="btn-icon danger" data-delete-cat="${cat.id}" title="Excluir categoria">${ICON_TRASH}</button>` : ''}
          <button class="btn-icon" data-new-sub-cat="${cat.id}" title="Nova subcategoria">${ICON_PLUS}</button>
        </div>`;

      const catCell = (rowspan) => `
        <td class="cfg-td-cat" rowspan="${rowspan}">
          <span class="cfg-cat-nome-cell">${escapeHtml(cat.nome)}</span>
          ${catActions}
        </td>`;

      let catRows = '';

      if (subs.length === 0) {
        catRows = `
          <tr class="cfg-tr cfg-tr-cat-only">
            ${catCell(1)}
            <td class="cfg-td-sub cfg-td-empty">Sem subcategorias</td>
            <td class="cfg-td-vinculo"><span class="cfg-vinculo-empty">sem vínculo</span></td>
            <td class="cfg-td-actions"></td>
          </tr>`;
      } else {
        subs.forEach((sub, i) => {
          const hasComp = Number(sub.valor_base) > 0 || sub.valor_variavel === true;
          const projeto = sub.projeto_id ? cachedProjetos.find((p) => p.id === sub.projeto_id) : null;
          const divida  = sub.divida_id  ? cachedDividas.find((d) => d.id === sub.divida_id)   : null;

          let vinculoHtml;
          if (projeto) {
            vinculoHtml = `<span class="vinculo-badge vinculo-badge--projeto" data-vinculo-type="projeto" data-vinculo-id="${projeto.id}" style="--vinculo-cor:${projeto.cor};">${escapeHtml(projeto.nome)}</span>`;
          } else if (divida) {
            vinculoHtml = `<span class="vinculo-badge vinculo-badge--divida" data-vinculo-type="divida" data-vinculo-id="${sub.divida_id}">${escapeHtml(divida.nome)}</span>`;
          } else {
            vinculoHtml = '<span class="cfg-vinculo-empty">sem vínculo</span>';
          }

          const subActions = `
            <div class="cfg-row-actions">
              <button class="btn-icon" data-edit-sub="${sub.id}" title="Renomear">${ICON_EDIT}</button>
              ${!hasComp ? `<button class="btn-icon danger" data-delete-sub="${sub.id}" title="Excluir">${ICON_TRASH}</button>` : ''}
            </div>`;

          catRows += `
            <tr class="cfg-tr${i === 0 ? ' cfg-tr--first' : ''}">
              ${i === 0 ? catCell(subs.length) : ''}
              <td class="cfg-td-sub">${escapeHtml(sub.nome)}</td>
              <td class="cfg-td-vinculo">${vinculoHtml}</td>
              <td class="cfg-td-actions">${subActions}</td>
            </tr>`;
        });
      }

      bodySections += `<tbody class="cfg-cat-body" style="--cat-cor: ${cat.cor};">${catRows}</tbody>`;
    }

    return `
      <div class="cfg-bloco" style="--bloco-accent: ${bloco.accent};">
        <table class="cfg-table">
          <thead>
            <tr class="cfg-thead-bloco-row">
              <th class="cfg-th-bloco-label" colspan="4">${escapeHtml(bloco.label)}</th>
            </tr>
            <tr>
              <th class="cfg-th-cat">Categoria</th>
              <th class="cfg-th-sub">Subcategoria</th>
              <th class="cfg-th-vinculo">Vínculo</th>
              <th class="cfg-th-actions"></th>
            </tr>
          </thead>
          ${bodySections}
        </table>
      </div>`;
  }).join('');

  container.innerHTML = html;
  bindTreeEvents();
}

// -----------------------------
// Tree event delegation
// -----------------------------
function bindTreeEvents() {
  const tree = document.getElementById('cfg-tree');

  tree.addEventListener('click', (e) => {
    // Nova categoria por bloco
    const newCatBtn = e.target.closest('[data-new-cat-grupo]');
    if (newCatBtn) { openCatModal(null, newCatBtn.dataset.newCatGrupo); return; }

    // Editar categoria
    const editCatBtn = e.target.closest('[data-edit-cat]');
    if (editCatBtn) { openCatModal(editCatBtn.dataset.editCat); return; }

    // Excluir categoria
    const deleteCatBtn = e.target.closest('[data-delete-cat]');
    if (deleteCatBtn) { confirmDelete('cat', deleteCatBtn.dataset.deleteCat); return; }

    // Nova subcategoria
    const newSubBtn = e.target.closest('[data-new-sub-cat]');
    if (newSubBtn) { openSubModal(null, newSubBtn.dataset.newSubCat); return; }

    // Editar subcategoria
    const editSubBtn = e.target.closest('[data-edit-sub]');
    if (editSubBtn) { openSubModal(editSubBtn.dataset.editSub); return; }

    // Excluir subcategoria
    const deleteSubBtn = e.target.closest('[data-delete-sub]');
    if (deleteSubBtn) { confirmDelete('sub', deleteSubBtn.dataset.deleteSub); return; }
  });
}

// -----------------------------
// Categoria modal
// -----------------------------
function openCatModal(catId = null, defaultGrupo = 'custo_vida') {
  editingCatId = catId;
  const cat = catId ? cachedCategorias.find((c) => c.id === catId) : null;

  document.getElementById('modal-categoria-title').textContent = cat ? 'Editar categoria' : 'Nova categoria';
  document.getElementById('cat-nome').value  = cat?.nome || '';
  document.getElementById('cat-cor').value   = cat?.cor  || '#6D5EF5';
  document.getElementById('cat-cor-wrapper').style.background = cat?.cor || '#6D5EF5';
  document.getElementById('cat-grupo').value = cat?.grupo || defaultGrupo;

  document.getElementById('modal-categoria').classList.remove('hidden');
  document.getElementById('cat-nome').focus();
}

function closeCatModal() {
  document.getElementById('modal-categoria').classList.add('hidden');
  editingCatId = null;
}

async function saveCat() {
  const nome  = document.getElementById('cat-nome').value.trim();
  const cor   = document.getElementById('cat-cor').value;
  const grupo = document.getElementById('cat-grupo').value;

  if (!nome) { showToast('Informe o nome da categoria', 'error'); return; }

  const btn = document.getElementById('btn-save-categoria');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const user = await getCurrentUser();
  if (!user) return;

  let error;
  if (editingCatId) {
    ({ error } = await supabase.from('categorias').update({ nome, cor, grupo }).eq('id', editingCatId));
  } else {
    const ordem = cachedCategorias.length;
    ({ error } = await supabase.from('categorias').insert({ user_id: user.id, nome, cor, grupo, ordem, is_default: false }));
  }

  btn.disabled = false;
  btn.textContent = 'Salvar';

  if (error) { showToast('Erro: ' + error.message, 'error', 8000); return; }

  showToast(editingCatId ? 'Categoria atualizada' : 'Categoria criada', 'success');
  closeCatModal();
  await reloadAll();
}

// -----------------------------
// Subcategoria modal
// -----------------------------
function openSubModal(subId = null, catId = null) {
  editingSubId = subId;
  newSubCatId  = catId;

  const sub           = subId ? cachedSubcategorias.find((s) => s.id === subId) : null;
  const resolvedCatId = catId || sub?.categoria_id || null;
  const cat           = resolvedCatId ? cachedCategorias.find((c) => c.id === resolvedCatId) : null;

  document.getElementById('modal-subcategoria-title').textContent = sub ? 'Editar subcategoria' : 'Nova subcategoria';
  document.getElementById('sub-nome').value = sub?.nome || '';

  // Show categoria selector only when opened globally (no pre-selected category)
  const showCatSelect = !resolvedCatId;
  const catField = document.getElementById('sub-categoria-field');
  catField.classList.toggle('hidden', !showCatSelect);
  document.getElementById('sub-categoria-hint').textContent = cat ? `Categoria: ${cat.nome}` : '';

  if (showCatSelect) {
    const sel = document.getElementById('sub-categoria-select');
    sel.innerHTML = '<option value="">Selecione uma categoria…</option>' +
      cachedCategorias
        .map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`)
        .join('');
    sel.value = '';
  }

  document.getElementById('modal-subcategoria').classList.remove('hidden');
  document.getElementById('sub-nome').focus();
}

function closeSubModal() {
  document.getElementById('modal-subcategoria').classList.add('hidden');
  editingSubId = null;
  newSubCatId  = null;
}

async function saveSub() {
  const nome = document.getElementById('sub-nome').value.trim();
  if (!nome) { showToast('Informe o nome da subcategoria', 'error'); return; }

  // Resolve catId: pre-selected (from row +button) or from the global selector
  let resolvedCatId = newSubCatId;
  if (!resolvedCatId && !editingSubId) {
    resolvedCatId = document.getElementById('sub-categoria-select').value || null;
    if (!resolvedCatId) { showToast('Selecione uma categoria', 'error'); return; }
  }

  const btn = document.getElementById('btn-save-subcategoria');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const user = await getCurrentUser();
  if (!user) return;

  let error;
  if (editingSubId) {
    ({ error } = await supabase.from('subcategorias').update({ nome }).eq('id', editingSubId));
  } else {
    const cat = cachedCategorias.find((c) => c.id === resolvedCatId);
    const tipo = cat?.grupo === 'receitas' ? 'Receita' : 'Despesa';
    const today = new Date().toISOString().slice(0, 10);
    ({ error } = await supabase.from('subcategorias').insert({
      user_id:      user.id,
      nome,
      categoria_id: resolvedCatId,
      tipo,
      periodo:      'Mensal',
      valor_base:   0,
      iniciado_em:  today,
      status:       'ativa',
    }));
  }

  btn.disabled = false;
  btn.textContent = 'Salvar';

  if (error) { showToast('Erro: ' + error.message, 'error', 8000); return; }

  showToast(editingSubId ? 'Subcategoria renomeada' : 'Subcategoria criada', 'success');
  closeSubModal();
  await reloadAll();
}

// -----------------------------
// Delete confirmations
// -----------------------------
function confirmDelete(type, id) {
  pendingDelete = { type, id };

  if (type === 'cat') {
    const cat = cachedCategorias.find((c) => c.id === id);
    document.getElementById('cfg-confirm-title').textContent = 'Excluir categoria?';
    document.getElementById('cfg-confirm-msg').innerHTML =
      `Excluir <strong>${escapeHtml(cat?.nome || '')}</strong>? Esta ação não pode ser desfeita.`;
  } else {
    const sub = cachedSubcategorias.find((s) => s.id === id);
    document.getElementById('cfg-confirm-title').textContent = 'Excluir subcategoria?';
    document.getElementById('cfg-confirm-msg').innerHTML =
      `Excluir <strong>${escapeHtml(sub?.nome || '')}</strong>? Esta ação não pode ser desfeita.`;
  }

  document.getElementById('modal-cfg-confirmar').classList.remove('hidden');
}

function closeConfirmModal() {
  document.getElementById('modal-cfg-confirmar').classList.add('hidden');
  pendingDelete = null;
}

async function execDelete() {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  closeConfirmModal();

  let error;
  if (type === 'cat') {
    const hasSubs = cachedSubcategorias.some((s) => s.categoria_id === id);
    if (hasSubs) {
      showToast('Não é possível excluir: existem subcategorias nessa categoria.', 'error', 8000);
      return;
    }
    ({ error } = await supabase.from('categorias').delete().eq('id', id));
  } else {
    ({ error } = await supabase.from('subcategorias').delete().eq('id', id));
  }

  if (error) { showToast('Erro ao excluir: ' + error.message, 'error', 8000); return; }

  showToast(type === 'cat' ? 'Categoria excluída' : 'Subcategoria excluída', 'success');
  await reloadAll();
}

// -----------------------------
// Modal event bindings
// -----------------------------
function bindModalEvents() {
  // Categoria modal
  document.getElementById('btn-close-modal-categoria').addEventListener('click', closeCatModal);
  document.getElementById('btn-cancel-categoria').addEventListener('click', closeCatModal);
  document.getElementById('btn-save-categoria').addEventListener('click', saveCat);
  document.getElementById('modal-categoria').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCatModal();
  });
  document.getElementById('cat-nome').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCat();
  });
  document.getElementById('cat-cor').addEventListener('input', (e) => {
    document.getElementById('cat-cor-wrapper').style.background = e.target.value;
  });

  // Subcategoria modal
  document.getElementById('btn-close-modal-subcategoria').addEventListener('click', closeSubModal);
  document.getElementById('btn-cancel-subcategoria').addEventListener('click', closeSubModal);
  document.getElementById('btn-save-subcategoria').addEventListener('click', saveSub);
  document.getElementById('modal-subcategoria').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSubModal();
  });
  document.getElementById('sub-nome').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveSub();
  });

  // Confirm delete modal
  document.getElementById('btn-close-cfg-confirmar').addEventListener('click', closeConfirmModal);
  document.getElementById('btn-cfg-confirmar-cancel').addEventListener('click', closeConfirmModal);
  document.getElementById('btn-cfg-confirmar-ok').addEventListener('click', execDelete);
  document.getElementById('modal-cfg-confirmar').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeConfirmModal();
  });
}

// -----------------------------
// Dropdown "Novo"
// -----------------------------
function bindDropdownEvents() {
  const btn  = document.getElementById('btn-novo-cfg');
  const menu = document.getElementById('dropdown-novo-menu');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.cfg-dropdown-item');
    if (!item) return;
    menu.classList.add('hidden');
    if (item.dataset.action === 'nova-categoria')   openCatModal(null, 'custo_vida');
    if (item.dataset.action === 'nova-subcategoria') openSubModal(null, null);
  });

  document.addEventListener('click', () => menu.classList.add('hidden'));
}

// -----------------------------
// Tabs
// -----------------------------
function bindTabEvents() {
  const toolbar = document.getElementById('cfg-panel-toolbar');
  document.querySelectorAll('.cfg-sidenav-item').forEach((item) => {
    item.addEventListener('click', () => {
      const target = item.dataset.tab;
      document.querySelectorAll('.cfg-sidenav-item').forEach((t) => {
        t.classList.toggle('active', t === item);
      });
      document.querySelectorAll('.cfg-panel').forEach((p) => {
        p.classList.toggle('hidden', p.id !== `cfg-panel-${target}`);
      });
      if (toolbar) toolbar.classList.toggle('hidden', target !== 'categorias');
      updateStickyThTop();
    });
  });
}

// -----------------------------
// Theme
// -----------------------------
function bindThemeEvents() {
  const current = getTheme();
  document.querySelectorAll('.cfg-theme-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === current);
    btn.addEventListener('click', async () => {
      const t = btn.dataset.theme;
      await setTheme(t);
      document.querySelectorAll('.cfg-theme-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.theme === t);
      });
    });
  });
}

// -----------------------------
// Vínculo popover
// -----------------------------
function initVinculoPopover() {
  const pop = document.createElement('div');
  pop.id        = 'vinculo-popover';
  pop.className = 'vinculo-popover hidden';
  document.body.appendChild(pop);
  pop.addEventListener('mouseleave', hideVinculoPopover);

  document.addEventListener('mouseover', (e) => {
    const badge = e.target.closest('.vinculo-badge');
    if (badge) showVinculoPopover(badge);
  });
  document.addEventListener('mouseout', (e) => {
    const badge = e.target.closest('.vinculo-badge');
    if (!badge) return;
    if (!e.relatedTarget?.closest('#vinculo-popover') && !e.relatedTarget?.closest('.vinculo-badge')) {
      hideVinculoPopover();
    }
  });
}

function showVinculoPopover(badge) {
  const pop  = document.getElementById('vinculo-popover');
  if (!pop) return;
  const html = buildVinculoPopoverContent(badge.dataset.vinculoType, badge.dataset.vinculoId);
  if (!html) return;

  pop.innerHTML = html;
  pop.classList.remove('hidden');

  const rect = badge.getBoundingClientRect();
  pop.style.top  = `${rect.bottom + 8 + window.scrollY}px`;
  pop.style.left = `${rect.left + window.scrollX}px`;

  const pr = pop.getBoundingClientRect();
  if (pr.right > window.innerWidth - 12) {
    pop.style.left = `${rect.right - pr.width + window.scrollX}px`;
  }
}

function hideVinculoPopover() {
  document.getElementById('vinculo-popover')?.classList.add('hidden');
}

function buildVinculoPopoverContent(type, id) {
  if (type === 'projeto') {
    const p   = cachedProjetos.find((x) => x.id === id);
    if (!p) return null;
    const meta = Number(p.meta_valor) || 0;
    return `
      <div class="vp-header">
        <span class="vp-type-label vp-type-projeto">Investimento</span>
        <strong class="vp-title">${escapeHtml(p.nome)}</strong>
      </div>
      <div class="vp-body">
        ${meta ? `<div class="vp-row"><span>Meta</span><strong>${fmtCurrency(meta)}</strong></div>` : ''}
        ${p.saldo_inicial ? `<div class="vp-row"><span>Saldo inicial</span><strong>${fmtCurrency(Number(p.saldo_inicial))}</strong></div>` : ''}
      </div>
      <a class="vp-link" href="investimentos.html">Ver investimentos →</a>`;
  }
  if (type === 'divida') {
    const d       = cachedDividas.find((x) => x.id === id);
    const total   = d ? Number(d.valor_total) : 0;
    const pago    = d ? Number(d.valor_pago)  : 0;
    const restante = Math.max(0, total - pago);
    const pct     = total > 0 ? Math.min(100, (pago / total) * 100) : 0;
    const stCors  = { Ativa: 'var(--color-primary)', Atrasada: 'var(--color-danger)', Negociando: 'var(--color-warning)', Quitada: 'var(--color-success)' };
    const stCor   = stCors[d?.status] || 'var(--color-primary)';
    return `
      <div class="vp-header">
        <span class="vp-type-label vp-type-divida">Dívida</span>
        <strong class="vp-title">${d ? escapeHtml(d.nome) : '—'}</strong>
      </div>
      <div class="vp-body">
        ${d?.credor ? `<div class="vp-row"><span>Credor</span><strong>${escapeHtml(d.credor)}</strong></div>` : ''}
        ${d?.status ? `<div class="vp-row"><span>Status</span><strong style="color:${stCor}">${d.status}</strong></div>` : ''}
        ${total     ? `<div class="vp-row"><span>Total</span><strong>${fmtCurrency(total)}</strong></div>` : ''}
        ${d         ? `<div class="vp-row"><span>Pago</span><strong style="color:var(--color-success)">${fmtCurrency(pago)} (${pct.toFixed(0)}%)</strong></div>` : ''}
        ${d         ? `<div class="vp-row"><span>Restante</span><strong style="color:var(--color-danger)">${fmtCurrency(restante)}</strong></div>` : ''}
      </div>
      <a class="vp-link" href="dividas.html">Ver dívidas →</a>`;
  }
  return null;
}

function fmtCurrency(val, moeda = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(Number(val) || 0);
}

// -----------------------------
// Utilities
// -----------------------------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
  );
}
