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
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { initCurrencyWidget } from '../components/currency-widget.js';
import {
  TIPOS,
  getTipo,
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
import { typeIcon as accountTypeIcon, typeColor as accountTypeColor } from '../lib/account-types.js';

// -----------------------------
// State
// -----------------------------
let cachedCompromissos = [];   // subcategorias do usuário
let cachedCategorias = [];     // categorias parent do usuário
let cachedContas = [];         // bancos/cartões
let cachedProjetos = [];       // projetos de investimento do usuário
let cachedProxValores = new Map(); // subcategoria_id → {valor_previsto, moeda, mes_ano} (próximo mês com valor)
let editingId = null;
let detailsCompromisso = null;
let pendingAction = null;
let filterStatus = 'todas';
let filterCategorias = new Set(['all']);

// Fluxo dívida vinculada
let _dividaFlowComp = null;   // compromisso recém-criado
let _dividaCriada   = null;   // id da dívida criada no fluxo
let viewMode = 'table'; // 'table' | 'dre' | 'calendar'

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
  initCurrencyWidget('currency-widget');

  await loadContas();
  await loadCategorias();      // carrega + seed se vazio
  await loadProjetos();
  renderCategoriaFilters();
  renderTipoSelector();
  renderModalDropdowns();
  bindEvents();
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
// Load contas (pro select opcional)
// -----------------------------
async function loadContas() {
  const { data, error } = await supabase
    .from('contas')
    .select('id, nome, apelido, tipo, icone_cor, status')
    .neq('status', 'arquivada')
    .order('nome');
  if (error) {
    console.error('[loadContas]', error);
    return;
  }
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
  const selConta = document.getElementById('comp-conta');
  selConta.innerHTML = '<option value="">— Sem banco (preencher depois) —</option>' +
    cachedContas.map((c) => {
      const display = c.apelido?.trim() || c.nome;
      return `<option value="${c.id}">${escapeHtml(display)} (${c.tipo})</option>`;
    }).join('');

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
  bindDividaFlow();

  // Botão de gerenciar categorias
  document.getElementById('btn-gerenciar-categorias').addEventListener('click', openCategoriasModal);

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

  // Tipo selector
  document.getElementById('tipo-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('.tipo-btn');
    if (!btn) return;
    document.querySelectorAll('.tipo-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('comp-tipo').value = btn.dataset.tipo;
    toggleRendaPrincipalRow();
  });

  // Período → mostra/esconde dia mês ou dia semana
  document.getElementById('comp-periodo').addEventListener('change', toggleVencimentoFields);

  // Categoria muda → mostra/esconde campo de projeto
  document.getElementById('comp-categoria').addEventListener('change', toggleProjetoField);

  // Select de projeto: "__new__" abre prompt pra criar inline
  document.getElementById('comp-projeto').addEventListener('change', async (e) => {
    if (e.target.value !== '__new__') return;
    e.target.value = ''; // reset enquanto cria
    const nome = window.prompt('Nome do novo projeto de investimento:');
    if (!nome || !nome.trim()) return;
    const novo = await criarProjeto(nome.trim());
    if (novo) {
      renderProjetoOptions();
      e.target.value = novo.id;
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
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  // Details modal buttons
  document.getElementById('btn-editar').addEventListener('click', () => {
    if (!detailsCompromisso) return;
    closeModal('modal-details');
    openCompromissoModal(detailsCompromisso);
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
    } else if (type === 'delete-categoria') {
      await deleteCategoria(id);
    }
    pendingAction = null;
  });

  // Categorias modal: adicionar nova
  document.getElementById('btn-add-categoria').addEventListener('click', addCategoria);

  // Atualizar wrapper de cor do form "nova categoria"
  document.getElementById('cat-nova-cor').addEventListener('input', (e) => {
    const wrapper = document.getElementById('cat-nova-cor-wrapper');
    if (wrapper) wrapper.style.background = e.target.value;
  });
}

function syncCategoriaFilterUI() {
  document.querySelectorAll('#categoria-filters .filter-pill').forEach((p) => {
    p.classList.toggle('active', filterCategorias.has(p.dataset.categoria));
  });
}

// -----------------------------
// Vencimento conditional: dia mês vs dia semana vs único (sem dia)
// -----------------------------
function toggleVencimentoFields() {
  const periodo = document.getElementById('comp-periodo').value;
  const usaDiaSemana = periodo === 'Semanal' || periodo === 'Quinzenal';
  const ehUnico = periodo === 'Único';

  // Dia do mês: oculta quando usa dia da semana OU quando é Único
  document.getElementById('vencimento-dia-field').classList.toggle('hidden', usaDiaSemana || ehUnico);
  // Dia da semana: só visível pra Semanal/Quinzenal
  document.getElementById('dia-semana-field').classList.toggle('hidden', !usaDiaSemana);
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

// Renderiza grid com 12 meses futuros, pré-preenchendo com valores existentes
async function populateValoresMensaisGrid(c) {
  const grid = document.getElementById('valores-mensais-grid');
  const months = nextNMonths(12);

  let existingMap = new Map();
  if (c?.id) {
    const startMesAno = months[0].mesAno;
    const endMesAno = months[months.length - 1].mesAno;
    const { data, error } = await supabase
      .from('orcamento_geral')
      .select('mes_ano, valor_previsto')
      .eq('subcategoria_id', c.id)
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

async function saveValoresMensaisToOrcamento(subcategoriaId, moeda, items) {
  if (items.length === 0) return;
  const user = await getCurrentUser();
  if (!user) return;

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
    console.error('[saveValoresMensaisToOrcamento]', error);
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
  editingId = c?.id || null;

  document.getElementById('modal-compromisso-title').textContent = c ? 'Editar compromisso' : 'Novo compromisso';
  document.getElementById('btn-salvar-compromisso').textContent = c ? 'Salvar alterações' : 'Salvar';

  document.getElementById('form-compromisso').reset();

  // Re-renderiza dropdowns (caso categorias/contas tenham mudado)
  renderModalDropdowns();

  const tipo = c?.tipo || DEFAULT_TIPO;
  const status = c?.status || 'ativa';

  document.getElementById('comp-nome').value = c?.nome || '';
  document.getElementById('comp-apelido').value = c?.apelido || '';
  document.getElementById('comp-tipo').value = tipo;
  document.getElementById('comp-categoria').value = c?.categoria_id || '';
  document.getElementById('comp-projeto').value = c?.projeto_id || '';
  document.getElementById('comp-conta').value = c?.conta_id || '';
  document.getElementById('comp-tipo-pagamento').value = c?.tipo_pagamento || '';
  document.getElementById('comp-periodo').value = c?.periodo || 'Mensal';
  document.getElementById('comp-vencimento-dia').value = c?.vencimento_dia || '';
  document.getElementById('comp-dia-semana').value = c?.dia_semana ?? '';
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

  toggleVencimentoFields();
  toggleValorVariavelFields();
  toggleRendaPrincipalRow();
  toggleProjetoField();
  if (c?.valor_variavel) {
    populateValoresMensaisGrid(c);
  } else {
    document.getElementById('valores-mensais-grid').innerHTML = '';
  }

  openModal('modal-compromisso');
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
    venc = c.dia_semana !== null && c.dia_semana !== undefined
      ? `Toda${c.periodo === 'Quinzenal' ? ' outra' : ''} ${diaSemanaLabel(c.dia_semana)}`
      : '—';
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
      label: 'Projeto',
      value: getProjeto(c.projeto_id)?.nome || '— (projeto removido)'
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

  // Reset histórico (escondido até carregar)
  document.getElementById('details-history').classList.add('hidden');
  document.getElementById('details-history-list').innerHTML = '';

  openModal('modal-details');

  // Carrega histórico em background (não bloqueia abertura do modal)
  loadAndShowHistory(c.id, c.moeda);
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
    showToast('Informe um valor válido', 'error');
    return;
  }

  const novoValor = Number(novoValorRaw);
  if (!detailsCompromisso) return;

  if (novoValor === Number(detailsCompromisso.valor_base)) {
    showToast('O valor não mudou', 'info');
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

    showToast('Valor atualizado', 'success');
    closeModal('modal-quick-valor');
    await loadCompromissos();
  } catch (err) {
    console.error('[saveQuickValor]', err);
    showToast('Erro ao atualizar: ' + (err.message || err), 'error', 8000);
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
  await loadProxValores();
  renderCompromissos();
}

// Carrega o próximo valor (orcamento_geral mais recente >= hoje) pra cada
// compromisso com valor_variavel. Usado pra exibir "próximo valor" na lista.
async function loadProxValores() {
  cachedProxValores.clear();
  const variableIds = cachedCompromissos.filter((c) => c.valor_variavel).map((c) => c.id);
  if (variableIds.length === 0) return;

  const today = new Date();
  const todayMesAno = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('orcamento_geral')
    .select('subcategoria_id, valor_previsto, moeda, mes_ano')
    .in('subcategoria_id', variableIds)
    .gte('mes_ano', todayMesAno)
    .order('mes_ano', { ascending: true });

  if (error) { console.warn('[loadProxValores]', error); return; }

  for (const row of data || []) {
    if (!cachedProxValores.has(row.subcategoria_id)) {
      cachedProxValores.set(row.subcategoria_id, row);
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
function getDisplayValor(c) {
  if (c.valor_variavel) {
    const prox = cachedProxValores.get(c.id);
    if (prox) {
      return { valor: Number(prox.valor_previsto) || 0, moeda: prox.moeda || c.moeda, isVariavel: true, mesAno: prox.mes_ano };
    }
    return { valor: 0, moeda: c.moeda, isVariavel: true, mesAno: null };
  }
  return { valor: Number(c.valor_base) || 0, moeda: c.moeda, isVariavel: false, mesAno: null };
}

function renderCompromissos() {
  const container = document.getElementById('compromissos-container');
  const emptyState = document.getElementById('empty-state');

  // Counters
  const counts = {
    todas:     cachedCompromissos.length,
    ativa:     cachedCompromissos.filter((c) => c.status === 'ativa').length,
    inativa:   cachedCompromissos.filter((c) => c.status === 'inativa').length,
    arquivada: cachedCompromissos.filter((c) => c.status === 'arquivada').length,
  };
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.querySelector(`[data-count-status="${k}"]`);
    if (el) el.textContent = v;
  });

  if (cachedCompromissos.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  // Filtros
  let filtered = cachedCompromissos;
  if (filterStatus !== 'todas') {
    filtered = filtered.filter((c) => c.status === filterStatus);
  }
  if (!filterCategorias.has('all')) {
    filtered = filtered.filter((c) => filterCategorias.has(c.categoria_id));
  }

  if (filtered.length === 0 && viewMode === 'table') {
    container.innerHTML = '<div class="empty-state"><p class="empty-state-message">Nenhum compromisso com os filtros selecionados.</p></div>';
    return;
  }

  if (viewMode === 'calendar') {
    container.innerHTML = renderCalendar(filtered, calendarYear, calendarMonth);
    bindCalendarClicks(filtered);
  } else {
    container.innerHTML = renderGroupedTable(filtered);
    bindRowClicks();
  }
}

// -----------------------------
// Render: Table
// -----------------------------
/**
 * Tabela agrupada por categoria. Cada bloco tem:
 *   - row de cabeçalho com nome da categoria + cor
 *   - rows dos compromissos da categoria (alfabético) com leve tint
 */
function renderGroupedTable(items) {
  // Agrupa por categoria_id
  const byCategoria = new Map();
  cachedCategorias.forEach((cat) => byCategoria.set(cat.id, []));
  const orphans = [];
  items.forEach((c) => {
    if (byCategoria.has(c.categoria_id)) {
      byCategoria.get(c.categoria_id).push(c);
    } else {
      orphans.push(c);
    }
  });

  // Sort each group por dia de vencimento
  for (const arr of byCategoria.values()) {
    arr.sort(compareByVencimento);
  }
  orphans.sort(compareByVencimento);

  // Render: monta tbody com seções por categoria (somente as não-vazias)
  const sections = [];
  for (const cat of cachedCategorias) {
    const arr = byCategoria.get(cat.id) || [];
    if (arr.length === 0) continue;
    sections.push(renderCategoriaSection(cat, arr));
  }
  if (orphans.length > 0) {
    sections.push(renderCategoriaSection(
      { id: null, nome: 'Sem categoria', cor: '#9CA3AF' },
      orphans
    ));
  }

  return `
    <div class="contas-table-wrapper">
      <table class="contas-table compromissos-grouped-table">
        <thead>
          <tr>
            <th>Compromisso</th>
            <th>Tipo</th>
            <th>Projeto</th>
            <th>Banco/Cartão</th>
            <th>Pagamento</th>
            <th>Vencimento</th>
            <th>Próximo</th>
            <th>Termina em</th>
            <th>Período</th>
            <th class="text-right">Valor</th>
            <th>Descrição</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${sections.join('')}</tbody>
      </table>
    </div>
  `;
}

function renderCategoriaSection(cat, items) {
  const rows = items.map((c) => renderRow(c, cat)).join('');
  return `
    <tr class="categoria-section-header" style="--cat-color: ${cat.cor};">
      <td colspan="12">
        <span class="cat-dot" style="background: ${cat.cor};"></span>
        ${escapeHtml(cat.nome)}
        <span class="cat-count">${items.length} ${items.length === 1 ? 'item' : 'itens'}</span>
      </td>
    </tr>
    ${rows}
  `;
}

function renderRow(c, categoria) {
  const isInactive = c.status !== 'ativa';
  const display = displayName(c);
  const officialDifferent = c.apelido && c.apelido.trim() && c.apelido !== c.nome;
  const conta = getConta(c.conta_id);
  const statusLabel = { ativa: 'Ativa', inativa: 'Inativa', arquivada: 'Arquivada' }[c.status];
  const catColor = categoria?.cor || '#9CA3AF';

  // Vencimento
  let venc = '—';
  if (c.periodo === 'Semanal' || c.periodo === 'Quinzenal') {
    venc = c.dia_semana !== null && c.dia_semana !== undefined
      ? diaSemanaLabel(c.dia_semana)
      : '—';
  } else if (c.vencimento_dia) {
    venc = `Dia ${c.vencimento_dia}`;
  }

  const projeto = c.projeto_id ? getProjeto(c.projeto_id) : null;
  const projetoCell = projeto
    ? `<span class="projeto-badge" style="--projeto-cor: ${projeto.cor};" title="Projeto de investimento: ${escapeHtml(projeto.nome)}">${escapeHtml(projeto.nome)}</span>`
    : '<span class="text-muted">—</span>';

  return `
    <tr class="compromisso-row ${isInactive ? 'inactive' : ''} ${c.status === 'arquivada' ? 'arquivada' : ''}" style="--cat-color: ${catColor};" data-id="${c.id}">
      <td>
        <div class="conta-row-name">
          ${renderTipoIcon(c.tipo, 'sm')}
          <div class="conta-row-name-text">
            <span class="conta-row-name-display">${escapeHtml(display)}</span>
            ${officialDifferent ? `<span class="conta-row-name-official">${escapeHtml(c.nome)}</span>` : ''}
          </div>
        </div>
      </td>
      <td>${tipoPill(c.tipo)}</td>
      <td>${projetoCell}</td>
      <td>${conta ? renderContaInline(conta) : '<span class="text-muted">—</span>'}</td>
      <td>${c.tipo_pagamento || '<span class="text-muted">—</span>'}</td>
      <td class="tabular">${venc}</td>
      <td>${renderNextDueCell(c)}</td>
      <td class="tabular">${renderTerminaEmCell(c)}</td>
      <td>${c.periodo}</td>
      <td class="text-right tabular text-bold">${renderValorCell(c)}</td>
      <td>${renderDescricaoCell(c)}</td>
      <td><span class="status-pill status-${c.status}">${statusLabel}</span></td>
    </tr>
  `;
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
function renderValorCell(c) {
  const dv = getDisplayValor(c);
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
  const initialsValue = initials(display);

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

function bindRowClicks() {
  document.querySelectorAll('.contas-table tbody tr').forEach((row) => {
    row.addEventListener('click', () => {
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

function bindDreClicks() {
  document.querySelectorAll('.dre-item').forEach((item) => {
    item.addEventListener('click', () => {
      const c = cachedCompromissos.find((x) => x.id === item.dataset.id);
      if (c) openDetailsModal(c);
    });
  });
}

// -----------------------------
// Render: Calendar view
// -----------------------------
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_LABELS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Popover (hover) com detalhes dos compromissos do dia no calendário
function renderCalendarPopover(events, day, month, year) {
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
    return c.dia_semana === target.getDay();
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
async function saveCompromisso(event) {
  event.preventDefault();
  const button = document.getElementById('btn-salvar-compromisso');

  const nome           = document.getElementById('comp-nome').value.trim();
  const apelidoRaw     = document.getElementById('comp-apelido').value.trim();
  const apelido        = apelidoRaw || null;
  const tipo           = document.getElementById('comp-tipo').value;
  const categoria_id   = document.getElementById('comp-categoria').value || null;
  const cat            = cachedCategorias.find((c) => c.id === categoria_id);
  const projetoRaw     = document.getElementById('comp-projeto')?.value || '';
  const projeto_id     = (cat?.grupo === 'investimentos' && projetoRaw && projetoRaw !== '__new__') ? projetoRaw : null;
  const conta_id       = document.getElementById('comp-conta').value || null;
  const tipo_pagamento = document.getElementById('comp-tipo-pagamento').value || null;
  const periodo        = document.getElementById('comp-periodo').value;
  const vencimentoRaw  = document.getElementById('comp-vencimento-dia').value;
  const diaSemanaRaw   = document.getElementById('comp-dia-semana').value;
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
  if (!valorVariavel && (valorBaseRaw === '' || isNaN(Number(valorBaseRaw)))) {
    showToast('Informe um valor válido', 'error'); return;
  }

  const usaDiaSemana = periodo === 'Semanal' || periodo === 'Quinzenal';
  const ehUnico = periodo === 'Único';
  if (usaDiaSemana) {
    if (diaSemanaRaw === '') { showToast('Selecione o dia da semana', 'error'); return; }
  } else if (!ehUnico) {
    if (!vencimentoRaw || vencimentoRaw < 1 || vencimentoRaw > 31) {
      showToast('Dia de vencimento deve ser entre 1 e 31', 'error'); return;
    }
  }

  const payload = {
    nome,
    apelido,
    tipo,
    categoria_id,
    conta_id,
    tipo_pagamento,
    periodo,
    vencimento_dia: (usaDiaSemana || ehUnico) ? null : Number(vencimentoRaw),
    dia_semana:     usaDiaSemana ? Number(diaSemanaRaw) : null,
    valor_base: valorVariavel ? 0 : Number(valorBaseRaw),
    moeda,
    iniciado_em,
    terminado_em,
    descricao,
    status,
    valor_variavel: valorVariavel,
    eh_renda_principal: ehRendaPrincipal,
    projeto_id,
  };

  const originalLabel = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    let response;
    if (editingId) {
      response = await supabase.from('subcategorias').update(payload).eq('id', editingId).select().single();
    } else {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sessão expirada. Faça login novamente.');
      response = await supabase.from('subcategorias').insert({ ...payload, user_id: user.id }).select().single();
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

    showToast(editingId ? 'Compromisso atualizado' : 'Compromisso criado', 'success');

    // Fluxo dívida: só para novos compromissos do grupo 'dividas'
    const foiInsert = !editingId;
    const novaData  = response.data;

    closeModal('modal-compromisso');
    editingId = null;
    await loadCompromissos();

    if (foiInsert && cat?.grupo === 'dividas' && novaData) {
      _dividaFlowComp = { ...novaData, cat };
      openSugestaoDivida();
    }
  } catch (err) {
    console.error('[saveCompromisso]', err);
    let msg = err?.message || err?.hint || err?.details || JSON.stringify(err);
    if (/column.*(dia_semana|categoria_id|tipo)/i.test(msg) || /relation.*subcategorias/i.test(msg)) {
      msg = 'Schema desatualizado — rode a migration 0006_compromissos_rebrand.sql no Supabase.';
    }
    showToast('Erro ao salvar: ' + msg, 'error', 12000);
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
// Gerenciar Categorias (modal)
// =============================================================
function openCategoriasModal() {
  renderCategoriasList();
  openModal('modal-categorias');
}

const CATEGORIA_GRUPOS = [
  { value: 'receitas',      label: 'Receitas (Contribuição)' },
  { value: 'dividas',       label: 'Dívidas (Contribuição)' },
  { value: 'investimentos', label: 'Investimentos (Sonhos)' },
  { value: 'custo_vida',    label: 'Custo de vida' },
];

function renderGrupoSelect(catId, currentGrupo) {
  const cur = currentGrupo || 'custo_vida';
  const options = CATEGORIA_GRUPOS.map((g) =>
    `<option value="${g.value}" ${cur === g.value ? 'selected' : ''}>${g.label}</option>`
  ).join('');
  return `<select class="select" data-cat-grupo="${catId}" style="font-size: var(--fs-xs); padding: 4px 8px; max-width: 200px;">${options}</select>`;
}

// Definição dos super-blocos (mesma usada no orçamento, mas duplicada aqui pra
// não criar dependência cruzada entre páginas). Mantém em sync se mudar.
const SUPER_BLOCOS_LIST = [
  { id: 'contribuicao', label: 'Contribuição', grupos: ['receitas', 'dividas'],       accent: 'var(--color-success)' },
  { id: 'sonhos',       label: 'Sonhos',       grupos: ['investimentos'],             accent: 'var(--color-primary)' },
  { id: 'custo_vida',   label: 'Custo de vida', grupos: ['custo_vida'],               accent: 'var(--color-secondary)' },
];

function renderCategoriaRow(cat) {
  const usedBy = cachedCompromissos.filter((c) => c.categoria_id === cat.id).length;
  const usageLabel = `${usedBy} compromisso${usedBy === 1 ? '' : 's'}`;
  const grupoSelect = renderGrupoSelect(cat.id, cat.grupo);

  if (cat.is_default) {
    return `
      <div class="categoria-row" data-id="${cat.id}" style="display:flex; align-items:center; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); margin-bottom: var(--space-2); background: var(--color-surface-alt);">
        <span style="display:inline-block; width: 28px; height: 28px; border-radius: 50%; background: ${cat.cor}; flex-shrink: 0; border: 2px solid var(--color-surface); box-shadow: 0 0 0 1px var(--color-border);"></span>
        <span style="flex: 1; font-weight: var(--fw-semibold); color: var(--color-text-main); padding: var(--space-2) 0;">${escapeHtml(cat.nome)}</span>
        ${grupoSelect}
        <span style="font-size: var(--fs-xs); color: var(--color-text-muted); white-space: nowrap;">${usageLabel}</span>
        <span class="badge badge-neutral" style="font-size:10px;">default</span>
        <button class="btn btn-primary btn-sm" data-cat-save="${cat.id}" type="button" disabled style="flex-shrink: 0;">Salvar</button>
      </div>
    `;
  }

  return `
    <div class="categoria-row" data-id="${cat.id}" style="display:flex; align-items:center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); margin-bottom: var(--space-2);">
      <div data-cat-color-wrapper="${cat.id}" style="width: 28px; height: 28px; border-radius: 50%; background: ${cat.cor}; cursor: pointer; flex-shrink: 0; border: 2px solid var(--color-surface); box-shadow: 0 0 0 1px var(--color-border); position: relative; overflow: hidden;" title="Mudar cor">
        <input type="color" data-cat-color="${cat.id}" value="${cat.cor}" style="position: absolute; inset: -10px; width: calc(100% + 20px); height: calc(100% + 20px); opacity: 0; cursor: pointer; border: none;">
      </div>
      <input type="text" class="input" data-cat-nome="${cat.id}" value="${escapeHtml(cat.nome)}" maxlength="50" style="flex: 1; padding: var(--space-2) var(--space-3); font-size: var(--fs-sm);">
      ${grupoSelect}
      <span style="font-size: var(--fs-xs); color: var(--color-text-muted); white-space: nowrap;">${usageLabel}</span>
      <button class="btn btn-primary btn-sm" data-cat-save="${cat.id}" type="button" disabled style="flex-shrink: 0;">Salvar</button>
      <button class="btn-icon danger" data-cat-delete="${cat.id}" type="button" title="Excluir">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
  `;
}

function renderCategoriasList() {
  const list = document.getElementById('categorias-list');
  if (cachedCategorias.length === 0) {
    list.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: var(--space-4);">Nenhuma categoria ainda.</p>';
    return;
  }

  // Agrupa por super-bloco
  const sectionsHtml = SUPER_BLOCOS_LIST.map((bloco) => {
    const cats = cachedCategorias.filter((c) => bloco.grupos.includes(c.grupo || 'custo_vida'));
    if (cats.length === 0) return '';
    const rowsHtml = cats.map(renderCategoriaRow).join('');
    return `
      <div class="categorias-bloco-section" style="--bloco-accent: ${bloco.accent};">
        <h3 class="categorias-bloco-title">${escapeHtml(bloco.label)}</h3>
        ${rowsHtml}
      </div>
    `;
  }).join('');

  list.innerHTML = sectionsHtml;
  bindCategoriaRowEvents();
}

function bindCategoriaRowEvents() {
  const list = document.getElementById('categorias-list');

  // Detectar mudanças → habilitar botão Salvar (lida com defaults: sem nome/cor inputs)
  const updateSaveButton = (id) => {
    const cat = cachedCategorias.find((c) => c.id === id);
    if (!cat) return;
    const nomeInput  = list.querySelector(`[data-cat-nome="${id}"]`);
    const corInput   = list.querySelector(`[data-cat-color="${id}"]`);
    const grupoInput = list.querySelector(`[data-cat-grupo="${id}"]`);
    const saveBtn    = list.querySelector(`[data-cat-save="${id}"]`);
    if (!saveBtn) return;

    const newNome  = nomeInput ? nomeInput.value.trim() : cat.nome;
    const newCor   = corInput ? corInput.value.toLowerCase() : (cat.cor || '').toLowerCase();
    const newGrupo = grupoInput ? grupoInput.value : (cat.grupo || 'custo_vida');
    const oldCor   = (cat.cor || '').toLowerCase();
    const oldGrupo = cat.grupo || 'custo_vida';
    const changed = (newNome !== cat.nome) || (newCor !== oldCor) || (newGrupo !== oldGrupo);
    saveBtn.disabled = !changed || !newNome;
  };

  list.querySelectorAll('[data-cat-nome]').forEach((input) => {
    input.addEventListener('input', () => updateSaveButton(input.dataset.catNome));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const saveBtn = list.querySelector(`[data-cat-save="${input.dataset.catNome}"]`);
        if (saveBtn && !saveBtn.disabled) saveBtn.click();
      }
    });
  });
  list.querySelectorAll('[data-cat-color]').forEach((input) => {
    const handler = () => {
      const id = input.dataset.catColor;
      const wrapper = list.querySelector(`[data-cat-color-wrapper="${id}"]`);
      if (wrapper) wrapper.style.background = input.value;
      updateSaveButton(id);
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  });
  list.querySelectorAll('[data-cat-grupo]').forEach((sel) => {
    sel.addEventListener('change', () => updateSaveButton(sel.dataset.catGrupo));
  });

  // Salvar
  list.querySelectorAll('[data-cat-save]').forEach((btn) => {
    btn.addEventListener('click', () => updateCategoria(btn.dataset.catSave));
  });

  // Excluir
  list.querySelectorAll('[data-cat-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.catDelete;
      const cat = cachedCategorias.find((c) => c.id === id);
      const usedBy = cachedCompromissos.filter((c) => c.categoria_id === id).length;
      if (usedBy > 0) {
        showToast(`Não é possível excluir: ${usedBy} compromisso${usedBy === 1 ? ' usa' : 's usam'} essa categoria.`, 'error', 8000);
        return;
      }
      pendingAction = { type: 'delete-categoria', id };
      showConfirm(
        'Excluir categoria?',
        `Excluir <strong>${escapeHtml(cat.nome)}</strong>? Esta ação não pode ser desfeita.`,
        'Excluir'
      );
    });
  });
}

async function updateCategoria(id) {
  const list = document.getElementById('categorias-list');
  const nomeInput  = list.querySelector(`[data-cat-nome="${id}"]`);
  const corInput   = list.querySelector(`[data-cat-color="${id}"]`);
  const grupoInput = list.querySelector(`[data-cat-grupo="${id}"]`);
  const saveBtn    = list.querySelector(`[data-cat-save="${id}"]`);
  const cat = cachedCategorias.find((c) => c.id === id);
  if (!cat || !saveBtn) return;

  // Defaults não têm nome/cor inputs — preserva valores atuais
  const novoNome  = nomeInput  ? nomeInput.value.trim()  : cat.nome;
  const novaCor   = corInput   ? corInput.value          : cat.cor;
  const novoGrupo = grupoInput ? grupoInput.value        : (cat.grupo || 'custo_vida');

  if (!novoNome) {
    showToast('Nome da categoria não pode ficar vazio', 'error');
    return;
  }

  const labelOriginal = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner"></span>';

  const { error } = await supabase
    .from('categorias')
    .update({ nome: novoNome, cor: novaCor, grupo: novoGrupo })
    .eq('id', id);

  if (error) {
    console.error('[updateCategoria]', error);
    showToast('Erro ao atualizar: ' + error.message, 'error', 8000);
    saveBtn.disabled = false;
    saveBtn.textContent = labelOriginal;
    return;
  }

  showToast('Categoria atualizada', 'success');
  await loadCategorias();
  renderCategoriaFilters();
  renderCategoriasList();
  renderCompromissos(); // atualiza badges na tabela principal
}

async function addCategoria() {
  const nome = document.getElementById('cat-nova-nome').value.trim();
  const cor = document.getElementById('cat-nova-cor').value;
  if (!nome) {
    showToast('Informe o nome da categoria', 'error');
    return;
  }
  const user = await getCurrentUser();
  if (!user) return;

  const ordem = cachedCategorias.length;
  const { error } = await supabase.from('categorias').insert({
    user_id: user.id,
    nome,
    cor,
    ordem,
    is_default: false,
  });
  if (error) {
    showToast('Erro ao criar categoria: ' + error.message, 'error', 8000);
    return;
  }
  showToast('Categoria criada', 'success');
  document.getElementById('cat-nova-nome').value = '';
  await loadCategorias();
  renderCategoriaFilters();
  renderCategoriasList();
}

async function deleteCategoria(id) {
  const { error } = await supabase.from('categorias').delete().eq('id', id);
  if (error) {
    showToast('Erro ao excluir categoria: ' + error.message, 'error', 8000);
    return;
  }
  showToast('Categoria excluída', 'success');
  await loadCategorias();
  renderCategoriaFilters();
  renderCategoriasList();
}

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

  let badgeStyle = '';
  let label = '';

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
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

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

function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
  );
}

// =============================================================
// Fluxo: dívida vinculada ao compromisso
// =============================================================

function bindDividaFlow() {
  // Passo 1 — sugestão
  document.getElementById('btn-sugestao-nao').addEventListener('click', () => {
    closeModal('modal-divida-sugestao');
    _dividaFlowComp = null;
  });
  document.getElementById('btn-sugestao-sim').addEventListener('click', () => {
    closeModal('modal-divida-sugestao');
    openDividaNova();
  });
  document.querySelector('[data-close-modal="modal-divida-sugestao"]')
    ?.addEventListener('click', () => { _dividaFlowComp = null; });

  // Passo 2 — formulário da dívida
  document.getElementById('form-divida-nova').addEventListener('submit', saveDividaNova);
  document.querySelector('[data-close-modal="modal-divida-nova"]')
    ?.addEventListener('click', () => { _dividaFlowComp = null; });

  // Passo 3 — histórico
  document.getElementById('btn-historico-depois').addEventListener('click', () => {
    closeModal('modal-divida-historico');
    _dividaCriada = null;
    showToast('Dívida criada. Você pode atualizar o histórico na página Dívidas.', 'success', 5000);
  });
  document.getElementById('btn-historico-fechar').addEventListener('click', () => {
    closeModal('modal-divida-historico');
    _dividaCriada = null;
    showToast('Dívida criada. Você pode atualizar o histórico na página Dívidas.', 'success', 5000);
  });
  document.getElementById('btn-historico-salvar').addEventListener('click', salvarHistoricoDivida);
}

// Passo 1 — abre sugestão
function openSugestaoDivida() {
  const nome = _dividaFlowComp?.nome || _dividaFlowComp?.apelido || '';
  document.getElementById('sugestao-nome-comp').textContent = `"${nome}"`;
  openModal('modal-divida-sugestao');
}

// Passo 2 — abre form da nova dívida
function openDividaNova() {
  const comp = _dividaFlowComp;
  document.getElementById('dn-nome').value           = comp?.apelido || comp?.nome || '';
  document.getElementById('dn-credor').value         = '';
  document.getElementById('dn-valor-total').value    = comp?.valor_base > 0 ? comp.valor_base : '';
  document.getElementById('dn-juros').value          = '';
  document.getElementById('dn-data-inicio').value    = comp?.iniciado_em || new Date().toISOString().slice(0, 10);
  document.getElementById('dn-data-vencimento').value = comp?.terminado_em || '';
  document.getElementById('dn-valor-pago').value     = '';
  openModal('modal-divida-nova');
}

// Passo 2 — salva a dívida
async function saveDividaNova(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-salvar-divida-nova');

  const nome            = document.getElementById('dn-nome').value.trim();
  const credor          = document.getElementById('dn-credor').value.trim() || null;
  const valor_total     = parseFloat(document.getElementById('dn-valor-total').value);
  const jurosRaw        = document.getElementById('dn-juros').value;
  const juros_percentual = jurosRaw ? parseFloat(jurosRaw) : null;
  const data_inicio     = document.getElementById('dn-data-inicio').value;
  const data_vencimento = document.getElementById('dn-data-vencimento').value || null;

  if (!nome)                                        { showToast('Informe o nome da dívida', 'error'); return; }
  if (!valor_total || isNaN(valor_total) || valor_total <= 0) { showToast('Informe um valor total válido', 'error'); return; }
  if (!data_inicio)                                  { showToast('Informe a data de início', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Salvando…';

  const user = await getCurrentUser();
  const { data, error } = await supabase.from('dividas').insert({
    user_id: user.id,
    nome,
    credor,
    valor_total,
    valor_pago: 0,
    juros_percentual,
    data_inicio,
    data_vencimento,
    status: 'Ativa',
    conta_id: _dividaFlowComp?.conta_id || null,
  }).select().single();

  btn.disabled = false;
  btn.textContent = 'Salvar dívida';

  if (error) { showToast('Erro ao criar dívida: ' + error.message, 'error', 8000); return; }

  _dividaCriada = data.id;
  closeModal('modal-divida-nova');
  openDividaHistorico();
}

// Passo 3 — abre modal de histórico
function openDividaHistorico() {
  document.getElementById('dn-valor-pago').value = '';
  openModal('modal-divida-historico');
}

// Passo 3 — salva valor_pago inicial
async function salvarHistoricoDivida() {
  const valorRaw = document.getElementById('dn-valor-pago').value;
  const valor    = parseFloat(valorRaw);

  if (!valorRaw || isNaN(valor) || valor < 0) {
    showToast('Informe um valor válido (ou clique em "Deixar para depois")', 'error');
    return;
  }

  const btn = document.getElementById('btn-historico-salvar');
  btn.disabled = true;
  btn.textContent = 'Salvando…';

  const { error } = await supabase
    .from('dividas')
    .update({ valor_pago: valor })
    .eq('id', _dividaCriada);

  btn.disabled = false;
  btn.textContent = 'Atualizar';

  if (error) { showToast('Erro ao atualizar histórico: ' + error.message, 'error', 8000); return; }

  closeModal('modal-divida-historico');
  _dividaCriada   = null;
  _dividaFlowComp = null;
  showToast('Dívida criada e histórico atualizado!', 'success');
}
