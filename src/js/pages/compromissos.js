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
  TIPOS, tipoIcon, tipoColor, tipoPill,
  PERIODOS, DIAS_SEMANA, diaSemanaLabel,
  TIPOS_PAGAMENTO, CATEGORIAS_DEFAULT,
} from '../lib/compromissos-config.js';
import {
  formatCurrency, formatCurrencyHTML, renderMoedaOptions, moedaInputPlaceholder,
} from '../lib/moedas.js';
import { initColVisibility } from '../lib/col-visibility.js';
import { escapeHtml, formatDateBR, todayISO, getInitials } from '../lib/utils.js';
import { autoAttachDecimalInputs } from '../lib/number-format.js';
import { findBank, logoUrl } from '../lib/banks.js';
import { createContaPicker } from '../lib/conta-picker.js';
import { fetchExchangeRate, toBRL } from '../lib/currency.js';
import { initContatoPicker } from '../components/contato-picker.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';
import {
  occursOn,
  renderCalendar,
  bindCalendarClicks,
  openDayModal,
} from './compromissos/calendar.js';
import { renderDre } from './compromissos/dre.js';
import { populateValoresMensaisGrid } from './compromissos/valores-mensais.js';
import {
  renderGroupedBySuperBloco,
  bindRowClicks,
  monthLabelFromIso,
} from './compromissos/table.js';
import { bindAllEvents } from './compromissos/event-binders.js';
import * as saveModule from './compromissos/save.js';

// -----------------------------
// State
// -----------------------------
let cachedCompromissos = [];   // subcategorias do usuário
let cachedCategorias = [];     // categorias parent do usuário
let cachedContas = [];         // bancos/cartões
let compContaPicker = null;
let compContaDestinoPicker = null;
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
  const _params     = new URLSearchParams(location.search);
  const _isEmbedded = _params.get('embedded') === '1';
  const _isPreload  = _params.get('preload')  === '1';  // pré-aquecimento em background

  await guardSession();
  if (_isEmbedded) {
    document.body.classList.add('comp-embedded');
  } else {
    await initSidebar('orcamento');
    initTutorial('compromissos');
    // Tab strip "Orçamento" — Compromissos é o tab ativo nesta página
    const { mountOrcamentoTabs } = await import('../components/orcamento-tabs.js');
    mountOrcamentoTabs('orc-tabs', 'configuracoes');

    // Toggle do painel explicativo "Como esses valores são calculados?"
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-info-toggle]')) {
        document.getElementById('orc-budget-info-panel')?.classList.toggle('hidden');
      } else if (e.target.closest('[data-info-close]')) {
        document.getElementById('orc-budget-info-panel')?.classList.add('hidden');
      }
    });
  }
  await loadStrings();
  applyTranslationsToDom();
  if (!_isEmbedded) initCurrencyWidget('currency-widget');

  // Carrega todos os lookups em paralelo — reduz de ~3s sequencial para ~600ms
  await Promise.all([loadContas(), loadCategorias(), loadProjetos(), loadDividas(), loadContatos()]);
  if (!_isEmbedded) renderCategoriaFilters();
  if (!_isEmbedded) renderTipoSelector();
  renderModalDropdowns();
  bindAllEvents({
    // state setters
    setFilterSearch:    (v) => { filterSearch    = v; },
    setViewMode:        (v) => { viewMode        = v; },
    setFilterStatus:    (v) => { filterStatus    = v; },
    setFilterConfig:    (v) => { filterConfig    = v; },
    setFilterCategorias:(v) => { filterCategorias = v; },
    setEditingCatId:    (v) => { editingCatId    = v; },
    setPendingAction:   (v) => { pendingAction   = v; },
    // state getters
    getFilterCategorias:    () => filterCategorias,
    getEditingId:           () => editingId,
    getDetailsCompromisso:  () => detailsCompromisso,
    getPendingAction:       () => pendingAction,
    getCachedCompromissos:  () => cachedCompromissos,
    // modal openers
    openCompromissoModal,
    openValorUpdateModal,
    openEncerrarModal,
    // save / status
    saveCompromisso,
    saveQuickValor,
    changeStatus,
    deleteCompromisso,
    confirmarEncerrar,
    // toggles / lookups
    setNivelMode,
    toggleDividaField,
    toggleProjetoField,
    toggleVinculoBanner,
    toggleVinculoInvestimentoField,
    toggleVencimentoFields,
    toggleValorVariavelFields,
    toggleRendaPrincipalRow,
    toggleTransferFields,
    updateLimiteInfo,
    getConta,
    getProjeto,
    getDivida,
    displayName,
    populateValoresMensaisGrid,
    criarProjeto,
    renderProjetoOptions,
    syncCategoriaFilterUI,
    renderCompromissos,
    showConfirm,
  });
  autoAttachDecimalInputs();

  if (!_isEmbedded) {
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
      // v0.5.4 renomeou .toolbar para .orc-filter-bar
      toolbarEl: document.querySelector('.orc-filter-bar') || document.querySelector('.toolbar'),
    });
  }

  // ── Modo pré-aquecimento ────────────────────────────────────────
  // Dropdowns e eventos já prontos — sinaliza parent AGORA, antes de
  // loadCompromissos (que é lenta). loadCompromissos roda em background
  // para estar disponível se o usuário abrir um compromisso existente.
  if (_isPreload) {
    document.documentElement.style.visibility = '';
    window.parent.postMessage({ source: 'finflow-embedded', type: 'comp-preloaded' }, location.origin);

    // Escuta comandos de abertura do parent
    window.addEventListener('message', (ev) => {
      if (ev.origin !== location.origin) return;
      if (ev.data?.source !== 'finflow-host' || ev.data?.type !== 'open-modal') return;
      const d = ev.data;
      if (d.cfg_sub) {
        const sub = cachedCompromissos.find((s) => s.id === d.cfg_sub);
        openCompromissoModal(sub || { id: d.cfg_sub });
      } else if (d.cfg_cat) {
        openCompromissoModal({ nome: decodeURIComponent(d.cfg_nome || ''), tipo: d.cfg_tipo || DEFAULT_TIPO, categoria_id: d.cfg_cat });
      } else {
        openCompromissoModal(null);
      }
    });

    // Observa fechamento do modal para avisar o parent
    const _modal = document.getElementById('modal-compromisso');
    new window.MutationObserver(() => {
      if (_modal.classList.contains('hidden')) {
        const saved = window._embeddedCompSaved || false;
        window._embeddedCompSaved = false;
        window.parent.postMessage({ source: 'finflow-embedded', type: saved ? 'comp-saved' : 'comp-closed' }, location.origin);
      }
    }).observe(_modal, { attributes: true, attributeFilter: ['class'] });

    loadCompromissos(); // background — sem await
    return;
  }

  // ── Fluxo normal (não-preload) ──────────────────────────────────
  await loadCompromissos();

  // Auto-open from configuracoes.html via URL params
  // ?cfg_sub=UUID   → edit that sub in the modal
  // ?cfg_cat=UUID&cfg_tipo=Receita&cfg_nome=NAME → create new in that category
  const _p = new URLSearchParams(location.search);
  const _cfgSubId = _p.get('cfg_sub');
  const _cfgCatId = _p.get('cfg_cat');
  if (_cfgSubId || _cfgCatId) {
    // Limpa os params cfg_* mas preserva embedded=1 para que openCompromissoModal
    // ainda consiga detectar o modo embedded e enviar o postMessage comp-ready.
    history.replaceState({}, '', _isEmbedded ? location.pathname + '?embedded=1' : location.pathname);
    if (_cfgSubId) {
      const sub = cachedCompromissos.find((s) => s.id === _cfgSubId);
      if (sub) openCompromissoModal(sub);
      else openCompromissoModal({ id: _cfgSubId });
    } else {
      openCompromissoModal({
        nome:         decodeURIComponent(_p.get('cfg_nome') || ''),
        tipo:         _p.get('cfg_tipo') || DEFAULT_TIPO,
        categoria_id: _cfgCatId,
      });
    }
  } else if (_isEmbedded) {
    openCompromissoModal(null);
  }

  // In embedded mode, watch for modal close and postMessage parent
  if (_isEmbedded) {
    const modal = document.getElementById('modal-compromisso');
    const mo = new window.MutationObserver(() => {
      if (modal.classList.contains('hidden')) {
        const saved = window._embeddedCompSaved || false;
        window._embeddedCompSaved = false;
        window.parent.postMessage({ source: 'finflow-embedded', type: saved ? 'comp-saved' : 'comp-closed' }, location.origin);
      }
    });
    mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
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
    showToast(t('compromissos.toast.erro_criar_projeto', 'Erro ao criar projeto') + ': ' + error.message, 'error', 8000);
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

function toggleVinculoInvestimentoField(preselectedId = null) {
  const catId = document.getElementById('comp-categoria').value;
  const cat = cachedCategorias.find((c) => c.id === catId);
  const isCustoVida = cat?.grupo === 'custo_vida';
  const field = document.getElementById('vinculo-investimento-field');
  if (!field) return;
  field.classList.toggle('hidden', !isCustoVida);
  const sel = document.getElementById('comp-vinculo-investimento');
  if (!sel) return;
  if (!isCustoVida) { sel.value = ''; return; }
  const opts = ['<option value="">— Não vincular —</option>'];
  for (const p of cachedProjetos) {
    opts.push(`<option value="${p.id}">${escapeHtml(p.nome)}</option>`);
  }
  sel.innerHTML = opts.join('');
  sel.value = preselectedId || '';
}

// -----------------------------
// Load contatos (clientes/fornecedores)
// -----------------------------
async function loadContatos() {
  const { data, error } = await supabase
    .from('contatos')
    .select('id, nome, tipo, status, logo_url')
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

function initContaPickersOnce() {
  if (!compContaPicker) {
    compContaPicker = createContaPicker({
      triggerBtnId: 'comp-conta-btn',
      hiddenInputId: 'comp-conta',
      avatarWrapId:  'comp-conta-avatar-wrap',
      nameElId:      'comp-conta-name',
      getContas:     () => cachedContas,
      placeholder:   'Banco / Cartão (opcional)…',
      allowBlank:    true,
      blankLabel:    '— Sem banco (preencher depois) —',
    });
    compContaPicker.init();
  }
  if (!compContaDestinoPicker) {
    compContaDestinoPicker = createContaPicker({
      triggerBtnId: 'comp-conta-destino-btn',
      hiddenInputId: 'comp-conta-destino',
      avatarWrapId:  'comp-conta-destino-avatar-wrap',
      nameElId:      'comp-conta-destino-name',
      getContas:     () => {
        const tipo = document.getElementById('comp-tipo').value;
        if (tipo === 'Caixinha') return cachedContas.filter((c) => c.tipo === 'Cofrinho' && c.status !== 'arquivada');
        return cachedContas;
      },
      placeholder:   'Selecione a conta destino…',
      allowBlank:    false,
    });
    compContaDestinoPicker.init();
  }
}

// -----------------------------
// Load contas (pro select opcional)
// -----------------------------
async function loadContas() {
  let { data, error } = await supabase
    .from('contas')
    .select('id, nome, apelido, tipo, icone_cor, moeda, status, limite')
    .neq('status', 'arquivada')
    .order('nome');

  // Fallback: if 'limite' column doesn't exist yet (migration 0035 not applied)
  if (error && /column.*limite|limite.*column/i.test(error.message)) {
    ({ data, error } = await supabase
      .from('contas')
      .select('id, nome, apelido, tipo, icone_cor, moeda, status')
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
    showToast(t('compromissos.toast.erro_carregar_categorias', 'Erro ao carregar categorias') + ': ' + error.message, 'error', 8000);
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
    showToast(t('compromissos.toast.erro_categoria_default', 'Erro ao criar categorias default') + ': ' + error.message, 'error', 10000);
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
      btn.className = 'cf-tipo-chip';
      btn.dataset.categoria = cat.id;
      btn.type = 'button';
      if (cat.cor) btn.style.setProperty('--tipo-c', cat.cor);
      btn.innerHTML = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${cat.cor || '#9CA3AF'};flex-shrink:0;"></span>${escapeHtml(cat.nome)}`;
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

  // Banco/Cartão (opcional) — now uses conta-picker
  initContaPickersOnce();

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

  // Moeda — popula os 2 selects (modo fixo + modo variável) com BRL como padrão inicial.
  // O modal ajusta o selected ao abrir via openCompromissoModal.
  const selMoeda = document.getElementById('comp-moeda');
  selMoeda.innerHTML = renderMoedaOptions('BRL');
  const selMoedaVar = document.getElementById('comp-moeda-var');
  if (selMoedaVar) selMoedaVar.innerHTML = renderMoedaOptions('BRL');
  document.getElementById('comp-valor-base').placeholder = moedaInputPlaceholder('BRL');
  selMoeda.addEventListener('change', (e) => {
    document.getElementById('comp-valor-base').placeholder = moedaInputPlaceholder(e.target.value);
  });

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

/**
 * Mostra o banner "Compromissos de Dívida/Projeto são criados pela página específica"
 * quando o usuário seleciona uma categoria do grupo "dividas" ou "investimentos".
 * Esconde o resto do form e o botão Salvar, oferecendo CTA para a página correta.
 */
function toggleVinculoBanner() {
  const banner = document.getElementById('comp-vinculo-banner');
  if (!banner) return;
  const catId = document.getElementById('comp-categoria').value;
  const cat   = cachedCategorias.find((c) => c.id === catId);
  const grupo = cat?.grupo;
  const isDivida    = grupo === 'dividas'       || /dívida|divida/i.test(cat?.nome || '');
  const isProjeto   = grupo === 'investimentos' || /investiment/i.test(cat?.nome || '');
  const bloqueado   = isDivida || isProjeto;

  // Se está editando um compromisso vinculado (divida_id/projeto_id setados), também bloqueia
  // — mas isso normalmente não acontece pelo fluxo do app (modal-details esconde Editar nesses casos).

  banner.classList.toggle('hidden', !bloqueado);

  // Marca a modal-body como bloqueada → CSS esconde tudo exceto o banner e o select de categoria
  const modalBody = banner.closest('.modal-body');
  if (modalBody) modalBody.classList.toggle('comp-modal-bloqueada', bloqueado);

  // Esconde o botão Salvar quando bloqueado
  const btnSalvar = document.getElementById('btn-salvar-compromisso');
  if (btnSalvar) btnSalvar.classList.toggle('hidden', bloqueado);

  // Ajusta CTA do banner
  if (bloqueado) {
    const btn   = document.getElementById('btn-comp-ir-pagina');
    const label = document.getElementById('btn-comp-ir-pagina-label');
    const title = document.getElementById('comp-vinculo-banner-title');
    if (isDivida) {
      btn.dataset.destino = 'dividas';
      label.textContent = 'Ir para Financiamentos e Dívidas';
      title.textContent = 'Compromissos de Financiamentos e Dívidas são criados pela página de Financiamentos e Dívidas.';
    } else {
      btn.dataset.destino = 'investimentos';
      label.textContent = 'Ir para Projetos e Investimentos';
      title.textContent = 'Compromissos de Investimentos são criados pela página de Projetos.';
    }
  }
}



function syncCategoriaFilterUI() {
  document.querySelectorAll('#categoria-filters .cf-tipo-chip').forEach((p) => {
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
  const isCaixinha = tipo === 'Caixinha';
  const needsDestino = isTransfer || isCaixinha;
  const destField  = document.getElementById('comp-conta-destino-field');
  const destLabel  = document.getElementById('comp-conta-destino-label');
  const destHint   = document.getElementById('comp-conta-destino-hint');
  const oriLabel   = document.getElementById('comp-conta-label');
  const oriHint    = document.getElementById('comp-conta-hint');
  if (destField) destField.classList.toggle('hidden', !needsDestino);
  if (destLabel) destLabel.innerHTML = isCaixinha
    ? 'Conta Reserva <span class="required">*</span>'
    : 'Para (destino) <span class="required">*</span>';
  if (destHint) destHint.textContent = isCaixinha
    ? 'Conta bancária de reserva onde o dinheiro fica guardado.'
    : 'Conta que vai receber o valor transferido.';
  if (oriLabel) {
    if (isTransfer) oriLabel.innerHTML = 'De (origem) <span class="required">*</span>';
    else if (isCaixinha) oriLabel.innerHTML = 'Banco / Cartão <span class="required">*</span>';
    else oriLabel.innerHTML = 'Banco / Cartão (opcional)';
  }
  if (oriHint) {
    if (isTransfer) oriHint.textContent = 'Obrigatório — conta de onde o dinheiro sai.';
    else if (isCaixinha) oriHint.textContent = 'Conta de onde sai o dinheiro pra abastecer a caixinha.';
    else oriHint.textContent = 'Pode deixar em branco e preencher depois.';
  }
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
  initContaPickersOnce();
  compContaPicker.setValue(c?.conta_id || '');
  document.getElementById('comp-tipo-pagamento').value = c?.tipo_pagamento || '';
  document.getElementById('comp-periodo').value = c?.periodo || 'Mensal';
  document.getElementById('comp-vencimento-dia').value = c?.vencimento_dia || '';
  document.getElementById('comp-vencimento-data-anual').value = anualDateFromCompromisso(c);
  document.getElementById('comp-dia-semana').value = c?.dia_semana ?? '';
  document.getElementById('comp-intervalo-semanas').value = c?.intervalo_semanas || 1;
  // Se valor_base é 0/null, deixa o input vazio pra o placeholder "0,00"
  // aparecer — o usuário começa a digitar sem precisar apagar o 0
  document.getElementById('comp-valor-base').value =
    (c?.valor_base != null && Number(c.valor_base) !== 0) ? c.valor_base : '';
  const openMoedaCode = c?.moeda || 'BRL';
  document.getElementById('comp-moeda').innerHTML = renderMoedaOptions(openMoedaCode);
  document.getElementById('comp-valor-base').placeholder = moedaInputPlaceholder(openMoedaCode);
  const moedaVarEl = document.getElementById('comp-moeda-var');
  if (moedaVarEl) moedaVarEl.innerHTML = renderMoedaOptions(openMoedaCode);
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

  compContaDestinoPicker?.setValue(c?.conta_destino_id || '');

  toggleVencimentoFields();
  toggleValorVariavelFields();
  toggleRendaPrincipalRow();
  toggleProjetoField();
  toggleDividaField();
  toggleVinculoBanner();
  const custoVidaPresel = (cachedCategorias.find((cc) => cc.id === c?.categoria_id)?.grupo === 'custo_vida') ? c?.projeto_id : null;
  toggleVinculoInvestimentoField(custoVidaPresel);
  toggleTransferFields();
  updateLimiteInfo(c?.conta_id || '');
  if (c?.valor_variavel) {
    populateValoresMensaisGrid(c);
  } else {
    document.getElementById('valores-mensais-grid').innerHTML = '';
  }

  openModal('modal-compromisso');

  // Bonus: select-all em foco pra inputs decimais — usuário começa a
  // digitar direto sem precisar apagar o valor existente
  const modalEl = document.getElementById('modal-compromisso');
  if (modalEl && !modalEl._selectAllBound) {
    modalEl._selectAllBound = true;
    modalEl.addEventListener('focusin', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.type === 'number' || t.inputMode === 'decimal' || t.classList.contains('input-decimal')) {
        // setTimeout p/ garantir que o cursor já está no campo antes do select
        setTimeout(() => t.select?.(), 0);
      }
    });
  }

  // Se rodando dentro do overlay do iframe (configuracoes.html), restaura a
  // visibilidade do documentElement (escondida pelo inline script do <head>
  // para evitar flash do app-shell) e avisa o parent que o modal está pronto.
  if (new URLSearchParams(location.search).get('embedded') === '1') {
    document.documentElement.style.visibility = '';
    window.parent.postMessage({ source: 'finflow-embedded', type: 'comp-ready' }, location.origin);
  }
}

// Abre o modal em modo edição para compromissos configurados diretamente na categoria
// (sem subcategoria). Chamado quando o usuário clica em uma linha _type='cat' configurada.
function openCatEditModal(cat) {
  editingId    = null;
  editingCatId = cat.id;

  document.getElementById('modal-compromisso-title').textContent = 'Editar compromisso';
  document.getElementById('btn-salvar-compromisso').textContent  = 'Salvar alterações';

  document.getElementById('form-compromisso').reset();
  renderModalDropdowns(); // popula todos os selects + renderCatExistenteOptions

  setNivelMode('categoria');
  document.getElementById('nivel-field').classList.add('hidden');

  const tipo   = cat.tipo   || DEFAULT_TIPO;
  const status = cat.status || 'ativa';

  document.getElementById('comp-cat-existente').value    = cat.id;
  document.getElementById('comp-tipo').value             = tipo;
  document.getElementById('comp-tipo-pagamento').value   = cat.tipo_pagamento || '';
  document.getElementById('comp-periodo').value          = cat.periodo || 'Mensal';
  document.getElementById('comp-vencimento-dia').value   = cat.vencimento_dia || '';
  document.getElementById('comp-vencimento-data-anual').value = anualDateFromCompromisso(cat);
  document.getElementById('comp-dia-semana').value       = cat.dia_semana ?? '';
  document.getElementById('comp-intervalo-semanas').value = cat.intervalo_semanas || 1;
  document.getElementById('comp-valor-base').value =
    (cat.valor_base != null && Number(cat.valor_base) !== 0) ? cat.valor_base : '';
  const openMoedaCode = cat.moeda || 'BRL';
  document.getElementById('comp-moeda').innerHTML           = renderMoedaOptions(openMoedaCode);
  document.getElementById('comp-valor-base').placeholder    = moedaInputPlaceholder(openMoedaCode);
  const moedaVarEl = document.getElementById('comp-moeda-var');
  if (moedaVarEl) moedaVarEl.innerHTML = renderMoedaOptions(openMoedaCode);
  document.getElementById('comp-iniciado-em').value  = cat.iniciado_em || todayISO();
  document.getElementById('comp-terminado-em').value = cat.terminado_em || '';
  document.getElementById('comp-descricao').value    = cat.descricao || '';
  document.getElementById('motivo-field').classList.remove('hidden');
  document.getElementById('comp-motivo').value = '';
  document.getElementById('comp-status').value = status;
  document.getElementById('comp-valor-variavel').checked   = !!cat.valor_variavel;
  document.getElementById('comp-renda-principal').checked  = !!cat.eh_renda_principal;

  compContaPicker?.setValue(cat.conta_id || '');
  compContaDestinoPicker?.setValue(cat.conta_destino_id || '');

  document.querySelectorAll('.tipo-btn').forEach((b) => b.classList.toggle('active', b.dataset.tipo === tipo));
  document.querySelectorAll('#status-segmented .segmented-btn').forEach((b) => b.classList.toggle('active', b.dataset.status === status));

  toggleVencimentoFields();
  toggleValorVariavelFields();
  toggleRendaPrincipalRow();
  toggleTransferFields();
  updateLimiteInfo(cat.conta_id || '');
  if (cat.valor_variavel) {
    populateValoresMensaisGrid(cat);
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
  // Banco/cartão com avatar (mesmo padrão de renderContaInline em table.js)
  const contaHtmlValue = conta ? renderContaAvatarInline(conta) : '<span class="details-field-empty">— (não vinculado)</span>';

  // Contato vinculado (cliente/fornecedor)
  const contato = c.contato_id ? cachedContatos.find((ct) => ct.id === c.contato_id) : null;
  const contatoHtmlValue = contato ? renderContatoAvatarInline(contato) : null;

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
    { label: 'Banco/Cartão',      value: contaHtmlValue, html: true },
    ...(contatoHtmlValue ? [{
      label: 'Contato',
      value: contatoHtmlValue,
      html: true,
    }] : []),
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

  document.getElementById('details-grid').innerHTML = fields.map((f) => {
    // Campos com html:true pulam o escapeHtml (já trazem HTML controlado).
    const valueHtml = f.value
      ? (f.html ? String(f.value) : escapeHtml(String(f.value)))
      : '—';
    const emptyCls  = !f.value ? 'details-field-empty' : '';
    return `
      <div class="details-field" ${f.full ? 'style="grid-column: 1 / -1;"' : ''}>
        <span class="details-field-label">${f.label}</span>
        <span class="details-field-value ${emptyCls}">${valueHtml}</span>
      </div>`;
  }).join('');

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

  // Botão "Registrar adiantamento" — apenas pra subs Receita ativas/inativas
  const btnAdiant = document.getElementById('btn-registrar-adiantamento');
  if (btnAdiant) {
    const podeAdiantar = c.tipo === 'Receita' && c.status !== 'arquivada' && !c.terminado_em;
    btnAdiant.classList.toggle('hidden', !podeAdiantar);
    btnAdiant.dataset.subId = c.id;
  }

  // ── Próximas 3 / Últimas 3 ocorrências (v0.6.x) ──
  renderOcorrenciasSections(c);

  // ── Compromisso vinculado a Dívida/Projeto → modo read-only ──
  // Esconde botões de edição/duplicação/arquivamento, mostra "Ir para Dívida/Projeto"
  const cat            = cachedCategorias.find((cc) => cc.id === c.categoria_id);
  const ehDividasCat   = cat?.grupo === 'dividas';
  const ehInvestCat    = cat?.grupo === 'investimentos';
  const ehVinculado    = ehDividasCat || ehInvestCat;
  const ehDivida       = !!c.divida_id || ehDividasCat;
  const btnIrVinculo   = document.getElementById('btn-ir-vinculo');
  const btnEditar      = document.getElementById('btn-editar');
  const btnAtualizar   = document.getElementById('btn-atualizar-valor');
  if (ehVinculado) {
    btnEditar.classList.add('hidden');
    btnAtualizar.classList.add('hidden');
    btnArq.classList.add('hidden');
    btnDel.classList.add('hidden');
    document.getElementById('btn-encerrar').classList.add('hidden');
    btnIrVinculo.classList.remove('hidden');
    document.getElementById('btn-ir-vinculo-label').textContent =
      ehDivida ? 'Ir para Dívida' : 'Ir para Projeto';
  } else {
    btnIrVinculo.classList.add('hidden');
  }

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

async function saveQuickValor(event)         { return saveModule.saveQuickValor(event, buildSaveDeps()); }

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
  // Wrapper fino sobre toBRL() de currency.js — única fonte de verdade
  // pra conversão. Comportamento legado: fallback para valor cru se a
  // taxa falhar (em vez de null), com console.warn.
  const result = toBRL(value, currency, { rateMap: ratesMapLocal, onMissing: 'raw' });
  if (currency && currency !== 'BRL' && !ratesMapLocal.get(currency)) {
    console.warn(`[convertToLocalBRL] taxa ${currency}→BRL ausente; usando valor cru.`);
  }
  return result;
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
    const calDeps = {
      displayName,
      getDisplayValor,
      getCompromissoById: (id) => cachedCompromissos.find((x) => x.id === id),
      openDetailsModal,
    };
    container.innerHTML = renderCalendar(calItems, calendarYear, calendarMonth, calDeps);
    bindCalendarClicks({
      onPrev:  () => navigateCalendar(-1),
      onNext:  () => navigateCalendar(1),
      onToday: () => {
        const t0 = new Date();
        calendarYear  = t0.getFullYear();
        calendarMonth = t0.getMonth();
        renderCompromissos();
      },
      onDayClick: (day) => {
        const date = new Date(calendarYear, calendarMonth, day);
        const events = calItems.filter((c) => occursOn(c, date));
        openDayModal(date, events, calDeps);
      },
    });
  } else if (viewMode === 'dre') {
    const dreItems = filtered.filter((r) => r._type === 'sub' && isRowConfigured(r));
    container.innerHTML = renderDre(
      dreItems,
      { cachedCategorias, filterCategorias },
      { displayName, getDisplayValor, compareByVencimento, diaSemanaLabel },
    );
  } else {
    const tableDeps = {
      displayName,
      getDisplayValor,
      getProjeto,
      getDivida,
      getConta,
      isRowConfigured,
    };
    container.innerHTML = renderGroupedBySuperBloco(filtered, tableDeps, SUPER_BLOCOS_LIST, cachedCategorias);
    bindRowClicks({
      onSubRowClick: (id) => {
        const c = cachedCompromissos.find((x) => x.id === id);
        if (c) openDetailsModal(c);
      },
      onCatRowClick: (catId) => {
        const cat = cachedCategorias.find((x) => x.id === catId);
        if (cat && (Number(cat.valor_base) > 0 || cat.valor_variavel === true)) {
          openCatEditModal(cat);
        } else {
          // Não configurado → novo compromisso com nome e categoria pré-preenchidos
          openCompromissoModal(null);
          document.getElementById('comp-categoria').value = catId;
          if (cat?.nome) document.getElementById('comp-nome').value = cat.nome;
          toggleDividaField();
          toggleProjetoField();
          toggleVinculoInvestimentoField();
        }
      },
    });
  }

  // v0.5.3: atualiza o sumário "Cabe no orçamento?"
  updateBudgetSummary();
}

/**
 * Calcula receitas vs despesas mensais agregando todos os compromissos
 * configurados e ativos. Indicador verde/amarelo/vermelho baseado no saldo.
 *
 *   • Verde:    saldo ≥ 20% das receitas (folga saudável)
 *   • Amarelo:  saldo ≥ 0 mas < 20% (passa, mas justo)
 *   • Vermelho: saldo < 0 (não cabe no orçamento)
 */
function updateBudgetSummary() {
  const summary = document.getElementById('orc-budget-summary');
  if (!summary) return;

  // Multiplicador mensal por período
  const periodoMult = (p) => ({
    'Mensal':    1,
    'Quinzenal': 2,
    'Semanal':   4.33,
    'Anual':     1 / 12,
    'Único':     0,
  })[p] ?? 1;

  let receitas = 0;
  let despesas = 0;
  const porBloco = new Map(); // blocoId → { label, accent, total }
  SUPER_BLOCOS_LIST.forEach((b) => porBloco.set(b.id, { label: b.label, accent: b.accent, total: 0 }));

  const catToBloco = new Map();
  for (const bloco of SUPER_BLOCOS_LIST) {
    for (const cat of cachedCategorias) {
      if (bloco.grupos.includes(cat.grupo || 'custo_vida')) catToBloco.set(cat.id, bloco.id);
    }
  }

  for (const sub of cachedCompromissos) {
    if (sub.status !== 'ativa') continue;
    if (!isRowConfigured(sub)) continue;
    // Para compromissos com valor_variavel, usa o valor do próximo mês
    // (orcamento_geral via cachedProxValores). Senão, usa valor_base.
    let valorOrig = Number(sub.valor_base) || 0;
    let moedaOrig = sub.moeda || 'BRL';
    if (sub.valor_variavel && cachedProxValores.has(sub.id)) {
      const prox = cachedProxValores.get(sub.id);
      valorOrig = Number(prox.valor_previsto) || 0;
      moedaOrig = prox.moeda || moedaOrig;
    }
    const valorBRL = convertToLocalBRL(valorOrig, moedaOrig);
    const mensal = valorBRL * periodoMult(sub.periodo);
    const tipo = (sub.tipo || '').toLowerCase();
    if (tipo === 'receita') receitas += mensal;
    else if (tipo === 'despesa') despesas += mensal;

    const blocoId = catToBloco.get(sub.categoria_id);
    if (blocoId) porBloco.get(blocoId).total += mensal;
  }

  if (receitas === 0 && despesas === 0) {
    summary.classList.add('hidden');
    return;
  }
  summary.classList.remove('hidden');

  const saldo  = receitas - despesas;
  const ratio  = receitas > 0 ? saldo / receitas : (despesas > 0 ? -1 : 0);
  const status = ratio >= 0.2 ? 'verde' : (ratio >= 0 ? 'amarelo' : 'vermelho');
  const label  = status === 'verde'   ? '✓ Cabe com folga'
               : status === 'amarelo' ? '⚠ Cabe, mas justo'
               : '✕ Não cabe no orçamento';

  document.getElementById('orc-budget-receitas').textContent = formatCurrencyBRL(receitas);
  document.getElementById('orc-budget-despesas').textContent = formatCurrencyBRL(despesas);
  document.getElementById('orc-budget-saldo').textContent    = formatCurrencyBRL(saldo);
  document.getElementById('orc-budget-indicator').textContent = label;

  const card = document.getElementById('orc-budget-saldo-card');
  card.classList.remove('saldo--verde', 'saldo--amarelo', 'saldo--vermelho');
  card.classList.add(`saldo--${status}`);

  // Breakdown por super-bloco
  const breakdownEl = document.getElementById('orc-bloco-breakdown');
  if (breakdownEl) {
    const blocosWithTotal = Array.from(porBloco.values()).filter((b) => b.total > 0);
    if (blocosWithTotal.length === 0) {
      breakdownEl.classList.add('hidden');
      breakdownEl.innerHTML = '';
    } else {
      breakdownEl.classList.remove('hidden');
      breakdownEl.innerHTML = blocosWithTotal.map((b) => `
        <div class="orc-bloco-mini" style="--bloco-accent: ${b.accent};">
          <span class="orc-bloco-mini-label">${b.label}</span>
          <span class="orc-bloco-mini-value">${formatCurrencyBRL(b.total)}</span>
        </div>
      `).join('');
    }
  }
}

function formatCurrencyBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}


/**
 * Calcula as próximas N ocorrências de um compromisso recorrente a partir
 * de hoje, varrendo dia a dia e testando `occursOn` (até 730 dias = 2 anos).
 */
function nextOccurrences(c, n = 3, fromDate = new Date()) {
  const out = [];
  const t = new Date(fromDate);
  t.setHours(0, 0, 0, 0);
  const limit = new Date(t);
  limit.setDate(t.getDate() + 730);
  const cursor = new Date(t);
  while (out.length < n && cursor <= limit) {
    if (occursOn(c, cursor)) out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * Renderiza as 2 seções no modal de detalhes:
 *   • Próximas 3 ocorrências (datas planejadas)
 *   • Últimas 3 ocorrências (planejada + data real do pagamento)
 */
async function renderOcorrenciasSections(c) {
  const wrap         = document.getElementById('details-ocorrencias');
  const proximasEl   = document.getElementById('details-proximas-list');
  const ultimasEl    = document.getElementById('details-ultimas-list');
  if (!wrap || !proximasEl || !ultimasEl) return;

  // Só faz sentido pra compromissos recorrentes configurados
  if (!c || !c.periodo || c.periodo === 'Único') {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');

  const fmt = (d) => {
    const dt = d instanceof Date ? d : new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  // ── Próximas 3 ──
  const proximas = nextOccurrences(c, 3);
  proximasEl.innerHTML = proximas.length === 0
    ? '<p class="text-muted" style="font-size: var(--fs-sm);">Sem ocorrências futuras.</p>'
    : proximas.map((d, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;${i < proximas.length - 1 ? 'border-bottom:1px solid var(--color-border);' : ''}">
          <span style="font-variant-numeric:tabular-nums;font-size:var(--fs-sm);font-weight:var(--fw-medium);">${fmt(d)}</span>
        </div>
      `).join('');

  // ── Últimas 3 ── (busca em pagamentos com skeleton enquanto carrega)
  ultimasEl.innerHTML = `
    <div class="details-skeleton-row"></div>
    <div class="details-skeleton-row"></div>
    <div class="details-skeleton-row"></div>
  `;
  try {
    const { data: pags } = await supabase
      .from('pagamentos')
      .select('mes_ano, valor_real, status, data_vencimento, updated_at')
      .eq('subcategoria_id', c.id)
      .in('status', ['Pago', 'Transferido'])
      .order('mes_ano', { ascending: false })
      .limit(3);

    if (!pags || pags.length === 0) {
      ultimasEl.innerHTML = '<p class="text-muted" style="font-size: var(--fs-sm);">Nenhum pagamento registrado ainda.</p>';
      return;
    }

    ultimasEl.innerHTML = pags.map((p, i) => {
      const planejada = p.data_vencimento ? fmt(p.data_vencimento) : fmt(p.mes_ano);
      const realizada = p.updated_at ? fmt(p.updated_at.slice(0, 10)) : '—';
      const valor     = Number(p.valor_real) || 0;
      const statusColor = ({
        'Pago':        'var(--color-success)',
        'Transferido': 'var(--color-info)',
      })[p.status] || 'var(--color-text-muted)';
      return `
        <div style="display:flex;flex-direction:column;gap:2px;padding:6px 0;${i < pags.length - 1 ? 'border-bottom:1px solid var(--color-border);' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <span style="font-variant-numeric:tabular-nums;font-size:var(--fs-sm);font-weight:var(--fw-medium);">${planejada}</span>
            <span style="color:${statusColor};font-size:var(--fs-xs);font-weight:var(--fw-semibold);">${p.status}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--color-text-muted);">
            <span>Pago em ${realizada}</span>
            <span style="font-variant-numeric:tabular-nums;">${formatCurrencyHTML(valor, c.moeda || 'BRL')}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.warn('[renderOcorrenciasSections] últimas:', err);
    ultimasEl.innerHTML = '<p class="text-muted" style="font-size: var(--fs-sm);">Não foi possível carregar o histórico.</p>';
  }
}

/**
 * Renderiza nome do banco/cartão com avatar/logo inline.
 * Reaproveita o mesmo padrão da tabela (renderContaInline em table.js).
 */
function renderContaAvatarInline(conta) {
  const display = conta.apelido?.trim() || conta.nome;
  const bank = findBank(conta.nome);
  const fallbackColor = conta.icone_cor || '#6B7280';
  const initials = getInitials(display);
  const avatar = bank
    ? `<img src="${logoUrl(bank.domain)}" alt="" style="width:22px;height:22px;border-radius:50%;background:#fff;border:1px solid var(--color-border);object-fit:contain;padding:1px;flex-shrink:0;" onerror="this.outerHTML='<span style=&quot;width:22px;height:22px;border-radius:50%;background:${fallbackColor};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;flex-shrink:0;&quot;>${escapeHtml(initials)}</span>'">`
    : `<span style="width:22px;height:22px;border-radius:50%;background:${fallbackColor};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;flex-shrink:0;">${escapeHtml(initials)}</span>`;
  return `<span style="display:inline-flex;align-items:center;gap:8px;">${avatar}<span>${escapeHtml(display)}</span></span>`;
}

/**
 * Renderiza contato (cliente/fornecedor) com avatar/foto inline.
 * Usa logo_url quando disponível, fallback pra iniciais coloridas
 * (mesmo padrão do contato-picker).
 */
function renderContatoAvatarInline(contato) {
  const display = contato.nome || '—';
  const initials = getInitials(display);
  // Gera cor consistente a partir do nome
  let hash = 0;
  for (let i = 0; i < display.length; i++) hash = display.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#F97316', '#84CC16'];
  const color = colors[Math.abs(hash) % colors.length];
  const avatar = contato.logo_url
    ? `<img src="${escapeHtml(contato.logo_url)}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;background:var(--color-surface-alt);flex-shrink:0;" onerror="this.outerHTML='<span style=&quot;width:22px;height:22px;border-radius:50%;background:${color};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;flex-shrink:0;&quot;>${escapeHtml(initials)}</span>'">`
    : `<span style="width:22px;height:22px;border-radius:50%;background:${color};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;flex-shrink:0;">${escapeHtml(initials)}</span>`;
  return `<span style="display:inline-flex;align-items:center;gap:8px;">${avatar}<span>${escapeHtml(display)}</span></span>`;
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


// -----------------------------
// Save (insert / update) — wrappers thin que delegam pra compromissos/save.js
// -----------------------------

async function saveCompromisso(event)        { return saveModule.saveCompromisso(event, buildSaveDeps()); }

async function changeStatus(id, newStatus)   { return saveModule.changeStatus(id, newStatus, buildSaveDeps()); }

async function deleteCompromisso(id)         { return saveModule.deleteCompromisso(id, buildSaveDeps()); }

// =============================================================
// Encerrar compromisso — wrappers
// =============================================================
function openEncerrarModal(c)                { return saveModule.openEncerrarModal(c, buildSaveDeps()); }
async function confirmarEncerrar()           { return saveModule.confirmarEncerrar(buildSaveDeps()); }



// Definição dos super-blocos (mesma usada no orçamento, mas duplicada aqui pra
// não criar dependência cruzada entre páginas). Mantém em sync se mudar.
const SUPER_BLOCOS_LIST = [
  { id: 'contribuicao', label: 'Contribuição', grupos: ['receitas', 'dividas'],       accent: 'var(--color-success)' },
  { id: 'sonhos',       label: 'Sonhos',       grupos: ['investimentos'],             accent: 'var(--color-primary)' },
  { id: 'custo_vida',   label: 'Custo de vida', grupos: ['custo_vida'],               accent: 'var(--color-secondary)' },
];


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



function buildSaveDeps() {
  return {
    getEditingId:           () => editingId,
    getEditingCatId:        () => editingCatId,
    setEditingId:           (v) => { editingId = v; },
    setEditingCatId:        (v) => { editingCatId = v; },
    getDetailsCompromisso:  () => detailsCompromisso,
    getCachedCompromissos:  () => cachedCompromissos,
    getCachedCategorias:    () => cachedCategorias,
    getCachedDividas:       () => cachedDividas,
    getContatoPickerValue:  () => contatoPicker?.getValue() || null,
    loadCompromissos,
    loadCategorias,
    logHistoryEntries,
    displayName,
    readAnualDateInput,
    getDivida,
    getProjeto,
  };
}
