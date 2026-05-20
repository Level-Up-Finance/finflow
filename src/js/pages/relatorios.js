// =============================================================
// FinFlow — Relatórios
// Fluxo de Caixa · Previsto vs Real · Categorias
// Exportação CSV / Excel / PDF
// =============================================================
import { guardSession } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { formatCurrency, formatCurrencyHTML } from '../lib/compromissos-config.js';
import { escapeHtml, formatDateBR } from '../lib/utils.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';

// -------------------------------------------------------
// Estado
// -------------------------------------------------------
const today = new Date();
let filterMode = 'mes'; // 'mes' | 'ano' | 'periodo' | 'todos'
let activeTab  = 'fluxo';

let allTransacoes    = [];
let allPagamentos    = [];
let allCategorias    = [];
let allSubcategorias = [];

// Grupo Compromissos — estado e cache lazy
let activeSubtabComp = 'cartoes';
let _subsCompletas   = null;
let _subsArquivadas  = null;

// Grupo Contas — estado e cache lazy
let activeSubtabContas = 'saldos';
let _contasAtivas      = null;
let _saldosAtuais      = null; // Map<conta_id, saldo>
let _snapshotsBancarios = null; // Map<conta_id, { data, saldo, fonte }>

const CONTA_TIPO_COLORS = {
  'Corrente':          'var(--color-primary)',
  'Poupança':          'var(--color-success)',
  'Carteira':          'var(--color-info)',
  'Cofrinho':          '#a78bfa',
  'Cartão de Crédito': 'var(--color-danger)',
  'Investimento':      'var(--color-warning)',
};
const TIPOS_DISPONIVEIS = new Set(['Corrente', 'Poupança', 'Carteira']);

// Grupo Dívidas — estado e cache lazy
let activeSubtabDiv  = 'visao';
let _dividas         = null;
let _dividaPagsHist  = null;  // array de pagamentos no período atual (depende de range)
let _dividaContatos  = null;  // Map<id, nome>

// Grupo Investimentos — estado e cache lazy
let activeSubtabInv  = 'visao';
let _projetos        = null;
let _aportesAll      = null;  // todos os aportes (snapshot)
let _aportesPeriodo  = null;  // aportes no período (depende de range)

// Grupo Saúde Financeira — estado e cache lazy
let activeSubtabSaude = 'indicadores';
let _transAnterior    = null;  // transações do período anterior (para comparativo)

// Grupo Patrimônio — estado e cache lazy
let activeSubtabPatr = 'visao';
let _patrEvolCache   = null;  // array de {mesIso, ativos, passivos, liquido}

const TIPO_PGTO_COLORS = {
  'PIX':            'var(--color-success)',
  'Débito':         'var(--color-info)',
  'Débito Direto':  '#06b6d4',
  'Transferência':  'var(--color-primary)',
  'Crédito':        'var(--color-warning)',
  'Boleto':         'var(--color-danger)',
  'Dinheiro':       'var(--color-text-muted)',
};

const MONTH_LABELS      = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTH_LABELS_LONG = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PAID_STATUSES     = new Set(['Pago','Cartão','Transferido','Parcial']);

// -------------------------------------------------------
// Init
// -------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('relatorios');
  initTutorial('relatorios');
  await loadStrings();
  applyTranslationsToDom();
  initFilters();
  bindEvents();
  await loadAndRender();
});

// -------------------------------------------------------
// Filtros
// -------------------------------------------------------
function initFilters() {
  const y = today.getFullYear();
  const m = today.getMonth();

  // Mês: dois selects — mês e ano
  const mesMonthSel = document.getElementById('relat-mes-month');
  MONTH_LABELS_LONG.forEach((label, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1;
    opt.textContent = label;
    if (i === m) opt.selected = true;
    mesMonthSel.appendChild(opt);
  });

  const mesYearSel = document.getElementById('relat-mes-year');
  for (let yr = y; yr >= y - 6; yr--) {
    const opt = document.createElement('option');
    opt.value = yr;
    opt.textContent = yr;
    if (yr === y) opt.selected = true;
    mesYearSel.appendChild(opt);
  }

  // Ano
  const anoSel = document.getElementById('relat-ano');
  for (let yr = y; yr >= y - 6; yr--) {
    const opt = document.createElement('option');
    opt.value = yr;
    opt.textContent = yr;
    anoSel.appendChild(opt);
  }

  // Período
  const first = new Date(y, m, 1);
  const last  = new Date(y, m + 1, 0);
  document.getElementById('relat-dt-inicio').value = toISODate(first);
  document.getElementById('relat-dt-fim').value    = toISODate(last);

  updateInputVisibility();
}

function updateInputVisibility() {
  document.getElementById('relat-input-mes').classList.toggle('hidden', filterMode !== 'mes');
  document.getElementById('relat-input-ano').classList.toggle('hidden', filterMode !== 'ano');
  document.getElementById('relat-input-periodo').classList.toggle('hidden', filterMode !== 'periodo');
  // Botão Aplicar só aparece no modo Período (os outros modos disparam automaticamente)
  document.getElementById('btn-relat-aplicar').classList.toggle('hidden', filterMode !== 'periodo');
}

function getDateRange() {
  if (filterMode === 'mes') {
    const mo = Number(document.getElementById('relat-mes-month').value);
    const yr = Number(document.getElementById('relat-mes-year').value);
    return {
      start: toISODate(new Date(yr, mo - 1, 1)),
      end:   toISODate(new Date(yr, mo, 0)),
      label: `${MONTH_LABELS_LONG[mo - 1]} ${yr}`,
    };
  }
  if (filterMode === 'ano') {
    const yr = Number(document.getElementById('relat-ano').value);
    return { start: `${yr}-01-01`, end: `${yr}-12-31`, label: String(yr) };
  }
  if (filterMode === 'periodo') {
    const start = document.getElementById('relat-dt-inicio').value;
    const end   = document.getElementById('relat-dt-fim').value;
    if (!start || !end) { showToast(t('relatorios.validacao.datas_obrigatorias', 'Informe as duas datas do período'), 'warning'); return null; }
    if (start > end)    { showToast(t('relatorios.validacao.datas_ordem', 'Data de início deve ser anterior ao fim'), 'warning'); return null; }
    return { start, end, label: `${formatDateBR(start)} — ${formatDateBR(end)}` };
  }
  return { start: null, end: null, label: 'Todo o período' };
}

// -------------------------------------------------------
// Eventos
// -------------------------------------------------------
function bindEvents() {
  // Mode pills — auto-aplica ao trocar de modo
  document.getElementById('relat-mode-pills').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    filterMode = btn.dataset.mode;
    document.querySelectorAll('#relat-mode-pills [data-mode]').forEach((b) =>
      b.classList.toggle('active', b === btn)
    );
    updateInputVisibility();
    loadAndRender();
  });

  // Botão Aplicar (principal para modo Período, fallback para os outros)
  document.getElementById('btn-relat-aplicar').addEventListener('click', loadAndRender);

  // Auto-aplica ao mudar qualquer select de data
  document.getElementById('relat-mes-month').addEventListener('change', loadAndRender);
  document.getElementById('relat-mes-year').addEventListener('change', loadAndRender);
  document.getElementById('relat-ano').addEventListener('change', loadAndRender);

  // Tabs principais
  document.getElementById('relat-tabs').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.relat-tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.relat-panel').forEach((p) => p.classList.add('hidden'));
    document.getElementById(`panel-${activeTab}`).classList.remove('hidden');
    if (activeTab === 'compromissos') {
      setLoading(true);
      await renderCompromissos();
      setLoading(false);
      document.getElementById('panel-compromissos').classList.remove('hidden');
    } else if (activeTab === 'contas') {
      setLoading(true);
      await renderContas();
      setLoading(false);
      document.getElementById('panel-contas').classList.remove('hidden');
    } else if (activeTab === 'dividas') {
      setLoading(true);
      await renderDividas();
      setLoading(false);
      document.getElementById('panel-dividas').classList.remove('hidden');
    } else if (activeTab === 'investimentos') {
      setLoading(true);
      await renderInvestimentos();
      setLoading(false);
      document.getElementById('panel-investimentos').classList.remove('hidden');
    } else if (activeTab === 'saude') {
      setLoading(true);
      await renderSaude();
      setLoading(false);
      document.getElementById('panel-saude').classList.remove('hidden');
    } else if (activeTab === 'patrimonio') {
      setLoading(true);
      await renderPatrimonio();
      setLoading(false);
      document.getElementById('panel-patrimonio').classList.remove('hidden');
    } else if (activeTab === 'fiscal') {
      setLoading(true);
      renderFiscal();
      setLoading(false);
      document.getElementById('panel-fiscal').classList.remove('hidden');
    }
  });

  // Sub-tabs do grupo Compromissos
  document.getElementById('compromissos-subtabs').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-subtab]');
    if (!btn) return;
    activeSubtabComp = btn.dataset.subtab;
    document.querySelectorAll('#compromissos-subtabs [data-subtab]').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    document.querySelectorAll('#panel-compromissos .relat-subpanel').forEach((p) => p.classList.add('hidden'));
    document.getElementById(`subpanel-${activeSubtabComp}`).classList.remove('hidden');
    setLoading(true);
    await renderCompromissos();
    setLoading(false);
    document.getElementById('panel-compromissos').classList.remove('hidden');
  });

  // Sub-tabs do grupo Patrimônio
  document.getElementById('patr-subtabs').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-subtab]');
    if (!btn) return;
    activeSubtabPatr = btn.dataset.subtab;
    document.querySelectorAll('#patr-subtabs [data-subtab]').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    document.querySelectorAll('#panel-patrimonio .relat-subpanel').forEach((p) => p.classList.add('hidden'));
    document.getElementById(`subpanel-patr-${activeSubtabPatr}`).classList.remove('hidden');
    setLoading(true);
    await renderPatrimonio();
    setLoading(false);
    document.getElementById('panel-patrimonio').classList.remove('hidden');
  });

  // Sub-tabs do grupo Saúde Financeira
  document.getElementById('saude-subtabs').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-subtab]');
    if (!btn) return;
    activeSubtabSaude = btn.dataset.subtab;
    document.querySelectorAll('#saude-subtabs [data-subtab]').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    document.querySelectorAll('#panel-saude .relat-subpanel').forEach((p) => p.classList.add('hidden'));
    document.getElementById(`subpanel-saude-${activeSubtabSaude}`).classList.remove('hidden');
    setLoading(true);
    await renderSaude();
    setLoading(false);
    document.getElementById('panel-saude').classList.remove('hidden');
  });

  // Sub-tabs do grupo Investimentos
  document.getElementById('invest-subtabs').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-subtab]');
    if (!btn) return;
    activeSubtabInv = btn.dataset.subtab;
    document.querySelectorAll('#invest-subtabs [data-subtab]').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    document.querySelectorAll('#panel-investimentos .relat-subpanel').forEach((p) => p.classList.add('hidden'));
    document.getElementById(`subpanel-inv-${activeSubtabInv}`).classList.remove('hidden');
    setLoading(true);
    await renderInvestimentos();
    setLoading(false);
    document.getElementById('panel-investimentos').classList.remove('hidden');
  });

  // Sub-tabs do grupo Dívidas
  document.getElementById('dividas-subtabs').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-subtab]');
    if (!btn) return;
    activeSubtabDiv = btn.dataset.subtab;
    document.querySelectorAll('#dividas-subtabs [data-subtab]').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    document.querySelectorAll('#panel-dividas .relat-subpanel').forEach((p) => p.classList.add('hidden'));
    document.getElementById(`subpanel-${activeSubtabDiv}`).classList.remove('hidden');
    setLoading(true);
    await renderDividas();
    setLoading(false);
    document.getElementById('panel-dividas').classList.remove('hidden');
  });

  // Sub-tabs do grupo Contas
  document.getElementById('contas-subtabs').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-subtab]');
    if (!btn) return;
    activeSubtabContas = btn.dataset.subtab;
    document.querySelectorAll('#contas-subtabs [data-subtab]').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    document.querySelectorAll('#panel-contas .relat-subpanel').forEach((p) => p.classList.add('hidden'));
    document.getElementById(`subpanel-${activeSubtabContas}`).classList.remove('hidden');
    setLoading(true);
    await renderContas();
    setLoading(false);
    document.getElementById('panel-contas').classList.remove('hidden');
  });

  // Export
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-export-excel').addEventListener('click', exportExcel);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
}

// -------------------------------------------------------
// Carregamento de dados
// -------------------------------------------------------
async function loadAndRender() {
  const range = getDateRange();
  if (range === null) return;

  setLoading(true);

  const [transRes, pagRes, catRes, subRes] = await Promise.all([
    buildTransQ(range),
    buildPagQ(range),
    supabase.from('categorias').select('id, nome, grupo, cor').order('nome'),
    supabase.from('subcategorias').select('id, nome, apelido, categoria_id').neq('status', 'arquivada').order('nome'),
  ]);

  if (transRes.error) {
    showToast('Erro ao carregar transações: ' + transRes.error.message, 'error', 8000);
    setLoading(false);
    return;
  }
  if (pagRes.error) {
    showToast('Erro ao carregar pagamentos: ' + pagRes.error.message, 'error', 8000);
    setLoading(false);
    return;
  }

  allTransacoes    = transRes.data || [];
  allPagamentos    = pagRes.data   || [];
  allCategorias    = catRes.data   || [];
  allSubcategorias = subRes.data   || [];

  document.getElementById('relat-period-label').textContent = range.label;

  renderFluxo();
  renderPrevisto();
  renderCategorias();
  if (activeTab === 'compromissos') await renderCompromissos();
  if (activeTab === 'contas')       await renderContas();
  if (activeTab === 'dividas') {
    _dividaPagsHist = null; // reset cache de histórico (depende do range)
    await renderDividas();
  }
  if (activeTab === 'investimentos') {
    _aportesPeriodo = null; // reset cache de aportes do período
    await renderInvestimentos();
  }
  if (activeTab === 'saude') {
    _transAnterior = null; // reset cache do período anterior
    await renderSaude();
  }
  if (activeTab === 'patrimonio') await renderPatrimonio();
  if (activeTab === 'fiscal') renderFiscal();

  setLoading(false);
}

function buildTransQ(range) {
  let q = supabase
    .from('transacoes')
    .select('id, data, tipo, valor, subcategoria_id, pagamento_id, conta_id, conta_destino_id, transferencia_par_id')
    .order('data');
  if (range.start) q = q.gte('data', range.start).lte('data', range.end);
  return q;
}

function buildPagQ(range) {
  let q = supabase
    .from('pagamentos')
    .select(`
      id, data_vencimento, valor_previsto, valor_real, status, moeda, subcategoria_id,
      subcategorias(id, nome, apelido, categoria_id, categorias(id, nome, grupo, cor))
    `)
    .order('data_vencimento');
  if (range.start) q = q.gte('data_vencimento', range.start).lte('data_vencimento', range.end);
  return q;
}

function setLoading(on) {
  document.getElementById('relat-loading').classList.toggle('hidden', !on);
  if (on) {
    document.querySelectorAll('.relat-panel').forEach((p) => p.classList.add('hidden'));
  } else {
    document.getElementById(`panel-${activeTab}`).classList.remove('hidden');
  }
}

// -------------------------------------------------------
// Relatório: Fluxo de Caixa
// -------------------------------------------------------
function renderFluxo() {
  const byMonth = {};

  allTransacoes.forEach((t) => {
    const key = t.data.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = { receitas: 0, despesas: 0, transferencias: 0 };
    const v = Number(t.valor) || 0;
    if      (t.tipo === 'Receita')      byMonth[key].receitas      += v;
    else if (t.tipo === 'Despesa')      byMonth[key].despesas      += v;
    else if (t.tipo === 'Transferência') byMonth[key].transferencias += v;
  });

  const months = Object.keys(byMonth).sort();

  const totalReceitas      = months.reduce((s, k) => s + byMonth[k].receitas,      0);
  const totalDespesas      = months.reduce((s, k) => s + byMonth[k].despesas,      0);
  const totalTransferencias = months.reduce((s, k) => s + byMonth[k].transferencias, 0);
  const saldoTotal         = totalReceitas - totalDespesas;

  document.getElementById('fluxo-kpis').innerHTML = [
    kpiCard('Total Receitas',    formatCurrency(totalReceitas,  'BRL'), 'success', '+'),
    kpiCard('Total Despesas',    formatCurrency(totalDespesas,  'BRL'), 'danger',  '−'),
    kpiCard('Saldo',             formatCurrency(saldoTotal,     'BRL'), saldoTotal >= 0 ? 'success' : 'danger', saldoTotal >= 0 ? '▲' : '▼'),
    kpiCard('Transferências¹',   formatCurrency(totalTransferencias, 'BRL'), 'info', '↔'),
  ].join('');

  if (months.length > 0) {
    const labels = months.map((k) => {
      const [y, mo] = k.split('-');
      return `${MONTH_LABELS[Number(mo) - 1]}/${y.slice(2)}`;
    });
    const series = [
      { label: 'Receitas',       color: 'var(--color-success)', values: months.map((k) => byMonth[k].receitas),      dash: false },
      { label: 'Despesas',       color: 'var(--color-danger)',  values: months.map((k) => byMonth[k].despesas),      dash: false },
      { label: 'Saldo',          color: 'var(--color-primary)', values: months.map((k) => byMonth[k].receitas - byMonth[k].despesas), dash: false },
      { label: 'Transferências', color: 'var(--color-info)',    values: months.map((k) => byMonth[k].transferencias), dash: true  },
    ].filter((s) => s.values.some((v) => v > 0));
    document.getElementById('fluxo-chart').innerHTML =
      renderLineChart(series, labels) + renderLegend(series);
  } else {
    document.getElementById('fluxo-chart').innerHTML =
      '<p class="relat-empty-chart">Sem transações no período selecionado</p>';
  }

  let saldoAcum = 0;
  const rows = months.map((k) => {
    const { receitas, despesas, transferencias } = byMonth[k];
    const saldo = receitas - despesas;
    saldoAcum  += saldo;
    const [y, mo] = k.split('-');
    const label = `${MONTH_LABELS_LONG[Number(mo) - 1]} ${y}`;
    return `<tr>
      <td>${escapeHtml(label)}</td>
      <td class="relat-td-num relat-text-success">${formatCurrencyHTML(receitas,      'BRL')}</td>
      <td class="relat-td-num relat-text-danger"> ${formatCurrencyHTML(despesas,      'BRL')}</td>
      <td class="relat-td-num ${saldo >= 0 ? 'relat-text-success' : 'relat-text-danger'}">${formatCurrencyHTML(saldo, 'BRL')}</td>
      <td class="relat-td-num ${saldoAcum >= 0 ? 'relat-text-success' : 'relat-text-danger'}">${formatCurrencyHTML(saldoAcum, 'BRL')}</td>
      <td class="relat-td-num relat-text-muted">${transferencias > 0 ? formatCurrencyHTML(transferencias, 'BRL') : '—'}</td>
    </tr>`;
  });

  document.getElementById('fluxo-tbody').innerHTML = rows.join('') ||
    '<tr><td colspan="6" class="relat-td-empty">Sem transações no período</td></tr>';

  document.getElementById('fluxo-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Total</strong></td>
    <td class="relat-td-num relat-text-success"><strong>${formatCurrencyHTML(totalReceitas, 'BRL')}</strong></td>
    <td class="relat-td-num relat-text-danger"><strong>${formatCurrencyHTML(totalDespesas, 'BRL')}</strong></td>
    <td class="relat-td-num ${saldoTotal >= 0 ? 'relat-text-success' : 'relat-text-danger'}"><strong>${formatCurrencyHTML(saldoTotal, 'BRL')}</strong></td>
    <td></td>
    <td class="relat-td-num relat-text-muted"><strong>${totalTransferencias > 0 ? formatCurrencyHTML(totalTransferencias, 'BRL') : '—'}</strong></td>
  </tr>`;

  // Atualiza cabeçalho da tabela para incluir coluna de transferências
  const fluxoThead = document.querySelector('#fluxo-table thead tr');
  if (fluxoThead) {
    fluxoThead.innerHTML = `
      <th>Período</th>
      <th class="relat-th-num">Receitas</th>
      <th class="relat-th-num">Despesas</th>
      <th class="relat-th-num">Saldo do período</th>
      <th class="relat-th-num">Saldo acumulado</th>
      <th class="relat-th-num">Transferências ¹</th>`;
  }
}

// -------------------------------------------------------
// Relatório: Previsto vs Real  (separado por grupo)
// -------------------------------------------------------
function renderPrevisto() {
  const byCat = {};

  allPagamentos.forEach((p) => {
    const sub = p.subcategorias;
    const cat = sub?.categorias;
    if (!cat) return;

    if (!byCat[cat.id]) byCat[cat.id] = {
      nome: cat.nome,
      cor:  cat.cor || 'var(--color-primary)',
      grupo: cat.grupo,
      previsto: 0,
      realizado: 0,
    };

    byCat[cat.id].previsto += Number(p.valor_previsto) || 0;
    if (PAID_STATUSES.has(p.status)) {
      byCat[cat.id].realizado += p.valor_real != null
        ? Number(p.valor_real)
        : Number(p.valor_previsto) || 0;
    }
  });

  // Receitas avulsas — transações com tipo=Receita sem pagamento_id vinculado
  const avulsasById = {};
  allTransacoes.forEach((t) => {
    if (t.tipo !== 'Receita' || t.pagamento_id) return;
    const sub = allSubcategorias.find((s) => s.id === t.subcategoria_id);
    const cat = sub ? allCategorias.find((c) => c.id === sub.categoria_id) : null;
    const catId   = cat?.id   || '__avulsa_receita';
    const catNome = cat?.nome || 'Receitas avulsas';
    const catCor  = cat?.cor  || 'var(--color-success)';

    if (!avulsasById[catId]) avulsasById[catId] = { nome: catNome, cor: catCor, grupo: 'receitas', previsto: 0, realizado: 0 };
    avulsasById[catId].realizado += Number(t.valor) || 0;
  });

  // Mescla avulsas em byCat (sem sobrescrever o previsto das que já existem)
  Object.entries(avulsasById).forEach(([id, av]) => {
    if (!byCat[id]) {
      byCat[id] = { ...av };
    } else {
      byCat[id].realizado += av.realizado;
    }
  });

  const allCats = Object.entries(byCat)
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.previsto - a.previsto);

  const receitas = allCats.filter((c) => c.grupo === 'receitas');
  const despesas = allCats.filter((c) => c.grupo !== 'receitas');

  const sumP = (arr) => arr.reduce((s, c) => s + c.previsto,  0);
  const sumR = (arr) => arr.reduce((s, c) => s + c.realizado, 0);

  const totRecP = sumP(receitas), totRecR = sumR(receitas);
  const totDespP = sumP(despesas), totDespR = sumR(despesas);
  const totalP = totRecP + totDespP;
  const totalR = totRecR + totDespR;
  const pctExec    = totDespP > 0 ? (totDespR / totDespP) * 100 : 0;

  document.getElementById('previsto-kpis').innerHTML = [
    kpiCard('Receitas previstas',   formatCurrency(totRecP,  'BRL'), 'success', '+'),
    kpiCard('Receitas realizadas',  formatCurrency(totRecR,  'BRL'), 'success', '✓'),
    kpiCard('Despesas previstas',   formatCurrency(totDespP, 'BRL'), 'danger',  '−'),
    kpiCard('Execução orçamentária', `${pctExec.toFixed(1)}%`, pctExec <= 100 ? 'success' : 'danger', '%'),
  ].join('');

  // Gráfico — top categorias de despesa
  if (despesas.length > 0) {
    document.getElementById('previsto-chart').innerHTML = renderGroupedBars(despesas.slice(0, 9));
  } else if (receitas.length > 0) {
    document.getElementById('previsto-chart').innerHTML = renderGroupedBars(receitas.slice(0, 9));
  } else {
    document.getElementById('previsto-chart').innerHTML =
      '<p class="relat-empty-chart">Sem pagamentos no período selecionado</p>';
  }

  // Tabela
  const makeRows = (cats) => cats.map((c) => {
    const desvio = c.realizado - c.previsto;
    const pct    = c.previsto > 0 ? (c.realizado / c.previsto) * 100 : (c.realizado > 0 ? 100 : 0);
    return `<tr>
      <td style="padding-left:var(--space-5)"><span class="cat-dot" style="background:${escapeHtml(c.cor)}"></span>${escapeHtml(c.nome)}</td>
      <td class="relat-td-num">${formatCurrencyHTML(c.previsto,  'BRL')}</td>
      <td class="relat-td-num">${formatCurrencyHTML(c.realizado, 'BRL')}</td>
      <td class="relat-td-num ${desvio <= 0 ? 'relat-text-success' : 'relat-text-danger'}">${formatCurrencyHTML(desvio, 'BRL')}</td>
      <td class="relat-td-num">${pct.toFixed(1)}%</td>
    </tr>`;
  }).join('');

  const sectionHeader = (label, cor) =>
    `<tr class="relat-section-header"><td colspan="5"><span style="color:${cor};font-weight:600">${label}</span></td></tr>`;

  const totalRow = (label, p, r) => {
    const d = r - p;
    return `<tr class="relat-total-row relat-subtotal-row">
      <td><strong>${label}</strong></td>
      <td class="relat-td-num"><strong>${formatCurrencyHTML(p, 'BRL')}</strong></td>
      <td class="relat-td-num"><strong>${formatCurrencyHTML(r, 'BRL')}</strong></td>
      <td class="relat-td-num ${d <= 0 ? 'relat-text-success' : 'relat-text-danger'}"><strong>${formatCurrencyHTML(d, 'BRL')}</strong></td>
      <td></td>
    </tr>`;
  };

  let tbody = '';
  if (receitas.length > 0) {
    tbody += sectionHeader('Receitas', 'var(--color-success)');
    tbody += makeRows(receitas);
    tbody += totalRow('Subtotal receitas', totRecP, totRecR);
  }
  if (despesas.length > 0) {
    tbody += sectionHeader('Despesas e compromissos', 'var(--color-danger)');
    tbody += makeRows(despesas);
    tbody += totalRow('Subtotal despesas', totDespP, totDespR);
  }

  document.getElementById('previsto-tbody').innerHTML = tbody ||
    '<tr><td colspan="5" class="relat-td-empty">Sem pagamentos no período</td></tr>';

  const desvioTotal = totalR - totalP;
  document.getElementById('previsto-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Total geral</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalP, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalR, 'BRL')}</strong></td>
    <td class="relat-td-num ${desvioTotal <= 0 ? 'relat-text-success' : 'relat-text-danger'}"><strong>${formatCurrencyHTML(desvioTotal, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${pctExec.toFixed(1)}%</strong></td>
  </tr>`;
}

// -------------------------------------------------------
// Relatório: Categorias (despesas)
// -------------------------------------------------------
function renderCategorias() {
  const byCat = {};

  allTransacoes.forEach((t) => {
    if (t.tipo !== 'Despesa') return;
    const sub = allSubcategorias.find((s) => s.id === t.subcategoria_id);
    const cat = sub ? allCategorias.find((c) => c.id === sub.categoria_id) : null;

    const catId   = cat?.id   || '__sem_cat';
    const catNome = cat?.nome || 'Sem categoria';
    const catCor  = cat?.cor  || 'var(--color-text-muted)';

    if (!byCat[catId]) byCat[catId] = { nome: catNome, cor: catCor, total: 0, count: 0, subs: {} };
    byCat[catId].total += Number(t.valor) || 0;
    byCat[catId].count++;

    const subId   = sub?.id || '__sem_sub';
    const subNome = sub?.apelido?.trim() || sub?.nome || 'Sem subcategoria';
    if (!byCat[catId].subs[subId]) byCat[catId].subs[subId] = { nome: subNome, total: 0, count: 0 };
    byCat[catId].subs[subId].total += Number(t.valor) || 0;
    byCat[catId].subs[subId].count++;
  });

  const cats = Object.entries(byCat)
    .map(([id, d]) => ({
      id,
      ...d,
      subsArr: Object.values(d.subs).sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);

  const totalDesp = cats.reduce((s, c) => s + c.total, 0);
  const nTrans    = cats.reduce((s, c) => s + c.count, 0);
  const topCat    = cats[0];
  const avgTrans  = nTrans > 0 ? totalDesp / nTrans : 0;

  document.getElementById('cat-kpis').innerHTML = [
    kpiCard('Total despesas',  formatCurrency(totalDesp, 'BRL'), 'danger',  '−'),
    kpiCard('Nº transações',   String(nTrans),                   'info',    '#'),
    kpiCard('Maior categoria', topCat ? topCat.nome : '—',       'warning', '★'),
    kpiCard('Ticket médio',    formatCurrency(avgTrans,  'BRL'), 'primary', '⌀'),
  ].join('');

  if (cats.length > 0) {
    document.getElementById('cat-donut').innerHTML = renderDonut(
      cats.map((c) => ({ label: c.nome, value: c.total, color: c.cor })),
      totalDesp,
    );
  } else {
    document.getElementById('cat-donut').innerHTML =
      '<p class="relat-empty-chart">Sem despesas no período</p>';
  }

  const allSubs = cats.flatMap((c) =>
    c.subsArr.map((s) => ({ ...s, catNome: c.nome, catCor: c.cor }))
  );
  const topSubs = allSubs.sort((a, b) => b.total - a.total).slice(0, 10);

  document.getElementById('cat-hbars').innerHTML = topSubs.length > 0
    ? renderHorizontalBars(topSubs, totalDesp)
    : '<p class="relat-empty-chart">Sem dados</p>';

  const rows = cats.flatMap((c) => {
    const pct = totalDesp > 0 ? (c.total / totalDesp) * 100 : 0;
    const catRow = `<tr class="relat-cat-group-row">
      <td><span class="cat-dot" style="background:${escapeHtml(c.cor)}"></span><strong>${escapeHtml(c.nome)}</strong></td>
      <td class="relat-td-num"><strong>${formatCurrencyHTML(c.total, 'BRL')}</strong></td>
      <td class="relat-td-num"><strong>${pct.toFixed(1)}%</strong></td>
      <td class="relat-td-num">${c.count}</td>
    </tr>`;
    const subRows = c.subsArr.map((s) => {
      const sPct = totalDesp > 0 ? (s.total / totalDesp) * 100 : 0;
      return `<tr class="relat-subcat-row">
        <td class="relat-subcat-indent">${escapeHtml(s.nome)}</td>
        <td class="relat-td-num">${formatCurrencyHTML(s.total, 'BRL')}</td>
        <td class="relat-td-num">${sPct.toFixed(1)}%</td>
        <td class="relat-td-num">${s.count}</td>
      </tr>`;
    });
    return [catRow, ...subRows];
  });

  document.getElementById('cat-tbody').innerHTML = rows.join('') ||
    '<tr><td colspan="4" class="relat-td-empty">Sem despesas no período</td></tr>';

  document.getElementById('cat-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Total</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalDesp, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>100%</strong></td>
    <td class="relat-td-num"><strong>${nTrans}</strong></td>
  </tr>`;
}

// -------------------------------------------------------
// Gráfico: Linha multi-série  (com tooltips e pontos em cada mês)
// -------------------------------------------------------
function renderLineChart(series, labels) {
  if (!labels.length) return '';
  const W = 600, H = 280, padL = 72, padR = 20, padT = 20, padB = 38;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = labels.length;

  const allValues = series.flatMap((s) => s.values);
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues, 0);
  const spread = rawMax - rawMin || 1;
  const yMin   = rawMin - spread * 0.12;
  const yMax   = rawMax + spread * 0.12;
  const yRange = yMax - yMin;

  const getX = (i) => padL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const getY = (v) => padT + plotH - ((v - yMin) / yRange) * plotH;

  const nTicks = 5;
  const ticks  = Array.from({ length: nTicks + 1 }, (_, i) => yMin + (yRange / nTicks) * i);

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="relat-chart-svg" aria-hidden="true">`;

  // Grade e labels Y
  ticks.forEach((tick) => {
    const y = getY(tick).toFixed(1);
    svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--color-border)" stroke-width="1"/>`;
    svg += `<text x="${padL - 6}" y="${y}" text-anchor="end" dominant-baseline="middle" class="relat-axis-label">${fmtAxisVal(tick)}</text>`;
  });

  // Linha zero
  const zeroY = getY(0);
  if (zeroY > padT && zeroY < padT + plotH) {
    svg += `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W - padR}" y2="${zeroY.toFixed(1)}" stroke="var(--color-text-muted)" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.6"/>`;
  }

  // Labels X
  const skipEvery = Math.ceil(n / 14);
  labels.forEach((label, i) => {
    if (i % skipEvery !== 0 && i !== n - 1) return;
    svg += `<text x="${getX(i).toFixed(1)}" y="${(padT + plotH + 14).toFixed(1)}" text-anchor="middle" class="relat-axis-label">${escapeHtml(label)}</text>`;
  });

  // Séries
  series.forEach((s, si) => {
    const pts   = s.values.map((v, i) => [getX(i), getY(v)]);
    const pathD = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const baseY = (padT + plotH).toFixed(1);
    const areaD = `${pathD} L${getX(n - 1).toFixed(1)},${baseY} L${getX(0).toFixed(1)},${baseY} Z`;
    const gid   = `lcg${si}`;
    const dashAttr = s.dash ? 'stroke-dasharray="6 4"' : '';

    svg += `<defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${s.color}" stop-opacity="${s.dash ? 0.08 : 0.18}"/>
      <stop offset="100%" stop-color="${s.color}" stop-opacity="0"/>
    </linearGradient></defs>`;
    if (!s.dash) svg += `<path d="${areaD}" fill="url(#${gid})"/>`;
    svg += `<path d="${pathD}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ${dashAttr}/>`;

    // Pontos em cada mês com tooltip nativo
    pts.forEach(([x, y], i) => {
      const isLast = i === pts.length - 1;
      const tip = `${s.label} — ${escapeHtml(labels[i])}: ${formatCurrency(s.values[i], 'BRL')}`;
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isLast ? 4.5 : 3}" fill="${s.color}" opacity="${isLast ? 1 : 0.75}" style="cursor:default">
        <title>${tip}</title>
      </circle>`;
    });
  });

  svg += `</svg>`;
  return svg;
}

// -------------------------------------------------------
// Gráfico: Barras agrupadas  (com tooltips)
// -------------------------------------------------------
function renderGroupedBars(cats) {
  if (!cats.length) return '';
  const W = 600, H = 300, padL = 72, padR = 20, padT = 20, padB = 60;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = cats.length;

  const maxVal = Math.max(...cats.flatMap((c) => [c.previsto, c.realizado]), 1);
  const getY   = (v) => padT + plotH - (v / maxVal) * plotH;
  const ticks  = Array.from({ length: 5 + 1 }, (_, i) => (maxVal / 5) * i);
  const groupW = plotW / n;
  const barW   = Math.min(groupW * 0.33, 26);
  const gap    = barW * 0.35;

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="relat-chart-svg" aria-hidden="true">`;

  ticks.forEach((tick) => {
    const y = getY(tick).toFixed(1);
    svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--color-border)" stroke-width="1"/>`;
    svg += `<text x="${padL - 6}" y="${y}" text-anchor="end" dominant-baseline="middle" class="relat-axis-label">${fmtAxisVal(tick)}</text>`;
  });

  cats.forEach((c, i) => {
    const cx   = padL + i * groupW + groupW / 2;
    const xPrev = cx - gap / 2 - barW;
    const xReal = cx + gap / 2;

    const yPrev = getY(c.previsto).toFixed(1);
    const yReal = getY(c.realizado).toFixed(1);
    const hPrev = Math.max((padT + plotH) - Number(yPrev), 1).toFixed(1);
    const hReal = Math.max((padT + plotH) - Number(yReal), 1).toFixed(1);
    const realColor = c.realizado > c.previsto ? 'var(--color-danger)' : 'var(--color-success)';

    svg += `<rect x="${xPrev.toFixed(1)}" y="${yPrev}" width="${barW}" height="${hPrev}" rx="3" fill="var(--color-info)" opacity="0.8" style="cursor:default">
      <title>Previsto — ${escapeHtml(c.nome)}: ${formatCurrency(c.previsto, 'BRL')}</title>
    </rect>`;
    svg += `<rect x="${xReal.toFixed(1)}" y="${yReal}" width="${barW}" height="${hReal}" rx="3" fill="${realColor}" opacity="0.85" style="cursor:default">
      <title>Realizado — ${escapeHtml(c.nome)}: ${formatCurrency(c.realizado, 'BRL')}</title>
    </rect>`;

    const label = c.nome.length > 11 ? c.nome.slice(0, 10) + '…' : c.nome;
    svg += `<text x="${cx.toFixed(1)}" y="${(H - padB + 16).toFixed(1)}" text-anchor="middle" class="relat-axis-label">${escapeHtml(label)}</text>`;
  });

  svg += `</svg>`;
  svg += `<div class="relat-legend" style="margin-top:var(--space-2)">
    <span class="relat-legend-item"><span class="relat-legend-dot" style="background:var(--color-info)"></span>Previsto</span>
    <span class="relat-legend-item"><span class="relat-legend-dot" style="background:var(--color-success)"></span>Realizado ≤ previsto</span>
    <span class="relat-legend-item"><span class="relat-legend-dot" style="background:var(--color-danger)"></span>Realizado > previsto</span>
  </div>`;
  return svg;
}

// -------------------------------------------------------
// Gráfico: Donut  (com tooltips)
// -------------------------------------------------------
function renderDonut(items, total) {
  if (!items.length || total === 0) return '';
  const cx = 90, cy = 90, r = 64, strokeW = 22;
  const C  = 2 * Math.PI * r;

  const top    = items.slice(0, 8);
  const others = total - top.reduce((s, i) => s + i.value, 0);
  const slices = others > 0.01
    ? [...top, { label: 'Outros', value: others, color: 'var(--color-text-muted)' }]
    : top;

  let cumulFrac = 0;
  let arcs = '';

  slices.forEach((item) => {
    const frac  = total > 0 ? item.value / total : 0;
    const dash  = frac * C;
    const angle = cumulFrac * 360 - 90;
    const pct   = (frac * 100).toFixed(1);
    const color = item.color || 'var(--color-primary)';

    arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${color}" stroke-width="${strokeW}"
      stroke-dasharray="${dash.toFixed(2)} ${C.toFixed(2)}"
      transform="rotate(${angle.toFixed(2)} ${cx} ${cy})"
      style="cursor:default">
      <title>${escapeHtml(item.label)}: ${formatCurrency(item.value, 'BRL')} (${pct}%)</title>
    </circle>`;

    cumulFrac += frac;
  });

  let html = `<div class="relat-donut-wrap">
    <svg viewBox="0 0 180 180" class="relat-donut-svg" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--color-surface-alt)" stroke-width="${strokeW}"/>
      ${arcs}
      <text x="${cx}" y="${cy - 5}" text-anchor="middle" class="relat-donut-center-val">${formatCurrency(total, 'BRL')}</text>
      <text x="${cx}" y="${cy + 13}" text-anchor="middle" class="relat-donut-center-sub">total</text>
    </svg>
    <div class="relat-donut-legend">`;

  slices.forEach((item) => {
    const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0';
    html += `<div class="relat-donut-legend-item">
      <span class="relat-donut-legend-dot" style="background:${escapeHtml(item.color || 'var(--color-primary)')}"></span>
      <span class="relat-donut-legend-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
      <span class="relat-donut-legend-pct">${pct}%</span>
    </div>`;
  });

  html += `</div></div>`;
  return html;
}

// -------------------------------------------------------
// Gráfico: Barras horizontais
// -------------------------------------------------------
function renderHorizontalBars(items, total) {
  return items.map((item) => {
    const pct = total > 0 ? (item.total / total * 100) : 0;
    return `<div class="relat-hbar-row" title="${escapeHtml(item.nome)}: ${formatCurrency(item.total, 'BRL')} (${pct.toFixed(1)}%)">
      <div class="relat-hbar-label">${escapeHtml(item.nome)}</div>
      <div class="relat-hbar-track">
        <div class="relat-hbar-fill" style="width:${pct.toFixed(1)}%;background:${escapeHtml(item.catCor || 'var(--color-primary)')}"></div>
      </div>
      <div class="relat-hbar-val">${formatCurrencyHTML(item.total, 'BRL')}</div>
    </div>`;
  }).join('');
}

// -------------------------------------------------------
// KPI Card
// -------------------------------------------------------
function kpiCard(label, value, colorKey, icon) {
  const colorMap = {
    success: 'var(--color-success)',
    danger:  'var(--color-danger)',
    warning: 'var(--color-warning)',
    info:    'var(--color-info)',
    primary: 'var(--color-primary)',
  };
  const color = colorMap[colorKey] || 'var(--color-primary)';
  return `<div class="relat-kpi">
    <div class="relat-kpi-icon" style="color:${color}" aria-hidden="true">${icon}</div>
    <div class="relat-kpi-val" style="color:${color}">${escapeHtml(String(value))}</div>
    <div class="relat-kpi-label">${escapeHtml(label)}</div>
  </div>`;
}

// -------------------------------------------------------
// Legenda de série
// -------------------------------------------------------
function renderLegend(series) {
  const items = series.map((s) =>
    `<span class="relat-legend-item">
       <span class="relat-legend-dot" style="background:${s.color}${s.dash ? ';opacity:0.7' : ''}${s.dash ? ';outline:1px dashed '+s.color : ''}"></span>
       ${escapeHtml(s.label)}${s.dash ? ' ¹' : ''}
     </span>`
  ).join('');
  const hasTransf = series.some((s) => s.dash);
  const note = hasTransf
    ? `<p class="relat-footnote">¹ Transferências não afetam o saldo — mostradas apenas como referência.</p>`
    : '';
  return `<div class="relat-legend">${items}</div>${note}`;
}

// -------------------------------------------------------
// Exportação
// -------------------------------------------------------
function getActiveTable() {
  if (activeTab === 'compromissos') {
    const compMap = {
      cartoes:     'cartoes-table',
      tipopgto:    'tipopgto-table',
      calendario:  'cal-table',
      cumprimento: 'cump-table',
      inativos:    'inat-table',
    };
    return document.getElementById(compMap[activeSubtabComp]);
  }
  if (activeTab === 'contas') {
    const contasMap = {
      saldos:       'saldos-table',
      evolucao:     'evol-table',
      movimentacao: 'mov-table',
    };
    return document.getElementById(contasMap[activeSubtabContas]);
  }
  if (activeTab === 'dividas') {
    const divMap = {
      visao:     'div-visao-table',
      apagar:    'div-apagar-table',
      areceber:  'div-areceber-table',
      historico: 'div-hist-table',
    };
    return document.getElementById(divMap[activeSubtabDiv]);
  }
  if (activeTab === 'investimentos') {
    const invMap = {
      visao:     'inv-visao-table',
      progresso: 'inv-prog-table',
      aportes:   'inv-aportes-table',
    };
    return document.getElementById(invMap[activeSubtabInv]);
  }
  if (activeTab === 'saude') {
    const saudeMap = {
      indicadores: 'saude-ind-table',
      comparativo: 'saude-comp-table',
      tendencias:  'saude-tend-table',
    };
    return document.getElementById(saudeMap[activeSubtabSaude]);
  }
  if (activeTab === 'patrimonio') {
    const patrMap = {
      visao:      'patr-visao-table',
      composicao: 'patr-comp-table',
      evolucao:   'patr-evol-table',
    };
    return document.getElementById(patrMap[activeSubtabPatr]);
  }
  if (activeTab === 'fiscal') return document.getElementById('fiscal-table');
  const map = { fluxo: 'fluxo-table', previsto: 'previsto-table', categorias: 'cat-table' };
  return document.getElementById(map[activeTab]);
}

function exportCSV() {
  const table = getActiveTable();
  if (!table) return;
  const rows = [...table.querySelectorAll('tr')].map((tr) =>
    [...tr.querySelectorAll('th, td')]
      .map((cell) => `"${cell.textContent.trim().replace(/\s+/g, ' ').replace(/"/g, '""')}"`)
      .join(',')
  );
  triggerDownload(
    new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' }),
    `finflow-${activeTab}-${toISODate(today)}.csv`,
  );
  showToast(t('relatorios.toast.csv_exportado', 'CSV exportado'), 'success');
}

async function exportExcel() {
  const table = getActiveTable();
  if (!table) return;

  const ok = await loadSheetJs();
  if (!ok || !window.XLSX) {
    showToast(t('relatorios.toast.sheetjs_falhou', 'Não foi possível carregar SheetJS para exportar XLSX'), 'error', 6000);
    return;
  }

  const wb = window.XLSX.utils.book_new();
  const ws = window.XLSX.utils.table_to_sheet(table);
  window.XLSX.utils.book_append_sheet(wb, ws, activeTab);
  window.XLSX.writeFile(wb, `finflow-${activeTab}-${toISODate(today)}.xlsx`);
  showToast(t('relatorios.toast.xlsx_exportado', 'Excel (.xlsx) exportado'), 'success');
}

async function loadSheetJs() {
  if (window.XLSX) return true;
  showToast(t('relatorios.toast.carregando_sheetjs', 'Carregando SheetJS…'), 'info', 3000);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function exportPDF() {
  document.body.dataset.printReport = activeTab;
  window.print();
  delete document.body.dataset.printReport;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url;  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// -------------------------------------------------------
// Utilitários
// -------------------------------------------------------
function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtAxisVal(val) {
  const abs  = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}k`;
  return `${sign}${abs.toFixed(0)}`;
}

// =============================================================
// GRUPO: COMPROMISSOS (R-05 a R-09)
// =============================================================

async function loadSubsCompletas() {
  if (_subsCompletas) return _subsCompletas;
  const { data, error } = await supabase
    .from('subcategorias')
    .select(`
      id, nome, tipo, tipo_pagamento, valor_base, vencimento_dia,
      dia_semana, periodo, status, conta_id, categoria_id, moeda, terminado_em,
      categorias(id, nome, cor, grupo),
      contas!categorias_conta_id_fkey(id, nome, apelido, tipo, limite)
    `)
    .neq('status', 'arquivada')
    .order('nome');
  if (error) console.warn('[loadSubsCompletas]', error);
  _subsCompletas = data || [];
  return _subsCompletas;
}

async function loadSubsArquivadas() {
  if (_subsArquivadas) return _subsArquivadas;
  const { data, error } = await supabase
    .from('subcategorias')
    .select(`
      id, nome, tipo, tipo_pagamento, valor_base, vencimento_dia,
      periodo, status, conta_id, categoria_id, moeda, terminado_em,
      categorias(id, nome, cor, grupo),
      contas!categorias_conta_id_fkey(id, nome, apelido, tipo)
    `)
    .eq('status', 'arquivada')
    .order('terminado_em', { ascending: false });
  if (error) console.warn('[loadSubsArquivadas]', error);
  _subsArquivadas = data || [];
  return _subsArquivadas;
}

async function renderCompromissos() {
  const subs = await loadSubsCompletas();
  if (activeSubtabComp === 'cartoes')      renderCartoes(subs);
  else if (activeSubtabComp === 'tipopgto')    renderTipoPgto(subs);
  else if (activeSubtabComp === 'calendario')  renderCalendario(subs);
  else if (activeSubtabComp === 'cumprimento') renderCumprimento();
  else if (activeSubtabComp === 'inativos')    await renderInativos(subs);
}

// -------------------------------------------------------
// R-05: Compromissos por cartão de crédito
// -------------------------------------------------------
function renderCartoes(subs) {
  const cartaoSubs = subs.filter((s) =>
    s.tipo_pagamento === 'Crédito' || s.contas?.tipo === 'Cartão de Crédito'
  );

  const byCartao = {};
  cartaoSubs.forEach((s) => {
    const conta = s.contas;
    const key   = conta?.id || '__sem_cartao';
    const nome  = conta ? (conta.apelido?.trim() || conta.nome) : 'Cartão não especificado';
    const limite = Number(conta?.limite) || 0;
    if (!byCartao[key]) byCartao[key] = { nome, subs: [], total: 0, limite };
    byCartao[key].subs.push(s);
    byCartao[key].total += Number(s.valor_base) || 0;
  });

  const cartoes   = Object.values(byCartao).sort((a, b) => b.total - a.total);
  const totalGeral  = cartoes.reduce((s, c) => s + c.total, 0);
  const totalLimite = cartoes.reduce((s, c) => s + c.limite, 0);
  const pctLimGeral = totalLimite > 0 ? (totalGeral / totalLimite * 100) : 0;

  const limTone = pctLimGeral >= 80 ? 'danger' : pctLimGeral >= 50 ? 'warning' : 'success';
  const limValue = totalLimite > 0
    ? `${pctLimGeral.toFixed(0)}% de ${formatCurrency(totalLimite, 'BRL')}`
    : '—';

  document.getElementById('cartoes-kpis').innerHTML = [
    kpiCard('Total em cartões/mês',  formatCurrency(totalGeral, 'BRL'),                          'warning', '💳'),
    kpiCard('Limite usado',          limValue,                                                    limTone,   '◔'),
    kpiCard('Compromissos',          String(cartaoSubs.length),                                   'info',    '#'),
    kpiCard('Cartões diferentes',    String(cartoes.length),                                      'primary', '▤'),
  ].join('');

  document.getElementById('cartoes-hbars').innerHTML = cartoes.length > 0
    ? renderHorizontalBars(cartoes.map((c) => ({ nome: c.nome, total: c.total, catCor: 'var(--color-warning)' })), totalGeral)
    : '<p class="relat-empty-chart">Nenhum compromisso vinculado a cartão de crédito.</p>';

  let tbody = '';
  cartoes.forEach((c) => {
    const pct = c.limite > 0 ? (c.total / c.limite * 100) : 0;
    const pctClamped = Math.min(100, pct);
    const barColor = pct >= 80 ? 'var(--color-danger)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-success)';
    const limCell = c.limite > 0
      ? `<div class="relat-card-limit">
           <span class="relat-card-limit-text">${formatCurrency(c.total, 'BRL')} / ${formatCurrency(c.limite, 'BRL')}</span>
           <div class="relat-card-limit-bar"><div class="relat-card-limit-fill" style="width:${pctClamped.toFixed(1)}%;background:${barColor}"></div></div>
           <strong class="relat-card-limit-pct" style="color:${barColor}">${pct.toFixed(0)}%</strong>
         </div>`
      : '<span class="relat-text-muted" style="font-size:var(--fs-xs)">Sem limite</span>';
    tbody += `<tr class="relat-cat-group-row">
      <td colspan="5">
        <div class="relat-card-row">
          <strong>💳 ${escapeHtml(c.nome)}</strong>
          ${limCell}
        </div>
      </td>
    </tr>`;
    c.subs.forEach((s) => {
      const catNome = s.categorias?.nome || '—';
      const catCor  = s.categorias?.cor  || 'var(--color-text-muted)';
      const disp    = s.apelido?.trim() || s.nome;
      const venc    = s.vencimento_dia ? `Dia ${s.vencimento_dia}` : '—';
      tbody += `<tr class="relat-subcat-row">
        <td class="relat-subcat-indent">${escapeHtml(disp)}</td>
        <td><span class="cat-dot" style="background:${escapeHtml(catCor)}"></span>${escapeHtml(catNome)}</td>
        <td>${escapeHtml(s.periodo || '—')}</td>
        <td class="relat-td-num relat-text-muted">${venc}</td>
        <td class="relat-td-num">${formatCurrencyHTML(Number(s.valor_base) || 0, s.moeda || 'BRL')}</td>
      </tr>`;
    });
  });

  document.getElementById('cartoes-tbody').innerHTML = tbody ||
    '<tr><td colspan="5" class="relat-td-empty">Nenhum compromisso vinculado a cartão de crédito. Cadastre compromissos com tipo de pagamento "Crédito" ou conta do tipo Cartão.</td></tr>';
  document.getElementById('cartoes-tfoot').innerHTML = `<tr class="relat-total-row">
    <td colspan="4"><strong>Total mensal em cartões</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalGeral, 'BRL')}</strong></td>
  </tr>`;
}

// -------------------------------------------------------
// R-06: Por tipo de pagamento
// -------------------------------------------------------
function renderTipoPgto(subs) {
  const byTipo = {};
  subs.forEach((s) => {
    const tipo = s.tipo_pagamento || 'Não definido';
    if (!byTipo[tipo]) byTipo[tipo] = { nome: tipo, subs: [], total: 0, count: 0 };
    byTipo[tipo].subs.push(s);
    byTipo[tipo].total += Number(s.valor_base) || 0;
    byTipo[tipo].count++;
  });

  const tipos = Object.values(byTipo)
    .map((t) => ({ ...t, color: TIPO_PGTO_COLORS[t.nome] || 'var(--color-primary)' }))
    .sort((a, b) => b.total - a.total);

  const totalGeral = tipos.reduce((s, t) => s + t.total, 0);
  const nTotal     = subs.length;

  document.getElementById('tipopgto-kpis').innerHTML = [
    kpiCard('Total comprometido/mês', formatCurrency(totalGeral, 'BRL'), 'primary', '₢'),
    kpiCard('Compromissos ativos',    String(nTotal),                    'info',    '#'),
    kpiCard('Tipos diferentes',       String(tipos.length),              'primary', '▤'),
    kpiCard('Maior volume',           tipos[0]?.nome || '—',            'warning', '★'),
  ].join('');

  document.getElementById('tipopgto-donut').innerHTML = tipos.length > 0
    ? renderDonut(tipos.map((t) => ({ label: t.nome, value: t.count, color: t.color })), nTotal)
    : '<p class="relat-empty-chart">Sem dados</p>';

  document.getElementById('tipopgto-hbars').innerHTML = tipos.length > 0
    ? renderHorizontalBars(tipos.map((t) => ({ nome: t.nome, total: t.total, catCor: t.color })), totalGeral)
    : '<p class="relat-empty-chart">Sem dados</p>';

  let tbody = '';
  tipos.forEach((t) => {
    const pct = totalGeral > 0 ? (t.total / totalGeral * 100).toFixed(1) : '0';
    tbody += `<tr class="relat-cat-group-row">
      <td colspan="2">
        <span class="relat-legend-dot" style="background:${escapeHtml(t.color)}"></span>
        <strong>${escapeHtml(t.nome)}</strong>
        <span class="relat-text-muted" style="font-size:var(--fs-xs);margin-left:6px">${t.count} compromisso${t.count !== 1 ? 's' : ''} · ${pct}%</span>
      </td>
      <td class="relat-td-num"><strong>${formatCurrencyHTML(t.total, 'BRL')}</strong></td>
    </tr>`;
    t.subs.forEach((s) => {
      tbody += `<tr class="relat-subcat-row">
        <td class="relat-subcat-indent">${escapeHtml(s.apelido?.trim() || s.nome)}</td>
        <td>${escapeHtml(s.categorias?.nome || '—')}</td>
        <td class="relat-td-num">${formatCurrencyHTML(Number(s.valor_base) || 0, s.moeda || 'BRL')}</td>
      </tr>`;
    });
  });

  document.getElementById('tipopgto-tbody').innerHTML = tbody ||
    '<tr><td colspan="3" class="relat-td-empty">Nenhum compromisso ativo</td></tr>';
  document.getElementById('tipopgto-tfoot').innerHTML = `<tr class="relat-total-row">
    <td colspan="2"><strong>Total</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalGeral, 'BRL')}</strong></td>
  </tr>`;
}

// -------------------------------------------------------
// R-07: Calendário de vencimentos por dia do mês
// -------------------------------------------------------
function renderCalendario(subs) {
  const byDay = {};
  let totalMensal = 0;

  subs
    .filter((s) => s.vencimento_dia && ['Mensal', 'Anual'].includes(s.periodo))
    .forEach((s) => {
      const d = s.vencimento_dia;
      if (!byDay[d]) byDay[d] = { subs: [], total: 0 };
      byDay[d].subs.push(s);
      byDay[d].total += Number(s.valor_base) || 0;
      if (s.periodo === 'Mensal') totalMensal += Number(s.valor_base) || 0;
    });

  const daysWithSubs = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  const maxDayVal    = daysWithSubs.length > 0 ? Math.max(...Object.values(byDay).map((d) => d.total)) : 1;
  const nComp        = Object.values(byDay).reduce((s, d) => s + d.subs.length, 0);
  const diaHot       = daysWithSubs.length > 0
    ? daysWithSubs.reduce((a, b) => byDay[a].total > byDay[b].total ? a : b)
    : null;

  document.getElementById('cal-kpis').innerHTML = [
    kpiCard('Total mensal fixo',     formatCurrency(totalMensal, 'BRL'),    'danger',  '−'),
    kpiCard('Compromissos c/ dia',   String(nComp),                         'info',    '#'),
    kpiCard('Dias com vencimento',   String(daysWithSubs.length),           'primary', '📅'),
    kpiCard('Dia mais pesado',       diaHot ? `Dia ${diaHot}` : '—',       'warning', '★'),
  ].join('');

  // Grade visual 1-31
  let grid = '<div class="relat-day-grid">';
  for (let d = 1; d <= 31; d++) {
    const data = byDay[d];
    if (data) {
      const intensity = maxDayVal > 0 ? data.total / maxDayVal : 0;
      const opacity   = Math.max(0.12, intensity * 0.8);
      const items     = data.subs.map((s) => {
        const cor  = s.categorias?.cor || 'var(--color-primary)';
        const disp = s.apelido?.trim() || s.nome;
        const val  = formatCurrency(Number(s.valor_base) || 0, s.moeda || 'BRL');
        return `<span class="relat-day-item" style="border-left:3px solid ${escapeHtml(cor)}" title="${escapeHtml(disp)}: ${val}">${escapeHtml(disp.length > 15 ? disp.slice(0, 14) + '…' : disp)}</span>`;
      }).join('');
      grid += `<div class="relat-day-cell relat-day-cell--active" style="--day-opacity:${opacity.toFixed(2)}">
        <div class="relat-day-num">${d}</div>
        <div class="relat-day-items">${items}</div>
        <div class="relat-day-total">${formatCurrencyHTML(data.total, 'BRL')}</div>
      </div>`;
    } else {
      grid += `<div class="relat-day-cell relat-day-cell--empty"><div class="relat-day-num relat-text-muted">${d}</div></div>`;
    }
  }
  grid += '</div>';
  document.getElementById('cal-grid').innerHTML = grid;

  const rows = daysWithSubs.map((d) => {
    const data  = byDay[d];
    const nomes = data.subs.map((s) => s.apelido?.trim() || s.nome).join(', ');
    return `<tr>
      <td><strong>Dia ${d}</strong></td>
      <td>${escapeHtml(nomes)}</td>
      <td class="relat-td-num">${data.subs.length}</td>
      <td class="relat-td-num">${formatCurrencyHTML(data.total, 'BRL')}</td>
    </tr>`;
  });

  document.getElementById('cal-tbody').innerHTML = rows.join('') ||
    '<tr><td colspan="4" class="relat-td-empty">Nenhum compromisso com dia fixo cadastrado. Adicione compromissos mensais com vencimento em um dia específico.</td></tr>';
}

// -------------------------------------------------------
// R-08: Taxa de cumprimento de pagamentos
// -------------------------------------------------------
function renderCumprimento() {
  const byMonth = {};

  allPagamentos.forEach((p) => {
    const key = (p.mes_ano || p.data_vencimento || '').slice(0, 7);
    if (!key) return;
    if (!byMonth[key]) byMonth[key] = { total: 0, pagos: 0, pendentes: 0, cancelados: 0 };
    byMonth[key].total++;
    if (PAID_STATUSES.has(p.status))                      byMonth[key].pagos++;
    else if (p.status === 'Agendado' || p.status === 'A Transferir') byMonth[key].pendentes++;
    else if (p.status === 'Cancelado')                    byMonth[key].cancelados++;
  });

  const months    = Object.keys(byMonth).sort();
  const totTotal  = months.reduce((s, k) => s + byMonth[k].total,     0);
  const totPagos  = months.reduce((s, k) => s + byMonth[k].pagos,     0);
  const totPend   = months.reduce((s, k) => s + byMonth[k].pendentes, 0);
  const totCancel = months.reduce((s, k) => s + byMonth[k].cancelados, 0);
  const den       = totTotal - totCancel;
  const avgPct    = den > 0 ? (totPagos / den * 100) : 0;

  document.getElementById('cump-kpis').innerHTML = [
    kpiCard('Total de pagamentos',    String(totTotal),                 'info',    '#'),
    kpiCard('Pagos',                  String(totPagos),                 'success', '✓'),
    kpiCard('Pendentes',              String(totPend),                  'warning', '⏳'),
    kpiCard('Taxa média de execução', `${avgPct.toFixed(1)}%`,
      avgPct >= 80 ? 'success' : avgPct >= 50 ? 'warning' : 'danger', '%'),
  ].join('');

  if (months.length > 0) {
    const labels = months.map((k) => {
      const [y, mo] = k.split('-');
      return `${MONTH_LABELS[Number(mo) - 1]}/${y.slice(2)}`;
    });
    const pctVals = months.map((k) => {
      const m = byMonth[k];
      const d = m.total - m.cancelados;
      return d > 0 ? (m.pagos / d * 100) : 0;
    });
    document.getElementById('cump-chart').innerHTML =
      renderLineChart([{ label: 'Execução (%)', color: 'var(--color-success)', values: pctVals, dash: false }], labels) +
      renderLegend([{ label: 'Taxa de execução (%)', color: 'var(--color-success)', dash: false }]);
  } else {
    document.getElementById('cump-chart').innerHTML =
      '<p class="relat-empty-chart">Sem pagamentos no período selecionado.</p>';
  }

  const rows = months.map((k) => {
    const m   = byMonth[k];
    const [y, mo] = k.split('-');
    const label   = `${MONTH_LABELS_LONG[Number(mo) - 1]} ${y}`;
    const d       = m.total - m.cancelados;
    const pct     = d > 0 ? (m.pagos / d * 100).toFixed(1) + '%' : '—';
    const pctCls  = d > 0 ? (m.pagos / d >= 0.8 ? 'relat-text-success' : m.pagos / d >= 0.5 ? '' : 'relat-text-danger') : '';
    return `<tr>
      <td>${escapeHtml(label)}</td>
      <td class="relat-td-num">${m.total}</td>
      <td class="relat-td-num relat-text-success">${m.pagos}</td>
      <td class="relat-td-num relat-text-muted">${m.pendentes}</td>
      <td class="relat-td-num relat-text-muted">${m.cancelados}</td>
      <td class="relat-td-num ${pctCls}">${pct}</td>
    </tr>`;
  });

  document.getElementById('cump-tbody').innerHTML = rows.join('') ||
    '<tr><td colspan="6" class="relat-td-empty">Sem pagamentos no período selecionado. Mude o filtro de período para ver o histórico de execução.</td></tr>';
  document.getElementById('cump-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Total / Média</strong></td>
    <td class="relat-td-num"><strong>${totTotal}</strong></td>
    <td class="relat-td-num relat-text-success"><strong>${totPagos}</strong></td>
    <td class="relat-td-num"><strong>${totPend}</strong></td>
    <td class="relat-td-num"><strong>${totCancel}</strong></td>
    <td class="relat-td-num"><strong>${avgPct.toFixed(1)}%</strong></td>
  </tr>`;
}

// -------------------------------------------------------
// R-09: Inativos / Arquivados
// -------------------------------------------------------
async function renderInativos(subsAtivas) {
  const arquivadas = await loadSubsArquivadas();
  const inativas   = (subsAtivas || []).filter((s) => s.status === 'inativa');

  const nArq  = arquivadas.length;
  const nInat = inativas.length;
  const totArq  = arquivadas.reduce((s, x) => s + (Number(x.valor_base) || 0), 0);
  const totInat = inativas.reduce((s,  x) => s + (Number(x.valor_base) || 0), 0);

  document.getElementById('inat-kpis').innerHTML = [
    kpiCard('Arquivados',      String(nArq),                      'danger',  '✗'),
    kpiCard('Inativos',        String(nInat),                     'warning', '⏸'),
    kpiCard('Valor arquivado', formatCurrency(totArq,  'BRL'),    'danger',  '₢'),
    kpiCard('Valor inativo',   formatCurrency(totInat, 'BRL'),    'warning', '₢'),
  ].join('');

  const makeRow = (s, label, cls) => {
    const catNome   = s.categorias?.nome || '—';
    const catCor    = s.categorias?.cor  || 'var(--color-text-muted)';
    const disp      = s.apelido?.trim() || s.nome;
    const encerrado = s.terminado_em ? formatDateBR(s.terminado_em) : '—';
    return `<tr>
      <td><span class="cat-dot" style="background:${escapeHtml(catCor)}"></span>${escapeHtml(disp)}</td>
      <td>${escapeHtml(catNome)}</td>
      <td>${escapeHtml(s.tipo || '—')}</td>
      <td>${escapeHtml(s.periodo || '—')}</td>
      <td class="relat-td-num">${formatCurrencyHTML(Number(s.valor_base) || 0, s.moeda || 'BRL')}</td>
      <td><span class="status-pill ${cls}">${label}</span></td>
      <td class="relat-text-muted">${encerrado}</td>
    </tr>`;
  };

  const sHdr = (label, cor) =>
    `<tr class="relat-section-header"><td colspan="7"><span style="color:${cor};font-weight:600">${label}</span></td></tr>`;

  let tbody = '';
  if (arquivadas.length > 0) {
    tbody += sHdr('Arquivados', 'var(--color-danger)');
    tbody += arquivadas.map((s) => makeRow(s, 'Arquivado', 'status-arquivada')).join('');
  }
  if (inativas.length > 0) {
    tbody += sHdr('Inativos', 'var(--color-warning)');
    tbody += inativas.map((s) => makeRow(s, 'Inativo', 'status-inativa')).join('');
  }

  document.getElementById('inat-tbody').innerHTML = tbody ||
    '<tr><td colspan="7" class="relat-td-empty">Nenhum compromisso arquivado ou inativo encontrado.</td></tr>';
  document.getElementById('inat-tfoot').innerHTML = `<tr class="relat-total-row">
    <td colspan="4"><strong>Total (arquivados + inativos)</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totArq + totInat, 'BRL')}</strong></td>
    <td colspan="2"></td>
  </tr>`;
}

// =======================================================
// GRUPO: CONTAS & SALDOS (R-10 / R-11 / R-12)
// =======================================================

async function loadContasAtivas() {
  if (_contasAtivas) return _contasAtivas;
  const { data, error } = await supabase
    .from('contas')
    .select('id, nome, apelido, tipo, descricao, moeda, limite, status')
    .neq('status', 'arquivada')
    .order('nome');
  if (error) console.warn('[loadContasAtivas]', error);
  _contasAtivas = data || [];
  return _contasAtivas;
}

async function loadSaldosAtuais(contas) {
  if (_saldosAtuais) return _saldosAtuais;
  const ids = contas.map((c) => c.id);
  if (!ids.length) { _saldosAtuais = new Map(); return _saldosAtuais; }
  const { data, error } = await supabase
    .from('transacoes')
    .select('conta_id, tipo, valor, conta_destino_id, transferencia_par_id, reconciliacao_status')
    .in('conta_id', ids)
    .neq('reconciliacao_status', 'importado');
  if (error) console.warn('[loadSaldosAtuais]', error);

  const map = new Map();
  for (const c of contas) map.set(c.id, 0);
  for (const tr of (data || [])) {
    const cur = map.get(tr.conta_id) ?? 0;
    const isEntrada = tr.tipo === 'Receita'
      || (tr.tipo === 'Transferência' && tr.transferencia_par_id && !tr.conta_destino_id);
    const isSaida = tr.tipo === 'Despesa'
      || (tr.tipo === 'Transferência' && !!tr.conta_destino_id);
    if (isEntrada) map.set(tr.conta_id, cur + Number(tr.valor || 0));
    else if (isSaida) map.set(tr.conta_id, cur - Number(tr.valor || 0));
  }
  _saldosAtuais = map;
  return _saldosAtuais;
}

async function loadSnapshotsBancarios(contaIds) {
  if (_snapshotsBancarios) return _snapshotsBancarios;
  if (!contaIds.length) { _snapshotsBancarios = new Map(); return _snapshotsBancarios; }
  try {
    const { loadLatestSnapshots } = await import('../lib/saldos-bancarios.js');
    const map = await loadLatestSnapshots(contaIds);
    _snapshotsBancarios = map || new Map();
  } catch (e) {
    console.warn('[loadSnapshotsBancarios]', e);
    _snapshotsBancarios = new Map();
  }
  return _snapshotsBancarios;
}

async function renderContas() {
  if (activeSubtabContas === 'saldos')             await renderSaldos();
  else if (activeSubtabContas === 'evolucao')      await renderEvolucao();
  else if (activeSubtabContas === 'movimentacao')  await renderMovimentacao();
}

// -------------------------------------------------------
// R-10: Saldos atuais (snapshot do patrimônio em contas)
// -------------------------------------------------------
async function renderSaldos() {
  const contas = await loadContasAtivas();
  const saldos = await loadSaldosAtuais(contas);
  const snaps  = await loadSnapshotsBancarios(contas.map((c) => c.id));

  const enriched = contas.map((c) => {
    const nome  = c.apelido?.trim() || c.nome;
    const saldo = saldos.get(c.id) ?? 0;
    const snap  = snaps.get(c.id);
    return { ...c, displayName: nome, saldo, snapshot: snap };
  });

  // Cartão de Crédito não compõe patrimônio positivo (são contas de gasto)
  const positivos = enriched.filter((c) => c.tipo !== 'Cartão de Crédito');
  const totalPatrim = positivos.reduce((s, c) => s + (c.saldo || 0), 0);
  const totalDispon = positivos
    .filter((c) => TIPOS_DISPONIVEIS.has(c.tipo))
    .reduce((s, c) => s + (c.saldo || 0), 0);
  const totalCofrin = positivos
    .filter((c) => c.tipo === 'Cofrinho')
    .reduce((s, c) => s + (c.saldo || 0), 0);

  // KPIs
  document.getElementById('saldos-kpis').innerHTML = [
    kpiCard('Patrimônio em contas', formatCurrency(totalPatrim, 'BRL'), 'primary', '★'),
    kpiCard('Disponível',           formatCurrency(totalDispon, 'BRL'), 'success', '✓'),
    kpiCard('Em cofrinhos',         formatCurrency(totalCofrin, 'BRL'), 'info',    '◉'),
    kpiCard('Contas ativas',        String(contas.length),              'primary', '#'),
  ].join('');

  // Donut por tipo de conta (somando saldos positivos por tipo)
  const byTipo = {};
  positivos.forEach((c) => {
    const t = c.tipo || 'Outros';
    if (!byTipo[t]) byTipo[t] = { label: t, value: 0, color: CONTA_TIPO_COLORS[t] || 'var(--color-primary)' };
    byTipo[t].value += Math.max(0, c.saldo || 0);
  });
  const donutItems = Object.values(byTipo).filter((t) => t.value > 0).sort((a, b) => b.value - a.value);
  const donutTotal = donutItems.reduce((s, t) => s + t.value, 0);
  document.getElementById('saldos-donut').innerHTML = donutItems.length > 0
    ? renderDonut(donutItems, donutTotal)
    : '<p class="relat-empty-chart">Sem saldos positivos para distribuir.</p>';

  // Top contas (horizontal bars)
  const topContas = positivos
    .filter((c) => c.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 8);
  document.getElementById('saldos-hbars').innerHTML = topContas.length > 0
    ? renderHorizontalBars(
        topContas.map((c) => ({ nome: c.displayName, total: c.saldo, catCor: CONTA_TIPO_COLORS[c.tipo] || 'var(--color-primary)' })),
        topContas.reduce((s, c) => s + c.saldo, 0),
      )
    : '<p class="relat-empty-chart">Nenhuma conta com saldo positivo.</p>';

  // Tabela
  const ordered = [...positivos].sort((a, b) => b.saldo - a.saldo);
  let tbody = '';
  ordered.forEach((c) => {
    const pct = totalPatrim > 0 ? (c.saldo / totalPatrim * 100) : 0;
    const corTipo = CONTA_TIPO_COLORS[c.tipo] || 'var(--color-text-muted)';
    const saldoCls = c.saldo < 0 ? 'relat-text-danger' : c.saldo === 0 ? 'relat-text-muted' : '';
    tbody += `<tr>
      <td><strong>${escapeHtml(c.displayName)}</strong></td>
      <td><span class="cat-dot" style="background:${corTipo}"></span>${escapeHtml(c.tipo || '—')}</td>
      <td>${escapeHtml(c.descricao || '—')}</td>
      <td class="relat-td-num ${saldoCls}">${formatCurrencyHTML(c.saldo, c.moeda || 'BRL')}</td>
      <td class="relat-td-num relat-text-muted">${pct.toFixed(1)}%</td>
    </tr>`;
  });

  const cartoes = enriched.filter((c) => c.tipo === 'Cartão de Crédito');
  if (cartoes.length > 0) {
    tbody += `<tr class="relat-section-header"><td colspan="5">Cartões de crédito (não somam ao patrimônio)</td></tr>`;
    cartoes.forEach((c) => {
      const corTipo = CONTA_TIPO_COLORS[c.tipo];
      tbody += `<tr>
        <td>${escapeHtml(c.displayName)}</td>
        <td><span class="cat-dot" style="background:${corTipo}"></span>${escapeHtml(c.tipo)}</td>
        <td>${escapeHtml(c.descricao || '—')}</td>
        <td class="relat-td-num relat-text-muted">${c.limite ? 'Limite ' + formatCurrency(Number(c.limite), c.moeda || 'BRL') : '—'}</td>
        <td class="relat-td-num relat-text-muted">—</td>
      </tr>`;
    });
  }

  document.getElementById('saldos-tbody').innerHTML = tbody ||
    '<tr><td colspan="5" class="relat-td-empty">Nenhuma conta ativa cadastrada.</td></tr>';
  document.getElementById('saldos-tfoot').innerHTML = `<tr class="relat-total-row">
    <td colspan="3"><strong>Patrimônio total em contas</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalPatrim, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>100%</strong></td>
  </tr>`;
}

// -------------------------------------------------------
// R-11: Evolução do saldo no período
// -------------------------------------------------------
async function renderEvolucao() {
  const contas = await loadContasAtivas();
  const saldosFinais = await loadSaldosAtuais(contas);

  const transNoPeriodo = (allTransacoes || []).filter((tr) =>
    contas.find((c) => c.id === tr.conta_id) && tr.tipo !== 'Transferência',
  );

  // Soma transações no período por dia (a partir do que está em allTransacoes — já filtrado por range)
  const range = getDateRange();
  if (!range || !range.start) {
    document.getElementById('evol-kpis').innerHTML = '';
    document.getElementById('evol-chart').innerHTML = '<p class="relat-empty-chart">Selecione um período para ver a evolução.</p>';
    document.getElementById('evol-tbody').innerHTML = '';
    document.getElementById('evol-tfoot').innerHTML = '';
    return;
  }

  const dStart = new Date(range.start + 'T00:00:00');
  const dEnd   = new Date(range.end   + 'T00:00:00');
  const days   = [];
  for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  // Saldo final consolidado conhecido
  const saldoFinalAtual = Array.from(saldosFinais.values()).reduce((s, v) => s + (Number(v) || 0), 0);

  // Variação diária no período (Receita +, Despesa -)
  const deltaDia = new Map(days.map((d) => [d, 0]));
  transNoPeriodo.forEach((tr) => {
    if (!deltaDia.has(tr.data)) return;
    const v = Number(tr.valor) || 0;
    if (tr.tipo === 'Receita')  deltaDia.set(tr.data, deltaDia.get(tr.data) + v);
    if (tr.tipo === 'Despesa')  deltaDia.set(tr.data, deltaDia.get(tr.data) - v);
  });

  // Trabalha de trás pra frente: saldo final hoje = saldo no fim do período (aproximação)
  // saldo do dia D = saldo do dia D+1 - delta do dia D+1
  const saldosPorDia = new Map();
  // Soma deltas DEPOIS do range.end até hoje (transações fora do período carregado não temos — assumimos 0)
  let saldoFimRange = saldoFinalAtual;
  saldosPorDia.set(days[days.length - 1], saldoFimRange);
  for (let i = days.length - 2; i >= 0; i--) {
    const dNext = days[i + 1];
    const deltaNext = deltaDia.get(dNext) || 0;
    saldosPorDia.set(days[i], saldosPorDia.get(dNext) - deltaNext);
  }

  const valores = days.map((d) => saldosPorDia.get(d));
  const labels  = days.map((d) => {
    const [, m, dd] = d.split('-');
    return `${dd}/${m}`;
  });

  const saldoInicio = valores[0];
  const saldoFim    = valores[valores.length - 1];
  const variacao    = saldoFim - saldoInicio;
  const variacaoPct = saldoInicio !== 0 ? (variacao / Math.abs(saldoInicio) * 100) : 0;
  const pico        = Math.max(...valores);
  const vale        = Math.min(...valores);
  const varTone     = variacao > 0 ? 'success' : variacao < 0 ? 'danger' : 'primary';

  document.getElementById('evol-kpis').innerHTML = [
    kpiCard('Saldo inicial', formatCurrency(saldoInicio, 'BRL'), 'primary', '◉'),
    kpiCard('Saldo final',   formatCurrency(saldoFim, 'BRL'),    'primary', '★'),
    kpiCard('Variação',      `${variacao >= 0 ? '+' : ''}${formatCurrency(variacao, 'BRL')} (${variacaoPct >= 0 ? '+' : ''}${variacaoPct.toFixed(1)}%)`, varTone, variacao >= 0 ? '↑' : '↓'),
    kpiCard('Pico / Vale',   `${formatCurrency(pico, 'BRL')} / ${formatCurrency(vale, 'BRL')}`, 'info', '⌃'),
  ].join('');

  document.getElementById('evol-chart').innerHTML = renderLineChart(
    [{ label: 'Saldo consolidado', values: valores, color: 'var(--color-primary)' }],
    labels,
  ) || '<p class="relat-empty-chart">Sem dados no período.</p>';

  // Variação por mês
  const byMes = new Map();
  transNoPeriodo.forEach((tr) => {
    const mesKey = tr.data.slice(0, 7);
    if (!byMes.has(mesKey)) byMes.set(mesKey, { entradas: 0, saidas: 0 });
    const bucket = byMes.get(mesKey);
    const v = Number(tr.valor) || 0;
    if (tr.tipo === 'Receita') bucket.entradas += v;
    if (tr.tipo === 'Despesa') bucket.saidas   += v;
  });
  const mesesOrd = Array.from(byMes.keys()).sort();
  let acumulado = saldoInicio;
  let tbody = '';
  let totEnt = 0, totSai = 0;
  mesesOrd.forEach((mk) => {
    const b = byMes.get(mk);
    const variacaoM = b.entradas - b.saidas;
    acumulado += variacaoM;
    totEnt += b.entradas;
    totSai += b.saidas;
    const [yy, mm] = mk.split('-');
    const label = `${MONTH_LABELS[Number(mm) - 1]}/${yy.slice(2)}`;
    const varCls = variacaoM > 0 ? 'relat-text-success' : variacaoM < 0 ? 'relat-text-danger' : 'relat-text-muted';
    tbody += `<tr>
      <td>${label}</td>
      <td class="relat-td-num relat-text-success">${formatCurrencyHTML(b.entradas, 'BRL')}</td>
      <td class="relat-td-num relat-text-danger">${formatCurrencyHTML(b.saidas, 'BRL')}</td>
      <td class="relat-td-num ${varCls}">${variacaoM >= 0 ? '+' : ''}${formatCurrencyHTML(variacaoM, 'BRL')}</td>
      <td class="relat-td-num">${formatCurrencyHTML(acumulado, 'BRL')}</td>
    </tr>`;
  });

  document.getElementById('evol-tbody').innerHTML = tbody ||
    '<tr><td colspan="5" class="relat-td-empty">Sem movimentações no período.</td></tr>';
  document.getElementById('evol-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Total no período</strong></td>
    <td class="relat-td-num relat-text-success"><strong>${formatCurrencyHTML(totEnt, 'BRL')}</strong></td>
    <td class="relat-td-num relat-text-danger"><strong>${formatCurrencyHTML(totSai, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${(totEnt - totSai) >= 0 ? '+' : ''}${formatCurrencyHTML(totEnt - totSai, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(saldoFim, 'BRL')}</strong></td>
  </tr>`;
}

// -------------------------------------------------------
// R-12: Movimentação por conta no período
// -------------------------------------------------------
async function renderMovimentacao() {
  const contas = await loadContasAtivas();
  const contasMap = new Map(contas.map((c) => [c.id, c]));

  const trans = (allTransacoes || []).filter((tr) => contasMap.has(tr.conta_id));

  // Agrupa por conta
  const byConta = new Map();
  trans.forEach((tr) => {
    if (!byConta.has(tr.conta_id)) byConta.set(tr.conta_id, { entradas: 0, saidas: 0, count: 0 });
    const b = byConta.get(tr.conta_id);
    const v = Number(tr.valor) || 0;
    b.count++;
    if (tr.tipo === 'Receita') b.entradas += v;
    else if (tr.tipo === 'Despesa') b.saidas += v;
    else if (tr.tipo === 'Transferência') {
      // Conta_id = origem (saída); destino vira entrada da outra conta
      if (tr.conta_destino_id) b.saidas += v;
      else if (tr.transferencia_par_id) b.entradas += v;
    }
  });

  const rows = contas
    .map((c) => {
      const b = byConta.get(c.id) || { entradas: 0, saidas: 0, count: 0 };
      return {
        id:        c.id,
        nome:      c.apelido?.trim() || c.nome,
        tipo:      c.tipo,
        moeda:     c.moeda || 'BRL',
        entradas:  b.entradas,
        saidas:    b.saidas,
        liquido:   b.entradas - b.saidas,
        count:     b.count,
      };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => (b.entradas + b.saidas) - (a.entradas + a.saidas));

  const totEnt   = rows.reduce((s, r) => s + r.entradas, 0);
  const totSai   = rows.reduce((s, r) => s + r.saidas, 0);
  const totCount = rows.reduce((s, r) => s + r.count, 0);
  const maisMov  = rows[0]?.nome || '—';

  document.getElementById('mov-kpis').innerHTML = [
    kpiCard('Total entradas',     formatCurrency(totEnt, 'BRL'),         'success', '↑'),
    kpiCard('Total saídas',       formatCurrency(totSai, 'BRL'),         'danger',  '↓'),
    kpiCard('Saldo líquido',      `${(totEnt - totSai) >= 0 ? '+' : ''}${formatCurrency(totEnt - totSai, 'BRL')}`, (totEnt - totSai) >= 0 ? 'success' : 'danger', '∑'),
    kpiCard('Mais movimentada',   maisMov,                                'info',    '★'),
  ].join('');

  // Grouped bars (reutilizando renderGroupedBars com previsto=entradas, realizado=saídas)
  // Truque visual: mostrar entradas vs saídas como duas barras lado a lado
  const chartData = rows.slice(0, 9).map((r) => ({
    nome:      r.nome,
    previsto:  r.entradas,
    realizado: r.saidas,
  }));
  let chartHtml;
  if (chartData.length > 0) {
    chartHtml = renderGroupedBars(chartData)
      // Substitui legenda padrão (Previsto/Realizado) pela nossa
      .replace(/<div class="relat-legend"[\s\S]*?<\/div>/,
        `<div class="relat-legend" style="margin-top:var(--space-2)">
          <span class="relat-legend-item"><span class="relat-legend-dot" style="background:var(--color-info)"></span>Entradas</span>
          <span class="relat-legend-item"><span class="relat-legend-dot" style="background:var(--color-danger)"></span>Saídas</span>
        </div>`);
  } else {
    chartHtml = '<p class="relat-empty-chart">Nenhuma movimentação no período.</p>';
  }
  document.getElementById('mov-chart').innerHTML = chartHtml;

  let tbody = '';
  rows.forEach((r) => {
    const liqCls = r.liquido > 0 ? 'relat-text-success' : r.liquido < 0 ? 'relat-text-danger' : 'relat-text-muted';
    tbody += `<tr>
      <td><strong>${escapeHtml(r.nome)}</strong> <span class="relat-text-muted" style="font-size:var(--fs-xs)">${escapeHtml(r.tipo || '')}</span></td>
      <td class="relat-td-num relat-text-success">${formatCurrencyHTML(r.entradas, r.moeda)}</td>
      <td class="relat-td-num relat-text-danger">${formatCurrencyHTML(r.saidas, r.moeda)}</td>
      <td class="relat-td-num ${liqCls}">${r.liquido >= 0 ? '+' : ''}${formatCurrencyHTML(r.liquido, r.moeda)}</td>
      <td class="relat-td-num relat-text-muted">${r.count}</td>
    </tr>`;
  });

  document.getElementById('mov-tbody').innerHTML = tbody ||
    '<tr><td colspan="5" class="relat-td-empty">Nenhuma movimentação no período selecionado.</td></tr>';
  document.getElementById('mov-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Total</strong></td>
    <td class="relat-td-num relat-text-success"><strong>${formatCurrencyHTML(totEnt, 'BRL')}</strong></td>
    <td class="relat-td-num relat-text-danger"><strong>${formatCurrencyHTML(totSai, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${(totEnt - totSai) >= 0 ? '+' : ''}${formatCurrencyHTML(totEnt - totSai, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${totCount}</strong></td>
  </tr>`;
}


// =======================================================
// GRUPO: DÍVIDAS (R-13 / R-14 / R-15 / R-16)
// =======================================================

async function loadDividas() {
  if (_dividas) return _dividas;
  const { data, error } = await supabase
    .from('dividas')
    .select(`
      id, nome, credor, tipo, valor_total, valor_pago, juros_percentual,
      data_inicio, data_vencimento, status, n_parcelas, parcelas_pagas, moeda,
      contato_id, inclui_no_patrimonio
    `)
    .order('data_inicio', { ascending: false });
  if (error) console.warn('[loadDividas]', error);
  _dividas = data || [];

  // Carrega nomes dos contatos vinculados
  const contatoIds = [...new Set(_dividas.map((d) => d.contato_id).filter(Boolean))];
  if (contatoIds.length && !_dividaContatos) {
    const { data: cts } = await supabase.from('contatos').select('id, nome').in('id', contatoIds);
    _dividaContatos = new Map((cts || []).map((c) => [c.id, c.nome]));
  } else if (!_dividaContatos) {
    _dividaContatos = new Map();
  }

  return _dividas;
}

async function loadDividaPagsHist() {
  if (_dividaPagsHist) return _dividaPagsHist;
  const range = getDateRange();
  let q = supabase
    .from('pagamentos_divida_historico')
    .select('id, divida_id, data, valor, descricao')
    .order('data', { ascending: false });
  if (range && range.start) q = q.gte('data', range.start).lte('data', range.end);
  const { data, error } = await q;
  if (error) console.warn('[loadDividaPagsHist]', error);
  _dividaPagsHist = data || [];
  return _dividaPagsHist;
}

async function renderDividas() {
  if      (activeSubtabDiv === 'visao')     await renderDivVisao();
  else if (activeSubtabDiv === 'apagar')    await renderDivApagar();
  else if (activeSubtabDiv === 'areceber')  await renderDivAreceber();
  else if (activeSubtabDiv === 'historico') await renderDivHistorico();
}

function dividaDisplayNome(d) {
  return d.nome || 'Sem nome';
}
function dividaCredor(d) {
  if (d.credor) return d.credor;
  if (d.contato_id && _dividaContatos?.has(d.contato_id)) return _dividaContatos.get(d.contato_id);
  return '—';
}
function dividaRestante(d) {
  return Math.max(0, (Number(d.valor_total) || 0) - (Number(d.valor_pago) || 0));
}
function dividaPctQuitado(d) {
  const total = Number(d.valor_total) || 0;
  if (total <= 0) return 0;
  return Math.min(100, (Number(d.valor_pago) || 0) / total * 100);
}

// -------------------------------------------------------
// R-13: Visão geral
// -------------------------------------------------------
async function renderDivVisao() {
  const dividas = await loadDividas();
  const ativas = dividas.filter((d) => d.status !== 'Quitada' && d.status !== 'Arquivada');

  const apagar   = ativas.filter((d) => d.tipo === 'a_pagar');
  const areceber = ativas.filter((d) => d.tipo === 'a_receber');

  const totalApagar   = apagar.reduce((s, d) => s + dividaRestante(d), 0);
  const totalAreceber = areceber.reduce((s, d) => s + dividaRestante(d), 0);
  const liquido       = totalAreceber - totalApagar;
  const liqTone       = liquido > 0 ? 'success' : liquido < 0 ? 'danger' : 'primary';

  document.getElementById('div-visao-kpis').innerHTML = [
    kpiCard('Total a pagar',    formatCurrency(totalApagar,   'BRL'), 'danger',  '↓'),
    kpiCard('Total a receber',  formatCurrency(totalAreceber, 'BRL'), 'success', '↑'),
    kpiCard('Saldo líquido',    `${liquido >= 0 ? '+' : ''}${formatCurrency(liquido, 'BRL')}`, liqTone, '∑'),
    kpiCard('Dívidas ativas',   `${ativas.length} (${dividas.length} total)`, 'info', '#'),
  ].join('');

  // Donut: a_pagar vs a_receber (em valor restante)
  const donutItems = [];
  if (totalApagar   > 0) donutItems.push({ label: 'A pagar',   value: totalApagar,   color: 'var(--color-danger)' });
  if (totalAreceber > 0) donutItems.push({ label: 'A receber', value: totalAreceber, color: 'var(--color-success)' });
  const donutTotal = totalApagar + totalAreceber;
  document.getElementById('div-visao-donut').innerHTML = donutItems.length > 0
    ? renderDonut(donutItems, donutTotal)
    : '<p class="relat-empty-chart">Sem dívidas ativas.</p>';

  // Tabela
  const ordered = [...dividas].sort((a, b) => dividaRestante(b) - dividaRestante(a));
  let tbody = '';
  let totGeralVal = 0, totGeralPago = 0, totGeralRest = 0;
  ordered.forEach((d) => {
    const total = Number(d.valor_total) || 0;
    const pago  = Number(d.valor_pago)  || 0;
    const rest  = dividaRestante(d);
    const pct   = dividaPctQuitado(d);
    totGeralVal += total; totGeralPago += pago; totGeralRest += rest;
    const tipoLabel = d.tipo === 'a_receber' ? 'A receber' : 'A pagar';
    const tipoCor   = d.tipo === 'a_receber' ? 'var(--color-success)' : 'var(--color-danger)';
    tbody += `<tr>
      <td><strong>${escapeHtml(dividaDisplayNome(d))}</strong> <span class="relat-text-muted" style="font-size:var(--fs-xs)">${escapeHtml(dividaCredor(d))}</span></td>
      <td><span class="cat-dot" style="background:${tipoCor}"></span>${tipoLabel}</td>
      <td>${escapeHtml(d.status || '—')}</td>
      <td class="relat-td-num">${formatCurrencyHTML(total, d.moeda || 'BRL')}</td>
      <td class="relat-td-num relat-text-success">${formatCurrencyHTML(pago, d.moeda || 'BRL')}</td>
      <td class="relat-td-num">${formatCurrencyHTML(rest, d.moeda || 'BRL')}</td>
      <td class="relat-td-num">${pct.toFixed(0)}%</td>
    </tr>`;
  });
  document.getElementById('div-visao-tbody').innerHTML = tbody ||
    '<tr><td colspan="7" class="relat-td-empty">Nenhuma dívida cadastrada.</td></tr>';
  document.getElementById('div-visao-tfoot').innerHTML = `<tr class="relat-total-row">
    <td colspan="3"><strong>Total geral</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totGeralVal, 'BRL')}</strong></td>
    <td class="relat-td-num relat-text-success"><strong>${formatCurrencyHTML(totGeralPago, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totGeralRest, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${totGeralVal > 0 ? (totGeralPago / totGeralVal * 100).toFixed(0) : 0}%</strong></td>
  </tr>`;
}

// -------------------------------------------------------
// R-14 / R-15: A pagar / A receber (mesmo formato, filtro diferente)
// -------------------------------------------------------
function renderDivLista(tipo, prefix) {
  const dividas = (_dividas || []).filter((d) =>
    d.tipo === tipo && d.status !== 'Quitada' && d.status !== 'Arquivada'
  );

  const totalRest    = dividas.reduce((s, d) => s + dividaRestante(d), 0);
  const totalPago    = dividas.reduce((s, d) => s + (Number(d.valor_pago) || 0), 0);
  const totalCount   = dividas.length;
  const proxVenc     = dividas
    .filter((d) => d.data_vencimento)
    .sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento))[0];

  const labelTipo  = tipo === 'a_receber' ? 'receber' : 'pagar';
  const tone       = tipo === 'a_receber' ? 'success' : 'danger';
  const arrow      = tipo === 'a_receber' ? '↑' : '↓';

  document.getElementById(`div-${prefix}-kpis`).innerHTML = [
    kpiCard(`Total a ${labelTipo}`, formatCurrency(totalRest, 'BRL'), tone, arrow),
    kpiCard('Já recebido/pago',     formatCurrency(totalPago, 'BRL'), 'info', '✓'),
    kpiCard('Dívidas ativas',       String(totalCount),               'primary', '#'),
    kpiCard('Próximo vencimento',   proxVenc?.data_vencimento ? proxVenc.data_vencimento.split('-').reverse().join('/') : '—', 'warning', '📅'),
  ].join('');

  const ordered = [...dividas].sort((a, b) => dividaRestante(b) - dividaRestante(a));
  let tbody = '';
  ordered.forEach((d) => {
    const rest = dividaRestante(d);
    const pct  = dividaPctQuitado(d);
    const barColor = pct >= 80 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
    const parcelasStr = d.n_parcelas
      ? `${d.parcelas_pagas || 0}/${d.n_parcelas}`
      : '—';
    tbody += `<tr>
      <td><strong>${escapeHtml(dividaDisplayNome(d))}</strong></td>
      <td>${escapeHtml(dividaCredor(d))}</td>
      <td class="relat-td-num">${parcelasStr}</td>
      <td class="relat-td-num">${formatCurrencyHTML(rest, d.moeda || 'BRL')}</td>
      <td>
        <div class="relat-progress-cell">
          <div class="relat-progress-bar"><div class="relat-progress-fill" style="width:${pct.toFixed(1)}%;background:${barColor}"></div></div>
          <span class="relat-progress-pct">${pct.toFixed(0)}%</span>
        </div>
      </td>
    </tr>`;
  });

  document.getElementById(`div-${prefix}-tbody`).innerHTML = tbody ||
    `<tr><td colspan="5" class="relat-td-empty">Nenhuma dívida a ${labelTipo} ativa.</td></tr>`;
  document.getElementById(`div-${prefix}-tfoot`).innerHTML = `<tr class="relat-total-row">
    <td colspan="3"><strong>Total ${dividas.length} dívida(s)</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalRest, 'BRL')}</strong></td>
    <td></td>
  </tr>`;
}

async function renderDivApagar() {
  await loadDividas();
  renderDivLista('a_pagar', 'apagar');
}

async function renderDivAreceber() {
  await loadDividas();
  renderDivLista('a_receber', 'areceber');
}

// -------------------------------------------------------
// R-16: Histórico de pagamentos no período
// -------------------------------------------------------
async function renderDivHistorico() {
  const dividas = await loadDividas();
  const pags    = await loadDividaPagsHist();
  const divMap  = new Map(dividas.map((d) => [d.id, d]));

  const total      = pags.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const count      = pags.length;
  const dividasUnq = new Set(pags.map((p) => p.divida_id)).size;

  // Maior pagamento
  const maior = pags.length > 0
    ? pags.reduce((a, b) => (Number(a.valor) > Number(b.valor) ? a : b))
    : null;

  document.getElementById('div-hist-kpis').innerHTML = [
    kpiCard('Pago no período',  formatCurrency(total, 'BRL'),                                       'success', '✓'),
    kpiCard('# Pagamentos',     String(count),                                                      'primary', '#'),
    kpiCard('Dívidas pagas',    String(dividasUnq),                                                 'info',    '▤'),
    kpiCard('Maior pagamento',  maior ? formatCurrency(Number(maior.valor), 'BRL') : '—',           'warning', '★'),
  ].join('');

  // Agrupado por dívida
  const byDiv = new Map();
  pags.forEach((p) => {
    if (!byDiv.has(p.divida_id)) byDiv.set(p.divida_id, { divida: divMap.get(p.divida_id), total: 0, count: 0 });
    const b = byDiv.get(p.divida_id);
    b.total += Number(p.valor) || 0;
    b.count++;
  });
  const groups = Array.from(byDiv.values()).sort((a, b) => b.total - a.total);

  document.getElementById('div-hist-hbars').innerHTML = groups.length > 0
    ? renderHorizontalBars(
        groups.map((g) => ({
          nome:   g.divida ? dividaDisplayNome(g.divida) : 'Dívida removida',
          total:  g.total,
          catCor: g.divida?.tipo === 'a_receber' ? 'var(--color-success)' : 'var(--color-danger)',
        })),
        total,
      )
    : '<p class="relat-empty-chart">Nenhum pagamento registrado no período.</p>';

  // Tabela detalhada
  let tbody = '';
  pags.forEach((p) => {
    const d = divMap.get(p.divida_id);
    const tipoLabel = d?.tipo === 'a_receber' ? 'Recebimento' : 'Pagamento';
    const tipoCor   = d?.tipo === 'a_receber' ? 'var(--color-success)' : 'var(--color-danger)';
    const dataFmt   = p.data ? p.data.split('-').reverse().join('/') : '—';
    tbody += `<tr>
      <td>${dataFmt}</td>
      <td>${escapeHtml(d ? dividaDisplayNome(d) : 'Dívida removida')}</td>
      <td><span class="cat-dot" style="background:${tipoCor}"></span>${tipoLabel}</td>
      <td class="relat-text-muted">${escapeHtml(p.descricao || '—')}</td>
      <td class="relat-td-num">${formatCurrencyHTML(Number(p.valor) || 0, d?.moeda || 'BRL')}</td>
    </tr>`;
  });

  document.getElementById('div-hist-tbody').innerHTML = tbody ||
    '<tr><td colspan="5" class="relat-td-empty">Nenhum pagamento registrado no período selecionado.</td></tr>';
  document.getElementById('div-hist-tfoot').innerHTML = `<tr class="relat-total-row">
    <td colspan="4"><strong>Total no período</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(total, 'BRL')}</strong></td>
  </tr>`;
}

// =======================================================
// GRUPO: INVESTIMENTOS (R-17 / R-18 / R-19)
// =======================================================

async function loadProjetos() {
  if (_projetos) return _projetos;
  const { data, error } = await supabase
    .from('projetos_investimento')
    .select('id, nome, descricao, cor, status, meta_valor, data_alvo, saldo_inicial, inclui_no_patrimonio, data_inicio')
    .order('nome');
  if (error) console.warn('[loadProjetos]', error);
  _projetos = data || [];
  return _projetos;
}

async function loadAportesAll() {
  if (_aportesAll) return _aportesAll;
  const { data, error } = await supabase
    .from('aportes_projeto')
    .select('id, projeto_id, data, valor, descricao')
    .order('data', { ascending: false });
  if (error) console.warn('[loadAportesAll]', error);
  _aportesAll = data || [];
  return _aportesAll;
}

async function loadAportesPeriodo() {
  if (_aportesPeriodo) return _aportesPeriodo;
  const range = getDateRange();
  let q = supabase
    .from('aportes_projeto')
    .select('id, projeto_id, data, valor, descricao')
    .order('data', { ascending: false });
  if (range && range.start) q = q.gte('data', range.start).lte('data', range.end);
  const { data, error } = await q;
  if (error) console.warn('[loadAportesPeriodo]', error);
  _aportesPeriodo = data || [];
  return _aportesPeriodo;
}

async function renderInvestimentos() {
  if      (activeSubtabInv === 'visao')     await renderInvVisao();
  else if (activeSubtabInv === 'progresso') await renderInvProgresso();
  else if (activeSubtabInv === 'aportes')   await renderInvAportes();
}

function projetoRealizado(proj, aportesByProj) {
  const aportesSum = (aportesByProj.get(proj.id) || []).reduce((s, a) => s + (Number(a.valor) || 0), 0);
  return (Number(proj.saldo_inicial) || 0) + aportesSum;
}

function projetoCor(p) {
  return p.cor || 'var(--color-primary)';
}

// -------------------------------------------------------
// R-17: Visão geral
// -------------------------------------------------------
async function renderInvVisao() {
  const projetos = await loadProjetos();
  const aportes  = await loadAportesAll();

  const aportesByProj = new Map();
  aportes.forEach((a) => {
    if (!aportesByProj.has(a.projeto_id)) aportesByProj.set(a.projeto_id, []);
    aportesByProj.get(a.projeto_id).push(a);
  });

  const enriched = projetos.map((p) => ({
    ...p,
    realizado: projetoRealizado(p, aportesByProj),
    meta:      Number(p.meta_valor) || 0,
  }));

  const ativos = enriched.filter((p) => p.status !== 'arquivado' && p.status !== 'concluido');

  const totalRealizado = ativos.reduce((s, p) => s + p.realizado, 0);
  const totalMeta      = ativos.reduce((s, p) => s + p.meta, 0);
  const totalAportes   = aportes.reduce((s, a) => s + (Number(a.valor) || 0), 0);
  const pctGeral       = totalMeta > 0 ? (totalRealizado / totalMeta * 100) : 0;

  document.getElementById('inv-visao-kpis').innerHTML = [
    kpiCard('Patrimônio investido', formatCurrency(totalRealizado, 'BRL'), 'success', '★'),
    kpiCard('Meta consolidada',     formatCurrency(totalMeta, 'BRL'),      'primary', '◎'),
    kpiCard('Aportado (total)',     formatCurrency(totalAportes, 'BRL'),   'info',    '↑'),
    kpiCard('Projetos ativos',      `${ativos.length} (${projetos.length} total)`, 'primary', '#'),
  ].join('');

  // Donut: distribuição do realizado entre projetos
  const donutItems = enriched
    .filter((p) => p.realizado > 0)
    .sort((a, b) => b.realizado - a.realizado)
    .map((p) => ({ label: p.nome, value: p.realizado, color: projetoCor(p) }));
  document.getElementById('inv-visao-donut').innerHTML = donutItems.length > 0
    ? renderDonut(donutItems, donutItems.reduce((s, i) => s + i.value, 0))
    : '<p class="relat-empty-chart">Nenhum projeto com saldo realizado.</p>';

  // Top projetos
  const topProj = [...enriched]
    .filter((p) => p.realizado > 0)
    .sort((a, b) => b.realizado - a.realizado)
    .slice(0, 8);
  document.getElementById('inv-visao-hbars').innerHTML = topProj.length > 0
    ? renderHorizontalBars(
        topProj.map((p) => ({ nome: p.nome, total: p.realizado, catCor: projetoCor(p) })),
        topProj.reduce((s, p) => s + p.realizado, 0),
      )
    : '<p class="relat-empty-chart">Sem dados</p>';

  // Tabela completa
  const ordered = [...enriched].sort((a, b) => b.realizado - a.realizado);
  let tbody = '';
  ordered.forEach((p) => {
    const pct = p.meta > 0 ? (p.realizado / p.meta * 100) : 0;
    const dataAlvo = p.data_alvo ? p.data_alvo.split('-').reverse().join('/') : '—';
    tbody += `<tr>
      <td><span class="cat-dot" style="background:${projetoCor(p)}"></span><strong>${escapeHtml(p.nome)}</strong></td>
      <td>${escapeHtml(p.status || 'ativo')}</td>
      <td class="relat-td-num">${formatCurrencyHTML(p.realizado, 'BRL')}</td>
      <td class="relat-td-num">${p.meta > 0 ? formatCurrencyHTML(p.meta, 'BRL') : '<span class="relat-text-muted">—</span>'}</td>
      <td class="relat-td-num">${p.meta > 0 ? pct.toFixed(0) + '%' : '—'}</td>
      <td class="relat-text-muted">${dataAlvo}</td>
    </tr>`;
  });
  document.getElementById('inv-visao-tbody').innerHTML = tbody ||
    '<tr><td colspan="6" class="relat-td-empty">Nenhum projeto de investimento cadastrado.</td></tr>';
  document.getElementById('inv-visao-tfoot').innerHTML = `<tr class="relat-total-row">
    <td colspan="2"><strong>Total (ativos)</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalRealizado, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalMeta, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${pctGeral.toFixed(0)}%</strong></td>
    <td></td>
  </tr>`;
}

// -------------------------------------------------------
// R-18: Progresso (quanto falta pra meta)
// -------------------------------------------------------
async function renderInvProgresso() {
  const projetos = await loadProjetos();
  const aportes  = await loadAportesAll();

  const aportesByProj = new Map();
  aportes.forEach((a) => {
    if (!aportesByProj.has(a.projeto_id)) aportesByProj.set(a.projeto_id, []);
    aportesByProj.get(a.projeto_id).push(a);
  });

  const enriched = projetos
    .filter((p) => p.status !== 'arquivado')
    .map((p) => {
      const realizado = projetoRealizado(p, aportesByProj);
      const meta = Number(p.meta_valor) || 0;
      return {
        ...p,
        realizado,
        meta,
        falta: Math.max(0, meta - realizado),
        pct:   meta > 0 ? Math.min(100, realizado / meta * 100) : 0,
      };
    });

  const comMeta = enriched.filter((p) => p.meta > 0);
  const atingidas = comMeta.filter((p) => p.pct >= 100).length;
  const totalRealizado = comMeta.reduce((s, p) => s + p.realizado, 0);
  const totalMeta      = comMeta.reduce((s, p) => s + p.meta, 0);
  const totalFalta     = comMeta.reduce((s, p) => s + p.falta, 0);
  const pctGeral       = totalMeta > 0 ? (totalRealizado / totalMeta * 100) : 0;

  document.getElementById('inv-prog-kpis').innerHTML = [
    kpiCard('Progresso geral',  `${pctGeral.toFixed(0)}%`,                  pctGeral >= 80 ? 'success' : pctGeral >= 50 ? 'warning' : 'danger', '◐'),
    kpiCard('Falta para metas', formatCurrency(totalFalta, 'BRL'),          'warning', '↓'),
    kpiCard('Metas atingidas',  `${atingidas} de ${comMeta.length}`,        'success', '✓'),
    kpiCard('Sem meta definida',`${enriched.length - comMeta.length}`,      'info',    '?'),
  ].join('');

  const ordered = [...enriched].sort((a, b) => b.pct - a.pct);
  let tbody = '';
  ordered.forEach((p) => {
    const barColor = p.pct >= 100 ? 'var(--color-success)' : p.pct >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
    tbody += `<tr>
      <td><span class="cat-dot" style="background:${projetoCor(p)}"></span><strong>${escapeHtml(p.nome)}</strong></td>
      <td class="relat-td-num">${formatCurrencyHTML(p.realizado, 'BRL')}</td>
      <td class="relat-td-num">${p.meta > 0 ? formatCurrencyHTML(p.meta, 'BRL') : '<span class="relat-text-muted">—</span>'}</td>
      <td class="relat-td-num">${p.meta > 0 ? formatCurrencyHTML(p.falta, 'BRL') : '<span class="relat-text-muted">—</span>'}</td>
      <td>
        ${p.meta > 0
          ? `<div class="relat-progress-cell">
              <div class="relat-progress-bar"><div class="relat-progress-fill" style="width:${p.pct.toFixed(1)}%;background:${barColor}"></div></div>
              <span class="relat-progress-pct">${p.pct.toFixed(0)}%</span>
            </div>`
          : '<span class="relat-text-muted" style="font-size:var(--fs-xs)">Sem meta</span>'}
      </td>
    </tr>`;
  });

  document.getElementById('inv-prog-tbody').innerHTML = tbody ||
    '<tr><td colspan="5" class="relat-td-empty">Nenhum projeto de investimento cadastrado.</td></tr>';
  document.getElementById('inv-prog-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Total (com meta)</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalRealizado, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalMeta, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalFalta, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${pctGeral.toFixed(0)}%</strong></td>
  </tr>`;
}

// -------------------------------------------------------
// R-19: Aportes no período
// -------------------------------------------------------
async function renderInvAportes() {
  const projetos = await loadProjetos();
  const aportes  = await loadAportesPeriodo();
  const projMap  = new Map(projetos.map((p) => [p.id, p]));

  const total       = aportes.reduce((s, a) => s + (Number(a.valor) || 0), 0);
  const count       = aportes.length;
  const projsUnq    = new Set(aportes.map((a) => a.projeto_id)).size;
  const maior       = aportes.length > 0
    ? aportes.reduce((a, b) => (Number(a.valor) > Number(b.valor) ? a : b))
    : null;

  document.getElementById('inv-aportes-kpis').innerHTML = [
    kpiCard('Aportado no período', formatCurrency(total, 'BRL'),                                 'success', '↑'),
    kpiCard('# Aportes',           String(count),                                                'primary', '#'),
    kpiCard('Projetos aportados',  String(projsUnq),                                             'info',    '▤'),
    kpiCard('Maior aporte',        maior ? formatCurrency(Number(maior.valor), 'BRL') : '—',     'warning', '★'),
  ].join('');

  // Agrupado por projeto
  const byProj = new Map();
  aportes.forEach((a) => {
    if (!byProj.has(a.projeto_id)) byProj.set(a.projeto_id, { projeto: projMap.get(a.projeto_id), total: 0, count: 0 });
    const b = byProj.get(a.projeto_id);
    b.total += Number(a.valor) || 0;
    b.count++;
  });
  const groups = Array.from(byProj.values()).sort((a, b) => b.total - a.total);

  document.getElementById('inv-aportes-hbars').innerHTML = groups.length > 0
    ? renderHorizontalBars(
        groups.map((g) => ({
          nome:   g.projeto?.nome || 'Projeto removido',
          total:  g.total,
          catCor: g.projeto ? projetoCor(g.projeto) : 'var(--color-text-muted)',
        })),
        total,
      )
    : '<p class="relat-empty-chart">Nenhum aporte registrado no período.</p>';

  // Tabela
  let tbody = '';
  aportes.forEach((a) => {
    const p = projMap.get(a.projeto_id);
    const dataFmt = a.data ? a.data.split('-').reverse().join('/') : '—';
    tbody += `<tr>
      <td>${dataFmt}</td>
      <td><span class="cat-dot" style="background:${p ? projetoCor(p) : 'var(--color-text-muted)'}"></span>${escapeHtml(p?.nome || 'Projeto removido')}</td>
      <td class="relat-text-muted">${escapeHtml(a.descricao || '—')}</td>
      <td class="relat-td-num">${formatCurrencyHTML(Number(a.valor) || 0, 'BRL')}</td>
    </tr>`;
  });

  document.getElementById('inv-aportes-tbody').innerHTML = tbody ||
    '<tr><td colspan="4" class="relat-td-empty">Nenhum aporte registrado no período selecionado.</td></tr>';
  document.getElementById('inv-aportes-tfoot').innerHTML = `<tr class="relat-total-row">
    <td colspan="3"><strong>Total no período</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(total, 'BRL')}</strong></td>
  </tr>`;
}

// =======================================================
// GRUPO: SAÚDE FINANCEIRA (R-20 / R-21 / R-22)
// =======================================================

async function loadTransAnterior() {
  if (_transAnterior) return _transAnterior;
  const range = getDateRange();
  if (!range || !range.start) { _transAnterior = []; return _transAnterior; }
  // Período anterior de mesma duração
  const start = new Date(range.start + 'T00:00:00');
  const end   = new Date(range.end   + 'T00:00:00');
  const days  = Math.round((end - start) / 86400000) + 1;
  const prevEnd   = new Date(start);  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (days - 1));
  const isoStart = prevStart.toISOString().slice(0,10);
  const isoEnd   = prevEnd.toISOString().slice(0,10);

  const { data, error } = await supabase
    .from('transacoes')
    .select('id, data, tipo, valor, subcategoria_id, pagamento_id, conta_id')
    .gte('data', isoStart).lte('data', isoEnd);
  if (error) console.warn('[loadTransAnterior]', error);
  _transAnterior = { rows: data || [], start: isoStart, end: isoEnd };
  return _transAnterior;
}

async function renderSaude() {
  if      (activeSubtabSaude === 'indicadores') await renderSaudeIndicadores();
  else if (activeSubtabSaude === 'comparativo') await renderSaudeComparativo();
  else if (activeSubtabSaude === 'tendencias')  await renderSaudeTendencias();
}

// -------------------------------------------------------
// R-20: Indicadores de saúde financeira
// -------------------------------------------------------
async function renderSaudeIndicadores() {
  // Período atual
  const trans = allTransacoes || [];
  const range = getDateRange();
  const receitas = trans.filter((t) => t.tipo === 'Receita').reduce((s, t) => s + Number(t.valor || 0), 0);
  const despesas = trans.filter((t) => t.tipo === 'Despesa').reduce((s, t) => s + Number(t.valor || 0), 0);
  const saldoPeriodo = receitas - despesas;

  // # meses no período (para média)
  let nMeses = 1;
  if (range && range.start) {
    const s = new Date(range.start + 'T00:00:00');
    const e = new Date(range.end   + 'T00:00:00');
    nMeses = Math.max(1, Math.round((e - s) / (30 * 86400000)) || 1);
  }
  const despesaMensalMedia = despesas / nMeses;
  const receitaMensalMedia = receitas / nMeses;

  // Saldo disponível em contas (Corrente + Poupança + Carteira)
  const contas = await loadContasAtivas();
  const saldos = await loadSaldosAtuais(contas);
  const disponivel = contas
    .filter((c) => TIPOS_DISPONIVEIS.has(c.tipo))
    .reduce((s, c) => s + (saldos.get(c.id) || 0), 0);
  const patrimContas = contas
    .filter((c) => c.tipo !== 'Cartão de Crédito')
    .reduce((s, c) => s + (saldos.get(c.id) || 0), 0);

  // Dívidas a pagar (restante)
  const dividas = await loadDividas();
  const totalDividas = dividas
    .filter((d) => d.tipo === 'a_pagar' && d.status !== 'Quitada' && d.status !== 'Arquivada')
    .reduce((s, d) => s + Math.max(0, (Number(d.valor_total) || 0) - (Number(d.valor_pago) || 0)), 0);

  // Indicadores
  const taxaPoupanca   = receitas > 0 ? (saldoPeriodo / receitas * 100) : 0;
  const mesesReserva   = despesaMensalMedia > 0 ? (disponivel / despesaMensalMedia) : 0;
  const razaoDivPatr   = patrimContas > 0 ? (totalDividas / patrimContas * 100) : (totalDividas > 0 ? 999 : 0);
  const comprometimento = receitaMensalMedia > 0 ? (despesaMensalMedia / receitaMensalMedia * 100) : 0;

  // Status helpers (semáforo)
  const statusPoupanca = taxaPoupanca >= 20 ? 'ok' : taxaPoupanca >= 10 ? 'warn' : 'bad';
  const statusReserva  = mesesReserva  >= 6  ? 'ok' : mesesReserva  >= 3  ? 'warn' : 'bad';
  const statusDivida   = razaoDivPatr  <= 30 ? 'ok' : razaoDivPatr  <= 60 ? 'warn' : 'bad';
  const statusComprom  = comprometimento <= 70 ? 'ok' : comprometimento <= 90 ? 'warn' : 'bad';

  const toneFor = (s) => s === 'ok' ? 'success' : s === 'warn' ? 'warning' : 'danger';

  document.getElementById('saude-ind-kpis').innerHTML = [
    kpiCard('Taxa de poupança',     `${taxaPoupanca.toFixed(1)}%`,                                         toneFor(statusPoupanca), '↑'),
    kpiCard('Reserva de emergência',`${mesesReserva.toFixed(1)} meses`,                                    toneFor(statusReserva),  '◉'),
    kpiCard('Comprometimento',      `${comprometimento.toFixed(0)}%`,                                      toneFor(statusComprom),  '◐'),
    kpiCard('Dívidas / patrimônio', razaoDivPatr === 999 ? '∞' : `${razaoDivPatr.toFixed(0)}%`,            toneFor(statusDivida),   '⚖'),
  ].join('');

  // Diagnóstico geral
  const statusScores = { ok: 3, warn: 2, bad: 1 };
  const scoreGeral = (statusScores[statusPoupanca] + statusScores[statusReserva] + statusScores[statusComprom] + statusScores[statusDivida]) / 12 * 100;
  let diagText, diagTone;
  if (scoreGeral >= 80)      { diagText = 'Saúde financeira excelente. Continue assim.';                            diagTone = 'success'; }
  else if (scoreGeral >= 60) { diagText = 'Saúde financeira boa, com pontos de atenção.';                            diagTone = 'success'; }
  else if (scoreGeral >= 40) { diagText = 'Saúde financeira regular. Reveja os indicadores em amarelo e vermelho.'; diagTone = 'warning'; }
  else                        { diagText = 'Sinais de alerta. Priorize formar reserva e reduzir comprometimento.'; diagTone = 'danger';  }

  const diagColor = diagTone === 'success' ? 'var(--color-success)' : diagTone === 'warning' ? 'var(--color-warning)' : 'var(--color-danger)';
  document.getElementById('saude-ind-diag').innerHTML = `
    <div class="saude-diag" style="border-left-color:${diagColor}">
      <div class="saude-diag-score" style="color:${diagColor}">${scoreGeral.toFixed(0)}<span class="saude-diag-score-suffix">/100</span></div>
      <div class="saude-diag-text">${escapeHtml(diagText)}</div>
    </div>
  `;

  // Tabela detalhada
  const rows = [
    {
      nome: 'Taxa de poupança',
      valor: `${taxaPoupanca.toFixed(1)}%`,
      meta:  '≥ 20%',
      status: statusPoupanca,
      desc:  'Quanto da sua renda você consegue poupar a cada mês.',
    },
    {
      nome: 'Reserva de emergência',
      valor: `${mesesReserva.toFixed(1)} meses`,
      meta:  '≥ 6 meses',
      status: statusReserva,
      desc:  'Quantos meses de despesa seu saldo disponível cobre sem renda nova.',
    },
    {
      nome: 'Comprometimento de renda',
      valor: `${comprometimento.toFixed(0)}%`,
      meta:  '≤ 70%',
      status: statusComprom,
      desc:  'Despesas mensais médias dividas pela receita mensal média.',
    },
    {
      nome: 'Dívidas / patrimônio',
      valor: razaoDivPatr === 999 ? '∞' : `${razaoDivPatr.toFixed(0)}%`,
      meta:  '≤ 30%',
      status: statusDivida,
      desc:  'Total a pagar em dívidas dividido pelo patrimônio em contas.',
    },
  ];
  const statusBadge = (s) => {
    const label = s === 'ok' ? 'Saudável' : s === 'warn' ? 'Atenção' : 'Alerta';
    const cor   = s === 'ok' ? 'var(--color-success)' : s === 'warn' ? 'var(--color-warning)' : 'var(--color-danger)';
    return `<span class="saude-status-badge" style="background:${cor}1a;color:${cor};border:1px solid ${cor}40">${label}</span>`;
  };
  let tbody = '';
  rows.forEach((r) => {
    tbody += `<tr>
      <td><strong>${escapeHtml(r.nome)}</strong></td>
      <td class="relat-td-num"><strong>${r.valor}</strong></td>
      <td class="relat-td-num relat-text-muted">${r.meta}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="relat-text-muted" style="font-size:var(--fs-xs)">${escapeHtml(r.desc)}</td>
    </tr>`;
  });
  document.getElementById('saude-ind-tbody').innerHTML = tbody;
}

// -------------------------------------------------------
// R-21: Comparativo com período anterior
// -------------------------------------------------------
async function renderSaudeComparativo() {
  const trans = allTransacoes || [];
  const anterior = await loadTransAnterior();
  const prevRows = anterior?.rows || [];

  const sum = (arr, tipo) => arr.filter((t) => t.tipo === tipo).reduce((s, t) => s + Number(t.valor || 0), 0);
  const recAtual = sum(trans, 'Receita');
  const desAtual = sum(trans, 'Despesa');
  const recAnt   = sum(prevRows, 'Receita');
  const desAnt   = sum(prevRows, 'Despesa');
  const saldoAtual = recAtual - desAtual;
  const saldoAnt   = recAnt   - desAnt;

  const variaPct = (atual, ant) => ant === 0 ? (atual > 0 ? 100 : 0) : ((atual - ant) / Math.abs(ant) * 100);
  const arrow    = (atual, ant) => atual > ant ? '↑' : atual < ant ? '↓' : '—';

  const recTone   = recAtual >= recAnt ? 'success' : 'danger';
  const desTone   = desAtual <= desAnt ? 'success' : 'danger';
  const saldoTone = saldoAtual >= saldoAnt ? 'success' : 'danger';

  document.getElementById('saude-comp-kpis').innerHTML = [
    kpiCard('Receitas',  formatCurrency(recAtual, 'BRL'),   recTone,   arrow(recAtual, recAnt)),
    kpiCard('Despesas',  formatCurrency(desAtual, 'BRL'),   desTone,   arrow(desAtual, desAnt)),
    kpiCard('Saldo',     `${saldoAtual >= 0 ? '+' : ''}${formatCurrency(saldoAtual, 'BRL')}`, saldoTone, '∑'),
    kpiCard('Período anterior', anterior?.start ? `${anterior.start.split('-').reverse().slice(0,2).join('/')} → ${anterior.end.split('-').reverse().slice(0,2).join('/')}` : '—', 'info', '◀'),
  ].join('');

  // Categoria de cada transação via subcategoria → categoria
  const subToCat = new Map((allSubcategorias || []).map((s) => [s.id, s.categoria_id]));
  const catNomes = new Map((allCategorias || []).map((c) => [c.id, c.nome]));
  const sumByCategoria = (arr) => {
    const map = new Map();
    arr.filter((t) => t.tipo === 'Despesa').forEach((t) => {
      const catId = subToCat.get(t.subcategoria_id);
      if (!catId) return;
      const k = catNomes.get(catId) || '—';
      map.set(k, (map.get(k) || 0) + Number(t.valor || 0));
    });
    return map;
  };
  const atual = sumByCategoria(trans);
  const ant   = sumByCategoria(prevRows);
  const todasCats = new Set([...atual.keys(), ...ant.keys()]);

  const linhas = [...todasCats].map((nome) => {
    const a = atual.get(nome) || 0;
    const p = ant.get(nome)   || 0;
    return { nome, atual: a, anterior: p, delta: a - p, pct: variaPct(a, p) };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Bars: top 8 variações
  const topVar = linhas.slice(0, 8);
  let barsHtml;
  if (topVar.length === 0) {
    barsHtml = '<p class="relat-empty-chart">Sem despesas para comparar.</p>';
  } else {
    const maxAbs = Math.max(...topVar.map((l) => Math.abs(l.delta)), 1);
    barsHtml = `<div class="saude-comp-bars">${topVar.map((l) => {
      const wPct = (Math.abs(l.delta) / maxAbs * 100).toFixed(1);
      const cor  = l.delta > 0 ? 'var(--color-danger)' : 'var(--color-success)';
      const sign = l.delta >= 0 ? '+' : '';
      return `<div class="saude-comp-row">
        <div class="saude-comp-name">${escapeHtml(l.nome)}</div>
        <div class="saude-comp-bar-wrap"><div class="saude-comp-bar" style="width:${wPct}%;background:${cor}"></div></div>
        <div class="saude-comp-val" style="color:${cor}">${sign}${formatCurrency(l.delta, 'BRL')}</div>
      </div>`;
    }).join('')}</div>`;
  }
  document.getElementById('saude-comp-bars').innerHTML = barsHtml;

  // Tabela completa
  let tbody = '';
  linhas.forEach((l) => {
    const deltaCls = l.delta > 0 ? 'relat-text-danger' : l.delta < 0 ? 'relat-text-success' : 'relat-text-muted';
    const sign = l.delta >= 0 ? '+' : '';
    tbody += `<tr>
      <td><strong>${escapeHtml(l.nome)}</strong></td>
      <td class="relat-td-num">${formatCurrencyHTML(l.anterior, 'BRL')}</td>
      <td class="relat-td-num">${formatCurrencyHTML(l.atual, 'BRL')}</td>
      <td class="relat-td-num ${deltaCls}">${sign}${formatCurrencyHTML(l.delta, 'BRL')}</td>
      <td class="relat-td-num ${deltaCls}">${sign}${l.pct.toFixed(0)}%</td>
    </tr>`;
  });
  document.getElementById('saude-comp-tbody').innerHTML = tbody ||
    '<tr><td colspan="5" class="relat-td-empty">Sem despesas no período para comparar.</td></tr>';
  document.getElementById('saude-comp-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Total despesas</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(desAnt, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(desAtual, 'BRL')}</strong></td>
    <td class="relat-td-num ${desAtual > desAnt ? 'relat-text-danger' : 'relat-text-success'}"><strong>${desAtual >= desAnt ? '+' : ''}${formatCurrencyHTML(desAtual - desAnt, 'BRL')}</strong></td>
    <td class="relat-td-num ${desAtual > desAnt ? 'relat-text-danger' : 'relat-text-success'}"><strong>${variaPct(desAtual, desAnt) >= 0 ? '+' : ''}${variaPct(desAtual, desAnt).toFixed(0)}%</strong></td>
  </tr>`;
}

// -------------------------------------------------------
// R-22: Tendências e projeções
// -------------------------------------------------------
async function renderSaudeTendencias() {
  const trans = allTransacoes || [];
  const range = getDateRange();
  if (!range || !range.start) {
    document.getElementById('saude-tend-kpis').innerHTML = '';
    document.getElementById('saude-tend-chart').innerHTML = '<p class="relat-empty-chart">Selecione um período para ver tendências.</p>';
    document.getElementById('saude-tend-tbody').innerHTML = '';
    document.getElementById('saude-tend-tfoot').innerHTML = '';
    return;
  }

  // Agrega por mês (YYYY-MM)
  const byMes = new Map();
  trans.forEach((t) => {
    if (t.tipo !== 'Receita' && t.tipo !== 'Despesa') return;
    const k = t.data.slice(0, 7);
    if (!byMes.has(k)) byMes.set(k, { receitas: 0, despesas: 0 });
    const b = byMes.get(k);
    if (t.tipo === 'Receita') b.receitas += Number(t.valor || 0);
    else if (t.tipo === 'Despesa') b.despesas += Number(t.valor || 0);
  });

  const mesesOrd = [...byMes.keys()].sort();
  if (mesesOrd.length === 0) {
    document.getElementById('saude-tend-kpis').innerHTML = '';
    document.getElementById('saude-tend-chart').innerHTML = '<p class="relat-empty-chart">Sem dados no período.</p>';
    document.getElementById('saude-tend-tbody').innerHTML = '';
    document.getElementById('saude-tend-tfoot').innerHTML = '';
    return;
  }

  const recVals = mesesOrd.map((k) => byMes.get(k).receitas);
  const desVals = mesesOrd.map((k) => byMes.get(k).despesas);
  const recMedia = recVals.reduce((s, v) => s + v, 0) / recVals.length;
  const desMedia = desVals.reduce((s, v) => s + v, 0) / desVals.length;
  const saldoMedia = recMedia - desMedia;

  // Projeção: 3 meses à frente com a média
  const ultimoMes = mesesOrd[mesesOrd.length - 1];
  const [uy, um] = ultimoMes.split('-').map(Number);
  const projMeses = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(uy, um - 1 + i, 1);
    projMeses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`);
  }

  const allMeses = [...mesesOrd, ...projMeses];
  const labels = allMeses.map((k) => {
    const [y, m] = k.split('-');
    return `${MONTH_LABELS[Number(m) - 1]}/${y.slice(2)}`;
  });
  const recSeries = [...recVals, ...projMeses.map(() => recMedia)];
  const desSeries = [...desVals, ...projMeses.map(() => desMedia)];

  const splitIdx = mesesOrd.length;
  // Truque pra projeção: sólidas até o último real (mantendo último valor para o resto), tracejadas partindo do último real
  const seriesForChart = [
    { label: 'Receitas',           values: recSeries.slice(0, splitIdx).concat(Array(projMeses.length).fill(recSeries[splitIdx - 1])), color: 'var(--color-success)' },
    { label: 'Receitas (projeção)',values: Array(splitIdx - 1).fill(recSeries[splitIdx - 1]).concat(recSeries.slice(splitIdx - 1)),     color: 'var(--color-success)', dash: true },
    { label: 'Despesas',           values: desSeries.slice(0, splitIdx).concat(Array(projMeses.length).fill(desSeries[splitIdx - 1])), color: 'var(--color-danger)' },
    { label: 'Despesas (projeção)',values: Array(splitIdx - 1).fill(desSeries[splitIdx - 1]).concat(desSeries.slice(splitIdx - 1)),     color: 'var(--color-danger)', dash: true },
  ];

  document.getElementById('saude-tend-kpis').innerHTML = [
    kpiCard('Receita média/mês',   formatCurrency(recMedia, 'BRL'),                                      'success', '↑'),
    kpiCard('Despesa média/mês',   formatCurrency(desMedia, 'BRL'),                                      'danger',  '↓'),
    kpiCard('Saldo médio/mês',     `${saldoMedia >= 0 ? '+' : ''}${formatCurrency(saldoMedia, 'BRL')}`,   saldoMedia >= 0 ? 'success' : 'danger', '∑'),
    kpiCard('Projeção 3 meses',    `${saldoMedia * 3 >= 0 ? '+' : ''}${formatCurrency(saldoMedia * 3, 'BRL')}`, saldoMedia >= 0 ? 'success' : 'danger', '◈'),
  ].join('');

  document.getElementById('saude-tend-chart').innerHTML = renderLineChart(seriesForChart, labels);

  // Tabela
  let tbody = '';
  mesesOrd.forEach((k, i) => {
    const r = recVals[i];
    const d = desVals[i];
    const saldo = r - d;
    const [y, m] = k.split('-');
    tbody += `<tr>
      <td>${MONTH_LABELS[Number(m) - 1]}/${y.slice(2)}</td>
      <td class="relat-td-num relat-text-success">${formatCurrencyHTML(r, 'BRL')}</td>
      <td class="relat-td-num relat-text-danger">${formatCurrencyHTML(d, 'BRL')}</td>
      <td class="relat-td-num ${saldo >= 0 ? 'relat-text-success' : 'relat-text-danger'}">${saldo >= 0 ? '+' : ''}${formatCurrencyHTML(saldo, 'BRL')}</td>
      <td><span class="saude-status-badge" style="background:var(--color-info)1a;color:var(--color-info);border:1px solid var(--color-info)40">Real</span></td>
    </tr>`;
  });
  projMeses.forEach((k) => {
    const [y, m] = k.split('-');
    tbody += `<tr>
      <td class="relat-text-muted">${MONTH_LABELS[Number(m) - 1]}/${y.slice(2)}</td>
      <td class="relat-td-num relat-text-muted">${formatCurrencyHTML(recMedia, 'BRL')}</td>
      <td class="relat-td-num relat-text-muted">${formatCurrencyHTML(desMedia, 'BRL')}</td>
      <td class="relat-td-num relat-text-muted">${saldoMedia >= 0 ? '+' : ''}${formatCurrencyHTML(saldoMedia, 'BRL')}</td>
      <td><span class="saude-status-badge" style="background:var(--color-warning)1a;color:var(--color-warning);border:1px solid var(--color-warning)40">Projeção</span></td>
    </tr>`;
  });

  document.getElementById('saude-tend-tbody').innerHTML = tbody;
  document.getElementById('saude-tend-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Média período</strong></td>
    <td class="relat-td-num relat-text-success"><strong>${formatCurrencyHTML(recMedia, 'BRL')}</strong></td>
    <td class="relat-td-num relat-text-danger"><strong>${formatCurrencyHTML(desMedia, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${saldoMedia >= 0 ? '+' : ''}${formatCurrencyHTML(saldoMedia, 'BRL')}</strong></td>
    <td></td>
  </tr>`;
}

// =======================================================
// GRUPO: FISCAL (R-23)
// =======================================================

const FISCAL_RULES = [
  { tipo: 'Saúde',          color: 'var(--color-success)', test: (s) => /sa[úu]de|m[ée]dic|hospital|exame|farm[áa]c|odonto|plano de sa[úu]de|laborat[óo]rio|psic[óo]logo|fisioterapia|cl[íi]nica|terapia|consulta/i.test(s) },
  { tipo: 'Educação',       color: 'var(--color-info)',    test: (s) => /educa|escola|curso|facul|universid|p[óo]s.?gradua|mestrado|doutorado|mensalidade escolar|creche|berç[áa]rio/i.test(s) },
  { tipo: 'Previdência',    color: 'var(--color-primary)', test: (s) => /\bprevid|\bINSS\b|\bPGBL\b|previd[êe]ncia/i.test(s) },
  { tipo: 'Pensão',         color: 'var(--color-warning)', test: (s) => /pens[ãa]o aliment/i.test(s) },
  { tipo: 'Doação',         color: '#a78bfa',              test: (s) => /doaç[ãa]o|fundo da inf[âa]ncia|FIA\b/i.test(s) },
];

function classificaDedutivel(nomeCategoria, nomeSubcategoria) {
  const fullText = `${nomeCategoria || ''} ${nomeSubcategoria || ''}`;
  for (const rule of FISCAL_RULES) {
    if (rule.test(fullText)) return rule;
  }
  return null;
}

function renderFiscal() {
  const trans = (allTransacoes || []).filter((t) => t.tipo === 'Despesa');
  const subById = new Map((allSubcategorias || []).map((s) => [s.id, s]));
  const catById = new Map((allCategorias    || []).map((c) => [c.id, c]));

  // Enriquece com categoria/subcategoria + classificação
  const enriched = [];
  trans.forEach((t) => {
    const sub = subById.get(t.subcategoria_id);
    if (!sub) return;
    const cat = catById.get(sub.categoria_id);
    const rule = classificaDedutivel(cat?.nome, sub?.nome);
    if (!rule) return;
    enriched.push({
      ...t,
      sub,
      cat,
      tipoDedut: rule.tipo,
      corDedut: rule.color,
    });
  });

  // KPIs por tipo dedutível
  const byTipo = {};
  FISCAL_RULES.forEach((r) => { byTipo[r.tipo] = { tipo: r.tipo, color: r.color, total: 0, count: 0 }; });
  enriched.forEach((e) => {
    const v = Number(e.valor) || 0;
    byTipo[e.tipoDedut].total += v;
    byTipo[e.tipoDedut].count++;
  });

  const totalGeral = enriched.reduce((s, e) => s + (Number(e.valor) || 0), 0);

  document.getElementById('fiscal-kpis').innerHTML = [
    kpiCard('Total dedutível estimado', formatCurrency(totalGeral,           'BRL'), 'success', '✓'),
    kpiCard('Saúde',                    formatCurrency(byTipo['Saúde'].total, 'BRL'), 'success', '⚕'),
    kpiCard('Educação',                 formatCurrency(byTipo['Educação'].total, 'BRL'), 'info', '✎'),
    kpiCard('Previdência + Pensão',     formatCurrency(byTipo['Previdência'].total + byTipo['Pensão'].total, 'BRL'), 'primary', '◉'),
  ].join('');

  // Donut por tipo dedutível
  const donutItems = Object.values(byTipo).filter((t) => t.total > 0).map((t) => ({ label: t.tipo, value: t.total, color: t.color }));
  document.getElementById('fiscal-donut').innerHTML = donutItems.length > 0
    ? renderDonut(donutItems, totalGeral)
    : '<p class="relat-empty-chart">Nenhuma despesa dedutível identificada no período.</p>';

  // Bar mensal
  const byMes = new Map();
  enriched.forEach((e) => {
    const k = e.data.slice(0, 7);
    if (!byMes.has(k)) byMes.set(k, 0);
    byMes.set(k, byMes.get(k) + (Number(e.valor) || 0));
  });
  const mesesOrd = [...byMes.keys()].sort();
  if (mesesOrd.length > 0) {
    const maxVal = Math.max(...mesesOrd.map((k) => byMes.get(k)), 1);
    document.getElementById('fiscal-monthly').innerHTML = renderHorizontalBars(
      mesesOrd.map((k) => {
        const [y, m] = k.split('-');
        return { nome: `${MONTH_LABELS[Number(m) - 1]}/${y.slice(2)}`, total: byMes.get(k), catCor: 'var(--color-success)' };
      }),
      maxVal * mesesOrd.length, // truque pra cada barra ficar proporcional ao máximo
    );
  } else {
    document.getElementById('fiscal-monthly').innerHTML = '<p class="relat-empty-chart">Sem dados</p>';
  }

  // Tabela de categorias (agrupado por subcategoria + categoria)
  const byCat = new Map();
  enriched.forEach((e) => {
    const k = `${e.cat?.nome || '—'}::${e.tipoDedut}`;
    if (!byCat.has(k)) byCat.set(k, { catNome: e.cat?.nome || '—', tipoDedut: e.tipoDedut, corDedut: e.corDedut, total: 0, count: 0 });
    const b = byCat.get(k);
    b.total += Number(e.valor) || 0;
    b.count++;
  });
  const catRows = [...byCat.values()].sort((a, b) => b.total - a.total);
  let tbody = '';
  catRows.forEach((r) => {
    tbody += `<tr>
      <td><strong>${escapeHtml(r.catNome)}</strong></td>
      <td><span class="cat-dot" style="background:${r.corDedut}"></span>${r.tipoDedut}</td>
      <td class="relat-td-num">${formatCurrencyHTML(r.total, 'BRL')}</td>
      <td class="relat-td-num relat-text-muted">${r.count}</td>
    </tr>`;
  });
  document.getElementById('fiscal-tbody').innerHTML = tbody ||
    '<tr><td colspan="4" class="relat-td-empty">Nenhuma categoria dedutível identificada. Verifique se os nomes das categorias contêm palavras como "Saúde", "Educação", "INSS", etc.</td></tr>';
  document.getElementById('fiscal-tfoot').innerHTML = `<tr class="relat-total-row">
    <td colspan="2"><strong>Total dedutível estimado</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalGeral, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${enriched.length}</strong></td>
  </tr>`;

  // Detalhe de transações
  const ordTrans = [...enriched].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  let tbodyTx = '';
  ordTrans.forEach((e) => {
    const dataFmt = e.data ? e.data.split('-').reverse().join('/') : '—';
    tbodyTx += `<tr>
      <td>${dataFmt}</td>
      <td>${escapeHtml(e.cat?.nome || '—')}</td>
      <td>${escapeHtml(e.sub?.apelido?.trim() || e.sub?.nome || '—')}</td>
      <td><span class="cat-dot" style="background:${e.corDedut}"></span>${e.tipoDedut}</td>
      <td class="relat-td-num">${formatCurrencyHTML(Number(e.valor) || 0, 'BRL')}</td>
    </tr>`;
  });
  document.getElementById('fiscal-tx-tbody').innerHTML = tbodyTx ||
    '<tr><td colspan="5" class="relat-td-empty">Nenhuma transação dedutível no período.</td></tr>';
  document.getElementById('fiscal-tx-tfoot').innerHTML = `<tr class="relat-total-row">
    <td colspan="4"><strong>Total</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(totalGeral, 'BRL')}</strong></td>
  </tr>`;
}

// =======================================================
// GRUPO: PATRIMÔNIO
// =======================================================

async function renderPatrimonio() {
  if      (activeSubtabPatr === 'visao')      await renderPatrVisao();
  else if (activeSubtabPatr === 'composicao') await renderPatrComposicao();
  else if (activeSubtabPatr === 'evolucao')   await renderPatrEvolucao();
}

// Calcula snapshot atual de patrimônio (reutilizado pelas 3 sub-abas)
async function calcPatrimonioAtual() {
  const contas   = await loadContasAtivas();
  const saldos   = await loadSaldosAtuais(contas);
  const dividas  = await loadDividas();
  const projetos = await loadProjetos();
  const aportes  = await loadAportesAll();

  // ATIVOS
  // Contas: tudo exceto cartões de crédito
  const contaSaldos = contas
    .filter((c) => c.tipo !== 'Cartão de Crédito')
    .map((c) => ({
      tipo:    'Conta',
      classe:  c.tipo || 'Conta',
      nome:    c.apelido?.trim() || c.nome,
      valor:   Math.max(0, saldos.get(c.id) || 0),
      bruto:   saldos.get(c.id) || 0,
    }))
    .filter((c) => c.bruto > 0);

  // Investimentos: realizado por projeto
  const aportesByProj = new Map();
  aportes.forEach((a) => {
    if (!aportesByProj.has(a.projeto_id)) aportesByProj.set(a.projeto_id, []);
    aportesByProj.get(a.projeto_id).push(a);
  });
  const projetosAtivos = projetos
    .filter((p) => p.status !== 'arquivado' && p.inclui_no_patrimonio !== false)
    .map((p) => ({
      tipo:   'Investimento',
      classe: 'Investimento',
      nome:   p.nome,
      valor:  projetoRealizado(p, aportesByProj),
    }))
    .filter((p) => p.valor > 0);

  // Dívidas a receber
  const aReceber = dividas
    .filter((d) => d.tipo === 'a_receber' && d.status !== 'Quitada' && d.status !== 'Arquivada')
    .map((d) => ({
      tipo:   'A receber',
      classe: 'A receber',
      nome:   d.nome || 'Sem nome',
      valor:  Math.max(0, (Number(d.valor_total) || 0) - (Number(d.valor_pago) || 0)),
    }))
    .filter((d) => d.valor > 0);

  const ativos = [...contaSaldos, ...projetosAtivos, ...aReceber];

  // PASSIVOS
  // Dívidas a pagar
  const aPagar = dividas
    .filter((d) => d.tipo === 'a_pagar' && d.status !== 'Quitada' && d.status !== 'Arquivada' && d.inclui_no_patrimonio !== false)
    .map((d) => ({
      tipo:   'A pagar',
      classe: 'Dívida',
      nome:   d.nome || 'Sem nome',
      valor:  Math.max(0, (Number(d.valor_total) || 0) - (Number(d.valor_pago) || 0)),
    }))
    .filter((d) => d.valor > 0);

  // Cartões: saldo NEGATIVO em contas tipo Cartão de Crédito
  const cartoes = contas
    .filter((c) => c.tipo === 'Cartão de Crédito')
    .map((c) => ({
      tipo:   'Cartão',
      classe: 'Cartão',
      nome:   c.apelido?.trim() || c.nome,
      valor:  Math.max(0, -(saldos.get(c.id) || 0)),
    }))
    .filter((c) => c.valor > 0);

  const passivos = [...aPagar, ...cartoes];

  const totalAtivos   = ativos.reduce((s, a) => s + a.valor, 0);
  const totalPassivos = passivos.reduce((s, p) => s + p.valor, 0);
  const liquido       = totalAtivos - totalPassivos;

  return { ativos, passivos, totalAtivos, totalPassivos, liquido };
}

// -------------------------------------------------------
// Patrimônio — Visão geral
// -------------------------------------------------------
async function renderPatrVisao() {
  const p = await calcPatrimonioAtual();

  const tone = p.liquido > 0 ? 'success' : p.liquido < 0 ? 'danger' : 'primary';
  document.getElementById('patr-visao-kpis').innerHTML = [
    kpiCard('Patrimônio líquido', formatCurrency(p.liquido, 'BRL'),       tone,      '★'),
    kpiCard('Total de ativos',    formatCurrency(p.totalAtivos, 'BRL'),   'success', '↑'),
    kpiCard('Total de passivos',  formatCurrency(p.totalPassivos, 'BRL'), 'danger',  '↓'),
    kpiCard('Razão A/P',          p.totalPassivos > 0 ? `${(p.totalAtivos / p.totalPassivos).toFixed(2)}×` : '∞', 'info', '⚖'),
  ].join('');

  // Agrupa ativos por classe
  const ativosPorClasse = new Map();
  p.ativos.forEach((a) => {
    if (!ativosPorClasse.has(a.classe)) ativosPorClasse.set(a.classe, 0);
    ativosPorClasse.set(a.classe, ativosPorClasse.get(a.classe) + a.valor);
  });
  let tbodyA = '';
  [...ativosPorClasse.entries()].sort((a, b) => b[1] - a[1]).forEach(([classe, valor]) => {
    const pct = p.totalAtivos > 0 ? (valor / p.totalAtivos * 100) : 0;
    tbodyA += `<tr>
      <td><strong>${escapeHtml(classe)}</strong></td>
      <td class="relat-td-num relat-text-success">${formatCurrencyHTML(valor, 'BRL')}</td>
      <td class="relat-td-num relat-text-muted">${pct.toFixed(1)}%</td>
    </tr>`;
  });
  document.getElementById('patr-ativos-tbody').innerHTML = tbodyA ||
    '<tr><td colspan="3" class="relat-td-empty">Nenhum ativo registrado.</td></tr>';
  document.getElementById('patr-ativos-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Total</strong></td>
    <td class="relat-td-num relat-text-success"><strong>${formatCurrencyHTML(p.totalAtivos, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>100%</strong></td>
  </tr>`;

  // Passivos por classe
  const passivosPorClasse = new Map();
  p.passivos.forEach((pp) => {
    if (!passivosPorClasse.has(pp.classe)) passivosPorClasse.set(pp.classe, 0);
    passivosPorClasse.set(pp.classe, passivosPorClasse.get(pp.classe) + pp.valor);
  });
  let tbodyP = '';
  [...passivosPorClasse.entries()].sort((a, b) => b[1] - a[1]).forEach(([classe, valor]) => {
    const pct = p.totalPassivos > 0 ? (valor / p.totalPassivos * 100) : 0;
    tbodyP += `<tr>
      <td><strong>${escapeHtml(classe)}</strong></td>
      <td class="relat-td-num relat-text-danger">${formatCurrencyHTML(valor, 'BRL')}</td>
      <td class="relat-td-num relat-text-muted">${pct.toFixed(1)}%</td>
    </tr>`;
  });
  document.getElementById('patr-passivos-tbody').innerHTML = tbodyP ||
    '<tr><td colspan="3" class="relat-td-empty">Nenhum passivo registrado. 🎉</td></tr>';
  document.getElementById('patr-passivos-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Total</strong></td>
    <td class="relat-td-num relat-text-danger"><strong>${formatCurrencyHTML(p.totalPassivos, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>100%</strong></td>
  </tr>`;
}

// -------------------------------------------------------
// Patrimônio — Composição
// -------------------------------------------------------
const CLASSE_COLORS = {
  'Corrente':      'var(--color-primary)',
  'Poupança':      'var(--color-success)',
  'Carteira':      'var(--color-info)',
  'Cofrinho':      '#a78bfa',
  'Investimento':  'var(--color-warning)',
  'A receber':     '#06b6d4',
  'Dívida':        'var(--color-danger)',
  'Cartão':        '#f97316',
  'Conta':         'var(--color-primary)',
};

async function renderPatrComposicao() {
  const p = await calcPatrimonioAtual();

  document.getElementById('patr-comp-kpis').innerHTML = [
    kpiCard('Patrimônio líquido', formatCurrency(p.liquido, 'BRL'),       p.liquido >= 0 ? 'success' : 'danger', '★'),
    kpiCard('# Ativos',           String(p.ativos.length),                'success', '#'),
    kpiCard('# Passivos',         String(p.passivos.length),              'danger',  '#'),
    kpiCard('Maior ativo',        p.ativos.sort((a,b)=>b.valor-a.valor)[0]?.nome || '—', 'info', '★'),
  ].join('');

  // Donut por classe de ativos
  const byClasse = new Map();
  p.ativos.forEach((a) => {
    if (!byClasse.has(a.classe)) byClasse.set(a.classe, 0);
    byClasse.set(a.classe, byClasse.get(a.classe) + a.valor);
  });
  const donutItems = [...byClasse.entries()]
    .map(([label, value]) => ({ label, value, color: CLASSE_COLORS[label] || 'var(--color-primary)' }))
    .sort((a, b) => b.value - a.value);

  document.getElementById('patr-comp-donut').innerHTML = donutItems.length > 0
    ? renderDonut(donutItems, p.totalAtivos)
    : '<p class="relat-empty-chart">Nenhum ativo para distribuir.</p>';

  // Top itens (ativos)
  const topAtivos = [...p.ativos].sort((a, b) => b.valor - a.valor).slice(0, 8);
  document.getElementById('patr-comp-hbars').innerHTML = topAtivos.length > 0
    ? renderHorizontalBars(
        topAtivos.map((a) => ({ nome: a.nome, total: a.valor, catCor: CLASSE_COLORS[a.classe] || 'var(--color-primary)' })),
        topAtivos.reduce((s, a) => s + a.valor, 0),
      )
    : '<p class="relat-empty-chart">Sem dados</p>';

  // Tabela detalhada (ativos + passivos)
  const todosItens = [
    ...p.ativos.map((a) => ({ ...a, sinal: 1 })),
    ...p.passivos.map((pp) => ({ ...pp, sinal: -1 })),
  ].sort((a, b) => (b.sinal * b.valor) - (a.sinal * a.valor));

  let tbody = '';
  todosItens.forEach((it) => {
    const pct = p.liquido !== 0 ? (it.sinal * it.valor / Math.abs(p.liquido) * 100) : 0;
    const cls = it.sinal > 0 ? 'relat-text-success' : 'relat-text-danger';
    const cor = CLASSE_COLORS[it.classe] || 'var(--color-text-muted)';
    tbody += `<tr>
      <td><strong>${escapeHtml(it.nome)}</strong></td>
      <td><span class="cat-dot" style="background:${cor}"></span>${escapeHtml(it.classe)}</td>
      <td class="relat-td-num ${cls}">${it.sinal > 0 ? '+' : '-'}${formatCurrencyHTML(it.valor, 'BRL')}</td>
      <td class="relat-td-num relat-text-muted">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</td>
    </tr>`;
  });
  document.getElementById('patr-comp-tbody').innerHTML = tbody ||
    '<tr><td colspan="4" class="relat-td-empty">Nada cadastrado.</td></tr>';
  document.getElementById('patr-comp-tfoot').innerHTML = `<tr class="relat-total-row">
    <td colspan="2"><strong>Patrimônio líquido</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(p.liquido, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>100%</strong></td>
  </tr>`;
}

// -------------------------------------------------------
// Patrimônio — Evolução (on-the-fly)
// -------------------------------------------------------
async function loadPatrEvolucao() {
  if (_patrEvolCache) return _patrEvolCache;

  // Estado ATUAL (final do mês corrente) — depois desconta transações pra trás
  const contas = await loadContasAtivas();
  const dividas = await loadDividas();
  const projetos = await loadProjetos();
  const aportes = await loadAportesAll();

  // Carrega TODAS as transações pra reconstruir saldo por mês
  const { data: trans, error } = await supabase
    .from('transacoes')
    .select('data, tipo, valor, conta_id, conta_destino_id, transferencia_par_id, reconciliacao_status')
    .neq('reconciliacao_status', 'importado')
    .order('data', { ascending: true });
  if (error) console.warn('[loadPatrEvolucao trans]', error);
  const allTrans = trans || [];

  if (allTrans.length === 0) {
    _patrEvolCache = [];
    return _patrEvolCache;
  }

  // Determina range de meses (do primeiro lançamento até hoje)
  const primeiraData = allTrans[0].data;
  const hoje = new Date();
  const [py, pm] = primeiraData.split('-').map(Number);
  const meses = [];
  let cur = new Date(py, pm - 1, 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  while (cur <= fim) {
    meses.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
    cur.setMonth(cur.getMonth() + 1);
  }

  // Pré-agrupa transações por mês e por conta
  const transByMes = new Map();
  allTrans.forEach((t) => {
    const mk = t.data.slice(0, 7);
    if (!transByMes.has(mk)) transByMes.set(mk, []);
    transByMes.get(mk).push(t);
  });

  // Helpers pra calcular saldo de conta num mês específico
  // Estratégia: pega saldo atual final, e pra cada mês > target, desconta as transações.
  // Como cálculo simples: percorre meses do MAIS ANTIGO ao MAIS NOVO acumulando.
  const tipoPorConta = new Map(contas.map((c) => [c.id, c.tipo]));

  // Inicia saldos zerados — vai acumular cronologicamente
  const saldosPorConta = new Map(contas.map((c) => [c.id, 0]));

  const snapshots = [];
  for (const mes of meses) {
    // Aplica transações DESTE mês
    const trsMes = transByMes.get(mes) || [];
    for (const t of trsMes) {
      if (!saldosPorConta.has(t.conta_id)) continue;
      const cur = saldosPorConta.get(t.conta_id);
      const isEntrada = t.tipo === 'Receita'
        || (t.tipo === 'Transferência' && t.transferencia_par_id && !t.conta_destino_id);
      const isSaida = t.tipo === 'Despesa'
        || (t.tipo === 'Transferência' && !!t.conta_destino_id);
      if (isEntrada) saldosPorConta.set(t.conta_id, cur + Number(t.valor || 0));
      else if (isSaida) saldosPorConta.set(t.conta_id, cur - Number(t.valor || 0));
    }

    // Calcula ativos e passivos NESTE mês
    let ativos = 0;
    let passivos = 0;
    for (const c of contas) {
      const s = saldosPorConta.get(c.id) || 0;
      if (tipoPorConta.get(c.id) === 'Cartão de Crédito') {
        if (s < 0) passivos += -s;
      } else if (s > 0) {
        ativos += s;
      }
    }
    // Investimentos (snapshot, não evolução real — simplificação)
    // TODO: refinar usando aportes mês a mês
    if (mes === meses[meses.length - 1]) {
      const aportesByProj = new Map();
      aportes.forEach((a) => {
        if (!aportesByProj.has(a.projeto_id)) aportesByProj.set(a.projeto_id, []);
        aportesByProj.get(a.projeto_id).push(a);
      });
      projetos
        .filter((p) => p.status !== 'arquivado' && p.inclui_no_patrimonio !== false)
        .forEach((p) => { ativos += projetoRealizado(p, aportesByProj); });
      // Dívidas a pagar e a receber (atuais — sem histórico)
      dividas.filter((d) => d.status !== 'Quitada' && d.status !== 'Arquivada').forEach((d) => {
        const rest = Math.max(0, (Number(d.valor_total) || 0) - (Number(d.valor_pago) || 0));
        if (d.tipo === 'a_pagar' && d.inclui_no_patrimonio !== false) passivos += rest;
        else if (d.tipo === 'a_receber') ativos += rest;
      });
    }

    snapshots.push({
      mesIso:   mes,
      ativos,
      passivos,
      liquido:  ativos - passivos,
    });
  }

  _patrEvolCache = snapshots;
  return _patrEvolCache;
}

async function renderPatrEvolucao() {
  const snapshots = await loadPatrEvolucao();

  if (snapshots.length === 0) {
    document.getElementById('patr-evol-kpis').innerHTML = '';
    document.getElementById('patr-evol-chart').innerHTML = '<p class="relat-empty-chart">Sem transações para reconstruir a evolução.</p>';
    document.getElementById('patr-evol-tbody').innerHTML = '';
    document.getElementById('patr-evol-tfoot').innerHTML = '';
    return;
  }

  const inicial = snapshots[0].liquido;
  const final   = snapshots[snapshots.length - 1].liquido;
  const variacao = final - inicial;
  const variacaoPct = inicial !== 0 ? (variacao / Math.abs(inicial) * 100) : 0;
  const tone = variacao > 0 ? 'success' : variacao < 0 ? 'danger' : 'primary';

  document.getElementById('patr-evol-kpis').innerHTML = [
    kpiCard('Patrimônio inicial', formatCurrency(inicial, 'BRL'),                                       'primary', '◉'),
    kpiCard('Patrimônio atual',   formatCurrency(final, 'BRL'),                                         'primary', '★'),
    kpiCard('Variação',           `${variacao >= 0 ? '+' : ''}${formatCurrency(variacao, 'BRL')}`,      tone,      variacao >= 0 ? '↑' : '↓'),
    kpiCard('Variação %',         `${variacaoPct >= 0 ? '+' : ''}${variacaoPct.toFixed(1)}%`,           tone,      '%'),
  ].join('');

  const labels = snapshots.map((s) => {
    const [y, m] = s.mesIso.split('-');
    return `${MONTH_LABELS[Number(m) - 1]}/${y.slice(2)}`;
  });

  document.getElementById('patr-evol-chart').innerHTML = renderLineChart([
    { label: 'Ativos',              values: snapshots.map((s) => s.ativos),   color: 'var(--color-success)' },
    { label: 'Passivos',            values: snapshots.map((s) => s.passivos), color: 'var(--color-danger)' },
    { label: 'Patrimônio líquido',  values: snapshots.map((s) => s.liquido),  color: 'var(--color-primary)' },
  ], labels);

  let tbody = '';
  snapshots.forEach((s, i) => {
    const prev  = i > 0 ? snapshots[i - 1].liquido : null;
    const delta = prev !== null ? s.liquido - prev : 0;
    const cls   = delta > 0 ? 'relat-text-success' : delta < 0 ? 'relat-text-danger' : 'relat-text-muted';
    const [y, m] = s.mesIso.split('-');
    tbody += `<tr>
      <td>${MONTH_LABELS[Number(m) - 1]}/${y.slice(2)}</td>
      <td class="relat-td-num relat-text-success">${formatCurrencyHTML(s.ativos, 'BRL')}</td>
      <td class="relat-td-num relat-text-danger">${formatCurrencyHTML(s.passivos, 'BRL')}</td>
      <td class="relat-td-num">${formatCurrencyHTML(s.liquido, 'BRL')}</td>
      <td class="relat-td-num ${cls}">${prev === null ? '—' : (delta >= 0 ? '+' : '') + formatCurrencyHTML(delta, 'BRL')}</td>
    </tr>`;
  });
  document.getElementById('patr-evol-tbody').innerHTML = tbody;
  document.getElementById('patr-evol-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Período</strong></td>
    <td class="relat-td-num"><strong>—</strong></td>
    <td class="relat-td-num"><strong>—</strong></td>
    <td class="relat-td-num"><strong>${formatCurrencyHTML(final, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${variacao >= 0 ? '+' : ''}${formatCurrencyHTML(variacao, 'BRL')}</strong></td>
  </tr>`;
}
