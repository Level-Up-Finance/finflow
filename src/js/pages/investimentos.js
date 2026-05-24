// =============================================================
// FinFlow — Página: Investimentos (Fase 8.A)
//
// Lista de projetos de investimento. Cada projeto agrupa
// subcategorias do grupo "investimentos". Total realizado =
// saldo_inicial + soma de valor_real dos pagamentos com status
// Pago/Cartão das subs atreladas (todos os meses).
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { requireWorkspaceId } from '../lib/workspace.js';
import { listMembers } from '../lib/workspace-members.js';
import { renderAttribBadge } from '../lib/attribution-badge.js';
import { applyBodyRoleGating } from '../lib/permissions.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import {
  STATUS_BY_CONTEXT,
  renderStatusOptions, calcularBadgeAtraso, statusConfig as statusConfigUnified,
} from '../lib/status-config.js';
import { PERIODOS, DIAS_SEMANA, TIPOS_PAGAMENTO } from '../lib/compromissos-config.js';
import { formatCurrency, formatCurrencyHTML, renderMoedaOptions } from '../lib/moedas.js';
import { initColVisibility } from '../lib/col-visibility.js';
import { escapeHtml, formatDateBR, isoMonth, parseUserNumber } from '../lib/utils.js';
import { DEFAULT_COLOR, renderColorPicker, setActiveColor } from '../lib/color-palette.js';
import { initContatoPicker } from '../components/contato-picker.js';
import { createContaPicker } from '../lib/conta-picker.js';
import { parseDecimal, formatDecimal, autoAttachDecimalInputs } from '../lib/number-format.js';
import { bindSimulador } from './investimentos/simulator.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';
import { fetchExchangeRate } from '../lib/currency.js';

let cachedProjetos = [];
let cachedSubcategorias = []; // só as do grupo investimentos
let cachedPagamentos = [];    // pagos/cartão das subs de investimento
let cachedOrcamento = [];     // mês corrente — pra "previsto neste mês"
let cachedContatos = [];      // clientes/fornecedores do usuário
let cachedAportes = [];       // aportes_projeto (histórico manual)
let cachedCategoriasInvest = []; // categorias do grupo investimentos (pra picker do compromisso vinculado)
let cachedContas = [];        // contas ativas (pra picker de conta do compromisso)
let editingId = null;
let detailsId = null;
let historicoInvestId = null;
let viewMode = 'cards'; // 'cards' | 'table' | 'timeline'
let colVisEl = null;
let timelineZoom = 'mes'; // 'mes' | 'ano' | '5anos' | '10anos'

const today = new Date();
const viewYear = today.getFullYear();
const viewMonth = today.getMonth();

// STATUS_LABELS deriva da taxonomia unificada — chave é o dbValue, valor o rótulo
const STATUS_LABELS = Object.fromEntries(
  Object.values(STATUS_BY_CONTEXT.investimento)
    .filter((s) => s.dbValue)
    .map((s) => [s.dbValue, s.label])
);
const INV_COLLAPSED_KEY = 'finflow_inv_bloco_collapsed';

// Atualiza o hint descritivo embaixo do select de status no modal
function updateStatusDescProj() {
  const sel  = document.getElementById('proj-status');
  const desc = document.getElementById('proj-status-desc');
  if (!sel || !desc) return;
  const cfg = statusConfigUnified(sel.value, 'investimento');
  desc.textContent = cfg?.desc || '';
}

// Atalhos pros dbValues do contexto "investimento"
const ST_INV_SEM_META  = STATUS_BY_CONTEXT.investimento.sem_definicao.dbValue;  // 'Sem meta'
const ST_INV_ACOMECAR  = STATUS_BY_CONTEXT.investimento.a_comecar.dbValue;      // 'A começar'
const ST_INV_APORTANDO = STATUS_BY_CONTEXT.investimento.em_curso.dbValue;       // 'Aportando'
const ST_INV_PAUSADO   = STATUS_BY_CONTEXT.investimento.pausado.dbValue;        // 'Pausado'
const ST_INV_CONCLUIDO = STATUS_BY_CONTEXT.investimento.sucesso.dbValue;        // 'Concluído'
const ST_INV_ARQUIVADO = STATUS_BY_CONTEXT.investimento.arquivado.dbValue;      // 'Arquivado'

// Grupos == status (1:1)
const BLOCOS = [
  {
    id: 'sem_definicao',
    label: STATUS_BY_CONTEXT.investimento.sem_definicao.label,
    filter: (p) => p.status === ST_INV_SEM_META,
    emptyMsg: 'Nenhum projeto sem meta definida.',
  },
  {
    id: 'a_comecar',
    label: STATUS_BY_CONTEXT.investimento.a_comecar.label,
    filter: (p) => p.status === ST_INV_ACOMECAR,
    emptyMsg: 'Nenhum projeto aguardando início.',
  },
  {
    id: 'em_curso',
    label: STATUS_BY_CONTEXT.investimento.em_curso.label,
    filter: (p) => p.status === ST_INV_APORTANDO,
    emptyMsg: 'Nenhum projeto recebendo aportes.',
  },
  {
    id: 'pausado',
    label: STATUS_BY_CONTEXT.investimento.pausado.label,
    filter: (p) => p.status === ST_INV_PAUSADO,
    emptyMsg: 'Nenhum projeto pausado.',
  },
  {
    id: 'sucesso',
    label: STATUS_BY_CONTEXT.investimento.sucesso.label,
    filter: (p) => p.status === ST_INV_CONCLUIDO,
    emptyMsg: 'Nenhum projeto concluído ainda.',
  },
  {
    id: 'arquivado',
    label: STATUS_BY_CONTEXT.investimento.arquivado.label,
    filter: (p) => p.status === ST_INV_ARQUIVADO,
    emptyMsg: 'Nenhum projeto arquivado.',
  },
];

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('investimentos');
  initTutorial('investimentos');
  await loadStrings();
  applyTranslationsToDom();
  bindEvents();
  bindSimulador({ onCreateProject: (prefill) => openProjetoModal(null, prefill) });
  autoAttachDecimalInputs();
  const membersP = listMembers().catch(() => []);
  await loadAll();
  await membersP;

  colVisEl = initColVisibility({
    storageKey: 'investimentos',
    tableClass:  'projetos-tabela',
    columns: [
      { key: 'status',         label: 'Status',           defaultVisible: true  },
      { key: 'realizado',      label: 'Realizado',        defaultVisible: true  },
      { key: 'previsto-mes',   label: 'Previsto este mês', defaultVisible: false },
      { key: 'meta',           label: 'Meta',             defaultVisible: true  },
      { key: 'pct-meta',       label: '% Meta',           defaultVisible: true  },
      { key: 'termino',        label: 'Término',          defaultVisible: false },
      { key: 'compromissos',   label: 'Compromissos',     defaultVisible: false },
    ],
    toolbarEl: document.querySelector('.toolbar'),
  });

  render();
  applyRoleGating();
});

/** Esconde controles destrutivos. canManage = hard delete. */
function applyRoleGating() {
  applyBodyRoleGating({ writeIds: ['btn-novo-projeto'] });
}

// -----------------------------
// Loaders
// -----------------------------
async function loadAll() {
  const user = await getCurrentUser();
  if (!user) return;

  const mesAno = isoMonth(viewYear, viewMonth);

  const [projetos, subcats, pagamentos, orcamento, contatos, aportes, categorias, contas] = await Promise.all([
    supabase.from('projetos_investimento').select('*').order('nome'),
    // Subs com categoria pra cruzar com grupo='investimentos'
    supabase.from('subcategorias').select('*, categorias(grupo, cor, nome)').eq('status', 'ativa'),
    // Pagamentos com sub.categorias pra filtrar grupo
    supabase.from('pagamentos')
      .select('*, subcategorias(projeto_id, nome, apelido, categorias(grupo))')
      .in('status', ['Pago']),
    // Orçamento do mês corrente — pra "previsto neste mês"
    supabase.from('orcamento_geral')
      .select('*, subcategorias(projeto_id, categorias(grupo))')
      .eq('mes_ano', mesAno),
    supabase.from('contatos').select('id, nome, tipo, status, logo_url').neq('status', 'arquivado').order('nome'),
    supabase.from('aportes_projeto').select('*').order('data'),
    supabase.from('categorias').select('id, nome, grupo, ordem').eq('grupo', 'investimentos').order('ordem'),
    supabase.from('contas').select('id, nome, apelido, tipo, icone_cor, moeda, status').neq('status', 'arquivada').order('nome'),
  ]);

  cachedContas = contas?.data || [];

  if (projetos.error) {
    if (/relation.*projetos_investimento/i.test(projetos.error.message)) {
      showToast(t('investimentos.toast.schema_desatualizado', 'Schema desatualizado. Rode a migration 0016 + 0017 no Supabase.'), 'error', 12000);
    } else {
      showToast(`${t('investimentos.toast.erro_carregar', 'Erro ao carregar projetos')}: ${projetos.error.message}`, 'error', 8000);
    }
    return;
  }

  cachedProjetos = projetos.data || [];
  // Inclui subs do grupo 'investimentos' (1:1 auto-criadas) E subs do bloco
  // custo_vida que apontam pra um projeto via projeto_id (custos vinculados).
  cachedSubcategorias = (subcats.data || []).filter((s) =>
    s.categorias?.grupo === 'investimentos'
    || (s.categorias?.grupo === 'custo_vida' && s.projeto_id != null)
  );
  cachedPagamentos = (pagamentos.data || []).filter((p) => p.subcategorias?.categorias?.grupo === 'investimentos');
  cachedOrcamento = (orcamento.data || []).filter((e) => e.subcategorias?.categorias?.grupo === 'investimentos');

  if (contatos.error) {
    if (!/relation.*contatos|column.*contatos/i.test(contatos.error.message)) {
      console.warn('[loadContatos]', contatos.error);
    }
    cachedContatos = [];
  } else {
    cachedContatos = contatos.data || [];
  }

  if (aportes.error) {
    if (!/relation.*aportes_projeto/i.test(aportes.error.message)) {
      console.warn('[loadAportes]', aportes.error);
    }
    cachedAportes = [];
  } else {
    cachedAportes = aportes.data || [];
  }

  if (categorias.error) {
    console.warn('[loadCategorias]', categorias.error);
    cachedCategoriasInvest = [];
  } else {
    cachedCategoriasInvest = categorias.data || [];
  }
}

let contatoPicker = null;
let compContaPicker = null;

function initContatoPickerOnce() {
  if (contatoPicker) return;
  const rootEl = document.querySelector('[data-picker="proj-contato"]');
  if (!rootEl) return;
  contatoPicker = initContatoPicker({
    rootEl,
    contatos: () => cachedContatos,
    defaultTipo: 'fornecedor',
  });
}

function initCompContaPickerOnce() {
  if (compContaPicker) return;
  if (!document.getElementById('proj-comp-conta-btn')) return;
  compContaPicker = createContaPicker({
    triggerBtnId: 'proj-comp-conta-btn',
    hiddenInputId: 'proj-comp-conta',
    avatarWrapId:  'proj-comp-conta-avatar-wrap',
    nameElId:      'proj-comp-conta-name',
    getContas:     () => cachedContas,
    placeholder:   'Banco / Cartão (opcional)…',
    allowBlank:    true,
    blankLabel:    '— Sem banco (preencher depois) —',
  });
  compContaPicker.init();
}


// -----------------------------
// Bind events
// -----------------------------
function bindEvents() {
  document.getElementById('btn-novo-projeto').addEventListener('click', () => openProjetoModal());
  document.querySelector('[data-trigger-novo-projeto]')?.addEventListener('click', () => openProjetoModal());

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  document.getElementById('form-projeto').addEventListener('submit', saveProjeto);

  // Toggle da seção "Criar compromisso vinculado" no modal de projeto
  document.getElementById('proj-criar-compromisso').addEventListener('change', (e) => {
    document.getElementById('proj-compromisso-fields').classList.toggle('hidden', !e.target.checked);
  });

  // Vincular sub de custo_vida ao projeto em edição
  document.getElementById('proj-vincular-sub-select').addEventListener('change', async (e) => {
    const subId = e.target.value;
    if (!subId || !editingId) { e.target.value = ''; return; }
    const { error } = await supabase.from('subcategorias').update({ projeto_id: editingId }).eq('id', subId);
    if (error) { showToast('Erro ao vincular: ' + error.message, 'error'); e.target.value = ''; return; }
    const sub = cachedSubcategorias.find((s) => s.id === subId);
    if (sub) sub.projeto_id = editingId;
    renderProjCustosVinculados(editingId);
    render();
  });

  document.getElementById('proj-cor-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('.color-swatch');
    if (!btn) return;
    const color = btn.dataset.color;
    document.getElementById('proj-cor').value = color;
    setActiveColor(document.getElementById('proj-cor-picker'), color);
  });

  document.getElementById('proj-status').addEventListener('change', updateStatusDescProj);

  document.getElementById('btn-editar-projeto').addEventListener('click', () => {
    const proj = cachedProjetos.find((p) => p.id === detailsId);
    if (!proj) return;
    closeModal('modal-projeto-details');
    openProjetoModal(proj);
  });

  document.getElementById('btn-excluir-projeto').addEventListener('click', excluirProjeto);
  document.getElementById('btn-restaurar-projeto').addEventListener('click', restaurarProjeto);
  document.getElementById('btn-confirmar-acao-projeto').addEventListener('click', confirmarAcaoProjeto);

  document.getElementById('btn-historico-invest').addEventListener('click', () => {
    closeModal('modal-projeto-details');
    openHistoricoViewInvest(detailsId);
  });

  document.getElementById('btn-salvar-hist-invest').addEventListener('click', saveHistoricoInvest);

  document.getElementById('hist-invest-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    const mode = btn.dataset.histSeg;
    document.querySelectorAll('#hist-invest-seg .view-toggle-btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.histSeg === mode));
    document.getElementById('hist-invest-saldo-panel').classList.toggle('hidden', mode !== 'saldo');
    document.getElementById('hist-invest-extrato-panel').classList.toggle('hidden', mode !== 'extrato');
  });

  document.getElementById('btn-hist-invest-add-row').addEventListener('click', () => {
    let listEl = document.querySelector('#hist-invest-extrato-list .hist-extrato-list');
    if (!listEl) {
      listEl = document.createElement('div');
      listEl.className = 'hist-extrato-list';
      document.getElementById('hist-invest-extrato-list').appendChild(listEl);
    }
    const row = makeHistRow();
    listEl.appendChild(row);
    row.querySelector('.hist-row-data')?.focus();
  });

  // View toggle (Cards / Tabela / Timeline)
  document.getElementById('view-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    document.querySelectorAll('#view-toggle .view-toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    viewMode = btn.dataset.view;
    render();
  });
}

// -----------------------------
// Render
// -----------------------------
async function render() {
  // Counters por status
  const counts = { todos: cachedProjetos.length, ativo: 0, concluido: 0, pausado: 0, arquivado: 0 };
  cachedProjetos.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.querySelector(`[data-count-status="${k}"]`);
    if (el) el.textContent = v;
  });

  // KPIs (Widget 1: total universal · Widget 2: projetos com meta)
  await renderWidgets(counts);

  const container  = document.getElementById('projetos-container');
  const emptyState = document.getElementById('empty-state');

  if (cachedProjetos.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  if (colVisEl) colVisEl.classList.toggle('hidden', viewMode !== 'table');

  let collapsedSet;
  try { collapsedSet = new Set(JSON.parse(localStorage.getItem(INV_COLLAPSED_KEY) || '[]')); } catch { collapsedSet = new Set(); }

  let html = '';
  for (const bloco of BLOCOS) {
    const items = cachedProjetos.filter(bloco.filter);
    let content;
    if (items.length === 0) {
      content = `<p class="bloco-empty">${bloco.emptyMsg}</p>`;
    } else if (viewMode === 'table') {
      content = renderTable(items);
    } else if (viewMode === 'timeline') {
      content = renderTimeline(items);
    } else {
      content = `<div class="projetos-grid">${items.map(renderCard).join('')}</div>`;
    }
    const collapsed = collapsedSet.has(bloco.id) ? ' bloco-collapsed' : '';
    html += `
      <div class="bloco-section${collapsed}" data-bloco="${bloco.id}">
        <div class="bloco-section-header">
          <span class="bloco-section-label">${bloco.label}</span>
          <span class="bloco-section-count">${items.length}</span>
          <svg class="bloco-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="bloco-body">
          ${content}
        </div>
      </div>`;
  }

  container.innerHTML = html;
  bindCardClicks();
  bindBlocoToggles(INV_COLLAPSED_KEY, 'projetos-container');
}

// -----------------------------
// KPI widgets (topo da página)
// -----------------------------
async function renderWidgets(counts) {
  const ativosNaoArq = cachedProjetos.filter((p) => p.status !== ST_INV_ARQUIVADO);

  // Agrupa realizado por moeda do projeto
  const byCurrency = {};
  for (const p of ativosNaoArq) {
    const moeda = p.moeda || 'BRL';
    if (!byCurrency[moeda]) byCurrency[moeda] = { realizado: 0, meta: 0, comMeta: 0 };
    byCurrency[moeda].realizado += calcRealizado(p.id);
    if (Number(p.meta_valor) > 0) {
      byCurrency[moeda].meta    += Number(p.meta_valor);
      byCurrency[moeda].comMeta += 1;
    }
  }

  const allCodes = Object.keys(byCurrency);
  const nonBRL   = allCodes.filter(c => c !== 'BRL');

  // Câmbio para moedas estrangeiras (paralelo)
  const ratesMap = {};
  if (nonBRL.length > 0) {
    await Promise.all(nonBRL.map(async code => {
      try { ratesMap[code] = await fetchExchangeRate(code, 'BRL'); }
      catch { ratesMap[code] = 0; }
    }));
  }

  const toBRL = (val, code) => code === 'BRL' ? val : val * (ratesMap[code] || 0);

  // ===== Widget 1: Total investido universal (convertido p/ BRL) =====
  let totalUniversalBRL = 0;
  for (const [code, { realizado }] of Object.entries(byCurrency)) {
    totalUniversalBRL += toBRL(realizado, code);
  }

  const hasMultiple = allCodes.length > 1;
  const breakdownHTML = hasMultiple
    ? ['BRL', ...nonBRL.sort()]
        .filter(code => byCurrency[code])
        .map(code => `<span class="kpi-extra-moeda">${formatCurrencyHTML(byCurrency[code].realizado, code)}</span>`)
        .join('')
    : '';

  document.getElementById('kpi-universal-value').innerHTML = formatCurrencyHTML(totalUniversalBRL, 'BRL') + breakdownHTML;
  document.getElementById('kpi-universal-sub').textContent =
    `${counts.ativo} projeto${counts.ativo === 1 ? '' : 's'} ativo${counts.ativo === 1 ? '' : 's'}`;
  document.getElementById('kpi-universal-chart').innerHTML = renderUniversalSparkline(ativosNaoArq);

  // ===== Widget 2: Projetos com meta (convertido p/ BRL) =====
  const projetosComMeta = ativosNaoArq.filter(p => Number(p.meta_valor) > 0);
  const valueEl = document.getElementById('kpi-meta-value');
  const subEl   = document.getElementById('kpi-meta-sub');
  const chartEl = document.getElementById('kpi-meta-chart');

  if (projetosComMeta.length === 0) {
    valueEl.innerHTML = '<span class="invest-kpi-value-empty">—</span>';
    subEl.textContent = 'Nenhum projeto com meta cadastrada';
    chartEl.innerHTML = '';
    return;
  }

  let metaTotalBRL    = 0;
  let metaRealizadoBRL = 0;
  for (const [code, { meta, comMeta }] of Object.entries(byCurrency)) {
    if (comMeta === 0) continue;
    metaTotalBRL    += toBRL(meta, code);
    metaRealizadoBRL += toBRL(
      projetosComMeta
        .filter(p => (p.moeda || 'BRL') === code)
        .reduce((s, p) => s + calcRealizado(p.id), 0),
      code
    );
  }
  const pctMeta = metaTotalBRL > 0 ? Math.min(100, (metaRealizadoBRL / metaTotalBRL) * 100) : 0;

  valueEl.innerHTML = formatCurrencyHTML(metaRealizadoBRL, 'BRL');
  subEl.textContent =
    `${projetosComMeta.length} projeto${projetosComMeta.length === 1 ? '' : 's'} · meta ${formatCurrency(metaTotalBRL, 'BRL')}`;
  chartEl.innerHTML = renderMetaDonut(pctMeta);
}

// Sparkline acumulada agregada (soma evolução de todos os projetos não-arquivados)
function renderUniversalSparkline(projetosAtivos) {
  if (projetosAtivos.length === 0) {
    return '<div class="invest-kpi-empty">Sem dados</div>';
  }

  const series = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(viewYear, viewMonth - i, 1);
    const fimDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const fimISO = fimDoMes.toISOString().slice(0, 10);
    let acumulado = 0;
    for (const p of projetosAtivos) {
      acumulado += Number(p.saldo_inicial) || 0;
      const subIds = cachedSubcategorias.filter((s) => s.projeto_id === p.id).map((s) => s.id);
      for (const pag of cachedPagamentos) {
        if (!subIds.includes(pag.subcategoria_id)) continue;
        if (!pag.data_vencimento || pag.data_vencimento > fimISO) continue;
        acumulado += Number(pag.valor_real) || 0;
      }
      for (const a of cachedAportes) {
        if (a.projeto_id !== p.id) continue;
        if (!a.data || a.data > fimISO) continue;
        acumulado += Number(a.valor) || 0;
      }
    }
    series.push(acumulado);
  }

  return renderSparklineSVG(series, {
    color: 'var(--color-success)',
    uniqueId: 'universal',
  });
}

// Donut do progresso agregado de meta (usa helper genérico)
function renderMetaDonut(pct) {
  return renderDonutSVG(pct, 'var(--color-primary)', 'lg');
}

function renderCard(p) {
  const realizado = calcRealizado(p.id);
  const previstoMes = calcPrevistoMes(p.id);
  const subsCount = cachedSubcategorias.filter((s) => s.projeto_id === p.id).length;

  // Meta + progresso
  const meta = Number(p.meta_valor) || 0;
  const grafico = renderProjetoGrafico(p, realizado, meta);

  // Prazo
  let prazo = '';
  if (p.data_alvo) {
    const d = new Date(p.data_alvo + 'T00:00:00');
    const diffDays = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      prazo = `<span class="projeto-card-prazo overdue">Término passou em ${formatDateBR(p.data_alvo)}</span>`;
    } else if (diffDays === 0) {
      prazo = `<span class="projeto-card-prazo">Termina hoje</span>`;
    } else {
      prazo = `<span class="projeto-card-prazo">${diffDays} dia${diffDays === 1 ? '' : 's'} pro término (${formatDateBR(p.data_alvo)})</span>`;
    }
  }

  const isParcial = (p.status === ST_INV_CONCLUIDO || p.status === ST_INV_ARQUIVADO) && meta > 0 && realizado < meta;

  return `
    <article class="projeto-card status-${p.status}" data-id="${p.id}" style="--projeto-cor: ${p.cor};">
      <header class="projeto-card-header">
        <div class="projeto-card-color-bar"></div>
        <div class="projeto-card-titles">
          <h3 class="projeto-card-name">${escapeHtml(p.nome)}</h3>
          <span class="projeto-card-status status-${p.status}">${STATUS_LABELS[p.status] || p.status}</span>
          <div class="projeto-card-tags">
            ${p.inclui_no_patrimonio ? `<span class="tag-patrimonio" title="Incluído no cálculo de patrimônio">💎 Patrimônio</span>` : ''}
            ${isParcial ? `<span class="tag-parcial" title="Encerrado antes de atingir a meta">Parcial</span>` : ''}
            ${renderAttribBadge({ profileId: p.created_by, timestamp: p.created_at, verb: 'criou' })}
          </div>
        </div>
      </header>
      ${p.descricao ? `<p class="projeto-card-desc">${escapeHtml(p.descricao)}</p>` : ''}

      <div class="projeto-card-stats">
        <div class="projeto-card-stat">
          <span class="projeto-card-stat-label">Realizado</span>
          <span class="projeto-card-stat-value">${formatCurrencyHTML(realizado, 'BRL')}</span>
        </div>
        <div class="projeto-card-stat">
          <span class="projeto-card-stat-label">Previsto este mês</span>
          <span class="projeto-card-stat-value">${formatCurrencyHTML(previstoMes, 'BRL')}</span>
        </div>
      </div>

      ${grafico}

      <footer class="projeto-card-footer">
        <span class="projeto-card-subs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
          ${subsCount} compromisso${subsCount === 1 ? '' : 's'}
        </span>
        ${prazo}
        <button type="button" class="btn btn-sm btn-ghost proj-btn-aporte" data-id="${p.id}" title="Registrar aporte" style="margin-left:auto;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
          Aporte
        </button>
      </footer>
    </article>
  `;
}

// -----------------------------
// Gráfico do card
// -----------------------------
// Calcula a evolução acumulada (saldo_inicial + soma de aportes Pago/Cartão)
// até o final de cada um dos últimos 12 meses (incluindo o atual).
function calcEvolucaoMensal(projetoId) {
  const proj = cachedProjetos.find((p) => p.id === projetoId);
  if (!proj) return [];

  const subIds = cachedSubcategorias.filter((s) => s.projeto_id === projetoId).map((s) => s.id);
  const pags = cachedPagamentos.filter((p) => subIds.includes(p.subcategoria_id) && p.data_vencimento);

  const baseInicial = Number(proj.saldo_inicial) || 0;
  const series = [];
  // 12 meses: do mês -11 até o atual
  for (let i = 11; i >= 0; i--) {
    const d = new Date(viewYear, viewMonth - i, 1);
    const fimDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0); // último dia
    const fimISO = fimDoMes.toISOString().slice(0, 10);
    let acumulado = baseInicial;
    for (const pag of pags) {
      if (pag.data_vencimento <= fimISO) acumulado += Number(pag.valor_real) || 0;
    }
    for (const a of cachedAportes) {
      if (a.projeto_id !== projetoId) continue;
      if (!a.data || a.data > fimISO) continue;
      acumulado += Number(a.valor) || 0;
    }
    series.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][d.getMonth()],
      value: acumulado,
    });
  }
  return series;
}

// SVG sparkline acumulada (sem meta) ou donut (com meta) — mesmo visual dos widgets
function renderProjetoGrafico(p, realizado, meta) {
  if (meta > 0) {
    // Donut com % no centro + texto abaixo (R$ X de R$ Y)
    const pct = Math.min(100, (realizado / meta) * 100);
    const restante = Math.max(0, meta - realizado);
    const restanteHint = restante > 0
      ? `Faltam ${formatCurrencyHTML(restante, 'BRL')}`
      : '🎯 Meta alcançada';
    return `
      <div class="projeto-card-grafico projeto-card-grafico-meta">
        ${renderDonutSVG(pct, p.cor, 'sm')}
        <div class="projeto-card-grafico-meta-info">
          <div class="projeto-card-grafico-meta-amount">${formatCurrencyHTML(realizado, 'BRL')} de ${formatCurrencyHTML(meta, 'BRL')}</div>
          <div class="projeto-card-progress-hint">${restanteHint}</div>
        </div>
      </div>
    `;
  }

  // Sparkline acumulada (sem meta) — usa a cor do projeto
  const series = calcEvolucaoMensal(p.id).map((s) => s.value);
  return `
    <div class="projeto-card-grafico projeto-card-grafico-spark">
      ${renderSparklineSVG(series, { color: p.cor, uniqueId: `card-${p.id}` })}
    </div>
  `;
}

// Helpers reutilizáveis (também usados pelos widgets do topo)
function renderSparklineSVG(series, opts) {
  const { width = 320, height = 100, pad = 6, color = 'var(--color-success)', uniqueId = 'spark' } = opts || {};
  const values = series.map((s) => typeof s === 'number' ? s : s.value);
  const max = Math.max(...values, 1);
  const stepX = (width - pad * 2) / Math.max(1, values.length - 1);
  const points = values.map((v, i) => [
    pad + i * stepX,
    height - pad - (v / max) * (height - pad * 2),
  ]);
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L ${(width - pad).toFixed(1)} ${height - pad} L ${pad} ${height - pad} Z`;
  const last = points[points.length - 1] || [pad, height - pad];
  const zeroY = height - pad;
  const gradId = `grad-${uniqueId}`;

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="invest-sparkline" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="${pad}" y1="${zeroY}" x2="${width - pad}" y2="${zeroY}" stroke="var(--color-text-muted)" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>
      <path d="${areaPath}" fill="url(#${gradId})"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4" fill="${color}"/>
    </svg>
  `;
}

// Donut com % no centro — reutilizável (widget meta + cards com meta)
function renderDonutSVG(pct, color = 'var(--color-primary)', size = 'md') {
  const radius = 36;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  return `
    <div class="invest-donut-wrapper invest-donut-${size}">
      <svg viewBox="0 0 100 100" class="invest-donut" aria-hidden="true">
        <circle cx="50" cy="50" r="${radius}" fill="none" stroke="var(--color-surface-alt)" stroke-width="${stroke}"/>
        <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke}"
          stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}"
          stroke-linecap="round"
          transform="rotate(-90 50 50)"/>
      </svg>
      <div class="invest-donut-center">
        <span class="invest-donut-pct${pct > 100 ? ' invest-donut-pct--over' : ''}">${fmtPct(pct)}</span>
      </div>
    </div>
  `;
}

// -----------------------------
// View: Tabela
// -----------------------------
function renderTable(projetos) {
  const rows = projetos.map((p) => {
    const realizado = calcRealizado(p.id);
    const previstoMes = calcPrevistoMes(p.id);
    const subsCount = cachedSubcategorias.filter((s) => s.projeto_id === p.id).length;
    const meta = Number(p.meta_valor) || 0;
    const pct = meta > 0 ? Math.min(100, (realizado / meta) * 100) : null;
    const termino = p.data_alvo ? formatDateBR(p.data_alvo) : '<span class="text-muted">—</span>';
    const metaCell = meta > 0 ? formatCurrencyHTML(meta, 'BRL') : '<span class="text-muted">—</span>';
    const pctCell = pct !== null
      ? `<span class="projeto-tabela-pct" style="--projeto-cor: ${p.cor};">
           <span class="projeto-tabela-pct-bar"><span class="projeto-tabela-pct-fill" style="width: ${pct}%;"></span></span>
           <span class="projeto-tabela-pct-text">${pct.toFixed(0)}%</span>
         </span>`
      : '<span class="text-muted">—</span>';
    return `
      <tr class="projeto-tabela-row" data-id="${p.id}">
        <td>
          <span class="projeto-tabela-nome">
            <span class="projeto-tabela-dot" style="background: ${p.cor};"></span>
            ${escapeHtml(p.nome)}
          </span>
        </td>
        <td data-col="status">
          <span class="projeto-card-status status-${p.status}">${STATUS_LABELS[p.status] || p.status}</span>
          ${(p.status === ST_INV_CONCLUIDO || p.status === ST_INV_ARQUIVADO) && meta > 0 && realizado < meta ? `<span class="tag-parcial" title="Encerrado antes de atingir a meta">Parcial</span>` : ''}
          ${(() => {
            const ab = calcularBadgeAtraso(p, p.status, 'investimento');
            return ab ? `<span class="div-card-badge" style="color:${ab.color};background:transparent;border:1px solid ${ab.color}40;margin-left:4px;">⚠ ${ab.label}</span>` : '';
          })()}
        </td>
        <td data-col="realizado" class="text-right tabular text-bold">${formatCurrencyHTML(realizado, 'BRL')}</td>
        <td data-col="previsto-mes" class="text-right tabular">${formatCurrencyHTML(previstoMes, 'BRL')}</td>
        <td data-col="meta" class="text-right tabular">${metaCell}</td>
        <td data-col="pct-meta">${pctCell}</td>
        <td data-col="termino" class="tabular">${termino}</td>
        <td data-col="compromissos" class="text-right tabular">${subsCount}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="projetos-tabela-wrapper">
      <table class="projetos-tabela">
        <thead>
          <tr>
            <th>Projeto</th>
            <th data-col="status">Status</th>
            <th data-col="realizado" class="text-right">Realizado</th>
            <th data-col="previsto-mes" class="text-right">Previsto este mês</th>
            <th data-col="meta" class="text-right">Meta</th>
            <th data-col="pct-meta">% Meta</th>
            <th data-col="termino">Término</th>
            <th data-col="compromissos" class="text-right">Compromissos</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// -----------------------------
// View: Timeline (Gantt) — zoom configurável
// -----------------------------

// Calcula range e colunas baseado no zoom selecionado.
// Retorna: { start: Date, end: Date, columns: [{label, sublabel?, isCurrent}] }
function getTimelineRange(zoom) {
  const MES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  if (zoom === 'mes') {
    // 12 meses começando no mês atual — coluna = mês
    const start = new Date(viewYear, viewMonth, 1);
    const end = new Date(viewYear, viewMonth + 12, 0);
    const columns = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(viewYear, viewMonth + i, 1);
      columns.push({
        label: MES_LABELS[d.getMonth()],
        sublabel: String(d.getFullYear()).slice(2),
        isCurrent: d.getFullYear() === viewYear && d.getMonth() === viewMonth,
      });
    }
    return { start, end, columns };
  }

  if (zoom === 'ano') {
    // Jan–Dez do ano atual — coluna = mês
    const start = new Date(viewYear, 0, 1);
    const end = new Date(viewYear, 12, 0);
    const columns = [];
    for (let i = 0; i < 12; i++) {
      columns.push({
        label: MES_LABELS[i],
        sublabel: String(viewYear).slice(2),
        isCurrent: i === viewMonth,
      });
    }
    return { start, end, columns };
  }

  if (zoom === '5anos') {
    // Ano atual + 4 — coluna = ano
    const start = new Date(viewYear, 0, 1);
    const end = new Date(viewYear + 5, 0, 0);
    const columns = [];
    for (let i = 0; i < 5; i++) {
      columns.push({
        label: String(viewYear + i),
        isCurrent: i === 0,
      });
    }
    return { start, end, columns };
  }

  // 10anos — ano atual + 9 — coluna = ano
  const start = new Date(viewYear, 0, 1);
  const end = new Date(viewYear + 10, 0, 0);
  const columns = [];
  for (let i = 0; i < 10; i++) {
    columns.push({
      label: String(viewYear + i),
      isCurrent: i === 0,
    });
  }
  return { start, end, columns };
}

function renderTimeline(projetos) {
  const { start: rangeStart, end: rangeEnd, columns } = getTimelineRange(timelineZoom);
  const rangeMs = rangeEnd - rangeStart;

  // Zoom selector
  const zoomBtns = [
    { id: 'mes',    label: 'Mês'     },
    { id: 'ano',    label: 'Ano'     },
    { id: '5anos',  label: '5 anos'  },
    { id: '10anos', label: '10 anos' },
  ].map((z) => `
    <button class="timeline-zoom-btn ${timelineZoom === z.id ? 'active' : ''}" data-timeline-zoom="${z.id}" type="button">${z.label}</button>
  `).join('');

  // Header das colunas
  const colHeaders = columns.map((c) =>
    `<div class="timeline-month ${c.isCurrent ? 'timeline-month-current' : ''}">${c.label}${c.sublabel ? `<span class="timeline-month-year">${c.sublabel}</span>` : ''}</div>`
  ).join('');

  // Linha "Hoje" — posicionada proporcionalmente
  const todayPct = Math.min(100, Math.max(0, ((today - rangeStart) / rangeMs) * 100));
  const todayLine = (today >= rangeStart && today <= rangeEnd)
    ? `<div class="timeline-today" style="left: calc(220px + (100% - 220px) * ${todayPct / 100});" title="Hoje"></div>`
    : '';

  // Barras dos projetos
  const bars = projetos.map((p) => {
    const created = p.data_inicio ? new Date(p.data_inicio) : (p.created_at ? new Date(p.created_at) : rangeStart);
    const projStart = created < rangeStart ? rangeStart : created;
    const projEnd = p.data_alvo ? new Date(p.data_alvo + 'T23:59:59') : rangeEnd;
    const clampedEnd = projEnd > rangeEnd ? rangeEnd : projEnd;

    const realizado = calcRealizado(p.id);
    const meta = Number(p.meta_valor) || 0;
    const fillPct = meta > 0 ? Math.min(100, (realizado / meta) * 100) : 0;

    if (projStart > rangeEnd || clampedEnd < rangeStart) {
      return `
        <div class="timeline-row" data-id="${p.id}">
          <div class="timeline-row-label">
            <span class="timeline-row-dot" style="background: ${p.cor};"></span>
            <span class="timeline-row-name">${escapeHtml(p.nome)}</span>
          </div>
          <div class="timeline-row-track">
            <div class="timeline-row-empty">Fora do range visível</div>
          </div>
        </div>
      `;
    }

    const leftPct = Math.max(0, ((projStart - rangeStart) / rangeMs) * 100);
    const widthPct = Math.max(1.5, ((clampedEnd - projStart) / rangeMs) * 100);

    const fillBar = meta > 0
      ? `<span class="timeline-bar-fill" style="width: ${fillPct}%; background: ${p.cor};"></span>`
      : '';

    const pctLeft  = meta > 0 ? Math.min(fillPct, 82).toFixed(1) : '4';
    const pctLabel = meta > 0 ? `${fillPct.toFixed(0)}%` : '—';
    const tooltipText = `${p.nome} · ${formatCurrency(realizado, 'BRL')}${meta > 0 ? ` / ${formatCurrency(meta, 'BRL')} (${fillPct.toFixed(0)}%)` : ''}`;

    return `
      <div class="timeline-row" data-id="${p.id}">
        <div class="timeline-row-label">
          <span class="timeline-row-dot" style="background: ${p.cor};"></span>
          <span class="timeline-row-name">${escapeHtml(p.nome)}</span>
        </div>
        <div class="timeline-row-track">
          <div class="timeline-bar" style="left: ${leftPct}%; width: ${widthPct}%; --projeto-cor: ${p.cor};" title="${escapeHtml(tooltipText)}">
            ${fillBar}
            <span class="timeline-bar-pct" style="left:${pctLeft}%;">${pctLabel}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const colCount = columns.length;
  return `
    <div class="timeline-toolbar">
      <span class="timeline-toolbar-label">Escala:</span>
      <div class="timeline-zoom-group">${zoomBtns}</div>
    </div>
    <div class="timeline-wrapper" style="--timeline-cols: ${colCount};">
      <div class="timeline-header">
        <div class="timeline-row-label timeline-row-label-header">Projeto</div>
        <div class="timeline-months">${colHeaders}</div>
      </div>
      <div class="timeline-body">
        ${bars || '<div class="empty-state"><p class="empty-state-message">Nenhum projeto no range visível.</p></div>'}
        ${todayLine}
      </div>
    </div>
  `;
}

// Listener pra trocar zoom — delegado em document, vive entre re-renders
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-timeline-zoom]');
  if (!btn) return;
  timelineZoom = btn.dataset.timelineZoom;
  if (viewMode === 'timeline') render();
});

function bindBlocoToggles(storageKey, containerId) {
  document.querySelectorAll(`#${containerId} .bloco-section-header`).forEach((header) => {
    header.addEventListener('click', () => {
      const section = header.closest('.bloco-section');
      const blocoId = section.dataset.bloco;
      section.classList.toggle('bloco-collapsed');
      let collapsed;
      try { collapsed = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch { collapsed = new Set(); }
      if (section.classList.contains('bloco-collapsed')) collapsed.add(blocoId);
      else collapsed.delete(blocoId);
      localStorage.setItem(storageKey, JSON.stringify([...collapsed]));
    });
  });
}

function bindCardClicks() {
  document.querySelectorAll('.projeto-card, .projeto-tabela-row, .timeline-row').forEach((el) => {
    el.addEventListener('click', (e) => {
      // Don't open details if the "+ Aporte" button was clicked
      if (e.target.closest('.proj-btn-aporte')) return;
      // Badge "Configurar compromisso" abre o modal de edição direto
      if (e.target.closest('.proj-btn-editar')) return;
      openDetailsModal(el.dataset.id);
    });
  });
  document.querySelectorAll('.proj-btn-aporte').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openHistoricoInvestModal(btn.dataset.id);
    });
  });
  document.querySelectorAll('.proj-btn-editar').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const proj = cachedProjetos.find((p) => p.id === btn.dataset.id);
      if (proj) openProjetoModal(proj);
    });
  });
}

// -----------------------------
// Cálculos
// -----------------------------
function calcRealizado(projetoId) {
  const proj = cachedProjetos.find((p) => p.id === projetoId);
  if (!proj) return 0;
  let total = Number(proj.saldo_inicial) || 0;

  const subIds = cachedSubcategorias.filter((s) => s.projeto_id === projetoId).map((s) => s.id);
  for (const p of cachedPagamentos) {
    if (!subIds.includes(p.subcategoria_id)) continue;
    total += Number(p.valor_real) || 0;
  }
  for (const a of cachedAportes) {
    if (a.projeto_id !== projetoId) continue;
    total += Number(a.valor) || 0;
  }
  return total;
}

function calcPrevistoMes(projetoId) {
  const subIds = cachedSubcategorias.filter((s) => s.projeto_id === projetoId).map((s) => s.id);
  let total = 0;
  for (const e of cachedOrcamento) {
    if (!subIds.includes(e.subcategoria_id)) continue;
    total += Number(e.valor_previsto) || 0;
  }
  return total;
}

// -----------------------------
// Seção "Criar compromisso" dentro do modal do projeto
// -----------------------------
function updateCreateDayFields(periodo) {
  const diaMesField    = document.getElementById('proj-comp-dia-mes-field');
  const diaSemanaField = document.getElementById('proj-comp-dia-semana-field');
  if (!diaMesField || !diaSemanaField) return;
  const showDiaMes    = ['Mensal', 'Anual'].includes(periodo);
  const showDiaSemana = ['Semanal', 'Quinzenal'].includes(periodo);
  diaMesField.classList.toggle('hidden', !showDiaMes);
  diaSemanaField.classList.toggle('hidden', !showDiaSemana);
}

function populateCreateCompSection(sub = null) {
  const selPeriodo = document.getElementById('proj-comp-periodo');
  if (!selPeriodo) return;
  const periodo = sub?.periodo || 'Mensal';
  selPeriodo.innerHTML = PERIODOS.map((p) => `<option value="${p.value}">${p.label}</option>`).join('');
  selPeriodo.value = periodo;
  selPeriodo.onchange = () => updateCreateDayFields(selPeriodo.value);
  updateCreateDayFields(periodo);

  const selDiaSemana = document.getElementById('proj-comp-dia-semana');
  if (selDiaSemana) {
    selDiaSemana.innerHTML = DIAS_SEMANA.map((d) => `<option value="${d.value}">${d.label}</option>`).join('');
    if (sub?.dia_semana != null) selDiaSemana.value = String(sub.dia_semana);
  }

  const inputDiaMes = document.getElementById('proj-comp-dia-mes');
  if (inputDiaMes) inputDiaMes.value = sub?.vencimento_dia || '';

  const selTipoPag = document.getElementById('proj-comp-tipo-pag');
  if (selTipoPag) {
    selTipoPag.innerHTML = TIPOS_PAGAMENTO.map((tp) => `<option value="${tp}">${tp}</option>`).join('');
    if (sub?.tipo_pagamento) selTipoPag.value = sub.tipo_pagamento;
  }

  const selMoeda = document.getElementById('proj-comp-moeda');
  if (selMoeda) selMoeda.innerHTML = renderMoedaOptions(sub?.moeda || 'BRL');

  const chkVarVal = document.getElementById('proj-comp-valor-variavel');
  const valorRow  = document.getElementById('proj-comp-valor-row');
  if (chkVarVal && valorRow) {
    chkVarVal.checked = Boolean(sub?.valor_variavel);
    valorRow.classList.toggle('hidden', chkVarVal.checked);
    chkVarVal.onchange = () => valorRow.classList.toggle('hidden', chkVarVal.checked);
  }

  const inputValor = document.getElementById('proj-comp-valor');
  if (inputValor && sub?.valor_base != null) {
    inputValor.value = formatDecimal(Number(sub.valor_base), 2);
  }
}

// -----------------------------
// Modal: criar / editar
// -----------------------------
function openProjetoModal(p = null, prefill = null) {
  editingId = p?.id || null;
  document.getElementById('modal-projeto-title').textContent = p ? 'Editar projeto' : 'Novo projeto';
  document.getElementById('btn-salvar-projeto').textContent = p ? 'Salvar alterações' : 'Salvar';

  document.getElementById('form-projeto').reset();
  document.getElementById('proj-nome').value          = p?.nome || '';
  document.getElementById('proj-descricao').value     = p?.descricao || '';
  const initialCor = p?.cor || DEFAULT_COLOR;
  const corPickerEl = document.getElementById('proj-cor-picker');
  const activeCor = renderColorPicker(corPickerEl, initialCor);
  document.getElementById('proj-cor').value = activeCor;
  // Popula opções dinamicamente (taxonomia unificada)
  document.getElementById('proj-status').innerHTML = renderStatusOptions('investimento', p?.status);
  document.getElementById('proj-status').value        = p?.status || ST_INV_SEM_META;
  updateStatusDescProj();
  document.getElementById('proj-data-inicio').value   = p?.data_inicio || '';
  document.getElementById('proj-meta-valor').value    = p?.meta_valor ?? (prefill?.meta_valor ?? '');
  document.getElementById('proj-data-alvo').value     = p?.data_alvo || (prefill?.data_alvo || '');
  document.getElementById('proj-saldo-inicial').value = p?.saldo_inicial ?? (prefill?.saldo_inicial ?? '');
  document.getElementById('proj-inclui-patrimonio').checked = Boolean(p?.inclui_no_patrimonio);

  initContatoPickerOnce();
  contatoPicker?.setValue(p?.contato_id || '');

  initCompContaPickerOnce();

  // Seção "Criar compromisso vinculado"
  const toggleWrap   = document.getElementById('proj-compromisso-toggle-wrap');
  const compFields   = document.getElementById('proj-compromisso-fields');
  const compCheckbox = document.getElementById('proj-criar-compromisso');
  const compValor    = document.getElementById('proj-comp-valor');
  const compData     = document.getElementById('proj-comp-data');
  const compCategSel = document.getElementById('proj-comp-categoria');

  // Compromisso do grupo investimentos vinculado a este projeto (auto-criado)
  const investSub = editingId
    ? cachedSubcategorias.find((s) => s.projeto_id === editingId && s.categorias?.grupo === 'investimentos')
    : null;
  const temCompromisso = Boolean(investSub);

  // Seção unificada de compromisso — criar ou editar
  toggleWrap.classList.remove('hidden');
  // Edição com compromisso existente: marcado (mostra os campos para editar)
  // Edição sem compromisso: desmarcado (opt-in para criar)
  // Criação: marcado se houver prefill de aporte
  compCheckbox.checked = temCompromisso || !!prefill?.aporte_mensal;
  compFields.classList.toggle('hidden', !compCheckbox.checked);

  populateCreateCompSection(investSub || null);

  // Data de início: usa data do sub existente se disponível, senão hoje
  if (!investSub) {
    compValor.value = prefill?.aporte_mensal != null ? formatDecimal(prefill.aporte_mensal, 2) : '';
  }
  compData.value = investSub?.iniciado_em?.split('T')[0] || todayISODate();

  // Conta de pagamento — pré-preenche se houver sub existente
  compContaPicker?.setValue(investSub?.conta_id || '');

  // Label e hint dinâmicos
  const compLabel = document.getElementById('proj-comp-label');
  const compHint  = document.getElementById('proj-comp-hint');
  if (compLabel) compLabel.innerHTML = '<strong>Compromisso recorrente vinculado</strong>';
  if (compHint) {
    compHint.textContent = temCompromisso
      ? 'Editando compromisso existente. Salve para aplicar as alterações.'
      : 'Criar novo compromisso recorrente vinculado a este projeto.';
  }

  // Categoria: oculta quando há sub existente (categoria não muda na edição)
  const compCategWrap = document.getElementById('proj-comp-categoria-wrap');
  if (compCategWrap) compCategWrap.classList.toggle('hidden', temCompromisso);

  // Popula categorias do grupo investimentos (para criação)
  compCategSel.innerHTML = '';
  if (cachedCategoriasInvest.length === 0) {
    compCategSel.innerHTML = '<option value="">Nenhuma categoria do grupo Investimentos encontrada</option>';
  } else {
    cachedCategoriasInvest.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome;
      compCategSel.appendChild(opt);
    });
    const padrao = cachedCategoriasInvest.find((c) => /^investimentos?$/i.test(c.nome));
    if (padrao) compCategSel.value = padrao.id;
  }

  // Seção "Custos vinculados" — só em modo edição
  const custosWrap = document.getElementById('proj-custos-vinculados-wrap');
  if (custosWrap) {
    custosWrap.classList.toggle('hidden', !editingId);
    if (editingId) renderProjCustosVinculados(editingId);
  }

  openModal('modal-projeto');
}

async function renderProjCustosVinculados(projetoId) {
  const list = document.getElementById('proj-custos-vinculados-list');
  const sel  = document.getElementById('proj-vincular-sub-select');
  if (!list || !sel) return;

  // Subs já vinculadas (custo_vida → este projeto)
  const linked = cachedSubcategorias.filter((s) => s.projeto_id === projetoId && s.categorias?.grupo === 'custo_vida');
  list.innerHTML = linked.length
    ? linked.map((s) => `<li class="custos-edit-item">
        <span class="custos-edit-item-nome">${escapeHtml(s.nome)}</span>
        <span class="custos-edit-item-valor">${formatCurrencyHTML(Number(s.valor_base) || 0, 'BRL')}</span>
        <button type="button" class="btn-desvincular-sub" data-sub-id="${s.id}" aria-label="Desvincular ${escapeHtml(s.nome)}">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </button>
      </li>`).join('')
    : '<li class="custos-edit-empty">Use o seletor abaixo para vincular um compromisso de Custo de Vida a este projeto.</li>';

  // Listener para desvincular
  list.querySelectorAll('.btn-desvincular-sub').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const subId = btn.dataset.subId;
      const { error } = await supabase.from('subcategorias').update({ projeto_id: null }).eq('id', subId);
      if (error) { showToast('Erro ao desvincular: ' + error.message, 'error'); return; }
      const sub = cachedSubcategorias.find((s) => s.id === subId);
      if (sub) sub.projeto_id = null;
      renderProjCustosVinculados(projetoId);
      render();
    });
  });

  // Popula picker com subs custo_vida sem vínculo (busca ao vivo)
  const { data: availSubs } = await supabase
    .from('subcategorias')
    .select('id, nome, categorias(grupo)')
    .is('projeto_id', null)
    .eq('status', 'ativa')
    .order('nome');
  const custoVidaSubs = (availSubs || []).filter((s) => s.categorias?.grupo === 'custo_vida');
  sel.innerHTML = ['<option value="">+ Vincular compromisso de Custo de Vida…</option>',
    ...custoVidaSubs.map((s) => `<option value="${s.id}">${escapeHtml(s.nome)}</option>`)
  ].join('');
}

function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function saveProjeto(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-salvar-projeto');

  const nome = document.getElementById('proj-nome').value.trim();
  if (!nome) { showToast(t('investimentos.validacao.nome_obrigatorio', 'Informe o nome do projeto'), 'error'); return; }

  // Duplicate name check (only on create)
  if (!editingId) {
    const nomeNorm = nome.toLowerCase().trim();
    const dup = cachedProjetos.find((p) => (p.nome || '').toLowerCase().trim() === nomeNorm);
    if (dup) {
      showToast(`Já existe um projeto com o nome "${nome}". Escolha um nome diferente.`, 'error', 6000);
      return;
    }
  }

  const payload = {
    nome,
    descricao:   document.getElementById('proj-descricao').value.trim() || null,
    cor:         document.getElementById('proj-cor').value,
    status:      document.getElementById('proj-status').value,
    meta_valor:  parseUserNumber(document.getElementById('proj-meta-valor').value) || null,
    data_inicio: document.getElementById('proj-data-inicio').value || null,
    data_alvo:   document.getElementById('proj-data-alvo').value || null,
    saldo_inicial: parseUserNumber(document.getElementById('proj-saldo-inicial').value) || 0,
    contato_id:  contatoPicker?.getValue() || null,
    inclui_no_patrimonio: document.getElementById('proj-inclui-patrimonio').checked,
  };

  // Compromisso vinculado: disponível em criação E edição
  const wantCompromisso = document.getElementById('proj-criar-compromisso').checked;
  // Sub existente do grupo investimentos no cache — usado só para validação de categoria.
  // A busca definitiva (UPDATE vs CREATE) é feita via DB no save para evitar duplicatas por cache stale.
  const investSubCached = editingId
    ? cachedSubcategorias.find((s) => s.projeto_id === editingId && s.categorias?.grupo === 'investimentos')
    : null;
  let compromissoData = null;
  if (wantCompromisso) {
    const valorVariavel = document.getElementById('proj-comp-valor-variavel').checked;
    const valor         = valorVariavel ? 0 : (parseDecimal(document.getElementById('proj-comp-valor').value) || 0);
    const periodo       = document.getElementById('proj-comp-periodo').value;
    const dataInicio    = document.getElementById('proj-comp-data').value;
    // Quando editando sub existente, categoria não muda — usa a da sub
    const categoria     = investSubCached?.categoria_id || document.getElementById('proj-comp-categoria').value;
    const tipoPagamento = document.getElementById('proj-comp-tipo-pag').value || 'Boleto';
    const moeda         = document.getElementById('proj-comp-moeda').value || 'BRL';
    const contaId       = compContaPicker?.getValue() || null;
    const diaMes        = parseInt(document.getElementById('proj-comp-dia-mes').value) || null;
    const diaSemana     = parseInt(document.getElementById('proj-comp-dia-semana').value);
    const vencDia       = ['Mensal', 'Anual'].includes(periodo)
      ? (diaMes || (dataInicio ? parseInt(dataInicio.split('-')[2]) : 1))
      : null;

    if (!valorVariavel && (!valor || valor <= 0)) { showToast(t('investimentos.validacao.aporte_obrigatorio', 'Informe o valor do aporte do compromisso'), 'error'); return; }
    if (!dataInicio)  { showToast(t('investimentos.validacao.data_aporte_obrigatoria', 'Informe a data do primeiro aporte'), 'error'); return; }
    if (!investSubCached && !categoria) { showToast(t('investimentos.validacao.categoria_obrigatoria', 'Selecione uma categoria para o compromisso'), 'error'); return; }

    compromissoData = { valor, periodo, dataInicio, categoria_id: categoria, tipoPagamento, moeda, contaId, diaMes, diaSemana, vencDia, valorVariavel };
  }

  const labelOriginal = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    let response;
    let user = null;
    if (editingId) {
      response = await supabase.from('projetos_investimento').update(payload).eq('id', editingId).select().single();
      // Em "Configurar compromisso" precisamos do user pra criar a subcategoria
      if (wantCompromisso) user = await getCurrentUser();
    } else {
      user = await getCurrentUser();
      if (!user) throw new Error('Sessão expirada');
      response = await supabase.from('projetos_investimento').insert({ ...payload, user_id: user.id, workspace_id: requireWorkspaceId(), created_by: user.id }).select().single();
    }
    if (response.error) throw response.error;

    // Compromisso vinculado — criar ou atualizar
    if (wantCompromisso && compromissoData) {
      const projetoId = editingId || response.data?.id;
      // Busca sub vinculada DIRETO no DB (não confia em cache que pode estar stale após criação via Compromissos)
      const { data: subsLinkadas } = await supabase
        .from('subcategorias')
        .select('id, valor_base, categoria_id, categorias(grupo)')
        .eq('projeto_id', projetoId)
        .order('created_at', { ascending: true });
      const investSubDb = (subsLinkadas || []).find((s) => s.categorias?.grupo === 'investimentos');

      if (investSubDb) {
        // Atualiza sub existente. Força status='ativa' — se a sub estava arquivada/inativa
        // (cenário: user arquivou o compromisso depois e agora está editando o projeto pra
        // reativá-lo), o UPDATE deve reativar pra que o ensurePagamentosForMonth gere pagamentos.
        const subPayload = {
          periodo:        compromissoData.periodo,
          tipo_pagamento: compromissoData.tipoPagamento,
          conta_id:       compromissoData.contaId,
          valor_variavel: compromissoData.valorVariavel,
          valor_base:     compromissoData.valorVariavel ? investSubDb.valor_base : compromissoData.valor,
          moeda:          compromissoData.moeda,
          vencimento_dia: ['Mensal', 'Anual'].includes(compromissoData.periodo) ? compromissoData.vencDia : null,
          dia_semana:     ['Semanal', 'Quinzenal'].includes(compromissoData.periodo) ? compromissoData.diaSemana : null,
          iniciado_em:    compromissoData.dataInicio,
          status:         'ativa',
        };
        const { error: subErr } = await supabase.from('subcategorias').update(subPayload).eq('id', investSubDb.id);
        if (subErr) console.warn('[update compromisso investimento]', subErr);

        // Apaga pagamentos pendentes (não pagos) — serão regenerados pelo ensurePagamentosForMonth
        // na próxima visita à página Pagamentos, com a nova config (data de vencimento, valor, etc.)
        const { error: delErr } = await supabase
          .from('pagamentos')
          .delete()
          .eq('subcategoria_id', investSubDb.id)
          .in('status', ['A Pagar', 'A Transferir']);
        if (delErr) console.warn('[regen pagamentos]', delErr);

        // Limpa orcamento_geral de meses antes da nova data de início.
        // Sem isso, a aba de orçamento continua mostrando entradas do mês antigo
        // até o usuário visitar aquele mês (o lazy-cleanup só roda ao abrir o mês).
        const newMesAno = compromissoData.dataInicio.slice(0, 7); // 'YYYY-MM'
        const { error: delOrcErr } = await supabase
          .from('orcamento_geral')
          .delete()
          .eq('subcategoria_id', investSubDb.id)
          .lt('mes_ano', newMesAno)
          .is('cambio_travado', null);
        if (delOrcErr) console.warn('[regen orcamento_geral]', delOrcErr);

        showToast(t('investimentos.toast.atualizado', 'Projeto atualizado'), 'success');
      } else if (user) {
        // Nenhuma sub vinculada — cria
        try {
          await ensureSubcategoriaForProjeto(projetoId, user.id, payload.nome, compromissoData, true);
          showToast(
            editingId
              ? 'Projeto atualizado — compromisso criado e vinculado'
              : t('investimentos.toast.criado_com_compromisso', 'Projeto salvo e compromisso vinculado'),
            'success'
          );
        } catch (err) {
          console.warn('[ensureSubcategoriaForProjeto]', err);
          showToast('Projeto salvo, mas falhou ao criar compromisso: ' + (err?.message || String(err)), 'error', 10000);
        }
      }
    } else if (!editingId && response.data?.id && user) {
      // Criação sem compromisso — cria link vazio
      await ensureBareLinkForProjeto(response.data.id, user.id, payload);
      showToast(t('investimentos.toast.criado', 'Projeto criado'), 'success');
    } else {
      showToast(
        editingId
          ? t('investimentos.toast.atualizado', 'Projeto atualizado')
          : t('investimentos.toast.criado', 'Projeto criado'),
        'success'
      );
    }

    closeModal('modal-projeto');
    editingId = null;
    await loadAll();
    render();
  } catch (err) {
    showToast('Erro ao salvar: ' + (err?.message || JSON.stringify(err)), 'error', 8000);
  } finally {
    btn.disabled = false;
    btn.textContent = labelOriginal;
  }
}

// -----------------------------
// Auto-criar subcategoria vinculada ao projeto de investimento
// (espelha ensureSubcategoriaForDivida em dividas.js)
// -----------------------------
async function ensureSubcategoriaForProjeto(projetoId, userId, nomeProjeto, comp, _force = false) {
  // SEMPRE checa duplicata no DB antes de inserir — previne criação dupla mesmo com force=true,
  // pois a única razão pra criar é quando não existe sub vinculada
  const { data: existing, error: existErr } = await supabase
    .from('subcategorias')
    .select('id, categorias(grupo)')
    .eq('projeto_id', projetoId);
  if (existErr) throw existErr;
  const existingInvest = (existing || []).find((s) => s.categorias?.grupo === 'investimentos');
  if (existingInvest) return; // já existe — não duplica

  const periodo  = comp.periodo || 'Mensal';
  const [, , diaStr] = (comp.dataInicio || '').split('-');
  const defaultDia = parseInt(diaStr) || 1;
  const vencDia  = comp.vencDia != null
    ? comp.vencDia
    : (['Mensal', 'Anual'].includes(periodo) ? defaultDia : null);
  const diaSemana = ['Semanal', 'Quinzenal'].includes(periodo)
    ? (comp.diaSemana ?? null)
    : null;

  const { error: insErr } = await supabase.from('subcategorias').insert({
    user_id:        userId,
    workspace_id:   requireWorkspaceId(),
    created_by:     userId,
    nome:           nomeProjeto,
    tipo:           'Despesa',
    categoria_id:   comp.categoria_id,
    projeto_id:     projetoId,
    tipo_pagamento: comp.tipoPagamento || 'Boleto',
    conta_id:       comp.contaId || null,
    vencimento_dia: vencDia,
    dia_semana:     diaSemana,
    periodo:        periodo,
    iniciado_em:    comp.dataInicio,
    moeda:          comp.moeda || 'BRL',
    valor_base:     comp.valorVariavel ? 0 : (comp.valor || 0),
    valor_variavel: Boolean(comp.valorVariavel),
    status:         'ativa',
    descricao:      `Auto-criado para o projeto de investimento "${nomeProjeto}"`,
  });
  if (insErr) throw insErr;
}

/**
 * Vincula ou cria um compromisso placeholder para um projeto sem configuração de aporte.
 * Idempotente. Se já existe sub sem projeto_id com o mesmo nome, linka ela em vez de criar nova.
 */
async function ensureBareLinkForProjeto(projetoId, userId, proj) {
  // Já existe sub vinculada a este projeto?
  const { data: existing } = await supabase.from('subcategorias')
    .select('id').eq('projeto_id', projetoId).limit(1);
  if (existing && existing.length > 0) return;

  // Usa a categoria padrão de Investimentos
  const catInvest = cachedCategoriasInvest.find((c) => /^investimentos?$/i.test(c.nome))
    || cachedCategoriasInvest[0];
  if (!catInvest) return;

  // Se já existe sub com mesmo nome sem vínculo, apenas linka — não duplica
  const { data: unlinked } = await supabase.from('subcategorias')
    .select('id')
    .eq('categoria_id', catInvest.id)
    .eq('nome', proj.nome)
    .is('projeto_id', null)
    .limit(1);
  if (unlinked && unlinked.length > 0) {
    await supabase.from('subcategorias').update({ projeto_id: projetoId }).eq('id', unlinked[0].id);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('subcategorias').insert({
    user_id:        userId,
    workspace_id:   requireWorkspaceId(),
    created_by:     userId,
    nome:           proj.nome,
    tipo:           'Despesa',
    categoria_id:   catInvest.id,
    projeto_id:     projetoId,
    tipo_pagamento: 'Boleto',
    vencimento_dia: 1,
    periodo:        'Mensal',
    iniciado_em:    today,
    moeda:          'BRL',
    valor_base:     0,
    valor_variavel: false,
    status:         'ativa',
  });
  if (error) console.warn('[ensureBareLinkForProjeto]', error);
}

// -----------------------------
// Modal: detalhes (histórico)
// -----------------------------
function openDetailsModal(id) {
  detailsId = id;
  const p = cachedProjetos.find((x) => x.id === id);
  if (!p) return;

  document.getElementById('proj-details-title').textContent = p.nome;

  // Resumo
  const realizado = calcRealizado(id);
  const previsto  = calcPrevistoMes(id);
  const meta = Number(p.meta_valor) || 0;
  const pctMeta = meta > 0 ? Math.min(100, (realizado / meta) * 100) : 0;

  document.getElementById('proj-details-resumo').innerHTML = `
    <div class="proj-details-resumo-grid">
      <div class="proj-details-stat">
        <span class="proj-details-stat-label">Realizado</span>
        <span class="proj-details-stat-value">${formatCurrencyHTML(realizado, 'BRL')}</span>
        ${p.saldo_inicial ? `<span class="proj-details-stat-sub">Inclui saldo inicial: ${formatCurrencyHTML(Number(p.saldo_inicial), 'BRL')}</span>` : ''}
      </div>
      <div class="proj-details-stat">
        <span class="proj-details-stat-label">Previsto este mês</span>
        <span class="proj-details-stat-value">${formatCurrencyHTML(previsto, 'BRL')}</span>
      </div>
      ${meta > 0 ? `
        <div class="proj-details-stat">
          <span class="proj-details-stat-label">Meta</span>
          <span class="proj-details-stat-value">${formatCurrencyHTML(meta, 'BRL')}</span>
          <span class="proj-details-stat-sub">${pctMeta.toFixed(0)}% alcançado</span>
        </div>
      ` : ''}
      ${p.data_alvo ? `
        <div class="proj-details-stat">
          <span class="proj-details-stat-label">Término do projeto</span>
          <span class="proj-details-stat-value">${formatDateBR(p.data_alvo)}</span>
        </div>
      ` : ''}
    </div>
    ${p.descricao ? `<p class="proj-details-desc">${escapeHtml(p.descricao)}</p>` : ''}
  `;

  // Subs atreladas
  const subs = cachedSubcategorias.filter((s) => s.projeto_id === id);
  const totalSubs = subs.reduce((acc, s) => acc + (Number(s.valor_base) || 0), 0);
  document.getElementById('proj-details-subs').innerHTML = `
    <h3 class="proj-details-section-title">Compromissos atrelados (${subs.length})</h3>
    ${subs.length === 0
      ? '<div class="proj-details-empty">Nenhum compromisso atrelado a este projeto ainda. Edite um compromisso de investimento e selecione esse projeto.</div>'
      : `<div class="proj-details-subs-list">${subs.map((s) => `
          <div class="proj-details-sub-row">
            <span class="proj-details-sub-name">${escapeHtml(s.apelido?.trim() || s.nome)}</span>
            <span class="proj-details-sub-valor">${formatCurrencyHTML(Number(s.valor_base) || 0, s.moeda || 'BRL')}</span>
          </div>
        `).join('')}
        <div class="proj-details-sub-row proj-details-sub-total">
          <span class="proj-details-sub-name">Total</span>
          <span class="proj-details-sub-valor">${formatCurrencyHTML(totalSubs, 'BRL')}</span>
        </div>
      </div>`
    }
  `;

  // Histórico — pagamentos efetivados + aportes manuais, ordenados por data desc
  const subIds = subs.map((s) => s.id);
  const allEntries = [
    ...cachedPagamentos
      .filter((pag) => subIds.includes(pag.subcategoria_id))
      .map((pag) => ({
        date: pag.data_vencimento || '',
        label: pag.subcategorias?.apelido?.trim() || pag.subcategorias?.nome || '—',
        value: Number(pag.valor_real) || 0,
        tag: `<span class="proj-hist-status">${pag.status}</span>`,
        cls: '',
      })),
    ...cachedAportes
      .filter((a) => a.projeto_id === id)
      .map((a) => ({
        date: a.data || '',
        label: a.descricao || 'Aporte manual',
        value: Number(a.valor) || 0,
        tag: '<span class="proj-hist-tag">Aporte</span>',
        cls: 'proj-hist-row-aporte',
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const histRowsHtml = [];
  if (Number(p.saldo_inicial) > 0) {
    histRowsHtml.push(`
      <div class="proj-hist-row proj-hist-row-saldo">
        <span class="proj-hist-date">—</span>
        <span class="proj-hist-name">Saldo inicial</span>
        <span class="proj-hist-value">${formatCurrencyHTML(Number(p.saldo_inicial), 'BRL')}</span>
      </div>
    `);
  }
  for (const e of allEntries) {
    const d = e.date ? formatDateBR(e.date) : '—';
    histRowsHtml.push(`
      <div class="proj-hist-row ${e.cls}">
        <span class="proj-hist-date">${d}</span>
        <span class="proj-hist-name">${escapeHtml(e.label)} ${e.tag}</span>
        <span class="proj-hist-value">${formatCurrencyHTML(e.value, 'BRL')}</span>
      </div>
    `);
  }

  const totalEntries = histRowsHtml.length;
  document.getElementById('proj-details-historico').innerHTML = `
    <h3 class="proj-details-section-title">Histórico de aportes (${totalEntries})</h3>
    ${totalEntries === 0
      ? '<div class="proj-details-empty">Sem aportes registrados ainda. Os pagamentos efetivados (Pago/Cartão) das subcategorias atreladas vão aparecer aqui.</div>'
      : `<div class="proj-hist-list">${histRowsHtml.join('')}</div>`
    }
  `;

  const arquivado = p.status === ST_INV_ARQUIVADO;
  document.getElementById('btn-excluir-projeto').classList.toggle('hidden', arquivado);
  document.getElementById('btn-restaurar-projeto').classList.toggle('hidden', !arquivado);
  document.getElementById('btn-editar-projeto').classList.toggle('hidden', arquivado);

  openModal('modal-projeto-details');
}

// -----------------------------
// Excluir / Arquivar projeto
// -----------------------------
let pendingAcaoProjeto = null; // 'arquivar' | 'excluir'
let pendingCompBackup  = null; // dados do compromisso pra salvar antes de arquivar

async function excluirProjeto() {
  const p = cachedProjetos.find((x) => x.id === detailsId);
  if (!p) return;

  const nome = escapeHtml(p.nome);
  const subs = cachedSubcategorias.filter((s) => s.projeto_id === p.id);
  const subCount = subs.length;
  const aportesManuais = cachedAportes.filter((a) => a.projeto_id === p.id).length;
  const aportesReais   = cachedPagamentos.filter((pg) => pg.subcategorias?.projeto_id === p.id).length;
  const hasAportes     = aportesManuais > 0 || aportesReais > 0;

  const titleEl  = document.getElementById('proj-confirmar-title');
  const msgEl    = document.getElementById('proj-confirmar-msg');
  const btnAcao  = document.getElementById('btn-confirmar-acao-projeto');
  const item     = (n, sing, pl) => `${n} ${n === 1 ? sing : (pl || sing + 's')}`;

  if (hasAportes) {
    // ── COM APORTES: arquivar (soft delete) ─────────────────────
    pendingAcaoProjeto = 'arquivar';
    // Guarda dados da subcategoria vinculada para restauração futura
    const sub = subs.find((s) => s.descricao?.startsWith('Auto-criado para o projeto')) || subs[0];
    pendingCompBackup = sub ? {
      valor_base:   sub.valor_base,
      periodo:      sub.periodo,
      categoria_id: sub.categoria_id,
      data_inicio:  sub.iniciado_em,
    } : null;

    titleEl.textContent = 'Arquivar projeto';
    btnAcao.textContent = 'Arquivar';
    btnAcao.className = 'btn btn-warning';
    btnAcao.dataset.acao = 'arquivar';

    const totalAportes = aportesManuais + aportesReais;
    const deletados = [];
    if (subCount > 0) deletados.push(`<li>${item(subCount, 'compromisso vinculado', 'compromissos vinculados')} (subcategoria)</li>`);

    msgEl.innerHTML = `
      <p style="margin-bottom: var(--space-3);">O projeto <strong>"${nome}"</strong> tem <strong>${item(totalAportes, 'aporte registrado', 'aportes registrados')}</strong>. Por isso ele será <strong>arquivado</strong> em vez de excluído.</p>

      ${deletados.length ? `
        <div class="confirm-section confirm-section--danger">
          <h4 class="confirm-section-title">🗑️ O que será removido</h4>
          <ul class="confirm-list">${deletados.join('')}</ul>
        </div>
      ` : ''}

      <div class="confirm-section confirm-section--info">
        <h4 class="confirm-section-title">📦 O que será mantido</h4>
        <ul class="confirm-list">
          <li>O próprio <strong>projeto</strong> (movido para o grupo "Terminado" com status <strong>Arquivado</strong>)</li>
          <li>${item(totalAportes, 'aporte no histórico', 'aportes no histórico')}</li>
          <li>Transações já registradas nas contas (vínculo via subcategoria preservado como referência)</li>
        </ul>
      </div>

      <div class="confirm-section confirm-section--success">
        <h4 class="confirm-section-title">↻ Se você restaurar depois</h4>
        <ul class="confirm-list">
          <li>Status volta para <strong>Ativo</strong></li>
          <li>Projeto volta para "Em progresso" ou "Por começar"</li>
          ${pendingCompBackup ? '<li>O <strong>compromisso é recriado automaticamente</strong> em Compromissos → Investimentos</li>' : ''}
          <li>Histórico de aportes permanece intacto</li>
        </ul>
      </div>
    `;
  } else {
    // ── SEM APORTES: hard delete ──────────────────────────────────
    pendingAcaoProjeto = 'excluir';
    pendingCompBackup  = null;

    titleEl.textContent = 'Excluir projeto';
    btnAcao.textContent = 'Excluir';
    btnAcao.className = 'btn btn-danger';
    btnAcao.dataset.acao = 'excluir';

    const itens = [`<li>O próprio <strong>projeto</strong> "${nome}"</li>`];
    if (subCount > 0) itens.push(`<li>${item(subCount, 'compromisso vinculado', 'compromissos vinculados')} (subcategoria)</li>`);

    msgEl.innerHTML = `
      <p style="margin-bottom: var(--space-3);">Como este projeto <strong>não tem aportes registrados</strong>, ele será excluído permanentemente.</p>

      <div class="confirm-section confirm-section--danger">
        <h4 class="confirm-section-title">🗑️ O que será removido</h4>
        <ul class="confirm-list">${itens.join('')}</ul>
      </div>

      <p class="confirm-irreversible">⚠️ Esta ação não pode ser desfeita.</p>
    `;
  }

  closeModal('modal-projeto-details');
  openModal('modal-confirmar-projeto');
}

async function confirmarAcaoProjeto() {
  const p = cachedProjetos.find((x) => x.id === detailsId);
  if (!p) return;

  const btn = document.getElementById('btn-confirmar-acao-projeto');
  const labelOrig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Aguarde…';

  try {
    if (pendingAcaoProjeto === 'restaurar') {
      // Ao restaurar, escolhe status baseado em meta/realizado
      const realizado = calcRealizado(p.id);
      const novoStatus = realizado > 0
        ? ST_INV_APORTANDO
        : (Number(p.meta_valor) > 0 ? ST_INV_ACOMECAR : ST_INV_SEM_META);
      const { error: updErr } = await supabase
        .from('projetos_investimento')
        .update({ status: novoStatus })
        .eq('id', p.id);
      if (updErr) throw updErr;

      if (p.comp_valor_base && p.comp_categoria_id && p.comp_data_inicio) {
        const user = await getCurrentUser();
        if (user) {
          try {
            await ensureSubcategoriaForProjeto(p.id, user.id, p.nome, {
              valor:        p.comp_valor_base,
              periodo:      p.comp_periodo || 'Mensal',
              categoria_id: p.comp_categoria_id,
              dataInicio:   p.comp_data_inicio,
            });
            showToast(`Projeto "${p.nome}" restaurado — compromisso recriado`, 'success');
          } catch (subErr) {
            console.warn('[restaurar] falha ao recriar subcategoria', subErr);
            showToast(`Projeto restaurado, mas falhou ao recriar compromisso: ${subErr?.message || ''}`, 'error', 10000);
          }
        }
      } else {
        showToast(`Projeto "${p.nome}" restaurado`, 'success');
      }

      closeModal('modal-confirmar-projeto');
      detailsId = null;
      pendingAcaoProjeto = null;
      await loadAll();
      render();
      return;

    } else if (pendingAcaoProjeto === 'arquivar') {
      // 1. Salva backup do compromisso no projeto
      const backupPayload = pendingCompBackup ? {
        comp_valor_base:   pendingCompBackup.valor_base,
        comp_periodo:      pendingCompBackup.periodo,
        comp_categoria_id: pendingCompBackup.categoria_id,
        comp_data_inicio:  pendingCompBackup.data_inicio,
      } : {};

      const { error: updErr } = await supabase
        .from('projetos_investimento')
        .update({ status: ST_INV_ARQUIVADO, ...backupPayload })
        .eq('id', p.id);
      if (updErr) throw updErr;

      // 2. Remove subcategorias vinculadas (cascades orcamento + pagamentos futuros)
      const { error: subErr } = await supabase
        .from('subcategorias')
        .delete()
        .eq('projeto_id', p.id);

      if (subErr) {
        // Projeto já foi arquivado (status atualizado), mas a remoção da
        // subcategoria falhou — ela vai ficar órfã se o usuário não souber.
        // Avisa explicitamente em vez de só logar no console.
        console.warn('[arquivar] falha ao remover subcategoria', subErr);
        showToast(
          `Projeto "${p.nome}" arquivado, mas o compromisso vinculado não foi removido: ${subErr.message}. Remova manualmente em Compromissos.`,
          'warning',
          12000
        );
      } else {
        showToast(`Projeto "${p.nome}" arquivado — movido para Terminado`, 'success');
      }

    } else {
      // Hard delete — remove subcategorias antes (FK é SET NULL, não CASCADE)
      await supabase.from('subcategorias').delete().eq('projeto_id', p.id);

      const { error } = await supabase
        .from('projetos_investimento')
        .delete()
        .eq('id', p.id);
      if (error) throw error;

      showToast(`Projeto "${p.nome}" excluído`, 'success');
    }

    closeModal('modal-confirmar-projeto');
    detailsId = null;
    pendingAcaoProjeto = null;
    pendingCompBackup  = null;
    await loadAll();
    render();
  } catch (err) {
    showToast('Erro: ' + (err?.message || String(err)), 'error', 8000);
  } finally {
    btn.disabled = false;
    btn.textContent = labelOrig;
  }
}

// -----------------------------
// Restaurar projeto arquivado (mostra aviso antes de executar)
// -----------------------------
function restaurarProjeto() {
  const p = cachedProjetos.find((x) => x.id === detailsId);
  if (!p) return;

  pendingAcaoProjeto = 'restaurar';
  const nome         = escapeHtml(p.nome);
  const temBackup    = !!(p.comp_valor_base && p.comp_categoria_id && p.comp_data_inicio);
  const aportesManuais = cachedAportes.filter((a) => a.projeto_id === p.id).length;

  const titleEl = document.getElementById('proj-confirmar-title');
  const msgEl   = document.getElementById('proj-confirmar-msg');
  const btnAcao = document.getElementById('btn-confirmar-acao-projeto');

  titleEl.textContent = 'Restaurar projeto';
  btnAcao.textContent = 'Restaurar';
  btnAcao.className   = 'btn btn-success';
  btnAcao.dataset.acao = 'restaurar';

  msgEl.innerHTML = `
    <p style="margin-bottom: var(--space-3);">O projeto <strong>"${nome}"</strong> está arquivado. Restaurar irá colocá-lo de volta no fluxo ativo.</p>

    <div class="confirm-section confirm-section--success">
      <h4 class="confirm-section-title">↻ O que vai acontecer</h4>
      <ul class="confirm-list">
        <li>Status muda de <strong>Arquivado</strong> → <strong>Ativo</strong></li>
        <li>Projeto volta para "${aportesManuais > 0 ? 'Em progresso' : 'Por começar'}"</li>
        ${temBackup
          ? '<li>O <strong>compromisso (subcategoria) é recriado automaticamente</strong> em Compromissos → Investimentos, com mesmo valor e frequência</li>'
          : '<li>Nenhum compromisso vinculado para recriar</li>'
        }
        <li>Histórico de aportes permanece intacto</li>
      </ul>
    </div>
  `;

  closeModal('modal-projeto-details');
  openModal('modal-confirmar-projeto');
}

// -----------------------------
// Utils
// -----------------------------
function fmtPct(pct) {
  return pct.toFixed(1) === '100.0' ? '100%' : `${pct.toFixed(1)}%`;
}

// -----------------------------
// Histórico passado — Investimentos
// -----------------------------
function makeHistRow(entry = null) {
  const div = document.createElement('div');
  div.className = 'hist-row';
  div.innerHTML = `
    <input type="date" class="input hist-row-data" value="${entry?.data || ''}">
    <input type="text" inputmode="decimal" class="input hist-row-valor" value="${entry?.valor ?? ''}" placeholder="Valor (R$)">
    <input type="text" class="input hist-row-desc" value="${escapeHtml(entry?.descricao || '')}" placeholder="Descrição (opcional)" maxlength="100">
    <button type="button" class="hist-row-del" title="Remover">×</button>
  `;
  div.querySelector('.hist-row-del').addEventListener('click', () => div.remove());
  return div;
}

function openHistoricoInvestModal(projetoId) {
  historicoInvestId = projetoId;
  const proj = cachedProjetos.find((p) => p.id === projetoId);
  if (!proj) return;

  document.getElementById('hist-invest-modal-title').textContent = `Histórico — ${proj.nome}`;

  // Reset to saldo mode
  document.querySelectorAll('#hist-invest-seg .view-toggle-btn')
    .forEach((b) => b.classList.toggle('active', b.dataset.histSeg === 'saldo'));
  document.getElementById('hist-invest-saldo-panel').classList.remove('hidden');
  document.getElementById('hist-invest-extrato-panel').classList.add('hidden');

  // Pre-fill saldo inicial
  document.getElementById('hist-invest-saldo-valor').value = proj.saldo_inicial ?? '';

  // Render extrato rows from cached aportes
  const aportesProjeto = cachedAportes.filter((a) => a.projeto_id === projetoId);
  const container = document.getElementById('hist-invest-extrato-list');
  container.innerHTML = '';
  if (aportesProjeto.length > 0) {
    const listEl = document.createElement('div');
    listEl.className = 'hist-extrato-list';
    for (const a of aportesProjeto) listEl.appendChild(makeHistRow(a));
    container.appendChild(listEl);
  }

  openModal('modal-historico-invest');
}

function openHistoricoViewInvest(projetoId) {
  const proj = cachedProjetos.find((p) => p.id === projetoId);
  if (!proj) return;

  document.getElementById('hist-view-invest-title').textContent = `Histórico de aportes — ${proj.nome}`;

  const aportes = cachedAportes
    .filter((a) => a.projeto_id === projetoId)
    .sort((a, b) => b.data.localeCompare(a.data));

  const saldoInicial = Number(proj.saldo_inicial) || 0;
  const content = document.getElementById('hist-view-invest-content');

  if (aportes.length === 0 && saldoInicial === 0) {
    content.innerHTML = `
      <div style="text-align:center; padding: var(--space-6); color: var(--color-text-muted); font-size: var(--fs-sm);">
        Nenhum aporte registrado ainda.<br>
        Use o botão <strong>+ Aporte</strong> no card para registrar.
      </div>`;
  } else {
    const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
    const rows = [];
    for (const a of aportes) {
      rows.push(`
        <div class="proj-hist-row proj-hist-row-aporte">
          <span class="proj-hist-date">${fmtDate(a.data)}</span>
          <span class="proj-hist-name">${escapeHtml(a.descricao || 'Aporte')} <span class="proj-hist-tag">Aporte</span></span>
          <span class="proj-hist-value">${formatCurrencyHTML(a.valor)}</span>
        </div>`);
    }
    if (saldoInicial > 0) {
      rows.push(`
        <div class="proj-hist-row proj-hist-row-saldo">
          <span class="proj-hist-date">—</span>
          <span class="proj-hist-name">Saldo inicial</span>
          <span class="proj-hist-value">${formatCurrencyHTML(saldoInicial)}</span>
        </div>`);
    }
    const total = aportes.reduce((s, a) => s + Number(a.valor), 0) + saldoInicial;
    content.innerHTML = `
      <div class="proj-hist-list">${rows.join('')}</div>
      <div style="display:flex;justify-content:flex-end;padding:var(--space-3) var(--space-4);font-weight:var(--fw-bold);font-size:var(--fs-sm);border-top:1px solid var(--color-border);">
        Total investido: ${formatCurrencyHTML(total)}
      </div>`;
  }

  openModal('modal-historico-view-invest');
}

async function saveHistoricoInvest() {
  const btn = document.getElementById('btn-salvar-hist-invest');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';
  const mode = document.querySelector('#hist-invest-seg .view-toggle-btn.active')?.dataset.histSeg || 'saldo';

  try {
    if (mode === 'saldo') {
      const valor = parseUserNumber(document.getElementById('hist-invest-saldo-valor').value) || 0;
      const { error } = await supabase
        .from('projetos_investimento')
        .update({ saldo_inicial: valor })
        .eq('id', historicoInvestId);
      if (error) throw error;
      showToast(t('investimentos.toast.saldo_atualizado', 'Saldo inicial atualizado'), 'success');
    } else {
      // Collect rows from DOM
      const rows = [];
      document.querySelectorAll('#hist-invest-extrato-list .hist-row').forEach((rowEl) => {
        const data = rowEl.querySelector('.hist-row-data').value;
        const valor = parseUserNumber(rowEl.querySelector('.hist-row-valor').value);
        const descricao = rowEl.querySelector('.hist-row-desc').value.trim() || null;
        if (data && valor && valor > 0) rows.push({ data, valor, descricao });
      });

      const user = await getCurrentUser();
      if (!user) throw new Error('Sessão expirada');

      // Full replace
      const { error: delErr } = await supabase
        .from('aportes_projeto')
        .delete()
        .eq('projeto_id', historicoInvestId);
      if (delErr) throw delErr;

      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from('aportes_projeto')
          .insert(rows.map((r) => ({ ...r, projeto_id: historicoInvestId, user_id: user.id, workspace_id: requireWorkspaceId(), created_by: user.id })));
        if (insErr) throw insErr;
      }
      showToast(`${rows.length} entrada${rows.length !== 1 ? 's' : ''} salva${rows.length !== 1 ? 's' : ''}`, 'success');
    }

    closeModal('modal-historico-invest');
    await loadAll();
    render();
    openDetailsModal(historicoInvestId);
  } catch (err) {
    showToast('Erro ao salvar: ' + (err?.message || String(err)), 'error', 8000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}

// Simulador de juros compostos extraído para ./investimentos/simulator.js

