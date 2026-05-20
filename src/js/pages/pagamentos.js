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
import { formatCurrency, formatCurrencyHTML, MOEDAS } from '../lib/compromissos-config.js';
import { fetchExchangeRate } from '../lib/currency.js';
import { initCurrencyWidget } from '../components/currency-widget.js';
import { findBank, logoUrl } from '../lib/banks.js';
import { syncPagamentoToTransacao, isPaidStatus, findTransacaoLinkedToPagamento } from '../lib/transacao-pagamento-sync.js';
import { showDateConfirmPopover } from '../components/date-confirm-popover.js';
import { escapeHtml, formatDateBR, isoMonth, parseUserNumber, showConfirm } from '../lib/utils.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';

// -----------------------------
// State
// -----------------------------
const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();

let cachedSubcategorias = []; // pra computar bloco_quinzenal e ocorrências
let cachedCategorias = [];    // pra ordenação dos blocos
let cachedContas = [];        // pra display de banco
let cachedPagamentos = [];    // entries do mês/período visível com subcategoria + categoria aninhadas
let cachedAlocacoes = [];     // alocações do Caixa Livre do mês visível
let detailsPagamento = null;  // pagamento exibido no modal de detalhes
let filterStatus = 'todos';   // 'todos' | 'pendentes' | 'atrasados' | 'pagos' | 'cancelados'
let viewMode = 'blocos';      // 'blocos' | 'proximos'
let flatFrom = '';            // YYYY-MM-DD
let flatTo   = '';            // YYYY-MM-DD


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
  bindAlocacaoEvents();
  await loadCategorias();
  await loadSubcategorias();
  await loadContas();
  await loadMonth();
  renderConciliacaoKpi(); // fire-and-forget
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

/**
 * KPI compacto de conciliação bancária no header de /pagamentos.
 * Calcula saldo total das contas (calculado FinFlow vs banco) e mostra a diferença.
 * Estilo similar ao Xero.
 */
async function renderConciliacaoKpi() {
  const container = document.getElementById('pag-conciliacao-kpi');
  if (!container || cachedContas.length === 0) return;

  const activeContaIds = cachedContas.map((c) => c.id);
  if (!activeContaIds.length) return;

  // Carrega snapshots de saldo (do OFX) em paralelo com transações pra calcular saldo do FinFlow
  const { loadLatestSnapshots } = await import('../lib/saldos-bancarios.js');
  const [snapshots, { data: trData }] = await Promise.all([
    loadLatestSnapshots(activeContaIds),
    supabase
      .from('transacoes')
      .select('conta_id, tipo, valor, conta_destino_id, transferencia_par_id, reconciliacao_status')
      .in('conta_id', activeContaIds)
      .neq('reconciliacao_status', 'importado'),
  ]);

  // Saldo calculado por conta (mesma lógica de /contas)
  const saldosCalculados = new Map(activeContaIds.map((id) => [id, 0]));
  for (const tr of (trData || [])) {
    const cur = saldosCalculados.get(tr.conta_id) ?? 0;
    const isEntrada = tr.tipo === 'Receita'
      || (tr.tipo === 'Transferência' && tr.transferencia_par_id && !tr.conta_destino_id);
    const isSaida = tr.tipo === 'Despesa'
      || (tr.tipo === 'Transferência' && !!tr.conta_destino_id);
    if (isEntrada) saldosCalculados.set(tr.conta_id, cur + Number(tr.valor || 0));
    else if (isSaida) saldosCalculados.set(tr.conta_id, cur - Number(tr.valor || 0));
  }

  let totalCalculado = 0;
  let totalBanco = 0;
  let contasComSnapshot = 0;
  let maxData = null;
  for (const c of cachedContas) {
    totalCalculado += saldosCalculados.get(c.id) ?? 0;
    const snap = snapshots.get(c.id);
    if (snap) {
      totalBanco += Number(snap.saldo);
      contasComSnapshot++;
      if (!maxData || snap.data > maxData) maxData = snap.data;
    }
  }
  const diff = totalCalculado - totalBanco;
  const bate = Math.abs(diff) < 0.005;
  const semSnapshots = contasComSnapshot === 0;

  let diffHtml;
  if (semSnapshots) {
    diffHtml = `<span class="conciliacao-kpi-sub">Nenhuma conciliação ainda — importe um extrato pra começar</span>`;
  } else {
    const diffSign = diff < 0 ? '-' : (diff > 0 ? '+' : '');
    const dataLabel = maxData ? (() => { const [yy, mm, dd] = maxData.split('-'); return `${dd}/${mm}/${yy.slice(2)}`; })() : '—';
    diffHtml = `
      <span class="conciliacao-kpi-sub">${contasComSnapshot} de ${cachedContas.length} contas · última: ${dataLabel}</span>
      <span class="conciliacao-kpi-diff ${bate ? 'is-ok' : 'is-diff'}">${bate ? '✓ Tudo bate' : `Diferença: ${diffSign}${formatCurrency(Math.abs(diff), 'BRL')}`}</span>
    `;
  }
  container.innerHTML = `
    <div class="conciliacao-kpi">
      <span class="conciliacao-kpi-icon">🏦</span>
      <div class="conciliacao-kpi-body">
        <div class="conciliacao-kpi-title">Saldo total nas contas: ${formatCurrency(totalCalculado, 'BRL')}</div>
        ${diffHtml}
      </div>
    </div>
  `;
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
    if (viewMode === 'proximos') renderFlat();
    else renderPagamentos();
  });

  // Toggle Blocos / Próximos
  document.getElementById('pag-view-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn || btn.dataset.pagView === viewMode) return;
    viewMode = btn.dataset.pagView;
    document.querySelectorAll('#pag-view-seg .view-toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.pagView === viewMode));
    const isProximos = viewMode === 'proximos';
    document.getElementById('pag-monthnav').classList.toggle('hidden', isProximos);
    document.getElementById('pag-flat-bar').classList.toggle('hidden', !isProximos);
    if (isProximos) {
      if (!flatFrom) initFlatDates();
      loadFlat();
    } else {
      loadMonth();
    }
  });

  // Buscar no modo Próximos
  document.getElementById('btn-pag-flat-buscar').addEventListener('click', () => {
    flatFrom = document.getElementById('pag-flat-from').value;
    flatTo   = document.getElementById('pag-flat-to').value;
    if (!flatFrom || !flatTo) { showToast('Informe as duas datas', 'error'); return; }
    if (flatFrom > flatTo)    { showToast('A data inicial deve ser anterior à final', 'error'); return; }
    loadFlat();
  });
}

function initFlatDates() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  flatFrom = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const d2 = new Date(d);
  d2.setDate(d2.getDate() + 90);
  flatTo = `${d2.getFullYear()}-${pad(d2.getMonth() + 1)}-${pad(d2.getDate())}`;
  document.getElementById('pag-flat-from').value = flatFrom;
  document.getElementById('pag-flat-to').value   = flatTo;
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

  // 4. Busca transações vinculadas pra detectar pagamentos travados (vinculados ao banco)
  await attachLinkedTransacoes(cachedPagamentos);

  // 5. Busca cotações pra moedas em uso
  await refreshRates();

  // 6. Carrega alocações do Caixa Livre do mês + auto-carry-forward entre blocos
  const { loadAlocacoesMes } = await import('../lib/caixa-livre.js');
  cachedAlocacoes = await loadAlocacoesMes(mesAno);
  await ensureCarryForward(mesAno);

  renderPagamentos();
}

/**
 * Garante que existe um registro de carry-forward (rollover) no bloco N+1
 * para cada bloco N que tem sobra positiva. Idempotente — não duplica.
 * Roda apenas pra blocos JÁ ENCERRADOS (com data final < hoje).
 */
async function ensureCarryForward(mesAno) {
  const blocos = getBlocosForMonth(viewYear, viewMonth);
  if (blocos.length <= 1) return;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const { criarAlocacao, loadAlocacoesMes } = await import('../lib/caixa-livre.js');
  let touched = false;

  for (let i = 0; i < blocos.length - 1; i++) {
    const bloco = blocos[i];
    if (bloco.endDate >= hoje) continue; // bloco ainda não fechou

    const proximoBloco = blocos[i + 1];
    const proxIndice = proximoBloco.indice;
    // Já existe rollover no próximo bloco vindo desse?
    const jaExiste = cachedAlocacoes.some(
      (a) => a.bloco_indice === proxIndice && a.destino_tipo === 'rollover' && a.status !== 'cancelada'
    );
    if (jaExiste) continue;

    const sobra = calcularDisponivelDoBloco(bloco.indice);
    if (sobra <= 0.005) continue;

    await criarAlocacao({
      mes_ano: mesAno,
      bloco_indice: proxIndice,
      destino_tipo: 'rollover',
      valor: sobra,
      descricao: `Saldo trazido do Bloco ${bloco.indice}`,
    });
    touched = true;
  }

  if (touched) cachedAlocacoes = await loadAlocacoesMes(mesAno);
}

/**
 * Anexa em cada pagamento o atributo `_linkedTr` com info da transação vinculada
 * (se houver). Usado pra renderizar o badge "Vinculado" e bloquear mudanças
 * de status quando a transação veio de extrato bancário.
 */
async function attachLinkedTransacoes(pagamentos) {
  if (!pagamentos || pagamentos.length === 0) return;
  const pagIds = pagamentos.map((p) => p.id);
  const { data, error } = await supabase
    .from('transacoes')
    .select('id, pagamento_id, reconciliacao_status, confirmado_automaticamente')
    .in('pagamento_id', pagIds);
  if (error || !data) {
    for (const p of pagamentos) p._linkedTr = null;
    return;
  }
  const byPag = new Map();
  for (const t of data) byPag.set(t.pagamento_id, t);
  for (const p of pagamentos) p._linkedTr = byPag.get(p.id) || null;
}

/** true quando o pagamento está travado por estar vinculado a transação de extrato */
function isPagamentoLocked(p) {
  const tr = p._linkedTr;
  if (!tr) return false;
  return tr.reconciliacao_status === 'importado' || tr.reconciliacao_status === 'reconciliado';
}

// -----------------------------
// Caixa Livre — ícones SVG dos destinos
// -----------------------------
function destinoIconSvg(tipo) {
  const SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"';
  const icons = {
    investimento: `<svg ${SVG_ATTRS}><path d="M12 22V11"/><path d="M7 11s-2-5 2-7 5 1 5 3-5 5-5 5"/><path d="M17 11s2-5-2-7-5 1-5 3 5 5 5 5"/></svg>`,
    divida: `<svg ${SVG_ATTRS}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 11 11 13 15 9"/></svg>`,
    caixinha: `<svg ${SVG_ATTRS}><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.5.5 2.7 1.4 3.7L5 18h3l1-1.5c.9.3 1.9.5 3 .5s2.1-.2 3-.5L16 18h3l-1.4-2.3c.7-.6 1.2-1.4 1.4-2.2 1 0 2-1 2-2v-2c0-1-1-2-2-2 0-1-1-2.5-1-2.5z"/><circle cx="16" cy="10" r="0.6" fill="currentColor"/><path d="M2 11v1c0 1 1 2 2 2"/></svg>`,
    rollover: `<svg ${SVG_ATTRS}><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`,
    avulsa: `<svg ${SVG_ATTRS}><rect width="14" height="9" x="5" y="8" rx="1"/><circle cx="12" cy="12.5" r="1.5"/><path d="M5 11c-2-1-3-3-3-4"/><path d="M19 11c2-1 3-3 3-4"/></svg>`,
  };
  return icons[tipo] || '';
}

// -----------------------------
// Caixa Livre — modal de alocação + ações
// -----------------------------
let alocBlocoIndice = null;
let alocDisponivel = 0;

function calcularDisponivelDoBloco(blocoIndice) {
  // Reproduz a fórmula do renderBloco: saldoBloco + carry - alocações != rollover
  const items = cachedPagamentos.filter((p) => p.bloco_quinzenal === blocoIndice && p.status !== 'Cancelado');
  let saldoBRL = 0;
  for (const p of items) {
    const tipo = p.subcategorias?.tipo;
    const v = Number(p.valor_real ?? p.valor_previsto) || 0;
    const vBRL = convertToBRL(v, p.moeda);
    if (vBRL === null) continue;
    saldoBRL += (tipo === 'Receita' ? vBRL : -vBRL);
  }
  const blocoAlocacoes = cachedAlocacoes.filter((a) => a.bloco_indice === blocoIndice && a.status !== 'cancelada');
  const carry = blocoAlocacoes.filter((a) => a.destino_tipo === 'rollover').reduce((s, a) => s + Number(a.valor || 0), 0);
  const alocado = blocoAlocacoes.filter((a) => a.destino_tipo !== 'rollover').reduce((s, a) => s + Number(a.valor || 0), 0);
  return saldoBRL + carry - alocado;
}

function buildAlocDestinoOptions(destinoTipo) {
  const sel = document.getElementById('aloc-destino-id');
  const wrap = document.getElementById('aloc-sub-wrap');
  if (!sel || !wrap) return;
  if (destinoTipo === 'rollover' || destinoTipo === 'avulsa') {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  let subs = cachedSubcategorias.filter((s) => s.status === 'ativa');
  if (destinoTipo === 'investimento') {
    subs = subs.filter((s) => s.tipo === 'Despesa' && s.eh_investimento === true);
    if (subs.length === 0) subs = cachedSubcategorias.filter((s) => s.status === 'ativa' && s.tipo === 'Despesa');
  } else if (destinoTipo === 'divida') {
    subs = subs.filter((s) => s.divida_id);
  } else if (destinoTipo === 'caixinha') {
    subs = subs.filter((s) => s.tipo === 'Caixinha');
  }
  sel.innerHTML = subs.length === 0
    ? '<option value="">— Nenhuma subcategoria disponível —</option>'
    : subs.map((s) => `<option value="${s.id}">${escapeHtml(s.apelido || s.nome)}</option>`).join('');
}

function openAlocacaoModal(blocoIndice) {
  alocBlocoIndice = blocoIndice;
  alocDisponivel = calcularDisponivelDoBloco(blocoIndice);
  document.getElementById('aloc-bloco-indice').value = String(blocoIndice);
  document.getElementById('aloc-valor').value = '';
  document.getElementById('aloc-descricao').value = '';
  document.getElementById('aloc-disponivel').textContent = formatCurrency(alocDisponivel, 'BRL');
  // Reset toggle
  document.querySelectorAll('#aloc-destino-toggle .aloc-destino-card').forEach((b) => {
    const on = b.dataset.destino === 'investimento';
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });
  document.getElementById('aloc-destino-tipo').value = 'investimento';
  buildAlocDestinoOptions('investimento');
  openModal('modal-alocacao');
}

function bindAlocacaoEvents() {
  const form = document.getElementById('form-alocacao');
  if (!form || form._bound) return;
  form._bound = true;

  document.getElementById('aloc-destino-toggle')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.aloc-destino-card');
    if (!btn) return;
    document.querySelectorAll('#aloc-destino-toggle .aloc-destino-card').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
    const tipo = btn.dataset.destino;
    document.getElementById('aloc-destino-tipo').value = tipo;
    buildAlocDestinoOptions(tipo);
  });

  document.getElementById('btn-aloc-usar-tudo')?.addEventListener('click', () => {
    if (alocDisponivel > 0) {
      document.getElementById('aloc-valor').value = alocDisponivel.toFixed(2).replace('.', ',');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const destinoTipo = document.getElementById('aloc-destino-tipo').value;
    const destinoId   = document.getElementById('aloc-destino-id')?.value || null;
    const valorRaw    = document.getElementById('aloc-valor').value;
    const descricao   = document.getElementById('aloc-descricao').value.trim() || null;
    const valor       = parseUserNumber(valorRaw);
    if (!valor || valor <= 0) { showToast('Informe um valor válido', 'error'); return; }
    if ((destinoTipo === 'investimento' || destinoTipo === 'divida' || destinoTipo === 'caixinha') && !destinoId) {
      showToast('Selecione um destino', 'error'); return;
    }

    const mesAno = isoMonth(viewYear, viewMonth);
    const { criarAlocacao } = await import('../lib/caixa-livre.js');
    const result = await criarAlocacao({
      mes_ano: mesAno,
      bloco_indice: alocBlocoIndice,
      destino_tipo: destinoTipo,
      destino_id: (destinoTipo === 'rollover' || destinoTipo === 'avulsa') ? null : destinoId,
      valor,
      descricao,
    });
    if (!result.ok) {
      showToast('Erro ao criar alocação: ' + result.error, 'error', 8000);
      return;
    }
    closeModal('modal-alocacao');
    showToast('Alocação criada', 'success');
    // Recarrega alocações
    const { loadAlocacoesMes } = await import('../lib/caixa-livre.js');
    cachedAlocacoes = await loadAlocacoesMes(mesAno);
    renderPagamentos();
  });
}

async function deletarAlocacaoFlow(id) {
  const ok = await showConfirm('Remover essa alocação?', { okLabel: 'Remover', danger: true });
  if (!ok) return;
  const { deletarAlocacao, loadAlocacoesMes } = await import('../lib/caixa-livre.js');
  const result = await deletarAlocacao(id);
  if (!result.ok) {
    showToast('Erro: ' + result.error, 'error', 6000);
    return;
  }
  const mesAno = isoMonth(viewYear, viewMonth);
  cachedAlocacoes = await loadAlocacoesMes(mesAno);
  renderPagamentos();
  showToast('Alocação removida', 'success');
}

// -----------------------------
// Modo Próximos — tabela flat por intervalo de datas
// -----------------------------
async function loadFlat() {
  const container = document.getElementById('pagamentos-container');
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span>Carregando…</div>';
  document.getElementById('empty-state').classList.add('hidden');

  const dFrom = new Date(flatFrom + 'T00:00:00');
  const dTo   = new Date(flatTo   + 'T00:00:00');
  if (isNaN(dFrom) || isNaN(dTo) || dFrom > dTo) {
    container.innerHTML = '';
    showToast('Período inválido', 'error');
    return;
  }

  // Não chama ensure* aqui — são lentas (até 12 queries sequenciais).
  // Pagamentos já existem para meses visitados. Meses futuros não visitados
  // ficam vazios; o usuário pode acessá-los no modo Blocos pra gerá-los.
  const { data, error } = await supabase
    .from('pagamentos')
    .select('*, subcategorias(*, categorias(*))')
    .gte('data_vencimento', flatFrom)
    .lte('data_vencimento', flatTo)
    .order('data_vencimento');

  if (error) {
    console.error('[loadFlat]', error);
    container.innerHTML = '';
    showToast('Erro: ' + error.message, 'error', 8000);
    return;
  }

  cachedPagamentos = (data || []).filter((p) => p.subcategorias?.status === 'ativa');
  await attachLinkedTransacoes(cachedPagamentos);
  await refreshRates();
  renderFlat();
}

function renderFlat() {
  const container = document.getElementById('pagamentos-container');
  const emptyState = document.getElementById('empty-state');

  const counts = { todos: 0, pendentes: 0, atrasados: 0, pagos: 0, cancelados: 0 };
  cachedPagamentos.forEach((p) => { counts.todos++; counts[getStatusGroup(p)]++; });
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.querySelector(`[data-count="${k}"]`);
    if (el) el.textContent = v;
  });

  const filtered = cachedPagamentos.filter(passesFilter);

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  // Agrupa por data de vencimento
  const byDate = new Map();
  for (const p of filtered) {
    const d = p.data_vencimento || '';
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(p);
  }

  const COL_SPAN = 7;
  const rowsHtml = [];
  for (const [date, items] of byDate) {
    const dateLabel = date ? formatDateBR(date) : 'Sem data';
    rowsHtml.push(`<tr class="pag-flat-date-header"><td colspan="${COL_SPAN}">${dateLabel}</td></tr>`);
    for (const p of items) {
      const cat = p.subcategorias?.categorias;
      rowsHtml.push(renderPagamentoRow(p, cat?.cor || '#9CA3AF'));
    }
  }

  container.innerHTML = `
    <div class="pagamento-bloco-scroll">
      <table class="pagamento-bloco-table">
        <colgroup>
          <col><col style="width:150px;"><col style="width:100px;">
          <col style="width:45px;"><col style="width:72px;">
          <col style="width:130px;"><col style="width:120px;">
        </colgroup>
        <thead>
          <tr>
            <th>Compromisso</th>
            <th class="pag-conta-header">Conta Pgto</th>
            <th>Tipo</th>
            <th class="text-center">Vto</th>
            <th class="text-center">Dias</th>
            <th class="text-right">Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rowsHtml.join('')}</tbody>
      </table>
    </div>`;
  bindEdits();
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
  const blocos = getBlocosForMonth(year, month);

  // Coleta todos os mes_ano cobertos pelos blocos do mês (alguns blocos atravessam
  // do mês anterior ou pra o próximo). Buscar orcamento_geral pra todos esses meses
  // garante que ocorrências como 01/06 — que cai no "Bloco 3 de Maio" (29 mai – 11 jun) —
  // achem o orcamento da sub em junho mesmo quando processando os blocos de maio.
  const mesesCobertos = new Set([mesAno]);
  for (const b of blocos) {
    mesesCobertos.add(isoMonth(b.startDate.getFullYear(), b.startDate.getMonth()));
    mesesCobertos.add(isoMonth(b.endDate.getFullYear(), b.endDate.getMonth()));
  }

  const { data: orcamentos, error } = await supabase
    .from('orcamento_geral')
    .select('id, subcategoria_id, valor_previsto, moeda, mes_ano')
    .in('mes_ano', Array.from(mesesCobertos));
  if (error || !orcamentos) return;

  // Mapa: `${subId}__${mesAno}` → orcamento (lookup por sub + mês civil da data de vencimento)
  const orcMap = new Map();
  for (const o of orcamentos) orcMap.set(`${o.subcategoria_id}__${o.mes_ano}`, o);

  // Pra cada sub ativa, itera pelos blocos do mês e gera pagamento pra cada ocorrência.
  // O orcamento usado é o do mês civil da data de vencimento (que pode ser diferente do mês visível).
  const rows = [];
  for (const sub of cachedSubcategorias) {
    if (sub.status !== 'ativa') continue;

    for (const bloco of blocos) {
      let cur = new Date(bloco.startDate);
      while (cur <= bloco.endDate) {
        if (occursOn(sub, cur)) {
          const venMesAno = isoMonth(cur.getFullYear(), cur.getMonth());
          const orc = orcMap.get(`${sub.id}__${venMesAno}`);
          if (orc && Number(orc.valor_previsto) > 0) {
            const occInVenMes = countOccurrencesInMonth(sub, cur.getFullYear(), cur.getMonth()) || 1;
            const valorPorOcorrencia = Number(orc.valor_previsto) / occInVenMes;
            rows.push({
              user_id: user.id,
              orcamento_id: orc.id,
              subcategoria_id: sub.id,
              mes_ano: mesAno,
              bloco_quinzenal: bloco.indice,
              valor_previsto: valorPorOcorrencia,
              valor_real: valorPorOcorrencia,
              moeda: orc.moeda,
              status: (sub.tipo === 'Transferência' || sub.tipo === 'Caixinha') ? 'A Transferir' : 'Agendado',
              data_vencimento: isoDate(cur.getFullYear(), cur.getMonth(), cur.getDate()),
            });
          }
        }
        cur = addDays(cur, 1);
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

  // Para compromissos de dívida: sincroniza valor_previsto/valor_real de entradas pendentes.
  // Usa sub.valor_base quando disponível (mais confiável que orcamento_geral para empréstimos
  // com parcelas iguais) e orcamento_geral para taxa variável.
  // Necessário porque o upsert acima usa ignoreDuplicates:true e não atualiza linhas existentes.
  const PENDENTE = ['Agendado', 'A Transferir'];
  const user2 = user; // user já obtido acima
  for (const sub of cachedSubcategorias) {
    if (!sub.divida_id) continue;

    let valorSinc;
    if (!sub.valor_variavel && Number(sub.valor_base) > 0) {
      // Parcelas iguais: usa valor_base direto da subcategoria (sempre atualizado ao salvar a dívida)
      const occThisMonth = countOccurrencesInMonth(sub, year, month) || 1;
      valorSinc = Number((Number(sub.valor_base) / occThisMonth).toFixed(2));
    } else {
      // Taxa variável: usa orcamento_geral que é regenerado por parcela ao salvar a dívida
      // (Filtra pelo mês visível porque agora 'orcamentos' inclui meses adjacentes pra cobrir blocos atravessados.)
      const orc = orcamentos.find((o) => o.subcategoria_id === sub.id && o.mes_ano === mesAno);
      if (!orc || Number(orc.valor_previsto) <= 0) continue;
      const occThisMonth = countOccurrencesInMonth(sub, year, month) || 1;
      valorSinc = Number((Number(orc.valor_previsto) / occThisMonth).toFixed(2));
    }

    if (!valorSinc || valorSinc <= 0) continue;
    await supabase
      .from('pagamentos')
      .update({ valor_previsto: valorSinc, valor_real: valorSinc })
      .eq('subcategoria_id', sub.id)
      .eq('mes_ano', mesAno)
      .eq('user_id', user2.id)
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

  // (alertCls do saldo bruto não é mais usado — agora usamos caixaLivreAlert calculado abaixo)

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
              <th>Tipo</th>
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
  // (Saídas realizadas | Caixa Livre | Saídas restantes)
  // Caixa Livre = saldo bruto + carry-forward - alocações já feitas
  const blocoAlocacoes = cachedAlocacoes.filter((a) => a.bloco_indice === num);
  const carry = blocoAlocacoes
    .filter((a) => a.destino_tipo === 'rollover' && a.status !== 'cancelada')
    .reduce((s, a) => s + Number(a.valor || 0), 0);
  const alocado = blocoAlocacoes
    .filter((a) => a.destino_tipo !== 'rollover' && a.status !== 'cancelada')
    .reduce((s, a) => s + Number(a.valor || 0), 0);
  const caixaLivre = saldoBRL + carry - alocado;
  const oportClass = caixaLivre > 0 ? 'dre-positive' : (caixaLivre < 0 ? 'dre-negative' : 'dre-zero');
  const caixaLivreAlert = caixaLivre <= 0 ? 'alerta-negativo' : '';

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
          <button type="button" class="pagamento-bloco-stat-center pagamento-bloco-stat-center--clickable" data-bloco-caixa="${num}" aria-expanded="false" title="Clique pra ver e alocar o Caixa Livre">
            <span class="pagamento-bloco-stat-label caixa-livre-label">
              <span class="caixa-livre-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                  <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1"/>
                  <path d="M16 12h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a2 2 0 0 1 0-4Z"/>
                  <circle cx="17.5" cy="14" r="0.5" fill="currentColor"/>
                </svg>
              </span>
              Caixa Livre
              <span class="caixa-chevron-wrap" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            </span>
            <span class="pagamento-bloco-stat-value-big ${oportClass} ${caixaLivreAlert}">${formatCurrencyHTML(caixaLivre, 'BRL')}</span>
          </button>
          <div class="pagamento-bloco-stat pagamento-bloco-stat-right">
            <span class="pagamento-bloco-stat-label">Saídas restantes</span>
            <span class="pagamento-bloco-stat-value">${formatCurrencyHTML(despesaRestanteBRL, 'BRL')}</span>
          </div>
        </div>
        ${renderCaixaLivrePainel(num, saldoBRL, carry, blocoAlocacoes, caixaLivre)}
      </header>
      ${body}
    </div>
  `;
}

/**
 * Painel expansível com detalhamento e alocações do Caixa Livre do bloco.
 * Fica oculto por default; mostra quando usuário clica no stat "Caixa Livre".
 */
function renderCaixaLivrePainel(blocoIndice, saldoBruto, carry, alocacoes, livre) {
  const semAlocacoes = alocacoes.filter((a) => a.destino_tipo !== 'rollover' && a.status !== 'cancelada');
  const LABELS = { investimento: 'Investimento', divida: 'Dívida', caixinha: 'Caixinha', rollover: 'Rollover', avulsa: 'Avulsa' };

  const alocacoesHtml = semAlocacoes.length === 0
    ? `<div class="caixa-livre-empty">Nenhuma alocação ainda. Clique em "+ Nova alocação" pra distribuir o caixa livre.</div>`
    : semAlocacoes.map((a) => {
        const subOuDivida = a.destino_id
          ? (cachedSubcategorias.find((s) => s.id === a.destino_id)?.apelido
            || cachedSubcategorias.find((s) => s.id === a.destino_id)?.nome
            || a.descricao
            || '—')
          : (a.descricao || LABELS[a.destino_tipo]);
        return `
          <div class="caixa-livre-alocacao-row" data-destino="${a.destino_tipo}">
            <span class="caixa-livre-alocacao-info">
              <span class="caixa-livre-alocacao-icon">${destinoIconSvg(a.destino_tipo)}</span>
              <span class="caixa-livre-alocacao-label">${escapeHtml(subOuDivida)}</span>
              <span class="caixa-livre-alocacao-tipo">${LABELS[a.destino_tipo]}</span>
            </span>
            <span class="caixa-livre-alocacao-valor">${formatCurrencyHTML(Number(a.valor), a.moeda || 'BRL')}</span>
            <button type="button" class="caixa-livre-alocacao-del" data-aloc-del="${a.id}" title="Remover alocação" aria-label="Remover">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>`;
      }).join('');

  const totalAlocado = semAlocacoes.reduce((s, a) => s + Number(a.valor || 0), 0);
  const carryHtml = carry > 0
    ? `<div class="caixa-livre-row caixa-livre-row--carry"><span class="caixa-livre-carry-label">${destinoIconSvg('rollover')} Saldo trazido do bloco anterior</span><span>${formatCurrencyHTML(carry, 'BRL')}</span></div>`
    : '';

  return `
    <div class="caixa-livre-painel hidden" data-painel-bloco="${blocoIndice}">
      <div class="caixa-livre-breakdown">
        ${carryHtml}
        <div class="caixa-livre-row"><span>Saldo bruto do bloco (Receitas − Despesas)</span><span>${formatCurrencyHTML(saldoBruto, 'BRL')}</span></div>
        <div class="caixa-livre-row caixa-livre-row--total"><span>Caixa Livre bruto</span><span>${formatCurrencyHTML(saldoBruto + carry, 'BRL')}</span></div>
      </div>
      <div class="caixa-livre-alocacoes">
        <div class="caixa-livre-alocacoes-header">
          <span>Alocações</span>
          <button type="button" class="btn btn-primary btn-sm" data-aloc-add="${blocoIndice}">+ Nova alocação</button>
        </div>
        ${alocacoesHtml}
        <div class="caixa-livre-row caixa-livre-row--total">
          <span>Sobra (vai pro próximo bloco)</span>
          <span class="${livre >= 0 ? 'dre-positive' : 'dre-negative'}">${formatCurrencyHTML(livre, 'BRL')}</span>
        </div>
        ${semAlocacoes.length === 0 ? '' : `
          <p class="caixa-livre-resumo-line">Total alocado: <strong>${formatCurrencyHTML(totalAlocado, 'BRL')}</strong></p>
        `}
      </div>
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

  // Vencimento dia + delta (se houver data_pagamento divergente)
  const vto = p.data_vencimento ? p.data_vencimento.slice(8, 10) : '—';
  let vtoDeltaHtml = '';
  if (p.data_pagamento && p.data_vencimento && p.data_pagamento !== p.data_vencimento) {
    const dV = new Date(p.data_vencimento + 'T00:00:00');
    const dP = new Date(p.data_pagamento + 'T00:00:00');
    const delta = Math.round((dP - dV) / 86400000);
    if (delta > 0) {
      vtoDeltaHtml = `<span class="pag-vto-delta pag-vto-delta--late" title="Pago ${delta}d após o vencimento">+${delta}d</span>`;
    } else if (delta < 0) {
      vtoDeltaHtml = `<span class="pag-vto-delta pag-vto-delta--early" title="Pago ${Math.abs(delta)}d antes do vencimento">${delta}d</span>`;
    }
  }

  // Pagamento travado por vínculo com transação do banco?
  const locked = isPagamentoLocked(p);

  // Status select — filtra deprecated (Cartão) exceto se o pagamento já tem esse status
  const statusOptions = STATUS_OPTIONS
    .filter((s) => !DEPRECATED_STATUSES.has(s.value) || s.value === p.status)
    .map((s) => `<option value="${s.value}" ${p.status === s.value ? 'selected' : ''}>${s.label}</option>`)
    .join('');
  const currentStatus = STATUS_OPTIONS.find((s) => s.value === p.status) || STATUS_OPTIONS[0];

  // Quando travado, renderiza badge "Vinculado" no lugar do select
  const statusCellHtml = locked
    ? `<span class="pagamento-status-locked" title="Vinculado a uma transação do banco. Desvincule pela página de Transações pra mudar o status.">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Vinculado
      </span>`
    : `<select class="pagamento-status-select ${currentStatus.cls}" data-pagamento-id="${p.id}">
        ${statusOptions}
      </select>`;

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
    tipoBadgeHtml = `<span class="pag-destino-badge destino-caixinha">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.6.5 2.8 1.5 3.8L4 18h3l1-1.7c1 .4 2 .7 3 .7s2-.3 3-.7L15 18h3l-1.5-2.2c.7-.7 1.2-1.5 1.5-2.3 1 0 2-1 2-2v-2c0-1-1-2-2-2 0-1-1-2.5-1-2.5z"/><circle cx="16" cy="10" r="0.5" fill="currentColor"/><path d="M2 11v1c0 1 1 2 2 2"/></svg>
      Caixinha
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
      <td class="tabular text-center" style="font-size: var(--fs-xs); color: var(--color-text-secondary);">${vto}${vtoDeltaHtml}</td>
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
            ${locked ? 'readonly' : ''}
          />
        </span>
      </td>
      <td>${statusCellHtml}</td>
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

    // Toggle do painel Caixa Livre
    const caixaBtn = e.target.closest('[data-bloco-caixa]');
    if (caixaBtn) {
      const blocoNum = caixaBtn.dataset.blocoCaixa;
      const painel = container.querySelector(`[data-painel-bloco="${blocoNum}"]`);
      if (painel) {
        const isHidden = painel.classList.toggle('hidden');
        caixaBtn.setAttribute('aria-expanded', String(!isHidden));
      }
      return;
    }

    // Adicionar alocação
    const addBtn = e.target.closest('[data-aloc-add]');
    if (addBtn) {
      openAlocacaoModal(Number(addBtn.dataset.alocAdd));
      return;
    }

    // Deletar alocação
    const delBtn = e.target.closest('[data-aloc-del]');
    if (delBtn) {
      deletarAlocacaoFlow(delBtn.dataset.alocDel);
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

  // Bloqueia mudanças quando o pagamento está vinculado a transação do banco.
  // (Em tese o dropdown nem deveria estar visível, mas é defesa em profundidade.)
  if (isPagamentoLocked(pag)) {
    select.value = pag.status;
    showToast('Esse pagamento está vinculado a uma transação do banco. Desvincule pela página de Transações antes de mudar o status.', 'warning', 8000);
    return;
  }

  // Status virou pago/transferido → confirma data efetiva com o usuário
  let dataPagamento = null;
  if (isPaidStatus(newStatus)) {
    const title = newStatus === 'Transferido' ? 'Quando foi transferido?' : 'Quando foi pago?';
    dataPagamento = await showDateConfirmPopover({
      anchor: select,
      title,
      initialDate: pag.data_pagamento || null,
    });
    if (!dataPagamento) {
      // Cancelado pelo usuário — reverte o select
      select.value = pag.status;
      return;
    }
  }

  if (newStatus === 'Transferido') {
    select.value = pag.status; // revert enquanto processa
    await createTransferPairAndUpdateStatus(pag, select, dataPagamento);
    return;
  }

  // Salva status + data_pagamento (se aplicável) + audit timestamp
  const updatePayload = {
    status: newStatus,
    status_atualizado_em: new Date().toISOString(),
  };
  if (isPaidStatus(newStatus)) {
    updatePayload.data_pagamento = dataPagamento;
  } else {
    // Reverte: limpa data_pagamento
    updatePayload.data_pagamento = null;
  }

  const { error } = await supabase
    .from('pagamentos')
    .update(updatePayload)
    .eq('id', id);
  if (error) {
    console.error('[saveStatus]', error);
    showToast('Erro ao salvar status: ' + error.message, 'error', 8000);
    select.value = pag.status; // restore
    return;
  }

  pag.status = newStatus;
  pag.data_pagamento = updatePayload.data_pagamento;
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
async function createTransferPairAndUpdateStatus(pag, select, dataPagamento = null) {
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
    const data     = dataPagamento || pag.data_vencimento || new Date().toISOString().slice(0, 10);
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
      .from('pagamentos')
      .update({
        status: 'Transferido',
        data_pagamento: dataPagamento || null,
        status_atualizado_em: new Date().toISOString(),
      })
      .eq('id', pag.id);
    if (pagErr) throw pagErr;

    pag.status = 'Transferido';
    pag.data_pagamento = dataPagamento || null;
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

