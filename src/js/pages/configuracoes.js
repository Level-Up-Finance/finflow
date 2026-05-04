// =============================================================
// FinFlow — Página: Configurações (Categorias & Subcategorias)
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { getTheme, setTheme } from '../lib/theme.js';
import { CURRENCIES } from '../lib/currencies.js';
import { escapeHtml } from '../lib/utils.js';
import { CHANGELOG } from '../lib/changelog.js';

// -----------------------------
// State
// -----------------------------
let cachedCategorias    = [];
let cachedSubcategorias = [];
let cachedProjetos      = [];
let cachedDividas       = [];
let cachedContatos      = [];

// Modal state
let editingCatId  = null; // null = nova, string = editar existente
let editingSubId  = null; // null = nova, string = editar existente
let editingContatoId = null; // null = novo, string = editar existente
let newSubCatId   = null; // categoria_id pra nova subcategoria
let pendingDelete = null; // { type: 'cat'|'sub'|'contato', id }
let activeTab     = 'categorias'; // categorias | contatos | aparencia

const TIPO_CONTATO_LABELS = {
  cliente:    'Cliente',
  fornecedor: 'Fornecedor',
  ambos:      'Ambos',
};

const SUPER_BLOCOS = [
  { id: 'contribuicao', label: 'Contribuição', grupos: ['receitas', 'dividas'],  accent: 'var(--color-success)' },
  { id: 'sonhos',       label: 'Sonhos',       grupos: ['investimentos'],        accent: 'var(--color-primary)' },
  { id: 'custo_vida',   label: 'Custo de vida', grupos: ['custo_vida'],          accent: 'var(--color-secondary)' },
];

// SVG icons inline
const ICON_LINK  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const ICON_EDIT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const ICON_PLUS  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const ICON_EYE   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('configuracoes');
  initTutorial('configuracoes');
  await loadAll();
  renderTree();
  updateStickyThTop();
  bindTabEvents();
  bindDropdownEvents();
  bindModalEvents();
  bindContatoEvents();
  bindThemeEvents();
  bindIdiomaEvents();
  initVinculoPopover();
  initChangelogBadge();
  window.addEventListener('resize', updateStickyThTop);
  loadProfileSettings();  // async, non-blocking
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
  const [cats, subs, projs, divs, conts] = await Promise.all([
    supabase.from('categorias').select('*').order('ordem'),
    supabase.from('subcategorias').select('*').neq('status', 'arquivada'),
    supabase.from('projetos_investimento').select('id, nome, cor, meta_valor, saldo_inicial').order('nome'),
    supabase.from('dividas').select('id, nome, valor_total, valor_pago, credor, status').order('nome'),
    supabase.from('contatos').select('*').neq('status', 'arquivado').order('nome'),
  ]);

  cachedCategorias    = cats.data  || [];
  cachedSubcategorias = subs.data  || [];
  cachedProjetos      = projs.data || [];
  cachedDividas       = divs.data  || [];

  // Contatos pode falhar se a migration 0023 não tiver sido rodada
  if (conts.error) {
    if (/relation.*contatos|column.*contatos/i.test(conts.error.message)) {
      console.warn('[loadAll] Tabela contatos não existe — rode a migration 0023');
    } else {
      console.warn('[loadAll] Erro carregando contatos:', conts.error);
    }
    cachedContatos = [];
  } else {
    cachedContatos = conts.data || [];
  }

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
  } else if (type === 'contato') {
    // Block deletion if linked to any compromisso or transaction
    const [{ count: compCount }, { count: txCount }] = await Promise.all([
      supabase.from('subcategorias').select('id', { count: 'exact', head: true }).eq('contato_id', id),
      supabase.from('transacoes').select('id', { count: 'exact', head: true }).eq('contato_id', id),
    ]);
    const total = (compCount || 0) + (txCount || 0);
    if (total > 0) {
      const parts = [];
      if (compCount) parts.push(`${compCount} compromisso${compCount > 1 ? 's' : ''}`);
      if (txCount)   parts.push(`${txCount} transação${txCount > 1 ? 'ões' : ''}`);
      showToast(`Não é possível excluir: contato vinculado a ${parts.join(' e ')}.`, 'error', 8000);
      return;
    }
    ({ error } = await supabase.from('contatos').delete().eq('id', id));
  } else {
    ({ error } = await supabase.from('subcategorias').delete().eq('id', id));
  }

  if (error) { showToast('Erro ao excluir: ' + error.message, 'error', 8000); return; }

  const labels = { cat: 'Categoria excluída', sub: 'Subcategoria excluída', contato: 'Contato excluído' };
  showToast(labels[type] || 'Excluído', 'success');

  if (type === 'contato') {
    await reloadContatos();
  } else {
    await reloadAll();
  }
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
      activeTab = target;

      document.querySelectorAll('.cfg-sidenav-item').forEach((t) => {
        t.classList.toggle('active', t === item);
      });
      document.querySelectorAll('.cfg-panel').forEach((p) => {
        p.classList.toggle('hidden', p.id !== `cfg-panel-${target}`);
      });

      // Toolbar: só aparece em Categorias e Contatos
      if (toolbar) toolbar.classList.toggle('hidden', ['aparencia', 'sistema', 'novidades'].includes(target));

      // Lazy-init Sistema panel
      if (target === 'sistema') renderSistemaPanel();
      // Troca o conteúdo interno do toolbar conforme a aba
      document.querySelectorAll('.cfg-toolbar-content').forEach((c) => {
        c.classList.toggle('hidden', c.id !== `cfg-toolbar-${target}`);
      });

      // Render lazy de Contatos quando entra na aba pela primeira vez
      if (target === 'contatos') renderContatos();

      // Novidades: renderiza changelog e marca como lido
      if (target === 'novidades') {
        renderChangelog();
        markChangelogSeen();
      }

      updateStickyThTop();
    });
  });
}

// -----------------------------
// Contatos — render + CRUD
// -----------------------------
function renderContatos() {
  const loading = document.getElementById('cfg-contatos-loading');
  const list    = document.getElementById('cfg-contatos-list');
  if (!list) return;

  loading.classList.add('hidden');
  list.classList.remove('hidden');

  if (cachedContatos.length === 0) {
    list.innerHTML = `
      <div class="cfg-empty-cats" style="text-align:center; padding: var(--space-8) 0;">
        Nenhum contato cadastrado ainda. Use o botão <strong>Novo contato</strong> acima para começar.
      </div>`;
    return;
  }

  const rows = cachedContatos.map((c) => {
    const tipoLabel = TIPO_CONTATO_LABELS[c.tipo] || c.tipo;
    const tipoClass = `ct-tipo-${c.tipo}`;
    const dadosExtras = [];
    if (c.email)     dadosExtras.push(escapeHtml(c.email));
    if (c.telefone)  dadosExtras.push(escapeHtml(c.telefone));
    if (c.documento) dadosExtras.push(escapeHtml(c.documento));
    const extras = dadosExtras.length ? `<div class="ct-extras">${dadosExtras.join(' · ')}</div>` : '';

    const nomeExtratoHtml = c.nome_extrato
      ? `<div class="ct-nome-extrato">${escapeHtml(c.nome_extrato)}</div>`
      : '';

    return `
      <tr class="ct-row" data-id="${c.id}">
        <td class="ct-td-nome">
          <div class="ct-nome">${escapeHtml(c.nome)}</div>
          ${nomeExtratoHtml}
          ${extras}
        </td>
        <td class="ct-td-tipo"><span class="ct-tipo-pill ${tipoClass}">${tipoLabel}</span></td>
        <td class="ct-td-actions">
          <button class="btn-icon" data-view-contato="${c.id}" title="Visualizar">${ICON_EYE}</button>
        </td>
      </tr>`;
  }).join('');

  list.innerHTML = `
    <table class="ct-table">
      <thead>
        <tr>
          <th class="ct-th-nome">Nome</th>
          <th class="ct-th-tipo">Tipo</th>
          <th class="ct-th-actions"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  list.querySelectorAll('[data-view-contato]').forEach((btn) => {
    btn.addEventListener('click', () => openContatoView(btn.dataset.viewContato));
  });
}

function openContatoModal(contatoId = null) {
  editingContatoId = contatoId;
  const c = contatoId ? cachedContatos.find((x) => x.id === contatoId) : null;

  document.getElementById('modal-contato-title').textContent = c ? 'Editar contato' : 'Novo contato';
  document.getElementById('ct-nome').value           = c?.nome            || '';
  document.getElementById('ct-nome-extrato').value   = c?.nome_extrato    || '';
  document.getElementById('ct-tipo').value           = c?.tipo            || 'ambos';
  document.getElementById('ct-email').value          = c?.email           || '';
  document.getElementById('ct-telefone').value       = c?.telefone        || '';
  document.getElementById('ct-documento').value      = c?.documento       || '';
  document.getElementById('ct-endereco').value       = c?.endereco        || '';
  document.getElementById('ct-observacao').value     = c?.observacao      || '';

  document.getElementById('btn-deletar-contato').classList.toggle('hidden', !contatoId);

  document.getElementById('modal-contato').classList.remove('hidden');
  document.getElementById('ct-nome').focus();
}

function closeContatoModal() {
  document.getElementById('modal-contato').classList.add('hidden');
  editingContatoId = null;
}

// ── Contact view card ─────────────────────────────────────────
const CV_TIPO_COLORS = { cliente: '#22c55e', fornecedor: '#6d5ef5', ambos: '#64748b' };

function openContatoView(contatoId) {
  const c = cachedContatos.find((x) => x.id === contatoId);
  if (!c) return;

  // Header
  const initials = (c.nome || '').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  const avatarEl = document.getElementById('cv-avatar');
  avatarEl.textContent    = initials;
  avatarEl.style.background = CV_TIPO_COLORS[c.tipo] || '#64748b';

  document.getElementById('cv-nome').textContent = c.nome;
  const tipoBadge = document.getElementById('cv-tipo-badge');
  tipoBadge.textContent = TIPO_CONTATO_LABELS[c.tipo] || c.tipo;
  tipoBadge.className   = `ct-tipo-pill ct-tipo-${c.tipo}`;

  // Fields
  setCvField('cv-nome-extrato', c.nome_extrato);
  setCvField('cv-email',        c.email);
  setCvField('cv-telefone',     c.telefone);
  setCvField('cv-documento',    c.documento);
  setCvField('cv-endereco',     c.endereco);
  setCvField('cv-observacao',   c.observacao);

  // Footer buttons carry the id
  document.getElementById('cv-btn-editar').dataset.id  = contatoId;
  document.getElementById('cv-btn-deletar').dataset.id = contatoId;

  switchCvTab('dados');
  loadCvBancoHistory(contatoId);

  document.getElementById('modal-contato-view').classList.remove('hidden');
}

function setCvField(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (value) {
    el.textContent = value;
    el.classList.remove('cv-field-empty');
  } else {
    el.textContent = '—';
    el.classList.add('cv-field-empty');
  }
}

function closeContatoView() {
  document.getElementById('modal-contato-view').classList.add('hidden');
}

function switchCvTab(tab) {
  document.querySelectorAll('.cv-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.cvTab === tab));
  document.getElementById('cv-panel-dados').classList.toggle('hidden',  tab !== 'dados');
  document.getElementById('cv-panel-banco').classList.toggle('hidden',  tab !== 'banco');
}

async function loadCvBancoHistory(contatoId) {
  const list = document.getElementById('cv-banco-list');
  list.innerHTML = '<div class="cv-loading">Carregando…</div>';

  const { data, error } = await supabase
    .from('contato_banco_descs')
    .select('id, banco_desc, last_subcategoria_id, created_at')
    .eq('contato_id', contatoId)
    .order('created_at', { ascending: false });

  if (error && /relation.*contato_banco_descs/i.test(error.message)) {
    list.innerHTML = '<div class="cv-empty">Execute a migration 0030_contato_banco_descs.sql no Supabase.</div>';
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = `<div class="cv-empty">
      <p>Nenhum padrão aprendido ainda.</p>
      <p style="font-size:var(--fs-xs); color:var(--color-text-muted); margin-top:var(--space-1);">Os padrões são registrados ao salvar transações importadas vinculadas a este contato.</p>
    </div>`;
    return;
  }

  // Fetch subcategoria names for any mapped entries
  const subIds = [...new Set(data.filter((r) => r.last_subcategoria_id).map((r) => r.last_subcategoria_id))];
  const subMap = new Map();
  if (subIds.length) {
    const { data: subs } = await supabase.from('subcategorias').select('id, nome, apelido').in('id', subIds);
    (subs || []).forEach((s) => subMap.set(s.id, s));
  }

  list.innerHTML = `<div class="cv-banco-list">` + data.map((row) => {
    const sub      = row.last_subcategoria_id ? subMap.get(row.last_subcategoria_id) : null;
    const subLabel = sub
      ? escapeHtml(sub.apelido || sub.nome)
      : `<span style="color:var(--color-text-muted)">—</span>`;
    const date = new Date(row.created_at).toLocaleDateString('pt-BR');
    return `<div class="cv-banco-item">
      <div class="cv-banco-desc" title="${escapeHtml(row.banco_desc)}">${escapeHtml(row.banco_desc)}</div>
      <div class="cv-banco-sub">${subLabel}</div>
      <div class="cv-banco-date">${date}</div>
      <button class="btn-icon" data-del-banco="${row.id}" data-contato="${contatoId}" title="Remover mapeamento">${ICON_TRASH}</button>
    </div>`;
  }).join('') + `</div>`;

  list.querySelectorAll('[data-del-banco]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { error: delErr } = await supabase.from('contato_banco_descs').delete().eq('id', btn.dataset.delBanco);
      if (delErr) { showToast('Erro: ' + delErr.message, 'error'); return; }
      showToast('Mapeamento removido.', 'success');
      loadCvBancoHistory(btn.dataset.contato);
    });
  });
}

async function saveContato() {
  const nome         = document.getElementById('ct-nome').value.trim();
  const nome_extrato = document.getElementById('ct-nome-extrato').value.trim() || null;
  const tipo         = document.getElementById('ct-tipo').value;
  const email        = document.getElementById('ct-email').value.trim() || null;
  const telefone     = document.getElementById('ct-telefone').value.trim() || null;
  const documento    = document.getElementById('ct-documento').value.trim() || null;
  const endereco     = document.getElementById('ct-endereco').value.trim() || null;
  const observacao   = document.getElementById('ct-observacao').value.trim() || null;

  if (!nome) { showToast('Informe o nome do contato', 'error'); return; }

  const btn = document.getElementById('btn-save-contato');
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const user = await getCurrentUser();
  if (!user) { btn.disabled = false; btn.textContent = original; return; }

  let error;
  if (editingContatoId) {
    ({ error } = await supabase.from('contatos')
      .update({ nome, nome_extrato, tipo, email, telefone, documento, endereco, observacao })
      .eq('id', editingContatoId));
  } else {
    ({ error } = await supabase.from('contatos').insert({
      user_id: user.id, nome, nome_extrato, tipo, email, telefone, documento, endereco, observacao,
    }));
  }

  btn.disabled = false;
  btn.textContent = original;

  if (error) {
    let msg = error.message;
    if (/relation.*contatos|column.*contatos/i.test(msg)) {
      msg = 'Tabela contatos não existe — rode a migration 0023 no Supabase.';
    }
    showToast('Erro: ' + msg, 'error', 8000);
    return;
  }

  showToast(editingContatoId ? 'Contato atualizado' : 'Contato criado', 'success');
  closeContatoModal();
  await reloadContatos();
}

async function reloadContatos() {
  const { data, error } = await supabase
    .from('contatos').select('*')
    .neq('status', 'arquivado').order('nome');
  if (!error) cachedContatos = data || [];
  renderContatos();
}

function confirmDeleteContato(id) {
  pendingDelete = { type: 'contato', id };
  const c = cachedContatos.find((x) => x.id === id);
  document.getElementById('cfg-confirm-title').textContent = 'Excluir contato?';
  document.getElementById('cfg-confirm-msg').innerHTML =
    `Excluir <strong>${escapeHtml(c?.nome || '')}</strong>? O contato será removido dos compromissos, dívidas, projetos e transações vinculados (os registros são preservados).`;
  document.getElementById('modal-cfg-confirmar').classList.remove('hidden');
}

function bindContatoEvents() {
  // Edit modal
  document.getElementById('btn-novo-contato').addEventListener('click', () => openContatoModal());
  document.getElementById('btn-close-modal-contato').addEventListener('click', closeContatoModal);
  document.getElementById('btn-cancel-contato').addEventListener('click', closeContatoModal);
  document.getElementById('btn-save-contato').addEventListener('click', saveContato);
  document.getElementById('btn-deletar-contato').addEventListener('click', () => {
    if (!editingContatoId) return;
    closeContatoModal();
    confirmDeleteContato(editingContatoId);
  });
  document.getElementById('modal-contato').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeContatoModal();
  });
  document.getElementById('ct-nome').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveContato();
  });

  // View card
  document.getElementById('btn-close-contato-view').addEventListener('click', closeContatoView);
  document.getElementById('modal-contato-view').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeContatoView();
  });
  document.querySelectorAll('.cv-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchCvTab(tab.dataset.cvTab));
  });
  document.getElementById('cv-btn-editar').addEventListener('click', (e) => {
    closeContatoView();
    openContatoModal(e.currentTarget.dataset.id);
  });
  document.getElementById('cv-btn-deletar').addEventListener('click', (e) => {
    closeContatoView();
    confirmDeleteContato(e.currentTarget.dataset.id);
  });
}

// -----------------------------
// Profile settings (idioma, moeda_padrao, moedas_widget)
// -----------------------------
async function loadProfileSettings() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('idioma, moeda_padrao, moedas_widget')
      .eq('id', user.id)
      .maybeSingle();
    if (!data) return;
    if (data.idioma)        localStorage.setItem('finflow.idioma',         data.idioma);
    if (data.moeda_padrao)  localStorage.setItem('finflow.moeda_padrao',   data.moeda_padrao);
    if (data.moedas_widget) localStorage.setItem('finflow.moedas_widget',  JSON.stringify(data.moedas_widget));
    // Refresh idioma buttons if aparência tab is visible
    syncIdiomaButtons();
  } catch { }
}

async function saveProfileSettings(updates) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
    if (error) console.warn('[profile] save error:', error.message);
  } catch (err) {
    console.warn('[profile] save failed:', err?.message);
  }
}

// -----------------------------
// Idioma
// -----------------------------
function syncIdiomaButtons() {
  const current = localStorage.getItem('finflow.idioma') || 'auto';
  document.querySelectorAll('.cfg-idioma-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.idioma === current);
  });
}

function bindIdiomaEvents() {
  syncIdiomaButtons();
  document.querySelectorAll('.cfg-idioma-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idioma = btn.dataset.idioma;
      localStorage.setItem('finflow.idioma', idioma);
      syncIdiomaButtons();
      await saveProfileSettings({ idioma });
      showToast('Idioma salvo. Será aplicado quando as traduções estiverem disponíveis.', 'info', 5000);
    });
  });
}

// -----------------------------
// Sistema (moedas)
// -----------------------------
let sistemaPanelRendered = false;

function renderSistemaPanel() {
  if (sistemaPanelRendered) return;
  sistemaPanelRendered = true;

  const moedaPadrao = localStorage.getItem('finflow.moeda_padrao') || 'BRL';
  const moedasRaw   = localStorage.getItem('finflow.moedas_widget');
  const moedasAtivas = moedasRaw ? JSON.parse(moedasRaw) : ['BRL', 'USD', 'EUR', 'GBP'];

  // Populate moeda_padrao select
  const selPadrao = document.getElementById('cfg-moeda-padrao');
  selPadrao.innerHTML = CURRENCIES
    .map((c) => `<option value="${c.code}" ${c.code === moedaPadrao ? 'selected' : ''}>${c.code} — ${c.label}</option>`)
    .join('');

  // Populate moedas checkboxes
  const grid = document.getElementById('cfg-moedas-grid');
  grid.innerHTML = CURRENCIES.map((c) => `
    <label class="cfg-moeda-item">
      <input type="checkbox" class="cfg-moeda-check" value="${c.code}"
             ${moedasAtivas.includes(c.code) ? 'checked' : ''}>
      <span class="cfg-moeda-code">${c.code}</span>
      <span class="cfg-moeda-label">${c.label}</span>
    </label>`).join('');

  document.getElementById('btn-save-sistema').addEventListener('click', async () => {
    const newPadrao  = document.getElementById('cfg-moeda-padrao').value;
    const newMoedas  = Array.from(document.querySelectorAll('.cfg-moeda-check:checked')).map((cb) => cb.value);

    // Moeda principal sempre inclusa na lista
    if (!newMoedas.includes(newPadrao)) newMoedas.unshift(newPadrao);

    localStorage.setItem('finflow.moeda_padrao',  newPadrao);
    localStorage.setItem('finflow.moedas_widget', JSON.stringify(newMoedas));
    await saveProfileSettings({ moeda_padrao: newPadrao, moedas_widget: newMoedas });
    showToast('Configurações salvas.', 'success');
  });

  // When moeda_padrao changes, auto-check it in the grid
  selPadrao.addEventListener('change', () => {
    const v = selPadrao.value;
    const cb = document.querySelector(`.cfg-moeda-check[value="${v}"]`);
    if (cb) cb.checked = true;
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
      <a class="vp-link" href="/investimentos.html">Ver investimentos →</a>`;
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
      <a class="vp-link" href="/dividas.html">Ver dívidas →</a>`;
  }
  return null;
}

function fmtCurrency(val, moeda = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(Number(val) || 0);
}

// -----------------------------
// Changelog / Novidades
// -----------------------------
const TYPE_LABELS = { new: 'Novidade', fix: 'Correção', improvement: 'Melhoria' };

function hasUnseenChangelog() {
  return CHANGELOG.length > 0 && localStorage.getItem('finflow:changelog:seen') !== CHANGELOG[0].id;
}

function initChangelogBadge() {
  if (!hasUnseenChangelog()) return;
  document.getElementById('cfg-novidades-badge')?.classList.remove('hidden');
}

let changelogRendered = false;
function renderChangelog() {
  if (changelogRendered) return;
  changelogRendered = true;

  const container = document.getElementById('cfg-changelog-list');
  if (!container) return;

  if (CHANGELOG.length === 0) {
    container.innerHTML = '<p class="cfg-panel-desc">Nenhuma versão registrada ainda.</p>';
    return;
  }

  container.innerHTML = `<div class="cfg-changelog-list">${CHANGELOG.map((entry) => `
    <div class="cfg-changelog-entry">
      <div class="cfg-changelog-header">
        <span class="cfg-changelog-title">${escapeHtml(entry.title)}</span>
        <span class="cfg-changelog-date">${escapeHtml(entry.date)}</span>
      </div>
      <ul class="cfg-changelog-items">
        ${entry.items.map((item) => `
          <li class="cfg-changelog-item">
            <span class="cfg-changelog-type cfg-changelog-type--${item.type}">${TYPE_LABELS[item.type] || item.type}</span>
            <span>${escapeHtml(item.text)}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('')}</div>`;
}

function markChangelogSeen() {
  if (CHANGELOG.length === 0) return;
  localStorage.setItem('finflow:changelog:seen', CHANGELOG[0].id);
  document.getElementById('cfg-novidades-badge')?.classList.add('hidden');
  document.getElementById('sidebar-changelog-badge')?.classList.add('hidden');
}

