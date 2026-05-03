// =============================================================
// FinFlow — Página: Pagamentos (Fase 5.A)
//
// Tela operacional. Mostra os compromissos do mês organizados em
// 2 blocos quinzenais (1-15 e 16-fim). Auto-gera entries a partir
// do orcamento_geral. Permite marcar status e registrar valor real.
//
// Convenções:
//  • Status Cancelado → NÃO contabiliza no subtotal
//  • Saldo do bloco = Receitas - Despesas (em BRL convertido)
//  • Editar pagamento NÃO altera orçamento (são separados)
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatCurrency } from '../lib/compromissos-config.js';
import { fetchExchangeRate } from '../lib/currency.js';
import { initCurrencyWidget } from '../components/currency-widget.js';
import { findBank, logoUrl } from '../lib/banks.js';
import { syncPagamentoToTransacao, isPaidStatus } from '../lib/transacao-pagamento-sync.js';

// -----------------------------
// State
// -----------------------------
const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();

let cachedSubcategorias = []; // pra computar bloco_quinzenal e ocorrências
let cachedCategorias = [];    // pra ordenação dos blocos
let cachedContas = [];        // pra display de banco
let cachedPagamentos = [];    // entries do mês visível com subcategoria + categoria aninhadas
let detailsPagamento = null;  // pagamento exibido no modal de detalhes
let filterStatus = 'todos';   // 'todos' | 'pendentes' | 'atrasados' | 'pagos' | 'cancelados'
let parcialState  = null;     // { pag, restanteOrig, restanteBRL } — preenchido ao abrir modais de parcial

const ratesMap = new Map();   // 'USD' → 5.15

const MONTH_LABELS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const STATUS_OPTIONS = [
  { value: 'Agendado',    label: 'Agendado',    cls: 'status-agendado' },
  { value: 'Pago',        label: 'Pago',        cls: 'status-pago' },
  { value: 'Transferido', label: 'Transferido', cls: 'status-transferido' },
  { value: 'Cartão',      label: 'Cartão',      cls: 'status-cartao' },
  { value: 'Parcial',     label: 'Parcial',     cls: 'status-parcial' },
  { value: 'Cancelado',   label: 'Cancelado',   cls: 'status-cancelado' },
];

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('pagamentos');
  initCurrencyWidget('currency-widget');
  bindEvents();
  await loadCategorias();
  await loadSubcategorias();
  await loadContas();
  await loadMonth();
});

async function loadCategorias() {
  const { data, error } = await supabase
    .from('categorias')
    .select('*')
    .eq('ativo', true)
    .order('ordem')
    .order('nome');
  if (error) {
    console.error('[loadCategorias]', error);
    return;
  }
  cachedCategorias = data || [];
}

async function loadContas() {
  const { data, error } = await supabase
    .from('contas')
    .select('id, nome, apelido, tipo, icone_cor');
  if (error) {
    console.error('[loadContas]', error);
    return;
  }
  cachedContas = data || [];
}

function bindEvents() {
  document.getElementById('pag-prev').addEventListener('click', () => navigate(-1));
  document.getElementById('pag-next').addEventListener('click', () => navigate(1));
  document.getElementById('btn-hoje').addEventListener('click', () => {
    const t = new Date();
    viewYear = t.getFullYear();
    viewMonth = t.getMonth();
    loadMonth();
  });
  document.getElementById('btn-regen-blocos').addEventListener('click', regenerateBlocosForCurrentMonth);

  // Close modals (data-close-modal)
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  // Salvar observação no modal de detalhes
  document.getElementById('btn-salvar-observacao').addEventListener('click', saveObservacao);

  // Modais de pagamento parcial
  document.getElementById('btn-parcial-nao').addEventListener('click', () => {
    closeModal('modal-parcial-confirm');
    parcialState = null;
  });
  document.getElementById('btn-parcial-sim').addEventListener('click', openParcialNovoComp);
  document.getElementById('btn-pns-criar').addEventListener('click', criarCompromissoParcial);

  // Filtros
  document.getElementById('status-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    document.querySelectorAll('#status-filters .filter-pill').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    filterStatus = btn.dataset.filter;
    renderPagamentos();
  });
}

// -----------------------------
// Status helpers (Fase 5.C)
// -----------------------------
function isAtrasado(p) {
  if (p.status !== 'Agendado') return false;
  if (!p.data_vencimento) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const venc = new Date(p.data_vencimento + 'T00:00:00');
  return venc < today;
}

function getStatusGroup(p) {
  if (p.status === 'Cancelado') return 'cancelados';
  if (['Pago', 'Transferido', 'Cartão', 'Parcial'].includes(p.status)) return 'pagos';
  if (p.status === 'Agendado' && isAtrasado(p)) return 'atrasados';
  return 'pendentes';
}

function passesFilter(p) {
  if (filterStatus === 'todos') return true;
  return getStatusGroup(p) === filterStatus;
}

function navigate(delta) {
  viewMonth += delta;
  if (viewMonth < 0)  { viewMonth = 11; viewYear -= 1; }
  if (viewMonth > 11) { viewMonth = 0;  viewYear += 1; }
  loadMonth();
}

// Apaga pagamentos pendentes do mês visível e recria com a divisão de blocos atual.
// Preserva pagamentos com status diferente de "Agendado" OU com valor_real preenchido
// (esses são "tocados" pelo usuário).
async function regenerateBlocosForCurrentMonth() {
  const ok = window.confirm(
    'Isso vai apagar os pagamentos do mês que ainda estão como "Agendado" sem valor real preenchido, ' +
    'e gerar de novo com a divisão de blocos atual.\n\nPagamentos já marcados como Pago/Cartão/etc ' +
    'OU com valor real preenchido NÃO serão apagados.\n\nContinuar?'
  );
  if (!ok) return;

  const user = await getCurrentUser();
  if (!user) return;
  const mesAno = isoMonth(viewYear, viewMonth);

  const { error: delError } = await supabase
    .from('pagamentos')
    .delete()
    .eq('user_id', user.id)
    .eq('mes_ano', mesAno)
    .eq('status', 'Agendado')
    .is('valor_real', null);

  if (delError) {
    showToast('Erro ao limpar pagamentos: ' + delError.message, 'error', 8000);
    return;
  }

  showToast('Pagamentos pendentes limpos. Regenerando…', 'info', 3000);
  await loadMonth();
  showToast('Blocos regenerados', 'success');
}

// -----------------------------
// Loaders
// -----------------------------
async function loadSubcategorias() {
  const { data, error } = await supabase
    .from('subcategorias')
    .select('*')
    .eq('status', 'ativa');
  if (error) {
    console.error('[loadSubcategorias]', error);
    return;
  }
  cachedSubcategorias = data || [];

  // Sanity check: a coluna eh_renda_principal existe no schema?
  if (cachedSubcategorias.length > 0 && !('eh_renda_principal' in cachedSubcategorias[0])) {
    console.warn('[pagamentos] Coluna eh_renda_principal não existe — rode a migration 0011_valor_variavel_renda_principal.sql.');
    showToast('Schema desatualizado. Rode a migration 0011 no Supabase pra blocos dinâmicos.', 'error', 12000);
  }
}

async function loadMonth() {
  const container = document.getElementById('pagamentos-container');
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span>Carregando…</div>';
  document.getElementById('empty-state').classList.add('hidden');

  // Atualiza label
  document.getElementById('pag-month-label').textContent = `${MONTH_LABELS[viewMonth]} ${viewYear}`;

  // 1. Garante que orcamento_geral tenha entries pro mês (cascata: subcategoria → orcamento)
  await ensureOrcamentoForMonth(viewYear, viewMonth);

  // 2. Garante que pagamentos tenha entries pro mês (cascata: orcamento → pagamentos)
  await ensurePagamentosForMonth(viewYear, viewMonth);

  // 3. Busca pagamentos do mês com JOIN
  const mesAno = isoMonth(viewYear, viewMonth);
  const { data, error } = await supabase
    .from('pagamentos')
    .select('*, subcategorias(*, categorias(*))')
    .eq('mes_ano', mesAno)
    .order('data_vencimento');

  if (error) {
    console.error('[loadMonth]', error);
    container.innerHTML = '';
    let msg = error.message || JSON.stringify(error);
    if (/relation.*pagamentos.*does not exist/i.test(msg)) {
      msg = 'Schema desatualizado. Rode todas as migrations (0001 a 0010) no Supabase.';
    }
    showToast('Erro: ' + msg, 'error', 12000);
    return;
  }

  // Filtra subcategorias arquivadas/inativas
  cachedPagamentos = (data || []).filter((p) => p.subcategorias?.status === 'ativa');

  // 4. Busca cotações pra moedas em uso
  await refreshRates();

  renderPagamentos();
}

// -----------------------------
// Auto-geração: ensure orcamento (cascata)
// -----------------------------
async function ensureOrcamentoForMonth(year, month) {
  if (cachedSubcategorias.length === 0) return;
  const user = await getCurrentUser();
  if (!user) return;

  const mesAno = isoMonth(year, month);
  const rows = [];
  for (const sub of cachedSubcategorias) {
    if (!isActiveInMonth(sub, year, month)) continue;
    const occurrences = countOccurrencesInMonth(sub, year, month);
    if (occurrences === 0) continue;
    const valor = (Number(sub.valor_base) || 0) * occurrences;
    rows.push({
      user_id: user.id,
      subcategoria_id: sub.id,
      mes_ano: mesAno,
      valor_previsto: valor,
      moeda: sub.moeda,
    });
  }
  if (rows.length === 0) return;
  await supabase.from('orcamento_geral').upsert(rows, {
    onConflict: 'user_id,subcategoria_id,mes_ano',
    ignoreDuplicates: true,
  });
}

// -----------------------------
// Auto-geração: ensure pagamentos
// -----------------------------
async function ensurePagamentosForMonth(year, month) {
  const user = await getCurrentUser();
  if (!user) return;

  const mesAno = isoMonth(year, month);

  // Busca orcamento entries pra esse mês
  const { data: orcamentos, error } = await supabase
    .from('orcamento_geral')
    .select('id, subcategoria_id, valor_previsto, moeda')
    .eq('mes_ano', mesAno);
  if (error || !orcamentos) return;

  const blocos = getBlocosForMonth(year, month);
  // Conta ocorrências do compromisso DENTRO do mês visível pra usar como
  // base de divisão de valor (pra blocos que atravessam pra próximo mês,
  // a aproximação usa o mesmo valor por ocorrência do mês visível).
  const rows = [];
  for (const orc of orcamentos) {
    const sub = cachedSubcategorias.find((s) => s.id === orc.subcategoria_id);
    if (!sub) continue;
    if (Number(orc.valor_previsto) <= 0) continue;

    const dist = distributeToBlocosDinamico(sub, blocos);
    let totalOcc = 0;
    dist.forEach((cell) => { totalOcc += cell.count; });
    if (totalOcc === 0) continue;

    // Total de ocorrências dentro do mês visível só (pra denominador do valor mensal)
    const occThisMonth = countOccurrencesInMonth(sub, year, month) || 1;
    const valorTotal = Number(orc.valor_previsto);
    const valorPorOcorrencia = valorTotal / occThisMonth;

    for (const bloco of blocos) {
      const cell = dist.get(bloco.indice);
      if (!cell || cell.count === 0) continue;
      const valorBloco = valorPorOcorrencia * cell.count;
      rows.push({
        user_id: user.id,
        orcamento_id: orc.id,
        subcategoria_id: sub.id,
        mes_ano: mesAno,
        bloco_quinzenal: bloco.indice,
        valor_previsto: valorBloco,
        valor_real: valorBloco, // começa preenchido com o previsto; user pode alterar
        moeda: orc.moeda,
        status: 'Agendado',
        data_vencimento: cell.firstDate,
      });
    }
  }

  if (rows.length === 0) return;

  const { error: insertError } = await supabase.from('pagamentos').upsert(rows, {
    onConflict: 'user_id,subcategoria_id,mes_ano,bloco_quinzenal',
    ignoreDuplicates: true,
  });
  if (insertError) console.error('[ensurePagamentosForMonth]', insertError);
}

/**
 * Calcula os blocos do mês visível com base nas ocorrências da renda principal.
 *
 * Regra (definida pelo usuário):
 *   • Cada ocorrência da renda principal abre um bloco.
 *   • O bloco começa NA DATA da ocorrência (não no início do mês).
 *   • O bloco termina 1 dia antes da PRÓXIMA ocorrência da renda principal —
 *     mesmo que essa ocorrência caia no mês seguinte.
 *   • Se a 1ª ocorrência não cai no dia 1, criamos um bloco "Início do mês"
 *     (índice 0) cobrindo dia 1 até 1 dia antes da 1ª ocorrência. Esse bloco
 *     existe pra abrigar compromissos pagos com dinheiro do mês anterior.
 *   • Sem renda principal → fallback (Bloco 1: 1–15, Bloco 2: 16–fim).
 *
 * Retorna array: [{indice, startDate, endDate, title, period}, ...]
 */
function getBlocosForMonth(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLower = MONTH_LABELS[month].toLowerCase();
  const renda = cachedSubcategorias.find((s) => s.eh_renda_principal && s.status === 'ativa');

  // Ocorrências da renda DENTRO do mês visível
  const occInMonth = [];
  if (renda && isActiveInMonth(renda, year, month)) {
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      if (occursOn(renda, d)) occInMonth.push(d);
    }
  }

  // Fallback: 2 blocos quinzenais
  if (occInMonth.length === 0) {
    return [
      { indice: 1, startDate: new Date(year, month, 1),  endDate: new Date(year, month, 15),          title: 'Bloco 1', period: `1 – 15 de ${monthLower}` },
      { indice: 2, startDate: new Date(year, month, 16), endDate: new Date(year, month, daysInMonth), title: 'Bloco 2', period: `16 – ${daysInMonth} de ${monthLower}` },
    ];
  }

  // Próxima ocorrência depois do mês (pra fechar o último bloco)
  const nextOcc = nextOccurrenceAfter(renda, new Date(year, month, daysInMonth));

  const blocos = [];

  // Um bloco por ocorrência da renda principal no mês.
  // (Pagamentos cujas datas caem ANTES da 1ª ocorrência do mês visível pertencem
  // ao último bloco do mês ANTERIOR — que se estende pra dentro do mês visível.)
  for (let i = 0; i < occInMonth.length; i++) {
    const start = occInMonth[i];
    let end;
    if (i < occInMonth.length - 1) {
      end = addDays(occInMonth[i + 1], -1);
    } else {
      end = nextOcc ? addDays(nextOcc, -1) : new Date(year, month, daysInMonth);
    }
    blocos.push({
      indice: i + 1,
      startDate: start,
      endDate: end,
      title: `Bloco ${i + 1}`,
      period: formatPeriod(start, end),
    });
  }

  return blocos;
}

// Próxima ocorrência da subcategoria depois de fromDate (limite: 90 dias)
function nextOccurrenceAfter(sub, fromDate) {
  for (let i = 1; i <= 90; i++) {
    const d = addDays(fromDate, i);
    if (occursOn(sub, d)) return d;
  }
  return null;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatPeriod(start, end) {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sLow = MONTH_LABELS[start.getMonth()].toLowerCase();
  if (sameMonth) {
    if (start.getDate() === end.getDate()) return `${start.getDate()} de ${sLow}`;
    return `${start.getDate()} – ${end.getDate()} de ${sLow}`;
  }
  const eLow = MONTH_LABELS[end.getMonth()].toLowerCase();
  return `${start.getDate()} de ${sLow} – ${end.getDate()} de ${eLow}`;
}

/**
 * Distribui ocorrências de uma subcategoria nos blocos do mês.
 * Itera dia a dia dentro de cada bloco (inclusive dias do mês seguinte
 * quando o bloco atravessa). Retorna Map<indice, {count, firstDate}>.
 */
function distributeToBlocosDinamico(sub, blocos) {
  const result = new Map();
  blocos.forEach((b) => result.set(b.indice, { count: 0, firstDate: null }));

  for (const b of blocos) {
    const cell = result.get(b.indice);
    let cur = new Date(b.startDate);
    while (cur <= b.endDate) {
      if (occursOn(sub, cur)) {
        cell.count++;
        if (!cell.firstDate) cell.firstDate = isoDate(cur.getFullYear(), cur.getMonth(), cur.getDate());
      }
      cur = addDays(cur, 1);
    }
  }
  return result;
}

// -----------------------------
// Câmbio
// -----------------------------
async function refreshRates() {
  const used = [...new Set(
    cachedPagamentos.map((p) => p.moeda).filter((m) => m && m !== 'BRL')
  )];
  if (used.length === 0) return;

  await Promise.all(used.map(async (c) => {
    try {
      const rate = await fetchExchangeRate(c, 'BRL');
      ratesMap.set(c, rate);
    } catch (err) {
      console.warn('[refreshRates] falhou:', err);
    }
  }));
}

function convertToBRL(value, currency) {
  if (!currency || currency === 'BRL') return Number(value) || 0;
  const rate = ratesMap.get(currency);
  if (!rate) return null;
  return (Number(value) || 0) * rate;
}

// -----------------------------
// Renderização
// -----------------------------
function renderPagamentos() {
  const container = document.getElementById('pagamentos-container');
  const emptyState = document.getElementById('empty-state');

  // Atualiza contadores dos filtros (sempre baseado em todos os pagamentos)
  const counts = { todos: 0, pendentes: 0, atrasados: 0, pagos: 0, cancelados: 0 };
  cachedPagamentos.forEach((p) => {
    counts.todos++;
    counts[getStatusGroup(p)]++;
  });
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.querySelector(`[data-count="${k}"]`);
    if (el) el.textContent = v;
  });

  if (cachedPagamentos.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  // Aplica filtro
  const filtered = cachedPagamentos.filter(passesFilter);

  // Sort por data_vencimento, depois por nome
  const sortFn = (a, b) => {
    const d1 = (a.data_vencimento || '').localeCompare(b.data_vencimento || '');
    if (d1 !== 0) return d1;
    return displayName(a).localeCompare(displayName(b), 'pt-BR');
  };

  // Calcula blocos do mês (dinâmico se há renda principal, senão fallback quinzenal)
  const blocos = getBlocosForMonth(viewYear, viewMonth);
  const renda = cachedSubcategorias.find((s) => s.eh_renda_principal && s.status === 'ativa');

  // Banner explicando origem dos blocos
  let banner;
  if (renda) {
    const rendaName = escapeHtml(renda.apelido?.trim() || renda.nome);
    const firstStart = blocos[0]?.startDate;
    const startsAfterDay1 = firstStart && firstStart.getMonth() === viewMonth && firstStart.getDate() > 1;
    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevMonthLabel = MONTH_LABELS[prevMonth];
    const note = startsAfterDay1
      ? `<div class="blocos-origem-note">Pagamentos antes do dia ${firstStart.getDate()} estão no último bloco de ${prevMonthLabel} (que se estende até cá).</div>`
      : '';
    banner = `<div class="blocos-origem-banner">
      <div>Blocos definidos por <strong>${rendaName}</strong> · ${blocos.length} ocorrência${blocos.length === 1 ? '' : 's'} no mês</div>
      ${note}
    </div>`;
  } else {
    banner = `<div class="blocos-origem-banner blocos-origem-fallback">Sem renda principal cadastrada · usando fallback quinzenal (Bloco 1: 1–15, Bloco 2: 16–fim)</div>`;
  }

  const blocosHtml = blocos.map((b) => {
    const items = filtered.filter((p) => p.bloco_quinzenal === b.indice).sort(sortFn);
    return renderBloco(b.indice, b.title, b.period, items);
  }).join('');

  container.innerHTML = `${banner}<div class="pagamentos-blocos-container">${blocosHtml}</div>`;

  bindEdits();
}

function renderBloco(num, title, period, items) {
  // Calcula saldo do bloco (contabilizando apenas não-cancelados)
  // E também: realizado/restante (apenas despesas)
  const REALIZADO_STATUS = ['Pago', 'Cartão'];
  let saldoBRL = 0;
  let despesaRealizadaBRL = 0;
  let despesaRestanteBRL = 0;
  for (const p of items) {
    if (p.status === 'Cancelado') continue;
    const tipo = p.subcategorias?.tipo;
    const v = Number(p.valor_real ?? p.valor_previsto) || 0;
    const vBRL = convertToBRL(v, p.moeda);
    if (vBRL === null) continue;
    saldoBRL += (tipo === 'Receita' ? vBRL : -vBRL);

    if (tipo === 'Despesa') {
      if (REALIZADO_STATUS.includes(p.status)) despesaRealizadaBRL += vBRL;
      else despesaRestanteBRL += vBRL;
    }
  }

  const sign = saldoBRL > 0 ? '+' : (saldoBRL < 0 ? '-' : '');
  const cls = saldoBRL > 0 ? 'dre-positive' : (saldoBRL < 0 ? 'dre-negative' : 'dre-zero');
  const alertCls = saldoBRL <= 0 ? 'alerta-negativo' : '';
  const subtotalDisplay = `${sign}${formatCurrency(Math.abs(saldoBRL), 'BRL')}`;

  // Agrupa items por categoria parent
  const groups = new Map();
  cachedCategorias.forEach((cat) => groups.set(cat.id, []));
  const orphans = [];
  items.forEach((p) => {
    const catId = p.subcategorias?.categoria_id;
    if (catId && groups.has(catId)) groups.get(catId).push(p);
    else orphans.push(p);
  });

  // Monta rows com section headers (4 colunas agora: Compromisso, Vto, Valor, Status)
  const sectionRows = [];
  for (const cat of cachedCategorias) {
    const arr = groups.get(cat.id) || [];
    if (arr.length === 0) continue;
    sectionRows.push(`
      <tr class="cat-section" style="--cat-color: ${cat.cor};">
        <td colspan="4"><span class="cat-dot"></span>${escapeHtml(cat.nome)}</td>
      </tr>
    `);
    arr.forEach((p) => sectionRows.push(renderPagamentoRow(p, cat.cor)));
  }
  if (orphans.length > 0) {
    sectionRows.push(`
      <tr class="cat-section" style="--cat-color: #9CA3AF;">
        <td colspan="4"><span class="cat-dot"></span>Sem categoria</td>
      </tr>
    `);
    orphans.forEach((p) => sectionRows.push(renderPagamentoRow(p, '#9CA3AF')));
  }

  const body = items.length === 0
    ? `<div class="pagamento-empty-bloco">Nenhum pagamento neste bloco.</div>`
    : `
      <div class="pagamento-bloco-scroll">
        <table class="pagamento-bloco-table">
          <thead>
            <tr>
              <th>Compromisso</th>
              <th>Vto</th>
              <th class="text-right">Valor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${sectionRows.join('')}</tbody>
        </table>
      </div>
    `;

  // Header: título + período + 3 stats sempre visíveis no topo
  // (Saídas realizadas | Oportunidade de investimento | Saídas restantes)
  const oportunidade = saldoBRL;
  const oportClass = oportunidade > 0 ? 'dre-positive' : (oportunidade < 0 ? 'dre-negative' : 'dre-zero');
  const oportSign = oportunidade > 0 ? '+' : (oportunidade < 0 ? '-' : '');

  return `
    <div class="pagamento-bloco">
      <header class="pagamento-bloco-header">
        <div class="pagamento-bloco-title-row">
          <h3 class="pagamento-bloco-title">${title}</h3>
          <span class="pagamento-bloco-period">${period}</span>
        </div>
        <div class="pagamento-bloco-stats-row">
          <div class="pagamento-bloco-stat pagamento-bloco-stat-left">
            <span class="pagamento-bloco-stat-label">Saídas realizadas</span>
            <span class="pagamento-bloco-stat-value dre-negative">${formatCurrency(despesaRealizadaBRL, 'BRL')}</span>
          </div>
          <div class="pagamento-bloco-stat-center">
            <span class="pagamento-bloco-stat-label">Oportunidade de investimento</span>
            <span class="pagamento-bloco-stat-value-big ${oportClass} ${alertCls}">${oportSign}${formatCurrency(Math.abs(oportunidade), 'BRL')}</span>
          </div>
          <div class="pagamento-bloco-stat pagamento-bloco-stat-right">
            <span class="pagamento-bloco-stat-label">Saídas restantes</span>
            <span class="pagamento-bloco-stat-value">${formatCurrency(despesaRestanteBRL, 'BRL')}</span>
          </div>
        </div>
      </header>
      ${body}
    </div>
  `;
}

function renderPagamentoRow(p, catColor) {
  const sub = p.subcategorias;
  const display = displayName(p);
  const tipo = sub?.tipo;
  const tipoColor = tipo === 'Receita' ? 'var(--color-success)' : 'var(--color-danger)';
  const tipoSymbol = tipo === 'Receita' ? '+' : '-';
  const moeda = p.moeda || 'BRL';
  const isCancelado = p.status === 'Cancelado';
  const hasObs = !!(p.observacao && p.observacao.trim());
  const atrasadoFlag = isAtrasado(p);
  const isPaid = ['Pago', 'Transferido', 'Cartão', 'Parcial'].includes(p.status);

  // Valor (input em BRL) — começa preenchido com valor_real (que veio do auto-gen
  // como valor_previsto). User pode alterar antes de mudar o status.
  let valorInputValue = '';
  const valorBase = p.valor_real ?? p.valor_previsto;
  if (valorBase !== null && valorBase !== undefined) {
    const valorBRL = convertToBRL(Number(valorBase), moeda);
    valorInputValue = valorBRL !== null ? valorBRL.toFixed(2) : Number(valorBase).toFixed(2);
  }

  // Vencimento dia
  const vto = p.data_vencimento ? p.data_vencimento.slice(8, 10) : '—';

  // Status select
  const statusOptions = STATUS_OPTIONS.map((s) =>
    `<option value="${s.value}" ${p.status === s.value ? 'selected' : ''}>${s.label}</option>`
  ).join('');

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === p.status) || STATUS_OPTIONS[0];

  // Indicador de observação
  const obsIcon = hasObs
    ? `<span class="obs-indicator" title="${escapeHtml(p.observacao)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
       </span>`
    : '';

  // Indicador "atrasado"
  const atrasadoBadge = atrasadoFlag
    ? '<span class="atrasado-indicator">atrasado</span>'
    : '';

  // Indicador "restante de parcial"
  const parcialBadge = sub?.is_parcial
    ? '<span class="parcial-indicator" title="Compromisso criado de pagamento parcial">½ rest.</span>'
    : '';

  // Quick-pay button (só ativo pra status Agendado, mas sempre ocupa espaço pra não shiftar layout)
  const isAgendado = p.status === 'Agendado';
  const quickPayBtn = `<button class="btn-quick-pay ${isAgendado ? '' : 'is-hidden'}" data-quick-pay="${p.id}" title="Marcar como pago (status=Pago, valor real = previsto)" type="button" ${isAgendado ? '' : 'tabindex="-1" aria-hidden="true"'}>
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
       </button>`;

  return `
    <tr class="pag-row ${isCancelado ? 'cancelado' : ''} ${atrasadoFlag ? 'atrasado' : ''}" style="--cat-color: ${catColor};" data-id="${p.id}" data-moeda="${moeda}">
      <td>
        <div style="display: flex; align-items: center; gap: var(--space-2); min-width: 0;">
          <span style="color: ${tipoColor}; font-weight: var(--fw-bold); font-size: var(--fs-sm);">${tipoSymbol}</span>
          <span style="font-weight: var(--fw-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(display)}</span>
          ${parcialBadge}
          ${atrasadoBadge}
          ${obsIcon}
        </div>
      </td>
      <td class="tabular" style="font-size: var(--fs-xs); color: var(--color-text-secondary);">${vto}</td>
      <td class="text-right">
        <input
          type="number"
          step="0.01"
          min="0"
          class="pagamento-valor-real"
          data-pagamento-id="${p.id}"
          value="${valorInputValue}"
          placeholder="—"
          aria-label="Valor pago em BRL"
        />
      </td>
      <td>
        <span class="pag-actions-cell">
          <select class="pagamento-status-select ${currentStatus.cls}" data-pagamento-id="${p.id}">
            ${statusOptions}
          </select>
          ${quickPayBtn}
        </span>
      </td>
    </tr>
  `;
}

// -----------------------------
// Inline edits
// -----------------------------
function bindEdits() {
  // Status changes
  document.querySelectorAll('.pagamento-status-select').forEach((select) => {
    select.addEventListener('change', () => saveStatus(select));
    // Stop propagation pra não abrir modal ao mexer no select
    select.addEventListener('click', (e) => e.stopPropagation());
  });

  // Valor real changes
  document.querySelectorAll('.pagamento-valor-real').forEach((input) => {
    input.addEventListener('blur', () => saveValorReal(input));
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        input.blur();
      }
    });
  });

  // Quick-pay buttons (5.C): marcar como pago em 1 clique
  document.querySelectorAll('[data-quick-pay]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // não abrir modal
      quickPay(btn.dataset.quickPay);
    });
  });

  // Click na linha (fora dos inputs/botões) → abre modal de detalhes
  document.querySelectorAll('.pag-row').forEach((row) => {
    row.addEventListener('click', () => {
      const p = cachedPagamentos.find((x) => x.id === row.dataset.id);
      if (p) openDetailsModal(p);
    });
  });
}

// -----------------------------
// Quick action: marcar como pago (Fase 5.C)
// -----------------------------
async function quickPay(id) {
  const p = cachedPagamentos.find((x) => x.id === id);
  if (!p) return;
  if (p.status !== 'Agendado') return;

  // valor_real já vem preenchido — só muda o status
  const update = { status: 'Pago' };
  // Edge case: pagamento legado sem valor_real → preenche com valor_previsto
  if (p.valor_real === null || p.valor_real === undefined) {
    update.valor_real = Number(p.valor_previsto) || 0;
  }

  const { error } = await supabase
    .from('pagamentos')
    .update(update)
    .eq('id', id);

  if (error) {
    console.error('[quickPay]', error);
    showToast('Erro ao marcar como pago: ' + error.message, 'error', 8000);
    return;
  }

  Object.assign(p, update);
  showToast('Marcado como pago', 'success');
  renderPagamentos();

  // Propaga valor pago para a dívida vinculada (fire-and-forget)
  const dividaId = p.subcategorias?.divida_id;
  if (dividaId) propagateDivida(dividaId);

  // Sync transação vinculada (com feedback se falhar)
  syncWithFeedback(p, p.subcategorias);
}

// -----------------------------
// Propaga valor pago para dívida vinculada
// Recalcula do zero somando todos os pagamentos Pago/Cartão/Transferido/Parcial
// das subcategorias atreladas à dívida — idempotente e livre de delta bugs.
// -----------------------------
async function propagateDivida(dividaId) {
  if (!dividaId) return;

  const { data: subs } = await supabase
    .from('subcategorias')
    .select('id')
    .eq('divida_id', dividaId);

  if (!subs?.length) return;

  const { data: pags } = await supabase
    .from('pagamentos')
    .select('valor_real')
    .in('subcategoria_id', subs.map((s) => s.id))
    .in('status', ['Pago', 'Transferido', 'Cartão', 'Parcial']);

  const totalPago = (pags || []).reduce((s, p) => s + (Number(p.valor_real) || 0), 0);

  const { data: divida } = await supabase
    .from('dividas')
    .select('valor_total, status')
    .eq('id', dividaId)
    .single();

  if (!divida) return;

  const updates = { valor_pago: totalPago };
  if (divida.status !== 'Quitada' && totalPago >= Number(divida.valor_total)) {
    updates.status = 'Quitada';
  }

  await supabase.from('dividas').update(updates).eq('id', dividaId);
}

// -----------------------------
// Modal de detalhes do pagamento
// -----------------------------
function openDetailsModal(p) {
  detailsPagamento = p;
  const sub = p.subcategorias;
  const cat = sub?.categorias;
  const conta = cachedContas.find((c) => c.id === sub?.conta_id);

  // Título
  document.getElementById('pag-details-title').textContent = displayName(p);

  // Banco display
  let bancoHtml = '<span class="text-muted">—</span>';
  if (conta) {
    const contaDisplay = conta.apelido?.trim() || conta.nome;
    const bank = findBank(conta.nome);
    const bancoIcon = bank
      ? `<img src="${logoUrl(bank.domain)}" alt="" style="width:18px;height:18px;border-radius:50%;background:#fff;border:1px solid var(--color-border);object-fit:contain;padding:1px;">`
      : `<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${conta.icone_cor};color:#fff;font-size:9px;font-weight:bold;text-align:center;line-height:18px;">${(contaDisplay[0] || '?').toUpperCase()}</span>`;
    bancoHtml = `<span style="display:inline-flex;align-items:center;gap:6px;">${bancoIcon}${escapeHtml(contaDisplay)} (${conta.tipo})</span>`;
  }

  const moeda = p.moeda || 'BRL';
  const previstoBRL = convertToBRL(Number(p.valor_previsto) || 0, moeda);
  const realBRL = p.valor_real != null ? convertToBRL(Number(p.valor_real), moeda) : null;

  const tipo = sub?.tipo || '—';
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === p.status)?.label || p.status;

  const fields = [
    { label: 'Categoria',       value: cat ? cat.nome : '—' },
    { label: 'Tipo',            value: tipo },
    { label: 'Banco / Cartão',  value: bancoHtml, html: true },
    { label: 'Tipo pagamento',  value: sub?.tipo_pagamento || '—' },
    { label: 'Vencimento',      value: p.data_vencimento ? formatDateBR(p.data_vencimento) : '—' },
    { label: 'Bloco',           value: `Bloco ${p.bloco_quinzenal}` },
    { label: 'Valor previsto',  value: previstoBRL !== null ? formatCurrency(previstoBRL, 'BRL') : `${formatCurrency(p.valor_previsto, moeda)} ${moeda}` },
    { label: 'Valor real',      value: realBRL !== null ? formatCurrency(realBRL, 'BRL') : (p.valor_real != null ? `${formatCurrency(p.valor_real, moeda)} ${moeda}` : '—') },
    { label: 'Status',          value: statusLabel },
    { label: 'Moeda original',  value: moeda },
  ];

  document.getElementById('pag-details-grid').innerHTML = fields.map((f) => `
    <div class="details-field">
      <span class="details-field-label">${f.label}</span>
      <span class="details-field-value ${!f.value ? 'details-field-empty' : ''}">${f.html ? f.value : escapeHtml(String(f.value || '—'))}</span>
    </div>
  `).join('');

  // Observação
  document.getElementById('pag-observacao').value = p.observacao || '';

  openModal('modal-pag-details');
}

async function saveObservacao() {
  if (!detailsPagamento) return;
  const button = document.getElementById('btn-salvar-observacao');
  const newObs = document.getElementById('pag-observacao').value.trim() || null;

  if (newObs === (detailsPagamento.observacao || null)) {
    closeModal('modal-pag-details');
    return;
  }

  const original = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Salvando…';

  const { error } = await supabase
    .from('pagamentos')
    .update({ observacao: newObs })
    .eq('id', detailsPagamento.id);

  button.disabled = false;
  button.textContent = original;

  if (error) {
    console.error('[saveObservacao]', error);
    showToast('Erro ao salvar: ' + error.message, 'error', 8000);
    return;
  }

  detailsPagamento.observacao = newObs;
  showToast('Observação salva', 'success');
  closeModal('modal-pag-details');
  renderPagamentos(); // re-render pra atualizar indicador
}

function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

// -----------------------------
// Fluxo de pagamento parcial
// -----------------------------

// Verifica se há restante significativo e abre o modal de confirmação.
// Chamado por saveStatus (status → Parcial) e por saveValorReal (status já Parcial).
function checkParcialAndSuggest(pag) {
  if (pag.valor_real == null) return;
  const prevBRL  = convertToBRL(Number(pag.valor_previsto ?? 0), pag.moeda);
  const realBRL  = convertToBRL(Number(pag.valor_real), pag.moeda);
  if (prevBRL === null || realBRL === null) return;
  const restanteBRL = prevBRL - realBRL;
  if (restanteBRL < 0.01) return;

  parcialState = {
    pag,
    restanteOrig: Number(pag.valor_previsto) - Number(pag.valor_real),
    restanteBRL,
  };

  document.getElementById('parcial-restante-valor').textContent = formatCurrency(restanteBRL, 'BRL');
  openModal('modal-parcial-confirm');
}

// Passa do modal de confirmação para o modal com o pré-preenchimento.
function openParcialNovoComp() {
  closeModal('modal-parcial-confirm');
  if (!parcialState) return;

  const { restanteBRL, pag } = parcialState;
  const sub   = pag.subcategorias;
  const conta = cachedContas.find((c) => c.id === sub?.conta_id);

  const fields = [
    { label: 'Nome',            value: sub?.apelido?.trim() || sub?.nome || '—' },
    { label: 'Valor restante',  value: formatCurrency(restanteBRL, 'BRL') },
    { label: 'Categoria',       value: sub?.categorias?.nome || '—' },
    { label: 'Tipo',            value: sub?.tipo || '—' },
    { label: 'Período',         value: sub?.periodo || '—' },
    { label: 'Conta',           value: conta ? (conta.apelido?.trim() || conta.nome) : '—' },
    { label: 'Tipo pagamento',  value: sub?.tipo_pagamento || '—' },
  ];

  document.getElementById('pns-summary').innerHTML = fields.map((f) => `
    <div class="details-field">
      <span class="details-field-label">${escapeHtml(f.label)}</span>
      <span class="details-field-value">${escapeHtml(String(f.value))}</span>
    </div>`).join('');

  // Sugere o dia seguinte ao vencimento como data de início
  const base = pag.data_vencimento ? new Date(pag.data_vencimento + 'T00:00:00') : new Date();
  base.setDate(base.getDate() + 1);
  document.getElementById('pns-data-inicio').value =
    `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;

  openModal('modal-parcial-novo-comp');
}

// Cria a subcategoria/compromisso com is_parcial = true.
async function criarCompromissoParcial() {
  if (!parcialState) return;
  const dataInicio = document.getElementById('pns-data-inicio').value;
  if (!dataInicio) { showToast('Informe a data de início', 'error'); return; }

  const { pag, restanteOrig } = parcialState;
  const sub  = pag.subcategorias;
  const user = await getCurrentUser();
  if (!user) return;

  const btn      = document.getElementById('btn-pns-criar');
  const original = btn.textContent;
  btn.disabled   = true;
  btn.innerHTML  = '<span class="spinner"></span>';

  const { data, error } = await supabase
    .from('subcategorias')
    .insert({
      user_id:        user.id,
      nome:           sub.nome,
      apelido:        sub.apelido || null,
      tipo:           sub.tipo,
      categoria_id:   sub.categoria_id,
      conta_id:       sub.conta_id       || null,
      tipo_pagamento: sub.tipo_pagamento || null,
      periodo:        sub.periodo,
      vencimento_dia: sub.vencimento_dia || null,
      dia_semana:     sub.dia_semana     ?? null,
      valor_base:     restanteOrig,
      moeda:          sub.moeda,
      iniciado_em:    dataInicio,
      terminado_em:   null,
      projeto_id:     sub.projeto_id  || null,
      divida_id:      sub.divida_id   || null,
      contato_id:     sub.contato_id  || null,
      is_parcial:     true,
      status:         'ativa',
      valor_variavel: false,
      descricao:      sub.descricao   || null,
    })
    .select()
    .single();

  btn.disabled  = false;
  btn.textContent = original;

  if (error) {
    let msg = error.message;
    if (/column.*is_parcial/i.test(msg)) msg = 'Coluna is_parcial não existe — rode a migration 0027 no Supabase.';
    showToast('Erro ao criar compromisso: ' + msg, 'error', 8000);
    return;
  }

  showToast(`Compromisso "${data.apelido?.trim() || data.nome}" criado com o valor restante`, 'success');
  closeModal('modal-parcial-novo-comp');
  parcialState = null;
}

async function saveStatus(select) {
  const id = select.dataset.pagamentoId;
  const newStatus = select.value;
  const pag = cachedPagamentos.find((p) => p.id === id);
  if (!pag || pag.status === newStatus) return;

  const { error } = await supabase
    .from('pagamentos')
    .update({ status: newStatus })
    .eq('id', id);
  if (error) {
    console.error('[saveStatus]', error);
    showToast('Erro ao salvar status: ' + error.message, 'error', 8000);
    select.value = pag.status; // restore
    return;
  }

  pag.status = newStatus;
  // Atualiza classe do select pra refletir cor
  STATUS_OPTIONS.forEach((s) => select.classList.remove(s.cls));
  const cur = STATUS_OPTIONS.find((s) => s.value === newStatus);
  if (cur) select.classList.add(cur.cls);
  // Re-render pra recalcular saldo do bloco
  renderPagamentos();

  // Propaga para dívida vinculada (qualquer mudança de status pode alterar o total)
  const dividaId = pag.subcategorias?.divida_id;
  if (dividaId) propagateDivida(dividaId);

  // Sync transação vinculada (com feedback se falhar)
  syncWithFeedback(pag, pag.subcategorias);

  // Se ficou Parcial, oferece criar compromisso pro restante
  if (newStatus === 'Parcial') checkParcialAndSuggest(pag);
}

async function saveValorReal(input) {
  const id = input.dataset.pagamentoId;
  const raw = input.value.trim();
  const pag = cachedPagamentos.find((p) => p.id === id);
  if (!pag) return;

  // Empty = unset (null)
  let newValueOrig = null;
  if (raw !== '') {
    const newValueBRL = Number(raw);
    if (isNaN(newValueBRL) || newValueBRL < 0) {
      showToast('Valor inválido', 'error');
      // Restore
      const oldBRL = pag.valor_real != null ? convertToBRL(Number(pag.valor_real), pag.moeda) : null;
      input.value = oldBRL !== null ? oldBRL.toFixed(2) : '';
      return;
    }
    // Convert BRL → moeda original
    if (pag.moeda === 'BRL') {
      newValueOrig = newValueBRL;
    } else {
      const rate = ratesMap.get(pag.moeda);
      if (!rate) {
        showToast(`Câmbio ${pag.moeda} indisponível`, 'error', 8000);
        return;
      }
      newValueOrig = newValueBRL / rate;
    }
  }

  // Sem mudança real
  const oldOrig = pag.valor_real;
  if (oldOrig == null && newValueOrig == null) return;
  if (oldOrig != null && newValueOrig != null && Math.abs(oldOrig - newValueOrig) < 0.005) return;

  input.classList.add('saving');
  input.classList.remove('saved');

  const { error } = await supabase
    .from('pagamentos')
    .update({ valor_real: newValueOrig })
    .eq('id', id);

  input.classList.remove('saving');

  if (error) {
    console.error('[saveValorReal]', error);
    showToast('Erro ao salvar: ' + error.message, 'error', 8000);
    const oldBRL = oldOrig != null ? convertToBRL(Number(oldOrig), pag.moeda) : null;
    input.value = oldBRL !== null ? oldBRL.toFixed(2) : '';
    return;
  }

  pag.valor_real = newValueOrig;
  input.classList.add('saved');
  setTimeout(() => input.classList.remove('saved'), 1500);

  // Re-render pra recalcular saldo
  renderPagamentos();

  // Se o pagamento já está pago, recalcula a dívida vinculada
  // e atualiza valor da transação vinculada
  if (isPaidStatus(pag.status)) {
    const dividaId = pag.subcategorias?.divida_id;
    if (dividaId) propagateDivida(dividaId);
    syncWithFeedback(pag, pag.subcategorias);
  }

  // Se ficou Parcial, oferece criar compromisso pro restante
  if (pag.status === 'Parcial') checkParcialAndSuggest(pag);
}

// -----------------------------
// Wrapper de sync com toast em erro/sucesso
// Torna visível qualquer falha (ex: migration 0022 não rodada)
// -----------------------------
function syncWithFeedback(pagamento, subcategoria) {
  console.log('[sync transacao] iniciando…', { pagamentoId: pagamento?.id, status: pagamento?.status, sub: subcategoria?.nome });
  syncPagamentoToTransacao(pagamento, subcategoria)
    .then((result) => {
      console.log('[sync transacao] resultado:', result);
      if (!result) {
        showToast('Sync sem resultado (verifique console)', 'warning', 8000);
        return;
      }
      if (result.action === 'error') {
        let msg = result.reason || 'erro desconhecido';
        if (/pagamento_id|column.*does not exist/i.test(msg)) {
          msg = 'Coluna pagamento_id não existe — rode a migration 0022 no Supabase.';
        } else if (/relation.*transacoes/i.test(msg)) {
          msg = 'Tabela transacoes não existe — rode a migration 0021 no Supabase.';
        }
        showToast('Sync transação falhou: ' + msg, 'error', 12000);
      } else if (result.action === 'created') {
        showToast('Transação criada na página Transações', 'success', 4000);
      } else if (result.action === 'updated') {
        showToast('Transação vinculada atualizada', 'success', 3000);
      } else if (result.action === 'unlinked') {
        showToast('Transação desvinculada (status voltou pra agendado)', 'info', 3000);
      } else if (result.action === 'skipped') {
        showToast('Sync pulado: ' + (result.reason || ''), 'warning', 5000);
      }
    })
    .catch((e) => {
      console.error('[sync transacao] exception:', e);
      showToast('Sync transação falhou: ' + (e?.message || e), 'error', 12000);
    });
}

// -----------------------------
// Recurrence helpers (duplicado de orcamento.js)
// -----------------------------
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

function countOccurrencesInMonth(sub, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    if (occursOn(sub, d)) count++;
  }
  return count;
}

function isActiveInMonth(sub, year, month) {
  if (sub.status !== 'ativa') return false;
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  if (sub.iniciado_em) {
    const start = new Date(sub.iniciado_em + 'T00:00:00');
    if (start > monthEnd) return false;
  }
  if (sub.terminado_em) {
    const end = new Date(sub.terminado_em + 'T00:00:00');
    if (end < monthStart) return false;
  }
  return true;
}

// -----------------------------
// Util
// -----------------------------
function isoMonth(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function displayName(p) {
  const sub = p.subcategorias;
  return sub?.apelido?.trim() || sub?.nome || '—';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
  );
}
