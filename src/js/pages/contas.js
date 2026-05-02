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
import { openModal, closeModal } from '../components/modal.js';
import { ACCOUNT_TYPES, getType, typeIcon, typeColor, typePill } from '../lib/account-types.js';
import { CURATED_BANKS, findBank, logoUrl, searchBanks } from '../lib/banks.js';

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
let editingId = null;
let detailsConta = null;        // conta sendo exibida no modal de detalhes
let pendingAction = null;       // { type, id, label }
let filterStatus = 'todas';
let filterTipos = new Set(['all']);
let userManuallyChangedColor = false;
let viewMode = 'cards';         // 'cards' | 'table'

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('contas');
  renderTipoFilters();
  renderPickers();
  bindEvents();
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
  document.getElementById('conta-desde').value = conta?.desde || todayISO();
  document.getElementById('conta-fechada-em').value = conta?.fechada_em || '';
  document.getElementById('conta-fec-fatura').value = conta?.fec_fatura || '';
  document.getElementById('conta-vencimento').value = conta?.vencimento || '';
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

  openModal('modal-details');
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
async function loadContas() {
  const container = document.getElementById('contas-container');
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span>Carregando contas…</div>';

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

  if (viewMode === 'table') {
    container.innerHTML = renderContasTable(filtered);
    bindRowClicks();
  } else {
    container.innerHTML = `<div class="contas-grid">${filtered.map(renderContaCard).join('')}</div>`;
    bindCardClicks();
  }
  attachImageErrorHandlers(container);
}

// -----------------------------
// Render table view
// -----------------------------
function renderContasTable(contas) {
  const rows = contas.map(renderContaRow).join('');
  return `
    <div class="contas-table-wrapper">
      <table class="contas-table">
        <thead>
          <tr>
            <th>Conta</th>
            <th>Tipo</th>
            <th>Status</th>
            <th>Desde</th>
            <th>Descrição</th>
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
      <td>${typePill(conta.tipo)}</td>
      <td><span class="status-pill status-${conta.status}">${statusLabel}</span></td>
      <td class="tabular">${conta.desde ? formatDateBR(conta.desde) : '—'}</td>
      <td class="conta-row-desc">${conta.descricao ? escapeHtml(conta.descricao) : '<span style="color: var(--color-text-muted);">—</span>'}</td>
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
    status,
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
