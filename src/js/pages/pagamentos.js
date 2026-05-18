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
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatCurrency, formatCurrencyHTML } from '../lib/compromissos-config.js';
import { fetchExchangeRate } from '../lib/currency.js';
import { initCurrencyWidget } from '../components/currency-widget.js';
import { findBank, logoUrl } from '../lib/banks.js';
import { syncPagamentoToTransacao, isPaidStatus, findTransacaoLinkedToPagamento } from '../lib/transacao-pagamento-sync.js';
import { escapeHtml, formatDateBR, isoMonth, showConfirm, parseUserNumber } from '../lib/utils.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';
import { MOEDAS } from '../lib/compromissos-config.js';

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


const ratesMap = new Map();          // 'USD' → 5.15
const finalizedItemsByBloco = new Map(); // num → items[], para o modal de finalizados
const canceledItemsByBloco  = new Map(); // num → items[], para o modal de cancelados

const FINALIZADOS_STATUS = new Set(['Pago', 'Transferido']);

// Status removido da UI mas mantido no DB enquanto dados históricos existirem
const DEPRECATED_STATUSES = new Set(['Cartão']);

function getMainCurrencySymbol() {
  const code = localStorage.getItem('finflow.moeda_padrao') || 'BRL';
  return MOEDAS.find((m) => m.code === code)?.symbol || code;
}

const MONTH_LABELS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const STATUS_OPTIONS = [
  { value: 'Agendado',      label: 'A Pagar',       cls: 'status-agendado' },
  { value: 'Pago',          label: 'Pago',          cls: 'status-pago' },
  { value: 'A Transferir',  label: 'A Transferir',  cls: 'status-a-transferir' },
  { value: 'Transferido',   label: 'Transferido',   cls: 'status-transferido' },
  { value: 'Cancelado',     label: 'Cancelado',     cls: 'status-cancelado' },
  // Legado — só aparece no select quando o pagamento JÁ tem esse status
  { value: 'Cartão',        label: 'Cartão',        cls: 'status-cartao' },
];

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('pagamentos');
  initTutorial('pagamentos');
  await loadStrings();
  applyTranslationsToDom();
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

  // Close modals (data-close-modal)
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  // Salvar observação no modal de detalhes
  document.getElementById('btn-salvar-observacao').addEventListener('click', saveObservacao);

  // Filtros
  document.getElementById('status-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.cf-status-tab');
    if (!btn) return;
    document.querySelectorAll('#status-filters .cf-status-tab').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    filterStatus = btn.dataset.filter;
    renderPagamentos();
  });
}

// -----------------------------
// Status helpers (Fase 5.C)
// -----------------------------
function isAtrasado(p) {
  if (p.status !== 'Agendado' && p.status !== 'A Transferir') return false;
  if (!p.data_vencimento) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const venc = new Date(p.data_vencimento + 'T00:00:00');
  return venc < today;
}

function getStatusGroup(p) {
  if (p.status === 'Cancelado') return 'cancelados';
  if (['Pago', 'Transferido', 'Cartão'].includes(p.status)) return 'pagos'; // Cartão: legado
  if (isAtrasado(p)) return 'atrasados'; // cobre Agendado e A Transferir
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
    showToast(t('pagamentos.toast.schema_desatualizado', 'Schema desatualizado. Rode a migration 0011 no Supabase pra blocos dinâmicos.'), 'error', 12000);
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
      for (const dataVenc of cell.dates) {
        rows.push({
          user_id: user.id,
          orcamento_id: orc.id,
          subcategoria_id: sub.id,
          mes_ano: mesAno,
          bloco_quinzenal: bloco.indice,
          valor_previsto: valorPorOcorrencia,
          valor_real: valorPorOcorrencia, // começa preenchido com o previsto; user pode alterar
          moeda: orc.moeda,
          status: (sub.tipo === 'Transferência' || sub.tipo === 'Caixinha') ? 'A Transferir' : 'Agendado',
          data_vencimento: dataVenc,
        });
      }
    }
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('pagamentos').upsert(rows, {
      onConflict: 'user_id,subcategoria_id,mes_ano,data_vencimento',
      ignoreDuplicates: true,
    });
    if (insertError) console.error('[ensurePagamentosForMonth]', insertError);
  }

  // Para compromissos de dívida: sincroniza valor_previsto/valor_real de entradas pendentes
  // com o orcamento_geral atual. Necessário porque o upsert acima usa ignoreDuplicates:true
  // e não atualiza linhas já existentes quando a dívida foi editada após a criação.
  const PENDENTE = ['Agendado', 'Atrasado', 'A Transferir'];
  for (const orc of orcamentos) {
    const sub = cachedSubcategorias.find((s) => s.id === orc.subcategoria_id);
    if (!sub?.divida_id || Number(orc.valor_previsto) <= 0) continue;
    const occThisMonth = countOccurrencesInMonth(sub, year, month) || 1;
    const valorSinc = Number((Number(orc.valor_previsto) / occThisMonth).toFixed(2));
    await supabase
      .from('pagamentos')
      .update({ valor_previsto: valorSinc, valor_real: valorSinc })
      .eq('subcategoria_id', orc.subcategoria_id)
      .eq('mes_ano', mesAno)
      .in('status', PENDENTE);
  }
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
 * quando o bloco atravessa). Retorna Map<indice, {count, dates: string[]}>.
 */
function distributeToBlocosDinamico(sub, blocos) {
  const result = new Map();
  blocos.forEach((b) => result.set(b.indice, { count: 0, dates: [] }));

  for (const b of blocos) {
    const cell = result.get(b.indice);
    let cur = new Date(b.startDate);
    while (cur <= b.endDate) {
      if (occursOn(sub, cur)) {
        cell.count++;
        cell.dates.push(isoDate(cur.getFullYear(), cur.getMonth(), cur.getDate()));
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

  const alertCls = saldoBRL <= 0 ? 'alerta-negativo' : '';

  // Separa finalizados, cancelados e ativos
  const finalizedItems = items.filter((p) => FINALIZADOS_STATUS.has(p.status));
  const canceledItems  = items.filter((p) => p.status === 'Cancelado');
  const activeItems    = items.filter((p) => !FINALIZADOS_STATUS.has(p.status) && p.status !== 'Cancelado');
  finalizedItemsByBloco.set(num, finalizedItems);
  canceledItemsByBloco.set(num, canceledItems);

  // Agrupa items ativos por categoria parent
  const groups = new Map();
  cachedCategorias.forEach((cat) => groups.set(cat.id, []));
  const orphans = [];
  activeItems.forEach((p) => {
    const catId = p.subcategorias?.categoria_id;
    if (catId && groups.has(catId)) groups.get(catId).push(p);
    else orphans.push(p);
  });

  // Monta rows com section headers (7 colunas: Compromisso, Conta, Destino, Vto, Dias, Valor, Status)
  const COL_SPAN = 7;
  const sectionRows = [];
  for (const cat of cachedCategorias) {
    const arr = groups.get(cat.id) || [];
    if (arr.length === 0) continue;
    sectionRows.push(`
      <tr class="cat-section" style="--cat-color: ${cat.cor};">
        <td colspan="${COL_SPAN}"><span class="cat-dot"></span>${escapeHtml(cat.nome)}</td>
      </tr>
    `);
    arr.forEach((p) => sectionRows.push(renderPagamentoRow(p, cat.cor)));
  }
  if (orphans.length > 0) {
    sectionRows.push(`
      <tr class="cat-section" style="--cat-color: #9CA3AF;">
        <td colspan="${COL_SPAN}"><span class="cat-dot"></span>Sem categoria</td>
      </tr>
    `);
    orphans.forEach((p) => sectionRows.push(renderPagamentoRow(p, '#9CA3AF')));
  }

  // Linha unificada: Finalizados (esq) · Cancelados (dir)
  const finalizadosBtn = finalizedItems.length > 0 ? `
    <span class="pag-summary-btn pag-summary-finalizados" data-bloco="${num}" role="button" tabindex="0" title="Ver pagamentos finalizados">
      <span class="finalizados-row-label">Finalizados</span>
      <span class="finalizados-badge">${finalizedItems.length}</span>
      <svg class="finalizados-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </span>
  ` : '<span></span>';

  const canceladosBtn = canceledItems.length > 0 ? `
    <span class="pag-summary-btn pag-summary-cancelados" data-bloco="${num}" role="button" tabindex="0" title="Ver pagamentos cancelados">
      <svg class="cancelados-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      <span class="cancelados-badge">${canceledItems.length}</span>
      <span class="cancelados-row-label">Cancelados</span>
    </span>
  ` : '';

  const summaryRow = (finalizedItems.length > 0 || canceledItems.length > 0) ? `
    <tr class="pag-summary-row">
      <td colspan="${COL_SPAN}">
        <div class="pag-summary-row-inner">
          ${finalizadosBtn}
          ${canceladosBtn}
        </div>
      </td>
    </tr>
  ` : '';

  const body = items.length === 0
    ? `<div class="pagamento-empty-bloco">Nenhum pagamento neste bloco.</div>`
    : `
      <div class="pagamento-bloco-scroll">
        <table class="pagamento-bloco-table">
          <colgroup>
            <col>
            <col style="width:150px;">
            <col style="width:100px;">
            <col style="width:45px;">
            <col style="width:72px;">
            <col style="width:130px;">
            <col style="width:120px;">
          </colgroup>
          <thead>
            <tr>
              <th>Compromisso</th>
              <th class="pag-conta-header">Conta Pgto</th>
              <th>Destino</th>
              <th class="text-center">Vto</th>
              <th class="text-center">Dias</th>
              <th class="text-right">Valor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${sectionRows.join('')}${summaryRow}</tbody>
        </table>
      </div>
    `;

  // Header: título + período + 3 stats sempre visíveis no topo
  // (Saídas realizadas | Oportunidade de investimento | Saídas restantes)
  const oportunidade = saldoBRL;
  const oportClass = oportunidade > 0 ? 'dre-positive' : (oportunidade < 0 ? 'dre-negative' : 'dre-zero');

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
            <span class="pagamento-bloco-stat-value dre-negative">${formatCurrencyHTML(despesaRealizadaBRL, 'BRL')}</span>
          </div>
          <div class="pagamento-bloco-stat-center">
            <span class="pagamento-bloco-stat-label">Oportunidade de investimento</span>
            <span class="pagamento-bloco-stat-value-big ${oportClass} ${alertCls}">${formatCurrencyHTML(oportunidade, 'BRL')}</span>
          </div>
          <div class="pagamento-bloco-stat pagamento-bloco-stat-right">
            <span class="pagamento-bloco-stat-label">Saídas restantes</span>
            <span class="pagamento-bloco-stat-value">${formatCurrencyHTML(despesaRestanteBRL, 'BRL')}</span>
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
  const moedaSymbol = MOEDAS.find((m) => m.code === moeda)?.symbol || moeda;
  const isCancelado = p.status === 'Cancelado';
  const hasObs = !!(p.observacao && p.observacao.trim());
  const atrasadoFlag = isAtrasado(p);
  // Valor: converte pra BRL se tiver taxa; senão mostra no valor original.
  // displaySymbol: R$ quando convertido, símbolo da moeda original quando não.
  let valorInputValue = '';
  let displaySymbol = moedaSymbol;
  const valorBase = p.valor_real ?? p.valor_previsto;
  if (valorBase !== null && valorBase !== undefined) {
    const valorBRL = convertToBRL(Number(valorBase), moeda);
    if (valorBRL !== null) {
      valorInputValue = valorBRL.toFixed(2);
      displaySymbol = getMainCurrencySymbol(); // convertido → moeda principal
    } else {
      valorInputValue = Number(valorBase).toFixed(2);
      // displaySymbol mantém o símbolo original (taxa não encontrada)
    }
  }

  // Vencimento dia
  const vto = p.data_vencimento ? p.data_vencimento.slice(8, 10) : '—';

  // Status select — filtra deprecated (Cartão) exceto se o pagamento já tem esse status
  const statusOptions = STATUS_OPTIONS
    .filter((s) => !DEPRECATED_STATUSES.has(s.value) || s.value === p.status)
    .map((s) => `<option value="${s.value}" ${p.status === s.value ? 'selected' : ''}>${s.label}</option>`)
    .join('');
  const currentStatus = STATUS_OPTIONS.find((s) => s.value === p.status) || STATUS_OPTIONS[0];

  // Indicador de observação
  const obsIcon = hasObs
    ? `<span class="obs-indicator" title="${escapeHtml(p.observacao)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
       </span>`
    : '';

  // Indicador de descrição
  const desc = sub?.descricao?.trim() || '';
  const descIcon = desc
    ? `<span class="desc-indicator" tabindex="0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span class="desc-popover">${escapeHtml(desc)}</span>
       </span>`
    : '';

  // Coluna Conta — logo do banco/cartão de origem
  const contaOrigem = cachedContas.find((c) => c.id === sub?.conta_id);
  const contaLabel  = contaOrigem ? escapeHtml(contaOrigem.apelido?.trim() || contaOrigem.nome) : '';
  let contaLogoHtml = '';
  if (contaOrigem) {
    const bank = findBank(contaOrigem.nome);
    const logoEl = bank
      ? `<img src="${logoUrl(bank.domain)}" alt="${contaLabel}" class="pag-conta-logo">`
      : `<span class="pag-conta-logo-fallback" style="--conta-color:${contaOrigem.icone_cor || '#9CA3AF'}">${(contaLabel[0] || '?').toUpperCase()}</span>`;
    contaLogoHtml = `<div class="pag-conta-inner">${logoEl}<span class="pag-conta-name">${contaLabel}</span></div>`;
  }

  // Coluna Destino — badge Caixinha/Reserva p/ compromissos de poupança, Regular p/ os demais
  const isCaixinhaTipo = sub?.tipo === 'Caixinha';
  const destContaRaw = (sub?.tipo === 'Transferência' || isCaixinhaTipo) && sub?.conta_destino_id
    ? cachedContas.find((c) => c.id === sub.conta_destino_id) : null;
  let tipoBadgeHtml;
  if (isCaixinhaTipo) {
    const subLabel = escapeHtml(sub?.apelido?.trim() || sub?.nome || '');
    tipoBadgeHtml = `<span class="pag-destino-badge destino-caixinha">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.6.5 2.8 1.5 3.8L4 18h3l1-1.7c1 .4 2 .7 3 .7s2-.3 3-.7L15 18h3l-1.5-2.2c.7-.7 1.2-1.5 1.5-2.3 1 0 2-1 2-2v-2c0-1-1-2-2-2 0-1-1-2.5-1-2.5z"/><circle cx="16" cy="10" r="0.5" fill="currentColor"/><path d="M2 11v1c0 1 1 2 2 2"/></svg>
      ${subLabel}
    </span>`;
  } else if (destContaRaw?.tipo === 'Cofrinho') {
    const destLabel = escapeHtml(destContaRaw.apelido?.trim() || destContaRaw.nome);
    tipoBadgeHtml = `<span class="pag-destino-badge destino-caixinha">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="2"/><path d="M4 6v12c0 1.5 3.6 2 8 2s8-.5 8-2V6"/><path d="M4 12c0 1.5 3.6 2 8 2s8-.5 8-2"/></svg>
      ${destLabel}
    </span>`;
  } else {
    tipoBadgeHtml = `<span class="pag-destino-badge destino-regular">Regular</span>`;
  }

  // Coluna Dias — countdown até vencimento para pagamentos pendentes
  const isPendingDias = p.status === 'Agendado' || p.status === 'A Transferir';
  let diasHtml = '—';
  if (isPendingDias && p.data_vencimento) {
    const todayDias = new Date();
    todayDias.setHours(0, 0, 0, 0);
    const vencDias = new Date(p.data_vencimento + 'T00:00:00');
    const days = Math.round((vencDias - todayDias) / 86400000);
    if (days < 0) {
      diasHtml = `<span class="pag-dias-badge pag-dias-atrasado">${Math.abs(days)}d atr.</span>`;
    } else if (days === 0) {
      diasHtml = `<span class="pag-dias-badge pag-dias-hoje">hoje</span>`;
    } else if (days === 1) {
      diasHtml = `<span class="pag-dias-badge pag-dias-urgente">amanhã</span>`;
    } else if (days <= 7) {
      diasHtml = `<span class="pag-dias-badge pag-dias-proximo">${days}d</span>`;
    } else {
      diasHtml = `<span class="pag-dias-badge pag-dias-ok">${days}d</span>`;
    }
  }

  return `
    <tr class="pag-row ${isCancelado ? 'cancelado' : ''} ${atrasadoFlag ? 'atrasado' : ''}" style="--cat-color: ${catColor};" data-id="${p.id}" data-moeda="${moeda}">
      <td>
        <div style="display: flex; align-items: center; gap: var(--space-2); min-width: 0;">
          <span style="color: ${tipoColor}; font-weight: var(--fw-bold); font-size: var(--fs-sm);">${tipoSymbol}</span>
          <span style="font-weight: var(--fw-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(display)}</span>
          ${obsIcon}
          ${descIcon}
        </div>
      </td>
      <td class="pag-conta-cell">${contaLogoHtml}</td>
      <td>${tipoBadgeHtml}</td>
      <td class="tabular text-center" style="font-size: var(--fs-xs); color: var(--color-text-secondary);">${vto}</td>
      <td class="text-center pag-dias-cell">${diasHtml}</td>
      <td class="text-right">
        <span class="orcamento-input-group">
          <span class="brl-prefix">${displaySymbol}</span>
          <input
            type="text"
            inputmode="decimal"
            class="pagamento-valor-real"
            data-pagamento-id="${p.id}"
            value="${valorInputValue}"
            placeholder="—"
            aria-label="Valor pago em ${moeda}"
          />
        </span>
      </td>
      <td>
        <select class="pagamento-status-select ${currentStatus.cls}" data-pagamento-id="${p.id}">
          ${statusOptions}
        </select>
      </td>
    </tr>
  `;
}

// -----------------------------
// Inline edits
// -----------------------------
// Event delegation no container estável (#pagamentos-container).
// Idempotente — pode ser chamado a cada render sem acumular handlers.
function bindEdits() {
  const container = document.getElementById('pagamentos-container');
  if (!container || container._delegationBound) return;
  container._delegationBound = true;

  // CHANGE: status select + valor-real blur (capture em vez de bubble pra blur)
  container.addEventListener('change', (e) => {
    const sel = e.target.closest('.pagamento-status-select');
    if (sel) { saveStatus(sel); return; }
  });

  container.addEventListener('blur', (e) => {
    const inp = e.target.closest('.pagamento-valor-real');
    if (inp) saveValorReal(inp);
  }, true); // capture phase — blur não bubbles

  // CLICK: stop-propagation em inputs + dispatch row click
  container.addEventListener('click', (e) => {
    // Inputs/selects: não abrir modal ao clicar
    if (e.target.closest('.pagamento-status-select, .pagamento-valor-real')) {
      e.stopPropagation();
      return;
    }

    const finBtn = e.target.closest('.pag-summary-finalizados');
    if (finBtn) {
      const num = Number(finBtn.dataset.bloco);
      openFinalizadosModal(num);
      return;
    }

    const canBtn = e.target.closest('.pag-summary-cancelados');
    if (canBtn) {
      const num = Number(canBtn.dataset.bloco);
      openFinalizadosModal(num, 'cancelados');
      return;
    }

    const row = e.target.closest('.pag-row');
    if (row) {
      const p = cachedPagamentos.find((x) => x.id === row.dataset.id);
      if (p) openDetailsModal(p);
    }
  });

  // KEYDOWN: Enter/Escape no valor-real + Enter no finalizados-row
  container.addEventListener('keydown', (e) => {
    const finRow = e.target.closest('.pag-summary-finalizados');
    if (finRow && e.key === 'Enter') { openFinalizadosModal(Number(finRow.dataset.bloco)); return; }
    const canRow = e.target.closest('.pag-summary-cancelados');
    if (canRow && e.key === 'Enter') { openFinalizadosModal(Number(canRow.dataset.bloco), 'cancelados'); return; }
    const inp = e.target.closest('.pagamento-valor-real');
    if (!inp) return;
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    else if (e.key === 'Escape') { inp.blur(); }
  });

  // Modal finalizados — fechar
  document.getElementById('btn-close-finalizados')?.addEventListener('click', closeFinalizadosModal);
  document.getElementById('btn-cancel-finalizados')?.addEventListener('click', closeFinalizadosModal);
  document.getElementById('modal-finalizados')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-finalizados') closeFinalizadosModal();
  });
}

// -----------------------------
// Modal: Finalizados do bloco
// -----------------------------
function openFinalizadosModal(blocoNum, type = 'finalizados') {
  const items = type === 'cancelados'
    ? (canceledItemsByBloco.get(blocoNum) || [])
    : (finalizedItemsByBloco.get(blocoNum) || []);
  const title = document.getElementById('modal-finalizados-title');
  const tbody = document.getElementById('modal-finalizados-tbody');
  if (!title || !tbody) return;

  const typeLabel = type === 'cancelados' ? 'Cancelados' : 'Finalizados';
  title.textContent = `${typeLabel} — Bloco ${blocoNum} (${items.length})`;

  // Agrupa por categoria para manter consistência visual
  const groups = new Map();
  cachedCategorias.forEach((cat) => groups.set(cat.id, []));
  const orphans = [];
  items.forEach((p) => {
    const catId = p.subcategorias?.categoria_id;
    if (catId && groups.has(catId)) groups.get(catId).push(p);
    else orphans.push(p);
  });

  const rows = [];
  for (const cat of cachedCategorias) {
    const arr = groups.get(cat.id) || [];
    if (!arr.length) continue;
    rows.push(`<tr class="cat-section" style="--cat-color: ${cat.cor};"><td colspan="7"><span class="cat-dot"></span>${escapeHtml(cat.nome)}</td></tr>`);
    arr.forEach((p) => rows.push(renderPagamentoRow(p, cat.cor)));
  }
  if (orphans.length) {
    rows.push(`<tr class="cat-section" style="--cat-color: #9CA3AF;"><td colspan="7"><span class="cat-dot"></span>Sem categoria</td></tr>`);
    orphans.forEach((p) => rows.push(renderPagamentoRow(p, '#9CA3AF')));
  }

  tbody.innerHTML = rows.join('');
  document.getElementById('modal-finalizados').classList.remove('hidden');
}

function closeFinalizadosModal() {
  document.getElementById('modal-finalizados')?.classList.add('hidden');
}

// -----------------------------
// Propaga valor pago para dívida vinculada
// Recalcula do zero somando todos os pagamentos Pago/Cartão/Transferido
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
    .in('status', ['Pago', 'Transferido', 'Cartão']);

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


async function saveStatus(select) {
  const id = select.dataset.pagamentoId;
  const newStatus = select.value;
  const pag = cachedPagamentos.find((p) => p.id === id);
  if (!pag || pag.status === newStatus) return;

  if (newStatus === 'Transferido') {
    select.value = pag.status; // revert enquanto processa
    await createTransferPairAndUpdateStatus(pag, select);
    return;
  }

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
  STATUS_OPTIONS.forEach((s) => select.classList.remove(s.cls));
  const cur = STATUS_OPTIONS.find((s) => s.value === newStatus);
  if (cur) select.classList.add(cur.cls);
  renderPagamentos();

  const dividaId = pag.subcategorias?.divida_id;
  if (dividaId) propagateDivida(dividaId);

  syncWithFeedback(pag, pag.subcategorias);
}

// -----------------------------
// Transferência automática — usa contas já definidas no compromisso
// -----------------------------
async function createTransferPairAndUpdateStatus(pag, select) {
  const contaOrigemId  = pag.subcategorias?.conta_id;
  const contaDestinoId = pag.subcategorias?.conta_destino_id;

  if (!contaOrigemId || !contaDestinoId) {
    showToast(
      'Configure as contas de origem e destino no compromisso antes de marcar como Transferido.',
      'warning', 7000
    );
    return;
  }

  select.disabled = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const valor    = Number(pag.valor_real ?? pag.valor_previsto ?? 0);
    const moeda    = pag.moeda || 'BRL';
    const data     = pag.data_vencimento || new Date().toISOString().slice(0, 10);
    const descricao = `Transferência — ${displayName(pag)}`;

    // Desvincula transação de sync anterior (se houver)
    const existing = await findTransacaoLinkedToPagamento(pag.id);
    if (existing) {
      await supabase.from('transacoes').update({ pagamento_id: null }).eq('id', existing.id);
    }

    // Insere saída
    const { data: saida, error: saidaErr } = await supabase.from('transacoes').insert({
      data, tipo: 'Transferência', user_id: user.id,
      conta_id: contaOrigemId, valor, moeda, descricao,
      conta_destino_id: contaDestinoId,
      pagamento_id: pag.id,
    }).select().single();
    if (saidaErr) throw saidaErr;

    // Insere entrada
    const { data: entrada, error: entradaErr } = await supabase.from('transacoes').insert({
      data, tipo: 'Transferência', user_id: user.id,
      conta_id: contaDestinoId, valor, moeda, descricao,
      transferencia_par_id: saida.id,
    }).select().single();
    if (entradaErr) {
      await supabase.from('transacoes').delete().eq('id', saida.id);
      throw entradaErr;
    }

    // Liga saída ↔ entrada
    await supabase.from('transacoes').update({ transferencia_par_id: entrada.id }).eq('id', saida.id);

    // Atualiza pagamento
    const { error: pagErr } = await supabase
      .from('pagamentos').update({ status: 'Transferido' }).eq('id', pag.id);
    if (pagErr) throw pagErr;

    pag.status = 'Transferido';
    renderPagamentos();
    const dividaId = pag.subcategorias?.divida_id;
    if (dividaId) propagateDivida(dividaId);
    showToast('Transferência registrada · transações criadas em Transações', 'success', 5000);
  } catch (err) {
    console.error('[createTransferPairAndUpdateStatus]', err);
    showToast('Erro ao registrar transferência: ' + (err.message || err), 'error', 8000);
  } finally {
    select.disabled = false;
  }
}

async function saveValorReal(input) {
  const id = input.dataset.pagamentoId;
  const raw = input.value.trim();
  const pag = cachedPagamentos.find((p) => p.id === id);
  if (!pag) return;

  // Empty = unset (null)
  let newValueOrig = null;
  if (raw !== '') {
    const newValueBRL = parseUserNumber(raw);
    if (isNaN(newValueBRL) || newValueBRL < 0) {
      showToast(t('pagamentos.validacao.valor_invalido', 'Valor inválido'), 'error');
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

}

// -----------------------------
// Wrapper de sync com toast em erro/sucesso
// Torna visível qualquer falha (ex: migration 0022 não rodada)
// -----------------------------
function syncWithFeedback(pagamento, subcategoria) {
  syncPagamentoToTransacao(pagamento, subcategoria)
    .then((result) => {
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
        showToast('Transação desvinculada (status voltou para pendente)', 'info', 3000);
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
function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function displayName(p) {
  const sub = p.subcategorias;
  return sub?.apelido?.trim() || sub?.nome || '—';
}

