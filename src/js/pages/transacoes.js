// =============================================================
// FinFlow — Página: Transações (Fase 1)
//
// Registro real de dinheiro movimentado. Diferente de pagamentos
// (status mensal de compromisso) e de subcategorias (compromisso
// recorrente), cada transação é um evento atômico.
//
// Próximas fases:
//   - Fase 2: sync bidirecional com pagamentos (auto-cria transação
//             quando pagamento é marcado pago/cartão/transferido/parcial;
//             alerta de duplicata; alerta de pagamento agendado)
//   - Fase 3: auto-reconciliação por estabelecimento + regras salvas
//   - Fase 4: faturas de cartão de crédito + compromisso automático
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { requireWorkspaceId } from '../lib/workspace.js';
import { listMembers } from '../lib/workspace-members.js';
import { renderAttribBadge } from '../lib/attribution-badge.js';
import { applyBodyRoleGating } from '../lib/permissions.js';
import { blocoFromDate, recalcGastosDiversosBlocoDebounced } from '../lib/gastos-diversos.js';
import { getBlocoByGrupo, BLOCO_GRUPOS } from '../lib/super-blocos.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { filterVisibleSubs } from '../lib/subs-visibility.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatCurrency, formatCurrencyHTML, renderMoedaOptions, moedaInputPlaceholder } from '../lib/moedas.js';
import {
  findMatchingPagamento,
  findTransacaoLinkedToPagamento,
  isPaidStatus,
  markPagamentoPagoAndLink,
  linkTransacaoToPagamento,
  mergeTransacaoIntoExisting,
} from '../lib/transacao-pagamento-sync.js';
import {
  loadRules,
  findRule,
  upsertRule,
  suggestSubcategoriaFromHistory,
} from '../lib/regras-reconciliacao.js';
import { escapeHtml, formatDateBR, showConfirm, parseUserNumber, renderContaOptions } from '../lib/utils.js';
import { autoAttachDecimalInputs } from '../lib/number-format.js';
import { createContaPicker, contaAvatarHtml } from '../lib/conta-picker.js';
import { initContatoPicker } from '../components/contato-picker.js';
import { initColVisibility } from '../lib/col-visibility.js';
import { fetchExchangeRate } from '../lib/currency.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';
import {
  isContaCartao,
  syncTransacaoFatura,
  recalcFaturaTotal,
  checkAndCloseFaturas,
} from '../lib/faturas-cartao.js';

// -----------------------------
// State
// -----------------------------
let cachedTransacoes    = [];
let cachedContas        = [];
let cachedSubcategorias = [];
let cachedCategorias    = [];
let cachedContatos      = [];
let cachedDividas       = [];
let cachedRules         = [];
let editingId           = null;
let pendingDeleteId     = null;
let pendingRuleState    = null; // { contato_id, subcategoria_id } pra modal de criar regra

const MONTH_LABELS_LONG = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Colunas visíveis — persistidas no localStorage
const TRANS_COLUMNS = [
  { key: 'planejada',    label: 'Planejada',           defaultVisible: true },
  { key: 'id',           label: 'Identificador',       defaultVisible: true },
  { key: 'banco',        label: 'Descrição',           defaultVisible: true },
  { key: 'contato',      label: 'Cliente / Fornecedor',defaultVisible: true },
  { key: 'bloco',        label: 'Bloco',               defaultVisible: true },
  { key: 'categoria',    label: 'Categoria',           defaultVisible: true },
  { key: 'subcategoria', label: 'Subcategoria',        defaultVisible: true },
  { key: 'conta',        label: 'Conta',               defaultVisible: true },
  { key: 'valor',        label: 'Valor',               defaultVisible: true },
  { key: 'saldo',        label: 'Saldo',               defaultVisible: true },
];

// Seleção de linhas para exclusão em lote
let selectedIds     = new Set();

// Filtros
let filterMode          = 'mes';  // 'mes' | 'ano' | 'periodo' | 'todos'
let filterStart         = '';     // YYYY-MM-DD
let filterEnd           = '';     // YYYY-MM-DD
let filterConta         = '';
let filterTipo          = '';
let filterBusca         = '';
let filterReconciliacao = '';     // '' | 'importado' (legado, mantido pra compatibilidade)
let viewTab             = 'transacoes';  // 'transacoes' | 'importacoes'
let importSubFilter     = 'pendentes';   // 'pendentes' | 'confirmadas' — só usado quando viewTab='importacoes'
let activeTagFilters    = new Set(); // tags ativas como filtro

// Splits — cache global e estado do modal
let cachedSplits     = [];
let splitsByTransId  = new Map(); // Map<transacao_id, split[]>
let currentSplits    = [];        // splits em edição no modal
let splitEnabled     = false;     // toggle de divisão no modal

// Tags do modal em edição
let currentTags = [];

function normalizeTag(raw) {
  return raw.replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-áàâãéèêíïóôõöúüçñ]/gi, '');
}

function _hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const _TAG_PALETTE = ['#6D5EF5','#10B981','#3B82F6','#F59E0B','#EC4899','#8B5CF6','#06B6D4','#EF4444','#14B8A6','#F97316'];
function tagColor(tag) { return _TAG_PALETTE[_hashStr(String(tag)) % _TAG_PALETTE.length]; }

function getKnownTags() {
  const tags = new Set();
  cachedTransacoes.forEach((tr) => (tr.tags || []).forEach((tag) => tags.add(tag)));
  return [...tags].sort();
}

function renderModalTags() {
  const container = document.getElementById('trans-tags-container');
  const input = document.getElementById('trans-tag-input');
  if (!container || !input) return;
  container.querySelectorAll('.tag-chip-modal').forEach((el) => el.remove());
  currentTags.forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip-modal';
    chip.style.setProperty('--tag-color', tagColor(tag));
    chip.innerHTML = `<span class="tag-chip-text">#${escapeHtml(tag)}</span><button class="tag-chip-remove" data-index="${i}" type="button" tabindex="-1" aria-label="Remover tag">×</button>`;
    container.insertBefore(chip, input);
  });
}

function initTagInput() {
  const container = document.getElementById('trans-tags-container');
  const input = document.getElementById('trans-tag-input');
  const autocomplete = document.getElementById('trans-tag-autocomplete');
  if (!container || !input || container._tagBound) return;
  container._tagBound = true;

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-chip-remove');
    if (btn) {
      currentTags.splice(parseInt(btn.dataset.index, 10), 1);
      renderModalTags();
      input.focus();
      return;
    }
    if (!e.target.closest('.tag-chip-modal')) input.focus();
  });

  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      addTagFromInput();
      return;
    }
    if (e.key === 'Backspace' && !input.value && currentTags.length > 0) {
      currentTags.pop();
      renderModalTags();
      return;
    }
    if (e.key === 'Escape') hideTagAutocomplete();
  });

  input.addEventListener('blur', () => {
    if (input.value.trim()) addTagFromInput();
    setTimeout(hideTagAutocomplete, 150);
  });

  input.addEventListener('input', () => {
    const q = normalizeTag(input.value);
    if (!q || q.length < 1) { hideTagAutocomplete(); return; }
    const matches = getKnownTags().filter((tg) => tg.includes(q) && !currentTags.includes(tg));
    if (matches.length === 0) { hideTagAutocomplete(); return; }
    autocomplete.innerHTML = matches.slice(0, 8).map((tg) =>
      `<div class="tag-autocomplete-item" data-tag="${escapeHtml(tg)}">#${escapeHtml(tg)}</div>`
    ).join('');
    autocomplete.classList.remove('hidden');
  });

  autocomplete.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.tag-autocomplete-item');
    if (!item) return;
    e.preventDefault();
    const tag = item.dataset.tag;
    if (tag && !currentTags.includes(tag)) { currentTags.push(tag); renderModalTags(); }
    input.value = '';
    hideTagAutocomplete();
  });
}

function addTagFromInput() {
  const input = document.getElementById('trans-tag-input');
  if (!input) return;
  const tag = normalizeTag(input.value);
  if (tag && !currentTags.includes(tag)) { currentTags.push(tag); renderModalTags(); }
  input.value = '';
  hideTagAutocomplete();
}

function hideTagAutocomplete() {
  document.getElementById('trans-tag-autocomplete')?.classList.add('hidden');
}

function renderTagFilters() {
  const el = document.getElementById('trans-tag-filters');
  if (!el) return;
  if (activeTagFilters.size === 0) { el.innerHTML = ''; return; }
  el.innerHTML = [...activeTagFilters].map((tag) =>
    `<span class="trans-active-tag">#${escapeHtml(tag)}<button class="trans-active-tag-remove" data-tag="${escapeHtml(tag)}" type="button" title="Remover filtro">×</button></span>`
  ).join('');
}

// =============================================================
// Splits — divisão de transação em múltiplas partes
// =============================================================

function buildSplitRowHtml(idx, split) {
  const catId    = split.categoria_id    || '';
  const subId    = split.subcategoria_id || '';
  const cat      = catId ? cachedCategorias.find((c) => c.id === catId) : null;
  const sub      = subId ? cachedSubcategorias.find((s) => s.id === subId) : null;
  const catName  = cat ? escapeHtml(cat.nome) : '— Categoria —';
  const catColor = cat?.cor || '';
  const subName  = sub ? escapeHtml(sub.apelido || sub.nome) : '';
  const tagsHtml = (split.tags || []).map((tag, ti) =>
    `<span class="tag-chip-modal" data-split="${idx}" data-tidx="${ti}" style="--tag-color:${tagColor(tag)}"><span class="tag-chip-text">#${escapeHtml(tag)}</span><button class="tag-chip-remove" data-split="${idx}" data-tidx="${ti}" type="button" tabindex="-1">×</button></span>`
  ).join('');
  return `
    <div class="trans-split-row" data-idx="${idx}">
      <div class="split-row-header">
        <span class="split-row-num">Parte ${idx + 1}</span>
        <button type="button" class="btn-icon split-remove-btn" data-idx="${idx}" title="Remover parte">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="split-fields">
        <div class="field-group split-field-row">
          <div class="field">
            <label class="field-label-sm">Valor</label>
            <input class="input input-sm split-valor" type="text" inputmode="decimal" placeholder="0,00" value="${split.valor != null ? split.valor : ''}">
          </div>
          <div class="field">
            <label class="field-label-sm">Categoria</label>
            <div class="split-cat-picker-wrap">
              <button type="button" class="split-cat-btn" data-split-idx="${idx}">
                ${catColor ? `<span class="split-cat-dot" style="background:${catColor};"></span>` : `<span class="split-cat-dot split-cat-dot--empty"></span>`}
                <span class="split-cat-name">${catName}</span>
                <svg class="split-cat-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <input type="hidden" class="split-categoria" value="${catId}">
            </div>
          </div>
          <div class="field">
            <label class="field-label-sm">Subcategoria</label>
            <div class="split-sub-picker-wrap">
              <input type="text" class="input input-sm split-sub-search" placeholder="— Subcategoria —" autocomplete="off" spellcheck="false" value="${subName}" data-split-idx="${idx}">
              <input type="hidden" class="split-subcategoria" value="${subId}">
            </div>
          </div>
        </div>
        <div class="field">
          <label class="field-label-sm">Tags desta parte</label>
          <div class="tag-chips-input split-tags-input" data-split-idx="${idx}">
            ${tagsHtml}
            <input type="text" class="tag-input-field split-tag-input" data-split-idx="${idx}" placeholder="#tag" maxlength="60" autocomplete="off">
          </div>
        </div>
        <div class="field">
          <label class="field-label-sm">Descrição desta parte</label>
          <input type="text" class="input input-sm split-descricao" placeholder="Anotação opcional…" maxlength="200" value="${escapeHtml(split.descricao || '')}">
        </div>
      </div>
    </div>
  `;
}

function renderSplits() {
  const list = document.getElementById('trans-splits-list');
  if (!list) return;
  list.innerHTML = currentSplits.map((s, i) => buildSplitRowHtml(i, s)).join('');
  updateSplitTotals();
  bindSplitEvents();
}

function addSplit() {
  currentSplits.push({ valor: null, categoria_id: '', subcategoria_id: '', tags: [], descricao: '' });
  renderSplits();
}

function removeSplit(idx) {
  currentSplits.splice(idx, 1);
  renderSplits();
}

function updateSplitTotals() {
  const total     = parseUserNumber(document.getElementById('trans-valor')?.value || '0') || 0;
  const allocated = currentSplits.reduce((sum, s) => sum + (parseUserNumber(String(s.valor || '0')) || 0), 0);
  const allocEl   = document.getElementById('splits-allocated');
  const totalEl   = document.getElementById('splits-total-val');
  const warnEl    = document.getElementById('splits-warn');
  if (allocEl) allocEl.textContent = formatCurrency(allocated);
  if (totalEl) totalEl.textContent = formatCurrency(total);
  const diff = Math.abs(allocated - total);
  if (warnEl) warnEl.classList.toggle('hidden', diff < 0.01 || currentSplits.length === 0);
}

function bindSplitEvents() {
  const list = document.getElementById('trans-splits-list');
  if (!list) return;

  // Remove split
  list.querySelectorAll('.split-remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => removeSplit(Number(btn.dataset.idx)));
  });

  // Valor change
  list.querySelectorAll('.split-valor').forEach((input, i) => {
    input.addEventListener('input', () => {
      currentSplits[i].valor = parseUserNumber(input.value) || null;
      updateSplitTotals();
    });
  });

  // Split categoria button
  list.querySelectorAll('.split-cat-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.splitIdx);
      if (_splitCatOpenIdx === idx) { _closeSplitCatPicker(); } else { _openSplitCatPicker(idx, ''); }
    });
  });

  // Split subcategoria search
  list.querySelectorAll('.split-sub-search').forEach((inp) => {
    const idx = Number(inp.dataset.splitIdx);
    inp.addEventListener('focus', () => _openSplitSubPicker(idx, inp.value));
    inp.addEventListener('input', () => {
      currentSplits[idx].subcategoria_id = '';
      const row = inp.closest('.trans-split-row');
      const hiddenSub = row?.querySelector('.split-subcategoria');
      if (hiddenSub) hiddenSub.value = '';
      _openSplitSubPicker(idx, inp.value);
    });
    inp.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') { _closeSplitSubPicker(); inp.blur(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const catId = currentSplits[idx]?.categoria_id || '';
        const q = inp.value.trim().toLowerCase();
        const match = cachedSubcategorias.find((s) =>
          (s.categoria_id === catId || !catId) &&
          (s.apelido || s.nome).toLowerCase() === q
        );
        if (match) { _selectSplitSub(idx, match.id); _closeSplitSubPicker(); }
        else if (inp.value.trim() && catId) { await _doCreateSplitSub(idx, inp.value.trim()); }
      }
    });
  });

  // Descrição change
  list.querySelectorAll('.split-descricao').forEach((inp, i) => {
    inp.addEventListener('input', () => { currentSplits[i].descricao = inp.value; });
  });

  // Tags: remove chip
  list.querySelectorAll('.tag-chip-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const si  = Number(btn.dataset.split);
      const ti  = Number(btn.dataset.tidx);
      currentSplits[si].tags.splice(ti, 1);
      renderSplits();
    });
  });

  // Tags: input (Enter / comma to add)
  list.querySelectorAll('.split-tag-input').forEach((input) => {
    const si = Number(input.dataset.splitIdx);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tag = normalizeTag(input.value);
        if (tag && !(currentSplits[si].tags || []).includes(tag)) {
          currentSplits[si].tags = [...(currentSplits[si].tags || []), tag];
          renderSplits();
        } else { input.value = ''; }
      }
      if (e.key === 'Backspace' && !input.value && (currentSplits[si].tags || []).length > 0) {
        currentSplits[si].tags.pop();
        renderSplits();
      }
    });
    input.addEventListener('blur', () => {
      const tag = normalizeTag(input.value);
      if (tag && !(currentSplits[si].tags || []).includes(tag)) {
        currentSplits[si].tags = [...(currentSplits[si].tags || []), tag];
        renderSplits();
      }
    });
  });
}

function setSplitButtonState(active) {
  const toggleBtn = document.getElementById('btn-splits-toggle');
  const hintEl    = document.getElementById('valor-total-hint');
  if (!toggleBtn) return;
  const splitSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="10"/><polyline points="8 7 12 3 16 7"/><line x1="12" y1="21" x2="12" y2="14"/><polyline points="8 17 12 21 16 17"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`;
  if (active) {
    toggleBtn.classList.add('valor-dividir-btn--active');
    toggleBtn.innerHTML = splitSvg;
    if (hintEl) hintEl.classList.remove('hidden');
  } else {
    toggleBtn.classList.remove('valor-dividir-btn--active');
    toggleBtn.innerHTML = splitSvg;
    if (hintEl) hintEl.classList.add('hidden');
  }
}

function initSplitsSection(existingSplits = []) {
  const container = document.getElementById('trans-splits-container');
  if (!container) return;

  if (existingSplits.length > 0) {
    splitEnabled   = true;
    currentSplits  = existingSplits.map((s) => ({
      valor: s.valor,
      categoria_id: s.categoria_id || '',
      subcategoria_id: s.subcategoria_id || '',
      tags: s.tags || [],
      descricao: s.descricao || '',
    }));
    container.classList.remove('hidden');
    setSplitButtonState(true);
    document.getElementById('trans-cat-section')?.classList.add('hidden');
    document.getElementById('trans-bloco-field')?.classList.add('hidden');
    document.getElementById('trans-descricao')?.closest('.field')?.classList.add('hidden');
  } else {
    splitEnabled  = false;
    currentSplits = [];
    container.classList.add('hidden');
    setSplitButtonState(false);
    document.getElementById('trans-cat-section')?.classList.remove('hidden');
    document.getElementById('trans-bloco-field')?.classList.remove('hidden');
    document.getElementById('trans-descricao')?.closest('.field')?.classList.remove('hidden');
  }
  renderSplits();
}

async function saveSplits(transacaoId, userId) {
  // Always delete existing, then insert new ones if any
  await supabase.from('transacao_splits').delete().eq('transacao_id', transacaoId);
  if (!splitEnabled || currentSplits.length === 0) return;
  const rows = currentSplits
    .filter((s) => s.valor != null && s.valor > 0)
    .map((s, i) => ({
      transacao_id:    transacaoId,
      user_id:         userId,
      workspace_id:    requireWorkspaceId(),
      valor:           parseUserNumber(String(s.valor || '0')) || 0,
      categoria_id:    s.categoria_id    || null,
      subcategoria_id: s.subcategoria_id || null,
      tags:            s.tags || [],
      descricao:       s.descricao || null,
      ordem:           i,
    }));
  if (rows.length > 0) {
    const { error } = await supabase.from('transacao_splits').insert(rows);
    if (error) console.error('[saveSplits]', error);
  }
}

// ── Conta Picker ──────────────────────────────────────────
let _transContaPicker = null;

// ── Filter Conta Picker ────────────────────────────────────
let _filterContaPicker = null;

// ── Subcategoria picker ────────────────────────────────────
let _subPickerDropdownEl = null;
let _subPickerIsOpen = false;

// ── Categoria picker ───────────────────────────────────────
let _catPickerDropdownEl = null;
let _catPickerIsOpen = false;
let _catAllowedGroups = null; // null = all, array = filtered grupos (from bloco)

// ── Split cat/sub shared pickers ──────────────────────────
let _splitCatDropdownEl = null;
let _splitCatOpenIdx = -1;
let _splitSubDropdownEl = null;
let _splitSubOpenIdx = -1;

function initSubcategoriaPicker() {
  const inputEl = document.getElementById('trans-subcategoria-search');
  if (!inputEl || inputEl._spBound) return;
  inputEl._spBound = true;

  if (_subPickerDropdownEl) { _subPickerDropdownEl.remove(); }
  _subPickerDropdownEl = document.createElement('div');
  _subPickerDropdownEl.className = 'sub-picker-dropdown hidden';
  document.body.appendChild(_subPickerDropdownEl);

  inputEl.addEventListener('focus', () => _openSubPicker(inputEl.value));
  inputEl.addEventListener('input', () => {
    document.getElementById('trans-subcategoria').value = '';
    _openSubPicker(inputEl.value);
  });
  inputEl.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { _closeSubPicker(); inputEl.blur(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = (inputEl.value || '').trim().toLowerCase();
      const catId = document.getElementById('trans-categoria')?.value || '';
      const match = cachedSubcategorias.find((s) =>
        (s.categoria_id === catId || !catId) &&
        (s.apelido || s.nome).toLowerCase() === q
      );
      if (match) { _selectSub(match.id); _closeSubPicker(); }
      else if (inputEl.value.trim() && catId) { await _doCreateSub(inputEl.value.trim()); }
    }
  });
}

function _openSubPicker(q) {
  _renderSubPickerDropdown(q);
  const inputEl = document.getElementById('trans-subcategoria-search');
  if (!inputEl || !_subPickerDropdownEl) return;
  const rect = inputEl.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const maxH = Math.min(300, Math.max(160, spaceBelow));
  const w = Math.max(rect.width, 280);
  let left = rect.left;
  if (left + w > window.innerWidth - 16) left = Math.max(8, window.innerWidth - w - 16);
  _subPickerDropdownEl.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${left}px;width:${w}px;max-height:${maxH}px;overflow-y:auto;z-index:9999;`;
  _subPickerDropdownEl.classList.remove('hidden');
  _subPickerIsOpen = true;
}

function _closeSubPicker() {
  _subPickerDropdownEl?.classList.add('hidden');
  _subPickerIsOpen = false;
}

function _renderSubPickerDropdown(q = '') {
  if (!_subPickerDropdownEl) return;
  const catId = document.getElementById('trans-categoria')?.value || '';
  const currentId = document.getElementById('trans-subcategoria')?.value || '';
  const cat = catId ? cachedCategorias.find((c) => c.id === catId) : null;
  const cor = cat?.cor || '#9CA3AF';
  const qn = (q || '').toLowerCase();

  let subs = catId
    ? cachedSubcategorias.filter((s) => s.categoria_id === catId && s.status !== 'arquivada')
    : cachedSubcategorias.filter((s) => s.status !== 'arquivada');
  if (qn) subs = subs.filter((s) => (s.apelido || s.nome || '').toLowerCase().includes(qn));

  let html = `<button type="button" class="sub-picker-item sub-picker-clear" data-clear>— Sem vínculo —</button>`;
  for (const s of subs) {
    const sel = s.id === currentId ? ' sub-picker-item--selected' : '';
    html += `<button type="button" class="sub-picker-item${sel}" data-id="${s.id}">
      <span class="sub-picker-dot" style="background:${cor};"></span>
      <span class="sub-picker-name">${escapeHtml(s.apelido || s.nome)}</span>
    </button>`;
  }
  const trimmed = (q || '').trim();
  if (trimmed && catId && !subs.some((s) => (s.apelido || s.nome).toLowerCase() === trimmed.toLowerCase())) {
    html += `<button type="button" class="sub-picker-create" data-create="${escapeHtml(trimmed)}">
      <span class="sub-picker-create-icon">+</span> Nova subcategoria "${escapeHtml(trimmed)}"
    </button>`;
  } else if (!catId) {
    html += '<div class="sub-picker-hint">Selecione uma categoria para filtrar</div>';
  } else if (subs.length === 0 && !trimmed) {
    html += '<div class="sub-picker-hint">Nenhuma subcategoria. Digite para criar.</div>';
  }

  _subPickerDropdownEl.innerHTML = html;
  _subPickerDropdownEl.addEventListener('mousedown', (e) => e.preventDefault(), { once: true });
  _subPickerDropdownEl.addEventListener('click', async (e) => {
    if (e.target.closest('[data-clear]')) { _selectSub(''); _closeSubPicker(); return; }
    const idBtn = e.target.closest('[data-id]');
    if (idBtn) { _selectSub(idBtn.dataset.id); _closeSubPicker(); return; }
    const createBtn = e.target.closest('[data-create]');
    if (createBtn) { await _doCreateSub(createBtn.dataset.create); }
  });
}

function _selectSub(subId) {
  const hidden = document.getElementById('trans-subcategoria');
  const inputEl = document.getElementById('trans-subcategoria-search');
  if (hidden) hidden.value = subId || '';
  const s = subId ? cachedSubcategorias.find((x) => x.id === subId) : null;
  if (inputEl) inputEl.value = s ? (s.apelido || s.nome) : '';
  hidden?.dispatchEvent(new Event('change', { bubbles: true }));
}

async function _doCreateSub(nome) {
  const catId = document.getElementById('trans-categoria')?.value;
  if (!catId) { showToast('Selecione uma categoria antes de criar a subcategoria', 'error'); return; }
  const user = await getCurrentUser();
  if (!user) return;
  const { data, error } = await supabase.from('subcategorias').insert({
    nome: nome.trim(), categoria_id: catId, user_id: user.id, workspace_id: requireWorkspaceId(), created_by: user.id, status: 'ativa',
  }).select().single();
  if (error) { showToast('Erro ao criar subcategoria: ' + error.message, 'error'); return; }
  cachedSubcategorias.push(data);
  cachedSubcategorias.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  _selectSub(data.id);
  _closeSubPicker();
  showToast('Subcategoria criada!', 'success');
}

// ── Categoria picker (main modal) ─────────────────────────
function initCategoriaPicker() {
  const btn = document.getElementById('trans-cat-btn');
  if (!btn || btn._cpBound) return;
  btn._cpBound = true;

  if (_catPickerDropdownEl) { _catPickerDropdownEl.remove(); }
  _catPickerDropdownEl = document.createElement('div');
  _catPickerDropdownEl.className = 'cat-picker-dropdown hidden';
  document.body.appendChild(_catPickerDropdownEl);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    _catPickerIsOpen ? _closeCatPicker() : _openCatPicker('');
  });
  document.addEventListener('mousedown', (e) => {
    if (_catPickerIsOpen && !_catPickerDropdownEl?.contains(e.target) && !btn.contains(e.target)) {
      _closeCatPicker();
    }
  });
}

function _openCatPicker(q) {
  _renderCatPickerDropdown(q);
  const btn = document.getElementById('trans-cat-btn');
  if (!btn || !_catPickerDropdownEl) return;
  const rect = btn.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const maxH = Math.min(320, Math.max(160, spaceBelow));
  const w = Math.max(rect.width, 260);
  let left = rect.left;
  if (left + w > window.innerWidth - 16) left = Math.max(8, window.innerWidth - w - 16);
  _catPickerDropdownEl.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${left}px;width:${w}px;max-height:${maxH}px;overflow-y:auto;z-index:9999;`;
  _catPickerDropdownEl.classList.remove('hidden');
  _catPickerIsOpen = true;
  document.getElementById('trans-cat-btn')?.classList.add('is-open');
  _catPickerDropdownEl.querySelector('.cat-picker-search')?.focus();
}

function _closeCatPicker() {
  _catPickerDropdownEl?.classList.add('hidden');
  _catPickerIsOpen = false;
  document.getElementById('trans-cat-btn')?.classList.remove('is-open');
}

function _renderCatPickerDropdown(q = '') {
  if (!_catPickerDropdownEl) return;
  const currentId = document.getElementById('trans-categoria')?.value || '';
  const qn = (q || '').toLowerCase();
  let cats = _catAllowedGroups
    ? cachedCategorias.filter((c) => _catAllowedGroups.includes(c.grupo))
    : cachedCategorias;
  if (qn) cats = cats.filter((c) => (c.nome || '').toLowerCase().includes(qn));

  let html = `<div class="cat-picker-search-wrap"><input class="cat-picker-search" placeholder="Buscar categoria…" value="${escapeHtml(q)}" autocomplete="off"></div>`;
  const blankSel = !currentId ? ' cat-picker-item--selected' : '';
  html += `<button type="button" class="cat-picker-item cat-picker-blank${blankSel}" data-id="">— Todas as categorias —</button>`;
  for (const c of cats) {
    const sel = c.id === currentId ? ' cat-picker-item--selected' : '';
    html += `<button type="button" class="cat-picker-item${sel}" data-id="${c.id}">
      <span class="cat-picker-dot-item" style="background:${c.cor || '#9CA3AF'};"></span>
      <span>${escapeHtml(c.nome)}</span>
    </button>`;
  }
  if (!cats.length && qn) html += '<div class="cat-picker-empty">Nenhuma categoria encontrada</div>';

  _catPickerDropdownEl.innerHTML = html;
  _catPickerDropdownEl.querySelector('.cat-picker-search')?.addEventListener('input', (e) => _renderCatPickerDropdown(e.target.value));
  _catPickerDropdownEl.querySelectorAll('.cat-picker-item').forEach((itemBtn) => {
    itemBtn.addEventListener('click', () => {
      _selectCat(itemBtn.dataset.id);
      _closeCatPicker();
    });
  });
}

function _selectCat(catId) {
  const hidden = document.getElementById('trans-categoria');
  const nameEl = document.getElementById('trans-cat-name');
  const dotEl  = document.getElementById('trans-cat-dot');
  if (hidden) hidden.value = catId || '';
  const cat = catId ? cachedCategorias.find((c) => c.id === catId) : null;
  if (nameEl) nameEl.textContent = cat ? cat.nome : '— Todas as categorias —';
  if (dotEl) {
    if (cat) {
      dotEl.style.background = cat.cor || '#9CA3AF';
      dotEl.classList.remove('hidden');
    } else {
      dotEl.classList.add('hidden');
    }
  }
  hidden?.dispatchEvent(new Event('change', { bubbles: true }));
}

// ── Split Categoria shared picker ─────────────────────────
function _initSplitCatDropdown() {
  if (_splitCatDropdownEl) return;
  _splitCatDropdownEl = document.createElement('div');
  _splitCatDropdownEl.className = 'cat-picker-dropdown hidden';
  document.body.appendChild(_splitCatDropdownEl);
  document.addEventListener('mousedown', (e) => {
    if (_splitCatOpenIdx < 0) return;
    const btn = document.querySelector(`.split-cat-btn[data-split-idx="${_splitCatOpenIdx}"]`);
    if (!_splitCatDropdownEl.contains(e.target) && btn && !btn.contains(e.target)) {
      _closeSplitCatPicker();
    }
  });
}

function _openSplitCatPicker(idx, q = '') {
  _initSplitCatDropdown();
  _splitCatOpenIdx = idx;
  _renderSplitCatDropdown(idx, q);
  const btn = document.querySelector(`.split-cat-btn[data-split-idx="${idx}"]`);
  if (!btn || !_splitCatDropdownEl) return;
  const rect = btn.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const maxH = Math.min(320, Math.max(160, spaceBelow));
  const w = Math.max(rect.width, 220);
  let left = rect.left;
  if (left + w > window.innerWidth - 16) left = Math.max(8, window.innerWidth - w - 16);
  _splitCatDropdownEl.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${left}px;width:${w}px;max-height:${maxH}px;overflow-y:auto;z-index:9999;`;
  _splitCatDropdownEl.classList.remove('hidden');
}

function _closeSplitCatPicker() {
  _splitCatDropdownEl?.classList.add('hidden');
  _splitCatOpenIdx = -1;
}

function _renderSplitCatDropdown(idx, q = '') {
  if (!_splitCatDropdownEl) return;
  const currentCatId = currentSplits[idx]?.categoria_id || '';
  const qn = (q || '').toLowerCase();
  let cats = cachedCategorias;
  if (qn) cats = cats.filter((c) => (c.nome || '').toLowerCase().includes(qn));

  let html = `<div class="cat-picker-search-wrap"><input class="cat-picker-search" placeholder="Buscar categoria…" value="${escapeHtml(q)}" autocomplete="off"></div>`;
  const blankSel = !currentCatId ? ' cat-picker-item--selected' : '';
  html += `<button type="button" class="cat-picker-item cat-picker-blank${blankSel}" data-id="">— Categoria —</button>`;
  for (const c of cats) {
    const sel = c.id === currentCatId ? ' cat-picker-item--selected' : '';
    html += `<button type="button" class="cat-picker-item${sel}" data-id="${c.id}">
      <span class="cat-picker-dot-item" style="background:${c.cor || '#9CA3AF'};"></span>
      <span>${escapeHtml(c.nome)}</span>
    </button>`;
  }
  if (!cats.length && qn) html += '<div class="cat-picker-empty">Nenhuma categoria encontrada</div>';

  _splitCatDropdownEl.innerHTML = html;
  _splitCatDropdownEl.querySelector('.cat-picker-search')?.addEventListener('input', (e) => _renderSplitCatDropdown(idx, e.target.value));
  _splitCatDropdownEl.querySelectorAll('.cat-picker-item').forEach((itemBtn) => {
    itemBtn.addEventListener('click', () => {
      _selectSplitCat(idx, itemBtn.dataset.id);
      _closeSplitCatPicker();
    });
  });
}

function _selectSplitCat(idx, catId) {
  if (!currentSplits[idx]) return;
  currentSplits[idx].categoria_id    = catId || '';
  currentSplits[idx].subcategoria_id = '';
  // Update hidden input
  const row = document.querySelector(`.trans-split-row[data-idx="${idx}"]`);
  if (!row) { renderSplits(); return; }
  const hiddenCat = row.querySelector('.split-categoria');
  if (hiddenCat) hiddenCat.value = catId || '';
  const cat = catId ? cachedCategorias.find((c) => c.id === catId) : null;
  const btn = row.querySelector('.split-cat-btn');
  if (btn) {
    btn.innerHTML = `${cat ? `<span class="split-cat-dot" style="background:${cat.cor || '#9CA3AF'};"></span>` : `<span class="split-cat-dot split-cat-dot--empty"></span>`}<span class="split-cat-name">${cat ? escapeHtml(cat.nome) : '— Categoria —'}</span><svg class="split-cat-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
  }
  // Clear sub
  const hiddenSub = row.querySelector('.split-subcategoria');
  if (hiddenSub) hiddenSub.value = '';
  const subSearch = row.querySelector('.split-sub-search');
  if (subSearch) subSearch.value = '';
  if (_splitSubOpenIdx === idx) _renderSplitSubDropdown(idx, '');
}

// ── Split Subcategoria shared picker ──────────────────────
function _initSplitSubDropdown() {
  if (_splitSubDropdownEl) return;
  _splitSubDropdownEl = document.createElement('div');
  _splitSubDropdownEl.className = 'sub-picker-dropdown hidden';
  document.body.appendChild(_splitSubDropdownEl);
  document.addEventListener('mousedown', (e) => {
    if (_splitSubOpenIdx < 0) return;
    const inp = document.querySelector(`.split-sub-search[data-split-idx="${_splitSubOpenIdx}"]`);
    if (!_splitSubDropdownEl.contains(e.target) && inp && !inp.contains(e.target)) {
      _closeSplitSubPicker();
    }
  });
}

function _openSplitSubPicker(idx, q = '') {
  _initSplitSubDropdown();
  _splitSubOpenIdx = idx;
  _renderSplitSubDropdown(idx, q);
  const inp = document.querySelector(`.split-sub-search[data-split-idx="${idx}"]`);
  if (!inp || !_splitSubDropdownEl) return;
  const rect = inp.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const maxH = Math.min(300, Math.max(160, spaceBelow));
  const w = Math.max(rect.width, 220);
  let left = rect.left;
  if (left + w > window.innerWidth - 16) left = Math.max(8, window.innerWidth - w - 16);
  _splitSubDropdownEl.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${left}px;width:${w}px;max-height:${maxH}px;overflow-y:auto;z-index:9999;`;
  _splitSubDropdownEl.classList.remove('hidden');
}

function _closeSplitSubPicker() {
  _splitSubDropdownEl?.classList.add('hidden');
  _splitSubOpenIdx = -1;
}

function _renderSplitSubDropdown(idx, q = '') {
  if (!_splitSubDropdownEl) return;
  const catId     = currentSplits[idx]?.categoria_id || '';
  const currentId = currentSplits[idx]?.subcategoria_id || '';
  const cat       = catId ? cachedCategorias.find((c) => c.id === catId) : null;
  const cor       = cat?.cor || '#9CA3AF';
  const qn        = (q || '').toLowerCase();

  let subs = catId
    ? cachedSubcategorias.filter((s) => s.categoria_id === catId && s.status !== 'arquivada')
    : cachedSubcategorias.filter((s) => s.status !== 'arquivada');
  if (qn) subs = subs.filter((s) => (s.apelido || s.nome || '').toLowerCase().includes(qn));

  let html = `<button type="button" class="sub-picker-item sub-picker-clear" data-clear>— Sem vínculo —</button>`;
  for (const s of subs) {
    const sel = s.id === currentId ? ' sub-picker-item--selected' : '';
    html += `<button type="button" class="sub-picker-item${sel}" data-id="${s.id}">
      <span class="sub-picker-dot" style="background:${cor};"></span>
      <span class="sub-picker-name">${escapeHtml(s.apelido || s.nome)}</span>
    </button>`;
  }
  const trimmed = (q || '').trim();
  if (trimmed && catId && !subs.some((s) => (s.apelido || s.nome).toLowerCase() === trimmed.toLowerCase())) {
    html += `<button type="button" class="sub-picker-create" data-create="${escapeHtml(trimmed)}">
      <span class="sub-picker-create-icon">+</span> Nova subcategoria "${escapeHtml(trimmed)}"
    </button>`;
  } else if (!catId) {
    html += '<div class="sub-picker-hint">Selecione uma categoria primeiro</div>';
  } else if (subs.length === 0 && !trimmed) {
    html += '<div class="sub-picker-hint">Nenhuma subcategoria. Digite para criar.</div>';
  }

  _splitSubDropdownEl.innerHTML = html;
  _splitSubDropdownEl.addEventListener('mousedown', (e) => e.preventDefault(), { once: true });
  _splitSubDropdownEl.addEventListener('click', async (e) => {
    if (e.target.closest('[data-clear]')) { _selectSplitSub(idx, ''); _closeSplitSubPicker(); return; }
    const idBtn = e.target.closest('[data-id]');
    if (idBtn) { _selectSplitSub(idx, idBtn.dataset.id); _closeSplitSubPicker(); return; }
    const createBtn = e.target.closest('[data-create]');
    if (createBtn) { await _doCreateSplitSub(idx, createBtn.dataset.create); }
  });
}

function _selectSplitSub(idx, subId) {
  if (!currentSplits[idx]) return;
  currentSplits[idx].subcategoria_id = subId || '';
  const row = document.querySelector(`.trans-split-row[data-idx="${idx}"]`);
  if (!row) return;
  const hiddenSub = row.querySelector('.split-subcategoria');
  if (hiddenSub) hiddenSub.value = subId || '';
  const s = subId ? cachedSubcategorias.find((x) => x.id === subId) : null;
  const inp = row.querySelector('.split-sub-search');
  if (inp) inp.value = s ? (s.apelido || s.nome) : '';
}

async function _doCreateSplitSub(idx, nome) {
  const catId = currentSplits[idx]?.categoria_id;
  if (!catId) { showToast('Selecione uma categoria antes de criar a subcategoria', 'error'); return; }
  const user = await getCurrentUser();
  if (!user) return;
  const { data, error } = await supabase.from('subcategorias').insert({
    nome: nome.trim(), categoria_id: catId, user_id: user.id, workspace_id: requireWorkspaceId(), created_by: user.id, status: 'ativa',
  }).select().single();
  if (error) { showToast('Erro ao criar subcategoria: ' + error.message, 'error'); return; }
  cachedSubcategorias.push(data);
  cachedSubcategorias.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  _selectSplitSub(idx, data.id);
  _closeSplitSubPicker();
  showToast('Subcategoria criada!', 'success');
}

// Estado do modal de sync
let syncModalState = null;

// SUPER_BLOCOS + BLOCO_GRUPOS importados de lib/super-blocos.js (fonte única,
// compartilhada com dashboard, orcamento, configuracoes, compromissos).

function getBlocoFromSub(sub) {
  if (!sub) return null;
  const cat = cachedCategorias.find((c) => c.id === sub.categoria_id);
  if (!cat) return null;
  // Helper canônico já faz fallback pra custo_vida. Mappeia accent → color
  // pra manter contrato local (UI usa .color).
  const bloco = getBlocoByGrupo(cat.grupo);
  return { id: bloco.id, label: bloco.label, color: bloco.accent };
}

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('transacoes');
  initTutorial('transacoes');
  await loadStrings();
  applyTranslationsToDom();
  initFilters();
  bindEvents();
  populateMoedaSelect();
  autoAttachDecimalInputs();
  const membersP = listMembers().catch(() => []);
  await loadAll();
  await membersP;
  render();
  applyRoleGating();
  // Migração retroativa de descrições de adiantamentos (one-shot, cache em localStorage)
  import('../lib/adiantamentos.js').then((m) => m.regenerarDescricoesAntigas()).catch(() => {});
});

/** Esconde botões de criar/editar/deletar/reconciliar pra viewer. */
function applyRoleGating() {
  applyBodyRoleGating({
    writeIds: ['btn-nova-transacao', 'btn-bulk-delete', 'btn-deletar-transacao', 'btn-salvar-transacao'],
  });
}

// -----------------------------
// Loaders
// -----------------------------
async function loadAll() {
  document.getElementById('trans-loading').classList.remove('hidden');

  // On-demand: fecha faturas vencidas + cria pagamentos automáticos (Fase 4)
  // Roda em background — não bloqueia o load
  checkAndCloseFaturas()
    .then((n) => { if (n > 0) showToast(`${n} fatura${n > 1 ? 's' : ''} de cartão fechada${n > 1 ? 's' : ''} — confira em Pagamentos`, 'success', 5000); })
    .catch((e) => console.warn('[checkAndCloseFaturas]', e));

  const [transRes, contRes, subRes, catRes, contatosRes, divRes, splitsRes] = await Promise.all([
    supabase
      .from('transacoes')
      .select('*, pagamento:pagamentos(id, data_vencimento, status, subcategoria_id)')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('contas')
      .select('id, nome, apelido, tipo, icone_cor, moeda, status, fec_fatura, vencimento')
      .neq('status', 'arquivada')
      .order('nome'),
    supabase
      .from('subcategorias')
      .select('id, nome, apelido, categoria_id, descricao, contato_id, status, is_parcial, tipo, conta_destino_id')
      .neq('status', 'arquivada')
      .order('nome'),
    supabase
      .from('categorias')
      .select('id, nome, grupo, cor')
      .order('nome'),
    supabase
      .from('contatos')
      .select('id, nome, tipo, status')
      .neq('status', 'arquivado')
      .order('nome'),
    supabase
      .from('dividas')
      .select('id, nome, status'),
    supabase
      .from('transacao_splits')
      .select('*')
      .order('transacao_id')
      .order('ordem'),
  ]);

  if (transRes.error) {
    showToast(`${t('transacoes.toast.erro_carregar', 'Erro ao carregar transações')}: ${transRes.error.message}`, 'error', 8000);
    document.getElementById('trans-loading').classList.add('hidden');
    return;
  }

  cachedTransacoes    = transRes.data || [];
  cachedContas        = contRes.data  || [];
  cachedSubcategorias = filterVisibleSubs(subRes.data);
  cachedCategorias    = catRes.data   || [];
  // Dívidas (silencioso se erro — campo divida_id pode não existir antes da migration 0063)
  if (divRes && !divRes.error) cachedDividas = divRes.data || [];
  else cachedDividas = [];

  // Splits (silencioso se erro — migration 0078 pode não ter rodado ainda)
  if (splitsRes && !splitsRes.error) {
    cachedSplits = splitsRes.data || [];
    splitsByTransId = new Map();
    for (const s of cachedSplits) {
      const arr = splitsByTransId.get(s.transacao_id) || [];
      arr.push(s);
      splitsByTransId.set(s.transacao_id, arr);
    }
  } else {
    cachedSplits = [];
    splitsByTransId = new Map();
  }

  if (contatosRes.error) {
    if (!/relation.*contatos|column.*contatos/i.test(contatosRes.error.message)) {
      console.warn('[loadContatos]', contatosRes.error);
    }
    cachedContatos = [];
  } else {
    cachedContatos = contatosRes.data || [];
  }

  // Regras de auto-reconciliação (Fase 3) — silenciosamente ignora se a migration 0024 não rodou
  cachedRules = await loadRules();

  populateContaSelects();
  populateSubcategoriaSelect();
  initContatoPickerOnce();

  document.getElementById('trans-loading').classList.add('hidden');
}

// -----------------------------
// Selects population
// -----------------------------
function populateMoedaSelect(selectedCode = 'BRL') {
  const sel = document.getElementById('trans-moeda');
  if (!sel) return;
  sel.innerHTML = renderMoedaOptions(selectedCode);
  document.getElementById('trans-valor').placeholder = moedaInputPlaceholder(selectedCode);
}

function populateContaSelects() {
  // filter-conta is now a visual picker (hidden input) — init once, no innerHTML needed
  if (!_filterContaPicker) {
    const PIGGY_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.6.5 2.8 1.5 3.8L4 18h3l1-1.7c1 .4 2 .7 3 .7s2-.3 3-.7L15 18h3l-1.5-2.2c.7-.7 1.2-1.5 1.5-2.3 1 0 2-1 2-2v-2c0-1-1-2-2-2 0-1-1-2.5-1-2.5z"/><circle cx="16" cy="10" r="0.5" fill="currentColor"/></svg>`;
    _filterContaPicker = createContaPicker({
      triggerBtnId:  'filter-conta-btn',
      hiddenInputId: 'filter-conta',
      avatarWrapId:  'filter-conta-avatar-wrap',
      nameElId:      'filter-conta-name',
      getContas:     () => cachedContas,
      getExtraGroups: () => {
        const caixinhas = cachedSubcategorias.filter((s) => s.tipo === 'Caixinha' && s.status !== 'arquivada');
        if (!caixinhas.length) return [];
        return [{
          label: 'Caixinha',
          items: caixinhas.map((cx) => ({
            id: `cx:${cx.id}`,
            display: cx.apelido || cx.nome,
            iconHtml: PIGGY_SVG,
            iconColor: '#F59E0B',
          })),
        }];
      },
      placeholder:   'Todas',
      allowBlank:    true,
      blankLabel:    'Todas as contas',
      avatarSize:    'xs',
      hideAvatarWhenBlank: true,
      onChange: (id) => {
        filterConta = id || '';
        render();
      },
    });
    _filterContaPicker.init();
  }
  document.getElementById('trans-conta-destino').innerHTML =
    renderContaOptions(cachedContas, '', { blankLabel: 'Selecione…' });
}

let contatoPicker = null;

function initContatoPickerOnce() {
  if (contatoPicker) return;
  const rootEl = document.querySelector('[data-picker="trans-contato"]');
  if (!rootEl) return;
  contatoPicker = initContatoPicker({
    rootEl,
    contatos: () => cachedContatos,
    defaultTipo: 'ambos',
  });
}

function populateSubcategoriaSelect() {
  filterSubForModal('', '');
}

// Preenche o picker de categoria filtrado pelo bloco selecionado.
function populateCategoriaForModal(blocoId, currentCatId = '') {
  const grupos = BLOCO_GRUPOS[blocoId] || null;
  _catAllowedGroups = grupos;
  _selectCat(currentCatId || '');
  if (_catPickerIsOpen) _renderCatPickerDropdown('');
}

// Preenche/filtra o picker de subcategoria. Mantém assinatura antiga para compatibilidade.
function filterSubForModal(categoriaId, currentSubId = '') {
  if (currentSubId) {
    _selectSub(currentSubId);
  } else {
    _selectSub('');
    const searchEl = document.getElementById('trans-subcategoria-search');
    if (searchEl) searchEl.value = '';
  }
}

// -----------------------------
// Filtros
// -----------------------------
function initFilters() {
  const colVisToolbar = document.getElementById('trans-col-vis');
  if (colVisToolbar) {
    initColVisibility({
      storageKey: 'transacoes',
      tableClass: 'trans-table',
      columns: TRANS_COLUMNS,
      toolbarEl: colVisToolbar,
    });
  }
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();

  const mesMonthSel = document.getElementById('filter-mes-month');
  MONTH_LABELS_LONG.forEach((label, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1;
    opt.textContent = label;
    if (i === m) opt.selected = true;
    mesMonthSel.appendChild(opt);
  });

  const mesYearSel = document.getElementById('filter-mes-year');
  for (let yr = y; yr >= y - 6; yr--) {
    const opt = document.createElement('option');
    opt.value = yr;
    opt.textContent = yr;
    if (yr === y) opt.selected = true;
    mesYearSel.appendChild(opt);
  }

  const anoSel = document.getElementById('filter-ano');
  for (let yr = y; yr >= y - 6; yr--) {
    const opt = document.createElement('option');
    opt.value = yr;
    opt.textContent = yr;
    anoSel.appendChild(opt);
  }

  const first = new Date(y, m, 1);
  const last  = new Date(y, m + 1, 0);
  document.getElementById('filter-dt-inicio').value = toISODate(first);
  document.getElementById('filter-dt-fim').value    = toISODate(last);

  updateFilterInputVisibility();
  const range = getFilterRange();
  if (range) { filterStart = range.start || ''; filterEnd = range.end || ''; }
}

function updateFilterInputVisibility() {
  document.getElementById('trans-input-mes').classList.toggle('hidden', filterMode !== 'mes');
  document.getElementById('trans-input-ano').classList.toggle('hidden', filterMode !== 'ano');
  document.getElementById('trans-input-periodo').classList.toggle('hidden', filterMode !== 'periodo');
  document.getElementById('btn-trans-aplicar').classList.toggle('hidden', filterMode !== 'periodo');
}

function getFilterRange() {
  if (filterMode === 'mes') {
    const mo = Number(document.getElementById('filter-mes-month').value);
    const yr = Number(document.getElementById('filter-mes-year').value);
    return { start: toISODate(new Date(yr, mo - 1, 1)), end: toISODate(new Date(yr, mo, 0)) };
  }
  if (filterMode === 'ano') {
    const yr = Number(document.getElementById('filter-ano').value);
    return { start: `${yr}-01-01`, end: `${yr}-12-31` };
  }
  if (filterMode === 'periodo') {
    const start = document.getElementById('filter-dt-inicio').value;
    const end   = document.getElementById('filter-dt-fim').value;
    if (!start || !end) { showToast(t('transacoes.validacao.datas_obrigatorias', 'Informe as duas datas do período'), 'warning'); return null; }
    if (start > end)    { showToast(t('transacoes.validacao.datas_ordem', 'Data de início deve ser anterior ao fim'), 'warning'); return null; }
    return { start, end };
  }
  return { start: null, end: null };
}

function applyPeriodAndRender() {
  const range = getFilterRange();
  if (!range) return;
  filterStart = range.start || '';
  filterEnd   = range.end   || '';
  render();
}


// ── Seleção de linhas ──────────────────────────────────────────
function updateSelectionBar() {
  const bar  = document.getElementById('trans-selection-bar');
  const info = document.getElementById('trans-selection-count');
  const btn  = document.getElementById('btn-bulk-delete');
  if (!bar) return;
  const n = selectedIds.size;
  bar.classList.toggle('hidden', n === 0);
  if (info) info.textContent = `${n} selecionada${n !== 1 ? 's' : ''}`;
  if (btn) {
    const label = btn.querySelector('.bulk-delete-label');
    if (label) label.textContent = `Excluir ${n}`;
  }

  const allCheckEl = document.getElementById('trans-select-all');
  if (allCheckEl) {
    const all = [...document.querySelectorAll('.trans-row-check')].map((c) => c.dataset.id);
    allCheckEl.checked       = all.length > 0 && all.every((id) => selectedIds.has(id));
    allCheckEl.indeterminate = selectedIds.size > 0 && !allCheckEl.checked;
  }
}

async function execBulkDelete() {
  const ids = [...selectedIds];
  if (!ids.length) return;

  // Proteção: identifica transações que vieram do banco e estão vinculadas a pagamentos
  const lockedIds = ids.filter((id) => {
    const tr = cachedTransacoes.find((x) => x.id === id);
    return tr && tr.pagamento_id && tr.reconciliacao_status && tr.reconciliacao_status !== 'manual';
  });
  if (lockedIds.length === ids.length) {
    showToast(
      `Nenhuma das ${ids.length} transações selecionadas pode ser excluída — todas vieram do banco e estão vinculadas a pagamentos.`,
      'error', 10000
    );
    return;
  }
  if (lockedIds.length > 0) {
    showToast(
      `${lockedIds.length} transação(ões) ignorada(s) por estarem vinculadas a pagamentos do banco. Excluindo o restante.`,
      'warning', 8000
    );
  }
  const deletableIds = ids.filter((id) => !lockedIds.includes(id));
  const n = deletableIds.length;
  if (n === 0) return;
  if (!await showConfirm(`Excluir ${n} transaç${n > 1 ? 'ões' : 'ão'}?\n\nEsta ação não pode ser desfeita.`)) return;

  const parIds = deletableIds.flatMap((id) => {
    const par = cachedTransacoes.find((t) => t.id === id)?.transferencia_par_id;
    return par ? [par] : [];
  });
  const allIds = [...new Set([...deletableIds, ...parIds])];

  // Defense in depth: filtra por workspace_id explícito
  const { error } = await supabase.from('transacoes').delete().in('id', allIds).eq('workspace_id', requireWorkspaceId());
  if (error) { showToast(`${t('transacoes.toast.erro_excluir', 'Erro ao excluir')}: ${error.message}`, 'error', 8000); return; }

  allIds.forEach((id) => {
    const idx = cachedTransacoes.findIndex((t) => t.id === id);
    if (idx !== -1) cachedTransacoes.splice(idx, 1);
  });
  selectedIds.clear();
  showToast(`${n} transaç${n > 1 ? 'ões excluídas' : 'ão excluída'}`, 'success');
  render();
}

// -----------------------------
// Render
// -----------------------------
let shellRendered = false;

function render() {
  const filtered = applyFilters(cachedTransacoes);
  renderWidgets(filtered);

  if (filtered.length === 0 && cachedTransacoes.length === 0) {
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('trans-container').classList.add('hidden');
    return;
  }
  document.getElementById('empty-state').classList.add('hidden');

  const container = document.getElementById('trans-container');
  container.classList.remove('hidden');

  if (!shellRendered) {
    container.innerHTML = renderTableShell();
    shellRendered = true;
  }

  // Quando há filtro por conta/caixinha, mostra do mais antigo pro mais novo
  // para que o saldo corrente cresça/decresça naturalmente de cima pra baixo.
  const display = filterConta ? [...filtered].reverse() : filtered;

  const dataTbody = document.getElementById('trans-data-tbody');
  dataTbody.innerHTML = renderDataRows(display);
  bindRowEvents();
  updateSelectionBar();

  // Saldo: exibe quando uma única conta ou caixinha está filtrada
  const table = document.querySelector('.trans-table');
  if (table) table.classList.toggle('saldo-hidden', !filterConta);
}

function applyFilters(items) {
  const buscaNorm = filterBusca.trim().toLowerCase();

  return items.filter((t) => {
    const status = t.reconciliacao_status || 'manual';

    // Aba Importações: só mostra transações de extrato bancário (importado ou reconciliado)
    if (viewTab === 'importacoes') {
      if (status !== 'importado' && status !== 'reconciliado') return false;
      if (importSubFilter === 'pendentes'  && status !== 'importado')    return false;
      if (importSubFilter === 'confirmadas' && status !== 'reconciliado') return false;
      // Período aplica normalmente no modo Importações
      if (filterStart && t.data < filterStart) return false;
      if (filterEnd   && t.data > filterEnd)   return false;
    } else {
      // Aba Transações: EXCLUI 'importado' (essas só aparecem na aba Importações)
      if (status === 'importado') return false;
      // Filtro legado de pendentes (caso ainda esteja em uso)
      if (filterReconciliacao) {
        if (status !== filterReconciliacao) return false;
      } else {
        if (filterStart && t.data < filterStart) return false;
        if (filterEnd   && t.data > filterEnd)   return false;
      }
    }
    if (filterConta) {
      if (filterConta.startsWith('cx:')) {
        // Filtro por Caixinha: a transação precisa vir de um pagamento de uma sub Caixinha
        const cxId = filterConta.slice(3);
        let pagSubId = t.pagamento?.subcategoria_id;
        // Caso seja entrada de transferência (lado par), buscar pagamento via par
        if (!pagSubId && t.transferencia_par_id) {
          const par = cachedTransacoes.find((x) => x.id === t.transferencia_par_id);
          pagSubId = par?.pagamento?.subcategoria_id;
        }
        if (pagSubId !== cxId) return false;
        // Mostra só a perna cuja conta_id = conta reserva da caixinha (perspectiva da caixinha).
        // Caixinha não é conta — cada operação é UMA linha do ponto de vista dela:
        //   abastecimento → ENTRADA (perna na reserva é a creditadora)
        //   resgate       → SAÍDA   (perna na reserva é a debitadora)
        const cx = cachedSubcategorias.find((s) => s.id === cxId);
        if (cx?.conta_destino_id && t.conta_id !== cx.conta_destino_id) return false;
      } else if (t.conta_id !== filterConta) {
        return false;
      }
    }
    if (filterTipo  && t.tipo     !== filterTipo)  return false;
    if (buscaNorm) {
      const contato   = t.contato_id ? cachedContatos.find((c) => c.id === t.contato_id) : null;
      const conta     = cachedContas.find((c) => c.id === t.conta_id);
      const sub       = cachedSubcategorias.find((s) => s.id === t.subcategoria_id);
      const cat       = sub ? cachedCategorias.find((c) => c.id === sub.categoria_id) : null;
      const blocoLabel = getBlocoFromSub(sub)?.label || '';
      // tags: include both "tag" and "#tag" forms so user can search with or without #
      const tagsStr   = (t.tags || []).map((tag) => `${tag} #${tag}`).join(' ');
      // also search inside splits: their categoria, subcategoria and tags
      const splitsStr = (splitsByTransId.get(t.id) || []).map((s) => {
        const sSub = cachedSubcategorias.find((x) => x.id === s.subcategoria_id);
        const sCat = sSub ? cachedCategorias.find((x) => x.id === sSub.categoria_id) : null;
        const sBlocoLabel = getBlocoFromSub(sSub)?.label || '';
        const sTags = (s.tags || []).map((tag) => `${tag} #${tag}`).join(' ');
        return `${sCat?.nome || ''} ${sSub?.nome || ''} ${sSub?.apelido || ''} ${sBlocoLabel} ${sTags} ${s.descricao || ''}`;
      }).join(' ');
      const haystack = [
        t.descricao || '',
        t.estabelecimento || '',
        t.banco_desc || '',
        contato?.nome || '',
        conta?.nome || '',
        conta?.apelido || '',
        cat?.nome || '',
        sub?.nome || '',
        sub?.apelido || '',
        blocoLabel,
        t.tipo || '',
        String(t.valor || ''),
        tagsStr,
        splitsStr,
      ].join(' ').toLowerCase();
      if (!haystack.includes(buscaNorm)) return false;
    }
    if (activeTagFilters.size > 0) {
      const tTags = t.tags || [];
      if (![...activeTagFilters].every((ft) => tTags.includes(ft))) return false;
    }
    return true;
  });
}

function renderWidgets(items) {
  const recItems = items.filter((t) => t.tipo === 'Receita');
  const desItems = items.filter((t) => t.tipo === 'Despesa');
  const receitas = recItems.reduce((s, t) => s + Number(t.valor || 0), 0);
  const despesas = desItems.reduce((s, t) => s + Number(t.valor || 0), 0);
  const saldo    = receitas - despesas;

  document.getElementById('kpi-receitas-value').innerHTML = formatCurrencyHTML(receitas);
  document.getElementById('kpi-despesas-value').innerHTML = formatCurrencyHTML(despesas);
  document.getElementById('kpi-saldo-value').innerHTML    = formatCurrencyHTML(saldo);

  document.getElementById('kpi-receitas-sub').textContent = `${recItems.length} ${recItems.length === 1 ? 'transação' : 'transações'}`;
  document.getElementById('kpi-despesas-sub').textContent = `${desItems.length} ${desItems.length === 1 ? 'transação' : 'transações'}`;
  document.getElementById('kpi-saldo-sub').textContent    = saldo >= 0 ? 'positivo' : 'negativo';

  const saldoEl = document.getElementById('kpi-saldo-value');
  saldoEl.style.color = saldo >= 0 ? 'var(--color-success)' : 'var(--color-danger)';

  const total = items.length;
  document.getElementById('kpi-count-value').textContent = total;
  document.getElementById('kpi-count-sub').textContent   = `${recItems.length} rec · ${desItems.length} desp`;

  // Atualiza badge de pendentes no botão de filtro
  const pendentes = cachedTransacoes.filter((t) => (t.reconciliacao_status || 'manual') === 'importado');
  const countEl   = document.getElementById('filter-pendentes-count');
  const filterBtn = document.getElementById('filter-pendentes');
  if (countEl) {
    countEl.textContent = pendentes.length;
    countEl.classList.toggle('hidden', pendentes.length === 0);
  }
  // Atualiza badge da aba Importações
  const tabCountEl = document.getElementById('trans-tab-import-count');
  if (tabCountEl) {
    tabCountEl.textContent = pendentes.length;
    tabCountEl.classList.toggle('hidden', pendentes.length === 0);
  }
  if (filterBtn) {
    filterBtn.classList.toggle('has-pending', pendentes.length > 0);
  }
}

function renderTableShell() {
  return `
    <table class="trans-table">
      <thead>
        <tr>
          <th class="trans-th-data">Data</th>
          <th class="trans-th-planejada" data-col="planejada" title="Data planejada do compromisso vinculado. 'Extrato' = importado sem compromisso.">Planejada</th>
          <th class="trans-th-id" data-col="id" title="Identificador único fornecido pelo banco no extrato">Identificador</th>
          <th class="trans-th-banco" data-col="banco">Descrição</th>
          <th class="trans-th-contato" data-col="contato">Cliente / Fornecedor</th>
          <th class="trans-th-bloco" data-col="bloco">Bloco</th>
          <th class="trans-th-categoria" data-col="categoria">Categoria</th>
          <th class="trans-th-subcategoria" data-col="subcategoria">Subcategoria</th>
          <th class="trans-th-conta" data-col="conta">Conta</th>
          <th class="trans-th-valor" data-col="valor">Valor</th>
          <th class="trans-th-saldo" data-col="saldo">Saldo</th>
          <th class="trans-th-actions" title="Selecionar tudo">
            <input type="checkbox" id="trans-select-all" title="Selecionar / desmarcar tudo">
          </th>
        </tr>
      </thead>
      <tbody id="trans-data-tbody"></tbody>
    </table>`;
}

function renderDataRows(items) {
  if (items.length === 0) {
    return `<tr class="trans-empty-row"><td colspan="12">Nenhuma transação encontrada com os filtros atuais.</td></tr>`;
  }

  // Saldo corrente: acumula sempre do mais antigo para o mais novo,
  // independente da ordem de exibição.
  const parById = new Map(cachedTransacoes.map((x) => [x.id, x]));
  const runningBalances = new Map();
  let balance = 0;
  const itemsAsc = [...items].sort((a, b) => (a.data || '').localeCompare(b.data || '')
    || (a.created_at || '').localeCompare(b.created_at || ''));
  for (const t of itemsAsc) {
    const isEntradaT = t.tipo === 'Transferência' && !!t.transferencia_par_id && !t.conta_destino_id;
    balance += (t.tipo === 'Receita' || isEntradaT) ? Number(t.valor || 0) : -Number(t.valor || 0);
    runningBalances.set(t.id, balance);
  }

  const rows = items.map((t) => {
    const conta   = cachedContas.find((c) => c.id === t.conta_id);
    const sub     = cachedSubcategorias.find((s) => s.id === t.subcategoria_id);
    const cat     = sub ? cachedCategorias.find((c) => c.id === sub.categoria_id) : null;
    const bloco   = getBlocoFromSub(sub);
    const contato = t.contato_id ? cachedContatos.find((c) => c.id === t.contato_id) : null;

    const isTransferSaida   = t.tipo === 'Transferência' && !!t.conta_destino_id;
    const isTransferEntrada = t.tipo === 'Transferência' && !!t.transferencia_par_id && !t.conta_destino_id;
    const isTransfer        = t.tipo === 'Transferência';
    const tipoCls = t.tipo === 'Receita' ? 'trans-tipo-receita' : t.tipo === 'Despesa' ? 'trans-tipo-despesa' : 'trans-tipo-transferencia';

    // Detecta se a transferência é de uma Caixinha (saída ou entrada, via pagamento_id direto ou via par)
    let caixinhaSub = null;
    if (isTransfer) {
      const pagSubId = t.pagamento?.subcategoria_id;
      let linkedSub = pagSubId ? cachedSubcategorias.find((s) => s.id === pagSubId) : null;
      if (!linkedSub && isTransferEntrada && t.transferencia_par_id) {
        const par = parById.get(t.transferencia_par_id);
        const parSubId = par?.pagamento?.subcategoria_id;
        if (parSubId) linkedSub = cachedSubcategorias.find((s) => s.id === parSubId);
      }
      if (linkedSub?.tipo === 'Caixinha') caixinhaSub = linkedSub;
    }

    const splits   = splitsByTransId.get(t.id) || [];
    const hasSplits = splits.length > 0;

    const blocoHtml = isTransfer
      ? '<span class="trans-bloco-empty">—</span>'
      : hasSplits
        ? `<button class="trans-varios-pill" data-expand="${t.id}" type="button">Vários <svg class="splits-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>`
        : (bloco ? `<span class="trans-bloco-pill" style="--bloco-color:${bloco.color};">${escapeHtml(bloco.label)}</span>` : '<span class="trans-bloco-empty">—</span>');

    const catHtml = isTransfer
      ? (caixinhaSub
          ? `<span class="trans-cat-caixinha"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.6.5 2.8 1.5 3.8L4 18h3l1-1.7c1 .4 2 .7 3 .7s2-.3 3-.7L15 18h3l-1.5-2.2c.7-.7 1.2-1.5 1.5-2.3 1 0 2-1 2-2v-2c0-1-1-2-2-2 0-1-1-2.5-1-2.5z"/><circle cx="16" cy="10" r="0.5" fill="currentColor"/></svg>Caixinha</span>`
          : '<span class="trans-cat-transfer">Transferência</span>')
      : hasSplits
        ? `<span class="trans-varios-cell">${splits.length} partes</span>`
        : (cat ? `<span class="trans-cat-pill" style="--cat-cor:${cat.cor || '#6B7280'};">${escapeHtml(cat.nome)}</span>` : '<span class="trans-cat-empty">—</span>');

    const subHtml = isTransfer
      ? (caixinhaSub
          ? `<span class="trans-sub-name">${escapeHtml(caixinhaSub.apelido || caixinhaSub.nome)} <span class="trans-transfer-side">${isTransferEntrada ? '(entrada)' : '(saída)'}</span></span>`
          : `<span class="trans-transfer-side">${isTransferEntrada ? 'entrada' : 'saída'}</span>`)
      : hasSplits
        ? '<span class="trans-varios-cell">—</span>'
        : (sub ? `<span class="trans-sub-name">${escapeHtml(sub.apelido || sub.nome)}</span>` : '<span class="trans-sub-empty">—</span>');

    // Identificador: ID único do banco (banco_id)
    const bancoIdHtml = t.banco_id
      ? `<span class="trans-banco-id" title="${escapeHtml(t.banco_id)}">${escapeHtml(t.banco_id.length > 14 ? t.banco_id.slice(0, 14) + '…' : t.banco_id)}</span>`
      : '<span class="trans-banco-empty">—</span>';

    // Descrição: texto bruto do extrato (banco_desc) + descricao livre
    const descTexto = t.banco_desc || t.descricao || '';
    const bancoDescHtml = descTexto
      ? `<span class="trans-banco-desc" title="${escapeHtml(descTexto)}">${escapeHtml(descTexto.length > 42 ? descTexto.slice(0, 42) + '…' : descTexto)}</span>`
      : '<span class="trans-banco-empty">—</span>';

    // Indicador de vínculo com dívida — aparece como badge ao lado da descrição
    const divida = t.divida_id ? cachedDividas.find((d) => d.id === t.divida_id) : null;
    const dividaBadge = divida
      ? `<a href="dividas.html" class="trans-divida-link" title="Vinculado à dívida: ${escapeHtml(divida.nome)}${divida.status === 'Arquivada' ? ' (arquivada)' : ''}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          <span>${escapeHtml(divida.nome.length > 18 ? divida.nome.slice(0, 18) + '…' : divida.nome)}</span>
        </a>`
      : '';
    const tagsHtml = (t.tags && t.tags.length > 0)
      ? `<div class="trans-row-tags">${t.tags.map((tag) => `<button class="trans-tag-chip" data-tag="${escapeHtml(tag)}" type="button" style="--tag-color:${tagColor(tag)}" title="Filtrar por #${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join('')}</div>`
      : '';
    const descColHtml = `<div class="trans-desc-wrap">${bancoDescHtml}${dividaBadge}</div>${tagsHtml}`;

    // Cliente/Fornecedor: prefere contato vinculado → fallback banco_desc → fallback legado
    let contatoHtml;
    if (contato) {
      contatoHtml = `<span class="trans-contato-name">${escapeHtml(contato.nome)}</span>`;
    } else if (t.banco_desc) {
      contatoHtml = `<span class="trans-contato-banco" title="Não vinculado — edite para selecionar um contato">${escapeHtml(t.banco_desc)}</span>`;
    } else if (t.estabelecimento) {
      contatoHtml = `<span class="trans-contato-legacy" title="Texto legado — edite a transação para vincular um contato">${escapeHtml(t.estabelecimento)}</span>`;
    } else {
      contatoHtml = '<span class="trans-contato-empty">—</span>';
    }

    // Indicador de parcial: compromisso criado a partir de pagamento parcial (flag is_parcial).
    // O status 'Parcial' foi removido na v2.0 — agora pagamento parcial é registrado como
    // 'Pago' com um compromisso filho que carrega is_parcial=true (ver migration 0027).
    const isParcialComp = sub?.is_parcial === true;
    const parcialTitle  = 'Transação do restante de pagamento parcial';
    const parcialIcon   = isParcialComp
      ? `<span class="parcial-indicator trans-parcial-icon" title="${parcialTitle}">½</span>`
      : '';

    // Data planejada: vem do pagamento vinculado (join feito no loadAll).
    // Quando a transação não tem pagamento_id, fica vazia.
    const planejadaIso = t.pagamento?.data_vencimento || null;
    let planejadaHtml;
    if (planejadaIso) {
      const diffDias = diasEntreISO(planejadaIso, t.data);
      // Cor do desvio: verde se ≤ 0 (em dia ou adiantado), âmbar se 1-7 dias atraso, vermelho se >7
      let cls = 'trans-planejada-ok';
      let badge = '';
      if (diffDias > 0 && diffDias <= 7) { cls = 'trans-planejada-late'; badge = ` <span class="trans-planejada-diff">+${diffDias}d</span>`; }
      else if (diffDias > 7)             { cls = 'trans-planejada-overdue'; badge = ` <span class="trans-planejada-diff">+${diffDias}d</span>`; }
      planejadaHtml = `<span class="${cls} tabular">${formatDateBR(planejadaIso)}</span>${badge}`;
    } else if (t.banco_desc) {
      planejadaHtml = '<span class="trans-planejada-extrato">Extrato</span>';
    } else {
      planejadaHtml = '<span class="trans-planejada-empty">—</span>';
    }

    const saldoVal = runningBalances.get(t.id) ?? 0;
    const saldoColor = saldoVal < 0 ? 'color: var(--color-danger)' : '';

    const reconStatus = t.reconciliacao_status || 'manual';
    const isImportado  = reconStatus === 'importado';
    const isReconciliado = reconStatus === 'reconciliado';
    const confirmadoAuto = !!t.confirmado_automaticamente;
    // Badge unificado de status de confirmação:
    //   • Pendente (laranja) — importado, esperando confirmação
    //   • Auto (roxo)        — reconciliado pelo sistema via regra
    //   • Manual (verde)     — reconciliado pelo usuário
    //   • nada               — manual (criada pelo usuário, fluxo normal)
    let reconBadge = '';
    if (isImportado) {
      reconBadge = `<span class="trans-conf-badge trans-conf-badge--pendente" title="Importada do extrato — precisa ser confirmada">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Pendente
      </span>`;
    } else if (isReconciliado && confirmadoAuto) {
      reconBadge = `<span class="trans-conf-badge trans-conf-badge--auto" title="Reconciliada automaticamente pelo sistema via regra">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Auto
      </span>`;
    } else if (isReconciliado) {
      reconBadge = `<span class="trans-conf-badge trans-conf-badge--manual" title="Confirmada manualmente pelo usuário">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Manual
      </span>`;
    }
    const reconBtn = isImportado
      ? `<button class="btn-icon trans-recon-confirm" data-confirm-recon="${t.id}" title="Confirmar reconciliação">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
         </button>`
      : '';

    let contaSpan;
    if (isTransferSaida) {
      const contaDest = cachedContas.find((c) => c.id === t.conta_destino_id);
      contaSpan = `<span class="trans-transfer-flow">
        <span class="trans-conta-with-avatar">${contaAvatarHtml(conta || null, 'xs')}<span class="trans-transfer-flow-src">${escapeHtml(conta ? (conta.apelido || conta.nome) : '?')}</span></span>
        <span class="trans-transfer-flow-arrow">→</span>
        <span class="trans-conta-with-avatar">${contaAvatarHtml(contaDest || null, 'xs')}<span class="trans-transfer-flow-dst">${escapeHtml(contaDest ? (contaDest.apelido || contaDest.nome) : '?')}</span></span>
      </span>`;
    } else if (isTransferEntrada) {
      const parTrans = parById.get(t.transferencia_par_id);
      const contaOrigem = parTrans ? cachedContas.find((c) => c.id === parTrans.conta_id) : null;
      contaSpan = `<span class="trans-transfer-flow">
        <span class="trans-conta-with-avatar">${contaAvatarHtml(contaOrigem || null, 'xs')}<span class="trans-transfer-flow-src">${escapeHtml(contaOrigem ? (contaOrigem.apelido || contaOrigem.nome) : '?')}</span></span>
        <span class="trans-transfer-flow-arrow">→</span>
        <span class="trans-conta-with-avatar">${contaAvatarHtml(conta || null, 'xs')}<span class="trans-transfer-flow-dst">${escapeHtml(conta ? (conta.apelido || conta.nome) : '?')}</span></span>
      </span>`;
    } else {
      contaSpan = `<div class="trans-conta-with-avatar">${contaAvatarHtml(conta || null, 'xs')}<span>${escapeHtml(conta ? (conta.apelido || conta.nome) : '—')}</span></div>`;
    }
    const rowTypeCls = t.tipo === 'Receita' ? 'trans-row-receita' : t.tipo === 'Despesa' ? 'trans-row-despesa' : `trans-row-transfer${isTransferEntrada ? ' trans-row-transfer--entrada' : ''}`;
    const editId = isTransferEntrada && t.transferencia_par_id ? t.transferencia_par_id : t.id;

    return `
      <tr class="trans-row ${rowTypeCls}${isImportado ? ' trans-row--importado' : ''}" data-id="${t.id}">
        <td class="trans-td-data tabular">${formatDateBR(t.data)}</td>
        <td class="trans-td-planejada" data-col="planejada">${planejadaHtml}</td>
        <td class="trans-td-id" data-col="id">${bancoIdHtml}</td>
        <td class="trans-td-banco" data-col="banco">${descColHtml}</td>
        <td class="trans-td-contato" data-col="contato">${contatoHtml}</td>
        <td class="trans-td-bloco" data-col="bloco">${blocoHtml}</td>
        <td class="trans-td-categoria" data-col="categoria">${catHtml}</td>
        <td class="trans-td-subcategoria" data-col="subcategoria">${subHtml}</td>
        <td class="trans-td-conta" data-col="conta">
          <div class="trans-conta-cell">
            ${contaSpan}
            ${reconBadge}${parcialIcon}
          </div>
        </td>
        <td class="trans-td-valor tabular ${tipoCls}" data-col="valor">${formatCurrencyHTML((t.tipo === 'Receita' || isTransferEntrada) ? Number(t.valor || 0) : -Number(t.valor || 0), t.moeda)}</td>
        <td class="trans-td-saldo tabular" data-col="saldo" style="${saldoColor}">${formatCurrencyHTML(saldoVal)}</td>
        <td class="trans-td-actions">
          <div class="trans-actions-col">
            ${renderAttribBadge({ profileId: t.created_by, timestamp: t.created_at, verb: 'criou' })}
            <input type="checkbox" class="trans-row-check" data-id="${t.id}"
              ${selectedIds.has(t.id) ? 'checked' : ''} title="Selecionar">
            ${reconBtn}
            <button class="btn-icon" data-edit="${editId}" title="Editar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        </td>
      </tr>
      ${hasSplits ? renderSplitsDetailRow(t.id, splits) : ''}`;
  }).join('');

  // Footer: totais do período filtrado
  const totalReceitas = items.filter((t) => t.tipo === 'Receita').reduce((s, t) => s + Number(t.valor || 0), 0);
  const totalDespesas = items.filter((t) => t.tipo === 'Despesa').reduce((s, t) => s + Number(t.valor || 0), 0);
  const saldoMes = totalReceitas - totalDespesas;
  const saldoMesColor = saldoMes < 0 ? 'color: var(--color-danger)' : '';

  const footer = `
    <tr class="trans-footer-row">
      <td colspan="10" class="trans-footer-label">
        ${items.length} transaç${items.length === 1 ? 'ão' : 'ões'}
        &nbsp;·&nbsp;
        <span class="trans-tipo-receita">${formatCurrencyHTML(totalReceitas)}</span>
        &nbsp;
        <span class="trans-tipo-despesa">${formatCurrencyHTML(-totalDespesas)}</span>
      </td>
      <td class="trans-td-saldo tabular trans-footer-saldo" data-col="saldo" style="${saldoMesColor}">${formatCurrencyHTML(saldoMes)}</td>
      <td></td>
    </tr>`;

  return rows + footer;
}

// Linha de detalhe das divisões (inicialmente oculta, toggle pelo botão "Vários")
function renderSplitsDetailRow(transId, splits) {
  const rows = splits.map((s, i) => {
    const sSub = cachedSubcategorias.find((x) => x.id === s.subcategoria_id);
    const sCat = sSub ? cachedCategorias.find((x) => x.id === sSub.categoria_id) : null;
    const sBloco = getBlocoFromSub(sSub);
    const tagsHtml = (s.tags || []).length > 0
      ? s.tags.map((tag) => `<span class="split-detail-tag">#${escapeHtml(tag)}</span>`).join('')
      : '<span class="trans-sub-empty">—</span>';
    return `
      <tr class="splits-detail-subrow">
        <td class="splits-detail-num">Parte ${i + 1}</td>
        <td class="splits-detail-bloco">${sBloco ? `<span class="trans-bloco-pill" style="--bloco-color:${sBloco.color};">${escapeHtml(sBloco.label)}</span>` : '<span class="trans-bloco-empty">—</span>'}</td>
        <td class="splits-detail-cat">${sCat ? `<span class="trans-cat-name">${escapeHtml(sCat.nome)}</span>` : '<span class="trans-cat-empty">—</span>'}</td>
        <td class="splits-detail-sub">${sSub ? `<span class="trans-sub-name">${escapeHtml(sSub.apelido || sSub.nome)}</span>` : '<span class="trans-sub-empty">—</span>'}</td>
        <td class="splits-detail-valor tabular">${formatCurrencyHTML(s.valor || 0)}</td>
        <td class="splits-detail-tags">${tagsHtml}</td>
        <td class="splits-detail-desc">${s.descricao ? escapeHtml(s.descricao) : '<span class="trans-sub-empty">—</span>'}</td>
      </tr>`;
  }).join('');

  return `
    <tr class="trans-splits-detail-row hidden" data-splits-for="${transId}">
      <td colspan="12" class="splits-detail-cell">
        <div class="splits-detail-wrap">
          <table class="splits-detail-table">
            <thead>
              <tr>
                <th></th>
                <th>Bloco</th>
                <th>Categoria</th>
                <th>Subcategoria</th>
                <th>Valor</th>
                <th>Tags</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </td>
    </tr>`;
}

// =============================================================
// Export — CSV e PDF
// =============================================================

function exportCSV(items) {
  const headers = ['Data', 'Tipo', 'Conta', 'Bloco', 'Categoria', 'Subcategoria', 'Valor', 'Moeda', 'Descrição', 'Contato', 'Tags'];
  const csvRows = items.map((tr) => {
    const conta  = cachedContas.find((c) => c.id === tr.conta_id);
    const sub    = cachedSubcategorias.find((s) => s.id === tr.subcategoria_id);
    const cat    = sub ? cachedCategorias.find((c) => c.id === sub.categoria_id) : null;
    const bloco  = getBlocoFromSub(sub);
    const contato = tr.contato_id ? cachedContatos.find((c) => c.id === tr.contato_id) : null;
    const splits  = splitsByTransId.get(tr.id) || [];
    // If has splits, emit one CSV row per split
    if (splits.length > 0) {
      return splits.map((s) => {
        const sSub  = cachedSubcategorias.find((x) => x.id === s.subcategoria_id);
        const sCat  = sSub ? cachedCategorias.find((x) => x.id === sSub.categoria_id) : null;
        const sBloco = getBlocoFromSub(sSub);
        return [
          tr.data, tr.tipo,
          conta?.apelido || conta?.nome || '',
          sBloco?.label || '',
          sCat?.nome || '',
          sSub?.apelido || sSub?.nome || '',
          s.valor,
          tr.moeda || 'BRL',
          s.descricao || tr.descricao || tr.banco_desc || '',
          contato?.nome || tr.banco_desc || '',
          (s.tags || []).map((tag) => '#' + tag).join(' '),
        ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
      }).join('\n');
    }
    return [
      tr.data, tr.tipo,
      conta?.apelido || conta?.nome || '',
      bloco?.label || '',
      cat?.nome || '',
      sub?.apelido || sub?.nome || '',
      tr.valor,
      tr.moeda || 'BRL',
      tr.descricao || tr.banco_desc || '',
      contato?.nome || tr.banco_desc || '',
      (tr.tags || []).map((tag) => '#' + tag).join(' '),
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  });

  const csv = [headers.join(','), ...csvRows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `transacoes-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(items) {
  const dateRange = (() => {
    if (!items.length) return '';
    const dates = items.map((t) => t.data).sort();
    if (dates[0] === dates[dates.length - 1]) return dates[0];
    return `${dates[0]} a ${dates[dates.length - 1]}`;
  })();

  const rowsHtml = items.map((tr) => {
    const conta   = cachedContas.find((c) => c.id === tr.conta_id);
    const sub     = cachedSubcategorias.find((s) => s.id === tr.subcategoria_id);
    const cat     = sub ? cachedCategorias.find((c) => c.id === sub.categoria_id) : null;
    const bloco   = getBlocoFromSub(sub);
    const contato = tr.contato_id ? cachedContatos.find((c) => c.id === tr.contato_id) : null;
    const splits  = splitsByTransId.get(tr.id) || [];
    const tipoCls = tr.tipo === 'Receita' ? 'pdf-receita' : tr.tipo === 'Despesa' ? 'pdf-despesa' : '';
    const sinal   = tr.tipo === 'Receita' ? '+' : (tr.tipo === 'Despesa' ? '−' : '');
    const tagsStr = (tr.tags || []).map((tag) => `#${tag}`).join(' ');

    const mainRow = `<tr>
      <td>${tr.data}</td>
      <td>${escapeHtml(tr.tipo)}</td>
      <td>${escapeHtml(conta?.apelido || conta?.nome || '—')}</td>
      <td>${escapeHtml(bloco?.label || (splits.length > 0 ? 'Vários' : '—'))}</td>
      <td>${escapeHtml(cat?.nome || (splits.length > 0 ? 'Vários' : '—'))}</td>
      <td>${escapeHtml(sub?.apelido || sub?.nome || (splits.length > 0 ? 'Vários' : '—'))}</td>
      <td class="${tipoCls}">${sinal}${formatCurrency(tr.valor, tr.moeda)}</td>
      <td>${escapeHtml(contato?.nome || tr.banco_desc || tr.descricao || '—')}</td>
      <td>${escapeHtml(tagsStr)}</td>
    </tr>`;

    const splitRows = splits.map((s) => {
      const sSub  = cachedSubcategorias.find((x) => x.id === s.subcategoria_id);
      const sCat  = sSub ? cachedCategorias.find((x) => x.id === sSub.categoria_id) : null;
      const sBloco = getBlocoFromSub(sSub);
      const sTags = (s.tags || []).map((tag) => `#${tag}`).join(' ');
      return `<tr class="pdf-split-row">
        <td colspan="3" style="padding-left:20px;">↳ parte</td>
        <td>${escapeHtml(sBloco?.label || '—')}</td>
        <td>${escapeHtml(sCat?.nome || '—')}</td>
        <td>${escapeHtml(sSub?.apelido || sSub?.nome || '—')}</td>
        <td>${formatCurrency(s.valor)}</td>
        <td>${escapeHtml(s.descricao || '—')}</td>
        <td>${escapeHtml(sTags)}</td>
      </tr>`;
    }).join('');

    return mainRow + splitRows;
  }).join('');

  const totalRec  = items.filter((t) => t.tipo === 'Receita').reduce((s, t) => s + Number(t.valor || 0), 0);
  const totalDesp = items.filter((t) => t.tipo === 'Despesa').reduce((s, t) => s + Number(t.valor || 0), 0);

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Relatório de Transações</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 16px; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      .subtitle { color: #555; font-size: 11px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: middle; }
      th { background: #f5f5f5; font-weight: 600; }
      tr:nth-child(even) { background: #fafafa; }
      .pdf-receita { color: #059669; }
      .pdf-despesa { color: #dc2626; }
      .pdf-split-row td { background: #f9fafb; color: #555; }
      .summary { margin-top: 14px; font-size: 12px; display: flex; gap: 24px; }
      .sum-item { display: flex; flex-direction: column; }
      .sum-label { color: #666; font-size: 10px; }
      .sum-val { font-weight: 700; font-size: 14px; }
      @media print { body { padding: 0; } }
    </style>
  </head><body>
    <h1>Relatório de Transações — FinFlow</h1>
    <div class="subtitle">${dateRange ? `Período: ${dateRange} · ` : ''}${items.length} transaç${items.length === 1 ? 'ão' : 'ões'} · Gerado em ${new Date().toLocaleString('pt-BR')}</div>
    <table>
      <thead>
        <tr>
          <th>Data</th><th>Tipo</th><th>Conta</th><th>Bloco</th><th>Categoria</th><th>Subcategoria</th><th>Valor</th><th>Contato / Descrição</th><th>Tags</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="summary">
      <div class="sum-item"><span class="sum-label">Receitas</span><span class="sum-val pdf-receita">+${formatCurrency(totalRec)}</span></div>
      <div class="sum-item"><span class="sum-label">Despesas</span><span class="sum-val pdf-despesa">−${formatCurrency(totalDesp)}</span></div>
      <div class="sum-item"><span class="sum-label">Saldo</span><span class="sum-val" style="color:${(totalRec-totalDesp)>=0?'#059669':'#dc2626'}">${formatCurrency(totalRec - totalDesp)}</span></div>
    </div>
    <script>window.print();<\/script>
  </body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

// Diferença em dias entre data real e data planejada (positivo = pago em atraso)
function diasEntreISO(planejadaIso, realIso) {
  if (!planejadaIso || !realIso) return 0;
  const a = new Date(planejadaIso + 'T00:00:00');
  const b = new Date(realIso + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

// -----------------------------
// Event bindings
// -----------------------------
function bindEvents() {
  document.getElementById('btn-nova-transacao').addEventListener('click', () => openTransacaoModal());
  document.querySelector('[data-trigger-nova]')?.addEventListener('click', () => openTransacaoModal());

  // Botão "Importar extrato" no header → vai para /importar.html
  document.getElementById('btn-nova-importacao')?.addEventListener('click', () => {
    window.location.href = '/importar.html';
  });

  // Abas Transações / Importações
  document.getElementById('trans-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-trans-tab]');
    if (!btn) return;
    const newTab = btn.dataset.transTab;
    if (newTab === viewTab) return;
    viewTab = newTab;
    document.querySelectorAll('#trans-tabs [data-trans-tab]').forEach((b) =>
      b.classList.toggle('active', b.dataset.transTab === viewTab)
    );
    // No modo Importações, reseta o filtro legado de pendentes pra evitar duplicação
    if (viewTab === 'importacoes') filterReconciliacao = '';
    render();
  });

  // Filtros — modo de período
  document.getElementById('trans-mode-pills').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    filterMode = btn.dataset.mode;
    document.querySelectorAll('#trans-mode-pills [data-mode]').forEach((b) =>
      b.classList.toggle('active', b === btn)
    );
    updateFilterInputVisibility();
    applyPeriodAndRender();
  });
  document.getElementById('filter-mes-month').addEventListener('change', applyPeriodAndRender);
  document.getElementById('filter-mes-year').addEventListener('change', applyPeriodAndRender);
  document.getElementById('filter-ano').addEventListener('change', applyPeriodAndRender);
  document.getElementById('btn-trans-aplicar').addEventListener('click', applyPeriodAndRender);

  // filter-conta: driven by _filterContaPicker via onChange callback above
  // (hidden input change event kept as fallback)
  document.getElementById('filter-conta').addEventListener('change', (e) => {
    filterConta = e.target.value;
    render();
  });

  // filter-tipo: chips
  document.getElementById('filter-tipo-chips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tf-tipo-chip');
    if (!btn) return;
    document.querySelectorAll('#filter-tipo-chips .tf-tipo-chip').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const hidden = document.getElementById('filter-tipo');
    if (hidden) hidden.value = btn.dataset.tipo;
    filterTipo = btn.dataset.tipo;
    render();
  });
  document.getElementById('filter-busca').addEventListener('input', (e) => {
    filterBusca = e.target.value;
    render();
  });

  document.getElementById('filter-pendentes').addEventListener('click', () => {
    filterReconciliacao = filterReconciliacao ? '' : 'importado';
    document.getElementById('filter-pendentes').classList.toggle('is-active', !!filterReconciliacao);
    render();
  });

  document.getElementById('trans-tag-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.trans-active-tag-remove');
    if (btn) {
      activeTagFilters.delete(btn.dataset.tag);
      renderTagFilters();
      render();
    }
  });

  // Exportar
  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    const filtered = applyFilters(cachedTransacoes);
    if (!filtered.length) { showToast('Nenhuma transação para exportar.', 'info'); return; }
    exportCSV(filtered);
  });
  document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    const filtered = applyFilters(cachedTransacoes);
    if (!filtered.length) { showToast('Nenhuma transação para exportar.', 'info'); return; }
    exportPDF(filtered);
  });

  // Splits toggle no modal
  document.getElementById('btn-splits-toggle')?.addEventListener('click', () => {
    splitEnabled = !splitEnabled;
    const container = document.getElementById('trans-splits-container');
    container?.classList.toggle('hidden', !splitEnabled);
    document.getElementById('trans-cat-section')?.classList.toggle('hidden', splitEnabled);
    document.getElementById('trans-bloco-field')?.classList.toggle('hidden', splitEnabled);
    document.getElementById('trans-descricao')?.closest('.field')?.classList.toggle('hidden', splitEnabled);
    setSplitButtonState(splitEnabled);
    if (splitEnabled) {
      if (currentSplits.length === 0) addSplit();
    } else {
      currentSplits = [];
      renderSplits();
    }
  });
  document.getElementById('btn-split-add')?.addEventListener('click', addSplit);

  // Update splits totals when main valor changes
  document.getElementById('trans-valor')?.addEventListener('input', () => {
    if (splitEnabled) updateSplitTotals();
  });

  // Modal close handlers (genérico — usa data-close-modal)
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.closeModal === 'modal-transacao') {
        _closeCatPicker();
        _closeSplitCatPicker();
        _closeSplitSubPicker();
      }
      closeModal(btn.dataset.closeModal);
    });
  });

  // Form submit
  document.getElementById('form-transacao').addEventListener('submit', (e) => {
    e.preventDefault();
    saveTransacao();
  });

  // Transferência — mostrar/esconder seção
  document.getElementById('trans-tipo').addEventListener('change', (e) => {
    toggleTransferSection(e.target.value === 'Transferência');
    updateCambioPar();
  });

  // Transferência — atualizar par de câmbio ao mudar moeda
  document.getElementById('trans-moeda').addEventListener('change', (e) => {
    updateCambioPar();
    document.getElementById('trans-valor').placeholder = moedaInputPlaceholder(e.target.value);
    if (document.getElementById('trans-tipo').value === 'Transferência') {
      fetchAndFillRate();
    }
  });

  // Conta origem — auto-detectar moeda da conta
  document.getElementById('trans-conta').addEventListener('change', (e) => {
    const conta = cachedContas.find((c) => c.id === e.target.value);
    if (conta?.moeda) {
      populateMoedaSelect(conta.moeda);
      updateCambioPar();
      if (document.getElementById('trans-tipo').value === 'Transferência') fetchAndFillRate();
    }
  });

  // Transferência — recalcular previsto ao mudar valor ou taxa
  document.getElementById('trans-valor').addEventListener('input', updatePrevisto);
  document.getElementById('trans-taxa-oficial').addEventListener('input', updatePrevisto);

  // Transferência — marcar destino como editado manualmente
  document.getElementById('trans-valor-destino').addEventListener('input', () => {
    document.getElementById('trans-valor-destino').dataset.manuallyEdited = '1';
    updateEfetiva();
  });

  // Botão excluir dentro do modal
  document.getElementById('btn-deletar-transacao').addEventListener('click', () => {
    if (!editingId) return;
    pendingDeleteId = editingId;
    _closeCatPicker(); _closeSplitCatPicker(); _closeSplitSubPicker();
    closeModal('modal-transacao');
    openModal('modal-confirmar');
  });

  // Confirmar exclusão
  document.getElementById('btn-confirmar-excluir').addEventListener('click', () => {
    if (pendingDeleteId) execDelete(pendingDeleteId);
  });

  // Modal de sync (Fase 2)
  document.getElementById('btn-sync-confirm').addEventListener('click', onSyncConfirm);
  document.getElementById('btn-sync-skip').addEventListener('click', onSyncSkip);

  // Modal de criar regra (Fase 3)
  document.getElementById('btn-regra-confirm').addEventListener('click', onCreateRuleConfirm);
  document.getElementById('btn-regra-skip').addEventListener('click', onCreateRuleSkip);

  // Excluir selecionadas
  document.getElementById('btn-bulk-delete').addEventListener('click', execBulkDelete);

  // Cancelar seleção
  document.getElementById('btn-selection-clear').addEventListener('click', () => {
    selectedIds.clear();
    document.querySelectorAll('.trans-row-check').forEach((cb) => { cb.checked = false; });
    const allCb = document.getElementById('trans-select-all');
    if (allCb) allCb.checked = false;
    updateSelectionBar();
  });

  // Auto-reconciliação no modal: aplica regra/sugestão se subcategoria estiver vazia
  document.getElementById('trans-contato').addEventListener('change', (e) => {
    if (e.target.value) {
      const subEl = document.getElementById('trans-subcategoria');
      if (subEl && !subEl.value) {
        const rule = findRule(cachedRules, e.target.value);
        const subId = rule
          ? rule.subcategoria_id
          : suggestSubcategoriaFromHistory(cachedTransacoes, e.target.value);
        if (subId && cachedSubcategorias.some((s) => s.id === subId)) {
          _selectSub(subId);
          // Dispara o handler de subcategoria pra preencher descrição
          subEl.dispatchEvent(new Event('change'));
        }
      }
    }
  });

  // Cascade bloco → categoria → subcategoria
  // Bloco is now a segmented picker — bind clicks on #trans-bloco-picker buttons
  document.getElementById('trans-bloco-picker')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.bloco-seg-btn');
    if (!btn) return;
    document.querySelectorAll('#trans-bloco-picker .bloco-seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const blocoVal = btn.dataset.bloco;
    const hidden = document.getElementById('trans-bloco');
    if (hidden) hidden.value = blocoVal;
    populateCategoriaForModal(blocoVal, '');
    _selectSub('');
    const searchEl = document.getElementById('trans-subcategoria-search');
    if (searchEl) searchEl.value = '';
    _renderSubPickerDropdown('');
  });

  document.getElementById('trans-categoria').addEventListener('change', () => {
    _selectSub('');
    const searchEl = document.getElementById('trans-subcategoria-search');
    if (searchEl) searchEl.value = '';
    if (_subPickerIsOpen) _renderSubPickerDropdown('');
  });

  // Modal: ao escolher subcategoria, auto-preencher descrição/contato (se vazios)
  document.getElementById('trans-subcategoria').addEventListener('change', () => {
    const subId = document.getElementById('trans-subcategoria').value;
    if (!subId) return;
    const sub = cachedSubcategorias.find((s) => s.id === subId);
    if (!sub) return;
    const descEl = document.getElementById('trans-descricao');
    if (descEl && !descEl.value.trim()) {
      descEl.value = sub.descricao || sub.apelido || sub.nome || '';
    }
    if (sub.contato_id && contatoPicker && !contatoPicker.getValue()) {
      contatoPicker.setValue(sub.contato_id);
    }
  });

  // Sub picker: click-outside to close
  document.addEventListener('mousedown', (e) => {
    if (_subPickerIsOpen) {
      const input = document.getElementById('trans-subcategoria-search');
      if (!_subPickerDropdownEl?.contains(e.target) && !input?.contains(e.target)) {
        _closeSubPicker();
      }
    }
  });
}

// Event delegation: 1 listener no tbody (estável entre renders) cobre todas
// as linhas. Idempotente — bindRowEvents() pode ser chamado a cada render
// sem acumular handlers (o flag _delegationBound previne re-attach).
function bindRowEvents() {
  const tbody = document.getElementById('trans-data-tbody');
  if (tbody && !tbody._delegationBound) {
    tbody._delegationBound = true;

    tbody.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit]');
      if (editBtn) { openTransacaoModal(editBtn.dataset.edit); return; }

      const reconBtn = e.target.closest('[data-confirm-recon]');
      if (reconBtn) { execConfirmRecon(reconBtn.dataset.confirmRecon); return; }

      const tagChip = e.target.closest('.trans-tag-chip');
      if (tagChip) {
        activeTagFilters.add(tagChip.dataset.tag);
        renderTagFilters();
        render();
        return;
      }

      // Splits expand toggle
      const expandBtn = e.target.closest('[data-expand]');
      if (expandBtn) {
        const transId   = expandBtn.dataset.expand;
        const detailRow = tbody.querySelector(`[data-splits-for="${transId}"]`);
        if (detailRow) {
          const isHidden = detailRow.classList.toggle('hidden');
          expandBtn.querySelector('.splits-chevron')?.classList.toggle('splits-chevron--open', !isHidden);
        }
        return;
      }
    });

    tbody.addEventListener('change', (e) => {
      const cb = e.target.closest('.trans-row-check');
      if (!cb) return;
      if (cb.checked) selectedIds.add(cb.dataset.id);
      else            selectedIds.delete(cb.dataset.id);
      updateSelectionBar();
    });
  }

  // Select-all checkbox: vive no shell, também só precisa bind 1x
  const selectAll = document.getElementById('trans-select-all');
  if (selectAll && !selectAll._bound) {
    selectAll._bound = true;
    selectAll.addEventListener('change', (e) => {
      const all = [...document.querySelectorAll('.trans-row-check')];
      all.forEach((cb) => {
        cb.checked = e.target.checked;
        if (e.target.checked) selectedIds.add(cb.dataset.id);
        else                   selectedIds.delete(cb.dataset.id);
      });
      updateSelectionBar();
    });
  }
}

async function execConfirmRecon(id) {
  const { error } = await supabase
    .from('transacoes')
    .update({ reconciliacao_status: 'reconciliado' })
    .eq('id', id);

  if (error) {
    let msg = error.message;
    if (/column.*reconciliacao_status/i.test(msg)) {
      msg = 'Execute a migration 0028_reconciliacao_status.sql no Supabase primeiro.';
    }
    showToast('Erro ao reconciliar: ' + msg, 'error', 8000);
    return;
  }

  const tr = cachedTransacoes.find((x) => x.id === id);
  if (tr) {
    tr.reconciliacao_status = 'reconciliado';
    // Aprende a associação banco_desc→contato para futuras importações
    if (tr.banco_desc && tr.contato_id) {
      upsertContatoBancoDesc(tr.contato_id, tr.banco_desc, tr.subcategoria_id).catch(() => {});
    }
  }

  showToast(t('transacoes.toast.reconciliada', 'Transação reconciliada'), 'success');
  render();

  // Auto-conclui tarefa de reconciliação pendente se a conta zerou
  if (tr?.conta_id) {
    const restantes = cachedTransacoes.filter(
      (x) => x.conta_id === tr.conta_id && (x.reconciliacao_status || 'manual') === 'importado'
    ).length;
    if (restantes === 0) {
      try {
        const { autoConcluirTarefas } = await import('../lib/tarefas.js');
        await autoConcluirTarefas({ tipo: 'reconciliacao_pendente', conta_id: tr.conta_id });
      } catch (err) { console.warn('[autoConcluirTarefas]', err); }
    }
  }

  // Self-learning: oferece auto-confirmação para próximas transações desse contato
  if (tr) {
    await offerAutoConfirmRule(tr);
  }
}

/**
 * Oferece ao usuário criar/ativar regra de auto-confirmação para o contato
 * da transação que ele acabou de confirmar manualmente. Roda em background —
 * se o usuário ignorar, não há prejuízo.
 */
async function offerAutoConfirmRule(transacao) {
  if (!transacao.contato_id || !transacao.subcategoria_id) return;
  const rule = cachedRules.find((r) => r.contato_id === transacao.contato_id);
  // Se já existe regra com auto_confirmar=true, nada a fazer
  if (rule && rule.auto_confirmar) return;

  const contato = cachedContatos.find((c) => c.id === transacao.contato_id);
  const sub     = cachedSubcategorias.find((s) => s.id === transacao.subcategoria_id);
  if (!contato || !sub) return;

  const subLabel    = sub.apelido?.trim() || sub.nome;
  const contatoNome = contato.nome;

  const confirmed = await showConfirm(
    `Quer que o sistema confirme automaticamente próximas transações de "${contatoNome}" como "${subLabel}"?\n\n` +
    `Elas vão direto para a aba Transações e afetam o saldo do banco, sem precisar de confirmação manual.`,
    { okLabel: 'Sim, ativar', cancelLabel: 'Não, obrigado', danger: false },
  );
  if (!confirmed) return;

  // Cria ou atualiza a regra com auto_confirmar=true
  const { upsertRule } = await import('../lib/regras-reconciliacao.js');
  const result = await upsertRule(transacao.contato_id, transacao.subcategoria_id, true);
  if (result.ok) {
    // Atualiza cache local
    const idx = cachedRules.findIndex((r) => r.contato_id === transacao.contato_id);
    if (idx >= 0) {
      cachedRules[idx].subcategoria_id = transacao.subcategoria_id;
      cachedRules[idx].auto_confirmar = true;
    } else {
      cachedRules.push({
        contato_id: transacao.contato_id,
        subcategoria_id: transacao.subcategoria_id,
        auto_confirmar: true,
      });
    }
    showToast(`Auto-confirmação ativada para "${contatoNome}"`, 'success', 5000);
  } else {
    showToast('Erro ao salvar regra: ' + (result.error || 'desconhecido'), 'error', 6000);
  }
}

// Salva/atualiza o mapeamento banco_desc → contato no histórico de reconhecimento.
async function upsertContatoBancoDesc(contatoId, bancoDesc, subcategoriaId = null) {
  const user = await getCurrentUser();
  if (!user || !contatoId || !bancoDesc) return;
  await supabase
    .from('contato_banco_descs')
    .upsert(
      { user_id: user.id, workspace_id: requireWorkspaceId(), contato_id: contatoId, banco_desc: bancoDesc, last_subcategoria_id: subcategoriaId || null },
      { onConflict: 'user_id,contato_id,banco_desc' },
    )
    .then(({ error }) => { if (error && !/relation.*contato_banco_descs/i.test(error.message)) console.warn('[upsertCDB]', error); });
}

// -----------------------------
// Modal: open / save
// -----------------------------
// ── Helpers de transferência ──────────────────────────────────
function toggleTransferSection(show) {
  const section = document.getElementById('trans-transfer-section');
  section.classList.toggle('hidden', !show);
  document.getElementById('trans-conta-destino').required = show;
  document.getElementById('trans-cat-fields').classList.toggle('field--faded', show);
  document.getElementById('trans-sub-field').classList.toggle('field--faded', show);
  document.getElementById('trans-contato-field').classList.toggle('field--faded', show);
  document.getElementById('trans-bloco-field')?.classList.toggle('hidden', show);
  // Splits não fazem sentido em transferências — oculta o botão e o painel
  document.getElementById('trans-splits-section')?.classList.toggle('hidden', show);
  if (show) {
    document.getElementById('trans-splits-container')?.classList.add('hidden');
    splitEnabled = false;
    currentSplits = [];
    setSplitButtonState(false);
  }
  if (show) fetchAndFillRate();
}

function updateCambioPar() {
  const moeda      = document.getElementById('trans-moeda').value || 'BRL';
  const parEl      = document.getElementById('trans-cambio-par');
  const cardEl     = document.getElementById('trans-cambio-card');
  const isForeign  = moeda !== 'BRL';
  cardEl.classList.toggle('hidden', !isForeign);
  if (parEl) parEl.textContent = isForeign ? `${moeda} → BRL` : '—';
}

function updateEfetiva() {
  const valor         = parseUserNumber(document.getElementById('trans-valor').value) || 0;
  const valorDestino  = parseUserNumber(document.getElementById('trans-valor-destino').value) || 0;
  const wrapEl        = document.getElementById('trans-taxa-efetiva-wrap');
  const valEl         = document.getElementById('trans-taxa-efetiva-value');
  if (valor > 0 && valorDestino > 0) {
    const efetiva = valorDestino / valor;
    valEl.textContent = efetiva.toFixed(6);
    wrapEl.classList.remove('hidden');
  } else {
    wrapEl.classList.add('hidden');
  }
}

function updatePrevisto() {
  const valor  = parseUserNumber(document.getElementById('trans-valor').value) || 0;
  const taxa   = parseFloat(document.getElementById('trans-taxa-oficial').value) || 0;
  const prevEl = document.getElementById('trans-valor-previsto');
  const destEl = document.getElementById('trans-valor-destino');
  if (valor > 0 && taxa > 0) {
    const previsto = (valor * taxa).toFixed(2);
    prevEl.value = previsto;
    if (!destEl.dataset.manuallyEdited) destEl.value = previsto;
  } else {
    prevEl.value = '';
  }
  updateEfetiva();
}

async function fetchAndFillRate() {
  const moeda = document.getElementById('trans-moeda').value;
  if (!moeda || moeda === 'BRL') return;
  const statusEl = document.getElementById('trans-fetch-status');
  if (statusEl) statusEl.textContent = 'Buscando cotação…';
  try {
    const taxa = await fetchExchangeRate(moeda, 'BRL');
    document.getElementById('trans-taxa-oficial').value = taxa;
    updatePrevisto();
    if (statusEl) statusEl.textContent = '';
  } catch {
    showToast(t('transacoes.toast.erro_cotacao', 'Não foi possível buscar a cotação.'), 'error');
    if (statusEl) statusEl.textContent = 'Erro ao buscar cotação';
  }
}

function openTransacaoModal(id = null) {
  editingId = id;
  const t = id ? cachedTransacoes.find((x) => x.id === id) : null;

  initContatoPickerOnce();
  if (!_transContaPicker) {
    _transContaPicker = createContaPicker({
      triggerBtnId: 'trans-conta-btn',
      hiddenInputId: 'trans-conta',
      avatarWrapId:  'trans-conta-avatar-wrap',
      nameElId:      'trans-conta-name',
      getContas:     () => cachedContas,
      placeholder:   'Selecione uma conta…',
      allowBlank:    false,
    });
    _transContaPicker.init();
  }
  initSubcategoriaPicker();
  initCategoriaPicker();

  document.getElementById('modal-transacao-title').textContent = t ? 'Editar transação' : 'Nova transação';
  document.getElementById('trans-data').value      = t?.data       || todayInput();
  document.getElementById('trans-tipo').value      = t?.tipo       || 'Despesa';
  document.getElementById('trans-valor').value     = t?.valor != null ? Number(t.valor) : '';
  const moedaCode = t?.moeda || 'BRL';
  populateMoedaSelect(moedaCode);
  _transContaPicker.setValue(t?.conta_id || '');
  contatoPicker?.setValue(t?.contato_id || '');
  document.getElementById('trans-descricao').value = t?.descricao  || '';
  currentTags = [...(t?.tags || [])];
  renderModalTags();
  initTagInput();

  // Splits: init with existing splits (or empty)
  const existingSplits = id ? (splitsByTransId.get(id) || []) : [];
  initSplitsSection(existingSplits);

  // Cascade: sub → categoria → bloco
  const sub    = t?.subcategoria_id ? cachedSubcategorias.find((s) => s.id === t.subcategoria_id) : null;
  const cat    = sub ? cachedCategorias.find((c) => c.id === sub.categoria_id) : null;
  const blocoId = cat
    ? (Object.entries(BLOCO_GRUPOS).find(([, grupos]) => grupos.includes(cat.grupo))?.[0] || '')
    : '';
  // Update bloco segmented picker active state
  document.querySelectorAll('#trans-bloco-picker .bloco-seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.bloco === blocoId);
  });
  const blocoHidden = document.getElementById('trans-bloco');
  if (blocoHidden) blocoHidden.value = blocoId;
  populateCategoriaForModal(blocoId, cat?.id || '');
  filterSubForModal(cat?.id || '', t?.subcategoria_id || '');

  document.getElementById('btn-deletar-transacao').classList.toggle('hidden', !id);

  // Transferência
  const isTransfer = (t?.tipo || 'Despesa') === 'Transferência';
  toggleTransferSection(isTransfer);
  document.getElementById('trans-conta-destino').value   = t?.conta_destino_id    || '';
  document.getElementById('trans-taxa-oficial').value    = t?.taxa_cambio_oficial != null ? t.taxa_cambio_oficial : '';
  const destEl = document.getElementById('trans-valor-destino');
  destEl.dataset.manuallyEdited = '';
  if (t?.valor_destino != null) {
    destEl.value = t.valor_destino;
    destEl.dataset.manuallyEdited = '1';
  } else {
    destEl.value = '';
  }
  updateCambioPar();
  updatePrevisto();

  // Reconciliação — só mostra ao editar
  const reconGroup = document.getElementById('trans-recon-group');
  const reconCheck = document.getElementById('trans-recon-check');
  if (reconGroup && reconCheck) {
    reconGroup.classList.toggle('hidden', !t);
    reconCheck.checked = t?.reconciliacao_status === 'reconciliado';
  }

  openModal('modal-transacao');
  document.getElementById('trans-data').focus();
}

async function saveTransacao() {
  const data            = document.getElementById('trans-data').value;
  const tipo            = document.getElementById('trans-tipo').value;
  const valorRaw        = document.getElementById('trans-valor').value;
  const moeda           = document.getElementById('trans-moeda').value;
  const conta_id        = document.getElementById('trans-conta').value || null;
  const subcategoria_id = document.getElementById('trans-subcategoria').value || null;
  const contato_id      = contatoPicker?.getValue() || null;
  const descricao       = document.getElementById('trans-descricao').value.trim() || null;
  const tags            = currentTags.length > 0 ? currentTags : [];

  if (!data) { showToast(t('transacoes.validacao.data_obrigatoria', 'Informe a data'), 'error'); return; }
  const valorParsed = parseUserNumber(valorRaw);
  if (!valorRaw || isNaN(valorParsed) || valorParsed <= 0) {
    showToast('Informe um valor válido', 'error'); return;
  }
  if (!conta_id) { showToast(t('transacoes.validacao.conta_obrigatoria', 'Selecione uma conta'), 'error'); return; }

  if (tipo === 'Transferência') {
    const contaDestId = document.getElementById('trans-conta-destino').value || null;
    if (!contaDestId) { showToast('Selecione a conta destino', 'error'); return; }
  }

  const btn = document.getElementById('btn-salvar-transacao');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    const markRecon = editingId && (document.getElementById('trans-recon-check')?.checked ?? false);

    let savedTr;

    if (tipo === 'Transferência') {
      const conta_destino_id   = document.getElementById('trans-conta-destino').value || null;
      const taxa_cambio_oficial = parseFloat(document.getElementById('trans-taxa-oficial').value) || null;
      const valor_destino       = parseUserNumber(document.getElementById('trans-valor-destino').value) || null;
      const taxa_cambio_efetiva = (valor_destino && valorParsed) ? valor_destino / valorParsed : null;
      savedTr = await handleTransferSave({
        editingId, data, descricao, tags, valor: valorParsed, moeda, conta_id,
        conta_destino_id, taxa_cambio_oficial, valor_destino, taxa_cambio_efetiva,
      });
    } else {
      const payload = {
        data, tipo, valor: valorParsed, moeda, conta_id, subcategoria_id, contato_id, descricao, tags,
        ...(markRecon ? { reconciliacao_status: 'reconciliado' } : {}),
      };
      let response;
      if (editingId) {
        response = await supabase.from('transacoes').update(payload).eq('id', editingId).select().single();
      } else {
        const user = await getCurrentUser();
        if (!user) throw new Error('Sessão expirada. Faça login novamente.');
        response = await supabase.from('transacoes').insert({ ...payload, user_id: user.id, workspace_id: requireWorkspaceId(), created_by: user.id }).select().single();
      }
      if (response.error) throw response.error;
      savedTr = response.data;

      // Sync de data para pagamentos_divida_historico quando a transação está vinculada a uma dívida
      if (editingId && savedTr.divida_id) {
        const oldData = cachedTransacoes.find((x) => x.id === editingId)?.data;
        if (oldData && oldData !== data) {
          supabase
            .from('pagamentos_divida_historico')
            .update({ data })
            .eq('divida_id', savedTr.divida_id)
            .eq('data', oldData)
            .catch((e) => console.warn('[sync historico data]', e));
        }
      }
    }

    // Sync com fatura de cartão (Fase 4)
    // Se a conta antiga era cartão e mudou, recalcula a fatura antiga também
    const wasCartaoFatura = savedTr.fatura_cartao_id; // antes do save
    const novaConta = cachedContas.find((c) => c.id === savedTr.conta_id);
    if (isContaCartao(novaConta)) {
      await syncTransacaoFatura(savedTr, novaConta).catch((e) => console.warn('[syncTransacaoFatura]', e));
    } else if (wasCartaoFatura) {
      // saiu de cartão pra conta normal — desvincula e recalcula a fatura órfã
      await supabase.from('transacoes').update({ fatura_cartao_id: null }).eq('id', savedTr.id);
      await recalcFaturaTotal(wasCartaoFatura).catch((e) => console.warn('[recalc]', e));
    }

    // Sync com Gastos Diversos: se transação é despesa solta (sem
    // pagamento_id) em conta não-cartão, recalcula o bloco.
    if (savedTr.tipo === 'Despesa' && !savedTr.pagamento_id && !isContaCartao(novaConta)) {
      const b = blocoFromDate(savedTr.data);
      if (b) recalcGastosDiversosBlocoDebounced(b.mesAno, b.blocoQuinzenal);
    }

    // Aprende associação banco_desc→contato para futuras importações
    if (contato_id && savedTr.banco_desc) {
      upsertContatoBancoDesc(contato_id, savedTr.banco_desc, subcategoria_id).catch(() => {});
    }

    // Salva splits (silencioso se migration não rodou ainda)
    const currentUser = await getCurrentUser();
    if (currentUser) {
      await saveSplits(savedTr.id, currentUser.id).catch((e) => console.warn('[saveSplits]', e));
    }

    showToast(editingId ? 'Transação atualizada' : 'Transação criada', 'success');
    _closeCatPicker(); _closeSplitCatPicker(); _closeSplitSubPicker();
    closeModal('modal-transacao');
    editingId = null;
    await loadAll();
    render();

    // Sync com pagamento (não bloqueia o fluxo)
    checkAndPromptSync(savedTr).catch((e) => console.warn('[checkAndPromptSync]', e));
    // Prompt para criar regra de auto-reconciliação (Fase 3)
    maybePromptCreateRule(savedTr);
  } catch (err) {
    console.error('[saveTransacao]', err);
    let msg = err?.message || err?.hint || err?.details || JSON.stringify(err);
    if (/relation.*transacoes/i.test(msg) || /column.*transacoes/i.test(msg)) {
      msg = 'Schema desatualizado — rode a migration 0021_transacoes.sql no Supabase.';
    }
    showToast('Erro ao salvar: ' + msg, 'error', 12000);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

async function handleTransferSave({ editingId, data, descricao, tags, valor, moeda, conta_id, conta_destino_id, taxa_cambio_oficial, valor_destino, taxa_cambio_efetiva }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sessão expirada. Faça login novamente.');

  const destConta  = cachedContas.find((c) => c.id === conta_destino_id);
  const destMoeda  = destConta?.moeda || 'BRL';
  const valorEntrada = valor_destino || valor;

  if (editingId) {
    const existing = cachedTransacoes.find((x) => x.id === editingId);
    const { data: saida, error: saidaErr } = await supabase
      .from('transacoes')
      .update({ data, descricao, tags, valor, moeda, conta_id, conta_destino_id, taxa_cambio_oficial, valor_destino: valorEntrada, taxa_cambio_efetiva })
      .eq('id', editingId)
      .select().single();
    if (saidaErr) throw saidaErr;

    if (existing?.transferencia_par_id) {
      await supabase.from('transacoes')
        .update({ data, descricao, conta_id: conta_destino_id, valor: valorEntrada, moeda: destMoeda })
        .eq('id', existing.transferencia_par_id);
    }
    return saida;
  }

  // Nova transferência: inserir saída
  const wsId = requireWorkspaceId();
  const { data: saida, error: saidaErr } = await supabase.from('transacoes').insert({
    data, tipo: 'Transferência', user_id: user.id, workspace_id: wsId, created_by: user.id,
    conta_id, valor, moeda, descricao, tags,
    conta_destino_id, taxa_cambio_oficial, valor_destino: valorEntrada, taxa_cambio_efetiva,
  }).select().single();
  if (saidaErr) throw saidaErr;

  // Inserir entrada
  const { data: entrada, error: entradaErr } = await supabase.from('transacoes').insert({
    data, tipo: 'Transferência', user_id: user.id, workspace_id: wsId, created_by: user.id,
    conta_id: conta_destino_id, valor: valorEntrada, moeda: destMoeda, descricao,
    transferencia_par_id: saida.id,
  }).select().single();
  if (entradaErr) {
    await supabase.from('transacoes').delete().eq('id', saida.id);
    throw entradaErr;
  }

  // Ligar saída ↔ entrada
  await supabase.from('transacoes').update({ transferencia_par_id: entrada.id }).eq('id', saida.id);

  return saida;
}

async function execDelete(id) {
  closeModal('modal-confirmar');
  pendingDeleteId = null;

  const tr = cachedTransacoes.find((x) => x.id === id);

  // Proteção: transações vindas do banco e vinculadas a pagamento não podem
  // ser excluídas — o registro bancário é fonte de verdade.
  if (tr && tr.pagamento_id && tr.reconciliacao_status && tr.reconciliacao_status !== 'manual') {
    showToast(
      'Essa transação não pode ser excluída por estar vinculada a um pagamento e ter vindo do banco. ' +
      'Desvincule do pagamento primeiro pela tela de Pagamentos.',
      'error', 10000
    );
    return;
  }

  const faturaIdAfetada = tr?.fatura_cartao_id || null;
  const parId = tr?.transferencia_par_id || null;

  const idsToDelete = parId ? [id, parId] : [id];
  // Defense in depth: filtra por workspace_id explícito
  const { error } = await supabase.from('transacoes').delete().in('id', idsToDelete).eq('workspace_id', requireWorkspaceId());
  if (error) {
    showToast('Erro ao excluir: ' + error.message, 'error', 8000);
    return;
  }

  // Recalcula total da fatura afetada (Fase 4)
  if (faturaIdAfetada) {
    await recalcFaturaTotal(faturaIdAfetada).catch((e) => console.warn('[recalc após delete]', e));
  }

  // Recalcula Gastos Diversos do bloco se a tx era despesa solta não-cartão
  if (tr && tr.tipo === 'Despesa' && !tr.pagamento_id && !faturaIdAfetada) {
    const b = blocoFromDate(tr.data);
    if (b) recalcGastosDiversosBlocoDebounced(b.mesAno, b.blocoQuinzenal);
  }

  showToast('Transação excluída', 'success');
  editingId = null;
  await loadAll();
  render();
}

// -----------------------------
// Regras de auto-reconciliação (Fase 3) — prompt pós-save
// -----------------------------

/**
 * Após salvar uma transação, se ela tem contato_id + subcategoria_id e
 * ainda NÃO existe regra para esse contato, oferece criar uma.
 * Não pede confirmação se a transação veio de uma regra que já existia.
 */
function maybePromptCreateRule(transacao) {
  if (!transacao || !transacao.contato_id || !transacao.subcategoria_id) return;
  const existing = findRule(cachedRules, transacao.contato_id);
  if (existing && existing.subcategoria_id === transacao.subcategoria_id) return;

  const contato = cachedContatos.find((c) => c.id === transacao.contato_id);
  const sub     = cachedSubcategorias.find((s) => s.id === transacao.subcategoria_id);
  if (!contato || !sub) return;

  pendingRuleState = {
    contato_id:      transacao.contato_id,
    subcategoria_id: transacao.subcategoria_id,
    contatoNome:     contato.nome,
    subNome:         sub.apelido || sub.nome,
    isUpdate:        !!existing, // se já existia regra com outra sub, é "atualizar"
  };

  const msg = pendingRuleState.isUpdate
    ? `Você já tinha uma regra para <strong>${escapeHtml(contato.nome)}</strong> com outra subcategoria. Quer atualizá-la para <strong>${escapeHtml(sub.apelido || sub.nome)}</strong>?`
    : `Quer que toda nova transação com <strong>${escapeHtml(contato.nome)}</strong> seja automaticamente vinculada a <strong>${escapeHtml(sub.apelido || sub.nome)}</strong>?`;

  document.getElementById('regra-message').innerHTML = msg;
  openModal('modal-criar-regra');
}

async function onCreateRuleConfirm() {
  if (!pendingRuleState) return;
  const { contato_id, subcategoria_id } = pendingRuleState;
  closeModal('modal-criar-regra');
  const result = await upsertRule(contato_id, subcategoria_id);
  if (result.ok) {
    cachedRules = await loadRules();
    showToast('Regra criada', 'success', 3000);
  } else {
    let msg = result.error || 'erro';
    if (/relation.*regras_reconciliacao|column.*regras/i.test(msg)) {
      msg = 'Tabela regras_reconciliacao não existe — rode a migration 0024 no Supabase.';
    }
    showToast('Erro ao criar regra: ' + msg, 'error', 8000);
  }
  pendingRuleState = null;
}

function onCreateRuleSkip() {
  closeModal('modal-criar-regra');
  pendingRuleState = null;
}

// -----------------------------
// Sync com Pagamentos (Fase 2)
// -----------------------------

/**
 * Após salvar uma transação, verifica se existe um pagamento agendado
 * ou já pago que case (mesma subcategoria + mesmo mês). Se sim, abre o
 * modal de confirmação com a ação apropriada.
 */
async function checkAndPromptSync(transacao) {
  if (!transacao || !transacao.subcategoria_id) return;
  if (transacao.pagamento_id) return; // já vinculada

  const pagamento = await findMatchingPagamento({
    subcategoria_id: transacao.subcategoria_id,
    data:            transacao.data,
  });
  if (!pagamento) return;

  const linkedTr = await findTransacaoLinkedToPagamento(pagamento.id);

  // 3 cenários:
  //   A: pagamento agendado → marcar pago + vincular
  //   B: pagamento pago + outra transação já vinculada → mesclar (manter a já vinculada)
  //   C: pagamento pago sem transação vinculada → vincular essa
  let scenario;
  if (!isPaidStatus(pagamento.status)) {
    scenario = 'A';
  } else if (linkedTr && linkedTr.id !== transacao.id) {
    scenario = 'B';
  } else if (!linkedTr) {
    scenario = 'C';
  } else {
    return; // já é a transação vinculada — nada a fazer
  }

  showSyncPromptModal({ scenario, transacao, pagamento, linkedTr });
}

function showSyncPromptModal({ scenario, transacao, pagamento, linkedTr }) {
  syncModalState = { scenario, transacao, pagamento, linkedTr };

  const sub      = cachedSubcategorias.find((s) => s.id === transacao.subcategoria_id);
  const subName  = sub ? (sub.apelido || sub.nome) : 'compromisso';
  const mes      = monthLabelBR(transacao.data);
  const valorPag = formatCurrencyHTML(Number(pagamento.valor_real ?? pagamento.valor_previsto ?? 0));
  const valorTr  = formatCurrencyHTML(Number(transacao.valor || 0), transacao.moeda);

  const titleEl   = document.getElementById('sync-title');
  const msgEl     = document.getElementById('sync-message');
  const detailsEl = document.getElementById('sync-details');
  const confirmBtn = document.getElementById('btn-sync-confirm');
  const skipBtn    = document.getElementById('btn-sync-skip');

  if (scenario === 'A') {
    titleEl.textContent  = 'Pagamento agendado encontrado';
    msgEl.innerHTML      = `Existe um pagamento agendado para <strong>${escapeHtml(subName)}</strong> em <strong>${mes}</strong>. Quer marcar como pago e vincular esta transação?`;
    confirmBtn.textContent = 'Marcar como pago e vincular';
    skipBtn.textContent    = 'Manter independente';
  } else if (scenario === 'B') {
    titleEl.textContent  = 'Possível transação duplicada';
    msgEl.innerHTML      = `Já existe uma transação vinculada ao pagamento de <strong>${escapeHtml(subName)}</strong> em <strong>${mes}</strong>. Mesclar — manter a já vinculada e descartar esta nova?`;
    confirmBtn.textContent = 'Mesclar (descartar esta)';
    skipBtn.textContent    = 'Manter as duas';
  } else {
    titleEl.textContent  = 'Pagamento sem transação vinculada';
    msgEl.innerHTML      = `O pagamento de <strong>${escapeHtml(subName)}</strong> em <strong>${mes}</strong> já está marcado como <strong>${escapeHtml(pagamento.status)}</strong> mas sem transação vinculada. Vincular esta?`;
    confirmBtn.textContent = 'Vincular';
    skipBtn.textContent    = 'Manter independente';
  }

  // Detalhes lado a lado: o pagamento e a transação atual
  detailsEl.innerHTML = `
    <div class="sync-detail-card">
      <div class="sync-detail-label">Pagamento</div>
      <div class="sync-detail-value">${valorPag}</div>
      <div class="sync-detail-sub">Status: ${escapeHtml(pagamento.status)}</div>
    </div>
    <div class="sync-detail-card">
      <div class="sync-detail-label">Esta transação</div>
      <div class="sync-detail-value">${valorTr}</div>
      <div class="sync-detail-sub">${formatDateBR(transacao.data)}</div>
    </div>`;

  openModal('modal-sync-pagamento');
}

async function onSyncConfirm() {
  if (!syncModalState) return;
  const { scenario, transacao, pagamento, linkedTr } = syncModalState;

  let result;
  if (scenario === 'A') {
    // Marca pagamento Pago + vincula a transação
    // Usa o valor da transação como valor_real do pagamento
    result = await markPagamentoPagoAndLink(pagamento.id, transacao.id, Number(transacao.valor));
  } else if (scenario === 'B') {
    // Descarta a nova transação, mantém a já vinculada
    result = await mergeTransacaoIntoExisting(transacao.id, linkedTr.id);
  } else {
    // Vincula apenas
    result = await linkTransacaoToPagamento(pagamento.id, transacao.id);
  }

  closeModal('modal-sync-pagamento');
  syncModalState = null;

  if (!result.ok) {
    showToast('Erro no sync: ' + (result.error || 'desconhecido'), 'error', 8000);
  } else {
    const msgs = { A: 'Pagamento marcado como pago', B: 'Transações mescladas', C: 'Transação vinculada' };
    showToast(msgs[scenario], 'success');
  }

  await loadAll();
  render();
}

function onSyncSkip() {
  closeModal('modal-sync-pagamento');
  syncModalState = null;
}

// -----------------------------
// Utilities
// -----------------------------
function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthLabelBR(iso) {
  if (!iso) return '—';
  const [y, m] = iso.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${meses[Number(m) - 1]}/${y}`;
}

