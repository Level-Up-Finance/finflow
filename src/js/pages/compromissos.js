// =============================================================
// TODO refactor: dividir este arquivo (~3000 linhas) em:
//   compromissos/calendar.js  — renderCalendar + renderCalendarPopover + occursOn + navigateCalendar + openDayModal (~250L)
//   compromissos/dre.js       — renderDre + renderDreBlock + renderDreItem + renderDreSummary + bindDreClicks (~160L)
//   compromissos/table.js     — renderFlatTable + renderUnifiedRow + render*Cell helpers (~200L)
//   compromissos/modals.js    — openCompromissoModal + openCatDirectModal + openDetailsModal + openValorUpdateModal (~600L)
//   compromissos/save.js      — saveCompromisso + saveCatDirectCompromisso + saveQuickValor (~400L)
// Acoplamento forte de estado: requer dependency injection (passar getters/setters).
// =============================================================
// FinFlow — Página: Compromissos (antes "Categorias")
//
// Hierarquia: Categoria (parent) → Subcategoria/Compromisso (filha)
// • Categorias defaults: Receitas, Dívidas, Investimentos (lazy seed)
// • Banco/Cartão opcional
// • Recorrência Semanal/Quinzenal com dia da semana
// • Tipo Receita/Despesa
// • View: tabela apenas
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { initCurrencyWidget } from '../components/currency-widget.js';
import {
  TIPOS,
  tipoIcon,
  tipoColor,
  tipoPill,
  PERIODOS,
  DIAS_SEMANA,
  diaSemanaLabel,
  TIPOS_PAGAMENTO,
  MOEDAS,
  formatCurrency,
  CATEGORIAS_DEFAULT,
} from '../lib/compromissos-config.js';
import { findBank, logoUrl } from '../lib/banks.js';
import { initColVisibility } from '../lib/col-visibility.js';
import { escapeHtml, formatDateBR, todayISO, getInitials } from '../lib/utils.js';
import { fetchExchangeRate } from '../lib/currency.js';
import { initContatoPicker } from '../components/contato-picker.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';

// -----------------------------
// State
// -----------------------------
let cachedCompromissos = [];   // subcategorias do usuário
let cachedCategorias = [];     // categorias parent do usuário
let cachedContas = [];         // bancos/cartões
let cachedProjetos = [];       // projetos de investimento do usuário
let cachedDividas = [];        // dívidas do usuário (para vínculo)
let cachedContatos = [];       // clientes/fornecedores do usuário
let cachedProxValores = new Map(); // subcategoria_id → {valor_previsto, moeda, mes_ano} (próximo mês com valor)
let editingId    = null;
let editingCatId = null;
let detailsCompromisso = null;
let pendingAction = null;
let filterStatus = 'todas';
let filterCategorias = new Set(['all']);
let viewMode     = 'table'; // 'table' | 'dre' | 'calendar'
let filterConfig = 'todas'; // 'todas' | 'configurado' | 'sem-compromisso'
let filterSearch = '';
let colVisEl = null;   // wrapper do seletor de colunas
const ratesMapLocal = new Map(); // 'USD' → 5.40 (usado só nesta página)

// Estado do calendário
const todayDate = new Date();
let calendarYear = todayDate.getFullYear();
let calendarMonth = todayDate.getMonth(); // 0-11

const DEFAULT_TIPO = 'Despesa';

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('compromissos');
  initTutorial('compromissos');
  await loadStrings();
  applyTranslationsToDom();
  initCurrencyWidget('currency-widget');

  await loadContas();
  await loadCategorias();      // carrega + seed se vazio
  await loadProjetos();
  await loadDividas();
  await loadContatos();
  renderCategoriaFilters();
  renderTipoSelector();
  renderModalDropdowns();
  bindEvents();

  colVisEl = initColVisibility({
    storageKey: 'compromissos',
    tableClass:  'compromissos-grouped-table',
    columns: [
      { key: 'subcategoria', label: 'Subcategoria', defaultVisible: true  },
      { key: 'tipo',         label: 'Tipo',         defaultVisible: false },
      { key: 'projeto',      label: 'Vínculo',      defaultVisible: true  },
      { key: 'conta',        label: 'Banco/Cartão', defaultVisible: false },
      { key: 'pagamento',    label: 'Pagamento',    defaultVisible: false },
      { key: 'vencimento',   label: 'Vencimento',   defaultVisible: true  },
      { key: 'proximo',      label: 'Próximo',      defaultVisible: true  },
      { key: 'termina',      label: 'Termina em',   defaultVisible: false },
      { key: 'periodo',      label: 'Período',      defaultVisible: true  },
      { key: 'valor',        label: 'Valor',        defaultVisible: true  },
      { key: 'descricao',    label: 'Descrição',    defaultVisible: false },
      { key: 'status',       label: 'Status',       defaultVisible: true  },
    ],
    toolbarEl: document.querySelector('.toolbar'),
  });

  await loadCompromissos();
});

// -----------------------------
// Load projetos de investimento
// -----------------------------
async function loadProjetos() {
  const { data, error } = await supabase
    .from('projetos_investimento')
    .select('*')
    .eq('status', 'ativo')
    .order('nome');
  if (error) {
    if (!/relation.*projetos_investimento/i.test(error.message)) {
      console.warn('[loadProjetos]', error);
    }
    cachedProjetos = [];
    return;
  }
  cachedProjetos = data || [];
}

function getProjeto(id) {
  return cachedProjetos.find((p) => p.id === id) || null;
}

async function criarProjeto(nome) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('projetos_investimento')
    .insert({ user_id: user.id, nome })
    .select()
    .single();
  if (error) {
    showToast('Erro ao criar projeto: ' + error.message, 'error', 8000);
    return null;
  }
  cachedProjetos.push(data);
  cachedProjetos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  showToast(`Projeto "${data.nome}" criado`, 'success');
  return data;
}

// -----------------------------
// Load dívidas (para vínculo no select)
// -----------------------------
async function loadDividas() {
  const { data, error } = await supabase
    .from('dividas')
    .select('id, nome, credor, status, valor_total, valor_pago')
    .order('nome');
  if (error) {
    if (!/relation.*dividas/i.test(error.message)) {
      console.warn('[loadDividas]', error);
    }
    cachedDividas = [];
    return;
  }
  cachedDividas = data || [];
}

function getDivida(id) {
  return cachedDividas.find((d) => d.id === id) || null;
}

function renderDividaOptions() {
  const sel = document.getElementById('comp-divida');
  if (!sel) return;
  const opts = ['<option value="">Selecione uma dívida…</option>'];
  for (const d of cachedDividas.filter((x) => x.status !== 'Quitada')) {
    const label = d.credor ? `${d.nome} (${d.credor})` : d.nome;
    opts.push(`<option value="${d.id}">${escapeHtml(label)}</option>`);
  }
  opts.push('<option value="__new__">+ Criar nova dívida…</option>');
  sel.innerHTML = opts.join('');
}

function toggleDividaField() {
  const catId = document.getElementById('comp-categoria').value;
  const cat = cachedCategorias.find((c) => c.id === catId);
  const isDivida = cat?.grupo === 'dividas' || /dívida|divida/i.test(cat?.nome || '');
  const field = document.getElementById('divida-field');
  if (!field) return;
  field.classList.toggle('hidden', !isDivida);
  if (!isDivida) {
    const sel = document.getElementById('comp-divida');
    if (sel) sel.value = '';
  }
}

// -----------------------------
// Load contatos (clientes/fornecedores)
// -----------------------------
async function loadContatos() {
  const { data, error } = await supabase
    .from('contatos')
    .select('id, nome, tipo, status')
    .neq('status', 'arquivado')
    .order('nome');
  if (error) {
    if (!/relation.*contatos|column.*contatos/i.test(error.message)) {
      console.warn('[loadContatos]', error);
    }
    cachedContatos = [];
    return;
  }
  cachedContatos = data || [];
}

let contatoPicker = null;

function initContatoPickerOnce() {
  if (contatoPicker) return;
  const rootEl = document.querySelector('[data-picker="comp-contato"]');
  if (!rootEl) return;
  contatoPicker = initContatoPicker({
    rootEl,
    contatos: () => cachedContatos,
    defaultTipo: 'ambos',
  });
}

// -----------------------------
// Load contas (pro select opcional)
// -----------------------------
async function loadContas() {
  let { data, error } = await supabase
    .from('contas')
    .select('id, nome, apelido, tipo, icone_cor, status, limite')
    .neq('status', 'arquivada')
    .order('nome');

  // Fallback: if 'limite' column doesn't exist yet (migration 0035 not applied)
  if (error && /column.*limite|limite.*column/i.test(error.message)) {
    ({ data, error } = await supabase
      .from('contas')
      .select('id, nome, apelido, tipo, icone_cor, status')
      .neq('status', 'arquivada')
      .order('nome'));
  }

  if (error) { console.error('[loadContas]', error); return; }
  cachedContas = data || [];
}

// -----------------------------
// Load categorias (+ lazy seed)
// -----------------------------
async function loadCategorias() {
  const { data, error } = await supabase
    .from('categorias')
    .select('*')
    .eq('ativo', true)
    .order('ordem')
    .order('nome');

  if (error) {
    console.error('[loadCategorias]', error);
    showToast('Erro ao carregar categorias: ' + error.message, 'error', 8000);
    return;
  }

  if ((data || []).length === 0) {
    await seedDefaultCategorias();
    return; // seedDefaultCategorias chama loadCategorias de novo
  }

  cachedCategorias = data;
}

async function seedDefaultCategorias() {
  const user = await getCurrentUser();
  if (!user) return;
  const rows = CATEGORIAS_DEFAULT.map((c) => ({
    ...c,
    user_id: user.id,
    is_default: true,
  }));
  const { error } = await supabase.from('categorias').insert(rows);
  if (error) {
    console.error('[seedDefaultCategorias]', error);
    showToast('Erro ao criar categorias default: ' + error.message, 'error', 10000);
    return;
  }
  await loadCategorias();
}

// -----------------------------
// Filtros: pills de categoria
// -----------------------------
function renderCategoriaFilters() {
  const container = document.getElementById('categoria-filters');
  // Mantém o "Todas as categorias" e adiciona uma pill por categoria, agrupadas por super-bloco
  const existing = container.querySelector('[data-categoria="all"]');
  container.innerHTML = '';
  container.appendChild(existing);

  for (const bloco of SUPER_BLOCOS_LIST) {
    const cats = cachedCategorias.filter((c) => bloco.grupos.includes(c.grupo || 'custo_vida'));
    if (cats.length === 0) continue;

    // Label do super-bloco (visualmente discreto)
    const label = document.createElement('span');
    label.className = 'filter-bloco-label';
    label.style.setProperty('--bloco-accent', bloco.accent);
    label.textContent = bloco.label;
    container.appendChild(label);

    cats.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'filter-pill';
      btn.dataset.categoria = cat.id;
      btn.type = 'button';
      btn.innerHTML = `
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${cat.cor};"></span>
        ${escapeHtml(cat.nome)}
      `;
      container.appendChild(btn);
    });
  }
}

// -----------------------------
// Modal: tipo selector (Receita/Despesa)
// -----------------------------
function renderTipoSelector() {
  const container = document.getElementById('tipo-selector');
  container.innerHTML = TIPOS.map((t) => `
    <button type="button" class="tipo-btn ${t.value === DEFAULT_TIPO ? 'active' : ''}" data-tipo="${t.value}">
      <span class="tipo-icon" style="color: ${t.color};">${t.icon}</span>
      <span class="tipo-label">${t.label}</span>
    </button>
  `).join('');
}

// -----------------------------
// Modal dropdowns
// -----------------------------
function renderModalDropdowns() {
  // Categorias (parent) — agrupadas por super-bloco via <optgroup>
  const selCat = document.getElementById('comp-categoria');
  const optgroupHtml = SUPER_BLOCOS_LIST.map((bloco) => {
    const cats = cachedCategorias.filter((c) => bloco.grupos.includes(c.grupo || 'custo_vida'));
    if (cats.length === 0) return '';
    const opts = cats.map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
    return `<optgroup label="${escapeHtml(bloco.label)}">${opts}</optgroup>`;
  }).join('');
  selCat.innerHTML = '<option value="">— Escolha uma categoria —</option>' + optgroupHtml;

  // Banco/Cartão (opcional)
  const contaOptions = '<option value="">— Sem banco (preencher depois) —</option>' +
    cachedContas.map((c) => {
      const display = c.apelido?.trim() || c.nome;
      return `<option value="${c.id}">${escapeHtml(display)} (${c.tipo})</option>`;
    }).join('');
  const selConta = document.getElementById('comp-conta');
  selConta.innerHTML = contaOptions;
  const selContaDest = document.getElementById('comp-conta-destino');
  if (selContaDest) selContaDest.innerHTML = contaOptions;

  // Tipo de pagamento
  const selTipoPag = document.getElementById('comp-tipo-pagamento');
  selTipoPag.innerHTML = '<option value="">— Selecionar —</option>' +
    TIPOS_PAGAMENTO.map((t) => `<option value="${t}">${t}</option>`).join('');

  // Período
  const selPeriodo = document.getElementById('comp-periodo');
  selPeriodo.innerHTML = PERIODOS.map((p) =>
    `<option value="${p.value}">${p.label}</option>`
  ).join('');

  // Dia da semana
  const selDiaSemana = document.getElementById('comp-dia-semana');
  selDiaSemana.innerHTML = '<option value="">— Selecionar —</option>' +
    DIAS_SEMANA.map((d) =>
      `<option value="${d.value}">${d.label}</option>`
    ).join('');

  // Moeda — popula os 2 selects (modo fixo + modo variável)
  const moedaOptions = MOEDAS.map((m) =>
    `<option value="${m.code}">${m.label}</option>`
  ).join('');
  const selMoeda = document.getElementById('comp-moeda');
  selMoeda.innerHTML = moedaOptions;
  const selMoedaVar = document.getElementById('comp-moeda-var');
  if (selMoedaVar) selMoedaVar.innerHTML = moedaOptions;

  // Projetos (só relevante quando categoria é do grupo Investimentos)
  renderProjetoOptions();
  // Dívidas (só relevante quando categoria é do grupo Dívidas)
  renderDividaOptions();
  // Contatos (sempre visível) — picker é inicializado no openModal
  initContatoPickerOnce();
  // Dropdown de categoria existente (modo "Categoria existente")
  renderCatExistenteOptions();
}

function renderCatExistenteOptions() {
  const sel = document.getElementById('comp-cat-existente');
  if (!sel) return;
  const optgroupHtml = SUPER_BLOCOS_LIST.map((bloco) => {
    const cats = cachedCategorias.filter((c) => bloco.grupos.includes(c.grupo || 'custo_vida'));
    if (cats.length === 0) return '';
    const opts = cats.map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
    return `<optgroup label="${escapeHtml(bloco.label)}">${opts}</optgroup>`;
  }).join('');
  sel.innerHTML = '<option value="">— Escolha uma categoria —</option>' + optgroupHtml;
}

function setNivelMode(mode) {
  document.getElementById('comp-nivel').value = mode;
  document.querySelectorAll('#nivel-segmented .segmented-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.nivel === mode)
  );
  const isCategoria = mode === 'categoria';
  document.getElementById('comp-nome-field').classList.toggle('hidden', isCategoria);
  document.getElementById('comp-apelido-field').classList.toggle('hidden', isCategoria);
  document.getElementById('comp-categoria-field').classList.toggle('hidden', isCategoria);
  document.getElementById('comp-cat-existente-field').classList.toggle('hidden', !isCategoria);
  if (!isCategoria) {
    const sel = document.getElementById('comp-cat-existente');
    if (sel) sel.value = '';
  }
}

function renderProjetoOptions() {
  const sel = document.getElementById('comp-projeto');
  if (!sel) return;
  const opts = ['<option value="">— Sem projeto —</option>'];
  for (const p of cachedProjetos) {
    opts.push(`<option value="${p.id}">${escapeHtml(p.nome)}</option>`);
  }
  opts.push('<option value="__new__">+ Criar novo projeto…</option>');
  sel.innerHTML = opts.join('');
}

// Mostra/esconde o campo Projeto baseado no grupo da categoria selecionada
function toggleProjetoField() {
  const catId = document.getElementById('comp-categoria').value;
  const cat = cachedCategorias.find((c) => c.id === catId);
  const isInvestimento = cat?.grupo === 'investimentos';
  const field = document.getElementById('projeto-field');
  if (!field) return;
  field.classList.toggle('hidden', !isInvestimento);
  // Reset do valor quando muda pra outro grupo
  if (!isInvestimento) {
    const sel = document.getElementById('comp-projeto');
    if (sel) sel.value = '';
  }
}

// -----------------------------
// Event bindings
// -----------------------------
function bindEvents() {
  document.getElementById('btn-novo-compromisso').addEventListener('click', () => openCompromissoModal());
  document.querySelector('[data-trigger-novo]')?.addEventListener('click', () => openCompromissoModal());

  document.getElementById('search-compromissos').addEventListener('input', (e) => {
    filterSearch = e.target.value.toLowerCase().trim();
    renderCompromissos();
  });

  // View toggle (Tabela / DRE)
  document.getElementById('view-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    document.querySelectorAll('#view-toggle .view-toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    viewMode = btn.dataset.view;
    renderCompromissos();
  });

  // Filtro: status
  document.getElementById('status-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    document.querySelectorAll('#status-filters .filter-pill').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    filterStatus = btn.dataset.status;
    renderCompromissos();
  });

  // Filtro: configurado / sem compromisso
  document.getElementById('config-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    document.querySelectorAll('#config-filters .filter-pill').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    filterConfig = btn.dataset.config;
    renderCompromissos();
  });

  // Filtro: categoria (multi)
  document.getElementById('categoria-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    const id = btn.dataset.categoria;
    if (id === 'all') {
      filterCategorias = new Set(['all']);
    } else {
      filterCategorias.delete('all');
      if (filterCategorias.has(id)) filterCategorias.delete(id);
      else filterCategorias.add(id);
      if (filterCategorias.size === 0) filterCategorias = new Set(['all']);
    }
    syncCategoriaFilterUI();
    renderCompromissos();
  });

  // Nivel toggle (Nova subcategoria / Categoria existente)
  document.getElementById('nivel-segmented').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nivel]');
    if (!btn) return;
    setNivelMode(btn.dataset.nivel);
  });

  // Categoria existente → sync com comp-categoria e re-toggle campos
  document.getElementById('comp-cat-existente').addEventListener('change', (e) => {
    document.getElementById('comp-categoria').value = e.target.value;
    toggleDividaField();
    toggleProjetoField();
  });

  // Tipo selector
  document.getElementById('tipo-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('.tipo-btn');
    if (!btn) return;
    document.querySelectorAll('.tipo-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('comp-tipo').value = btn.dataset.tipo;
    toggleRendaPrincipalRow();
    toggleTransferFields();
  });

  // Conta origin → limit info + auto-set tipo_pagamento se cartão de crédito
  document.getElementById('comp-conta').addEventListener('change', (e) => {
    updateLimiteInfo(e.target.value);
    const conta = getConta(e.target.value);
    if (conta?.tipo === 'Cartão de Crédito') {
      document.getElementById('comp-tipo-pagamento').value = 'Crédito';
    }
  });

  // Período → mostra/esconde dia mês ou dia semana
  document.getElementById('comp-periodo').addEventListener('change', toggleVencimentoFields);

  // Categoria muda → mostra/esconde campos de projeto e dívida
  document.getElementById('comp-categoria').addEventListener('change', () => {
    toggleProjetoField();
    toggleDividaField();
  });

  // Select de projeto: "__new__" abre prompt pra criar inline
  document.getElementById('comp-projeto').addEventListener('change', async (e) => {
    if (e.target.value !== '__new__') {
      e.target.dataset.lastGood = e.target.value;
      return;
    }
    const prev = e.target.dataset.lastGood || '';
    e.target.value = '';
    const nome = window.prompt('Nome do novo projeto de investimento:');
    if (!nome || !nome.trim()) { e.target.value = prev; return; }
    const novo = await criarProjeto(nome.trim());
    if (novo) {
      renderProjetoOptions();
      e.target.value = novo.id;
    } else {
      e.target.value = prev;
    }
  });

  // Select de dívida: "__new__" mantém placeholder; a criação real acontece no save
  document.getElementById('comp-divida')?.addEventListener('change', (e) => {
    if (e.target.value === '__new__') {
      // Deixa "__new__" selecionado — no save auto-criamos a dívida com os dados do compromisso
    }
  });

  // Checkbox "valor variável"
  document.getElementById('comp-valor-variavel').addEventListener('change', () => {
    toggleValorVariavelFields();
    if (document.getElementById('comp-valor-variavel').checked) {
      const c = editingId ? cachedCompromissos.find((x) => x.id === editingId) : null;
      populateValoresMensaisGrid(c);
    }
  });

  // Sincroniza moeda entre os 2 selects (modo fixo / modo variável)
  const moedaFixa = document.getElementById('comp-moeda');
  const moedaVar  = document.getElementById('comp-moeda-var');
  if (moedaFixa && moedaVar) {
    moedaFixa.addEventListener('change', () => { moedaVar.value = moedaFixa.value; });
    moedaVar.addEventListener('change', () => { moedaFixa.value = moedaVar.value; });
  }

  // Status segmented
  document.getElementById('status-segmented').addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    document.querySelectorAll('#status-segmented .segmented-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('comp-status').value = btn.dataset.status;
  });

  // Form submit
  document.getElementById('form-compromisso').addEventListener('submit', saveCompromisso);

  // Close modals
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.closeModal === 'modal-compromisso') {
        editingCatId = null;
      }
      closeModal(btn.dataset.closeModal);
    });
  });

  // Details modal buttons
  document.getElementById('btn-editar').addEventListener('click', () => {
    if (!detailsCompromisso) return;
    closeModal('modal-details');
    openCompromissoModal(detailsCompromisso);
  });

  document.getElementById('btn-duplicar').addEventListener('click', () => {
    if (!detailsCompromisso) return;
    closeModal('modal-details');
    duplicateCompromisso(detailsCompromisso);
  });

  document.getElementById('btn-atualizar-valor').addEventListener('click', () => {
    if (!detailsCompromisso) return;
    openValorUpdateModal(detailsCompromisso);
  });

  document.getElementById('form-quick-valor').addEventListener('submit', saveQuickValor);
  document.getElementById('btn-arquivar').addEventListener('click', () => {
    if (!detailsCompromisso) return;
    pendingAction = { type: 'arquivar', id: detailsCompromisso.id };
    showConfirm(
      'Arquivar compromisso?',
      `Arquivar <strong>${escapeHtml(displayName(detailsCompromisso))}</strong>? Ele não vai mais aparecer nas listagens ativas.`,
      'Arquivar'
    );
  });
  document.getElementById('btn-deletar').addEventListener('click', () => {
    if (!detailsCompromisso) return;
    pendingAction = { type: 'delete', id: detailsCompromisso.id };
    showConfirm(
      'Deletar permanentemente?',
      `Tem certeza que quer deletar <strong>${escapeHtml(displayName(detailsCompromisso))}</strong> definitivamente? <br><br><strong style="color: var(--color-danger);">Esta ação não pode ser desfeita.</strong>`,
      'Deletar'
    );
  });

  document.getElementById('btn-encerrar').addEventListener('click', () => {
    if (!detailsCompromisso) return;
    openEncerrarModal(detailsCompromisso);
  });

  document.getElementById('btn-confirmar-encerrar').addEventListener('click', confirmarEncerrar);

  // Confirmar
  document.getElementById('btn-confirmar-acao').addEventListener('click', async () => {
    if (!pendingAction) return;
    const { type, id } = pendingAction;
    closeModal('modal-confirmar');
    if (type === 'arquivar') {
      await changeStatus(id, 'arquivada');
      closeModal('modal-details');
    } else if (type === 'delete') {
      await deleteCompromisso(id);
      closeModal('modal-details');
    }
    pendingAction = null;
  });

  // Popover de vínculo — cria elemento uma vez no DOM
  const pop = document.createElement('div');
  pop.id = 'vinculo-popover';
  pop.className = 'vinculo-popover hidden';
  document.body.appendChild(pop);
  pop.addEventListener('mouseleave', hideVinculoPopover);

  // Delegação: mostra/oculta popover ao passar mouse em badges
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

// -----------------------------
// Popover de vínculo (dívida / projeto)
// -----------------------------
function showVinculoPopover(badge) {
  const pop = document.getElementById('vinculo-popover');
  if (!pop) return;
  const html = buildVinculoPopoverContent(badge.dataset.vinculoType, badge.dataset.vinculoId);
  if (!html) return;

  pop.innerHTML = html;
  pop.classList.remove('hidden');

  const rect = badge.getBoundingClientRect();
  pop.style.top  = `${rect.bottom + 8 + window.scrollY}px`;
  pop.style.left = `${rect.left   + window.scrollX}px`;

  // Ajusta se sair da viewport à direita
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
    const p = getProjeto(id);
    if (!p) return null;
    const meta = Number(p.meta_valor) || 0;
    return `
      <div class="vp-header">
        <span class="vp-type-label vp-type-projeto">Investimento</span>
        <strong class="vp-title">${escapeHtml(p.nome)}</strong>
      </div>
      <div class="vp-body">
        ${meta ? `<div class="vp-row"><span>Meta</span><strong>${formatCurrency(meta)}</strong></div>` : ''}
        ${p.saldo_inicial ? `<div class="vp-row"><span>Saldo inicial</span><strong>${formatCurrency(Number(p.saldo_inicial))}</strong></div>` : ''}
      </div>
      <a class="vp-link" href="/investimentos.html">Ver investimentos →</a>`;
  }

  if (type === 'divida') {
    const d = getDivida(id);
    const total    = d ? Number(d.valor_total) : 0;
    const pago     = d ? Number(d.valor_pago)  : 0;
    const restante = Math.max(0, total - pago);
    const pct      = total > 0 ? Math.min(100, (pago / total) * 100) : 0;
    const stCors   = { Ativa: 'var(--color-primary)', Atrasada: 'var(--color-danger)', Negociando: 'var(--color-warning)', Quitada: 'var(--color-success)' };
    const stCor    = stCors[d?.status] || 'var(--color-primary)';
    return `
      <div class="vp-header">
        <span class="vp-type-label vp-type-divida">Dívida</span>
        <strong class="vp-title">${d ? escapeHtml(d.nome) : '—'}</strong>
      </div>
      <div class="vp-body">
        ${d?.credor  ? `<div class="vp-row"><span>Credor</span><strong>${escapeHtml(d.credor)}</strong></div>` : ''}
        ${d?.status  ? `<div class="vp-row"><span>Status</span><strong style="color:${stCor}">${d.status}</strong></div>` : ''}
        ${total      ? `<div class="vp-row"><span>Total</span><strong>${formatCurrency(total)}</strong></div>` : ''}
        ${d          ? `<div class="vp-row"><span>Pago</span><strong style="color:var(--color-success)">${formatCurrency(pago)} (${pct.toFixed(0)}%)</strong></div>` : ''}
        ${d          ? `<div class="vp-row"><span>Restante</span><strong style="color:var(--color-danger)">${formatCurrency(restante)}</strong></div>` : ''}
      </div>
      <a class="vp-link" href="/dividas.html">Ver dívidas →</a>`;
  }

  return null;
}

function syncCategoriaFilterUI() {
  document.querySelectorAll('#categoria-filters .filter-pill').forEach((p) => {
    p.classList.toggle('active', filterCategorias.has(p.dataset.categoria));
  });
}

// -----------------------------
// Vencimento conditional: dia mês vs dia semana vs único (sem dia)
// -----------------------------
// Lê o date input do Anual e retorna { dia, iso } ou { dia: null, iso: null }
function readAnualDateInput() {
  const raw = document.getElementById('comp-vencimento-data-anual').value;
  if (!raw) return { dia: null, iso: null };
  const parts = raw.split('-');
  if (parts.length !== 3) return { dia: null, iso: null };
  const dia = Number(parts[2]);
  if (!dia || dia < 1 || dia > 31) return { dia: null, iso: null };
  return { dia, iso: raw };
}

// Para Anual: combina mês de iniciado_em com vencimento_dia → ISO date "YYYY-MM-DD"
function anualDateFromCompromisso(c) {
  if (!c || c.periodo !== 'Anual' || !c.vencimento_dia) return '';
  const base = c.iniciado_em ? new Date(c.iniciado_em + 'T00:00:00') : new Date();
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(c.vencimento_dia).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toggleVencimentoFields() {
  const periodo = document.getElementById('comp-periodo').value;
  const usaDiaSemana = periodo === 'Semanal' || periodo === 'Quinzenal';
  const ehUnico = periodo === 'Único';
  const ehSemanal = periodo === 'Semanal';
  const ehAnual = periodo === 'Anual';

  document.getElementById('vencimento-dia-field').classList.toggle('hidden', usaDiaSemana || ehUnico || ehAnual);
  document.getElementById('vencimento-data-anual-field').classList.toggle('hidden', !ehAnual);
  document.getElementById('dia-semana-field').classList.toggle('hidden', !usaDiaSemana);
  document.getElementById('intervalo-semanas-field').classList.toggle('hidden', !ehSemanal);
}

// Alterna entre "valor base fixo" e "grid de valores mensais"
function toggleValorVariavelFields() {
  const isVar = document.getElementById('comp-valor-variavel').checked;
  document.getElementById('valor-base-field').classList.toggle('hidden', isVar);
  document.getElementById('valores-mensais-field').classList.toggle('hidden', !isVar);
  document.getElementById('comp-valor-base').required = !isVar;
}

// "Renda principal" só faz sentido pra tipo Receita
function toggleRendaPrincipalRow() {
  const tipo = document.getElementById('comp-tipo').value;
  const row = document.getElementById('renda-principal-row');
  if (!row) return;
  const isReceita = tipo === 'Receita';
  row.classList.toggle('hidden', !isReceita);
  if (!isReceita) document.getElementById('comp-renda-principal').checked = false;
}

// Show/hide transfer-specific fields and relabel the origin conta
function toggleTransferFields() {
  const tipo = document.getElementById('comp-tipo').value;
  const isTransfer = tipo === 'Transferência';
  const destField = document.getElementById('comp-conta-destino-field');
  const oriLabel  = document.getElementById('comp-conta-label');
  const oriHint   = document.getElementById('comp-conta-hint');
  if (destField) destField.classList.toggle('hidden', !isTransfer);
  if (oriLabel) oriLabel.textContent = isTransfer ? 'De (origem)' : 'Banco / Cartão (opcional)';
  if (oriHint)  oriHint.textContent  = isTransfer
    ? 'Conta de onde o dinheiro sai.'
    : 'Pode deixar em branco e preencher depois.';
}

// Shows committed credit limit when a Cartão de Crédito is selected
async function updateLimiteInfo(contaId) {
  const el = document.getElementById('comp-conta-limite-info');
  if (!el) return;
  if (!contaId) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  const conta = getConta(contaId);
  if (!conta || conta.tipo !== 'Cartão de Crédito') { el.classList.add('hidden'); el.innerHTML = ''; return; }

  const limite = Number(conta.limite) || 0;
  const relevantes = cachedCompromissos
    .filter((c) => c.conta_id === contaId && c.status === 'ativa' && !c.valor_variavel);

  // Garante que todas as taxas necessárias estão carregadas antes de somar.
  const moedasFaltando = [...new Set(
    relevantes.map((c) => c.moeda).filter((m) => m && m !== 'BRL' && !ratesMapLocal.has(m))
  )];
  if (moedasFaltando.length > 0) {
    await Promise.all(moedasFaltando.map(async (cur) => {
      try {
        ratesMapLocal.set(cur, await fetchExchangeRate(cur, 'BRL'));
      } catch (err) {
        console.error(`[updateLimiteInfo] falha ao buscar taxa ${cur}→BRL:`, err);
      }
    }));
  }

  const comprometido = relevantes
    .reduce((sum, c) => sum + convertToLocalBRL(Number(c.valor_base) || 0, c.moeda), 0);

  if (!limite) {
    el.classList.remove('hidden');
    el.innerHTML = `<span class="limite-info-row"><span class="limite-info-label">Comprometido</span><strong>${formatCurrency(comprometido)}</strong> <span class="limite-info-hint">(limite não configurado)</span></span>`;
    return;
  }

  const disponivel = Math.max(0, limite - comprometido);
  const pct = Math.min(100, (comprometido / limite) * 100);
  const pctColor = pct >= 90 ? 'var(--color-danger)' : pct >= 70 ? 'var(--color-warning)' : 'var(--color-success)';
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="limite-info-row">
      <span class="limite-info-label">Limite</span><strong>${formatCurrency(limite)}</strong>
      <span class="limite-info-sep">·</span>
      <span class="limite-info-label">Comprometido</span><strong style="color:${pctColor}">${formatCurrency(comprometido)} (${pct.toFixed(0)}%)</strong>
      <span class="limite-info-sep">·</span>
      <span class="limite-info-label">Disponível</span><strong>${formatCurrency(disponivel)}</strong>
    </div>
    <div class="limite-info-bar" style="--pct:${pct.toFixed(1)}%;--bar-color:${pctColor};"></div>
  `;
}

// Renderiza grid com 12 meses futuros, pré-preenchendo com valores existentes
async function populateValoresMensaisGrid(c, catId = null) {
  const grid = document.getElementById('valores-mensais-grid');
  const months = nextNMonths(12);

  let existingMap = new Map();
  const lookupId = catId || c?.id;
  if (lookupId) {
    const startMesAno = months[0].mesAno;
    const endMesAno = months[months.length - 1].mesAno;
    const col = catId ? 'categoria_id' : 'subcategoria_id';
    const { data, error } = await supabase
      .from('orcamento_geral')
      .select('mes_ano, valor_previsto')
      .eq(col, lookupId)
      .gte('mes_ano', startMesAno)
      .lte('mes_ano', endMesAno);
    if (!error) {
      for (const row of data || []) {
        existingMap.set(row.mes_ano, Number(row.valor_previsto) || 0);
      }
    }
  }

  grid.innerHTML = months.map((m) => {
    const valor = existingMap.has(m.mesAno) ? existingMap.get(m.mesAno) : '';
    return `
      <div class="valor-mensal-item">
        <span class="valor-mensal-label">${m.label}</span>
        <input type="number" step="0.01" min="0" class="valor-mensal-input" data-mes-ano="${m.mesAno}" value="${valor}" placeholder="0,00">
      </div>
    `;
  }).join('');
}

function collectValoresMensais() {
  const inputs = document.querySelectorAll('.valor-mensal-input');
  const items = [];
  inputs.forEach((inp) => {
    const v = inp.value.trim();
    if (v === '') return;
    const num = Number(v);
    if (isNaN(num) || num < 0) return;
    items.push({ mes_ano: inp.dataset.mesAno, valor_previsto: num });
  });
  return items;
}

async function saveValoresMensaisToOrcamento(subcategoriaId, moeda, items, categoriaId = null) {
  if (items.length === 0) return;
  const user = await getCurrentUser();
  if (!user) return;

  if (categoriaId) {
    // Índice parcial não suporta ON CONFLICT — usa DELETE + INSERT
    const mesAnos = items.map((it) => it.mes_ano);
    const { error: delErr } = await supabase
      .from('orcamento_geral')
      .delete()
      .eq('categoria_id', categoriaId)
      .in('mes_ano', mesAnos);
    if (delErr) { console.error('[saveValoresMensais delete]', delErr); }

    const rows = items.map((it) => ({
      user_id: user.id,
      categoria_id: categoriaId,
      mes_ano: it.mes_ano,
      valor_previsto: it.valor_previsto,
      moeda,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('orcamento_geral').insert(rows);
    if (error) {
      console.error('[saveValoresMensaisToOrcamento cat]', error);
      showToast('Erro ao salvar valores mensais: ' + error.message, 'error', 8000);
    }
    return;
  }

  const rows = items.map((it) => ({
    user_id: user.id,
    subcategoria_id: subcategoriaId,
    mes_ano: it.mes_ano,
    valor_previsto: it.valor_previsto,
    moeda,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('orcamento_geral')
    .upsert(rows, { onConflict: 'user_id,subcategoria_id,mes_ano' });

  if (error) {
    console.error('[saveValoresMensaisToOrcamento sub]', error);
    showToast('Erro ao salvar valores mensais: ' + error.message, 'error', 8000);
  }
}

// -----------------------------
// Display name
// -----------------------------
function displayName(c) {
  return c.apelido?.trim() || c.nome;
}

// Ordena por dia de vencimento (ascendente). Itens sem vencimento_dia (Semanal/Anual)
// vão pro fim. Tie-breaker: nome alfabético.
function compareByVencimento(a, b) {
  const va = a.vencimento_dia;
  const vb = b.vencimento_dia;
  if (va == null && vb == null) {
    return displayName(a).localeCompare(displayName(b), 'pt-BR');
  }
  if (va == null) return 1;
  if (vb == null) return -1;
  if (va !== vb) return va - vb;
  return displayName(a).localeCompare(displayName(b), 'pt-BR');
}

function getCategoria(id) { return cachedCategorias.find((c) => c.id === id) || null; }
function getConta(id) { return cachedContas.find((c) => c.id === id) || null; }

// -----------------------------
// Open modal (novo / editar)
// -----------------------------
function openCompromissoModal(c = null) {
  editingId    = c?.id || null;
  editingCatId = null;

  document.getElementById('modal-compromisso-title').textContent = c ? 'Editar compromisso' : 'Novo compromisso';
  document.getElementById('btn-salvar-compromisso').textContent = c ? 'Salvar alterações' : 'Salvar';

  document.getElementById('form-compromisso').reset();

  // Re-renderiza dropdowns (caso categorias/contas tenham mudado)
  renderModalDropdowns();

  // Nivel toggle: só visível na criação; em edição está fixo em subcategoria
  setNivelMode('subcategoria');
  document.getElementById('nivel-field').classList.toggle('hidden', !!editingId);

  const tipo = c?.tipo || DEFAULT_TIPO;
  const status = c?.status || 'ativa';

  document.getElementById('comp-nome').value = c?.nome || '';
  document.getElementById('comp-apelido').value = c?.apelido || '';
  document.getElementById('comp-tipo').value = tipo;
  document.getElementById('comp-categoria').value = c?.categoria_id || '';
  document.getElementById('comp-projeto').value = c?.projeto_id || '';
  document.getElementById('comp-divida').value  = c?.divida_id  || '';
  initContatoPickerOnce();
  contatoPicker?.setValue(c?.contato_id || '');
  document.getElementById('comp-conta').value = c?.conta_id || '';
  document.getElementById('comp-tipo-pagamento').value = c?.tipo_pagamento || '';
  document.getElementById('comp-periodo').value = c?.periodo || 'Mensal';
  document.getElementById('comp-vencimento-dia').value = c?.vencimento_dia || '';
  document.getElementById('comp-vencimento-data-anual').value = anualDateFromCompromisso(c);
  document.getElementById('comp-dia-semana').value = c?.dia_semana ?? '';
  document.getElementById('comp-intervalo-semanas').value = c?.intervalo_semanas || 1;
  document.getElementById('comp-valor-base').value = c?.valor_base ?? '';
  document.getElementById('comp-moeda').value = c?.moeda || 'BRL';
  const moedaVarEl = document.getElementById('comp-moeda-var');
  if (moedaVarEl) moedaVarEl.value = c?.moeda || 'BRL';
  document.getElementById('comp-iniciado-em').value = c?.iniciado_em || todayISO();
  document.getElementById('comp-terminado-em').value = c?.terminado_em || '';
  document.getElementById('comp-descricao').value = c?.descricao || '';
  // Motivo só aparece em edit mode
  document.getElementById('motivo-field').classList.toggle('hidden', !c);
  document.getElementById('comp-motivo').value = '';
  document.getElementById('comp-status').value = status;

  // Flags: valor variável + renda principal
  document.getElementById('comp-valor-variavel').checked = !!c?.valor_variavel;
  document.getElementById('comp-renda-principal').checked = !!c?.eh_renda_principal;

  document.querySelectorAll('.tipo-btn').forEach((b) => b.classList.toggle('active', b.dataset.tipo === tipo));
  document.querySelectorAll('#status-segmented .segmented-btn').forEach((b) => b.classList.toggle('active', b.dataset.status === status));

  const contaDestinoEl = document.getElementById('comp-conta-destino');
  if (contaDestinoEl) contaDestinoEl.value = c?.conta_destino_id || '';

  toggleVencimentoFields();
  toggleValorVariavelFields();
  toggleRendaPrincipalRow();
  toggleProjetoField();
  toggleDividaField();
  toggleTransferFields();
  updateLimiteInfo(c?.conta_id || '');
  if (c?.valor_variavel) {
    populateValoresMensaisGrid(c);
  } else {
    document.getElementById('valores-mensais-grid').innerHTML = '';
  }

  openModal('modal-compromisso');
}

// Opens the create modal pre-filled with an existing compromisso's data (no editingId)
function duplicateCompromisso(c) {
  openCompromissoModal(c);
  editingId = null;
  document.getElementById('modal-compromisso-title').textContent = 'Duplicar compromisso';
  document.getElementById('btn-salvar-compromisso').textContent = 'Criar cópia';
  // Clear motivo field (not relevant for new record)
  document.getElementById('motivo-field').classList.add('hidden');
  document.getElementById('comp-motivo').value = '';
}

// -----------------------------
// Open details modal
// -----------------------------
async function openDetailsModal(c) {
  detailsCompromisso = c;

  // Icon (cor do tipo)
  const iconHost = document.getElementById('details-icon');
  const tColor = tipoColor(c.tipo);
  iconHost.innerHTML = `
    <div style="width: 56px; height: 56px; border-radius: var(--radius-full); background: ${tColor}1A; color: ${tColor}; display: flex; align-items: center; justify-content: center;">
      <div style="width: 28px; height: 28px;">${tipoIcon(c.tipo)}</div>
    </div>
  `;

  const display = displayName(c);
  document.getElementById('details-name').textContent = display;
  const officialEl = document.getElementById('details-official-name');
  if (c.apelido && c.apelido.trim() && c.apelido !== c.nome) {
    officialEl.textContent = `Nome oficial: ${c.nome}`;
  } else {
    officialEl.textContent = '';
  }

  const statusLabel = { ativa: 'Ativa', inativa: 'Inativa', arquivada: 'Arquivada' }[c.status];
  const categoria = getCategoria(c.categoria_id);
  document.getElementById('details-meta').innerHTML = `
    ${tipoPill(c.tipo)}
    ${categoria ? `<span class="status-pill" style="background: ${categoria.cor}1A; color: ${categoria.cor};"><span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span>${escapeHtml(categoria.nome)}</span>` : ''}
    ${c.eh_renda_principal ? '<span class="renda-principal-badge">Renda principal</span>' : ''}
    <span class="status-pill status-${c.status}">${statusLabel}</span>
  `;

  const conta = getConta(c.conta_id);
  const contaDisplay = conta ? (conta.apelido?.trim() || conta.nome) : '— (não vinculado)';

  // Vencimento
  let venc = '—';
  if (c.periodo === 'Semanal' || c.periodo === 'Quinzenal') {
    if (c.dia_semana !== null && c.dia_semana !== undefined) {
      const n = Number(c.intervalo_semanas) || 1;
      if (c.periodo === 'Quinzenal') {
        venc = `Toda outra ${diaSemanaLabel(c.dia_semana)}`;
      } else if (n > 1) {
        venc = `A cada ${n} semanas (${diaSemanaLabel(c.dia_semana)})`;
      } else {
        venc = `Toda ${diaSemanaLabel(c.dia_semana)}`;
      }
    }
  } else if (c.vencimento_dia) {
    venc = `Dia ${c.vencimento_dia}`;
  }

  const dv = getDisplayValor(c);
  const valorLabel = c.valor_variavel
    ? `Próximo valor${dv.mesAno ? ` (${monthLabelFromIso(dv.mesAno)})` : ''}`
    : 'Valor base';
  const valorDisplay = c.valor_variavel
    ? `${formatCurrency(dv.valor, dv.moeda)} (varia por mês)`
    : formatCurrency(c.valor_base, c.moeda);

  const fields = [
    { label: 'Categoria',         value: categoria ? categoria.nome : '— (categoria removida)' },
    ...(c.projeto_id ? [{
      label: 'Projeto vinculado',
      value: getProjeto(c.projeto_id)?.nome || '— (projeto removido)'
    }] : []),
    ...(c.divida_id ? [{
      label: 'Dívida vinculada',
      value: getDivida(c.divida_id)?.nome || '— (dívida removida)'
    }] : []),
    { label: 'Banco/Cartão',      value: contaDisplay },
    { label: 'Tipo de pagamento', value: c.tipo_pagamento || '—' },
    { label: 'Vencimento',        value: venc },
    { label: 'Período',           value: c.periodo },
    { label: valorLabel,          value: valorDisplay },
    { label: 'Iniciado em',       value: formatDateBR(c.iniciado_em) },
    { label: 'Termina em',        value: c.terminado_em ? formatDateBR(c.terminado_em) : 'Em curso' },
    { label: 'Status',            value: statusLabel },
    { label: 'Descrição',         value: c.descricao, full: true },
    { label: 'Cadastrado em',     value: formatDateBR(c.created_at?.slice(0, 10)) },
    { label: 'Modificado em',     value: c.modificado_em ? formatDateTimeBR(c.modificado_em) : '—' },
  ];

  document.getElementById('details-grid').innerHTML = fields.map((f) => `
    <div class="details-field" ${f.full ? 'style="grid-column: 1 / -1;"' : ''}>
      <span class="details-field-label">${f.label}</span>
      <span class="details-field-value ${!f.value ? 'details-field-empty' : ''}">${f.value ? escapeHtml(String(f.value)) : '—'}</span>
    </div>
  `).join('');

  // Botões: Arquivar (ativa/inativa) ou Deletar (arquivada)
  const btnArq = document.getElementById('btn-arquivar');
  const btnDel = document.getElementById('btn-deletar');
  if (c.status === 'arquivada') {
    btnArq.classList.add('hidden');
    btnDel.classList.remove('hidden');
  } else {
    btnArq.classList.remove('hidden');
    btnDel.classList.add('hidden');
  }

  document.getElementById('btn-encerrar').classList.toggle('hidden', c.status === 'arquivada' || !!c.terminado_em);

  // Reset histórico (escondido até carregar)
  document.getElementById('details-history').classList.add('hidden');
  document.getElementById('details-history-list').innerHTML = '';
  document.getElementById('details-financial-history').classList.add('hidden');
  document.getElementById('details-financial-history-list').innerHTML = '';

  openModal('modal-details');

  // Carrega histórico em background (não bloqueia abertura do modal)
  loadAndShowHistory(c.id, c.moeda);
  if (c.projeto_id || c.divida_id) loadAndShowFinancialHistory(c);
}

// -----------------------------
// Histórico financeiro do vínculo (projeto / dívida)
// Mostra saldo_inicial / valor_pago mesmo quando não há extrato manual.
// -----------------------------
async function loadAndShowFinancialHistory(c) {
  const section = document.getElementById('details-financial-history');
  const titleEl = document.getElementById('details-financial-history-title');
  const listEl  = document.getElementById('details-financial-history-list');
  const fmtDate = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

  if (c.projeto_id) {
    const [projRes, aportesRes] = await Promise.all([
      supabase.from('projetos_investimento').select('saldo_inicial, nome').eq('id', c.projeto_id).single(),
      supabase.from('aportes_projeto').select('*').eq('projeto_id', c.projeto_id).order('data', { ascending: false }),
    ]);
    if (aportesRes.error && !/relation.*aportes_projeto/i.test(aportesRes.error.message))
      console.warn('[financialHistory]', aportesRes.error);

    const proj         = projRes.data;
    const aportes      = aportesRes.data || [];
    const saldoInicial = Number(proj?.saldo_inicial) || 0;

    if (aportes.length === 0 && saldoInicial === 0) {
      titleEl.textContent = `Aportes — ${escapeHtml(proj?.nome || '')}`;
      listEl.innerHTML = `
        <div style="text-align:center; padding: var(--space-5); color: var(--color-text-muted); font-size: var(--fs-sm);">
          Nenhum aporte registrado ainda. Use a página <strong>Investimentos</strong> para registrar aportes neste projeto.
        </div>`;
      section.classList.remove('hidden');
      return;
    }

    const rowsHtml = [];
    for (const a of aportes) {
      rowsHtml.push(`
        <div class="proj-hist-row proj-hist-row-aporte">
          <span class="proj-hist-date">${fmtDate(a.data)}</span>
          <span class="proj-hist-name">${escapeHtml(a.descricao || 'Aporte')} <span class="proj-hist-tag">Aporte</span></span>
          <span class="proj-hist-value">${formatCurrency(Number(a.valor), 'BRL')}</span>
        </div>`);
    }
    if (saldoInicial > 0) {
      rowsHtml.push(`
        <div class="proj-hist-row proj-hist-row-saldo">
          <span class="proj-hist-date">—</span>
          <span class="proj-hist-name">Saldo inicial</span>
          <span class="proj-hist-value">${formatCurrency(saldoInicial, 'BRL')}</span>
        </div>`);
    }

    const totalAportes = aportes.reduce((s, a) => s + Number(a.valor), 0);
    const totalGeral   = totalAportes + saldoInicial;
    titleEl.textContent = `Aportes — ${escapeHtml(proj?.nome || '')} (${rowsHtml.length} entrada${rowsHtml.length !== 1 ? 's' : ''})`;
    listEl.innerHTML = `
      <div class="proj-hist-list">${rowsHtml.join('')}</div>
      <div style="display:flex;justify-content:flex-end;padding:var(--space-3) var(--space-4);font-weight:var(--fw-bold);font-size:var(--fs-sm);border-top:1px solid var(--color-border);">
        Total investido: ${formatCurrency(totalGeral, 'BRL')}
      </div>`;
    section.classList.remove('hidden');

  } else if (c.divida_id) {
    const [dividaRes, histRes] = await Promise.all([
      supabase.from('dividas').select('nome, valor_pago, valor_total').eq('id', c.divida_id).single(),
      supabase.from('pagamentos_divida_historico').select('*').eq('divida_id', c.divida_id).order('data', { ascending: false }),
    ]);
    if (histRes.error && !/relation.*pagamentos_divida_historico/i.test(histRes.error.message))
      console.warn('[financialHistory]', histRes.error);

    const divida   = dividaRes.data;
    const entradas = histRes.data || [];
    if (!divida) return;

    const valorPago  = Number(divida.valor_pago) || 0;
    const valorTotal = Number(divida.valor_total) || 0;
    if (entradas.length === 0 && valorPago === 0) {
      titleEl.textContent = `Pagamentos — ${escapeHtml(divida.nome)}`;
      listEl.innerHTML = `
        <div style="text-align:center; padding: var(--space-5); color: var(--color-text-muted); font-size: var(--fs-sm);">
          Nenhum pagamento registrado ainda. Use a página <strong>Dívidas</strong> para registrar pagamentos.
        </div>`;
      section.classList.remove('hidden');
      return;
    }

    let bodyHtml;
    if (entradas.length > 0) {
      const rows = entradas.map((h) => `
        <div class="proj-hist-row">
          <span class="proj-hist-date">${fmtDate(h.data)}</span>
          <span class="proj-hist-name">${escapeHtml(h.descricao || 'Pagamento')}</span>
          <span class="proj-hist-value">${formatCurrency(Number(h.valor), 'BRL')}</span>
        </div>`).join('');
      const totalExtrato = entradas.reduce((s, h) => s + Number(h.valor), 0);
      bodyHtml = `
        <div class="proj-hist-list">${rows}</div>
        <div style="display:flex;justify-content:flex-end;padding:var(--space-3) var(--space-4);font-weight:var(--fw-bold);font-size:var(--fs-sm);border-top:1px solid var(--color-border);">
          Total pago: ${formatCurrency(totalExtrato, 'BRL')}
        </div>`;
    } else {
      // Registrado via "Total já pago" — sem extrato detalhado
      const pct = valorTotal > 0 ? Math.min(100, (valorPago / valorTotal) * 100) : 0;
      bodyHtml = `
        <div class="proj-hist-row proj-hist-row-saldo">
          <span class="proj-hist-date">—</span>
          <span class="proj-hist-name">Total pago (sem extrato detalhado)</span>
          <span class="proj-hist-value">${formatCurrency(valorPago, 'BRL')}</span>
        </div>
        <div class="proj-hist-row">
          <span class="proj-hist-date">—</span>
          <span class="proj-hist-name" style="color:var(--color-text-muted);">Total da dívida</span>
          <span class="proj-hist-value" style="color:var(--color-text-muted);">${formatCurrency(valorTotal, 'BRL')} (${pct.toFixed(0)}%)</span>
        </div>`;
    }

    titleEl.textContent = `Pagamentos — ${escapeHtml(divida.nome)} (${entradas.length > 0 ? entradas.length + ' entrada' + (entradas.length !== 1 ? 's' : '') : 'total'})`;
    listEl.innerHTML = `<div class="proj-hist-list">${bodyHtml}</div>`;
    section.classList.remove('hidden');
  }
}

// -----------------------------
// Histórico de alterações
// -----------------------------
async function loadAndShowHistory(subcategoriaId, currentMoeda) {
  const historyEl = document.getElementById('details-history');
  const listEl = document.getElementById('details-history-list');

  const { data, error } = await supabase
    .from('subcategoria_history')
    .select('*')
    .eq('subcategoria_id', subcategoriaId)
    .order('alterado_em', { ascending: false });

  if (error) {
    console.error('[loadAndShowHistory]', error);
    return;
  }
  if (!data || data.length === 0) {
    historyEl.classList.add('hidden');
    return;
  }

  historyEl.classList.remove('hidden');

  const FIELD_LABELS = {
    valor_base:     'Valor',
    periodo:        'Período',
    vencimento_dia: 'Dia do mês',
    dia_semana:     'Dia da semana',
    tipo:           'Tipo',
  };

  const formatHistoryValue = (campo, raw) => {
    if (raw === null || raw === '' || raw === undefined) return '—';
    if (campo === 'valor_base') return formatCurrency(Number(raw), currentMoeda);
    if (campo === 'vencimento_dia') return `Dia ${raw}`;
    if (campo === 'dia_semana') return diaSemanaLabel(Number(raw));
    return raw;
  };

  listEl.innerHTML = data.map((h) => {
    const date  = formatDateTimeBR(h.alterado_em);
    const label = FIELD_LABELS[h.campo] || h.campo;
    const oldV  = formatHistoryValue(h.campo, h.valor_anterior);
    const newV  = formatHistoryValue(h.campo, h.valor_novo);
    const motivoHtml = h.motivo
      ? `<div style="margin-top: var(--space-1); padding: 6px 10px; background: var(--color-surface-alt); border-left: 3px solid var(--color-primary); border-radius: var(--radius-sm); font-size: var(--fs-xs); color: var(--color-text-secondary); font-style: italic;">"${escapeHtml(h.motivo)}"</div>`
      : '';
    return `
      <div style="display:flex; gap: var(--space-3); padding: var(--space-3) 0; font-size: var(--fs-sm); border-bottom: 1px solid var(--color-border);">
        <span style="color: var(--color-text-muted); font-size: var(--fs-xs); white-space: nowrap; min-width: 130px; padding-top: 2px;">${date}</span>
        <div style="flex: 1; min-width: 0;">
          <div style="color: var(--color-text-main);">
            <strong>${label}:</strong>
            <span style="color: var(--color-text-secondary); text-decoration: line-through;">${escapeHtml(oldV)}</span>
            →
            <strong style="color: var(--color-primary);">${escapeHtml(newV)}</strong>
          </div>
          ${motivoHtml}
        </div>
      </div>
    `;
  }).join('');
}

// -----------------------------
// Log history entries (chamado após updates)
// -----------------------------
const TRACKED_FIELDS = ['valor_base', 'periodo', 'vencimento_dia', 'dia_semana', 'tipo'];

async function logHistoryEntries(subcategoriaId, oldData, newData, motivo) {
  const user = await getCurrentUser();
  if (!user) return;

  const entries = [];
  for (const field of TRACKED_FIELDS) {
    const oldVal = oldData[field];
    const newVal = newData[field];
    const oldStr = (oldVal === null || oldVal === undefined) ? '' : String(oldVal);
    const newStr = (newVal === null || newVal === undefined) ? '' : String(newVal);
    if (oldStr !== newStr) {
      entries.push({
        subcategoria_id: subcategoriaId,
        user_id: user.id,
        campo: field,
        valor_anterior: oldStr || null,
        valor_novo: newStr || null,
        motivo: motivo || null,
      });
    }
  }

  if (entries.length === 0) return;

  const { error } = await supabase.from('subcategoria_history').insert(entries);
  if (error) console.error('[logHistoryEntries]', error);
}

// -----------------------------
// Atalho: Atualizar valor (modal compacto)
// -----------------------------
function openValorUpdateModal(c) {
  detailsCompromisso = c;
  document.getElementById('quick-compromisso-name').textContent = displayName(c);
  document.getElementById('quick-valor-current').textContent = formatCurrency(c.valor_base, c.moeda);
  document.getElementById('quick-valor-input').value = c.valor_base;
  document.getElementById('quick-valor-moeda').textContent = c.moeda;
  document.getElementById('quick-motivo-input').value = '';
  closeModal('modal-details');
  openModal('modal-quick-valor');
}

async function saveQuickValor(event) {
  event.preventDefault();
  const button = document.getElementById('btn-salvar-quick-valor');

  const novoValorRaw = document.getElementById('quick-valor-input').value;
  const motivo = document.getElementById('quick-motivo-input').value.trim() || null;

  if (novoValorRaw === '' || isNaN(Number(novoValorRaw))) {
    showToast(t('compromissos.validacao.valor_invalido', 'Informe um valor válido'), 'error');
    return;
  }

  const novoValor = Number(novoValorRaw);
  if (!detailsCompromisso) return;

  if (novoValor === Number(detailsCompromisso.valor_base)) {
    showToast(t('compromissos.toast.valor_inalterado', 'O valor não mudou'), 'info');
    return;
  }

  const original = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    const { data, error } = await supabase
      .from('subcategorias')
      .update({ valor_base: novoValor })
      .eq('id', detailsCompromisso.id)
      .select()
      .single();
    if (error) throw error;

    await logHistoryEntries(detailsCompromisso.id, detailsCompromisso, data, motivo);

    showToast(t('compromissos.toast.valor_atualizado', 'Valor atualizado'), 'success');
    closeModal('modal-quick-valor');
    await loadCompromissos();
  } catch (err) {
    console.error('[saveQuickValor]', err);
    showToast('Erro ao atualizar: ' + (err.message || err), 'error', 8000);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function showConfirm(title, msgHtml, confirmLabel = 'Confirmar') {
  document.getElementById('modal-confirmar-title').textContent = title;
  document.getElementById('modal-confirmar-msg').innerHTML = msgHtml;
  document.getElementById('btn-confirmar-acao').textContent = confirmLabel;
  openModal('modal-confirmar');
}

// -----------------------------
// Load compromissos
// -----------------------------
async function loadCompromissos() {
  const container = document.getElementById('compromissos-container');
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span>Carregando…</div>';

  const { data, error } = await supabase
    .from('subcategorias')
    .select('*')
    .order('nome');

  if (error) {
    console.error('[loadCompromissos]', error);
    container.innerHTML = '';
    let msg = error.message || JSON.stringify(error);
    if (/relation.*subcategorias.*does not exist/i.test(msg) || /column.*categoria_id/i.test(msg)) {
      msg = 'Schema desatualizado — rode a migration 0006_compromissos_rebrand.sql no Supabase.';
    }
    showToast('Erro: ' + msg, 'error', 12000);
    return;
  }

  cachedCompromissos = data || [];
  await Promise.all([loadProxValores(), refreshLocalRates()]);
  renderCompromissos();
}

async function refreshLocalRates() {
  const currencies = [...new Set(
    cachedCompromissos.map((c) => c.moeda).filter((m) => m && m !== 'BRL')
  )];
  await Promise.all(currencies.map(async (cur) => {
    try {
      ratesMapLocal.set(cur, await fetchExchangeRate(cur, 'BRL'));
    } catch { /* silent */ }
  }));
}

function convertToLocalBRL(value, currency) {
  if (!currency || currency === 'BRL') return Number(value) || 0;
  const rate = ratesMapLocal.get(currency);
  if (!rate) {
    console.warn(`[convertToLocalBRL] taxa ${currency}→BRL ausente; usando valor cru.`);
    return Number(value) || 0;
  }
  return (Number(value) || 0) * rate;
}

// Carrega o próximo valor (orcamento_geral mais recente >= hoje) pra cada
// compromisso com valor_variavel. Usado pra exibir "próximo valor" na lista.
async function loadProxValores() {
  cachedProxValores.clear();
  const today = new Date();
  const todayMesAno = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

  const variableSubIds = cachedCompromissos.filter((c) => c.valor_variavel).map((c) => c.id);
  if (variableSubIds.length > 0) {
    const { data, error } = await supabase
      .from('orcamento_geral')
      .select('subcategoria_id, valor_previsto, moeda, mes_ano')
      .in('subcategoria_id', variableSubIds)
      .gte('mes_ano', todayMesAno)
      .order('mes_ano', { ascending: true });
    if (error) { console.warn('[loadProxValores subs]', error); }
    for (const row of (data || [])) {
      if (!cachedProxValores.has(row.subcategoria_id)) {
        cachedProxValores.set(row.subcategoria_id, row);
      }
    }
  }

  const variableCatIds = cachedCategorias.filter((c) => c.valor_variavel).map((c) => c.id);
  if (variableCatIds.length > 0) {
    const { data, error } = await supabase
      .from('orcamento_geral')
      .select('categoria_id, valor_previsto, moeda, mes_ano')
      .in('categoria_id', variableCatIds)
      .gte('mes_ano', todayMesAno)
      .order('mes_ano', { ascending: true });
    if (error) { console.warn('[loadProxValores cats]', error); }
    for (const row of (data || [])) {
      if (!cachedProxValores.has('cat_' + row.categoria_id)) {
        cachedProxValores.set('cat_' + row.categoria_id, row);
      }
    }
  }
}

// Próximos N meses como [{year, month, mesAno, label}, ...]
function nextNMonths(n = 12) {
  const now = new Date();
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mesAno = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
    out.push({ year: d.getFullYear(), month: d.getMonth(), mesAno, label });
  }
  return out;
}

// Retorna {valor, moeda, isVariavel, mesAno?} pra exibição na lista/DRE/calendar.
// proxKey permite sobrescrever a chave usada em cachedProxValores (ex: 'cat_' + id para categorias).
function getDisplayValor(c, proxKey = null) {
  if (c.valor_variavel) {
    const prox = cachedProxValores.get(proxKey ?? c.id);
    if (prox) {
      return { valor: Number(prox.valor_previsto) || 0, moeda: prox.moeda || c.moeda, isVariavel: true, mesAno: prox.mes_ano };
    }
    return { valor: 0, moeda: c.moeda, isVariavel: true, mesAno: null };
  }
  return { valor: Number(c.valor_base) || 0, moeda: c.moeda, isVariavel: false, mesAno: null };
}

// -----------------------------
// Render: dados unificados (categoria + subcategoria)
// -----------------------------

function isRowConfigured(row) {
  if (row._type === 'cat') return false;
  return Number(row.valor_base) > 0 || row.valor_variavel === true;
}

function buildUnifiedRows() {
  const rows = [];
  const subsByCat = new Map();
  cachedCategorias.forEach((c) => subsByCat.set(c.id, []));
  const orphanSubs = [];
  cachedCompromissos.forEach((sub) => {
    if (subsByCat.has(sub.categoria_id)) subsByCat.get(sub.categoria_id).push(sub);
    else orphanSubs.push(sub);
  });

  for (const bloco of SUPER_BLOCOS_LIST) {
    const cats = cachedCategorias.filter((c) => bloco.grupos.includes(c.grupo || 'custo_vida'));
    for (const cat of cats) {
      const subs = (subsByCat.get(cat.id) || []).sort(compareByVencimento);
      // Categoria aparece como linha se tem compromisso direto OU se não tem subcategorias
      if (subs.length === 0) {
        rows.push({ _type: 'cat', _catId: cat.id, _catObj: cat, ...cat });
      }
      for (const sub of subs) {
        rows.push({ _type: 'sub', _catId: sub.categoria_id, _catObj: cat, ...sub });
      }
    }
  }
  for (const sub of orphanSubs.sort(compareByVencimento)) {
    rows.push({ _type: 'sub', _catId: sub.categoria_id, _catObj: null, ...sub });
  }
  return rows;
}

function renderCompromissos() {
  const container = document.getElementById('compromissos-container');
  const emptyState = document.getElementById('empty-state');

  if (colVisEl) colVisEl.classList.toggle('hidden', viewMode !== 'table');

  const allRows = buildUnifiedRows();

  // Contadores — apenas itens configurados contam para ativa/inativa/arquivada
  const configured = allRows.filter(isRowConfigured);
  const counts = {
    todas:     allRows.length,
    ativa:     configured.filter((r) => (r.status || 'ativa') === 'ativa').length,
    inativa:   configured.filter((r) => r.status === 'inativa').length,
    arquivada: configured.filter((r) => r.status === 'arquivada').length,
  };
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.querySelector(`[data-count-status="${k}"]`);
    if (el) el.textContent = v;
  });

  if (allRows.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  // Filtros
  let filtered = allRows;

  if (filterConfig === 'configurado') {
    filtered = filtered.filter(isRowConfigured);
  } else if (filterConfig === 'sem-compromisso') {
    filtered = filtered.filter((r) => !isRowConfigured(r));
  }

  if (filterStatus !== 'todas') {
    filtered = filtered.filter((r) => {
      if (!isRowConfigured(r)) return false;
      return (r.status || 'ativa') === filterStatus;
    });
  }

  if (!filterCategorias.has('all')) {
    filtered = filtered.filter((r) => filterCategorias.has(r._catId));
  }

  if (filterSearch) {
    const q = filterSearch;
    filtered = filtered.filter((r) => {
      const name = (r._type === 'sub' ? displayName(r) : r.nome).toLowerCase();
      const catName = (r._catObj?.nome || '').toLowerCase();
      return name.includes(q) || catName.includes(q);
    });
  }

  if (viewMode === 'calendar') {
    const calItems = filtered.filter((r) => r._type === 'sub' && isRowConfigured(r));
    container.innerHTML = renderCalendar(calItems, calendarYear, calendarMonth);
    bindCalendarClicks(calItems);
  } else if (viewMode === 'dre') {
    const dreItems = filtered.filter((r) => r._type === 'sub' && isRowConfigured(r));
    container.innerHTML = renderDre(dreItems);
  } else {
    container.innerHTML = renderFlatTable(filtered);
    bindRowClicks();
  }
}

// -----------------------------
// Render: Tabela plana (flat)
// -----------------------------

function renderFlatTable(rows) {
  if (rows.length === 0) {
    return '<div class="empty-state"><p class="empty-state-message">Nenhum item com os filtros selecionados.</p></div>';
  }
  return `
    <div class="contas-table-wrapper">
      <table class="contas-table compromissos-grouped-table">
        <thead>
          <tr>
            <th>Compromisso</th>
            <th>Categoria</th>
            <th data-col="subcategoria">Subcategoria</th>
            <th data-col="tipo">Tipo</th>
            <th data-col="projeto">Vínculo</th>
            <th data-col="conta">Banco/Cartão</th>
            <th data-col="pagamento">Pagamento</th>
            <th data-col="vencimento">Vencimento</th>
            <th data-col="proximo">Próximo</th>
            <th data-col="termina">Termina em</th>
            <th data-col="periodo">Período</th>
            <th data-col="valor" class="text-right">Valor</th>
            <th data-col="descricao">Descrição</th>
            <th data-col="status">Status</th>
          </tr>
        </thead>
        <tbody>${rows.map(renderUnifiedRow).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderUnifiedRow(row) {
  const isSub      = row._type === 'sub';
  const cat        = row._catObj;
  const catColor   = cat?.cor || '#9CA3AF';
  const configured = isRowConfigured(row);
  const isInactive = configured && row.status && row.status !== 'ativa';
  const statusLabel = { ativa: 'Ativa', inativa: 'Inativa', arquivada: 'Arquivada' }[row.status] || '—';

  // Coluna "Compromisso"
  const compDisplay = isSub ? displayName(row) : row.nome;
  const officialDiff = isSub && row.apelido?.trim() && row.apelido !== row.nome;

  // Coluna "Categoria"
  const catCell = cat
    ? `<span style="display:inline-flex;align-items:center;gap:4px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${catColor};flex-shrink:0;"></span>
        ${escapeHtml(cat.nome)}
       </span>`
    : '<span class="text-muted">—</span>';

  // Coluna "Subcategoria"
  const subCell = isSub
    ? `<span>${escapeHtml(displayName(row))}</span>`
    : '<span class="text-muted">—</span>';

  // Vínculo
  let vinculoCell;
  if (isSub && row.projeto_id) {
    const proj = getProjeto(row.projeto_id);
    vinculoCell = `<span class="vinculo-badge vinculo-badge--projeto" data-vinculo-type="projeto" data-vinculo-id="${row.projeto_id}" style="--vinculo-cor:${proj?.cor};">${escapeHtml(proj?.nome ?? '—')}</span>`;
  } else if (row.divida_id) {
    const div = getDivida(row.divida_id);
    vinculoCell = `<span class="vinculo-badge vinculo-badge--divida" data-vinculo-type="divida" data-vinculo-id="${row.divida_id}">${escapeHtml(div?.nome ?? '—')}</span>`;
  } else {
    vinculoCell = '<span class="text-muted">—</span>';
  }

  const dataAttr = isSub ? `data-id="${row.id}"` : `data-cat-id="${cat?.id}"`;

  return `
    <tr class="compromisso-row ${isInactive ? 'inactive' : ''} ${row.status === 'arquivada' ? 'arquivada' : ''} ${!configured ? 'row-unconfigured' : ''}"
        style="--cat-color: ${catColor};" ${dataAttr}>
      <td>
        <div class="conta-row-name">
          ${configured ? renderTipoIcon(row.tipo, 'sm') : '<span style="width:20px;flex-shrink:0;"></span>'}
          <div class="conta-row-name-text">
            <span class="conta-row-name-display">${escapeHtml(compDisplay)}</span>
            ${officialDiff ? `<span class="conta-row-name-official">${escapeHtml(row.nome)}</span>` : ''}
          </div>
          ${isSub && row.is_parcial ? '<span class="parcial-indicator" title="Criado de pagamento parcial">½ rest.</span>' : ''}
        </div>
      </td>
      <td>${catCell}</td>
      <td data-col="subcategoria">${subCell}</td>
      <td data-col="tipo">${configured ? tipoPill(row.tipo || '—') : '<span class="text-muted">—</span>'}</td>
      <td data-col="projeto">${vinculoCell}</td>
      <td data-col="conta">${configured && isSub ? renderContaTransferCell(row, getConta(row.conta_id)) : (getConta(row.conta_id) ? `<span class="conta-badge">${escapeHtml(getConta(row.conta_id)?.apelido?.trim() || getConta(row.conta_id)?.nome)}</span>` : '<span class="text-muted">—</span>')}</td>
      <td data-col="pagamento">${row.tipo_pagamento || '<span class="text-muted">—</span>'}</td>
      <td data-col="vencimento" class="tabular">${configured ? renderVencCell(row) : '<span class="text-muted">—</span>'}</td>
      <td data-col="proximo">${configured && isSub ? renderNextDueCell(row) : '<span class="text-muted">—</span>'}</td>
      <td data-col="termina" class="tabular">${renderTerminaEmCell(row)}</td>
      <td data-col="periodo">${row.periodo || '<span class="text-muted">—</span>'}</td>
      <td data-col="valor" class="text-right tabular text-bold">${configured ? (isSub ? renderValorCell(row) : (row.valor_variavel ? renderValorCell(row, 'cat_' + row.id) : formatCurrency(row.valor_base, row.moeda || 'BRL'))) : '<span class="text-muted">—</span>'}</td>
      <td data-col="descricao">${renderDescricaoCell(row)}</td>
      <td data-col="status">${configured ? `<span class="status-pill status-${row.status || 'ativa'}">${statusLabel}</span>` : '<span class="text-muted">—</span>'}</td>
    </tr>
  `;
}

function renderVencCell(c) {
  if (c.periodo === 'Semanal' || c.periodo === 'Quinzenal') {
    if (c.dia_semana == null) return '—';
    const label = diaSemanaLabel(c.dia_semana);
    if (c.periodo === 'Semanal') {
      const n = Number(c.intervalo_semanas) || 1;
      return n > 1 ? `${label} / ${n}sem` : label;
    }
    return label;
  }
  return c.vencimento_dia ? `Dia ${c.vencimento_dia}` : '—';
}

// Célula "Termina em" — mostra a data de fim ou "Em curso" se aberto
function renderTerminaEmCell(c) {
  if (!c.terminado_em) {
    return '<span class="text-muted">Em curso</span>';
  }
  return `<span>${formatDateBR(c.terminado_em)}</span>`;
}

// Célula "Descrição" — mostra preview, com popup hover na descrição completa
function renderDescricaoCell(c) {
  const desc = (c.descricao || '').trim();
  if (!desc) {
    return '<span class="text-muted">—</span>';
  }
  const preview = desc.length > 32 ? desc.slice(0, 32) + '…' : desc;
  return `
    <span class="descricao-cell" tabindex="0">
      <span class="descricao-preview">${escapeHtml(preview)}</span>
      <span class="descricao-popover" role="tooltip">${escapeHtml(desc)}</span>
    </span>
  `;
}

// Célula de valor — mostra valor base, ou próximo valor pra valor_variavel.
function renderValorCell(c, proxKey = null) {
  const dv = getDisplayValor(c, proxKey);
  const valorStr = formatCurrency(dv.valor, dv.moeda);
  if (dv.isVariavel) {
    const tag = dv.mesAno
      ? `<span class="valor-variavel-tag" title="Próximo: ${monthLabelFromIso(dv.mesAno)}">varia</span>`
      : `<span class="valor-variavel-tag" title="Sem valor cadastrado pra próximos meses">varia</span>`;
    return `<span style="display:inline-flex; align-items:center; gap:6px; justify-content:flex-end;">${valorStr}${tag}</span>`;
  }
  return valorStr;
}

function monthLabelFromIso(iso) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}

function renderTipoIcon(tipo, size = 'lg') {
  const color = tipoColor(tipo);
  const icon = tipoIcon(tipo);
  const dim = size === 'sm' ? 28 : 48;
  const iconDim = size === 'sm' ? 14 : 24;
  return `
    <div style="width: ${dim}px; height: ${dim}px; border-radius: var(--radius-full); background: ${color}1A; color: ${color}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
      <div style="width: ${iconDim}px; height: ${iconDim}px;">${icon}</div>
    </div>
  `;
}

function renderContaInline(conta) {
  const display = conta.apelido?.trim() || conta.nome;
  const bank = findBank(conta.nome);
  const fallbackColor = conta.icone_cor || '#6B7280';
  const initialsValue = getInitials(display);

  if (bank) {
    return `<span style="display:inline-flex;align-items:center;gap:6px;">
      <img src="${logoUrl(bank.domain)}" alt="${escapeHtml(conta.nome)}" style="width:18px;height:18px;border-radius:50%;background:#fff;border:1px solid var(--color-border);object-fit:contain;padding:1px;flex-shrink:0;" data-fallback-color="${fallbackColor}" onerror="this.outerHTML='<span style=&quot;width:18px;height:18px;border-radius:50%;background:${fallbackColor};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;flex-shrink:0;&quot;>${escapeHtml(initialsValue)}</span>'">
      <span>${escapeHtml(display)}</span>
    </span>`;
  }
  return `<span style="display:inline-flex;align-items:center;gap:6px;">
    <span style="width:18px;height:18px;border-radius:50%;background:${fallbackColor};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;flex-shrink:0;">${escapeHtml(initialsValue)}</span>
    <span>${escapeHtml(display)}</span>
  </span>`;
}

function renderContaTransferCell(c, contaOrigem) {
  if (c.tipo === 'Transferência' && c.conta_destino_id) {
    const destino = getConta(c.conta_destino_id);
    const oriHtml  = contaOrigem ? renderContaInline(contaOrigem) : '<span class="text-muted">—</span>';
    const destHtml = destino     ? renderContaInline(destino)      : '<span class="text-muted">—</span>';
    return `<span style="display:inline-flex;flex-direction:column;gap:2px;font-size:var(--fs-xs);">
      <span style="display:inline-flex;align-items:center;gap:4px;"><span style="color:var(--color-text-muted);font-size:10px;">De</span>${oriHtml}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;"><span style="color:var(--color-text-muted);font-size:10px;">→</span>${destHtml}</span>
    </span>`;
  }
  return contaOrigem ? renderContaInline(contaOrigem) : '<span class="text-muted">—</span>';
}

function bindRowClicks() {
  document.querySelectorAll('.contas-table tbody tr[data-id], .contas-table tbody tr[data-cat-id]').forEach((row) => {
    row.addEventListener('click', () => {
      if (row.dataset.catId) {
        openCompromissoModal(null);
        document.getElementById('comp-categoria').value = row.dataset.catId;
        toggleDividaField();
        toggleProjetoField();
        return;
      }
      const c = cachedCompromissos.find((x) => x.id === row.dataset.id);
      if (c) openDetailsModal(c);
    });
  });
}

// -----------------------------
// Render: DRE view (agrupado por Categoria)
// -----------------------------
function renderDre(filteredCompromissos) {
  // Categorias a mostrar: respeita filtro de categoria
  // Se filtro = "all", mostra todas (incluindo vazias). Senão, só as filtradas.
  const showAllCategorias = filterCategorias.has('all');
  const categoriasToShow = showAllCategorias
    ? cachedCategorias
    : cachedCategorias.filter((c) => filterCategorias.has(c.id));

  // Agrupa compromissos por categoria_id
  const groupedByCategoria = new Map();
  categoriasToShow.forEach((cat) => groupedByCategoria.set(cat.id, []));
  const orphans = []; // sem categoria_id (categoria deletada)
  filteredCompromissos.forEach((c) => {
    if (groupedByCategoria.has(c.categoria_id)) {
      groupedByCategoria.get(c.categoria_id).push(c);
    } else if (showAllCategorias) {
      orphans.push(c);
    }
  });

  // Ordena cada grupo por dia de vencimento
  for (const arr of groupedByCategoria.values()) {
    arr.sort(compareByVencimento);
  }
  orphans.sort(compareByVencimento);

  // Calcular totais (usa próximo valor pra valor_variavel)
  let totalReceitas = 0;
  let totalDespesas = 0;
  filteredCompromissos.forEach((c) => {
    const v = getDisplayValor(c).valor;
    if (c.tipo === 'Receita') totalReceitas += v;
    else totalDespesas += v;
  });
  const resultado = totalReceitas - totalDespesas;

  // Render blocos
  const blocks = [];
  for (const cat of categoriasToShow) {
    const items = groupedByCategoria.get(cat.id) || [];
    blocks.push(renderDreBlock(cat, items));
  }
  if (orphans.length > 0) {
    blocks.push(renderDreBlock(
      { id: null, nome: 'Sem categoria', cor: '#9CA3AF' },
      orphans
    ));
  }

  // Empty state geral
  if (blocks.length === 0) {
    return '<div class="empty-state"><p class="empty-state-message">Nenhuma categoria pra mostrar.</p></div>';
  }

  return `
    <div class="dre-view">
      ${blocks.join('')}
      ${renderDreSummary(totalReceitas, totalDespesas, resultado)}
    </div>
  `;
}

function renderDreBlock(cat, items) {
  // Calcula total da categoria (signed: Receita +, Despesa -)
  let categoriaTotal = 0;
  items.forEach((c) => {
    const v = getDisplayValor(c).valor;
    categoriaTotal += (c.tipo === 'Receita') ? v : -v;
  });

  const totalSign = categoriaTotal > 0 ? '+' : (categoriaTotal < 0 ? '-' : '');
  const totalClass = categoriaTotal > 0 ? 'dre-positive' : (categoriaTotal < 0 ? 'dre-negative' : 'dre-zero');
  const totalDisplay = `${totalSign}${formatCurrency(Math.abs(categoriaTotal), 'BRL')}`;

  const itemsHtml = items.length === 0
    ? '<div class="dre-empty">Sem compromissos nesta categoria</div>'
    : `<div class="dre-items">${items.map(renderDreItem).join('')}</div>`;

  return `
    <div class="dre-categoria">
      <header class="dre-categoria-header">
        <span class="dre-categoria-color" style="background: ${cat.cor};"></span>
        <h3 class="dre-categoria-name">${escapeHtml(cat.nome)}</h3>
        <span class="dre-categoria-count">${items.length} ${items.length === 1 ? 'item' : 'itens'}</span>
      </header>
      ${itemsHtml}
      <footer class="dre-categoria-total">
        <span>Total ${escapeHtml(cat.nome)}</span>
        <span class="${totalClass}">${totalDisplay}</span>
      </footer>
    </div>
  `;
}

function renderDreItem(c) {
  const dv = getDisplayValor(c);
  const sign = c.tipo === 'Receita' ? '+' : '-';
  const colorClass = c.tipo === 'Receita' ? 'dre-positive' : 'dre-negative';
  const valueDisplay = `${sign}${formatCurrency(dv.valor, dv.moeda)}${dv.isVariavel ? ' <span class="valor-variavel-tag">varia</span>' : ''}`;

  // Meta: período + vencimento
  let venc = '';
  if (c.periodo === 'Semanal' || c.periodo === 'Quinzenal') {
    venc = (c.dia_semana !== null && c.dia_semana !== undefined) ? diaSemanaLabel(c.dia_semana) : '';
  } else if (c.vencimento_dia) {
    venc = `Dia ${c.vencimento_dia}`;
  }
  const meta = `${c.periodo}${venc ? ' · ' + venc : ''}`;

  const isInactive = c.status !== 'ativa';
  const inactiveClass = isInactive ? (c.status === 'arquivada' ? 'arquivada' : 'inactive') : '';

  return `
    <div class="dre-item ${inactiveClass}" data-id="${c.id}">
      <div>
        <div class="dre-item-name">${escapeHtml(displayName(c))}</div>
        <div class="dre-item-meta">${meta}${isInactive ? ` · ${c.status}` : ''}</div>
      </div>
      <span class="dre-item-value ${colorClass}">${valueDisplay}</span>
    </div>
  `;
}

function renderDreSummary(totalReceitas, totalDespesas, resultado) {
  const resultClass = resultado > 0 ? 'dre-positive' : (resultado < 0 ? 'dre-negative' : 'dre-zero');
  const resultSign = resultado > 0 ? '+' : (resultado < 0 ? '-' : '');
  return `
    <div class="dre-result">
      <div class="dre-summary-row">
        <span>Total Receitas</span>
        <strong class="dre-positive">+${formatCurrency(totalReceitas, 'BRL')}</strong>
      </div>
      <div class="dre-summary-row">
        <span>Total Despesas</span>
        <strong class="dre-negative">-${formatCurrency(totalDespesas, 'BRL')}</strong>
      </div>
      <div class="dre-summary-row dre-net">
        <span>Resultado Líquido</span>
        <span class="${resultClass}">${resultSign}${formatCurrency(Math.abs(resultado), 'BRL')}</span>
      </div>
    </div>
  `;
}

// -----------------------------
// Render: Calendar view
// -----------------------------
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_LABELS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Popover (hover) com detalhes dos compromissos do dia no calendário
function renderCalendarPopover(events, day, month, _year) {
  const sorted = [...events].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'Receita' ? -1 : 1;
    return displayName(a).localeCompare(displayName(b), 'pt-BR');
  });

  let totalReceitas = 0, totalDespesas = 0;
  const items = sorted.map((c) => {
    const dv = getDisplayValor(c);
    const sign = c.tipo === 'Receita' ? '+' : '-';
    const cls = c.tipo === 'Receita' ? 'dre-positive' : 'dre-negative';
    if (c.tipo === 'Receita') totalReceitas += dv.valor;
    else totalDespesas += dv.valor;
    const variaTag = dv.isVariavel ? ' <span class="valor-variavel-tag">varia</span>' : '';
    return `
      <li class="calendar-popover-item">
        <span class="calendar-popover-name">${escapeHtml(displayName(c))}</span>
        <span class="calendar-popover-value ${cls}">${sign}${formatCurrency(dv.valor, dv.moeda)}${variaTag}</span>
      </li>
    `;
  }).join('');

  const net = totalReceitas - totalDespesas;
  const netSign = net > 0 ? '+' : (net < 0 ? '-' : '');
  const netCls = net > 0 ? 'dre-positive' : (net < 0 ? 'dre-negative' : 'dre-zero');

  return `
    <div class="calendar-day-popover" role="tooltip">
      <div class="calendar-popover-title">${day} de ${MONTH_LABELS[month]}</div>
      <ul class="calendar-popover-list">${items}</ul>
      <div class="calendar-popover-summary">
        <span class="calendar-popover-summary-label">Saldo do dia</span>
        <span class="${netCls}">${netSign}${formatCurrency(Math.abs(net), 'BRL')}</span>
      </div>
    </div>
  `;
}

/**
 * Verifica se um compromisso tem ocorrência num dia específico.
 */
function occursOn(c, date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const start = c.iniciado_em ? new Date(c.iniciado_em + 'T00:00:00') : null;
  if (start && target < start) return false;

  if (c.terminado_em) {
    const term = new Date(c.terminado_em + 'T00:00:00');
    if (target > term) return false;
  }

  if (c.periodo === 'Único') {
    return start && target.getTime() === start.getTime();
  }
  if (c.periodo === 'Mensal') {
    return c.vencimento_dia === target.getDate();
  }
  if (c.periodo === 'Anual') {
    return start
      && c.vencimento_dia === target.getDate()
      && start.getMonth() === target.getMonth();
  }
  if (c.periodo === 'Semanal') {
    if (c.dia_semana !== target.getDay()) return false;
    const n = Number(c.intervalo_semanas) || 1;
    if (n <= 1) return true;
    if (!start) return true;
    const diff = Math.round((target - start) / (24 * 60 * 60 * 1000));
    return diff >= 0 && diff % (n * 7) === 0;
  }
  if (c.periodo === 'Quinzenal') {
    if (!start || c.dia_semana !== target.getDay()) return false;
    const diff = Math.round((target - start) / (24 * 60 * 60 * 1000));
    return diff >= 0 && diff % 14 === 0;
  }
  return false;
}

function renderCalendar(compromissos, year, month) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = firstDay.getDay(); // 0 = Domingo

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calcula compromissos por dia
  const compsByDay = {};
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    compsByDay[day] = compromissos.filter((c) => occursOn(c, d));
  }

  // Header com mês + nav
  const monthLabel = `${MONTH_LABELS[month]} ${year}`;

  // Weekday headers
  const weekdayCells = WEEKDAY_LABELS.map((w) => `<div class="calendar-weekday">${w}</div>`).join('');

  // Empty cells antes do dia 1
  const emptyCells = Array.from({ length: firstDayOfWeek }, () =>
    '<div class="calendar-day empty"></div>'
  ).join('');

  // Day cells
  const dayCells = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const isToday = d.getFullYear() === today.getFullYear()
                 && d.getMonth() === today.getMonth()
                 && d.getDate() === today.getDate();
    const events = compsByDay[day];
    const hasEvents = events.length > 0;

    // Separa em Receitas (verde) e Despesas (vermelho)
    const receitaCount = events.filter((c) => c.tipo === 'Receita').length;
    const despesaCount = events.filter((c) => c.tipo === 'Despesa').length;

    const badges = [];
    if (receitaCount > 0) {
      badges.push(`<span class="calendar-badge calendar-badge-receita">+${receitaCount}</span>`);
    }
    if (despesaCount > 0) {
      badges.push(`<span class="calendar-badge calendar-badge-despesa">-${despesaCount}</span>`);
    }
    const badgeHtml = badges.length > 0 ? `<div class="calendar-badges">${badges.join('')}</div>` : '';

    const popoverHtml = hasEvents ? renderCalendarPopover(events, day, month, year) : '';

    dayCells.push(`
      <div class="calendar-day ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}" data-day="${day}">
        <span class="calendar-day-num">${day}</span>
        ${badgeHtml}
        ${popoverHtml}
      </div>
    `);
  }

  return `
    <div class="calendar">
      <header class="calendar-header">
        <h2 class="calendar-title">${monthLabel}</h2>
        <div class="calendar-nav-group">
          <button class="calendar-nav" id="cal-today" type="button" title="Hoje" style="width: auto; padding: 0 var(--space-3); font-size: var(--fs-xs); font-weight: var(--fw-semibold);">Hoje</button>
          <button class="calendar-nav" id="cal-prev" type="button" aria-label="Mês anterior">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button class="calendar-nav" id="cal-next" type="button" aria-label="Próximo mês">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </header>
      <div class="calendar-grid">
        ${weekdayCells}
        ${emptyCells}
        ${dayCells.join('')}
      </div>
    </div>
  `;
}

function bindCalendarClicks(filteredCompromissos) {
  document.getElementById('cal-prev').addEventListener('click', () => navigateCalendar(-1));
  document.getElementById('cal-next').addEventListener('click', () => navigateCalendar(1));
  document.getElementById('cal-today').addEventListener('click', () => {
    const t = new Date();
    calendarYear = t.getFullYear();
    calendarMonth = t.getMonth();
    renderCompromissos();
  });

  document.querySelectorAll('.calendar-day.has-events').forEach((dayEl) => {
    dayEl.addEventListener('click', () => {
      const day = Number(dayEl.dataset.day);
      const date = new Date(calendarYear, calendarMonth, day);
      const events = filteredCompromissos.filter((c) => occursOn(c, date));
      openDayModal(date, events);
    });
  });
}

function navigateCalendar(delta) {
  calendarMonth += delta;
  if (calendarMonth < 0) {
    calendarMonth = 11;
    calendarYear -= 1;
  } else if (calendarMonth > 11) {
    calendarMonth = 0;
    calendarYear += 1;
  }
  renderCompromissos();
}

function openDayModal(date, events) {
  // Title
  const title = `${date.getDate()} de ${MONTH_LABELS[date.getMonth()]} de ${date.getFullYear()}`;
  document.getElementById('modal-day-title').textContent = title;

  // Summary: total receitas / despesas no dia (usa próximo valor pra valor_variavel)
  let totalReceitas = 0, totalDespesas = 0;
  events.forEach((c) => {
    const v = getDisplayValor(c).valor;
    if (c.tipo === 'Receita') totalReceitas += v;
    else totalDespesas += v;
  });
  const net = totalReceitas - totalDespesas;
  const netSign = net >= 0 ? '+' : '-';
  const netClass = net > 0 ? 'dre-positive' : (net < 0 ? 'dre-negative' : 'dre-zero');

  document.getElementById('day-summary').innerHTML = `
    <div style="flex: 1;"><span style="color: var(--color-text-muted);">Receitas:</span> <strong class="dre-positive">+${formatCurrency(totalReceitas, 'BRL')}</strong></div>
    <div style="flex: 1;"><span style="color: var(--color-text-muted);">Despesas:</span> <strong class="dre-negative">-${formatCurrency(totalDespesas, 'BRL')}</strong></div>
    <div style="flex: 1;"><span style="color: var(--color-text-muted);">Saldo:</span> <strong class="${netClass}">${netSign}${formatCurrency(Math.abs(net), 'BRL')}</strong></div>
  `;

  // Lista (ordem alfabética)
  const sorted = [...events].sort((a, b) =>
    displayName(a).localeCompare(displayName(b), 'pt-BR')
  );
  const listEl = document.getElementById('day-list');
  if (sorted.length === 0) {
    listEl.innerHTML = '<p style="text-align: center; color: var(--color-text-muted); padding: var(--space-4);">Nenhum compromisso neste dia.</p>';
  } else {
    listEl.innerHTML = sorted.map((c) => {
      const dv = getDisplayValor(c);
      const sign = c.tipo === 'Receita' ? '+' : '-';
      const colorClass = c.tipo === 'Receita' ? 'dre-positive' : 'dre-negative';
      const valueDisplay = `${sign}${formatCurrency(dv.valor, dv.moeda)}${dv.isVariavel ? ' <span class="valor-variavel-tag">varia</span>' : ''}`;
      return `
        <div class="day-item" data-id="${c.id}">
          <div class="day-item-info">
            <div class="day-item-name">${escapeHtml(displayName(c))}</div>
            <div class="day-item-meta">${tipoPill(c.tipo)} · ${c.periodo}</div>
          </div>
          <div class="day-item-value ${colorClass}">${valueDisplay}</div>
        </div>
      `;
    }).join('');

    // Bind click → details
    listEl.querySelectorAll('.day-item').forEach((item) => {
      item.addEventListener('click', () => {
        const c = cachedCompromissos.find((x) => x.id === item.dataset.id);
        if (c) {
          closeModal('modal-day');
          openDetailsModal(c);
        }
      });
    });
  }

  openModal('modal-day');
}

// -----------------------------
// Save (insert / update)
// -----------------------------
async function saveCatDirectCompromisso() {
  const catId = editingCatId || document.getElementById('comp-cat-existente').value;
  if (!catId) { showToast(t('compromissos.validacao.categoria_obrigatoria', 'Escolha uma categoria'), 'error'); return; }

  const tipo          = document.getElementById('comp-tipo').value;
  const conta_id      = document.getElementById('comp-conta').value || null;
  const tipo_pagamento = document.getElementById('comp-tipo-pagamento').value || null;
  const periodo       = document.getElementById('comp-periodo').value;
  const vencimentoRaw = document.getElementById('comp-vencimento-dia').value;
  const diaSemanaRaw  = document.getElementById('comp-dia-semana').value;
  const intervaloSemanasRawCat = document.getElementById('comp-intervalo-semanas')?.value;
  const valorVariavel = document.getElementById('comp-valor-variavel').checked;
  const valorBaseRaw  = document.getElementById('comp-valor-base').value;
  const moedaFixaVal  = document.getElementById('comp-moeda').value;
  const moedaVarVal   = document.getElementById('comp-moeda-var')?.value || moedaFixaVal;
  const moeda         = valorVariavel ? moedaVarVal : moedaFixaVal;
  const iniciado_em   = document.getElementById('comp-iniciado-em').value || null;
  const terminado_em  = document.getElementById('comp-terminado-em').value || null;
  const descricao     = document.getElementById('comp-descricao').value.trim() || null;
  const status        = document.getElementById('comp-status').value;
  const contato_id    = contatoPicker?.getValue() || null;

  const cat = cachedCategorias.find((c) => c.id === catId);
  const isDividasCat = cat?.grupo === 'dividas' || /dívida|divida/i.test(cat?.nome || '');
  const dividaRaw = isDividasCat ? (document.getElementById('comp-divida')?.value || '') : '';

  if (!tipo) { showToast(t('compromissos.validacao.tipo_obrigatorio', 'Escolha o tipo'), 'error'); return; }
  if (!iniciado_em) { showToast(t('compromissos.validacao.data_inicio', 'Informe a data de início'), 'error'); return; }
  if (isDividasCat && !dividaRaw) { showToast('Vincule uma dívida existente ou crie uma nova', 'error'); return; }
  if (!valorVariavel && (valorBaseRaw === '' || isNaN(Number(valorBaseRaw)) || Number(valorBaseRaw) <= 0)) {
    showToast(t('compromissos.validacao.valor_maior_zero', 'Informe um valor maior que zero'), 'error'); return;
  }

  const usaDiaSemana = periodo === 'Semanal' || periodo === 'Quinzenal';
  const ehUnico = periodo === 'Único';
  const ehAnual = periodo === 'Anual';
  let anualDia = null;
  let anualIso = null;
  if (ehAnual) {
    const a = readAnualDateInput();
    if (!a.dia) { showToast('Escolha a data de vencimento anual', 'error'); return; }
    anualDia = a.dia;
    anualIso = a.iso;
  } else if (usaDiaSemana) {
    if (diaSemanaRaw === '') { showToast('Selecione o dia da semana', 'error'); return; }
  } else if (!ehUnico) {
    if (!vencimentoRaw || vencimentoRaw < 1 || vencimentoRaw > 31) {
      showToast('Dia de vencimento deve ser entre 1 e 31', 'error'); return;
    }
  }

  const intervalo_semanas_cat = (periodo === 'Semanal' && intervaloSemanasRawCat)
    ? Math.max(1, Number(intervaloSemanasRawCat) || 1)
    : 1;

  const payload = {
    tipo,
    conta_id,
    tipo_pagamento,
    periodo,
    vencimento_dia:  ehAnual ? anualDia : ((usaDiaSemana || ehUnico) ? null : Number(vencimentoRaw)),
    dia_semana:      usaDiaSemana ? Number(diaSemanaRaw) : null,
    intervalo_semanas: intervalo_semanas_cat,
    valor_base:      valorVariavel ? 0 : Number(valorBaseRaw),
    valor_variavel:  valorVariavel,
    moeda,
    iniciado_em:     ehAnual ? anualIso : iniciado_em,
    terminado_em,
    descricao,
    status,
    contato_id,
  };

  const button = document.getElementById('btn-salvar-compromisso');
  const originalLabel = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    // Resolve divida_id
    let resolvedDividaId = (isDividasCat && dividaRaw && dividaRaw !== '__new__') ? dividaRaw : null;
    if (isDividasCat && dividaRaw === '__new__') {
      const user = await getCurrentUser();
      const { data: novaDivida, error: divErr } = await supabase.from('dividas').insert({
        user_id:         user.id,
        nome:            cat.nome,
        valor_total:     Number(valorBaseRaw) || 0,
        valor_pago:      0,
        data_inicio:     iniciado_em,
        data_vencimento: terminado_em || null,
        conta_id:        conta_id || null,
        status:          'Ativa',
      }).select('id').single();
      if (divErr) {
        showToast('Categoria salva, mas erro ao criar dívida: ' + divErr.message, 'warning', 8000);
      } else {
        resolvedDividaId = novaDivida.id;
        cachedDividas.push({ id: novaDivida.id, nome: cat.nome, status: 'Ativa' });
      }
    }
    if (resolvedDividaId) payload.divida_id = resolvedDividaId;

    const { data: saved, error } = await supabase
      .from('categorias').update(payload).eq('id', catId).select('valor_base, valor_variavel').single();
    if (error) throw error;

    if (!payload.valor_variavel && Number(saved?.valor_base) !== Number(payload.valor_base)) {
      showToast('Atenção: migrations 0037/0038/0039 não aplicadas no banco — execute-as no Supabase SQL Editor', 'warning', 12000);
      return;
    }

    if (valorVariavel) {
      const items = collectValoresMensais();
      await saveValoresMensaisToOrcamento(null, moeda, items, catId);
    }

    showToast('Compromisso salvo', 'success');
    closeModal('modal-compromisso');
    editingCatId = null;
    await loadCategorias();
    await loadCompromissos();
  } catch (err) {
    console.error('[saveCatDirectCompromisso]', err);
    showToast('Erro ao salvar: ' + (err.message || JSON.stringify(err)), 'error', 12000);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function saveCompromisso(event) {
  event.preventDefault();

  if (document.getElementById('comp-nivel').value === 'categoria') {
    await saveCatDirectCompromisso();
    return;
  }

  const button = document.getElementById('btn-salvar-compromisso');

  const nome           = document.getElementById('comp-nome').value.trim();
  const apelidoRaw     = document.getElementById('comp-apelido').value.trim();
  const apelido        = apelidoRaw || null;
  const tipo           = document.getElementById('comp-tipo').value;
  const categoria_id   = document.getElementById('comp-categoria').value || null;
  const cat            = cachedCategorias.find((c) => c.id === categoria_id);
  const projetoRaw     = document.getElementById('comp-projeto')?.value || '';
  const projeto_id     = (cat?.grupo === 'investimentos' && projetoRaw && projetoRaw !== '__new__') ? projetoRaw : null;
  const isDividasCat   = cat?.grupo === 'dividas' || /dívida|divida/i.test(cat?.nome || '');
  const dividaRaw      = isDividasCat ? (document.getElementById('comp-divida')?.value || '') : '';
  const contato_id     = contatoPicker?.getValue() || null;
  const conta_id          = document.getElementById('comp-conta').value || null;
  const conta_destino_id  = document.getElementById('comp-conta-destino')?.value || null;
  const tipo_pagamento = document.getElementById('comp-tipo-pagamento').value || null;
  const periodo        = document.getElementById('comp-periodo').value;
  const vencimentoRaw  = document.getElementById('comp-vencimento-dia').value;
  const diaSemanaRaw   = document.getElementById('comp-dia-semana').value;
  const intervaloSemanasRaw = document.getElementById('comp-intervalo-semanas')?.value;
  const valorBaseRaw   = document.getElementById('comp-valor-base').value;
  const valorVariavel  = document.getElementById('comp-valor-variavel').checked;
  const ehRendaPrincipal = document.getElementById('comp-renda-principal').checked && tipo === 'Receita';
  const moedaFixa      = document.getElementById('comp-moeda').value;
  const moedaVar       = document.getElementById('comp-moeda-var')?.value || moedaFixa;
  const moeda          = valorVariavel ? moedaVar : moedaFixa;
  const iniciado_em    = document.getElementById('comp-iniciado-em').value || null;
  const terminado_em   = document.getElementById('comp-terminado-em').value || null;
  const descricao      = document.getElementById('comp-descricao').value.trim() || null;
  const status         = document.getElementById('comp-status').value;

  if (!nome) { showToast('Informe o nome do compromisso', 'error'); return; }
  if (!categoria_id) { showToast('Escolha uma categoria', 'error'); return; }
  if (!iniciado_em) { showToast('Informe a data de início', 'error'); return; }
  if (isDividasCat && !dividaRaw) { showToast('Vincule uma dívida existente ou crie uma nova', 'error'); return; }
  if (!valorVariavel && (valorBaseRaw === '' || isNaN(Number(valorBaseRaw)))) {
    showToast(t('compromissos.validacao.valor_invalido', 'Informe um valor válido'), 'error'); return;
  }

  const usaDiaSemana = periodo === 'Semanal' || periodo === 'Quinzenal';
  const ehUnico = periodo === 'Único';
  const ehAnual = periodo === 'Anual';
  let anualDia = null;
  let anualIso = null;
  if (ehAnual) {
    const a = readAnualDateInput();
    if (!a.dia) { showToast('Escolha a data de vencimento anual', 'error'); return; }
    anualDia = a.dia;
    anualIso = a.iso;
  } else if (usaDiaSemana) {
    if (diaSemanaRaw === '') { showToast('Selecione o dia da semana', 'error'); return; }
  } else if (!ehUnico) {
    if (!vencimentoRaw || vencimentoRaw < 1 || vencimentoRaw > 31) {
      showToast('Dia de vencimento deve ser entre 1 e 31', 'error'); return;
    }
  }

  const intervalo_semanas = (periodo === 'Semanal' && intervaloSemanasRaw)
    ? Math.max(1, Number(intervaloSemanasRaw) || 1)
    : 1;

  const payload = {
    nome,
    apelido,
    tipo,
    categoria_id,
    conta_id,
    conta_destino_id: tipo === 'Transferência' ? conta_destino_id : null,
    tipo_pagamento,
    periodo,
    vencimento_dia: ehAnual ? anualDia : ((usaDiaSemana || ehUnico) ? null : Number(vencimentoRaw)),
    dia_semana:     usaDiaSemana ? Number(diaSemanaRaw) : null,
    intervalo_semanas,
    valor_base: valorVariavel ? 0 : Number(valorBaseRaw),
    moeda,
    iniciado_em: ehAnual ? anualIso : iniciado_em,
    terminado_em,
    descricao,
    status,
    valor_variavel: valorVariavel,
    eh_renda_principal: ehRendaPrincipal,
    projeto_id,
    divida_id: null, // preenchido após resolver __new__ abaixo
    contato_id,
  };

  const originalLabel = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    let response;
    let subcategoriaMsg = null; // mensagem do popup informativo (só em criação)
    if (editingId) {
      response = await supabase.from('subcategorias').update(payload).eq('id', editingId).select().single();
    } else {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sessão expirada. Faça login novamente.');

      // Verifica se já existe subcategoria com mesmo nome na mesma categoria
      const nomeNorm = (payload.nome || '').trim().toLowerCase();
      const existing = cachedCompromissos.find(
        (c) => (c.nome || '').trim().toLowerCase() === nomeNorm && c.categoria_id === payload.categoria_id
      );

      if (existing) {
        const isFull = Number(existing.valor_base) > 0 || existing.valor_variavel === true;
        if (!isFull) {
          // Shell criada em configurações → converte em compromisso completo
          response = await supabase.from('subcategorias').update({ ...payload }).eq('id', existing.id).select().single();
          subcategoriaMsg = 'Esta subcategoria já existia em Configurações. O compromisso foi vinculado a ela.';
        } else {
          // Compromisso completo já existe — avisa mas cria mesmo assim
          response = await supabase.from('subcategorias').insert({ ...payload, user_id: user.id }).select().single();
          subcategoriaMsg = 'Já existe um compromisso com esse nome nessa categoria. Um novo foi criado mesmo assim.';
        }
      } else {
        response = await supabase.from('subcategorias').insert({ ...payload, user_id: user.id }).select().single();
        subcategoriaMsg = 'Uma nova subcategoria foi criada junto com este compromisso.';
      }
    }
    if (response.error) throw response.error;

    // Se foi update, loga histórico de mudanças com o motivo
    if (editingId) {
      const oldData = cachedCompromissos.find((c) => c.id === editingId);
      const motivo = document.getElementById('comp-motivo').value.trim() || null;
      if (oldData) await logHistoryEntries(editingId, oldData, response.data, motivo);
    }

    // Pra valor variável: salva os valores mensais preenchidos no orcamento_geral
    if (valorVariavel && response.data?.id) {
      const items = collectValoresMensais();
      await saveValoresMensaisToOrcamento(response.data.id, moeda, items);
    }

    // Resolve divida_id: se "__new__", auto-cria dívida com dados do compromisso
    let resolvedDividaId = (isDividasCat && dividaRaw && dividaRaw !== '__new__') ? dividaRaw : null;
    if (isDividasCat && dividaRaw === '__new__') {
      const user = await getCurrentUser();
      const { data: novaDivida, error: divErr } = await supabase.from('dividas').insert({
        user_id:      user.id,
        nome:         payload.apelido || payload.nome,
        valor_total:  payload.valor_base || 0,
        valor_pago:   0,
        data_inicio:  payload.iniciado_em,
        data_vencimento: payload.terminado_em || null,
        conta_id:     payload.conta_id || null,
        status:       'Ativa',
      }).select('id').single();
      if (divErr) {
        showToast('Compromisso salvo, mas erro ao criar dívida: ' + divErr.message, 'warning', 8000);
      } else {
        resolvedDividaId = novaDivida.id;
        cachedDividas.push({ id: novaDivida.id, nome: payload.apelido || payload.nome, status: 'Ativa' });
      }
    }

    // Atualiza divida_id no registro recém-salvo
    if (resolvedDividaId && response.data?.id) {
      await supabase.from('subcategorias').update({ divida_id: resolvedDividaId }).eq('id', response.data.id);
    }

    showToast(editingId ? 'Compromisso atualizado' : 'Compromisso criado', 'success');
    if (subcategoriaMsg) showInfoPopup('Subcategoria', subcategoriaMsg);

    closeModal('modal-compromisso');
    editingId = null;
    await loadCompromissos();
  } catch (err) {
    console.error('[saveCompromisso]', err);
    let msg = err?.message || err?.hint || err?.details || JSON.stringify(err);
    if (/column.*(dia_semana|categoria_id|tipo)/i.test(msg) || /relation.*subcategorias/i.test(msg)) {
      msg = 'Schema desatualizado — rode a migration 0006_compromissos_rebrand.sql no Supabase.';
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
  const { error } = await supabase.from('subcategorias').update(update).eq('id', id);
  if (error) {
    showToast('Erro: ' + error.message, 'error', 8000);
    return;
  }
  showToast(`Compromisso ${newStatus === 'arquivada' ? 'arquivado' : 'atualizado'}`, 'success');
  await loadCompromissos();
}

async function deleteCompromisso(id) {
  const { error } = await supabase.from('subcategorias').delete().eq('id', id);
  if (error) {
    showToast('Erro ao deletar: ' + error.message, 'error', 8000);
    return;
  }
  showToast('Compromisso deletado permanentemente', 'success');
  await loadCompromissos();
}

// =============================================================
// Encerrar compromisso
// =============================================================
let encerrandoId = null;

function openEncerrarModal(c) {
  encerrandoId = c.id;
  const nome = escapeHtml(displayName(c));
  document.getElementById('encerrar-msg').innerHTML =
    `Encerrar <strong>${nome}</strong>?<br><br>` +
    `Isso vai:<ul style="margin:var(--space-2) 0 0 var(--space-4);line-height:1.8;">` +
    `<li>Definir <em>Termina em</em> = hoje</li>` +
    `<li>Remover todos os pagamentos futuros com status Agendado</li>` +
    `<li>Remover entradas de orçamento dos meses futuros</li>` +
    `</ul>`;

  const extras = document.getElementById('encerrar-extras');
  extras.innerHTML = '';

  if (c.divida_id) {
    const div = getDivida(c.divida_id);
    extras.innerHTML += `
      <label class="checkbox-item" style="margin-bottom:var(--space-2);">
        <input type="checkbox" id="encerrar-divida" checked>
        <span>Marcar dívida <strong>${escapeHtml(div?.nome || '—')}</strong> como encerrada</span>
      </label>`;
  }
  if (c.projeto_id) {
    const proj = getProjeto(c.projeto_id);
    extras.innerHTML += `
      <label class="checkbox-item">
        <input type="checkbox" id="encerrar-projeto" checked>
        <span>Marcar projeto <strong>${escapeHtml(proj?.nome || '—')}</strong> como encerrado</span>
      </label>`;
  }

  openModal('modal-encerrar');
}

async function confirmarEncerrar() {
  if (!encerrandoId) return;
  const c = cachedCompromissos.find((x) => x.id === encerrandoId);
  if (!c) return;

  const encerrarDivida  = document.getElementById('encerrar-divida')?.checked ?? false;
  const encerrarProjeto = document.getElementById('encerrar-projeto')?.checked ?? false;

  closeModal('modal-encerrar');
  closeModal('modal-details');

  const today = todayISO();
  const currentMesAno = today.slice(0, 7) + '-01';

  // 1. Encerra a subcategoria
  const { error: subErr } = await supabase
    .from('subcategorias')
    .update({ terminado_em: today, status: 'inativa' })
    .eq('id', encerrandoId);
  if (subErr) { showToast('Erro ao encerrar: ' + subErr.message, 'error', 8000); return; }

  // 2. Remove pagamentos Agendados futuros
  await supabase
    .from('pagamentos')
    .delete()
    .eq('subcategoria_id', encerrandoId)
    .eq('status', 'Agendado')
    .gte('data_vencimento', today);

  // 3. Remove orcamentos de meses futuros
  await supabase
    .from('orcamento_geral')
    .delete()
    .eq('subcategoria_id', encerrandoId)
    .gt('mes_ano', currentMesAno);

  // 4. Dívida vinculada
  if (encerrarDivida && c.divida_id) {
    await supabase.from('dividas').update({ status: 'Quitada' }).eq('id', c.divida_id);
  }

  // 5. Projeto vinculado
  if (encerrarProjeto && c.projeto_id) {
    await supabase.from('projetos_investimento').update({ status: 'concluido' }).eq('id', c.projeto_id);
  }

  showToast(`${displayName(c)} encerrado`, 'success');
  encerrandoId = null;
  await loadCompromissos();
}

// =============================================================
// Popup informativo de subcategoria (fecha apenas com OK)
// =============================================================
function showInfoPopup(title, message) {
  let dialog = document.getElementById('subcategoria-info-dialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'subcategoria-info-dialog';
    dialog.className = 'modal-backdrop';
    dialog.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-header">
          <h2 class="modal-title" id="info-dialog-title"></h2>
        </div>
        <div class="modal-body">
          <p id="info-dialog-msg" style="color: var(--color-text-secondary);"></p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" id="btn-info-dialog-ok">Entendi</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.querySelector('#btn-info-dialog-ok').addEventListener('click', () => {
      dialog.classList.add('hidden');
    });
  }
  dialog.querySelector('#info-dialog-title').textContent = title;
  dialog.querySelector('#info-dialog-msg').textContent = message;
  dialog.classList.remove('hidden');
}


// Definição dos super-blocos (mesma usada no orçamento, mas duplicada aqui pra
// não criar dependência cruzada entre páginas). Mantém em sync se mudar.
const SUPER_BLOCOS_LIST = [
  { id: 'contribuicao', label: 'Contribuição', grupos: ['receitas', 'dividas'],       accent: 'var(--color-success)' },
  { id: 'sonhos',       label: 'Sonhos',       grupos: ['investimentos'],             accent: 'var(--color-primary)' },
  { id: 'custo_vida',   label: 'Custo de vida', grupos: ['custo_vida'],               accent: 'var(--color-secondary)' },
];

// -----------------------------
// Próximo vencimento — cálculo + render
// -----------------------------
function calcNextDueDate(c, today = new Date()) {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);

  // Já terminou
  if (c.terminado_em) {
    const term = new Date(c.terminado_em + 'T00:00:00');
    if (term < t) return null;
  }

  const start = c.iniciado_em ? new Date(c.iniciado_em + 'T00:00:00') : null;

  if (c.periodo === 'Único') {
    if (!start) return null;
    return start >= t ? start : null;
  }

  if (c.periodo === 'Anual') {
    const dia = c.vencimento_dia;
    if (!dia) return null;
    const refMonth = start ? start.getMonth() : t.getMonth();
    let next = new Date(t.getFullYear(), refMonth, dia);
    if (next < t) next = new Date(t.getFullYear() + 1, refMonth, dia);
    return next;
  }

  if (c.periodo === 'Mensal') {
    const dia = c.vencimento_dia;
    if (!dia) return null;
    let next = new Date(t.getFullYear(), t.getMonth(), dia);
    if (next < t) next = new Date(t.getFullYear(), t.getMonth() + 1, dia);
    return next;
  }

  if (c.periodo === 'Semanal') {
    if (c.dia_semana === null || c.dia_semana === undefined) return null;
    const todayDow = t.getDay();
    const daysUntil = (c.dia_semana - todayDow + 7) % 7;
    const next = new Date(t);
    next.setDate(t.getDate() + daysUntil);
    return next;
  }

  if (c.periodo === 'Quinzenal') {
    if (c.dia_semana === null || c.dia_semana === undefined || !start) return null;
    const todayDow = t.getDay();
    const daysUntil = (c.dia_semana - todayDow + 7) % 7;
    let candidate = new Date(t);
    candidate.setDate(t.getDate() + daysUntil);

    // Verifica se tá em um múltiplo de 14 dias do iniciado_em
    const diff = Math.round((candidate - start) / (24 * 60 * 60 * 1000));
    if (diff >= 0 && diff % 14 !== 0) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate;
  }

  return null;
}

function daysFromToday(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / (24 * 60 * 60 * 1000));
}

function renderNextDueCell(c) {
  const next = calcNextDueDate(c);

  if (!next) {
    return '<span class="text-muted">—</span>';
  }

  const days = daysFromToday(next);
  const dateStr = formatDateBR(next.toISOString().slice(0, 10));

  let badgeStyle;
  let label;

  if (days < 0) {
    badgeStyle = 'background: var(--color-danger-bg); color: #991B1B;';
    label = `${Math.abs(days)} d atrasado`;
  } else if (days === 0) {
    badgeStyle = 'background: #FED7AA; color: #9A3412;';
    label = 'Hoje';
  } else if (days <= 3) {
    badgeStyle = 'background: var(--color-warning-bg); color: #92400E;';
    label = `em ${days} d`;
  } else if (days <= 7) {
    badgeStyle = 'background: var(--color-info-bg); color: #1E40AF;';
    label = `em ${days} d`;
  } else {
    badgeStyle = 'background: var(--color-surface-alt); color: var(--color-text-secondary);';
    label = `em ${days} d`;
  }

  return `
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <span class="tabular" style="font-size: var(--fs-xs);">${dateStr}</span>
      <span style="display: inline-flex; padding: 2px 6px; border-radius: var(--radius-full); font-size: 10px; font-weight: var(--fw-semibold); width: fit-content; ${badgeStyle}">${label}</span>
    </div>
  `;
}

// -----------------------------
// Util
// -----------------------------
function formatDateTimeBR(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}


