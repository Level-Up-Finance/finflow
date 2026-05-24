// =============================================================
// FinFlow — Página: Contas (v3)
// • Sem principal/secundária
// • Apelido (display name custom) preserva nome oficial
// • Pop-up de detalhes (read-only) com botão Editar
// • Fluxo: arquivar antes de deletar
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { requireWorkspaceId } from '../lib/workspace.js';
import { applyBodyRoleGating } from '../lib/permissions.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { ACCOUNT_TYPES, typeIcon, typeColor, typePill } from '../lib/account-types.js';
import { findBank, logoUrl, searchBanks } from '../lib/banks.js';
import { initColVisibility } from '../lib/col-visibility.js';
import { autoAttachDecimalInputs } from '../lib/number-format.js';
import { escapeHtml, formatDateBR, todayISO, parseUserNumber } from '../lib/utils.js';
import { checkAndCloseFaturas, listFaturasConhecidas, ensureSubcategoriasFaturas } from '../lib/faturas-cartao.js';
import { formatCurrency, formatCurrencyHTML } from '../lib/moedas.js';
import { COLOR_PALETTE, DEFAULT_COLOR, renderColorPicker } from '../lib/color-palette.js';
import { fetchExchangeRate } from '../lib/currency.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';

// Cache local de taxas (moeda → taxa para BRL). Reusa o cache de 5min de currency.js.
const ratesMapLocal = new Map();
async function ensureRates(currencies) {
  const faltando = [...new Set(currencies.filter((m) => m && m !== 'BRL' && !ratesMapLocal.has(m)))];
  await Promise.all(faltando.map(async (cur) => {
    try {
      ratesMapLocal.set(cur, await fetchExchangeRate(cur, 'BRL'));
    } catch (err) {
      console.error(`[contas] falha ao buscar taxa ${cur}→BRL:`, err);
    }
  }));
}
function toBRL(value, moeda) {
  if (!moeda || moeda === 'BRL') return Number(value) || 0;
  const rate = ratesMapLocal.get(moeda);
  if (!rate) {
    console.warn(`[contas] taxa ${moeda}→BRL ausente; usando valor cru.`);
    return Number(value) || 0;
  }
  return (Number(value) || 0) * rate;
}

// -----------------------------
// Constants & state
// -----------------------------
const DEFAULT_TIPO = 'Corrente';

let cachedContas = [];
let cachedFaturasAbertas = new Map(); // conta_id → valor_total acumulado das faturas abertas
let cachedProximaFatura  = new Map(); // conta_id → { valor, dataVencimento, status } da próxima fatura fechada a pagar (ou null)
let cachedCompromissosContas = new Map(); // conta_id → { comprometido, count }
let cachedCaixinhas = []; // subcategorias tipo='Caixinha' carregadas (sub_id → full row)
let cachedCaixinhasMaps = { saldo: new Map(), contrib: new Map(), hist: new Map() };
let editingId = null;
let detailsConta = null;        // conta sendo exibida no modal de detalhes
let pendingAction = null;       // { type, id, label }
let filterStatus = 'todas';
let filterTipos = new Set(['all']);
let cachedSaldos = new Map(); // conta_id → saldo number
let cachedSnapshots = new Map(); // conta_id → { data, saldo, moeda, fonte }
let cachedReconPendentes = new Map(); // conta_id → count (transações status='importado')
let cachedUltimasImportacoes = new Map(); // conta_id → ISO date da última importação
let userManuallyChangedColor = false;
let viewMode = 'cards';         // 'cards' | 'table'
let colVisEl = null;

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('contas');
  initTutorial('contas');
  await loadStrings();
  applyTranslationsToDom();
  renderTipoFilters();
  renderPickers();
  bindEvents();
  autoAttachDecimalInputs();

  colVisEl = initColVisibility({
    storageKey: 'contas',
    tableClass:  'contas-table',
    columns: [
      { key: 'tipo',          label: 'Tipo',              defaultVisible: true  },
      { key: 'status',        label: 'Status',            defaultVisible: true  },
      { key: 'comprometido',  label: 'Comprometido',      defaultVisible: true  },
      { key: 'desde',         label: 'Desde',             defaultVisible: true  },
      { key: 'fechada-em',    label: 'Fechada em',        defaultVisible: false },
      { key: 'descricao',     label: 'Descrição',         defaultVisible: false },
      { key: 'fec-fatura',    label: 'Fechamento fatura', defaultVisible: false },
      { key: 'venc-fatura',   label: 'Vencimento fatura', defaultVisible: false },
    ],
    toolbarEl: document.querySelector('.toolbar'),
  });

  await loadContas();
  applyRoleGating();
});

/** Esconde controles destrutivos pra viewer (conta + caixinha). */
function applyRoleGating() {
  applyBodyRoleGating({
    writeIds: ['btn-nova-conta', 'btn-salvar-conta', 'btn-arquivar-conta', 'btn-deletar-conta', 'btn-cx-resgatar', 'btn-cx-arquivar'],
  });
}

// -----------------------------
// Filters: tipo pills
// -----------------------------
function renderTipoFilters() {
  const container = document.getElementById('tipo-filters');
  const html = ACCOUNT_TYPES.map((t) => `
    <button class="cf-tipo-chip" data-tipo="${t.value}" type="button" style="--tipo-c:${t.color};">
      <span style="display:inline-flex;width:12px;height:12px;color:${t.color};">${t.icon}</span>
      ${t.label}
    </button>
  `).join('');
  container.insertAdjacentHTML('beforeend', html);
}

// -----------------------------
// Pickers (modal): tipo + color
// -----------------------------
function renderPickers() {
  const tipoSelector = document.getElementById('tipo-selector');
  tipoSelector.setAttribute('role', 'radiogroup');
  tipoSelector.setAttribute('aria-label', 'Tipo de conta');
  tipoSelector.innerHTML = ACCOUNT_TYPES.map((t) => `
    <button type="button" class="tipo-btn ${t.value === DEFAULT_TIPO ? 'active' : ''}" data-tipo="${t.value}"
      role="radio" aria-checked="${t.value === DEFAULT_TIPO ? 'true' : 'false'}">
      <span class="tipo-icon" style="color: ${t.color};">${t.icon}</span>
      <span class="tipo-label">${t.label}</span>
    </button>
  `).join('');

  renderColorPicker(document.getElementById('color-picker'), DEFAULT_COLOR);
}

// -----------------------------
// Event bindings
// -----------------------------
function bindEvents() {
  document.getElementById('btn-nova-conta').addEventListener('click', () => openContaModal());
  document.querySelector('[data-trigger-nova]')?.addEventListener('click', () => openContaModal());

  // View toggle
  document.getElementById('view-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    document.querySelectorAll('.view-toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    viewMode = btn.dataset.view;
    renderContas();
  });

  // Filtro: status
  document.getElementById('status-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.cf-status-tab');
    if (!btn) return;
    document.querySelectorAll('#status-filters .cf-status-tab').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    filterStatus = btn.dataset.status;
    renderContas();
  });

  // Filtro: tipo (multi)
  document.getElementById('tipo-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.cf-tipo-chip');
    if (!btn) return;
    const tipo = btn.dataset.tipo;
    if (tipo === 'all') {
      filterTipos = new Set(['all']);
    } else {
      filterTipos.delete('all');
      if (filterTipos.has(tipo)) filterTipos.delete(tipo);
      else filterTipos.add(tipo);
      if (filterTipos.size === 0) filterTipos = new Set(['all']);
    }
    cachedSaldos = new Map(); // reset saldos when filter changes
    syncTipoFilterUI();
    renderContas();
  });

  // Tipo selector no modal
  document.getElementById('tipo-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('.tipo-btn');
    if (!btn) return;
    document.querySelectorAll('.tipo-btn').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-checked', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-checked', 'true');
    document.getElementById('conta-tipo').value = btn.dataset.tipo;
    toggleCartaoFields();
    updatePreview();
  });

  // Color picker
  document.getElementById('color-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('.color-swatch');
    if (!btn) return;
    document.querySelectorAll('.color-swatch').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('conta-cor').value = btn.dataset.color;
    userManuallyChangedColor = true;
    updatePreview();
  });

  // Status segmented
  document.getElementById('status-segmented').addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    document.querySelectorAll('#status-segmented .segmented-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('conta-status').value = btn.dataset.status;
  });

  // Bank combobox
  initBankCombobox();

  // Form submit
  document.getElementById('form-conta').addEventListener('submit', saveConta);

  // Inputs que afetam preview
  document.getElementById('conta-apelido').addEventListener('input', updatePreview);

  // Close modals
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  // Botões do details modal
  document.getElementById('btn-editar-conta').addEventListener('click', () => {
    if (!detailsConta) return;
    closeModal('modal-details');
    openContaModal(detailsConta);
  });

  document.getElementById('btn-arquivar-conta').addEventListener('click', () => {
    if (!detailsConta) return;
    pendingAction = { type: 'arquivar', id: detailsConta.id, label: displayName(detailsConta) };
    showConfirm(
      'Arquivar conta?',
      `Arquivar <strong>${escapeHtml(displayName(detailsConta))}</strong>? Ela vai parar de aparecer nas listagens ativas, mas o histórico fica preservado. Você pode reativar depois editando a conta.`,
      'Arquivar'
    );
  });

  document.getElementById('btn-cx-editar').addEventListener('click', () => {
    if (!detailsCaixinha) return;
    closeModal('modal-caixinha-details');
    location.href = `compromissos.html?cfg_sub=${encodeURIComponent(detailsCaixinha.id)}`;
  });

  document.getElementById('btn-cx-resgatar').addEventListener('click', () => {
    if (!detailsCaixinha) return;
    openCaixinhaResgateModal(detailsCaixinha);
  });

  document.getElementById('form-cx-resgate').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitCaixinhaResgate();
  });

  document.getElementById('btn-cx-arquivar').addEventListener('click', async () => {
    if (!detailsCaixinha) return;
    const display = detailsCaixinha.apelido?.trim() || detailsCaixinha.nome;
    if (!window.confirm(`Arquivar caixinha "${display}"? Ela vai parar de aparecer nas listagens ativas.`)) return;
    const { error } = await supabase.from('subcategorias').update({ status: 'arquivada' }).eq('id', detailsCaixinha.id);
    if (error) { showToast('Erro ao arquivar: ' + error.message, 'error', 6000); return; }
    showToast('Caixinha arquivada.', 'success');
    closeModal('modal-caixinha-details');
    await renderCaixinhasSection();
  });

  document.getElementById('btn-deletar-conta').addEventListener('click', () => {
    if (!detailsConta) return;
    pendingAction = { type: 'delete', id: detailsConta.id, label: displayName(detailsConta) };
    showConfirm(
      'Deletar permanentemente?',
      `Tem certeza que quer deletar <strong>${escapeHtml(displayName(detailsConta))}</strong> definitivamente? <br><br><strong style="color: var(--color-danger);">Esta ação não pode ser desfeita</strong> e remove a conta do banco de dados.`,
      'Deletar'
    );
  });

  // Confirmar ação genérica
  document.getElementById('btn-confirmar-acao').addEventListener('click', async () => {
    if (!pendingAction) return;
    const { type, id } = pendingAction;
    closeModal('modal-confirmar');
    if (type === 'arquivar') {
      await changeStatus(id, 'arquivada');
      closeModal('modal-details');
    } else if (type === 'delete') {
      await deleteConta(id);
      closeModal('modal-details');
    }
    pendingAction = null;
  });
}

function syncTipoFilterUI() {
  document.querySelectorAll('#tipo-filters .cf-tipo-chip').forEach((p) => {
    p.classList.toggle('active', filterTipos.has(p.dataset.tipo));
  });
}

// -----------------------------
// Saldo loader
// -----------------------------
async function loadSaldos(contaIds) {
  if (!contaIds.length) return;
  // Em paralelo: snapshots de saldo bancário (vindos do OFX)
  loadSnapshots(contaIds).catch((e) => console.warn('[loadSnapshots]', e));
  // Exclui transações 'importado' (ainda não confirmadas pelo usuário) — elas
  // só passam a afetar o saldo após reconciliação manual ou auto-confirmação.
  const { data, error } = await supabase
    .from('transacoes')
    .select('conta_id, tipo, valor, conta_destino_id, transferencia_par_id, reconciliacao_status')
    .in('conta_id', contaIds)
    .neq('reconciliacao_status', 'importado');
  if (error) { console.error('[loadSaldos]', error); return; }

  // Initialize all accounts at 0
  for (const id of contaIds) cachedSaldos.set(id, 0);

  for (const tr of (data || [])) {
    const cur = cachedSaldos.get(tr.conta_id) ?? 0;
    const isEntrada = tr.tipo === 'Receita'
      || (tr.tipo === 'Transferência' && tr.transferencia_par_id && !tr.conta_destino_id);
    const isSaida = tr.tipo === 'Despesa'
      || (tr.tipo === 'Transferência' && !!tr.conta_destino_id);
    if (isEntrada) cachedSaldos.set(tr.conta_id, cur + Number(tr.valor || 0));
    else if (isSaida) cachedSaldos.set(tr.conta_id, cur - Number(tr.valor || 0));
  }
}

// Snapshots de saldo bancário (vindos do OFX). Atualiza cachedSnapshots em background.
async function loadSnapshots(contaIds) {
  if (!contaIds || contaIds.length === 0) return;
  const { loadLatestSnapshots } = await import('../lib/saldos-bancarios.js');
  const map = await loadLatestSnapshots(contaIds);
  cachedSnapshots = map;
}

/**
 * Carrega 2 indicadores por conta pra usar nos cards:
 *  - cachedReconPendentes: contagem de transações importadas pendentes
 *  - cachedUltimasImportacoes: data da última importação (max importada_em)
 */
async function loadIndicadoresImportacao(contaIds) {
  if (!contaIds || contaIds.length === 0) return;
  // Pendentes de reconciliação
  const { data: pendentes } = await supabase
    .from('transacoes')
    .select('conta_id')
    .in('conta_id', contaIds)
    .eq('reconciliacao_status', 'importado');
  const countMap = new Map();
  for (const t of pendentes || []) {
    countMap.set(t.conta_id, (countMap.get(t.conta_id) || 0) + 1);
  }
  cachedReconPendentes = countMap;

  // Última importação por conta
  const { data: imps } = await supabase
    .from('transacoes')
    .select('conta_id, importada_em')
    .in('conta_id', contaIds)
    .not('importada_em', 'is', null);
  const ultMap = new Map();
  for (const t of imps || []) {
    const cur = ultMap.get(t.conta_id);
    if (!cur || t.importada_em > cur) ultMap.set(t.conta_id, t.importada_em);
  }
  cachedUltimasImportacoes = ultMap;
}

// -----------------------------
// Display name helper (apelido fallback nome)
// -----------------------------
function displayName(conta) {
  return conta.apelido?.trim() || conta.nome;
}

// -----------------------------
// Bank Combobox
// -----------------------------
function initBankCombobox() {
  const input = document.getElementById('conta-nome');
  const dropdown = document.getElementById('bank-dropdown');
  const toggle = document.querySelector('#bank-combobox .combobox-toggle');
  let highlightedIndex = -1;
  let currentSuggestions = [];
  let blurTimer = null;

  const renderSuggestions = (suggestions, query) => {
    currentSuggestions = suggestions;
    if (!suggestions.length && query.trim()) {
      dropdown.innerHTML = `
        <button type="button" class="combobox-option combobox-option-create">
          Usar "<strong>${escapeHtml(query.trim())}</strong>" como nome customizado
        </button>
      `;
      currentSuggestions = [{ name: query.trim(), source: 'custom' }];
    } else if (!suggestions.length) {
      dropdown.innerHTML = '<div class="combobox-empty">Comece a digitar pra ver sugestões…</div>';
    } else {
      dropdown.innerHTML = suggestions.map((s, i) => {
        const fallbackColor = s.color || '#6B7280';
        const logo = s.domain
          ? `<img class="combobox-option-logo" src="${logoUrl(s.domain)}" alt="${escapeHtml(s.name)}" data-fallback-color="${fallbackColor}">`
          : `<div class="combobox-option-fallback" style="background: ${fallbackColor};">${initials(s.name)}</div>`;
        const sourceLabel = s.source === 'curated' ? '' :
                            s.source === 'brasilapi' ? '<span class="combobox-option-source">Bacen</span>' : '';
        return `
          <button type="button" class="combobox-option" data-idx="${i}">
            ${logo}
            <span class="combobox-option-name">${escapeHtml(s.name)}</span>
            ${sourceLabel}
          </button>
        `;
      }).join('');
      attachImageErrorHandlers(dropdown);
    }
    highlightedIndex = -1;
  };

  const showDropdown = async (query = '') => {
    dropdown.classList.remove('hidden');
    dropdown.innerHTML = '<div class="combobox-empty">Carregando…</div>';
    const suggestions = await searchBanks(query);
    renderSuggestions(suggestions, query);
  };

  const hideDropdown = () => {
    dropdown.classList.add('hidden');
    highlightedIndex = -1;
  };

  const selectBank = (bank) => {
    input.value = bank.name;

    if (!userManuallyChangedColor) {
      let chosenColor = bank.color || pickColorByName(bank.name);
      document.getElementById('conta-cor').value = chosenColor;
      document.querySelectorAll('.color-swatch').forEach((b) => {
        b.classList.toggle('active', b.dataset.color === chosenColor);
      });
    }

    hideDropdown();
    updatePreview();
  };

  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value;
    debounceTimer = setTimeout(() => showDropdown(query), 150);
  });

  input.addEventListener('focus', () => showDropdown(input.value));
  input.addEventListener('blur', () => {
    blurTimer = setTimeout(hideDropdown, 200);
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.combobox-option');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
      updateHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, -1);
      updateHighlight(items);
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      const bank = currentSuggestions[highlightedIndex];
      if (bank) selectBank(bank);
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  });

  toggle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (dropdown.classList.contains('hidden')) {
      input.focus();
      showDropdown(input.value);
    } else {
      hideDropdown();
    }
  });

  dropdown.addEventListener('mousedown', (e) => e.preventDefault());

  dropdown.addEventListener('click', (e) => {
    const btn = e.target.closest('.combobox-option');
    if (!btn) return;
    if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    if (btn.classList.contains('combobox-option-create')) {
      const bank = currentSuggestions[0];
      if (bank) selectBank(bank);
    } else {
      const idx = Number(btn.dataset.idx);
      const bank = currentSuggestions[idx];
      if (bank) selectBank(bank);
    }
    input.focus();
  });

  function updateHighlight(items) {
    items.forEach((it, i) => it.classList.toggle('highlighted', i === highlightedIndex));
    if (highlightedIndex >= 0 && items[highlightedIndex]) {
      items[highlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }
}

function pickColorByName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

// -----------------------------
// Conditional fields (Cartão)
// -----------------------------
function toggleCartaoFields() {
  const tipo = document.getElementById('conta-tipo').value;
  const cartaoFields = document.getElementById('cartao-fields');
  const isCartao = tipo === 'Cartão de Crédito';
  cartaoFields.classList.toggle('hidden', !isCartao);
  if (!isCartao) {
    document.getElementById('conta-fec-fatura').value = '';
    document.getElementById('conta-vencimento').value = '';
  }
}

// -----------------------------
// Modal preview
// -----------------------------
function updatePreview() {
  const nome = document.getElementById('conta-nome').value.trim();
  const apelido = document.getElementById('conta-apelido').value.trim();
  const display = apelido || nome || 'Nome do banco';
  const tipo = document.getElementById('conta-tipo').value;
  const cor = document.getElementById('conta-cor').value;

  const avatarHost = document.getElementById('preview-avatar');
  avatarHost.innerHTML = renderBankAvatar({ banco: nome, tipo, cor, size: 'lg' });
  attachImageErrorHandlers(avatarHost);

  document.getElementById('preview-name').textContent = display;
  document.getElementById('preview-meta').innerHTML = typePill(tipo);
}

// -----------------------------
// Open modal (nova / editar)
// -----------------------------
function openContaModal(conta = null) {
  editingId = conta?.id || null;
  userManuallyChangedColor = !!conta;  // se editando, não auto-troca cor

  document.getElementById('modal-conta-title').textContent = conta ? 'Editar conta' : 'Nova conta';
  document.getElementById('btn-salvar-conta').textContent = conta ? 'Salvar alterações' : 'Salvar';

  document.getElementById('form-conta').reset();

  const tipo = conta?.tipo || DEFAULT_TIPO;
  const cor = conta?.icone_cor || DEFAULT_COLOR;
  const status = conta?.status || 'ativa';

  document.getElementById('conta-nome').value = conta?.nome || '';
  document.getElementById('conta-apelido').value = conta?.apelido || '';
  document.getElementById('conta-tipo').value = tipo;
  document.getElementById('conta-cor').value = cor;
  document.getElementById('conta-descricao').value = conta?.descricao || '';

  // Moeda da conta é sempre BRL — outras moedas são usadas só em
  // compromissos/transações/investimentos.
  document.getElementById('conta-moeda').value = 'BRL';

  document.getElementById('conta-desde').value = conta?.desde || todayISO();
  document.getElementById('conta-fechada-em').value = conta?.fechada_em || '';
  document.getElementById('conta-fec-fatura').value = conta?.fec_fatura || '';
  document.getElementById('conta-vencimento').value = conta?.vencimento || '';
  document.getElementById('conta-limite').value = conta?.limite ?? '';
  document.getElementById('conta-status').value = status;

  document.querySelectorAll('.tipo-btn').forEach((b) => {
    const isActive = b.dataset.tipo === tipo;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-checked', String(isActive));
  });
  document.querySelectorAll('.color-swatch').forEach((b) => b.classList.toggle('active', b.dataset.color === cor));
  document.querySelectorAll('#status-segmented .segmented-btn').forEach((b) => b.classList.toggle('active', b.dataset.status === status));

  toggleCartaoFields();
  updatePreview();
  openModal('modal-conta');
}

// -----------------------------
// Open details modal (read-only)
// -----------------------------
function openDetailsModal(conta) {
  detailsConta = conta;

  // Avatar
  const avatarHost = document.getElementById('details-avatar');
  avatarHost.innerHTML = renderBankAvatar({ banco: conta.nome, tipo: conta.tipo, cor: conta.icone_cor, size: 'lg' });
  attachImageErrorHandlers(avatarHost);

  // Header
  const display = displayName(conta);
  document.getElementById('details-name').textContent = display;
  const officialEl = document.getElementById('details-official-name');
  if (conta.apelido && conta.apelido.trim() && conta.apelido !== conta.nome) {
    officialEl.textContent = `Nome oficial: ${conta.nome}`;
    officialEl.classList.remove('hidden');
  } else {
    officialEl.textContent = '';
  }

  // Meta (type pill + status pill)
  const statusLabel = { ativa: 'Ativa', inativa: 'Inativa', arquivada: 'Arquivada' }[conta.status];
  document.getElementById('details-meta').innerHTML = `
    ${typePill(conta.tipo)}
    <span class="status-pill status-${conta.status}">${statusLabel}</span>
  `;

  // Grid de campos
  const isCartao = conta.tipo === 'Cartão de Crédito';
  const fields = [
    { label: 'Tipo',         value: conta.tipo },
    { label: 'Status',       value: statusLabel },
    { label: 'Desde',        value: formatDateBR(conta.desde) },
    { label: 'Fechada em',   value: conta.fechada_em ? formatDateBR(conta.fechada_em) : null },
  ];
  if (isCartao) {
    fields.push({ label: 'Fechamento da fatura', value: conta.fec_fatura ? `Dia ${conta.fec_fatura}` : null });
    fields.push({ label: 'Vencimento da fatura', value: conta.vencimento ? `Dia ${conta.vencimento}` : null });
    fields.push({ label: 'Limite total', value: conta.limite != null ? formatCurrency(Number(conta.limite)) : null });
  }
  fields.push({ label: 'Descrição', value: conta.descricao, full: true });
  fields.push({ label: 'Cadastrada em', value: formatDateBR(conta.created_at?.slice(0, 10)) });

  document.getElementById('details-grid').innerHTML = fields.map((f) => `
    <div class="details-field" ${f.full ? 'style="grid-column: 1 / -1;"' : ''}>
      <span class="details-field-label">${f.label}</span>
      <span class="details-field-value ${!f.value ? 'details-field-empty' : ''}">${f.value ? escapeHtml(String(f.value)) : '—'}</span>
    </div>
  `).join('');

  // Botões: Arquivar (se ativa/inativa) ou Deletar (se arquivada)
  const btnArquivar = document.getElementById('btn-arquivar-conta');
  const btnDeletar = document.getElementById('btn-deletar-conta');
  if (conta.status === 'arquivada') {
    btnArquivar.classList.add('hidden');
    btnDeletar.classList.remove('hidden');
  } else {
    btnArquivar.classList.remove('hidden');
    btnDeletar.classList.add('hidden');
  }

  // Comprometimento de limite (apenas para cartão de crédito)
  const limiteSection = document.getElementById('cartao-limite-section');
  if (isCartao) {
    limiteSection.classList.remove('hidden');
    loadAndRenderCompromissosLimite(conta).catch((e) => console.warn('[loadAndRenderCompromissosLimite]', e));
  } else {
    limiteSection.classList.add('hidden');
  }

  // Faturas (apenas para cartão de crédito)
  const faturasSection = document.getElementById('cartao-faturas-section');
  if (isCartao) {
    faturasSection.classList.remove('hidden');
    loadAndRenderFaturas(conta).catch((e) => console.warn('[loadAndRenderFaturas]', e));
  } else {
    faturasSection.classList.add('hidden');
  }

  openModal('modal-details');
}

// -----------------------------
// Comprometimento de limite — compromissos vinculados ao cartão
// -----------------------------
async function loadAndRenderCompromissosLimite(conta) {
  const resumoEl = document.getElementById('cartao-limite-resumo');
  const listaEl  = document.getElementById('cartao-limite-lista');
  resumoEl.innerHTML = '<div class="loading-overlay" style="position:relative;min-height:48px;"><span class="spinner"></span></div>';
  listaEl.innerHTML  = '';

  const { data, error } = await supabase
    .from('subcategorias')
    .select('id, nome, apelido, tipo, periodo, vencimento_dia, valor_base, moeda, valor_variavel, status')
    .eq('conta_id', conta.id)
    .eq('status', 'ativa')
    .order('nome');

  if (error) {
    resumoEl.innerHTML = `<p class="cartao-faturas-empty">Erro ao carregar compromissos: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const compromissos = data || [];
  const limite       = Number(conta.limite) || 0;

  await ensureRates(compromissos.filter((c) => !c.valor_variavel).map((c) => c.moeda));
  const comprometido = compromissos
    .filter((c) => !c.valor_variavel)
    .reduce((sum, c) => sum + toBRL(c.valor_base, c.moeda), 0);

  // Resumo / barra
  if (!limite) {
    resumoEl.innerHTML = `
      <div class="clc-resumo clc-resumo--sem-limite">
        <span>Comprometido com compromissos ativos:</span>
        <strong>${formatCurrencyHTML(comprometido)}</strong>
        <span class="clc-hint">Configure o limite total em <em>Editar</em> para ver o percentual.</span>
      </div>`;
  } else {
    const disponivel = Math.max(0, limite - comprometido);
    const pct        = Math.min(100, (comprometido / limite) * 100);
    const barColor   = pct >= 90 ? 'var(--color-danger)' : pct >= 70 ? 'var(--color-warning)' : 'var(--color-success)';
    resumoEl.innerHTML = `
      <div class="clc-resumo">
        <div class="clc-resumo-valores">
          <div class="clc-val-item">
            <span class="clc-val-label">Limite total</span>
            <strong class="clc-val-num">${formatCurrencyHTML(limite)}</strong>
          </div>
          <div class="clc-val-item clc-val-item--comprometido">
            <span class="clc-val-label">Comprometido</span>
            <strong class="clc-val-num" style="color:${barColor}">${formatCurrencyHTML(comprometido)} <span class="clc-pct">${pct.toFixed(0)}%</span></strong>
          </div>
          <div class="clc-val-item">
            <span class="clc-val-label">Disponível</span>
            <strong class="clc-val-num">${formatCurrencyHTML(disponivel)}</strong>
          </div>
        </div>
        <div class="clc-bar-track">
          <div class="clc-bar-fill" style="width:${pct.toFixed(1)}%;background:${barColor};"></div>
        </div>
      </div>`;
  }

  // Lista de compromissos
  if (compromissos.length === 0) {
    listaEl.innerHTML = '<p class="cartao-faturas-empty">Nenhum compromisso ativo vinculado a este cartão.</p>';
    return;
  }

  const PERIODOS_LABEL = { Mensal: 'Mensal', Semanal: 'Semanal', Quinzenal: 'Quinzenal', Anual: 'Anual', 'Único': 'Único' };
  listaEl.innerHTML = `
    <table class="clc-table">
      <thead>
        <tr>
          <th>Compromisso</th>
          <th>Tipo</th>
          <th>Período</th>
          <th class="text-right">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${compromissos.map((c) => {
          const display = c.apelido?.trim() || c.nome;
          const valorStr = c.valor_variavel
            ? '<span style="color:var(--color-text-muted);font-style:italic;">varia</span>'
            : formatCurrencyHTML(Number(c.valor_base), c.moeda);
          const vencLabel = c.vencimento_dia ? `· dia ${c.vencimento_dia}` : '';
          return `
            <tr>
              <td>${escapeHtml(display)}</td>
              <td><span class="tipo-label-inline tipo-${c.tipo?.toLowerCase()}">${escapeHtml(c.tipo || '—')}</span></td>
              <td>${escapeHtml(PERIODOS_LABEL[c.periodo] || c.periodo || '—')} ${escapeHtml(vencLabel)}</td>
              <td class="text-right tabular">${valorStr}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// -----------------------------
// Faturas de cartão de crédito (Fase 4) — visualização
// -----------------------------
async function loadAndRenderFaturas(conta) {
  const aberta = document.getElementById('cartao-fatura-aberta');
  const hist   = document.getElementById('cartao-faturas-historico');
  aberta.innerHTML = '<div class="loading-overlay" style="position:relative; min-height:60px;"><span class="spinner"></span></div>';
  hist.innerHTML   = '';

  // 1. Carrega todas as faturas desse cartão
  const { data: faturas, error } = await supabase
    .from('faturas_cartao')
    .select('*')
    .eq('conta_id', conta.id)
    .order('data_vencimento', { ascending: false });

  if (error) {
    if (/relation.*faturas_cartao/i.test(error.message)) {
      aberta.innerHTML = '<p class="cartao-faturas-empty">Tabela de faturas ainda não existe — rode a migration 0025 no Supabase.</p>';
    } else {
      aberta.innerHTML = `<p class="cartao-faturas-empty">Erro: ${escapeHtml(error.message)}</p>`;
    }
    return;
  }

  if (!faturas || faturas.length === 0) {
    aberta.innerHTML = '<p class="cartao-faturas-empty">Sem faturas registradas. Crie transações com este cartão pra começar.</p>';
    return;
  }

  // 2. Para faturas fechadas (com subcategoria_id), busca o pagamento + transação real
  const subcategoriaIds = faturas.filter((f) => f.subcategoria_id).map((f) => f.subcategoria_id);
  let pagamentos = [];
  let transacoes = [];
  if (subcategoriaIds.length > 0) {
    const { data: pags } = await supabase
      .from('pagamentos')
      .select('id, subcategoria_id, mes_ano, status, valor_real, valor_previsto')
      .in('subcategoria_id', subcategoriaIds);
    pagamentos = pags || [];

    const pagIds = pagamentos.map((p) => p.id);
    if (pagIds.length > 0) {
      const { data: txs } = await supabase
        .from('transacoes')
        .select('id, pagamento_id, data, valor')
        .in('pagamento_id', pagIds);
      transacoes = txs || [];
    }
  }

  // 3. Separa fatura aberta (única) das fechadas
  const abertas  = faturas.filter((f) => f.status === 'aberta');
  const fechadas = faturas.filter((f) => f.status === 'fechada');

  // 4. Renderiza
  renderFaturaAberta(abertas, conta);
  renderFaturasHistorico(fechadas, pagamentos, transacoes);
}

function renderFaturaAberta(abertas, _conta) {
  const host = document.getElementById('cartao-fatura-aberta');
  if (abertas.length === 0) {
    host.innerHTML = '<p class="cartao-faturas-empty">Sem fatura aberta no momento.</p>';
    return;
  }

  // Pode haver mais de uma aberta (mês atual + próximo, dependendo de quando a transação foi feita)
  host.innerHTML = abertas.map((f) => {
    const diasFechar = diasAteISO(f.data_fechamento);
    const labelFechar = diasFechar > 0 ? `em ${diasFechar} dia${diasFechar > 1 ? 's' : ''}` : (diasFechar === 0 ? 'hoje' : `há ${-diasFechar} dia${-diasFechar > 1 ? 's' : ''}`);
    return `
      <div class="cartao-fatura-aberta-card">
        <div class="cartao-fatura-aberta-header">
          <span class="cartao-fatura-mes">${labelMesReferencia(f.mes_referencia)}</span>
          <span class="cartao-fatura-status status-aberta">Aberta</span>
        </div>
        <div class="cartao-fatura-aberta-valor">${formatCurrencyHTML(Number(f.valor_total))}</div>
        <div class="cartao-fatura-aberta-info">
          <div><span class="cf-label">Fechamento</span><span class="cf-value">${formatDateBR(f.data_fechamento)} <span class="cf-sub">(${labelFechar})</span></span></div>
          <div><span class="cf-label">Vencimento</span><span class="cf-value">${formatDateBR(f.data_vencimento)}</span></div>
        </div>
      </div>`;
  }).join('');
}

function renderFaturasHistorico(fechadas, pagamentos, transacoes) {
  const host = document.getElementById('cartao-faturas-historico');
  if (fechadas.length === 0) {
    host.innerHTML = '';
    return;
  }

  const PAID = ['Pago', 'Transferido'];

  const rows = fechadas.map((f) => {
    // Encontra o pagamento da fatura: mesma subcategoria_id e mes_ano = primeiro dia do mes do vencimento
    const mesAnoVencimento = f.data_vencimento.slice(0, 7) + '-01';
    const pag = pagamentos.find((p) => p.subcategoria_id === f.subcategoria_id && p.mes_ano === mesAnoVencimento);
    const tr  = pag ? transacoes.find((t) => t.pagamento_id === pag.id) : null;

    let statusHtml;
    let dataRealHtml;
    if (pag && PAID.includes(pag.status)) {
      statusHtml = `<span class="cartao-fatura-status status-paga">Paga</span>`;
      dataRealHtml = tr ? formatDateBR(tr.data) : `<span class="cartao-fatura-pendente">${pag.status}</span>`;
    } else if (pag) {
      statusHtml = `<span class="cartao-fatura-status status-pendente">${pag.status}</span>`;
      dataRealHtml = '<span class="cartao-fatura-pendente">—</span>';
    } else {
      statusHtml = `<span class="cartao-fatura-status status-pendente">Sem pagamento</span>`;
      dataRealHtml = '<span class="cartao-fatura-pendente">—</span>';
    }

    return `
      <tr>
        <td class="cf-td-mes">${labelMesReferencia(f.mes_referencia)}</td>
        <td class="cf-td-valor tabular">${formatCurrencyHTML(Number(f.valor_total))}</td>
        <td class="cf-td-data tabular">${formatDateBR(f.data_vencimento)}</td>
        <td class="cf-td-data tabular">${dataRealHtml}</td>
        <td class="cf-td-status">${statusHtml}</td>
      </tr>`;
  }).join('');

  host.innerHTML = `
    <h4 class="cartao-faturas-subtitle">Histórico</h4>
    <table class="cartao-faturas-tabela">
      <thead>
        <tr>
          <th>Mês</th>
          <th>Valor</th>
          <th>Vencimento</th>
          <th>Data real</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// -----------------------------
// Helpers (faturas)
// -----------------------------
function diasAteISO(iso) {
  if (!iso) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function labelMesReferencia(mesRef) {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const [y, m] = mesRef.split('-').map(Number);
  return `${meses[m - 1]}/${y}`;
}

// -----------------------------
// Confirm modal
// -----------------------------
function showConfirm(title, msgHtml, confirmLabel = 'Confirmar') {
  document.getElementById('modal-confirmar-title').textContent = title;
  document.getElementById('modal-confirmar-msg').innerHTML = msgHtml;
  document.getElementById('btn-confirmar-acao').textContent = confirmLabel;
  openModal('modal-confirmar');
}

// -----------------------------
// Load / Render
// -----------------------------

/**
 * Carrega faturas abertas com saldo > 0 para contas de cartão.
 * Popula cachedFaturasAbertas: Map<conta_id, valor_total_acumulado>.
 */
async function loadFaturasAbertas(contaIds) {
  cachedFaturasAbertas = new Map();
  cachedProximaFatura  = new Map();
  if (!contaIds.length) return;

  // Busca TODAS as faturas (abertas + fechadas) — JS separa em buckets:
  //   - Aberta: status='aberta' (em formação)
  //   - Próxima a pagar: status='fechada' + data_vencimento >= today,
  //     ordenada por vencimento crescente (a 1ª por conta é "a próxima")
  const today = todayISO();
  const { data, error } = await supabase
    .from('faturas_cartao')
    .select('conta_id, valor_total, data_vencimento, status')
    .in('conta_id', contaIds)
    .in('status', ['aberta', 'fechada'])
    .order('data_vencimento', { ascending: true });
  if (error) {
    if (!/relation.*faturas_cartao/i.test(error.message)) {
      console.warn('[loadFaturasAbertas]', error);
    }
    return;
  }

  for (const f of (data || [])) {
    if (f.status === 'aberta') {
      // HF-8: inclui faturas zeradas (cartão sem transação ainda) — UX
      // espera ver "Em formação: R$ 0" e não card vazio.
      const prev = cachedFaturasAbertas.get(f.conta_id) || 0;
      cachedFaturasAbertas.set(f.conta_id, prev + Number(f.valor_total || 0));
    } else if (f.status === 'fechada') {
      // Fatura fechada (não importa se já venceu ou não — fatura vencida
      // ainda precisa ser exibida; o usuário precisa ver que está em atraso).
      // Mantém só uma por conta:
      //   - Prioridade: fatura mais próxima >= hoje (a próxima a pagar)
      //   - Senão: a mais recente vencida (atraso a regularizar)
      const existing = cachedProximaFatura.get(f.conta_id);
      const isFuture = f.data_vencimento >= today;
      if (!existing) {
        cachedProximaFatura.set(f.conta_id, {
          valor: Number(f.valor_total || 0),
          dataVencimento: f.data_vencimento,
          status: f.status,
        });
      } else if (isFuture && existing.dataVencimento < today) {
        // Achou uma futura — substitui vencida antiga
        cachedProximaFatura.set(f.conta_id, {
          valor: Number(f.valor_total || 0),
          dataVencimento: f.data_vencimento,
          status: f.status,
        });
      }
    }
  }
}

async function loadCompromissosContas(contaIds) {
  cachedCompromissosContas = new Map();
  if (!contaIds.length) return;
  const { data, error } = await supabase
    .from('subcategorias')
    .select('conta_id, valor_base, moeda')
    .in('conta_id', contaIds)
    .eq('status', 'ativa');
  if (error) { console.warn('[loadCompromissosContas]', error); return; }

  await ensureRates((data || []).map((s) => s.moeda));
  for (const s of (data || [])) {
    const prev = cachedCompromissosContas.get(s.conta_id) || { comprometido: 0, count: 0 };
    cachedCompromissosContas.set(s.conta_id, {
      comprometido: prev.comprometido + toBRL(s.valor_base, s.moeda),
      count: prev.count + 1,
    });
  }
}

async function loadContas() {
  const container = document.getElementById('contas-container');
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span>Carregando contas…</div>';

  // On-demand: fecha faturas vencidas (Fase 4) — fire-and-forget
  checkAndCloseFaturas()
    .then((n) => { if (n > 0) showToast(`${n} fatura${n > 1 ? 's' : ''} de cartão fechada${n > 1 ? 's' : ''} — confira em Pagamentos`, 'success', 5000); })
    .catch((e) => console.warn('[checkAndCloseFaturas]', e));

  // Garante sub "Fatura {X}" pra cada cartão existente — cobre cartões
  // que ainda não tiveram fatura fechada (sem isso, o pagamento mensal
  // do cartão não é gerado em Pagamentos). Fire-and-forget é OK aqui:
  // a UI de Contas não depende dessa sub pra renderizar.
  ensureSubcategoriasFaturas()
    .catch((e) => console.warn('[ensureSubcategoriasFaturas]', e));

  const { data, error } = await supabase
    .from('contas')
    .select('*')
    .order('nome', { ascending: true });

  if (error) {
    console.error('[loadContas] falhou:', error);
    container.innerHTML = '';
    showToast(`${t('contas.toast.erro_carregar', 'Erro ao carregar contas')}: ${error.message}`, 'error', 10000);
    return;
  }

  cachedContas = data || [];

  // Carrega dados dos cartões antes de renderizar
  const cartaoIds = cachedContas
    .filter((c) => c.tipo === 'Cartão de Crédito')
    .map((c) => c.id);
  // Carrega saldos + snapshots de TODAS contas ativas (pra KPI consolidado de conciliação)
  const activeContaIds = cachedContas.filter((c) => c.status === 'ativa').map((c) => c.id);
  await Promise.all([
    loadFaturasAbertas(cartaoIds),
    loadCompromissosContas(cartaoIds),
    loadSaldos(activeContaIds),  // loadSaldos já dispara loadSnapshots em paralelo
    loadIndicadoresImportacao(activeContaIds),
  ]);

  renderContas();
  renderConciliacaoKpi();
  renderCaixinhasSection(); // fire-and-forget — carrega dados e preenche #caixinhas-section
}

/**
 * Renderiza o KPI consolidado de conciliação bancária no topo da página.
 * Mostra: total nas contas + última conciliação + diferença total.
 */
function renderConciliacaoKpi() {
  const container = document.getElementById('conciliacao-kpi-container');
  if (!container) return;
  // Considera apenas contas ativas com saldo conhecido
  const contasAtivas = cachedContas.filter((c) => c.status === 'ativa' && cachedSaldos.has(c.id));
  if (contasAtivas.length === 0) {
    container.innerHTML = '';
    return;
  }
  let totalCalculado = 0;
  let totalBanco = 0;
  let contasComSnapshot = 0;
  let maxData = null;
  for (const c of contasAtivas) {
    const saldo = cachedSaldos.get(c.id) ?? 0;
    totalCalculado += Number(saldo);
    const snap = cachedSnapshots.get(c.id);
    if (snap) {
      totalBanco += Number(snap.saldo);
      contasComSnapshot++;
      if (!maxData || snap.data > maxData) maxData = snap.data;
    }
  }
  const diff = totalCalculado - totalBanco;
  const bate = Math.abs(diff) < 0.005;
  const semSnapshots = contasComSnapshot === 0;
  let diffHtml;
  if (semSnapshots) {
    diffHtml = `<span class="conciliacao-kpi-sub">Nenhuma conciliação ainda — importe um extrato pra começar</span>`;
  } else {
    const diffSign = diff < 0 ? '-' : (diff > 0 ? '+' : '');
    const dataLabel = maxData ? (() => { const [yy, mm, dd] = maxData.split('-'); return `${dd}/${mm}/${yy.slice(2)}`; })() : '—';
    diffHtml = `
      <span class="conciliacao-kpi-sub">${contasComSnapshot} de ${contasAtivas.length} contas conciliadas · última: ${dataLabel}</span>
      <span class="conciliacao-kpi-diff ${bate ? 'is-ok' : 'is-diff'}">${bate ? '✓ Tudo bate' : `Diferença: ${diffSign}${formatCurrencyHTML(Math.abs(diff), 'BRL')}`}</span>
    `;
  }
  container.innerHTML = `
    <div class="conciliacao-kpi">
      <span class="conciliacao-kpi-icon">🏦</span>
      <div class="conciliacao-kpi-body">
        <div class="conciliacao-kpi-title">Patrimônio nas contas: ${formatCurrencyHTML(totalCalculado, 'BRL')}</div>
        ${diffHtml}
      </div>
    </div>
  `;
}

function renderContas() {
  const container = document.getElementById('contas-container');
  const emptyState = document.getElementById('empty-state');

  // Counters
  const counts = {
    todas:      cachedContas.length,
    ativa:      cachedContas.filter((c) => c.status === 'ativa').length,
    inativa:    cachedContas.filter((c) => c.status === 'inativa').length,
    arquivada:  cachedContas.filter((c) => c.status === 'arquivada').length,
  };
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.querySelector(`[data-count-status="${k}"]`);
    if (el) el.textContent = v;
  });

  // Empty global
  if (cachedContas.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  // Apply filters
  let filtered = cachedContas;
  if (filterStatus !== 'todas') {
    filtered = filtered.filter((c) => c.status === filterStatus);
  }
  if (!filterTipos.has('all')) {
    filtered = filtered.filter((c) => filterTipos.has(c.tipo));
  }

  // In individual (specific tipo) view, load saldos asynchronously then re-render cards
  const isIndividualView = !filterTipos.has('all');
  if (isIndividualView && viewMode === 'cards' && filtered.length > 0) {
    const ids = filtered.map((c) => c.id);
    // Only fetch if saldos not yet loaded for these accounts
    const needsLoad = ids.some((id) => !cachedSaldos.has(id));
    if (needsLoad) {
      loadSaldos(ids).then(() => {
        const container = document.getElementById('contas-container');
        if (container) {
          container.innerHTML = renderContasCards(filtered);
          bindCardClicks();
          attachImageErrorHandlers(container);
        }
      });
    }
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-message">Nenhuma conta com os filtros selecionados.</p>
      </div>
    `;
    return;
  }

  if (colVisEl) colVisEl.classList.toggle('hidden', viewMode !== 'table');

  if (viewMode === 'table') {
    container.innerHTML = renderContasTable(filtered);
    bindRowClicks();
  } else {
    container.innerHTML = renderContasCards(filtered);
    bindCardClicks();
  }
  attachImageErrorHandlers(container);
}

// -----------------------------
// Helpers de agrupamento
// -----------------------------
function groupContas(contas) {
  return {
    cartoes: contas.filter((c) => c.tipo === 'Cartão de Crédito'),
    outras:  contas.filter((c) => c.tipo !== 'Cartão de Crédito'),
  };
}

function renderSectionHeader(title, count) {
  return `
    <div class="section-header">
      <h2 class="section-title">${title}</h2>
      <span class="section-count">${count}</span>
      <div class="section-divider"></div>
    </div>`;
}

// -----------------------------
// Render cards view (com grupos)
// -----------------------------
function renderContasCards(contas) {
  const { cartoes, outras } = groupContas(contas);
  let html = '';

  if (cartoes.length > 0) {
    html += renderSectionHeader('Cartões de Crédito', cartoes.length);
    html += `<div class="contas-grid">${cartoes.map(renderContaCard).join('')}</div>`;
  }
  if (outras.length > 0) {
    html += renderSectionHeader('Contas', outras.length);
    html += `<div class="contas-grid">${outras.map(renderContaCard).join('')}</div>`;
  }
  return html;
}

// -----------------------------
// Render table view (com grupos)
// -----------------------------
function renderContasTable(contas) {
  const COLSPAN = 9;
  const { cartoes, outras } = groupContas(contas);

  let rows = '';
  if (cartoes.length > 0) {
    rows += `<tr class="conta-group-row"><td colspan="${COLSPAN}">Cartões de Crédito <span class="conta-group-count">${cartoes.length}</span></td></tr>`;
    rows += cartoes.map(renderContaRow).join('');
  }
  if (outras.length > 0) {
    rows += `<tr class="conta-group-row"><td colspan="${COLSPAN}">Contas <span class="conta-group-count">${outras.length}</span></td></tr>`;
    rows += outras.map(renderContaRow).join('');
  }

  return `
    <div class="contas-table-wrapper">
      <table class="contas-table">
        <thead>
          <tr>
            <th>Conta</th>
            <th data-col="tipo">Tipo</th>
            <th data-col="status">Status</th>
            <th data-col="comprometido">Comprometido</th>
            <th data-col="desde">Desde</th>
            <th data-col="fechada-em">Fechada em</th>
            <th data-col="descricao">Descrição</th>
            <th data-col="fec-fatura">Fec. fatura</th>
            <th data-col="venc-fatura">Venc. fatura</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderContaRow(conta) {
  const isInactive = conta.status !== 'ativa';
  const display = displayName(conta);
  const officialDifferent = conta.apelido && conta.apelido.trim() && conta.apelido !== conta.nome;
  const statusLabel = { ativa: 'Ativa', inativa: 'Inativa', arquivada: 'Arquivada' }[conta.status];

  return `
    <tr class="${isInactive ? 'inactive' : ''} ${conta.status === 'arquivada' ? 'arquivada' : ''}" data-id="${conta.id}">
      <td>
        <div class="conta-row-name">
          ${renderBankAvatar({ banco: conta.nome, tipo: conta.tipo, cor: conta.icone_cor, size: 'sm' })}
          <div class="conta-row-name-text">
            <span class="conta-row-name-display">${escapeHtml(display)}</span>
            ${officialDifferent ? `<span class="conta-row-name-official">${escapeHtml(conta.nome)}</span>` : ''}
          </div>
        </div>
      </td>
      <td data-col="tipo">${typePill(conta.tipo)}</td>
      <td data-col="status"><span class="status-pill status-${conta.status}">${statusLabel}</span></td>
      <td data-col="comprometido">${renderComprometidoCell(conta)}</td>
      <td data-col="desde" class="tabular">${conta.desde ? formatDateBR(conta.desde) : '—'}</td>
      <td data-col="fechada-em" class="tabular">${conta.fechada_em ? formatDateBR(conta.fechada_em) : '—'}</td>
      <td data-col="descricao" class="conta-row-desc">${conta.descricao ? escapeHtml(conta.descricao) : '<span style="color: var(--color-text-muted);">—</span>'}</td>
      <td data-col="fec-fatura" class="tabular">${conta.fec_fatura ? `Dia ${conta.fec_fatura}` : '—'}</td>
      <td data-col="venc-fatura" class="tabular">${conta.vencimento ? `Dia ${conta.vencimento}` : '—'}</td>
    </tr>
  `;
}

// Event delegation no #contas-container (estável entre renders).
function bindRowClicks() {
  const container = document.getElementById('contas-container');
  if (!container || container._delegationBound) return;
  container._delegationBound = true;

  container.addEventListener('click', (e) => {
    const row = e.target.closest('.contas-table tbody tr');
    if (!row) return;
    const conta = cachedContas.find((c) => c.id === row.dataset.id);
    if (conta) openDetailsModal(conta);
  });
}

function renderContaCard(conta) {
  const isInactive = conta.status !== 'ativa';
  // Apenas um nome — prefere apelido quando existe (não duplica)
  const display = (conta.apelido?.trim()) || conta.nome;
  const statusLabel = { ativa: 'Ativa', inativa: 'Inativa', arquivada: 'Arquivada' }[conta.status];
  const isCartao = conta.tipo === 'Cartão de Crédito';

  // Linha "Desde" + status pill
  const desdeStr = conta.desde ? formatDateBR(conta.desde) : '—';

  // Linha de datas específicas de cartão
  const faturaRow = isCartao && (conta.fec_fatura || conta.vencimento) ? `
    <div class="conta-card-row conta-card-row--datas">
      ${conta.fec_fatura ? `<span><strong>Fec. fatura:</strong> dia ${conta.fec_fatura}</span>` : ''}
      ${conta.vencimento ? `<span><strong>Venc.:</strong> dia ${conta.vencimento}</span>` : ''}
    </div>
  ` : '';

  // Fatura — sempre "Próxima fatura: R$ X" (R$ 0 se nada lançado).
  // Prioridade do valor exibido:
  //   1. Fatura fechada futura mais próxima (a que está pra pagar)
  //   2. Fatura aberta (em formação)
  //   3. Fatura fechada vencida (atraso)
  //   4. R$ 0 (nada existe)
  const faturaAbertaValor = cachedFaturasAbertas.get(conta.id);
  const proxFatura        = cachedProximaFatura.get(conta.id);
  let faturaBadge = '';
  if (isCartao) {
    const CARTAO_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`;

    // Determina valor + venc + state
    let valor = 0;
    let dataVencimento = null;
    let stateClass = '';

    if (proxFatura) {
      // Fechada (futura OU vencida)
      valor = proxFatura.valor;
      dataVencimento = proxFatura.dataVencimento;
    } else if (faturaAbertaValor !== undefined) {
      valor = faturaAbertaValor;
      // Pra fatura aberta, vencimento = dia "vencimento" do cartão no mês atual
      // (informação aproximada, não precisa ser exata)
    }

    let extra = '';
    if (dataVencimento) {
      const dias = diasAteISO(dataVencimento);
      if (dias !== null) {
        const venceStr = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : dias < 0 ? `${Math.abs(dias)}d atr.` : `em ${dias}d`;
        extra = `<span class="conta-fatura-sub">Vence ${venceStr}</span>`;
        if (dias < 0)      stateClass = ' conta-fatura-vencida';
        else if (dias <= 5) stateClass = ' conta-fatura-proxima';
      }
    }

    const label = `Próxima fatura: ${formatCurrencyHTML(valor)}`;
    faturaBadge = `<button type="button" class="conta-fatura-badge${stateClass}" data-action="ver-faturas" data-conta-id="${conta.id}" title="Ver todas as faturas">
      ${CARTAO_SVG}
      <span>${label}</span>
      ${extra}
    </button>`;
  }

  const comprometidoBadge = renderComprometidoBadge(conta);

  // Saldo (só conta não-cartão)
  const saldo = cachedSaldos.has(conta.id) ? cachedSaldos.get(conta.id) : null;
  const saldoHtml = saldo !== null && !isCartao
    ? `<div class="conta-card-row conta-card-saldo-row ${saldo < 0 ? 'is-negativo' : saldo === 0 ? 'is-zero' : ''}">
        <span class="conta-card-row-label">Saldo atual</span>
        <span class="conta-card-saldo-valor">${formatCurrencyHTML(saldo, conta.moeda)}</span>
       </div>`
    : '';

  // Conciliação com banco (snapshot OFX — padrão Xero)
  const snap = cachedSnapshots.get(conta.id);
  let conciliacaoHtml;
  const BANK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align:-3px;margin-right:4px;"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/></svg>`;
  if (snap) {
    const diff = (saldo ?? 0) - Number(snap.saldo);
    const bate = Math.abs(diff) < 0.005;
    const diffAbs = Math.abs(diff);
    const diffSign = diff < 0 ? '-' : (diff > 0 ? '+' : '');
    const [, m, d] = snap.data.split('-');
    conciliacaoHtml = `
      <div class="conta-conciliacao">
        <div class="conta-conciliacao-row">
          <span class="conta-conciliacao-label">${BANK_ICON}Banco (${d}/${m})</span>
          <span class="conta-conciliacao-valor">${formatCurrencyHTML(snap.saldo, snap.moeda || conta.moeda)}</span>
        </div>
        <div class="conta-conciliacao-row conta-conciliacao-diff ${bate ? 'is-ok' : 'is-diff'}">
          <span class="conta-conciliacao-label">Diferença</span>
          <span class="conta-conciliacao-valor">${bate ? '✓ Bate' : `${diffSign}${formatCurrencyHTML(diffAbs, conta.moeda)}`}</span>
        </div>
      </div>`;
  } else {
    conciliacaoHtml = `
      <div class="conta-conciliacao conta-conciliacao--empty">
        <span class="conta-conciliacao-label">${BANK_ICON}Banco: —</span>
        <span class="conta-conciliacao-cta">Importe um extrato pra comparar</span>
      </div>`;
  }

  return `
    <div class="conta-card-v2 ${isInactive ? 'inactive' : ''} ${conta.status === 'arquivada' ? 'arquivada' : ''}" data-id="${conta.id}" tabindex="0" role="button" aria-label="Ver detalhes de ${escapeHtml(display)}">
      <span class="ver-mais-hint">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/></svg>
        Ver detalhes
      </span>

      <!-- TOPO: avatar + nome + tipo -->
      <div class="conta-card-top">
        ${renderBankAvatar({ banco: conta.nome, tipo: conta.tipo, cor: conta.icone_cor, size: 'md' })}
        <div class="conta-card-top-info">
          <h3 class="conta-card-name">${escapeHtml(display)}</h3>
          <div class="conta-card-tipo-wrap">${typePill(conta.tipo)}</div>
        </div>
      </div>

      <!-- CORPO -->
      <div class="conta-card-body">
        <div class="conta-card-row conta-card-row--meta">
          <span><strong>Desde:</strong> ${desdeStr}</span>
          <span class="status-pill status-${conta.status}">${statusLabel}</span>
        </div>
        ${faturaRow}
        ${saldoHtml}
        ${faturaBadge}
        ${comprometidoBadge}
        ${conciliacaoHtml}
        ${renderIndicadoresImportacao(conta)}
      </div>
    </div>
  `;
}

/**
 * 2 badges no card de conta:
 *  - Importação pendente: N transações importadas esperando reconciliação
 *  - Status temporal: "Última importação: DD/MM" (em dia) ou "Atrasada há Xd" (vermelho)
 *
 * Trata frequencia_importacao_dias=null como 30 (mensal) por default.
 * Pra desativar lembretes de uma conta o user precisa marcar "Não lembrar"
 * em /configuracoes → Importações (que NÃO grava null mais — gravamos null
 * só pra contas arquivadas).
 */
function renderIndicadoresImportacao(conta) {
  const pendentes = cachedReconPendentes.get(conta.id) || 0;
  const ultIso    = cachedUltimasImportacoes.get(conta.id);
  // Semântica:
  //   null → default mensal (30)
  //   0    → usuário desabilitou (não mostra indicador temporal)
  //   N    → a cada N dias
  const rawFreq = conta.frequencia_importacao_dias;
  const freq    = rawFreq == null ? 30 : rawFreq;
  const lembreteDesativado = rawFreq === 0;

  const parts = [];

  // Indicador 1: pendentes de reconciliação
  if (pendentes > 0) {
    parts.push(`
      <a href="/transacoes.html" class="conta-indicador conta-indicador--pendente" title="Confirme essas transações em Transações">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        ${pendentes} pendente${pendentes > 1 ? 's' : ''} de reconciliação
      </a>`);
  }

  // Indicador 2: status temporal de importação
  let diasDesde = null;
  if (ultIso) {
    const d = new Date(ultIso);
    diasDesde = Math.round((Date.now() - d.getTime()) / 86400000);
  }
  if (lembreteDesativado && ultIso) {
    // Usuário desativou o lembrete mas já importou alguma vez — mostra info neutra
    const yyyy = ultIso.slice(0, 4), mm = ultIso.slice(5, 7), dd = ultIso.slice(8, 10);
    parts.push(`
      <span class="conta-indicador conta-indicador--alerta" title="Lembrete desativado — última importação registrada">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        Última: ${dd}/${mm}/${yyyy.slice(2)} (lembrete off)
      </span>`);
  } else if (!lembreteDesativado && diasDesde == null) {
    parts.push(`
      <a href="/importar.html" class="conta-indicador conta-indicador--alerta" title="Nunca importou extrato dessa conta — clique pra importar agora">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        Nunca importado
      </a>`);
  } else if (!lembreteDesativado && diasDesde <= freq) {
    const yyyy = ultIso.slice(0, 4), mm = ultIso.slice(5, 7), dd = ultIso.slice(8, 10);
    parts.push(`
      <span class="conta-indicador conta-indicador--ok" title="Importação em dia (frequência: a cada ${freq} dias)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
        Última importação: ${dd}/${mm}/${yyyy.slice(2)}
      </span>`);
  } else if (!lembreteDesativado) {
    const atrasado = diasDesde - freq;
    parts.push(`
      <a href="/importar.html" class="conta-indicador conta-indicador--atrasada" title="Importação atrasada — clique pra importar agora">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Importação atrasada há ${atrasado}d
      </a>`);
  }

  if (parts.length === 0) return '';
  return `<div class="conta-indicadores-row">${parts.join('')}</div>`;
}

// -----------------------------
// Modal de faturas do cartão (aberta + projetadas + fechadas)
// Pattern: mesmo padrão de innerHTML usado em todo o codebase. Valores
// controlados pelo user (apelido, nome) passam por escapeHtml; valores
// numéricos por formatCurrencyHTML (já safe). Status/mesRef são internos.
// -----------------------------
const MES_ABREV_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
function fmtMesRef(mesRef) {
  if (!mesRef) return '';
  const [y, m] = mesRef.split('-').map(Number);
  return `${MES_ABREV_PT[m - 1]}/${y}`;
}
function statusPillFatura(status) {
  if (status === 'aberta')     return '<span class="cartao-fatura-status status-aberta">Aberta</span>';
  if (status === 'projetada')  return '<span class="cartao-fatura-status status-pendente">Projetada</span>';
  if (status === 'fechada')    return '<span class="cartao-fatura-status status-paga">Fechada</span>';
  return '';
}

async function openFaturasModal(contaId) {
  const body = document.getElementById('modal-cartao-faturas-body');
  const title = document.getElementById('modal-cartao-faturas-title');
  body.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> Carregando…</div>';
  openModal('modal-cartao-faturas');

  const { ok, faturas, conta, error } = await listFaturasConhecidas(contaId, { mesesFuturo: 6 });
  if (!ok) {
    body.innerHTML = `<div class="cartao-faturas-empty">Não foi possível carregar: ${escapeHtml(error || 'erro desconhecido')}</div>`;
    return;
  }
  title.textContent = `Faturas — ${conta.apelido || conta.nome}`;

  const aberta     = faturas.filter((f) => f.status === 'aberta');
  const projetadas = faturas.filter((f) => f.status === 'projetada');
  const fechadas   = faturas.filter((f) => f.status === 'fechada');

  const sections = [];

  if (aberta.length > 0) {
    sections.push(`
      <h3 class="cartao-faturas-subtitle">Fatura aberta</h3>
      ${aberta.map(renderFaturaCardAberta).join('')}
    `);
  }

  if (projetadas.length > 0) {
    sections.push(`
      <h3 class="cartao-faturas-subtitle">Próximas (projetadas)</h3>
      <table class="cartao-faturas-tabela">
        <thead>
          <tr><th>Mês</th><th>Vence</th><th>Itens conhecidos</th><th style="text-align:right">Valor projetado</th></tr>
        </thead>
        <tbody>
          ${projetadas.map(renderFaturaRowProjetada).join('')}
        </tbody>
      </table>
      <p class="cartao-faturas-empty" style="font-size:var(--fs-xs); margin-top:var(--space-2);">
        * Valor projetado considera apenas compromissos recorrentes neste cartão. Parcelamentos de compras individuais ainda não são projetados.
      </p>
    `);
  }

  if (fechadas.length > 0) {
    sections.push(`
      <h3 class="cartao-faturas-subtitle">Fechadas</h3>
      <table class="cartao-faturas-tabela">
        <thead>
          <tr><th>Mês</th><th>Venceu</th><th style="text-align:right">Valor</th><th></th></tr>
        </thead>
        <tbody>
          ${fechadas.map(renderFaturaRowFechada).join('')}
        </tbody>
      </table>
    `);
  }

  if (sections.length === 0) {
    body.innerHTML = '<div class="cartao-faturas-empty">Nenhuma fatura registrada ainda. Adicione transações neste cartão para que faturas sejam criadas automaticamente.</div>';
    return;
  }

  body.innerHTML = sections.join('');
}

function renderFaturaCardAberta(f) {
  return `
    <div class="cartao-fatura-aberta-card">
      <div class="cartao-fatura-aberta-header">
        <span class="cartao-fatura-mes">${fmtMesRef(f.mesReferencia)}</span>
        ${statusPillFatura(f.status)}
      </div>
      <div class="cartao-fatura-aberta-valor">${formatCurrencyHTML(f.valor)}</div>
      <div class="cartao-fatura-aberta-info">
        <div>
          <span class="cf-label">Fechamento</span>
          <span class="cf-value">${formatDateBR(f.dataFechamento)}</span>
        </div>
        <div>
          <span class="cf-label">Vencimento</span>
          <span class="cf-value">${formatDateBR(f.dataVencimento)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderFaturaRowProjetada(f) {
  const itens = (f.transacoes || []).length;
  const itensTxt = itens === 0
    ? '<span class="cf-sub">nenhum recorrente</span>'
    : `${itens} recorrente${itens > 1 ? 's' : ''}`;
  return `
    <tr>
      <td class="cf-td-data">${fmtMesRef(f.mesReferencia)}</td>
      <td class="cf-td-data">${formatDateBR(f.dataVencimento)}</td>
      <td>${itensTxt}</td>
      <td class="cf-td-valor" style="text-align:right">${formatCurrencyHTML(f.valor)}</td>
    </tr>
  `;
}

function renderFaturaRowFechada(f) {
  return `
    <tr>
      <td class="cf-td-data">${fmtMesRef(f.mesReferencia)}</td>
      <td class="cf-td-data">${formatDateBR(f.dataVencimento)}</td>
      <td class="cf-td-valor" style="text-align:right">${formatCurrencyHTML(f.valor)}</td>
      <td>${statusPillFatura(f.status)}</td>
    </tr>
  `;
}

function bindCardClicks() {
  document.querySelectorAll('.conta-card-v2').forEach((card) => {
    card.addEventListener('click', (e) => {
      // Badge "Ver faturas" tem handler próprio (não abre details modal)
      if (e.target.closest('[data-action="ver-faturas"]')) {
        e.stopPropagation();
        const btn = e.target.closest('[data-action="ver-faturas"]');
        openFaturasModal(btn.dataset.contaId);
        return;
      }
      const conta = cachedContas.find((c) => c.id === card.dataset.id);
      if (conta) openDetailsModal(conta);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const conta = cachedContas.find((c) => c.id === card.dataset.id);
        if (conta) openDetailsModal(conta);
      }
    });
  });
}

// -----------------------------
// Comprometido helpers
// -----------------------------
function comprometidoBarColor(pct) {
  return pct >= 90 ? 'var(--color-danger)' : pct >= 70 ? 'var(--color-warning)' : 'var(--color-success)';
}

function renderComprometidoBadge(conta) {
  if (conta.tipo !== 'Cartão de Crédito') return '';
  const data = cachedCompromissosContas.get(conta.id);
  if (!data || data.comprometido === 0) return '';
  const { comprometido, count } = data;
  const label = `${count} compromisso${count > 1 ? 's' : ''}: ${formatCurrencyHTML(comprometido)}`;
  if (conta.limite) {
    const pct = Math.min(100, Math.round((comprometido / conta.limite) * 100));
    return `
      <div class="conta-comprometido-badge">
        <div class="ccb-row">
          <span class="ccb-label">${label}</span>
          <span class="ccb-pct">${pct}%</span>
        </div>
        <div class="ccb-bar-track"><div class="ccb-bar-fill" style="width:${pct}%; background:${comprometidoBarColor(pct)};"></div></div>
      </div>`;
  }
  return `<div class="conta-comprometido-badge"><span class="ccb-label">${label}</span></div>`;
}

function renderComprometidoCell(conta) {
  if (conta.tipo !== 'Cartão de Crédito') return '<span style="color:var(--color-text-muted);">—</span>';
  const data = cachedCompromissosContas.get(conta.id);
  if (!data || data.comprometido === 0) return '<span style="color:var(--color-text-muted);">—</span>';
  const { comprometido } = data;
  if (conta.limite) {
    const pct = Math.min(100, Math.round((comprometido / conta.limite) * 100));
    return `
      <div class="ccb-table-cell">
        <span class="ccb-table-val">${formatCurrencyHTML(comprometido)} <span class="ccb-table-pct">${pct}%</span></span>
        <div class="ccb-bar-track" style="margin-top:4px;"><div class="ccb-bar-fill" style="width:${pct}%; background:${comprometidoBarColor(pct)};"></div></div>
      </div>`;
  }
  return `<span>${formatCurrencyHTML(comprometido)}</span>`;
}

// -----------------------------
// Bank avatar render
// -----------------------------
// ─────────────────────────────────────────────────────────────────────────────
// CAIXINHAS — seção dedicada abaixo das contas normais
// ─────────────────────────────────────────────────────────────────────────────

async function renderCaixinhasSection() {
  const section = document.getElementById('caixinhas-section');
  if (!section) return;

  const user = await getCurrentUser();
  if (!user) return;

  // 1. Subcategorias tipo='Caixinha' ativas
  const { data: caixinhas } = await supabase
    .from('subcategorias')
    .select('id, nome, apelido, categoria_id, conta_id, conta_destino_id, valor_base, valor_variavel, moeda, periodo, vencimento_dia, dia_semana, intervalo_semanas, iniciado_em, terminado_em, descricao, tipo_pagamento, status, tipo')
    .eq('tipo', 'Caixinha')
    .eq('status', 'ativa')
    .order('nome');

  if (!caixinhas?.length) { cachedCaixinhas = []; section.innerHTML = ''; return; }
  cachedCaixinhas = caixinhas;

  const subIds = caixinhas.map((c) => c.id);

  // 2. Saldo acumulado = soma de pagamentos Transferido
  const { data: pagsTrn } = await supabase
    .from('pagamentos')
    .select('subcategoria_id, valor_real')
    .eq('status', 'Transferido')
    .in('subcategoria_id', subIds);

  const saldoMap = new Map(subIds.map((id) => [id, 0]));
  for (const p of (pagsTrn || [])) {
    saldoMap.set(p.subcategoria_id, (saldoMap.get(p.subcategoria_id) || 0) + Number(p.valor_real || 0));
  }

  // 3. Contribuição do mês atual (previsto ou real, não cancelados)
  const now    = new Date();
  const mesAno = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const { data: pagsMes } = await supabase
    .from('pagamentos')
    .select('subcategoria_id, valor_previsto, valor_real, status')
    .eq('mes_ano', mesAno)
    .neq('status', 'Cancelado')
    .in('subcategoria_id', subIds);

  const contribMap = new Map(subIds.map((id) => [id, 0]));
  for (const p of (pagsMes || [])) {
    const val = Number(p.valor_real ?? p.valor_previsto) || 0;
    contribMap.set(p.subcategoria_id, (contribMap.get(p.subcategoria_id) || 0) + val);
  }

  // 4. Histórico — últimas 5 transferências Transferido por caixinha
  const { data: pagsHist } = await supabase
    .from('pagamentos')
    .select('subcategoria_id, data_vencimento, valor_real')
    .eq('status', 'Transferido')
    .in('subcategoria_id', subIds)
    .order('data_vencimento', { ascending: false })
    .limit(subIds.length * 5);

  const histMap = new Map(subIds.map((id) => [id, []]));
  for (const p of (pagsHist || [])) {
    const arr = histMap.get(p.subcategoria_id);
    if (arr && arr.length < 5) arr.push(p);
  }

  cachedCaixinhasMaps = { saldo: saldoMap, contrib: contribMap, hist: histMap };

  section.innerHTML = `
    <div class="caixinhas-section-wrapper">
      ${renderSectionHeader('Caixinhas', caixinhas.length)}
      <div class="caixinhas-grid">
        ${caixinhas.map((cx) => renderCaixinhaCard(cx, saldoMap, contribMap, histMap)).join('')}
      </div>
    </div>
  `;
  bindCaixinhaCardClicks();
}

function bindCaixinhaCardClicks() {
  document.querySelectorAll('.caixinha-card').forEach((card) => {
    card.addEventListener('click', () => {
      const cx = cachedCaixinhas.find((c) => c.id === card.dataset.id);
      if (cx) openCaixinhaDetailsModal(cx);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const cx = cachedCaixinhas.find((c) => c.id === card.dataset.id);
        if (cx) openCaixinhaDetailsModal(cx);
      }
    });
  });
}

let detailsCaixinha = null;

async function openCaixinhaDetailsModal(cx) {
  detailsCaixinha = cx;
  const display = cx.apelido?.trim() || cx.nome;
  const saldo   = cachedCaixinhasMaps.saldo.get(cx.id) ?? 0;
  const contrib = cachedCaixinhasMaps.contrib.get(cx.id) ?? 0;

  const contaReserva = cx.conta_destino_id ? cachedContas.find((c) => c.id === cx.conta_destino_id) : null;
  const contaOrigem  = cx.conta_id ? cachedContas.find((c) => c.id === cx.conta_id) : null;

  // Avatar (piggy bank)
  document.getElementById('cx-details-avatar').innerHTML = `
    <div class="caixinha-card-icon" style="width:64px;height:64px;color:#F59E0B;">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.6.5 2.8 1.5 3.8L4 18h3l1-1.7c1 .4 2 .7 3 .7s2-.3 3-.7L15 18h3l-1.5-2.2c.7-.7 1.2-1.5 1.5-2.3 1 0 2-1 2-2v-2c0-1-1-2-2-2 0-1-1-2.5-1-2.5z"/><circle cx="16" cy="10" r="0.5" fill="currentColor"/><path d="M2 11v1c0 1 1 2 2 2"/></svg>
    </div>
  `;

  document.getElementById('cx-details-name').textContent = display;
  const officialEl = document.getElementById('cx-details-official-name');
  if (cx.apelido && cx.apelido.trim() && cx.apelido !== cx.nome) {
    officialEl.textContent = `Nome oficial: ${cx.nome}`;
    officialEl.classList.remove('hidden');
  } else {
    officialEl.textContent = '';
  }

  const statusLabel = { ativa: 'Ativa', inativa: 'Inativa', arquivada: 'Arquivada' }[cx.status] || cx.status;
  document.getElementById('cx-details-meta').innerHTML = `
    <span class="status-pill" style="background: var(--color-warning-bg); color: var(--color-warning-text);">
      <span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span>Caixinha
    </span>
    <span class="status-pill status-${cx.status}">${statusLabel}</span>
  `;

  // Saldo destaque
  const saldoCls = saldo < 0 ? 'negativo' : saldo === 0 ? 'zero' : 'positivo';
  document.getElementById('cx-details-saldo-card').innerHTML = `
    <div class="cx-saldo-row">
      <div>
        <span class="caixinha-stat-label">Saldo acumulado</span>
        <span class="caixinha-stat-valor ${saldoCls}" style="font-size: var(--fs-2xl);">${formatCurrencyHTML(saldo)}</span>
      </div>
      ${contrib > 0 ? `
        <div>
          <span class="caixinha-stat-label">Contribuição este mês</span>
          <span class="caixinha-stat-valor">${formatCurrencyHTML(contrib)}</span>
        </div>` : ''}
    </div>
  `;

  // Vencimento
  let venc = '—';
  if (cx.periodo === 'Semanal' || cx.periodo === 'Quinzenal') {
    if (cx.dia_semana != null) {
      const dias = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
      const n = Number(cx.intervalo_semanas) || 1;
      venc = cx.periodo === 'Quinzenal' ? `Toda outra ${dias[cx.dia_semana]}` : (n > 1 ? `A cada ${n} semanas (${dias[cx.dia_semana]})` : `Toda ${dias[cx.dia_semana]}`);
    }
  } else if (cx.vencimento_dia) {
    venc = `Dia ${cx.vencimento_dia}`;
  }

  const valorLabel = cx.valor_variavel ? 'Valor (varia por mês)' : 'Valor base';
  const valorDisplay = cx.valor_variavel ? '—' : formatCurrency(Number(cx.valor_base) || 0, cx.moeda);

  const fields = [
    { label: 'Conta Reserva', value: contaReserva ? (contaReserva.apelido?.trim() || contaReserva.nome) : null },
    { label: 'Banco/Cartão de origem', value: contaOrigem ? (contaOrigem.apelido?.trim() || contaOrigem.nome) : null },
    { label: 'Tipo de pagamento', value: cx.tipo_pagamento || null },
    { label: 'Período', value: cx.periodo || null },
    { label: 'Vencimento', value: venc },
    { label: valorLabel, value: valorDisplay },
    { label: 'Iniciada em', value: cx.iniciado_em ? formatDateBR(cx.iniciado_em) : null },
    { label: 'Termina em', value: cx.terminado_em ? formatDateBR(cx.terminado_em) : 'Em curso' },
    { label: 'Descrição', value: cx.descricao, full: true },
  ];

  document.getElementById('cx-details-grid').innerHTML = fields.map((f) => `
    <div class="details-field" ${f.full ? 'style="grid-column: 1 / -1;"' : ''}>
      <span class="details-field-label">${f.label}</span>
      <span class="details-field-value ${!f.value ? 'details-field-empty' : ''}">${f.value ? escapeHtml(String(f.value)) : '—'}</span>
    </div>
  `).join('');

  // Histórico completo (não só 5)
  document.getElementById('cx-details-historico').innerHTML = '<div class="loading-overlay" style="position:relative;min-height:48px;"><span class="spinner"></span></div>';
  const { data: pagsFull } = await supabase
    .from('pagamentos')
    .select('id, data_vencimento, valor_real, valor_previsto, status')
    .eq('subcategoria_id', cx.id)
    .eq('status', 'Transferido')
    .order('data_vencimento', { ascending: false });

  const histEl = document.getElementById('cx-details-historico');
  if (!pagsFull?.length) {
    histEl.innerHTML = '<p class="cartao-faturas-empty">Nenhuma transferência registrada.</p>';
  } else {
    histEl.innerHTML = pagsFull.map((p) => `
      <div class="caixinha-trn-row">
        <span class="caixinha-trn-data">${formatDateBR(p.data_vencimento)}</span>
        <span class="caixinha-trn-desc">Transferência</span>
        <span class="caixinha-trn-valor positivo">${formatCurrencyHTML(Number(p.valor_real || 0))}</span>
      </div>`).join('');
  }

  openModal('modal-caixinha-details');
}

// -------------------------------------------------------
// Resgate de Caixinha
// -------------------------------------------------------
let resgateCaixinha = null;

function openCaixinhaResgateModal(cx) {
  resgateCaixinha = cx;
  const saldo = cachedCaixinhasMaps.saldo.get(cx.id) ?? 0;
  const display = cx.apelido?.trim() || cx.nome;

  // Conta reserva é obrigatória — sem ela não tem de onde sair o dinheiro
  const contaReserva = cx.conta_destino_id ? cachedContas.find((c) => c.id === cx.conta_destino_id) : null;
  if (!contaReserva) {
    showToast('Esta caixinha não tem conta reserva configurada. Edite a caixinha primeiro.', 'error', 7000);
    return;
  }

  document.getElementById('cx-resg-info').innerHTML =
    `Resgatando da caixinha <strong>${escapeHtml(display)}</strong>. Cria uma transferência da conta reserva para a conta de destino e reduz o saldo acumulado da caixinha.`;

  document.getElementById('cx-resg-origem').textContent = contaReserva.apelido?.trim() || contaReserva.nome;

  document.getElementById('cx-resg-saldo-hint').textContent =
    `Saldo acumulado na caixinha: ${formatCurrency(saldo, cx.moeda || 'BRL')}`;

  const valorInput = document.getElementById('cx-resg-valor');
  valorInput.value = '';
  valorInput.max  = saldo > 0 ? saldo : '';

  // Conta destino: ativas, exceto Cofrinhos e a própria conta reserva
  const contaSel = document.getElementById('cx-resg-conta');
  const defaultDest = cx.conta_id; // banco/cartão de origem da caixinha
  const opcoes = cachedContas
    .filter((c) => c.status === 'ativa' && c.tipo !== 'Cofrinho' && c.id !== cx.conta_destino_id)
    .map((c) => {
      const name = c.apelido?.trim() || c.nome;
      const sel  = c.id === defaultDest ? ' selected' : '';
      return `<option value="${c.id}"${sel}>${escapeHtml(name)}</option>`;
    }).join('');
  contaSel.innerHTML = opcoes || '<option value="">Nenhuma conta disponível</option>';

  document.getElementById('cx-resg-data').value = todayISO();
  document.getElementById('cx-resg-descricao').value = '';

  openModal('modal-cx-resgate');
}

async function submitCaixinhaResgate() {
  if (!resgateCaixinha) return;
  const cx = resgateCaixinha;
  const valor = Number(document.getElementById('cx-resg-valor').value);
  const contaDestId = document.getElementById('cx-resg-conta').value;
  const data = document.getElementById('cx-resg-data').value;
  const descricao = document.getElementById('cx-resg-descricao').value.trim();
  const saldoAtual = cachedCaixinhasMaps.saldo.get(cx.id) ?? 0;

  if (!(valor > 0)) { showToast('Informe um valor maior que zero.', 'error', 5000); return; }
  if (!contaDestId) { showToast('Escolha a conta de destino.', 'error', 5000); return; }
  if (!data) { showToast('Escolha a data do resgate.', 'error', 5000); return; }
  if (saldoAtual <= 0) {
    showToast('Esta caixinha não tem saldo disponível para resgate.', 'error', 6000);
    return;
  }
  if (valor > saldoAtual) {
    showToast(`Valor maior que o saldo disponível (${formatCurrency(saldoAtual, cx.moeda || 'BRL')}).`, 'error', 6000);
    return;
  }

  const user = await getCurrentUser();
  if (!user) return;

  const btn = document.getElementById('btn-cx-resg-confirmar');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    // mes_ano = primeiro dia do mês da data
    const d = new Date(data + 'T00:00:00');
    const mesAno = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const bloco  = d.getDate() <= 15 ? 1 : 2;

    // Busca ou cria orcamento_geral para a caixinha no mês
    let orcId;
    const { data: orcExistente } = await supabase
      .from('orcamento_geral')
      .select('id')
      .eq('subcategoria_id', cx.id)
      .eq('mes_ano', mesAno)
      .maybeSingle();

    if (orcExistente) {
      orcId = orcExistente.id;
    } else {
      const { data: novoOrc, error: orcErr } = await supabase
        .from('orcamento_geral')
        .insert({
          user_id:         user.id,
          workspace_id:    requireWorkspaceId(),
          subcategoria_id: cx.id,
          mes_ano:         mesAno,
          valor_previsto:  0,
          moeda:           cx.moeda || 'BRL',
        })
        .select('id')
        .single();
      if (orcErr) throw orcErr;
      orcId = novoOrc.id;
    }

    // Insere o pagamento com valor_real NEGATIVO — reduz o saldo lógico da caixinha
    const obs = descricao
      ? `Resgate: ${descricao}`
      : 'Resgate da caixinha';

    const { data: pagInserted, error: pagErr } = await supabase.from('pagamentos').insert({
      user_id:         user.id,
      workspace_id:    requireWorkspaceId(),
      created_by:      user.id,
      marked_paid_by:  user.id,
      marked_paid_at:  new Date().toISOString(),
      orcamento_id:    orcId,
      subcategoria_id: cx.id,
      mes_ano:         mesAno,
      bloco_quinzenal: bloco,
      valor_previsto:  0,
      valor_real:      -Math.abs(valor),
      moeda:           cx.moeda || 'BRL',
      status:          'Transferido',
      data_vencimento: data,
      observacao:      obs,
    }).select('id').single();
    if (pagErr) throw pagErr;

    // Par de transações tipo Transferência (simétrico ao abastecimento):
    //   saída: conta_reserva → conta_destino   (deduz saldo da reserva)
    //   entrada: conta_destino                  (acrescenta saldo no destino)
    // Vinculadas por transferencia_par_id em ambos os sentidos.
    const _wsId = requireWorkspaceId();
    const { data: saida, error: saidaErr } = await supabase
      .from('transacoes')
      .insert({
        user_id:              user.id,
        workspace_id:         _wsId,
        created_by:           user.id,
        data,
        tipo:                 'Transferência',
        valor:                valor,
        moeda:                cx.moeda || 'BRL',
        conta_id:             cx.conta_destino_id,
        conta_destino_id:     contaDestId,
        subcategoria_id:      cx.id,
        pagamento_id:         pagInserted.id,
        descricao:            obs,
        reconciliacao_status: 'manual',
      })
      .select('id')
      .single();
    if (saidaErr) throw saidaErr;

    const { data: entrada, error: entradaErr } = await supabase
      .from('transacoes')
      .insert({
        user_id:              user.id,
        workspace_id:         _wsId,
        created_by:           user.id,
        data,
        tipo:                 'Transferência',
        valor:                valor,
        moeda:                cx.moeda || 'BRL',
        conta_id:             contaDestId,
        transferencia_par_id: saida.id,
        subcategoria_id:      cx.id,
        pagamento_id:         pagInserted.id,
        descricao:            obs,
        reconciliacao_status: 'manual',
      })
      .select('id')
      .single();
    if (entradaErr) throw entradaErr;

    // Fecha o par: aponta a saída pra entrada também
    await supabase.from('transacoes').update({ transferencia_par_id: entrada.id }).eq('id', saida.id);

    showToast(`Resgate de ${formatCurrency(valor, cx.moeda || 'BRL')} registrado.`, 'success', 5000);
    closeModal('modal-cx-resgate');
    closeModal('modal-caixinha-details');
    await renderCaixinhasSection();
  } catch (err) {
    console.error('[submitCaixinhaResgate]', err);
    showToast('Erro ao salvar resgate: ' + (err.message || JSON.stringify(err)), 'error', 8000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar resgate';
  }
}

function renderCaixinhaCard(cx, saldoMap, contribMap, histMap) {
  const display  = cx.apelido?.trim() || cx.nome;
  const saldo    = saldoMap.get(cx.id) ?? 0;
  const contrib  = contribMap.get(cx.id) ?? 0;
  const hist     = histMap.get(cx.id) || [];

  const contaReserva = cx.conta_destino_id
    ? cachedContas.find((c) => c.id === cx.conta_destino_id) : null;
  const reservaName  = contaReserva ? (contaReserva.apelido?.trim() || contaReserva.nome) : null;

  const trnRows = hist.map((p) => `
    <div class="caixinha-trn-row">
      <span class="caixinha-trn-data">${formatDateBR(p.data_vencimento)}</span>
      <span class="caixinha-trn-desc">Transferência</span>
      <span class="caixinha-trn-valor positivo">${formatCurrencyHTML(Number(p.valor_real || 0))}</span>
    </div>`).join('');

  return `
    <div class="caixinha-card" data-id="${cx.id}" tabindex="0" role="button" aria-label="Ver detalhes da caixinha ${escapeHtml(display)}">
      <div class="caixinha-card-top">
        <div class="caixinha-card-icon" style="color: #F59E0B;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.6.5 2.8 1.5 3.8L4 18h3l1-1.7c1 .4 2 .7 3 .7s2-.3 3-.7L15 18h3l-1.5-2.2c.7-.7 1.2-1.5 1.5-2.3 1 0 2-1 2-2v-2c0-1-1-2-2-2 0-1-1-2.5-1-2.5z"/><circle cx="16" cy="10" r="0.5" fill="currentColor"/><path d="M2 11v1c0 1 1 2 2 2"/></svg>
        </div>
        <div class="caixinha-card-title">
          <h3 class="caixinha-card-name">${escapeHtml(display)}</h3>
          ${reservaName ? `<p class="caixinha-card-desc">Reserva: ${escapeHtml(reservaName)}</p>` : ''}
        </div>
      </div>
      <div class="caixinha-card-stats">
        <div class="caixinha-stat">
          <span class="caixinha-stat-label">Saldo acumulado</span>
          <span class="caixinha-stat-valor ${saldo < 0 ? 'negativo' : saldo === 0 ? 'zero' : 'positivo'}">${formatCurrencyHTML(saldo)}</span>
        </div>
        ${contrib > 0 ? `
        <div class="caixinha-stat">
          <span class="caixinha-stat-label">Contribuição este mês</span>
          <span class="caixinha-stat-valor">${formatCurrencyHTML(contrib)}</span>
        </div>` : ''}
      </div>
      <div class="caixinha-card-historico">
        <div class="caixinha-historico-title">Últimas transferências</div>
        ${hist.length > 0 ? trnRows : '<p class="caixinha-historico-empty">Nenhuma transferência registrada.</p>'}
      </div>
    </div>
  `;
}

function renderBankAvatar({ banco, tipo, cor, size = 'lg' }) {
  const bank = findBank(banco);
  const sizeClass = size === 'sm' ? 'size-sm' : '';
  const tipoColor = typeColor(tipo);
  const fallbackColor = cor || '#6B7280';
  const badge = tipo ? `
    <div class="bank-avatar-badge" style="--type-color: ${tipoColor};">
      ${typeIcon(tipo)}
    </div>
  ` : '';

  if (bank) {
    return `
      <div class="bank-avatar ${sizeClass}">
        <img class="bank-avatar-img" src="${logoUrl(bank.domain)}" alt="${escapeHtml(banco)}" data-fallback-color="${fallbackColor}">
        ${badge}
      </div>
    `;
  }

  return `
    <div class="bank-avatar ${sizeClass}">
      <div class="bank-avatar-fallback" style="background: ${fallbackColor};">${initials(banco)}</div>
      ${badge}
    </div>
  `;
}

function attachImageErrorHandlers(container) {
  if (!container) return;
  container.querySelectorAll('img.bank-avatar-img').forEach((img) => {
    img.addEventListener('error', () => {
      const color = img.dataset.fallbackColor || '#6B7280';
      const name = img.alt;
      img.outerHTML = `<div class="bank-avatar-fallback" style="background: ${color};">${initials(name)}</div>`;
    }, { once: true });
  });
  container.querySelectorAll('img.combobox-option-logo').forEach((img) => {
    img.addEventListener('error', () => {
      const color = img.dataset.fallbackColor || '#6B7280';
      const name = img.alt;
      img.outerHTML = `<div class="combobox-option-fallback" style="background: ${color};">${initials(name)}</div>`;
    }, { once: true });
  });
}

function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// -----------------------------
// Save (insert / update)
// -----------------------------
async function saveConta(event) {
  event.preventDefault();
  const button = document.getElementById('btn-salvar-conta');

  const nome           = document.getElementById('conta-nome').value.trim();
  const apelidoRaw     = document.getElementById('conta-apelido').value.trim();
  const apelido        = apelidoRaw || null;
  const tipo           = document.getElementById('conta-tipo').value;
  const cor            = document.getElementById('conta-cor').value;
  const descricao      = document.getElementById('conta-descricao').value.trim() || null;
  const desde          = document.getElementById('conta-desde').value || null;
  const fechada_em     = document.getElementById('conta-fechada-em').value || null;
  const fec_fatura_raw = document.getElementById('conta-fec-fatura').value;
  const vencimento_raw = document.getElementById('conta-vencimento').value;
  const status         = document.getElementById('conta-status').value;

  if (!nome) { showToast(t('contas.validacao.nome_obrigatorio', 'Informe o nome do banco/cartão'), 'error'); return; }
  if (!desde) { showToast(t('contas.validacao.desde_obrigatorio', 'Informe a data inicial (Desde)'), 'error'); return; }
  if (tipo === 'Cartão de Crédito') {
    if (!fec_fatura_raw || fec_fatura_raw < 1 || fec_fatura_raw > 31) {
      showToast(t('contas.validacao.dia_fechamento', 'Informe o dia de fechamento da fatura (1–31)'), 'error'); return;
    }
    if (!vencimento_raw || vencimento_raw < 1 || vencimento_raw > 31) {
      showToast(t('contas.validacao.dia_vencimento', 'Informe o dia de vencimento da fatura (1–31)'), 'error'); return;
    }
  }

  const moeda = document.getElementById('conta-moeda').value || 'BRL';
  const limiteRaw = document.getElementById('conta-limite').value;
  const limite = (tipo === 'Cartão de Crédito' && limiteRaw !== '') ? parseUserNumber(limiteRaw) : null;

  const payload = {
    nome,
    apelido,
    tipo,
    icone_cor: cor,
    descricao,
    desde,
    fechada_em,
    fec_fatura: tipo === 'Cartão de Crédito' ? Number(fec_fatura_raw) : null,
    vencimento: tipo === 'Cartão de Crédito' ? Number(vencimento_raw) : null,
    limite,
    status,
    moeda,
  };

  const originalLabel = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    let response;
    if (editingId) {
      response = await supabase.from('contas').update(payload).eq('id', editingId).select().single();
    } else {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sessão expirada. Faça login novamente.');
      response = await supabase.from('contas').insert({ ...payload, user_id: user.id }).select().single();
    }
    if (response.error) throw response.error;

    showToast(editingId ? t('contas.toast.atualizada', 'Conta atualizada') : t('contas.toast.criada', 'Conta criada'), 'success');
    closeModal('modal-conta');
    editingId = null;
    await loadContas();
  } catch (err) {
    console.error('[saveConta] falhou:', err);
    let msg = err?.message || err?.hint || err?.details || JSON.stringify(err);
    if (/column.*(apelido|papel)/i.test(msg)) {
      msg = 'Schema desatualizado — rode a migration 0004_contas_v3.sql no Supabase (SQL Editor → New query → cole o arquivo → Run).';
    }
    showToast('Erro ao salvar: ' + msg, 'error', 12000);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function changeStatus(id, newStatus) {
  const update = { status: newStatus };
  if (newStatus === 'arquivada') update.fechada_em = todayISO();

  const { error } = await supabase.from('contas').update(update).eq('id', id);
  if (error) {
    console.error('[changeStatus] falhou:', error);
    showToast('Erro: ' + error.message, 'error', 8000);
    return;
  }
  showToast(`Conta ${newStatus === 'arquivada' ? 'arquivada' : 'atualizada'}`, 'success');
  await loadContas();
}

async function deleteConta(id) {
  // Defense in depth: filtra por workspace_id explícito (além da RLS)
  const { error } = await supabase.from('contas').delete().eq('id', id).eq('workspace_id', requireWorkspaceId());
  if (error) {
    console.error('[deleteConta] falhou:', error);
    showToast('Erro ao deletar: ' + error.message, 'error', 8000);
    return;
  }
  showToast(t('contas.toast.deletada', 'Conta deletada permanentemente'), 'success');
  await loadContas();
}

