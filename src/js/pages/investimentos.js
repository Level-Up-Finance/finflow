// =============================================================
// FinFlow — Página: Investimentos (Fase 8.A)
//
// Lista de projetos de investimento. Cada projeto agrupa
// subcategorias do grupo "investimentos". Total realizado =
// saldo_inicial + soma de valor_real dos pagamentos com status
// Pago/Cartão das subs atreladas (todos os meses).
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatCurrency, formatCurrencyHTML } from '../lib/compromissos-config.js';
import { initColVisibility } from '../lib/col-visibility.js';
import { escapeHtml, formatDateBR, isoMonth, parseUserNumber } from '../lib/utils.js';
import { DEFAULT_COLOR, renderColorPicker, setActiveColor } from '../lib/color-palette.js';
import { initContatoPicker } from '../components/contato-picker.js';
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
let editingId = null;
let detailsId = null;
let historicoInvestId = null;
let viewMode = 'cards'; // 'cards' | 'table' | 'timeline'
let colVisEl = null;
let timelineZoom = 'mes'; // 'mes' | 'ano' | '5anos' | '10anos'

const today = new Date();
const viewYear = today.getFullYear();
const viewMonth = today.getMonth();

const STATUS_LABELS = {
  ativo: 'Ativo',
  concluido: 'Concluído',
  pausado: 'Pausado',
  arquivado: 'Arquivado',
};

const BLOCOS = [
  {
    id: 'em_progresso',
    label: 'Em progresso',
    filter: (p) => p.status === 'ativo' && calcRealizado(p.id) > 0,
    emptyMsg: 'Nenhum projeto em andamento.',
  },
  {
    id: 'por_comecar',
    label: 'Por começar',
    filter: (p) => (p.status === 'ativo' || p.status === 'pausado') && calcRealizado(p.id) === 0,
    emptyMsg: 'Nenhum projeto sem início ainda.',
  },
  {
    id: 'terminado',
    label: 'Terminado',
    filter: (p) => p.status === 'concluido' || p.status === 'arquivado',
    emptyMsg: 'Nenhum projeto concluído ainda.',
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
  await loadAll();

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
});

// -----------------------------
// Loaders
// -----------------------------
async function loadAll() {
  const user = await getCurrentUser();
  if (!user) return;

  const mesAno = isoMonth(viewYear, viewMonth);

  const [projetos, subcats, pagamentos, orcamento, contatos, aportes, categorias] = await Promise.all([
    supabase.from('projetos_investimento').select('*').order('nome'),
    // Subs com categoria pra cruzar com grupo='investimentos'
    supabase.from('subcategorias').select('*, categorias(grupo, cor, nome)').eq('status', 'ativa'),
    // Pagamentos com sub.categorias pra filtrar grupo
    supabase.from('pagamentos')
      .select('*, subcategorias(projeto_id, nome, apelido, categorias(grupo))')
      .in('status', ['Pago', 'Cartão']),
    // Orçamento do mês corrente — pra "previsto neste mês"
    supabase.from('orcamento_geral')
      .select('*, subcategorias(projeto_id, categorias(grupo))')
      .eq('mes_ano', mesAno),
    supabase.from('contatos').select('id, nome, tipo, status').neq('status', 'arquivado').order('nome'),
    supabase.from('aportes_projeto').select('*').order('data'),
    supabase.from('categorias').select('id, nome, grupo, ordem').eq('grupo', 'investimentos').order('ordem'),
  ]);

  if (projetos.error) {
    if (/relation.*projetos_investimento/i.test(projetos.error.message)) {
      showToast(t('investimentos.toast.schema_desatualizado', 'Schema desatualizado. Rode a migration 0016 + 0017 no Supabase.'), 'error', 12000);
    } else {
      showToast(`${t('investimentos.toast.erro_carregar', 'Erro ao carregar projetos')}: ${projetos.error.message}`, 'error', 8000);
    }
    return;
  }

  cachedProjetos = projetos.data || [];
  cachedSubcategorias = (subcats.data || []).filter((s) => s.categorias?.grupo === 'investimentos');
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

  document.getElementById('proj-cor-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('.color-swatch');
    if (!btn) return;
    const color = btn.dataset.color;
    document.getElementById('proj-cor').value = color;
    setActiveColor(document.getElementById('proj-cor-picker'), color);
  });

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
    html += `
      <div class="bloco-section">
        <div class="bloco-section-header">
          <span class="bloco-section-label">${bloco.label}</span>
          <span class="bloco-section-count">${items.length}</span>
        </div>
        ${content}
      </div>`;
  }

  container.innerHTML = html;
  bindCardClicks();
}

// -----------------------------
// KPI widgets (topo da página)
// -----------------------------
async function renderWidgets(counts) {
  const ativosNaoArq = cachedProjetos.filter(p => p.status !== 'arquivado');

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
  for (const [code, { meta, realizado, comMeta }] of Object.entries(byCurrency)) {
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

  const isParcial = (p.status === 'concluido' || p.status === 'arquivado') && meta > 0 && realizado < meta;

  return `
    <article class="projeto-card status-${p.status}" data-id="${p.id}" style="--projeto-cor: ${p.cor};">
      <header class="projeto-card-header">
        <div class="projeto-card-color-bar"></div>
        <div class="projeto-card-titles">
          <h3 class="projeto-card-name">${escapeHtml(p.nome)}</h3>
          <span class="projeto-card-status status-${p.status}">${STATUS_LABELS[p.status] || p.status}</span>
          ${isParcial ? `<span class="tag-parcial" title="Encerrado antes de atingir a meta">Parcial</span>` : ''}
          ${p.status !== 'arquivado' && subsCount === 0 ? `<button class="div-card-pendente-badge proj-btn-editar" data-id="${p.id}" type="button" title="Configurar compromisso deste projeto">⚠ Configurar compromisso</button>` : ''}
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
          ${(p.status === 'concluido' || p.status === 'arquivado') && meta > 0 && realizado < meta ? `<span class="tag-parcial" title="Encerrado antes de atingir a meta">Parcial</span>` : ''}
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
    const created = p.created_at ? new Date(p.created_at) : rangeStart;
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
  document.getElementById('proj-status').value        = p?.status || 'ativo';
  document.getElementById('proj-meta-valor').value    = p?.meta_valor ?? (prefill?.meta_valor ?? '');
  document.getElementById('proj-data-alvo').value     = p?.data_alvo || (prefill?.data_alvo || '');
  document.getElementById('proj-saldo-inicial').value = p?.saldo_inicial ?? (prefill?.saldo_inicial ?? '');

  initContatoPickerOnce();
  contatoPicker?.setValue(p?.contato_id || '');

  // Seção "Criar compromisso vinculado": só em modo CRIAÇÃO
  const toggleWrap   = document.getElementById('proj-compromisso-toggle-wrap');
  const compFields   = document.getElementById('proj-compromisso-fields');
  const compCheckbox = document.getElementById('proj-criar-compromisso');
  const compValor    = document.getElementById('proj-comp-valor');
  const compPeriodo  = document.getElementById('proj-comp-periodo');
  const compData     = document.getElementById('proj-comp-data');
  const compCategSel = document.getElementById('proj-comp-categoria');

  // Em edição, só mostra a seção de criar compromisso se o projeto AINDA não tem
  // compromisso vinculado (fluxo "Configurar compromisso" via badge no card).
  const temCompromisso = editingId
    ? cachedSubcategorias.some((s) => s.projeto_id === editingId)
    : false;
  if (editingId && temCompromisso) {
    toggleWrap.classList.add('hidden');
    compFields.classList.add('hidden');
    compCheckbox.checked = false;
  } else {
    toggleWrap.classList.remove('hidden');
    // Em modo "configurar compromisso" (edição sem compromisso), já vem marcado
    compCheckbox.checked = editingId ? true : !!prefill?.aporte_mensal;
    compFields.classList.toggle('hidden', !compCheckbox.checked);
    compValor.value   = prefill?.aporte_mensal != null ? formatDecimal(prefill.aporte_mensal, 2) : '';
    compPeriodo.value = 'Mensal';
    compData.value    = (editingId ? p?.data_alvo : null) || todayISODate();

    // Popula categorias do grupo investimentos (default = "Investimentos")
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
  }

  openModal('modal-projeto');
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

  const payload = {
    nome,
    descricao:   document.getElementById('proj-descricao').value.trim() || null,
    cor:         document.getElementById('proj-cor').value,
    status:      document.getElementById('proj-status').value,
    meta_valor:  parseUserNumber(document.getElementById('proj-meta-valor').value) || null,
    data_alvo:   document.getElementById('proj-data-alvo').value || null,
    saldo_inicial: parseUserNumber(document.getElementById('proj-saldo-inicial').value) || 0,
    contato_id:  contatoPicker?.getValue() || null,
  };

  // Compromisso vinculado: em modo criação OU em modo "Configurar compromisso"
  // (edição quando o projeto ainda não tem compromisso vinculado).
  const editingProjetoSemCompromisso = editingId && !cachedSubcategorias.some((s) => s.projeto_id === editingId);
  const wantCompromisso = (!editingId || editingProjetoSemCompromisso) && document.getElementById('proj-criar-compromisso').checked;
  let compromissoData = null;
  if (wantCompromisso) {
    const valor      = parseDecimal(document.getElementById('proj-comp-valor').value);
    const periodo    = document.getElementById('proj-comp-periodo').value;
    const dataInicio = document.getElementById('proj-comp-data').value;
    const categoria  = document.getElementById('proj-comp-categoria').value;
    if (!valor || valor <= 0)   { showToast(t('investimentos.validacao.aporte_obrigatorio', 'Informe o valor do aporte do compromisso'), 'error'); return; }
    if (!dataInicio)            { showToast(t('investimentos.validacao.data_aporte_obrigatoria', 'Informe a data do primeiro aporte'), 'error'); return; }
    if (!categoria)             { showToast(t('investimentos.validacao.categoria_obrigatoria', t('investimentos.validacao.categoria_obrigatoria', 'Selecione uma categoria para o compromisso')), 'error'); return; }
    compromissoData = { valor, periodo, dataInicio, categoria_id: categoria };
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
      response = await supabase.from('projetos_investimento').insert({ ...payload, user_id: user.id }).select().single();
    }
    if (response.error) throw response.error;

    // Cria compromisso vinculado se solicitado
    if (compromissoData && response.data?.id && user) {
      try {
        await ensureSubcategoriaForProjeto(response.data.id, user.id, payload.nome, compromissoData);
        showToast(t('investimentos.toast.criado_com_compromisso', 'Projeto salvo e compromisso vinculado'), 'success');
      } catch (err) {
        console.warn('[ensureSubcategoriaForProjeto]', err);
        showToast('Projeto salvo, mas falhou ao criar compromisso: ' + (err?.message || String(err)), 'error', 10000);
      }
    } else {
      showToast(editingId
        ? t('investimentos.toast.atualizado', 'Projeto atualizado')
        : t('investimentos.toast.criado', 'Projeto criado'),
        'success');
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
async function ensureSubcategoriaForProjeto(projetoId, userId, nomeProjeto, comp) {
  // Já existe sub vinculada a esse projeto com mesmo nome? evita duplicata acidental
  const { data: existing, error: existErr } = await supabase.from('subcategorias')
    .select('id')
    .eq('projeto_id', projetoId)
    .limit(1);
  if (existErr) throw existErr;
  if (existing && existing.length > 0) return; // já existe pelo menos uma sub vinculada

  const [, , diaStr] = comp.dataInicio.split('-');
  const vencDia = parseInt(diaStr) || 1;

  const { error: insErr } = await supabase.from('subcategorias').insert({
    user_id:        userId,
    nome:           nomeProjeto,
    tipo:           'Despesa',
    categoria_id:   comp.categoria_id,
    projeto_id:     projetoId,
    tipo_pagamento: 'Boleto',
    vencimento_dia: vencDia,
    periodo:        comp.periodo,
    iniciado_em:    comp.dataInicio,
    moeda:          'BRL',
    valor_base:     comp.valor,
    status:         'ativa',
    descricao:      `Auto-criado para o projeto de investimento "${nomeProjeto}"`,
  });
  if (insErr) throw insErr;
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
  document.getElementById('proj-details-subs').innerHTML = `
    <h3 class="proj-details-section-title">Compromissos atrelados (${subs.length})</h3>
    ${subs.length === 0
      ? '<div class="proj-details-empty">Nenhum compromisso atrelado a este projeto ainda. Edite um compromisso de investimento e selecione esse projeto.</div>'
      : `<div class="proj-details-subs-list">${subs.map((s) => `
          <div class="proj-details-sub-row">
            <span class="proj-details-sub-name">${escapeHtml(s.apelido?.trim() || s.nome)}</span>
            <span class="proj-details-sub-valor">${formatCurrencyHTML(Number(s.valor_base) || 0, s.moeda || 'BRL')}</span>
          </div>
        `).join('')}</div>`
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

  const arquivado = p.status === 'arquivado';
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
      const { error: updErr } = await supabase
        .from('projetos_investimento')
        .update({ status: 'ativo' })
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
        .update({ status: 'arquivado', ...backupPayload })
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
      // Hard delete — aportes_projeto cascadeiam automaticamente
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
function parseNum(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

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
          .insert(rows.map((r) => ({ ...r, projeto_id: historicoInvestId, user_id: user.id })));
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

