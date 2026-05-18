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
import { escapeHtml, formatDateBR, todayISO } from '../lib/utils.js';
import { DEFAULT_COLOR, renderColorPicker, setActiveColor } from '../lib/color-palette.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';
import { formatCurrency, renderMoedaOptions } from '../lib/compromissos-config.js';

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

// Histórico (categorias/subcategorias com vínculos a registros reais)
let historicoSubIds  = new Set();
let historicoCatIds  = new Set();
let subsWithTx       = new Set();
let cachedTxCountMap = new Map();  // subcategoria_id → tx count

// Modal lock state for migration restrictions
let modalCatLockedGrupo = null;
let modalSubLockedGrupo = null;
let modalSubBlocoGrupos = null;  // restrict cat select to this bloco's grupos

// Sub detail modal state
let detailSubId = null;  // which sub is being shown in modal-sub-detail

// Pré-aquecimento do iframe embedded de compromissos
let embedPreloaded = false;

const SUPER_BLOCOS = [
  { id: 'contribuicao', label: 'Contribuição', grupos: ['receitas', 'dividas'],  accent: 'var(--color-success)' },
  { id: 'sonhos',       label: 'Sonhos',       grupos: ['investimentos'],        accent: 'var(--color-primary)' },
  { id: 'custo_vida',   label: 'Custo de vida', grupos: ['custo_vida'],          accent: 'var(--color-secondary)' },
];

// SVG icons inline (apenas os usados)
const ICON_EDIT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
// Quadrado arredondado preenchido com "+" branco — usado nos headings de categoria/subcategoria
const ICON_PLUS_BLOCO = `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor"/><path d="M12 7v10M7 12h10" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>`;

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('configuracoes');
  initTutorial('configuracoes');
  await loadStrings();
  applyTranslationsToDom();
  await loadAll();
  renderTree();
  updateStickyThTop();
  bindTabEvents();
  bindModalEvents();
  bindThemeEvents();
  bindIdiomaEvents();
  initVinculoPopover();
  initInfoPopover();
  initTxPopover();
  bindCategoryDragDrop();
  window.addEventListener('resize', updateStickyThTop);
  loadProfileSettings();  // async, non-blocking

  const validCfgTabs = new Set(['categorias', 'aparencia', 'sistema']);
  const hashTab = location.hash.slice(1);
  if (validCfgTabs.has(hashTab) && hashTab !== 'categorias') {
    document.querySelector(`.cfg-sidenav-item[data-tab="${hashTab}"]`)?.click();
  }

  // Pré-aquece o iframe de compromissos em background para abertura instantânea
  preWarmEmbedded();
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
    supabase.from('projetos_investimento').select('id, nome, cor, meta_valor, saldo_inicial, status').order('nome'),
    supabase.from('dividas').select('id, nome, valor_total, valor_pago, credor, status').order('nome'),
  ]);

  cachedCategorias    = cats.data  || [];
  cachedSubcategorias = subs.data  || [];
  cachedProjetos      = projs.data || [];
  cachedDividas       = divs.data  || [];

  document.getElementById('cfg-loading').classList.add('hidden');
  document.getElementById('cfg-tree').classList.remove('hidden');

  // Seed default categories for new users
  if (cachedCategorias.length === 0) {
    await seedDefaultCategories();
    const [cats2, subs2] = await Promise.all([
      supabase.from('categorias').select('*').order('ordem'),
      supabase.from('subcategorias').select('*').neq('status', 'arquivada'),
    ]);
    cachedCategorias    = cats2.data  || [];
    cachedSubcategorias = subs2.data  || [];
  }

  await computeHistorico();
}

// -----------------------------
// Histórico: detectar categorias/subcategorias com vínculos
// -----------------------------
async function computeHistorico() {
  // 1) subcategorias com transações registradas + count map
  subsWithTx       = new Set();
  cachedTxCountMap = new Map();
  try {
    const { data: txs, error: txErr } = await supabase
      .from('transacoes')
      .select('subcategoria_id')
      .not('subcategoria_id', 'is', null);
    if (!txErr) {
      for (const tx of txs || []) {
        if (tx.subcategoria_id) {
          subsWithTx.add(tx.subcategoria_id);
          cachedTxCountMap.set(tx.subcategoria_id, (cachedTxCountMap.get(tx.subcategoria_id) || 0) + 1);
        }
      }
    }
  } catch (err) {
    console.warn('[historico] erro ao consultar transacoes:', err?.message);
  }

  historicoSubIds = new Set();
  for (const sub of cachedSubcategorias) {
    if (subsWithTx.has(sub.id))                                  { historicoSubIds.add(sub.id); continue; }
    if (Number(sub.valor_base) > 0 || sub.valor_variavel === true) { historicoSubIds.add(sub.id); continue; }
    if (sub.projeto_id)                                          { historicoSubIds.add(sub.id); continue; }
    if (sub.divida_id)                                           { historicoSubIds.add(sub.id); continue; }
  }

  historicoCatIds = new Set();
  for (const sub of cachedSubcategorias) {
    if (historicoSubIds.has(sub.id)) historicoCatIds.add(sub.categoria_id);
  }
}

async function reloadAll() {
  // Preserva a posição de scroll — antes wipávamos o tree (flash visual)
  // e re-renderizávamos do zero, o que jogava o usuário pro topo da página.
  const scrollY = window.scrollY;
  await loadAll();
  renderTree();
  // Restaura scroll após o paint do novo HTML
  requestAnimationFrame(() => window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' }));
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
    // Categorias: ordem manual definida pelo usuário (campo `ordem`)
    const cats = cachedCategorias
      .filter((c) => bloco.grupos.includes(c.grupo || 'custo_vida'))
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

    const blocoBanner = `<div class="cfg-bloco-banner">${escapeHtml(bloco.label)}</div>`;

    const addCatBtn = `<button class="btn-th-add" data-new-cat-grupo="${bloco.grupos[0]}" title="Nova categoria" type="button">${ICON_PLUS_BLOCO}</button>`;
    const addSubBtn = `<button class="btn-th-add" data-new-sub-bloco="${bloco.grupos.join(',')}" title="Nova subcategoria" type="button">${ICON_PLUS_BLOCO}</button>`;

    const blocoHeader = (showSubBtn) => `
      <thead>
        <tr>
          <th class="cfg-th-cat"><span class="cfg-th-label">Categoria</span>${addCatBtn}</th>
          <th class="cfg-th-sub"><span class="cfg-th-label">Subcategoria</span>${showSubBtn ? addSubBtn : ''}</th>
          <th class="cfg-th-comp">Vínculos</th>
          <th class="cfg-th-tx">Transações</th>
          <th class="cfg-th-actions"></th>
        </tr>
      </thead>`;

    if (!cats.length) {
      return `
        <div class="cfg-bloco" style="--bloco-accent: ${bloco.accent};">
          ${blocoBanner}
          <table class="cfg-table">
            ${blocoHeader(false)}
            <tbody>
              <tr>
                <td colspan="5" class="cfg-empty-bloco-row">Nenhuma categoria ainda.</td><!-- 5 cols: cat, sub, comp, tx, actions -->
              </tr>
            </tbody>
          </table>
        </div>`;
    }

    let bodySections = '';
    for (const cat of cats) {
      const subs      = subsBycat.get(cat.id) || [];
      const isDefault = cat.is_default;

      const catActions = `
        <div class="cfg-cat-inline-actions">
          ${!isDefault ? `<button class="btn-icon" data-edit-cat="${cat.id}" title="Editar categoria">${ICON_EDIT}</button>` : ''}
          ${!isDefault && subs.length === 0 ? `<button class="btn-icon danger" data-delete-cat="${cat.id}" title="Excluir categoria">${ICON_TRASH}</button>` : ''}
        </div>`;

      const catCell = (rowspan) => `
        <td class="cfg-td-cat" rowspan="${rowspan}">
          <span class="cfg-cat-drag-handle" draggable="true" data-drag-cat-id="${cat.id}" title="Arrastar para reordenar"></span>
          <div class="cfg-cat-name-wrap">
            <span class="cfg-cat-nome-cell">${escapeHtml(cat.nome)}</span>
          </div>
          ${catActions}
        </td>`;

      let catRows = '';

      if (subs.length === 0) {
        catRows = `
          <tr class="cfg-tr cfg-tr--first cfg-tr-cat-only">
            ${catCell(1)}
            <td class="cfg-td-sub cfg-td-empty">Sem subcategorias</td>
            <td class="cfg-td-comp"><span class="cfg-tx-none">—</span></td>
            <td class="cfg-td-tx"><span class="cfg-tx-none">—</span></td>
            <td class="cfg-td-actions"></td>
          </tr>`;
      } else {
        subs.forEach((sub, i) => {
          const hasComp = Number(sub.valor_base) > 0 || sub.valor_variavel === true;
          const projeto = sub.projeto_id ? cachedProjetos.find((p) => p.id === sub.projeto_id) : null;
          const divida  = sub.divida_id  ? cachedDividas.find((d) => d.id === sub.divida_id)   : null;

          // — Compromissos column — (order: compromisso → dívida → projeto)
          const compParts = [];
          if (hasComp) {
            compParts.push(`<span class="cfg-comp-badge cfg-comp-badge--val">${escapeHtml(sub.nome)}</span>`);
          }
          if (divida) {
            compParts.push(`<span class="vinculo-badge vinculo-badge--divida" data-vinculo-type="divida" data-vinculo-id="${sub.divida_id}">${escapeHtml(divida.nome)}</span>`);
          }
          if (projeto) {
            compParts.push(`<span class="vinculo-badge vinculo-badge--projeto" data-vinculo-type="projeto" data-vinculo-id="${projeto.id}" style="--vinculo-cor:${projeto.cor};">${escapeHtml(projeto.nome)}</span>`);
          }
          const compHtml = compParts.length
            ? `<div style="display:flex;flex-wrap:nowrap;gap:4px;align-items:center;">${compParts.join('')}</div>`
            : `<span class="cfg-tx-none">—</span>`;

          // — Transações column —
          const txCount = cachedTxCountMap.get(sub.id) || 0;
          const txHtml = txCount > 0
            ? `<button class="cfg-tx-badge" data-tx-sub="${sub.id}" title="Ver últimas transações"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 10h16M4 14h10M4 18h6"/></svg>${txCount}</button>`
            : `<span class="cfg-tx-none">—</span>`;

          const subActions = `
            <div class="cfg-row-actions">
              ${!hasComp ? `<button class="btn-icon danger" data-delete-sub="${sub.id}" title="Excluir">${ICON_TRASH}</button>` : ''}
            </div>`;

          catRows += `
            <tr class="cfg-tr${i === 0 ? ' cfg-tr--first' : ''}">
              ${i === 0 ? catCell(subs.length) : ''}
              <td class="cfg-td-sub">
                <button class="cfg-sub-nome-btn" data-sub-detail="${sub.id}">${escapeHtml(sub.nome)}</button>
              </td>
              <td class="cfg-td-comp">${compHtml}</td>
              <td class="cfg-td-tx">${txHtml}</td>
              <td class="cfg-td-actions">${subActions}</td>
            </tr>`;
        });
      }

      bodySections += `<tbody class="cfg-cat-body" data-cat-id="${cat.id}" style="--cat-cor: ${cat.cor || '#6D5EF5'};">${catRows}</tbody>`;
    }

    return `
      <div class="cfg-bloco" style="--bloco-accent: ${bloco.accent};">
        ${blocoBanner}
        <table class="cfg-table">
          ${blocoHeader(true)}
          ${bodySections}
        </table>
      </div>`;
  }).join('');

  container.innerHTML = html;
  bindTreeEvents();
  initBlocoStack();
}

// -----------------------------
// Stacking sticky bloco banners
// -----------------------------
let _blocoStack = null;
let _blocoStackListener = null;

function initBlocoStack() {
  _blocoStack?.remove();
  if (_blocoStackListener) window.removeEventListener('scroll', _blocoStackListener);

  const tree = document.getElementById('cfg-tree');
  if (!tree) return;

  _blocoStack = document.createElement('div');
  _blocoStack.className = 'cfg-bloco-stack';
  tree.prepend(_blocoStack);

  _blocoStackListener = updateBlocoStack;
  window.addEventListener('scroll', _blocoStackListener, { passive: true });
  updateBlocoStack();
}

function updateBlocoStack() {
  if (!_blocoStack) return;

  const HEADER_H = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--header-height')
  ) || 64;

  const wrappers = [...document.querySelectorAll('#cfg-tree .cfg-bloco')];
  if (!wrappers.length) return;

  const firstBanner = wrappers[0].querySelector('.cfg-bloco-banner');
  if (!firstBanner) return;
  const BANNER_H = firstBanner.offsetHeight;

  // Restore all originals
  wrappers.forEach((w) => w.querySelector('.cfg-bloco-banner')?.classList.remove('is-stacked'));

  // Rebuild stack
  _blocoStack.innerHTML = '';

  for (const wrapper of wrappers) {
    const banner = wrapper.querySelector('.cfg-bloco-banner');
    if (!banner) continue;

    const stackedCount = _blocoStack.children.length;
    const threshold = HEADER_H + stackedCount * BANNER_H;

    if (wrapper.getBoundingClientRect().top <= threshold) {
      const clone = banner.cloneNode(true);
      const accent = wrapper.style.getPropertyValue('--bloco-accent');
      if (accent) clone.style.setProperty('--bloco-accent', accent);
      _blocoStack.appendChild(clone);
      banner.classList.add('is-stacked');
    }
  }
}

// -----------------------------
// Tree event delegation
// -----------------------------
// Idempotente — chamado a cada renderTree() sem acumular listeners.
// Já era event delegation, mas faltava o guard.
function bindTreeEvents() {
  const tree = document.getElementById('cfg-tree');
  if (!tree || tree._delegationBound) return;
  tree._delegationBound = true;

  tree.addEventListener('click', (e) => {
    // Nova categoria por bloco
    const newCatBtn = e.target.closest('[data-new-cat-grupo]');
    if (newCatBtn) { openCatModal(null, newCatBtn.dataset.newCatGrupo); return; }

    // Nova subcategoria por bloco (filtra categorias àquele bloco)
    const newSubBlocoBtn = e.target.closest('[data-new-sub-bloco]');
    if (newSubBlocoBtn) {
      const grupos = newSubBlocoBtn.dataset.newSubBloco.split(',');
      openSubModal(null, null, grupos);
      return;
    }

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

    // Criar compromisso via overlay iframe
    const addCompBtn = e.target.closest('.btn-add-comp');
    if (addCompBtn) {
      const cfgSub  = addCompBtn.dataset.cfgSub;
      const cfgCat  = addCompBtn.dataset.cfgCat;
      const cfgTipo = addCompBtn.dataset.cfgTipo || 'Despesa';
      const cfgNome = addCompBtn.dataset.cfgNome || '';
      if (cfgSub) {
        openEmbeddedCompromisso(`compromissos.html?embedded=1&cfg_sub=${encodeURIComponent(cfgSub)}`);
      } else if (cfgCat) {
        const params = new URLSearchParams({ embedded: '1', cfg_cat: cfgCat, cfg_tipo: cfgTipo });
        if (cfgNome) params.set('cfg_nome', encodeURIComponent(cfgNome));
        openEmbeddedCompromisso(`compromissos.html?${params.toString()}`);
      }
      return;
    }

    // Sub detail modal (click on sub name)
    const subDetailBtn = e.target.closest('[data-sub-detail]');
    if (subDetailBtn) { openSubDetailModal(subDetailBtn.dataset.subDetail); return; }
  });
}

// -----------------------------
// Categoria modal
// -----------------------------
function openCatModal(catId = null, defaultGrupo = 'custo_vida') {
  editingCatId = catId;
  const cat = catId ? cachedCategorias.find((c) => c.id === catId) : null;

  document.getElementById('modal-categoria-title').textContent = cat ? 'Editar categoria' : 'Nova categoria';
  document.getElementById('cat-nome').value      = cat?.nome     || '';
  const initialCor = cat?.cor || DEFAULT_COLOR;
  const corPickerEl = document.getElementById('cat-cor-picker');
  const activeCor = renderColorPicker(corPickerEl, initialCor);
  document.getElementById('cat-cor').value = activeCor;
  document.getElementById('cat-grupo').value     = cat?.grupo    || defaultGrupo;
  document.getElementById('cat-descricao').value = cat?.descricao || '';

  // Histórico lock: bloqueia mudança de bloco quando categoria tem vínculos reais
  const hasHistorico = !!catId && historicoCatIds.has(catId);
  modalCatLockedGrupo = hasHistorico ? cat.grupo : null;
  document.getElementById('cat-migration-warning').classList.toggle('hidden', !hasHistorico);
  document.getElementById('cat-override-bloco').checked = false;
  refreshCatGrupoLock();

  document.getElementById('modal-categoria').classList.remove('hidden');
  document.getElementById('cat-nome').focus();
}

function refreshCatGrupoLock() {
  const overrideCb  = document.getElementById('cat-override-bloco');
  const grupoSelect = document.getElementById('cat-grupo');
  const lock = !!modalCatLockedGrupo && !overrideCb.checked;
  for (const opt of grupoSelect.options) {
    opt.disabled = lock && opt.value !== modalCatLockedGrupo;
  }
  // If user just unchecked override, ensure value is still valid (the locked one)
  if (lock) grupoSelect.value = modalCatLockedGrupo;
}

function closeCatModal() {
  document.getElementById('modal-categoria').classList.add('hidden');
  editingCatId = null;
}

async function saveCat() {
  const nome      = document.getElementById('cat-nome').value.trim();
  const cor       = document.getElementById('cat-cor').value;
  const grupo     = document.getElementById('cat-grupo').value;
  const descricao = document.getElementById('cat-descricao').value.trim() || null;

  if (!nome) { showToast(t('configuracoes.validacao.cat_nome_obrigatorio', 'Informe o nome da categoria'), 'error'); return; }

  // Enforce migration lock unless override is checked
  if (editingCatId && historicoCatIds.has(editingCatId)) {
    const cat = cachedCategorias.find((c) => c.id === editingCatId);
    const overrideOn = document.getElementById('cat-override-bloco').checked;
    if (cat && grupo !== cat.grupo && !overrideOn) {
      showToast(t('configuracoes.toast.cat_com_historico', 'Esta categoria tem histórico vinculado. Marque "Mover mesmo assim" para confirmar.'), 'error', 8000);
      return;
    }
  }

  const btn = document.getElementById('btn-save-categoria');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const user = await getCurrentUser();
  if (!user) return;

  let error;
  if (editingCatId) {
    ({ error } = await supabase.from('categorias').update({ nome, cor, grupo, descricao }).eq('id', editingCatId));
  } else {
    const ordem = cachedCategorias.length;
    ({ error } = await supabase.from('categorias')
      .insert({ user_id: user.id, nome, cor, grupo, ordem, is_default: false, descricao }));
  }

  btn.disabled = false;
  btn.textContent = 'Salvar';

  if (error) { showToast('Erro: ' + error.message, 'error', 8000); return; }

  showToast(editingCatId
    ? t('configuracoes.toast.cat_atualizada', 'Categoria atualizada')
    : t('configuracoes.toast.cat_criada', 'Categoria criada'),
    'success');

  if (!editingCatId) {
    // v0.5.x: criação de compromisso vive nas páginas de Dívidas/Projetos
    // e na aba Configurações de Orçamento — não mais aqui.
    closeCatModal();
    await reloadAll();
  } else {
    closeCatModal();
    await reloadAll();
  }
}

// -----------------------------
// Subcategoria modal
// -----------------------------
function openSubModal(subId = null, catId = null, blocoGrupos = null) {
  editingSubId = subId;
  newSubCatId  = catId;
  modalSubBlocoGrupos = blocoGrupos;

  const sub           = subId ? cachedSubcategorias.find((s) => s.id === subId) : null;
  const resolvedCatId = catId || sub?.categoria_id || null;
  const currentCat    = sub ? cachedCategorias.find((c) => c.id === sub.categoria_id) : null;

  document.getElementById('modal-subcategoria-title').textContent = sub ? 'Editar subcategoria' : 'Nova subcategoria';
  document.getElementById('sub-nome').value      = sub?.nome      || '';
  document.getElementById('sub-descricao').value = sub?.descricao || '';

  // Show category selector:
  //   editing mode → always show so user can migrate to another category
  //   new with no pre-selected cat → show with empty prompt
  //   new with pre-selected cat → hide
  const showCatSelect = !!subId || !resolvedCatId;
  const catField = document.getElementById('sub-categoria-field');
  catField.classList.toggle('hidden', !showCatSelect);

  // Histórico lock: bloqueia mudança de grupo quando subcategoria tem vínculos reais
  const hasHistorico = !!subId && historicoSubIds.has(subId);
  modalSubLockedGrupo = hasHistorico ? currentCat?.grupo || null : null;
  document.getElementById('sub-migration-warning').classList.toggle('hidden', !hasHistorico);
  document.getElementById('sub-override-bloco').checked = false;

  if (showCatSelect) renderSubCatSelect(resolvedCatId);

  const hint = document.getElementById('sub-categoria-hint');
  if (!showCatSelect && resolvedCatId) {
    const cat = cachedCategorias.find((c) => c.id === resolvedCatId);
    hint.textContent = cat ? `Categoria: ${cat.nome}` : '';
  } else if (hasHistorico) {
    hint.textContent = '';
  } else {
    hint.textContent = subId ? 'Mude a categoria para mover esta subcategoria.' : '';
  }

  // Renda principal: visible only for receitas grupo
  const subCatId = resolvedCatId || (sub ? sub.categoria_id : null);
  const subCat   = subCatId ? cachedCategorias.find((c) => c.id === subCatId) : null;
  const isReceitas = subCat?.grupo === 'receitas'
    || (modalSubBlocoGrupos?.includes('receitas') && !subCatId);
  const rpRow = document.getElementById('sub-renda-principal-row');
  rpRow.classList.toggle('hidden', !isReceitas);
  if (isReceitas) {
    const rpCb = document.getElementById('sub-renda-principal');
    rpCb.checked = !!sub?.eh_renda_principal;
    document.getElementById('sub-renda-principal-callout')
      .classList.toggle('hidden', !rpCb.checked);
  }

  document.getElementById('modal-subcategoria').classList.remove('hidden');
  document.getElementById('sub-nome').focus();
}

function renderSubCatSelect(selectedCatId) {
  const overrideCb = document.getElementById('sub-override-bloco');
  const lock = !!modalSubLockedGrupo && !overrideCb.checked;

  // Filter to bloco's grupos when adding from a bloco column header
  let availableCats = [...cachedCategorias];
  if (modalSubBlocoGrupos && modalSubBlocoGrupos.length) {
    availableCats = availableCats.filter((c) => modalSubBlocoGrupos.includes(c.grupo || 'custo_vida'));
  }
  availableCats.sort((a, b) =>
    (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' })
  );

  const sel = document.getElementById('sub-categoria-select');
  sel.innerHTML = (selectedCatId ? '' : '<option value="">Selecione uma categoria…</option>') +
    availableCats.map((c) => {
      const disabled  = lock && c.grupo !== modalSubLockedGrupo;
      const selected  = c.id === selectedCatId ? ' selected' : '';
      const suffix    = disabled ? ' (outro bloco — bloqueado)' : '';
      return `<option value="${c.id}"${selected}${disabled ? ' disabled' : ''}>${escapeHtml(c.nome)}${suffix}</option>`;
    }).join('');
  if (selectedCatId) sel.value = selectedCatId;
}

function closeSubModal() {
  document.getElementById('modal-subcategoria').classList.add('hidden');
  editingSubId = null;
  newSubCatId  = null;
}

async function saveSub() {
  const nome      = document.getElementById('sub-nome').value.trim();
  const descricao = document.getElementById('sub-descricao').value.trim() || null;
  if (!nome) { showToast(t('configuracoes.validacao.sub_nome_obrigatorio', 'Informe o nome da subcategoria'), 'error'); return; }

  // Resolve catId from: pre-selected (inline + button), category selector, or existing sub's cat
  let resolvedCatId = newSubCatId;
  const catField = document.getElementById('sub-categoria-field');
  if (!catField.classList.contains('hidden')) {
    const selVal = document.getElementById('sub-categoria-select').value || null;
    if (selVal) resolvedCatId = selVal;
  }
  if (!resolvedCatId && !editingSubId) {
    showToast(t('configuracoes.validacao.cat_obrigatoria', 'Selecione uma categoria'), 'error');
    return;
  }

  // Enforce migration lock unless override is checked
  if (editingSubId && historicoSubIds.has(editingSubId) && resolvedCatId) {
    const sub        = cachedSubcategorias.find((s) => s.id === editingSubId);
    const currentCat = sub ? cachedCategorias.find((c) => c.id === sub.categoria_id) : null;
    const targetCat  = cachedCategorias.find((c) => c.id === resolvedCatId);
    const overrideOn = document.getElementById('sub-override-bloco').checked;
    if (currentCat && targetCat && currentCat.grupo !== targetCat.grupo && !overrideOn) {
      showToast(t('configuracoes.toast.sub_com_historico', 'Esta subcategoria tem histórico vinculado. Marque "Mover mesmo assim" para confirmar.'), 'error', 8000);
      return;
    }
  }

  const btn = document.getElementById('btn-save-subcategoria');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const user = await getCurrentUser();
  if (!user) return;

  // Renda principal value (only relevant for receitas)
  const currentCatForSave = cachedCategorias.find((c) => c.id === (resolvedCatId || editingSubId && cachedSubcategorias.find((s) => s.id === editingSubId)?.categoria_id));
  const isReceitas = currentCatForSave?.grupo === 'receitas';
  const ehRendaPrincipal = isReceitas
    ? document.getElementById('sub-renda-principal').checked
    : false;

  let error;
  if (editingSubId) {
    const updates = { nome, descricao };
    if (isReceitas) updates.eh_renda_principal = ehRendaPrincipal;
    if (resolvedCatId) {
      const sub = cachedSubcategorias.find((s) => s.id === editingSubId);
      if (resolvedCatId !== sub?.categoria_id) {
        updates.categoria_id = resolvedCatId;
        const cat = cachedCategorias.find((c) => c.id === resolvedCatId);
        updates.tipo = cat?.grupo === 'receitas' ? 'Receita' : 'Despesa';
      }
    }
    ({ error } = await supabase.from('subcategorias').update(updates).eq('id', editingSubId));
  } else {
    const cat    = cachedCategorias.find((c) => c.id === resolvedCatId);
    const tipo   = cat?.grupo === 'receitas' ? 'Receita' : 'Despesa';
    const today  = todayISO();
    const isDividasCat   = cat?.grupo === 'dividas';
    const isInvestCat    = cat?.grupo === 'investimentos';
    // Para dividas/investimentos: subcategoria nasce inativa — ativa quando o usuário configurar
    const statusInicial  = (isDividasCat || isInvestCat) ? 'inativa' : 'ativa';

    const ins = await supabase.from('subcategorias').insert({
      user_id:            user.id,
      nome,
      descricao,
      categoria_id:       resolvedCatId,
      tipo,
      periodo:            'Mensal',
      valor_base:         0,
      iniciado_em:        today,
      status:             statusInicial,
      eh_renda_principal: ehRendaPrincipal,
    }).select('id').single();
    error = ins.error;
    const insertedId = ins.data?.id || null;

    // Auto-criar dívida bare e linkar à subcategoria
    if (!error && insertedId && isDividasCat) {
      const { data: novaDivida, error: divErr } = await supabase
        .from('dividas')
        .insert({ user_id: user.id, nome, valor_total: 0, valor_pago: 0, status: 'Ativa' })
        .select('id').single();
      if (divErr) {
        showToast('Subcategoria criada, mas erro ao criar dívida: ' + divErr.message, 'warning', 8000);
      } else {
        await supabase.from('subcategorias').update({ divida_id: novaDivida.id }).eq('id', insertedId);
      }
    }

    // Auto-criar projeto bare e linkar à subcategoria
    if (!error && insertedId && isInvestCat) {
      const { data: novoProjeto, error: projErr } = await supabase
        .from('projetos_investimento')
        .insert({ user_id: user.id, nome, status: 'ativo', cor: '#6D5EF5' })
        .select('id').single();
      if (projErr) {
        showToast('Subcategoria criada, mas erro ao criar projeto: ' + projErr.message, 'warning', 8000);
      } else {
        await supabase.from('subcategorias').update({ projeto_id: novoProjeto.id }).eq('id', insertedId);
      }
    }
  }

  btn.disabled = false;
  btn.textContent = 'Salvar';

  if (error) {
    if (error.code === '23505' && error.message?.includes('renda_principal')) {
      showToast('Já existe uma renda principal. Remova a marcação da outra subcategoria primeiro.', 'error', 8000);
    } else {
      showToast('Erro: ' + error.message, 'error', 8000);
    }
    return;
  }

  showToast(editingSubId ? t('configuracoes.toast.sub_atualizada', 'Subcategoria atualizada') : t('configuracoes.toast.sub_criada', 'Subcategoria criada'), 'success');

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
    const cat = cachedCategorias.find((c) => c.id === sub?.categoria_id);
    document.getElementById('cfg-confirm-title').textContent = 'Excluir subcategoria?';
    let msg = `Excluir <strong>${escapeHtml(sub?.nome || '')}</strong>?`;
    if (sub?.divida_id && cat?.grupo === 'dividas') {
      msg += '<br><small style="color:var(--color-muted)">O financiamento/dívida vinculado também será excluído ou arquivado.</small>';
    } else if (sub?.projeto_id && cat?.grupo === 'investimentos') {
      msg += '<br><small style="color:var(--color-muted)">O projeto de investimento vinculado também será excluído ou arquivado.</small>';
    }
    document.getElementById('cfg-confirm-msg').innerHTML = msg;
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
      showToast(t('configuracoes.toast.excluir_com_subs', 'Não é possível excluir: existem subcategorias nessa categoria.'), 'error', 8000);
      return;
    }
    ({ error } = await supabase.from('categorias').delete().eq('id', id));
  } else {
    const sub = cachedSubcategorias.find((s) => s.id === id);
    const cat = cachedCategorias.find((c) => c.id === sub?.categoria_id);

    if (sub?.divida_id && cat?.grupo === 'dividas') {
      // Cascade: apaga ou arquiva a dívida vinculada (1:1)
      const { count } = await supabase
        .from('pagamentos_divida_historico')
        .select('id', { count: 'exact', head: true })
        .eq('divida_id', sub.divida_id);
      if ((count || 0) > 0) {
        // Tem histórico → arquiva a dívida, apaga sub manualmente
        await supabase.from('dividas').update({ status: 'Arquivada' }).eq('id', sub.divida_id);
        ({ error } = await supabase.from('subcategorias').delete().eq('id', id));
      } else {
        // Sem histórico → hard delete da dívida (CASCADE apaga a sub via FK)
        ({ error } = await supabase.from('dividas').delete().eq('id', sub.divida_id));
      }
    } else if (sub?.projeto_id && cat?.grupo === 'investimentos') {
      // Cascade: apaga ou arquiva o projeto vinculado (1:1)
      const { count } = await supabase
        .from('aportes_projeto')
        .select('id', { count: 'exact', head: true })
        .eq('projeto_id', sub.projeto_id);
      // Apaga a sub primeiro (FK é SET NULL, projeto sobrevive para arquivar/deletar)
      ({ error } = await supabase.from('subcategorias').delete().eq('id', id));
      if (!error) {
        if ((count || 0) > 0) {
          // Tem histórico → arquiva projeto com backup do compromisso
          await supabase.from('projetos_investimento').update({
            status:            'arquivado',
            comp_valor_base:   sub.valor_base,
            comp_periodo:      sub.periodo,
            comp_categoria_id: sub.categoria_id,
            comp_data_inicio:  sub.iniciado_em,
          }).eq('id', sub.projeto_id);
        } else {
          await supabase.from('projetos_investimento').delete().eq('id', sub.projeto_id);
        }
      }
    } else {
      ({ error } = await supabase.from('subcategorias').delete().eq('id', id));
    }
  }

  if (error) { showToast('Erro ao excluir: ' + error.message, 'error', 8000); return; }

  showToast(type === 'cat' ? t('configuracoes.toast.cat_excluida', 'Categoria excluída') : t('configuracoes.toast.sub_excluida', 'Subcategoria excluída'), 'success');
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
  document.getElementById('cat-cor-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('.color-swatch');
    if (!btn) return;
    const color = btn.dataset.color;
    document.getElementById('cat-cor').value = color;
    setActiveColor(document.getElementById('cat-cor-picker'), color);
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

  // Migration override toggles
  document.getElementById('cat-override-bloco').addEventListener('change', refreshCatGrupoLock);
  document.getElementById('sub-override-bloco').addEventListener('change', () => {
    const currentVal = document.getElementById('sub-categoria-select').value || null;
    renderSubCatSelect(currentVal);
  });

  // Renda principal: show callout when checkbox toggled
  document.getElementById('sub-renda-principal').addEventListener('change', (e) => {
    document.getElementById('sub-renda-principal-callout').classList.toggle('hidden', !e.target.checked);
  });

  // Renda principal + vinculo: update row visibility when category selector changes
  document.getElementById('sub-categoria-select').addEventListener('change', () => {
    const catId = document.getElementById('sub-categoria-select').value;
    const cat = cachedCategorias.find((c) => c.id === catId);
    const isRec = cat?.grupo === 'receitas';
    document.getElementById('sub-renda-principal-row').classList.toggle('hidden', !isRec);
    if (!isRec) {
      document.getElementById('sub-renda-principal').checked = false;
      document.getElementById('sub-renda-principal-callout').classList.add('hidden');
    }
    // Re-renderiza picker de vínculo (mostra/esconde + reset)
    const sub = editingSubId ? cachedSubcategorias.find((s) => s.id === editingSubId) : null;
    renderSubVinculoPicker(cat, sub);
  });

  // Confirm delete modal
  document.getElementById('btn-close-cfg-confirmar').addEventListener('click', closeConfirmModal);
  document.getElementById('btn-cfg-confirmar-cancel').addEventListener('click', closeConfirmModal);
  document.getElementById('btn-cfg-confirmar-ok').addEventListener('click', execDelete);
  document.getElementById('modal-cfg-confirmar').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeConfirmModal();
  });

  // Sub detail modal
  document.getElementById('btn-close-sub-detail').addEventListener('click', closeSubDetailModal);
  document.getElementById('btn-sub-detail-close').addEventListener('click', closeSubDetailModal);
  document.getElementById('btn-sub-detail-edit').addEventListener('click', () => {
    const id = detailSubId;
    closeSubDetailModal();
    if (id) openSubModal(id);
  });
  document.getElementById('modal-sub-detail').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSubDetailModal();
  });

  // Embed overlay — click backdrop to close
  document.getElementById('cfg-embed-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add('hidden');
      const ifr = document.getElementById('cfg-embed-iframe');
      ifr.src = '';
      ifr.style.visibility = 'hidden';
      embedPreloaded = false;
      setTimeout(() => preWarmEmbedded(), 800);
    }
  });
}

function preWarmEmbedded() {
  const iframe = document.getElementById('cfg-embed-iframe');
  if (!iframe) return;
  embedPreloaded = false;
  iframe.style.visibility = 'hidden';
  iframe.src = 'compromissos.html?embedded=1&preload=1';
}

function openEmbeddedCompromisso(url) {
  const overlay = document.getElementById('cfg-embed-overlay');
  const iframe  = document.getElementById('cfg-embed-iframe');
  if (!overlay || !iframe) return;

  overlay.classList.remove('hidden');
  iframe.style.visibility = 'hidden'; // revela ao receber comp-ready

  if (embedPreloaded) {
    // Iframe já carregado — envia comando para abrir o modal instantaneamente
    const params = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
    const msg = { source: 'finflow-host', type: 'open-modal' };
    if (params.get('cfg_sub'))  msg.cfg_sub  = params.get('cfg_sub');
    if (params.get('cfg_cat'))  msg.cfg_cat  = params.get('cfg_cat');
    if (params.get('cfg_tipo')) msg.cfg_tipo = params.get('cfg_tipo');
    if (params.get('cfg_nome')) msg.cfg_nome = params.get('cfg_nome');
    iframe.contentWindow.postMessage(msg, location.origin);
  } else {
    // Fallback: carrega o iframe do zero (pré-aquecimento ainda não terminou)
    iframe.src = url;
  }
}

// Listen for messages from the embedded iframe (save / close / preloaded / ready)
window.addEventListener('message', (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.source !== 'finflow-embedded') return;
  const overlay = document.getElementById('cfg-embed-overlay');
  const iframe  = document.getElementById('cfg-embed-iframe');
  if (e.data?.type === 'comp-preloaded') {
    // Pré-aquecimento concluído — próxima abertura será instantânea
    embedPreloaded = true;
    return;
  }
  if (e.data?.type === 'comp-ready') {
    // Modal interno pronto — revela o iframe sem flash
    if (iframe) iframe.style.visibility = 'visible';
    return;
  }
  // comp-saved ou comp-closed
  overlay?.classList.add('hidden');
  if (iframe) iframe.style.visibility = 'hidden';
  if (e.data?.type === 'comp-saved') reloadAll();
  // Re-aquece para a próxima abertura
  embedPreloaded = false;
  setTimeout(() => preWarmEmbedded(), 800);
});

// -----------------------------
// Tabs
// -----------------------------
function bindTabEvents() {
  const toolbar = document.getElementById('cfg-panel-toolbar');
  document.querySelectorAll('.cfg-sidenav-item').forEach((item) => {
    item.addEventListener('click', () => {
      const target = item.dataset.tab;
      history.replaceState(null, '', '#' + target);

      document.querySelectorAll('.cfg-sidenav-item').forEach((t) => {
        t.classList.toggle('active', t === item);
      });
      document.querySelectorAll('.cfg-panel').forEach((p) => {
        p.classList.toggle('hidden', p.id !== `cfg-panel-${target}`);
      });

      // Toolbar only on Categorias
      if (toolbar) toolbar.classList.toggle('hidden', target !== 'categorias');

      // Lazy-init Sistema panel
      if (target === 'sistema') renderSistemaPanel();
      // Troca o conteúdo interno do toolbar conforme a aba
      document.querySelectorAll('.cfg-toolbar-content').forEach((c) => {
        c.classList.toggle('hidden', c.id !== `cfg-toolbar-${target}`);
      });

      updateStickyThTop();
    });
  });
}

// -----------------------------
// Seed default categories
// -----------------------------
async function seedDefaultCategories() {
  const user = await getCurrentUser();
  if (!user) return;

  const today = todayISO();
  // is_default=true → Receita, Dívidas, Investimentos (protegidas, não editáveis/deletáveis)
  // is_default=false → demais categorias de exemplo (usuário pode editar/deletar)
  const defaults = [
    { nome: 'Receita',            grupo: 'receitas',      cor: '#22c55e', isDefault: true,  subs: ['Renda principal', '13º Salário', 'Ganhos de investimento', 'Extras'] },
    { nome: 'Financiamentos e Dívidas', grupo: 'dividas',  cor: '#ef4444', isDefault: true,  subs: [] },
    { nome: 'Investimentos',      grupo: 'investimentos',  cor: '#6D5EF5', isDefault: true,  subs: ['Renda fixa', 'Renda variável'] },
    { nome: 'Casa',               grupo: 'custo_vida',     cor: '#f97316', isDefault: false, subs: [] },
    { nome: 'Doações e Presentes', grupo: 'custo_vida',    cor: '#ec4899', isDefault: false, subs: [] },
    { nome: 'Educação e Saúde',   grupo: 'custo_vida',     cor: '#3b82f6', isDefault: false, subs: [] },
  ];

  for (let i = 0; i < defaults.length; i++) {
    const d = defaults[i];
    const { data: catData, error: catErr } = await supabase
      .from('categorias')
      .insert({ user_id: user.id, nome: d.nome, cor: d.cor, grupo: d.grupo, ordem: i, is_default: d.isDefault })
      .select('id')
      .single();
    if (catErr) { console.warn('[seed] cat error:', catErr.message); continue; }

    for (const subNome of d.subs) {
      const tipo = d.grupo === 'receitas' ? 'Receita' : 'Despesa';
      await supabase.from('subcategorias').insert({
        user_id: user.id, nome: subNome, categoria_id: catData.id,
        tipo, periodo: 'Mensal', valor_base: 0, iniciado_em: today, status: 'ativa',
      });
    }
  }
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
      showToast(t('configuracoes.toast.idioma_salvo', 'Idioma salvo. Será aplicado quando as traduções estiverem disponíveis.'), 'info', 5000);
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
  selPadrao.innerHTML = renderMoedaOptions(moedaPadrao);

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
    showToast(t('configuracoes.toast.salvas', 'Configurações salvas.'), 'success');
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
      <a class="vp-link" href="/dividas.html">Ver financiamentos e dívidas →</a>`;
  }
  return null;
}

function fmtCurrency(val, moeda = 'BRL') {
  return formatCurrency(val, moeda);
}

// -----------------------------
// Sub detail modal
// -----------------------------
async function openSubDetailModal(subId) {
  detailSubId = subId;
  const sub = cachedSubcategorias.find((s) => s.id === subId);
  if (!sub) return;

  const cat     = cachedCategorias.find((c) => c.id === sub.categoria_id);
  const projeto = sub.projeto_id ? cachedProjetos.find((p) => p.id === sub.projeto_id) : null;
  const divida  = sub.divida_id  ? cachedDividas.find((d)  => d.id === sub.divida_id)  : null;
  const hasComp = Number(sub.valor_base) > 0 || sub.valor_variavel === true;
  const valorLabel = sub.valor_variavel ? 'Variável' : (Number(sub.valor_base) > 0 ? fmtCurrency(Number(sub.valor_base)) : '—');

  // Build colored badge rows — each on its own line with a type label
  const badgeRows = [];
  if (projeto) {
    badgeRows.push(`
      <div class="sub-detail-badge-row">
        <span class="sub-detail-badge-type">Projeto</span>
        <span class="vinculo-badge vinculo-badge--projeto" style="--vinculo-cor:${projeto.cor};">${escapeHtml(projeto.nome)}</span>
      </div>`);
  }
  if (divida) {
    badgeRows.push(`
      <div class="sub-detail-badge-row">
        <span class="sub-detail-badge-type">Dívida</span>
        <span class="vinculo-badge vinculo-badge--divida">${escapeHtml(divida.nome)}</span>
      </div>`);
  }
  if (hasComp) {
    badgeRows.push(`
      <div class="sub-detail-badge-row">
        <span class="sub-detail-badge-type">Compromisso</span>
        <span class="cfg-comp-badge cfg-comp-badge--val">${escapeHtml(sub.nome)}</span>
      </div>`);
  }
  const badgesHtml = badgeRows.length
    ? `<div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-3);">${badgeRows.join('')}</div>`
    : `<p style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-bottom:var(--space-3);">Sem compromisso configurado</p>`;

  // Load last 5 transactions
  let txRows;
  try {
    const { data: txs } = await supabase
      .from('transacoes')
      .select('descricao, valor, tipo, data')
      .eq('subcategoria_id', subId)
      .order('data', { ascending: false })
      .limit(5);
    if (txs && txs.length) {
      txRows = `<ul class="sub-detail-tx-list">` + txs.map((tx) => {
        const isIn    = tx.tipo === 'Receita';
        const val     = fmtCurrency(Math.abs(Number(tx.valor)));
        const dateFmt = tx.data ? formatDateBR(tx.data) : '—';
        return `<li class="sub-detail-tx-item">
          <span class="sub-detail-tx-date">${dateFmt}</span>
          <span class="sub-detail-tx-desc">${escapeHtml(tx.descricao || '—')}</span>
          <span class="sub-detail-tx-val ${isIn ? 'sub-detail-tx-in' : 'sub-detail-tx-out'}">${isIn ? '+' : '-'}${val}</span>
        </li>`;
      }).join('') + `</ul>`;
    } else {
      txRows = `<p class="sub-detail-tx-empty">Nenhuma transação registrada.</p>`;
    }
  } catch { txRows = `<p class="sub-detail-tx-empty">Erro ao carregar transações.</p>`; }

  const content = document.getElementById('sub-detail-content');
  content.innerHTML = `
    <div class="sub-detail-header">
      <div style="flex:1">
        <div class="sub-detail-name">${escapeHtml(sub.nome)}</div>
        ${cat ? `<span class="sub-detail-cat-pill" style="background:${cat.cor}1A;color:${cat.cor};">${escapeHtml(cat.nome)}</span>` : ''}
      </div>
    </div>
    <div class="sub-detail-body">
      <div class="sub-detail-section">
        <p class="sub-detail-section-title">Vínculo</p>
        ${badgesHtml}
        <div class="sub-detail-grid">
          <div class="sub-detail-row">
            <span class="sub-detail-label">Período</span>
            <span class="sub-detail-value">${escapeHtml(sub.periodo || '—')}</span>
          </div>
          <div class="sub-detail-row">
            <span class="sub-detail-label">Valor base</span>
            <span class="sub-detail-value">${escapeHtml(valorLabel)}</span>
          </div>
          <div class="sub-detail-row">
            <span class="sub-detail-label">Status</span>
            <span class="sub-detail-value">${escapeHtml(sub.status || '—')}</span>
          </div>
          <div class="sub-detail-row">
            <span class="sub-detail-label">Iniciado em</span>
            <span class="sub-detail-value">${sub.iniciado_em ? formatDateBR(sub.iniciado_em) : '—'}</span>
          </div>
          ${sub.eh_renda_principal ? `<div class="sub-detail-row" style="grid-column:1/-1"><span class="sub-detail-label">Renda principal</span><span class="sub-detail-value" style="color:var(--color-success);">✓ Sim</span></div>` : ''}
        </div>
      </div>
      ${sub.descricao ? `
      <div class="sub-detail-section">
        <p class="sub-detail-section-title">Descrição</p>
        <div class="sub-detail-desc">${escapeHtml(sub.descricao)}</div>
      </div>` : ''}
      <div class="sub-detail-section">
        <p class="sub-detail-section-title">Últimas transações</p>
        ${txRows}
      </div>
    </div>`;

  document.getElementById('modal-sub-detail').classList.remove('hidden');
}

function closeSubDetailModal() {
  document.getElementById('modal-sub-detail').classList.add('hidden');
  detailSubId = null;
}

// -----------------------------
// Transaction count hover popover
// -----------------------------
let txPopover = null;
let txPopoverSubId = null;
let txHideTimer = null;
let txShowTimer = null;
const cachedLastTx = new Map(); // subId → tx[] (lazy loaded)

function initTxPopover() {
  txPopover = document.createElement('div');
  txPopover.id        = 'tx-popover';
  txPopover.className = 'vinculo-popover hidden';  // reuse vinculo-popover styles
  txPopover.style.minWidth = '300px';
  txPopover.style.maxWidth = '380px';
  document.body.appendChild(txPopover);
  txPopover.addEventListener('mouseenter', () => { clearTimeout(txHideTimer); });
  txPopover.addEventListener('mouseleave', () => { txHideTimer = setTimeout(hideTxPopover, 150); });

  document.addEventListener('mouseover', (e) => {
    const badge = e.target.closest('[data-tx-sub]');
    if (badge) {
      clearTimeout(txHideTimer);
      txShowTimer = setTimeout(() => showTxPopover(badge), 120);
    }
  });
  document.addEventListener('mouseout', (e) => {
    const badge = e.target.closest('[data-tx-sub]');
    if (!badge) return;
    clearTimeout(txShowTimer);
    if (!e.relatedTarget?.closest('#tx-popover') && !e.relatedTarget?.closest('[data-tx-sub]')) {
      txHideTimer = setTimeout(hideTxPopover, 150);
    }
  });
}

async function showTxPopover(badge) {
  const subId = badge.dataset.txSub;
  if (!subId) return;
  txPopoverSubId = subId;

  // Load if not cached
  if (!cachedLastTx.has(subId)) {
    cachedLastTx.set(subId, null); // sentinel to avoid concurrent loads
    try {
      const { data } = await supabase
        .from('transacoes')
        .select('descricao, valor, tipo, data')
        .eq('subcategoria_id', subId)
        .order('data', { ascending: false })
        .limit(5);
      cachedLastTx.set(subId, data || []);
    } catch { cachedLastTx.set(subId, []); }
  }

  // If user moused away while loading, skip
  if (txPopoverSubId !== subId) return;

  const txs = cachedLastTx.get(subId) || [];
  const sub = cachedSubcategorias.find((s) => s.id === subId);

  let html = `<div class="tx-pop-header">${sub ? escapeHtml(sub.nome) : ''} — últimas transações</div>`;
  if (txs.length) {
    html += `<ul class="tx-pop-list">` + txs.map((tx) => {
      const isIn = tx.tipo === 'Receita';
      const val  = fmtCurrency(Math.abs(Number(tx.valor)));
      return `<li class="tx-pop-item">
        <span class="tx-pop-date">${tx.data ? formatDateBR(tx.data) : '—'}</span>
        <span class="tx-pop-desc">${escapeHtml(tx.descricao || '—')}</span>
        <span class="tx-pop-val ${isIn ? 'tx-pop-val--in' : 'tx-pop-val--out'}">${isIn ? '+' : '-'}${val}</span>
      </li>`;
    }).join('') + `</ul>`;
  } else {
    html += `<div class="tx-pop-empty">Nenhuma transação registrada.</div>`;
  }

  txPopover.innerHTML = html;
  txPopover.classList.remove('hidden');

  const rect = badge.getBoundingClientRect();
  txPopover.style.top  = `${rect.bottom + 8 + window.scrollY}px`;
  txPopover.style.left = `${rect.left + window.scrollX}px`;

  const pr = txPopover.getBoundingClientRect();
  if (pr.right > window.innerWidth - 12) {
    txPopover.style.left = `${rect.right - pr.width + window.scrollX}px`;
  }
}

function hideTxPopover() {
  txPopover?.classList.add('hidden');
  txPopoverSubId = null;
}

// -----------------------------
// Drag & drop para reordenar categorias dentro de um bloco
// -----------------------------
let draggingCatId   = null;
let draggingBlocoId = null;

function bindCategoryDragDrop() {
  document.addEventListener('dragstart', (e) => {
    const handle = e.target.closest('[data-drag-cat-id]');
    if (!handle) return;

    draggingCatId = handle.dataset.dragCatId;
    const cat   = cachedCategorias.find((c) => c.id === draggingCatId);
    const bloco = SUPER_BLOCOS.find((b) => b.grupos.includes(cat?.grupo || 'custo_vida'));
    draggingBlocoId = bloco?.id || null;

    e.dataTransfer.setData('text/plain', draggingCatId);
    e.dataTransfer.effectAllowed = 'move';

    const tbody = handle.closest('.cfg-cat-body');
    if (tbody) tbody.classList.add('cfg-dragging');
  });

  document.addEventListener('dragend', () => {
    document.querySelectorAll('.cfg-cat-body.cfg-dragging').forEach((el) => el.classList.remove('cfg-dragging'));
    document.querySelectorAll('.cfg-drop-above, .cfg-drop-below').forEach((el) => {
      el.classList.remove('cfg-drop-above', 'cfg-drop-below');
    });
    draggingCatId   = null;
    draggingBlocoId = null;
  });

  document.addEventListener('dragover', (e) => {
    if (!draggingCatId) return;
    const tbody = e.target.closest('.cfg-cat-body[data-cat-id]');
    if (!tbody || tbody.dataset.catId === draggingCatId) return;

    const targetCat   = cachedCategorias.find((c) => c.id === tbody.dataset.catId);
    const targetBloco = SUPER_BLOCOS.find((b) => b.grupos.includes(targetCat?.grupo || 'custo_vida'));
    if (targetBloco?.id !== draggingBlocoId) return; // bloqueia entre blocos diferentes

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect    = tbody.getBoundingClientRect();
    const isAbove = (e.clientY - rect.top) < (rect.height / 2);

    document.querySelectorAll('.cfg-drop-above, .cfg-drop-below').forEach((el) => {
      el.classList.remove('cfg-drop-above', 'cfg-drop-below');
    });
    tbody.classList.add(isAbove ? 'cfg-drop-above' : 'cfg-drop-below');
  });

  document.addEventListener('drop', async (e) => {
    if (!draggingCatId) return;
    const tbody = e.target.closest('.cfg-cat-body[data-cat-id]');
    if (!tbody) return;
    e.preventDefault();

    const targetCatId = tbody.dataset.catId;
    if (targetCatId === draggingCatId) return;

    const targetCat   = cachedCategorias.find((c) => c.id === targetCatId);
    const targetBloco = SUPER_BLOCOS.find((b) => b.grupos.includes(targetCat?.grupo || 'custo_vida'));
    if (targetBloco?.id !== draggingBlocoId) return;

    const rect    = tbody.getBoundingClientRect();
    const isAbove = (e.clientY - rect.top) < (rect.height / 2);

    await reorderCategoria(draggingCatId, targetCatId, isAbove, targetBloco.grupos);
  });
}

async function reorderCategoria(sourceCatId, targetCatId, insertAbove, blocoGrupos) {
  const allSorted = [...cachedCategorias].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const blocoCats = allSorted.filter((c) => blocoGrupos.includes(c.grupo || 'custo_vida'));

  const reordered = [...blocoCats];
  const fromIdx   = reordered.findIndex((c) => c.id === sourceCatId);
  if (fromIdx === -1) return;
  const [moved] = reordered.splice(fromIdx, 1);

  const targetIdxInRemaining = reordered.findIndex((c) => c.id === targetCatId);
  if (targetIdxInRemaining === -1) return;
  const insertIdx = insertAbove ? targetIdxInRemaining : targetIdxInRemaining + 1;
  reordered.splice(insertIdx, 0, moved);

  // Compose new global order: keep non-bloco cats in place, fill bloco slots with new order
  const newAllSorted = [];
  let blocoIdx = 0;
  for (const c of allSorted) {
    if (blocoGrupos.includes(c.grupo || 'custo_vida')) {
      newAllSorted.push(reordered[blocoIdx++]);
    } else {
      newAllSorted.push(c);
    }
  }

  // Compute updates (only for cats whose ordem actually changed)
  const updates = [];
  for (let i = 0; i < newAllSorted.length; i++) {
    if ((newAllSorted[i].ordem ?? 0) !== i) {
      updates.push({ id: newAllSorted[i].id, ordem: i });
    }
  }
  if (!updates.length) return;

  const results = await Promise.all(
    updates.map((u) => supabase.from('categorias').update({ ordem: u.ordem }).eq('id', u.id))
  );
  const errors = results.filter((r) => r.error);
  if (errors.length) {
    showToast(`Erro ao reordenar: ${errors[0].error.message}`, 'error', 8000);
    return;
  }

  await reloadAll();
}

// -----------------------------
// Info popover (categoria / subcategoria)
// -----------------------------
function initInfoPopover() {
  const pop = document.createElement('div');
  pop.id        = 'info-popover';
  pop.className = 'info-popover hidden';
  document.body.appendChild(pop);
  pop.addEventListener('mouseleave', hideInfoPopover);

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-info-type]');
    if (el) showInfoPopover(el);
  });
  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest('[data-info-type]');
    if (!el) return;
    if (!e.relatedTarget?.closest('#info-popover') && !e.relatedTarget?.closest('[data-info-type]')) {
      hideInfoPopover();
    }
  });
}

function showInfoPopover(el) {
  const pop = document.getElementById('info-popover');
  if (!pop) return;
  const type = el.dataset.infoType;
  const id   = el.dataset.infoId;

  let html;
  if (type === 'cat') html = buildCatInfoPopoverHtml(id);
  else if (type === 'sub') html = buildSubInfoPopoverHtml(id);
  if (!html) return;

  pop.innerHTML = html;
  pop.classList.remove('hidden');

  const rect = el.getBoundingClientRect();
  pop.style.top  = `${rect.bottom + 8 + window.scrollY}px`;
  pop.style.left = `${rect.left + window.scrollX}px`;

  const pr = pop.getBoundingClientRect();
  if (pr.right > window.innerWidth - 12) {
    pop.style.left = `${rect.right - pr.width + window.scrollX}px`;
  }
}

function hideInfoPopover() {
  document.getElementById('info-popover')?.classList.add('hidden');
}

function buildCatInfoPopoverHtml(catId) {
  const cat = cachedCategorias.find((c) => c.id === catId);
  if (!cat) return null;

  const blocoEntry = SUPER_BLOCOS.find((b) => b.grupos.includes(cat.grupo || 'custo_vida'));
  const blocoLabel = blocoEntry?.label || '—';
  const subCount   = cachedSubcategorias.filter((s) => s.categoria_id === catId).length;
  const hasHist    = historicoCatIds.has(catId);

  return `
    <div class="info-pop-header">
      <span class="info-pop-tag">Categoria</span>
      <span class="info-pop-color-swatch" style="background:${cat.cor || '#6D5EF5'}"></span>
      <strong class="info-pop-title">${escapeHtml(cat.nome)}</strong>
    </div>
    <div class="info-pop-body">
      <div class="info-pop-row"><span>Bloco</span><strong>${escapeHtml(blocoLabel)}</strong></div>
      <div class="info-pop-row"><span>Subcategorias</span><strong>${subCount}</strong></div>
      <div class="info-pop-row"><span>Histórico</span><strong class="${hasHist ? 'info-pop-yes' : 'info-pop-no'}">${hasHist ? 'Vinculado' : 'Sem vínculos'}</strong></div>
      ${cat.is_default ? `<div class="info-pop-row"><span>Origem</span><strong>Padrão (sistema)</strong></div>` : ''}
      ${cat.descricao ? `
        <div class="info-pop-section">
          <div class="info-pop-label">Descrição</div>
          <div class="info-pop-desc">${escapeHtml(cat.descricao)}</div>
        </div>` : ''}
    </div>`;
}

function buildSubInfoPopoverHtml(subId) {
  const sub = cachedSubcategorias.find((s) => s.id === subId);
  if (!sub) return null;

  const cat        = cachedCategorias.find((c) => c.id === sub.categoria_id);
  const blocoEntry = SUPER_BLOCOS.find((b) => b.grupos.includes(cat?.grupo || 'custo_vida'));
  const blocoLabel = blocoEntry?.label || '—';
  const projeto    = sub.projeto_id ? cachedProjetos.find((p) => p.id === sub.projeto_id) : null;
  const divida     = sub.divida_id  ? cachedDividas.find((d) => d.id === sub.divida_id)  : null;
  const hasHist    = historicoSubIds.has(subId);

  let valorLabel;
  if (sub.valor_variavel)              valorLabel = 'Variável';
  else if (Number(sub.valor_base) > 0) valorLabel = fmtCurrency(Number(sub.valor_base));
  else                                 valorLabel = '—';

  return `
    <div class="info-pop-header">
      <span class="info-pop-tag info-pop-tag--sub">Subcategoria</span>
      <strong class="info-pop-title">${escapeHtml(sub.nome)}</strong>
    </div>
    <div class="info-pop-body">
      <div class="info-pop-row"><span>Bloco</span><strong>${escapeHtml(blocoLabel)}</strong></div>
      <div class="info-pop-row"><span>Categoria</span><strong>${cat ? escapeHtml(cat.nome) : '—'}</strong></div>
      <div class="info-pop-row"><span>Período</span><strong>${escapeHtml(sub.periodo || '—')}</strong></div>
      <div class="info-pop-row"><span>Valor base</span><strong>${valorLabel}</strong></div>
      ${projeto ? `<div class="info-pop-row"><span>Projeto</span><strong>${escapeHtml(projeto.nome)}</strong></div>` : ''}
      ${divida  ? `<div class="info-pop-row"><span>Dívida</span><strong>${escapeHtml(divida.nome)}</strong></div>` : ''}
      <div class="info-pop-row"><span>Histórico</span><strong class="${hasHist ? 'info-pop-yes' : 'info-pop-no'}">${hasHist ? 'Vinculado' : 'Sem vínculos'}</strong></div>
      ${sub.descricao ? `
        <div class="info-pop-section">
          <div class="info-pop-label">Descrição</div>
          <div class="info-pop-desc">${escapeHtml(sub.descricao)}</div>
        </div>` : ''}
    </div>`;
}


