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
import { formatCurrency } from '../lib/compromissos-config.js';
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

  // Tabs
  document.getElementById('relat-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.relat-tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.relat-panel').forEach((p) => p.classList.add('hidden'));
    document.getElementById(`panel-${activeTab}`).classList.remove('hidden');
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

  setLoading(false);
}

function buildTransQ(range) {
  let q = supabase
    .from('transacoes')
    .select('id, data, tipo, valor, subcategoria_id, pagamento_id')
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
  const nMeses             = months.length || 1;
  const mediaDesp          = totalDespesas / nMeses;

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
      <td class="relat-td-num relat-text-success">${formatCurrency(receitas,      'BRL')}</td>
      <td class="relat-td-num relat-text-danger"> ${formatCurrency(despesas,      'BRL')}</td>
      <td class="relat-td-num ${saldo >= 0 ? 'relat-text-success' : 'relat-text-danger'}">${formatCurrency(saldo, 'BRL')}</td>
      <td class="relat-td-num ${saldoAcum >= 0 ? 'relat-text-success' : 'relat-text-danger'}">${formatCurrency(saldoAcum, 'BRL')}</td>
      <td class="relat-td-num relat-text-muted">${transferencias > 0 ? formatCurrency(transferencias, 'BRL') : '—'}</td>
    </tr>`;
  });

  document.getElementById('fluxo-tbody').innerHTML = rows.join('') ||
    '<tr><td colspan="6" class="relat-td-empty">Sem transações no período</td></tr>';

  document.getElementById('fluxo-tfoot').innerHTML = `<tr class="relat-total-row">
    <td><strong>Total</strong></td>
    <td class="relat-td-num relat-text-success"><strong>${formatCurrency(totalReceitas, 'BRL')}</strong></td>
    <td class="relat-td-num relat-text-danger"><strong>${formatCurrency(totalDespesas, 'BRL')}</strong></td>
    <td class="relat-td-num ${saldoTotal >= 0 ? 'relat-text-success' : 'relat-text-danger'}"><strong>${formatCurrency(saldoTotal, 'BRL')}</strong></td>
    <td></td>
    <td class="relat-td-num relat-text-muted"><strong>${totalTransferencias > 0 ? formatCurrency(totalTransferencias, 'BRL') : '—'}</strong></td>
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
  const saldoPrev  = totRecP  - totDespP;
  const saldoReal  = totRecR  - totDespR;
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
      <td class="relat-td-num">${formatCurrency(c.previsto,  'BRL')}</td>
      <td class="relat-td-num">${formatCurrency(c.realizado, 'BRL')}</td>
      <td class="relat-td-num ${desvio <= 0 ? 'relat-text-success' : 'relat-text-danger'}">${formatCurrency(desvio, 'BRL')}</td>
      <td class="relat-td-num">${pct.toFixed(1)}%</td>
    </tr>`;
  }).join('');

  const sectionHeader = (label, cor) =>
    `<tr class="relat-section-header"><td colspan="5"><span style="color:${cor};font-weight:600">${label}</span></td></tr>`;

  const totalRow = (label, p, r) => {
    const d = r - p;
    return `<tr class="relat-total-row relat-subtotal-row">
      <td><strong>${label}</strong></td>
      <td class="relat-td-num"><strong>${formatCurrency(p, 'BRL')}</strong></td>
      <td class="relat-td-num"><strong>${formatCurrency(r, 'BRL')}</strong></td>
      <td class="relat-td-num ${d <= 0 ? 'relat-text-success' : 'relat-text-danger'}"><strong>${formatCurrency(d, 'BRL')}</strong></td>
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
    <td class="relat-td-num"><strong>${formatCurrency(totalP, 'BRL')}</strong></td>
    <td class="relat-td-num"><strong>${formatCurrency(totalR, 'BRL')}</strong></td>
    <td class="relat-td-num ${desvioTotal <= 0 ? 'relat-text-success' : 'relat-text-danger'}"><strong>${formatCurrency(desvioTotal, 'BRL')}</strong></td>
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
      <td class="relat-td-num"><strong>${formatCurrency(c.total, 'BRL')}</strong></td>
      <td class="relat-td-num"><strong>${pct.toFixed(1)}%</strong></td>
      <td class="relat-td-num">${c.count}</td>
    </tr>`;
    const subRows = c.subsArr.map((s) => {
      const sPct = totalDesp > 0 ? (s.total / totalDesp) * 100 : 0;
      return `<tr class="relat-subcat-row">
        <td class="relat-subcat-indent">${escapeHtml(s.nome)}</td>
        <td class="relat-td-num">${formatCurrency(s.total, 'BRL')}</td>
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
    <td class="relat-td-num"><strong>${formatCurrency(totalDesp, 'BRL')}</strong></td>
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
      <div class="relat-hbar-val">${formatCurrency(item.total, 'BRL')}</div>
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
    showToast('Não foi possível carregar SheetJS para exportar XLSX', 'error', 6000);
    return;
  }

  const wb = window.XLSX.utils.book_new();
  const ws = window.XLSX.utils.table_to_sheet(table);
  window.XLSX.utils.book_append_sheet(wb, ws, activeTab);
  window.XLSX.writeFile(wb, `finflow-${activeTab}-${toISODate(today)}.xlsx`);
  showToast('Excel (.xlsx) exportado', 'success');
}

async function loadSheetJs() {
  if (window.XLSX) return true;
  showToast('Carregando SheetJS…', 'info', 3000);
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

