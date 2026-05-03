// =============================================================
// FinFlow — Página: Contas (v3)
// • Sem principal/secundária
// • Apelido (display name custom) preserva nome oficial
// • Pop-up de detalhes (read-only) com botão Editar
// • Fluxo: arquivar antes de deletar
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { CURRENCIES, getMoedaPadrao, getUserCurrencies } from '../lib/currencies.js';
import { openModal, closeModal } from '../components/modal.js';
import { ACCOUNT_TYPES, getType, typeIcon, typeColor, typePill } from '../lib/account-types.js';
import { CURATED_BANKS, findBank, logoUrl, searchBanks } from '../lib/banks.js';
import { initColVisibility } from '../lib/col-visibility.js';
import { checkAndCloseFaturas } from '../lib/faturas-cartao.js';
import { formatCurrency } from '../lib/compromissos-config.js';

// -----------------------------
// Constants & state
// -----------------------------
const COLOR_PALETTE = [
  '#6D5EF5', '#4B3FD6', '#3B82F6', '#2563EB',
  '#10B981', '#EF4444', '#F59E0B', '#EC4899',
  '#6366F1', '#14B8A6', '#F97316', '#6B7280',
];

const DEFAULT_TIPO = 'Corrente';
const DEFAULT_COLOR = '#6D5EF5';

let cachedContas = [];
let cachedFaturasAbertas = new Map(); // conta_id → valor_total acumulado das faturas abertas
let cachedCompromissosContas = new Map(); // conta_id → { comprometido, count }
let editingId = null;
let detailsConta = null;        // conta sendo exibida no modal de detalhes
let pendingAction = null;       // { type, id, label }
let filterStatus = 'todas';
let filterTipos = new Set(['all']);
let userManuallyChangedColor = false;
let viewMode = 'cards';         // 'cards' | 'table'
let colVisEl = null;

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('contas');
  renderTipoFilters();
  renderPickers();
  bindEvents();

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
});

// -----------------------------
// Filters: tipo pills
// -----------------------------
function renderTipoFilters() {
  const container = document.getElementById('tipo-filters');
  const html = ACCOUNT_TYPES.map((t) => `
    <button class="filter-pill" data-tipo="${t.value}" type="button">
      <span style="display:inline-flex; width: 12px; height: 12px; color: ${t.color};">${t.icon}</span>
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
  tipoSelector.innerHTML = ACCOUNT_TYPES.map((t) => `
    <button type="button" class="tipo-btn ${t.value === DEFAULT_TIPO ? 'active' : ''}" data-tipo="${t.value}">
      <span class="tipo-icon" style="color: ${t.color};">${t.icon}</span>
      <span class="tipo-label">${t.label}</span>
    </button>
  `).join('');

  const colorPicker = document.getElementById('color-picker');
  colorPicker.innerHTML = COLOR_PALETTE.map((color) => `
    <button type="button" class="color-swatch ${color === DEFAULT_COLOR ? 'active' : ''}" data-color="${color}" style="background-color: ${color};" aria-label="Cor ${color}"></button>
  `).join('');
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
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    document.querySelectorAll('#status-filters .filter-pill').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    filterStatus = btn.dataset.status;
    renderContas();
  });

  // Filtro: tipo (multi)
  document.getElementById('tipo-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
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
    syncTipoFilterUI();
    renderContas();
  });

  // Tipo selector no modal
  document.getElementById('tipo-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('.tipo-btn');
    if (!btn) return;
    document.querySelectorAll('.tipo-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
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
  document.querySelectorAll('#tipo-filters .filter-pill').forEach((p) => {
    p.classList.toggle('active', filterTipos.has(p.dataset.tipo));
  });
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

  // Populate moeda select with user's configured currencies + any current value
  const userCurrencies = getUserCurrencies();
  const currentMoeda   = conta?.moeda || getMoedaPadrao();
  const allCodes = [...new Set([...userCurrencies, currentMoeda])];
  const moedaSel = document.getElementById('conta-moeda');
  moedaSel.innerHTML = allCodes.map((code) => {
    const cur = CURRENCIES.find((c) => c.code === code);
    const label = cur ? `${code} — ${cur.label}` : code;
    return `<option value="${code}" ${code === currentMoeda ? 'selected' : ''}>${label}</option>`;
  }).join('');
  // Add "Outra…" group for currencies not in user list
  const otherCurrencies = CURRENCIES.filter((c) => !allCodes.includes(c.code));
  if (otherCurrencies.length) {
    moedaSel.innerHTML += `<optgroup label="Outras">`
      + otherCurrencies.map((c) => `<option value="${c.code}">${c.code} — ${c.label}</option>`).join('')
      + `</optgroup>`;
  }
  document.getElementById('conta-desde').value = conta?.desde || todayISO();
  document.getElementById('conta-fechada-em').value = conta?.fechada_em || '';
  document.getElementById('conta-fec-fatura').value = conta?.fec_fatura || '';
  document.getElementById('conta-vencimento').value = conta?.vencimento || '';
  document.getElementById('conta-limite').value = conta?.limite ?? '';
  document.getElementById('conta-status').value = status;

  document.querySelectorAll('.tipo-btn').forEach((b) => b.classList.toggle('active', b.dataset.tipo === tipo));
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
  const comprometido = compromissos
    .filter((c) => !c.valor_variavel)
    .reduce((sum, c) => sum + (Number(c.valor_base) || 0), 0);

  // Resumo / barra
  if (!limite) {
    resumoEl.innerHTML = `
      <div class="clc-resumo clc-resumo--sem-limite">
        <span>Comprometido com compromissos ativos:</span>
        <strong>${formatCurrency(comprometido)}</strong>
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
            <strong class="clc-val-num">${formatCurrency(limite)}</strong>
          </div>
          <div class="clc-val-item clc-val-item--comprometido">
            <span class="clc-val-label">Comprometido</span>
            <strong class="clc-val-num" style="color:${barColor}">${formatCurrency(comprometido)} <span class="clc-pct">${pct.toFixed(0)}%</span></strong>
          </div>
          <div class="clc-val-item">
            <span class="clc-val-label">Disponível</span>
            <strong class="clc-val-num">${formatCurrency(disponivel)}</strong>
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
            : formatCurrency(Number(c.valor_base), c.moeda);
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

function renderFaturaAberta(abertas, conta) {
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
        <div class="cartao-fatura-aberta-valor">${formatCurrency(Number(f.valor_total))}</div>
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

  const PAID = ['Pago', 'Cartão', 'Transferido', 'Parcial'];

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
        <td class="cf-td-valor tabular">${formatCurrency(Number(f.valor_total))}</td>
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
  if (!contaIds.length) return;
  const { data, error } = await supabase
    .from('faturas_cartao')
    .select('conta_id, valor_total')
    .in('conta_id', contaIds)
    .eq('status', 'aberta')
    .gt('valor_total', 0);
  if (error) {
    if (!/relation.*faturas_cartao/i.test(error.message)) {
      console.warn('[loadFaturasAbertas]', error);
    }
    return;
  }
  for (const f of (data || [])) {
    const prev = cachedFaturasAbertas.get(f.conta_id) || 0;
    cachedFaturasAbertas.set(f.conta_id, prev + Number(f.valor_total || 0));
  }
}

async function loadCompromissosContas(contaIds) {
  cachedCompromissosContas = new Map();
  if (!contaIds.length) return;
  const { data, error } = await supabase
    .from('subcategorias')
    .select('conta_id, valor_base')
    .in('conta_id', contaIds)
    .eq('status', 'ativa');
  if (error) { console.warn('[loadCompromissosContas]', error); return; }
  for (const s of (data || [])) {
    const prev = cachedCompromissosContas.get(s.conta_id) || { comprometido: 0, count: 0 };
    cachedCompromissosContas.set(s.conta_id, {
      comprometido: prev.comprometido + Number(s.valor_base || 0),
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

  const { data, error } = await supabase
    .from('contas')
    .select('*')
    .order('nome', { ascending: true });

  if (error) {
    console.error('[loadContas] falhou:', error);
    container.innerHTML = '';
    showToast('Erro ao carregar contas: ' + error.message, 'error', 10000);
    return;
  }

  cachedContas = data || [];

  // Carrega dados dos cartões antes de renderizar
  const cartaoIds = cachedContas
    .filter((c) => c.tipo === 'Cartão de Crédito')
    .map((c) => c.id);
  await Promise.all([
    loadFaturasAbertas(cartaoIds),
    loadCompromissosContas(cartaoIds),
  ]);

  renderContas();
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

function bindRowClicks() {
  document.querySelectorAll('.contas-table tbody tr').forEach((row) => {
    row.addEventListener('click', () => {
      const conta = cachedContas.find((c) => c.id === row.dataset.id);
      if (conta) openDetailsModal(conta);
    });
  });
}

function renderContaCard(conta) {
  const isInactive = conta.status !== 'ativa';
  const display = displayName(conta);
  const officialDifferent = conta.apelido && conta.apelido.trim() && conta.apelido !== conta.nome;

  const statusLabel = { ativa: 'Ativa', inativa: 'Inativa', arquivada: 'Arquivada' }[conta.status];

  const dates = [];
  if (conta.desde) dates.push(`<span><strong>Desde:</strong> ${formatDateBR(conta.desde)}</span>`);
  if (conta.fechada_em) dates.push(`<span><strong>Fechada:</strong> ${formatDateBR(conta.fechada_em)}</span>`);
  if (conta.tipo === 'Cartão de Crédito') {
    if (conta.fec_fatura) dates.push(`<span><strong>Fec. fatura:</strong> dia ${conta.fec_fatura}</span>`);
    if (conta.vencimento) dates.push(`<span><strong>Venc.:</strong> dia ${conta.vencimento}</span>`);
  }

  const faturaAbertaValor = cachedFaturasAbertas.get(conta.id);
  const faturaBadge = faturaAbertaValor
    ? `<div class="conta-fatura-badge">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
        Fatura aberta: ${formatCurrency(faturaAbertaValor)}
       </div>`
    : '';

  const comprometidoBadge = renderComprometidoBadge(conta);

  return `
    <div class="conta-card-v2 ${isInactive ? 'inactive' : ''} ${conta.status === 'arquivada' ? 'arquivada' : ''}" data-id="${conta.id}">
      <span class="ver-mais-hint">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/></svg>
        Ver detalhes
      </span>

      ${renderBankAvatar({ banco: conta.nome, tipo: conta.tipo, cor: conta.icone_cor, size: 'lg' })}

      <div class="conta-card-info">
        <div class="conta-card-header">
          <h3 class="conta-card-name">${escapeHtml(display)}</h3>
        </div>
        ${officialDifferent ? `<p style="font-size: var(--fs-xs); color: var(--color-text-muted); margin-top: -2px;">${escapeHtml(conta.nome)}</p>` : ''}
        <div class="conta-card-meta">
          ${typePill(conta.tipo)}
          <span class="status-pill status-${conta.status}">${statusLabel}</span>
        </div>
        ${conta.descricao ? `<p class="conta-card-desc">${escapeHtml(conta.descricao)}</p>` : ''}
        ${dates.length ? `<div class="conta-card-dates">${dates.join('')}</div>` : ''}
        ${faturaBadge}
        ${comprometidoBadge}
      </div>
    </div>
  `;
}

function bindCardClicks() {
  document.querySelectorAll('.conta-card-v2').forEach((card) => {
    card.addEventListener('click', () => {
      const conta = cachedContas.find((c) => c.id === card.dataset.id);
      if (conta) openDetailsModal(conta);
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
  const label = `${count} compromisso${count > 1 ? 's' : ''}: ${formatCurrency(comprometido)}`;
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
        <span class="ccb-table-val">${formatCurrency(comprometido)} <span class="ccb-table-pct">${pct}%</span></span>
        <div class="ccb-bar-track" style="margin-top:4px;"><div class="ccb-bar-fill" style="width:${pct}%; background:${comprometidoBarColor(pct)};"></div></div>
      </div>`;
  }
  return `<span>${formatCurrency(comprometido)}</span>`;
}

// -----------------------------
// Bank avatar render
// -----------------------------
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

  if (!nome) { showToast('Informe o nome do banco/cartão', 'error'); return; }
  if (!desde) { showToast('Informe a data inicial (Desde)', 'error'); return; }
  if (tipo === 'Cartão de Crédito') {
    if (!fec_fatura_raw || fec_fatura_raw < 1 || fec_fatura_raw > 31) {
      showToast('Informe o dia de fechamento da fatura (1–31)', 'error'); return;
    }
    if (!vencimento_raw || vencimento_raw < 1 || vencimento_raw > 31) {
      showToast('Informe o dia de vencimento da fatura (1–31)', 'error'); return;
    }
  }

  const moeda = document.getElementById('conta-moeda').value || 'BRL';
  const limiteRaw = document.getElementById('conta-limite').value;
  const limite = (tipo === 'Cartão de Crédito' && limiteRaw !== '') ? Number(limiteRaw) : null;

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

    showToast(editingId ? 'Conta atualizada' : 'Conta criada', 'success');
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
  const { error } = await supabase.from('contas').delete().eq('id', id);
  if (error) {
    console.error('[deleteConta] falhou:', error);
    showToast('Erro ao deletar: ' + error.message, 'error', 8000);
    return;
  }
  showToast('Conta deletada permanentemente', 'success');
  await loadContas();
}

// -----------------------------
// Util
// -----------------------------
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
  );
}
