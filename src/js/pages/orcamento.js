// =============================================================
// FinFlow — Página: Orçamento Geral (Fase 4.A)
//
// • Auto-geração de entradas em orcamento_geral a partir das
//   subcategorias ativas, com base no período + ocorrências no mês
// • Visão de 1 mês com nav prev/next
// • Tabela agrupada por Categoria parent (Receitas/Dívidas/...)
// • Edição inline do valor planejado (salva no blur ou Enter)
// • Totais por categoria + Resumo (Receitas/Despesas/Saldo)
// • Alerta vermelho piscante quando saldo ≤ 0
// • Tudo em BRL nesta versão (4.A) — câmbio na 4.B
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { formatCurrency, formatCurrencyHTML, MOEDAS } from '../lib/compromissos-config.js';
import { fetchExchangeRate, startCurrencyAutoRefresh } from '../lib/currency.js';
import { initCurrencyWidget } from '../components/currency-widget.js';
import { escapeHtml, isoMonth, parseUserNumber } from '../lib/utils.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';

function getMainCurrencySymbol() {
  const code = localStorage.getItem('finflow.moeda_padrao') || 'BRL';
  return MOEDAS.find((m) => m.code === code)?.symbol || code;
}

// -----------------------------
// State
// -----------------------------
const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth(); // 0-11

let cachedOrcamento = []; // entries do orcamento_geral pro mês visível (com subcategorias + categorias aninhadas)
let cachedCategorias = []; // pra ordenar blocos
let cachedSubcategorias = []; // pra auto-gerar entradas
let cachedProjetos = [];   // pra mostrar badge de projeto nas linhas de investimento
let cachedDividas = [];    // { id, valor_total, valor_pago } pra coluna Progresso
let realizadoByProjetoOrc = new Map(); // projeto_id → realizado (BRL) pra coluna Progresso
const orcSubMap = new Map(); // entry.id → subcategoria (pra popover de ocorrências)

// Câmbio
const ALL_FOREIGN_CURRENCIES = ['USD', 'EUR', 'GBP']; // sempre exibidas no widget
const ratesMap = new Map();      // 'USD' → 5.15 (1 USD = X BRL)
let autoRefreshHandle = null;

// View mode
let viewMode = 'monthly'; // 'monthly' | 'yearly'

const MONTH_LABELS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTH_SHORT_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Agrupamento visual da página em 3 super-blocos
const SUPER_BLOCOS = [
  {
    id: 'contribuicao',
    label: 'Contribuição',
    subtitle: 'Receitas e dívidas. O que sobra contribui pra Sonhos e Custo de vida.',
    grupos: ['receitas', 'dividas'],
    accent: 'var(--color-success)',
  },
  {
    id: 'sonhos',
    label: 'Sonhos',
    subtitle: 'Investimentos.',
    grupos: ['investimentos'],
    accent: 'var(--color-primary)',
  },
  {
    id: 'custo_vida',
    label: 'Custo de vida',
    subtitle: 'Despesas operacionais do dia a dia.',
    grupos: ['custo_vida'],
    accent: 'var(--color-secondary)',
  },
];

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('orcamento');
  await loadStrings();
  applyTranslationsToDom();
  initCurrencyWidget('currency-widget');

  // Tab strip: Compromissos | Mensal | Anual | Histórico
  const { mountOrcamentoTabs, getActiveTabFromUrl } = await import('../components/orcamento-tabs.js');
  const activeTab = getActiveTabFromUrl();
  // Redirect quando alguém chega via /orcamento.html?tab=configuracoes
  if (activeTab === 'configuracoes') {
    location.replace('/compromissos.html');
    return;
  }
  mountOrcamentoTabs('orc-tabs', activeTab);
  // Map tab → viewMode interno
  viewMode = activeTab === '12meses' ? 'yearly'
           : activeTab === 'passados' ? 'passados'
           : 'monthly';
  // Botão "Hoje" só faz sentido nas abas que têm o conceito de "mês atual"
  if (activeTab === 'passados') {
    document.getElementById('btn-hoje')?.classList.add('hidden');
  }

  bindEvents();
  await loadCategorias();
  await loadSubcategorias();
  await loadProjetos();
  await Promise.all([loadDividas(), loadRealizadoProjetos()]);

  await dispatchLoad();

  // Auto-refresh das cotações a cada 5 min
  if (autoRefreshHandle) clearInterval(autoRefreshHandle);
  autoRefreshHandle = startCurrencyAutoRefresh(async () => {
    await refreshRates();
    if (ratesMap.size > 0) renderOrcamento();
  });
});

/**
 * Intercepta cliques nas abas internas (mensal/12meses/passados) e
 * troca via pushState — sem full reload nem flash. A aba "Compromissos"
 * continua sendo full navigation (página diferente).
 */
function bindClientSideTabNav() {
  document.getElementById('orc-tabs')?.addEventListener('click', (e) => {
    const link = e.target.closest('a.orc-tab');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    // Só intercepta links da própria orcamento.html
    if (!href.startsWith('/orcamento.html')) return;
    e.preventDefault();
    const url = new URL(href, location.origin);
    const newTab = url.searchParams.get('tab') || 'mensal';
    if (newTab === getActiveTabFromUrlSafe()) return;
    history.pushState({ tab: newTab }, '', href);
    applyTabChange(newTab);
  });
  // Back/forward do navegador
  window.addEventListener('popstate', () => {
    applyTabChange(getActiveTabFromUrlSafe());
  });
}

function getActiveTabFromUrlSafe() {
  const t = new URLSearchParams(location.search).get('tab') || 'mensal';
  return ['mensal', '12meses', 'passados'].includes(t) ? t : 'mensal';
}

function applyTabChange(newTab) {
  // Atualiza visual do tab strip
  document.querySelectorAll('#orc-tabs .orc-tab').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const tabId = new URL(href, location.origin).searchParams.get('tab') || (href.includes('compromissos') ? 'configuracoes' : 'mensal');
    const active = tabId === newTab;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  // Atualiza viewMode + visibilidade do botão Hoje + re-render
  viewMode = newTab === '12meses' ? 'yearly' : newTab === 'passados' ? 'passados' : 'monthly';
  const btnHoje = document.getElementById('btn-hoje');
  if (btnHoje) btnHoje.classList.toggle('hidden', newTab === 'passados');
  dispatchLoad();
}

function bindEvents() {
  bindClientSideTabNav();
  document.getElementById('orc-prev')?.addEventListener('click', () => navigate(-1));
  document.getElementById('orc-next')?.addEventListener('click', () => navigate(1));
  document.getElementById('btn-hoje')?.addEventListener('click', () => {
    const t = new Date();
    viewYear = t.getFullYear();
    viewMonth = t.getMonth();
    dispatchLoad();
  });
}

function dispatchLoad() {
  if (viewMode === 'yearly') return loadYearly();
  if (viewMode === 'passados') return showPassadosView();
  return loadMonth();
}

/**
 * Aba "Meses passados" (v0.5.2): mostra o REALIZADO (pagamentos reais)
 * dos últimos 12 meses. Apenas visualização. O usuário escolhe o mês
 * num dropdown que lista somente os meses com dados.
 */
async function showPassadosView() {
  document.querySelector('.orcamento-monthnav')?.classList.add('hidden');
  document.getElementById('frozen-banner')?.classList.add('hidden');
  document.getElementById('orcamento-summary')?.classList.add('hidden');
  document.getElementById('empty-state')?.classList.add('hidden');
  const container = document.getElementById('orcamento-container');
  if (!container) return;

  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span>Carregando histórico…</div>';

  // Descobre os meses (últimos 12) que têm pagamentos lançados
  const today = new Date();
  const minDate = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const minISO  = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, '0')}-01`;
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

  const { data: monthsData, error: monthsErr } = await supabase
    .from('pagamentos')
    .select('mes_ano')
    .gte('mes_ano', minISO)
    .lt('mes_ano', todayISO)
    .order('mes_ano', { ascending: false });

  if (monthsErr) {
    console.error('[showPassadosView months]', monthsErr);
    container.innerHTML = `<div class="empty-state"><h2 class="empty-state-title">Erro ao carregar histórico</h2><p class="empty-state-message">${escapeHtml(monthsErr.message)}</p></div>`;
    return;
  }

  // Deduplica meses
  const monthSet = new Set();
  for (const r of (monthsData || [])) monthSet.add(r.mes_ano);
  const availableMonths = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

  if (availableMonths.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="margin-top: var(--space-6);">
        <div class="empty-state-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
        </div>
        <h2 class="empty-state-title">Nenhum mês com dados ainda</h2>
        <p class="empty-state-message">A aba <strong>Meses passados</strong> mostrará o realizado quando houver pagamentos lançados nos últimos 12 meses.</p>
      </div>
    `;
    return;
  }

  // Pré-seleciona o mês mais recente
  const selected = availableMonths[0];
  await renderPassadosForMonth(container, availableMonths, selected);
}

function monthAnoLabel(mesAno) {
  const [y, m] = mesAno.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  const fmt = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return fmt.charAt(0).toUpperCase() + fmt.slice(1);
}

async function renderPassadosForMonth(container, availableMonths, selectedMesAno) {
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span>Carregando…</div>';

  // Carrega pagamentos do mês selecionado
  const { data: pagamentos, error } = await supabase
    .from('pagamentos')
    .select('id, subcategoria_id, valor_previsto, valor_real, moeda, status, data_vencimento, observacao')
    .eq('mes_ano', selectedMesAno)
    .order('data_vencimento', { ascending: true });

  if (error) {
    console.error('[renderPassadosForMonth]', error);
    container.innerHTML = `<div class="empty-state"><p class="empty-state-message">${escapeHtml(error.message)}</p></div>`;
    return;
  }

  // Agrupa por categoria → subcategoria
  const subById = new Map(cachedSubcategorias.map((s) => [s.id, s]));
  const catById = new Map(cachedCategorias.map((c) => [c.id, c]));
  const groups = new Map(); // categoriaId → { categoria, rows: [] }

  for (const p of (pagamentos || [])) {
    const sub = subById.get(p.subcategoria_id);
    if (!sub) continue;
    const cat = catById.get(sub.categoria_id);
    if (!cat) continue;
    if (!groups.has(cat.id)) groups.set(cat.id, { categoria: cat, rows: [] });
    groups.get(cat.id).rows.push({ pagamento: p, sub });
  }

  // Picker + cards por categoria
  const pickerHtml = `
    <div class="orcamento-monthnav" style="justify-content: flex-start; gap: var(--space-3); margin-bottom: var(--space-4);">
      <label for="passados-mes-picker" style="font-size: var(--fs-sm); color: var(--color-text-muted); font-weight: var(--fw-medium);">Mês:</label>
      <select id="passados-mes-picker" class="select" style="max-width: 240px;">
        ${availableMonths.map((m) => `<option value="${m}" ${m === selectedMesAno ? 'selected' : ''}>${monthAnoLabel(m)}</option>`).join('')}
      </select>
    </div>
  `;

  if (groups.size === 0) {
    container.innerHTML = `
      ${pickerHtml}
      <div class="empty-state"><p class="empty-state-message">Sem pagamentos lançados em ${monthAnoLabel(selectedMesAno)}.</p></div>
    `;
    bindPassadosPicker(container, availableMonths);
    return;
  }

  // Pre-fetch de câmbio pras moedas estrangeiras presentes (evita somar
  // valores em USD/GBP como se fossem BRL no rodapé).
  const moedasEstrangeiras = new Set();
  for (const p of (pagamentos || [])) {
    const m = p.moeda || 'BRL';
    if (m !== 'BRL') moedasEstrangeiras.add(m);
  }
  const ratesMap = new Map();
  await Promise.all([...moedasEstrangeiras].map(async (m) => {
    try { ratesMap.set(m, await fetchExchangeRate(m, 'BRL')); }
    catch { ratesMap.set(m, null); }
  }));
  const toBRL = (val, moeda) => {
    if (!moeda || moeda === 'BRL') return Number(val) || 0;
    const rate = ratesMap.get(moeda);
    return rate ? (Number(val) || 0) * rate : (Number(val) || 0);
  };

  // Render por categoria (apenas visualização)
  let totalRealizado = 0;
  let totalPrevisto = 0;
  const html = Array.from(groups.values()).map(({ categoria, rows }) => {
    const subRows = rows.map(({ pagamento, sub }) => {
      const real     = Number(pagamento.valor_real) || 0;
      const previsto = Number(pagamento.valor_previsto) || 0;
      // Soma totais sempre em BRL (converte moeda estrangeira)
      totalRealizado += toBRL(real, pagamento.moeda || 'BRL');
      totalPrevisto  += toBRL(previsto, pagamento.moeda || 'BRL');
      const statusClass = ({
        'Pago':        'status-pago',
        'Cartão':      'status-cartao',
        'Transferido': 'status-pago',
        'Agendado':    'status-agendado',
        'Cancelado':   'status-cancelado',
        'Parcial':     'status-parcial',
      })[pagamento.status] || '';
      return `
        <tr class="orcamento-row" data-pagamento-id="${pagamento.id}">
          <td>${escapeHtml(sub.apelido?.trim() || sub.nome)}</td>
          <td><span class="status-pill ${statusClass}">${pagamento.status}</span></td>
          <td class="text-right tabular">${formatCurrency(previsto, pagamento.moeda || 'BRL')}</td>
          <td class="text-right tabular">${formatCurrency(real, pagamento.moeda || 'BRL')}</td>
          <td class="text-muted" style="font-size: var(--fs-xs);">${escapeHtml(pagamento.observacao || '')}</td>
        </tr>
      `;
    }).join('');

    return `
      <section class="orcamento-categoria-section" style="margin-bottom: var(--space-5);">
        <header class="orcamento-categoria-header" style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: ${categoria.cor};"></span>
          <h3 style="font-family: var(--font-display); font-size: var(--fs-base); font-weight: var(--fw-semibold); margin: 0;">${escapeHtml(categoria.nome)}</h3>
        </header>
        <table class="table table-sm">
          <thead><tr>
            <th>Compromisso</th>
            <th style="width: 130px;">Status</th>
            <th class="text-right" style="width: 130px;">Previsto</th>
            <th class="text-right" style="width: 130px;">Realizado</th>
            <th>Observação</th>
          </tr></thead>
          <tbody>${subRows}</tbody>
        </table>
      </section>
    `;
  }).join('');

  container.innerHTML = `
    ${pickerHtml}
    ${html}
    <div class="orcamento-summary" id="passados-summary" style="margin-top: var(--space-4);">
      <div class="orcamento-summary-card">
        <div class="orcamento-summary-label">Total previsto</div>
        <div class="orcamento-summary-value">${formatCurrency(totalPrevisto, 'BRL')}</div>
      </div>
      <div class="orcamento-summary-card">
        <div class="orcamento-summary-label">Total realizado</div>
        <div class="orcamento-summary-value">${formatCurrency(totalRealizado, 'BRL')}</div>
      </div>
      <div class="orcamento-summary-card">
        <div class="orcamento-summary-label">Diferença</div>
        <div class="orcamento-summary-value ${totalRealizado <= totalPrevisto ? 'dre-positive' : 'dre-negative'}">${formatCurrency(totalRealizado - totalPrevisto, 'BRL')}</div>
      </div>
    </div>
  `;

  bindPassadosPicker(container, availableMonths);
}

function bindPassadosPicker(container, availableMonths) {
  const picker = container.querySelector('#passados-mes-picker');
  if (!picker) return;
  picker.addEventListener('change', (e) => {
    renderPassadosForMonth(container, availableMonths, e.target.value);
  });
}

function navigate(delta) {
  viewMonth += delta;
  if (viewMonth < 0)  { viewMonth = 11; viewYear -= 1; }
  if (viewMonth > 11) { viewMonth = 0;  viewYear += 1; }
  dispatchLoad();
}

// -----------------------------
// Data loaders
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
    return;
  }
  cachedCategorias = data || [];
}

async function loadProjetos() {
  const { data, error } = await supabase
    .from('projetos_investimento')
    .select('*');
  if (error) {
    if (!/relation.*projetos_investimento/i.test(error.message)) {
      console.warn('[orcamento.loadProjetos]', error);
    }
    cachedProjetos = [];
    return;
  }
  cachedProjetos = data || [];
}

function getProjetoOrcamento(id) {
  return cachedProjetos.find((p) => p.id === id) || null;
}

async function loadDividas() {
  const { data } = await supabase.from('dividas').select('id, nome, valor_total, valor_pago');
  cachedDividas = data || [];
}

async function loadRealizadoProjetos() {
  const { data } = await supabase
    .from('pagamentos')
    .select('subcategoria_id, valor_real')
    .in('status', ['Pago', 'Cartão']);
  realizadoByProjetoOrc = new Map();
  const subToProj = new Map(
    cachedSubcategorias.filter((s) => s.projeto_id).map((s) => [s.id, s.projeto_id])
  );
  for (const p of (data || [])) {
    const projId = subToProj.get(p.subcategoria_id);
    if (!projId) continue;
    realizadoByProjetoOrc.set(projId, (realizadoByProjetoOrc.get(projId) || 0) + (Number(p.valor_real) || 0));
  }
  for (const proj of cachedProjetos) {
    const si = Number(proj.saldo_inicial) || 0;
    if (si > 0) realizadoByProjetoOrc.set(proj.id, (realizadoByProjetoOrc.get(proj.id) || 0) + si);
  }
}

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
}

// -----------------------------
// Carrega o mês: ensure + fetch + render
// -----------------------------
async function loadMonth() {
  const container = document.getElementById('orcamento-container');
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span>Carregando orçamento…</div>';
  document.getElementById('orcamento-summary').classList.add('hidden');
  document.getElementById('empty-state').classList.add('hidden');

  // Atualiza label do mês
  const label = document.getElementById('orc-month-label');
  label.textContent = `${MONTH_LABELS[viewMonth]} ${viewYear}`;
  label.classList.remove('range');

  // Garante que existam entradas pro mês visível
  await ensureOrcamentoForMonth(viewYear, viewMonth);

  // Busca entradas com subcategoria + categoria aninhadas
  const mesAno = isoMonth(viewYear, viewMonth);
  const { data, error } = await supabase
    .from('orcamento_geral')
    .select('*, subcategorias(*, categorias(*))')
    .eq('mes_ano', mesAno);

  if (error) {
    console.error('[loadMonth]', error);
    container.innerHTML = '';
    let msg = error.message || JSON.stringify(error);
    if (/relation.*orcamento_geral|column.*subcategoria_id/i.test(msg)) {
      msg = 'Schema desatualizado. Verifique se rodou todas as migrations (0001 a 0008).';
    }
    showToast('Erro: ' + msg, 'error', 12000);
    return;
  }

  // Filtra subcategorias arquivadas/inativas (entry pode existir mas a sub mudou de status)
  cachedOrcamento = (data || []).filter((e) => e.subcategorias?.status === 'ativa');

  // Busca cotações pras moedas estrangeiras presentes (live)
  await refreshRates();

  // Se for mês passado, congela entries com câmbio ainda não travado
  await freezeUnfrozenEntries();

  // Atualiza banner "mês fechado"
  updateFrozenBanner();

  renderOrcamento();
}

// -----------------------------
// Auto-geração de entradas pro mês
// -----------------------------
async function ensureOrcamentoForMonth(year, month) {
  if (cachedSubcategorias.length === 0) return;

  const user = await getCurrentUser();
  if (!user) return;

  const mesAno = isoMonth(year, month);

  // Pra cada subcategoria ativa, calcula valor default
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

  // Upsert ignorando duplicates (preserva edições manuais)
  const { error } = await supabase
    .from('orcamento_geral')
    .upsert(rows, {
      onConflict: 'user_id,subcategoria_id,mes_ano',
      ignoreDuplicates: true,
    });

  if (error) {
    console.error('[ensureOrcamentoForMonth]', error);
    showToast(`${t('orcamento.toast.erro_gerar', 'Erro ao gerar orçamento')}: ${error.message}`, 'error', 10000);
  }
}

// -----------------------------
// Câmbio (Fase 4.B)
// -----------------------------
async function refreshRates() {
  // Sempre busca as 3 padrão (USD, EUR, GBP) + qualquer outra em uso
  const used = [...new Set(
    cachedOrcamento.map((e) => e.moeda).filter((m) => m && m !== 'BRL')
  )];
  const currencies = [...new Set([...ALL_FOREIGN_CURRENCIES, ...used])];

  // Fetch em paralelo
  const results = await Promise.allSettled(
    currencies.map((c) => fetchExchangeRate(c, 'BRL').then((rate) => [c, rate]))
  );

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const [currency, rate] = r.value;
      ratesMap.set(currency, rate);
    } else {
      console.warn('[refreshRates] falhou:', r.reason);
    }
  }
  // Widget é renderizado pelo componente compartilhado (initCurrencyWidget)
}

/**
 * Converte um valor de moeda estrangeira pra BRL.
 *
 * Prioridade:
 *   1. cambio_travado da entry (se mês fechado/congelado)
 *   2. Taxa live do ratesMap (mês corrente/futuro)
 *
 * Retorna null se nenhuma das duas estiver disponível.
 */
function convertToBRL(value, currency, entry) {
  if (!currency || currency === 'BRL') return Number(value) || 0;
  // Prioriza câmbio congelado se existir
  if (entry?.cambio_travado) {
    return (Number(value) || 0) * Number(entry.cambio_travado);
  }
  const rate = ratesMap.get(currency);
  if (!rate) return null;
  return (Number(value) || 0) * rate;
}

/**
 * Verifica se o mês visualizado é passado (anterior ao mês atual).
 */
function isPastMonth(year, month) {
  const today = new Date();
  const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthStart = new Date(year, month, 1);
  return monthStart < startOfThisMonth;
}

/**
 * Freeze oportunístico: ao visualizar um mês passado, captura cotação atual
 * pra entradas com cambio_travado null (1ª vez vendo aquele mês após virar).
 *
 * Em produção (cron ou Edge Function), isso rodaria automaticamente às 01:00
 * do dia 1 de cada mês. Aqui é client-side, mas o efeito pra dados históricos
 * é o mesmo (a partir do 1º acesso, fica congelado).
 */
async function freezeUnfrozenEntries() {
  if (!isPastMonth(viewYear, viewMonth)) return;

  const unfrozen = cachedOrcamento.filter(
    (e) => e.moeda && e.moeda !== 'BRL' && e.cambio_travado === null
  );
  if (unfrozen.length === 0) return;

  // Coleta moedas únicas que precisam ser congeladas
  const currencies = [...new Set(unfrozen.map((e) => e.moeda))];

  // Fetch live rates pra cada
  const liveRates = new Map();
  await Promise.all(currencies.map(async (c) => {
    try {
      const rate = await fetchExchangeRate(c, 'BRL');
      liveRates.set(c, rate);
    } catch (err) {
      console.warn(`[freezeUnfrozenEntries] Falhou pra ${c}:`, err);
    }
  }));

  // Atualiza cada entry com cambio_travado
  const now = new Date().toISOString();
  for (const entry of unfrozen) {
    const rate = liveRates.get(entry.moeda);
    if (!rate) continue;

    const { error } = await supabase
      .from('orcamento_geral')
      .update({ cambio_travado: rate, travado_em: now })
      .eq('id', entry.id);

    if (error) {
      console.warn('[freezeUnfrozenEntries] update error:', error);
      continue;
    }

    // Atualiza cache local
    entry.cambio_travado = rate;
    entry.travado_em = now;
  }
}

function updateFrozenBanner() {
  const banner = document.getElementById('frozen-banner');
  if (!banner) return;

  if (isPastMonth(viewYear, viewMonth)) {
    // Conta quantas entries têm câmbio congelado
    const frozenCount = cachedOrcamento.filter((e) => e.cambio_travado).length;
    const nonBrlCount = cachedOrcamento.filter((e) => e.moeda !== 'BRL').length;
    banner.classList.remove('hidden');
    let txt = 'Mês passado — câmbio congelado.';
    if (nonBrlCount > 0) {
      txt += ` ${frozenCount}/${nonBrlCount} ${frozenCount === 1 ? 'entrada' : 'entradas'} em moeda estrangeira com câmbio fixo.`;
    }
    document.getElementById('frozen-banner-text').textContent = txt;
  } else {
    banner.classList.add('hidden');
  }
  // Widget de cotações é sempre visível (controlado por renderCurrencyWidget)
}

// -----------------------------
// Renderização
// -----------------------------
function renderOrcamento() {
  const container = document.getElementById('orcamento-container');
  const summary = document.getElementById('orcamento-summary');
  const emptyState = document.getElementById('empty-state');

  if (cachedOrcamento.length === 0) {
    container.innerHTML = '';
    summary.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  // Agrupa por categoria parent
  const groups = new Map(); // categoria.id → entries
  cachedCategorias.forEach((cat) => groups.set(cat.id, []));
  const orphans = [];

  for (const entry of cachedOrcamento) {
    const catId = entry.subcategorias?.categoria_id;
    if (catId && groups.has(catId)) groups.get(catId).push(entry);
    else orphans.push(entry);
  }

  // Sort each group alphabetically by subcategoria name
  for (const arr of groups.values()) {
    arr.sort((a, b) => displayName(a).localeCompare(displayName(b), 'pt-BR'));
  }
  orphans.sort((a, b) => displayName(a).localeCompare(displayName(b), 'pt-BR'));

  // Build sections agrupadas por super-bloco (Contribuição / Sonhos / Custo de vida)
  const sections = [];
  for (const bloco of SUPER_BLOCOS) {
    const blocoCats = cachedCategorias.filter((c) => bloco.grupos.includes(c.grupo || 'custo_vida'));
    const blocoSections = [];
    let blocoTotalBRL = 0;

    for (const cat of blocoCats) {
      const items = groups.get(cat.id) || [];
      if (items.length === 0) continue;
      // Acumula total do super-bloco (signed: Receita +, Despesa −)
      for (const e of items) {
        const v = Number(e.valor_previsto) || 0;
        const moeda = e.moeda || 'BRL';
        const vBRL = convertToBRL(v, moeda, e);
        if (vBRL === null) continue;
        blocoTotalBRL += (e.subcategorias?.tipo === 'Receita') ? vBRL : -vBRL;
      }
      blocoSections.push(renderCategoriaSection(cat, items));
    }

    if (blocoSections.length === 0) continue;

    sections.push(renderSuperBlocoHeader(bloco));
    sections.push(...blocoSections);

    // Linha "Contribuição" no fim do super-bloco CONTRIBUIÇÃO (= receitas signed - dívidas signed)
    if (bloco.id === 'contribuicao') {
      sections.push(renderContribuicaoRow(blocoTotalBRL));
    }
  }

  // Categorias órfãs (entries sem categoria_id válida) caem em bloco extra "Sem categoria"
  if (orphans.length > 0) {
    sections.push(renderSuperBlocoHeader({
      id: 'orphans', label: 'Sem categoria', subtitle: 'Subcategorias sem grupo definido', accent: 'var(--color-text-muted)',
    }));
    sections.push(renderCategoriaSection(
      { id: null, nome: 'Sem categoria', cor: '#9CA3AF' },
      orphans
    ));
  }

  if (sections.length === 0) {
    container.innerHTML = '';
    summary.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  container.innerHTML = `
    <div class="contas-table-wrapper">
      <table class="contas-table compromissos-grouped-table orcamento-table">
        <thead>
          <tr>
            <th>Subcategoria</th>
            <th class="text-center">Progresso</th>
            <th data-col="tipo">Tipo</th>
            <th>Vínculo</th>
            <th>Período</th>
            <th class="text-right">Valor base</th>
            <th class="text-right">Valor planejado</th>
          </tr>
        </thead>
        <tbody>${sections.join('')}</tbody>
      </table>
    </div>
  `;

  bindCellEdits();
  updateSummary();
  summary.classList.remove('hidden');
}

// Header de super-bloco (Contribuição / Sonhos / Custo de vida)
function renderSuperBlocoHeader(bloco) {
  return `
    <tr class="super-bloco-header" style="--bloco-accent: ${bloco.accent};">
      <td colspan="7">
        <div class="super-bloco-header-content">
          <div class="super-bloco-label">${escapeHtml(bloco.label)}</div>
          ${bloco.subtitle ? `<div class="super-bloco-subtitle">${escapeHtml(bloco.subtitle)}</div>` : ''}
        </div>
      </td>
    </tr>
  `;
}

// Linha "Contribuição" — destaque ao final do super-bloco CONTRIBUIÇÃO
function renderContribuicaoRow(valorBRL) {
  const cls  = valorBRL > 0 ? 'dre-positive' : (valorBRL < 0 ? 'dre-negative' : 'dre-zero');
  return `
    <tr class="contribuicao-row">
      <td colspan="6" class="text-right">
        <span class="contribuicao-label">Contribuição</span>
        <span class="contribuicao-hint">o que sobra pra Sonhos e Custo de vida</span>
      </td>
      <td class="text-right">
        <span class="contribuicao-value ${cls}">${formatCurrencyHTML(valorBRL, 'BRL')}</span>
      </td>
    </tr>
  `;
}

function renderCategoriaSection(cat, entries) {
  // Calcula total da categoria (signed) — converte tudo pra BRL (frozen ou live)
  let categoriaTotal = 0;
  entries.forEach((e) => {
    const sub = e.subcategorias;
    const v = Number(e.valor_previsto) || 0;
    const moeda = e.moeda || 'BRL';
    const vBRL = convertToBRL(v, moeda, e);
    if (vBRL === null) return; // skip se cotação não disponível
    categoriaTotal += (sub?.tipo === 'Receita') ? vBRL : -vBRL;
  });
  const totalClass = categoriaTotal > 0 ? 'dre-positive' : (categoriaTotal < 0 ? 'dre-negative' : 'dre-zero');
  const totalDisplay = `${formatCurrencyHTML(categoriaTotal, 'BRL')}`;

  const rows = entries.map(renderEntryRow).join('');

  return `
    <tr class="categoria-section-header" style="--cat-color: ${cat.cor};">
      <td colspan="7">
        <span class="cat-dot" style="background: ${cat.cor};"></span>
        ${escapeHtml(cat.nome)}
        <span class="cat-count">${entries.length} ${entries.length === 1 ? 'item' : 'itens'}</span>
      </td>
    </tr>
    ${rows}
    <tr class="orcamento-categoria-total" style="--cat-color: ${cat.cor};">
      <td colspan="6" class="text-right">Subtotal ${escapeHtml(cat.nome)}</td>
      <td class="text-right ${totalClass}">${totalDisplay}</td>
    </tr>
  `;
}

function renderEntryRow(entry) {
  const sub = entry.subcategorias;
  const display = sub?.apelido?.trim() || sub?.nome || '—';
  const tipo = sub?.tipo || 'Despesa';
  const moeda = entry.moeda || 'BRL';
  const isBRL = moeda === 'BRL';

  // Default value: valor_base × ocorrências (pra mostrar como referência)
  // Pra valor_variavel: o "valor base" do mês é o próprio valor_previsto (configurado pelo user).
  const ocurrencias = sub ? countOccurrencesInMonth(sub, viewYear, viewMonth) : 1;
  const isVariavel = !!sub?.valor_variavel;
  const valorBase = Number(sub?.valor_base) || 0;
  const valorBaseTotal = isVariavel ? (Number(entry.valor_previsto) || 0) : (valorBase * ocurrencias);
  // Valor exibido na coluna "Valor base" (sempre só o número, sem tag inline — tag fica em slot fixo)
  if (sub) orcSubMap.set(entry.id, sub);
  const baseValueText = isVariavel
    ? formatCurrencyHTML(Number(entry.valor_previsto) || 0, moeda)
    : `${formatCurrencyHTML(valorBase, moeda)}${ocurrencias > 1 ? `<span class="occurrence-badge" data-entry-id="${entry.id}" data-moeda="${moeda}">${ocurrencias}</span>` : ''}`;
  const baseDisplay = `
    <span class="orcamento-base-wrapper">
      <span class="valor-variavel-tag ${isVariavel ? '' : 'is-hidden'}">varia</span>
      <span class="base-value-number">${baseValueText}</span>
    </span>
  `;
  const isModified = !isVariavel && Number(entry.valor_previsto) !== valorBaseTotal;

  const tipoColor = tipo === 'Receita' ? 'var(--color-success)' : 'var(--color-danger)';
  const tipoSymbol = tipo === 'Receita' ? '+' : '-';

  // Input mostra valor em BRL (convertido). Edição em BRL → save converte de volta.
  const valorOrig = Number(entry.valor_previsto) || 0;
  const valorBRL = convertToBRL(valorOrig, moeda, entry);
  // v0.5.1: aba Mensal/Anual é apenas visualização — edição vive em Compromissos
  const canEdit = false;
  const inputValue = (valorBRL !== null ? valorBRL : valorOrig).toFixed(2);

  // Pra moeda estrangeira, mostra valor original abaixo como referência.
  // O aviso "câmbio indisponível" só aparece quando NÃO conseguimos a taxa
  // (valorBRL === null). Em v0.5.1+ a aba é read-only por design — não
  // confundir o usuário com "edição desabilitada".
  let origRef = '';
  if (!isBRL) {
    const isFrozen = !!entry.cambio_travado;
    const frozenIcon = isFrozen
      ? `<span class="frozen-rate-icon" title="Câmbio congelado em ${entry.travado_em ? new Date(entry.travado_em).toLocaleDateString('pt-BR') : '—'} a R$ ${Number(entry.cambio_travado).toFixed(4)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>`
      : '';
    if (valorBRL !== null) {
      origRef = `<div class="orcamento-brl-equivalent">${frozenIcon}orig: ${formatCurrency(valorOrig, moeda)}</div>`;
    } else {
      origRef = `<div class="orcamento-brl-equivalent unavailable">câmbio ${moeda} indisponível — exibindo valor original</div>`;
    }
  }

  // Célula de vínculo (projeto ou dívida)
  let vinculoCell;
  if (sub?.projeto_id) {
    const proj = getProjetoOrcamento(sub.projeto_id);
    vinculoCell = proj
      ? `<span class="vinculo-badge vinculo-badge--projeto" style="--vinculo-cor: ${proj.cor};">${escapeHtml(proj.nome)}</span>`
      : '<span class="text-muted">—</span>';
  } else if (sub?.divida_id) {
    const div = cachedDividas.find((d) => d.id === sub.divida_id);
    vinculoCell = div
      ? `<span class="vinculo-badge vinculo-badge--divida">${escapeHtml(div.nome)}</span>`
      : '<span class="text-muted">—</span>';
  } else {
    vinculoCell = '<span class="text-muted">—</span>';
  }

  return `
    <tr class="compromisso-row orcamento-row tipo-${tipo === 'Receita' ? 'receita' : 'despesa'} ${isModified ? 'modified' : ''}" data-id="${entry.id}" data-tipo="${tipo}" data-moeda="${moeda}">
      <td>${escapeHtml(display)}</td>
      <td class="orc-progresso-td">${renderProgressoCell(sub)}</td>
      <td data-col="tipo"><span style="color: ${tipoColor}; font-weight: var(--fw-semibold); font-size: var(--fs-xs);">${tipoSymbol} ${tipo}</span></td>
      <td>${vinculoCell}</td>
      <td>${sub?.periodo || '—'}</td>
      <td class="text-right tabular orcamento-base-value">${baseDisplay}</td>
      <td class="text-right value-cell">
        <div class="orcamento-value-wrapper">
          <span class="orcamento-modified-icon" title="Valor editado — diferente do padrão (valor base × ocorrências)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
          </span>
          <span class="orcamento-input-group">
            <span class="brl-prefix">${getMainCurrencySymbol()}</span>
            <input
              type="text"
              inputmode="decimal"
              class="orcamento-cell-edit"
              data-orcamento-id="${entry.id}"
              value="${inputValue}"
              ${canEdit ? '' : 'disabled'}
              aria-label="Valor planejado de ${escapeHtml(display)} em BRL"
            />
          </span>
        </div>
        ${origRef}
      </td>
    </tr>
  `;
}

// -----------------------------
// Inline edit
// -----------------------------
// Event delegation no #orcamento-container (estável entre renders).
// Idempotente — pode ser chamado a cada render sem acumular handlers.
function bindCellEdits() {
  const container = document.getElementById('orcamento-container');
  if (!container || container._delegationBoundMes) return;
  container._delegationBoundMes = true;

  container.addEventListener('blur', (e) => {
    const inp = e.target.closest('.orcamento-cell-edit');
    if (inp) saveCell(inp);
  }, true); // capture — blur não bubbles

  container.addEventListener('keydown', (e) => {
    const inp = e.target.closest('.orcamento-cell-edit');
    if (!inp) return;
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    else if (e.key === 'Escape') {
      const id = inp.dataset.orcamentoId;
      const entry = cachedOrcamento.find((x) => x.id === id);
      if (entry) inp.value = Number(entry.valor_previsto).toFixed(2);
      inp.blur();
    }
  });

  container.addEventListener('click', (e) => {
    const badge = e.target.closest('.occurrence-badge');
    if (!badge) return;
    e.stopPropagation();
    showOccurrencePopover(badge);
  });
}

function showOccurrencePopover(badge) {
  closeOccurrencePopover();

  const entryId = badge.dataset.entryId;
  const moeda = badge.dataset.moeda || 'BRL';
  const sub = orcSubMap.get(entryId);
  if (!sub) return;

  const dates = getOccurrenceDatesInMonth(sub, viewYear, viewMonth);
  const valorBase = Number(sub.valor_base) || 0;

  const dateFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });

  const rows = dates.map((d) => `
    <div class="occ-popover-row">
      <span class="occ-popover-date">${dateFormatter.format(d)}</span>
      <span class="occ-popover-value">${formatCurrencyHTML(valorBase, moeda)}</span>
    </div>
  `).join('');

  const pop = document.createElement('div');
  pop.className = 'occurrence-popover';
  pop.id = 'occurrence-popover';
  pop.innerHTML = `
    <div class="occ-popover-header">${sub.apelido?.trim() || sub.nome}</div>
    ${rows}
  `;
  document.body.appendChild(pop);

  const rect = badge.getBoundingClientRect();
  const popW = 220;
  let left = rect.right - popW + window.scrollX;
  if (left < 8) left = 8;
  pop.style.left = `${left}px`;
  pop.style.top = `${rect.bottom + 6 + window.scrollY}px`;

  setTimeout(() => {
    document.addEventListener('click', closeOccurrencePopover, { once: true });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOccurrencePopover(); }, { once: true });
  }, 0);
}

function closeOccurrencePopover() {
  document.getElementById('occurrence-popover')?.remove();
}

async function saveCell(input) {
  // v0.5.1: edição desativada — esta página agora é apenas visualização
  if (input.disabled || input.readOnly) return;
  const id = input.dataset.orcamentoId;
  const newValueBRL = parseUserNumber(input.value); // Input está em BRL
  const entry = cachedOrcamento.find((x) => x.id === id);
  if (!entry) return;

  const oldValueOrig = Number(entry.valor_previsto);
  const moeda = entry.moeda || 'BRL';

  if (isNaN(newValueBRL) || newValueBRL < 0) {
    showToast(t('orcamento.validacao.valor_invalido', 'Valor inválido'), 'error');
    // Restaura input com BRL atual
    const valorBRLAtual = convertToBRL(oldValueOrig, moeda, entry);
    input.value = (valorBRLAtual !== null ? valorBRLAtual : oldValueOrig).toFixed(2);
    return;
  }

  // Converte BRL → moeda original pra salvar
  let newValueOrig;
  if (moeda === 'BRL') {
    newValueOrig = newValueBRL;
  } else {
    const rate = entry.cambio_travado ? Number(entry.cambio_travado) : ratesMap.get(moeda);
    if (!rate) {
      showToast(`Câmbio ${moeda} indisponível — não posso salvar agora`, 'error', 8000);
      const valorBRLAtual = convertToBRL(oldValueOrig, moeda, entry);
      input.value = (valorBRLAtual !== null ? valorBRLAtual : oldValueOrig).toFixed(2);
      return;
    }
    newValueOrig = newValueBRL / rate;
  }

  // Sem mudança real (tolerância pra precisão de roundtrip)
  if (Math.abs(newValueOrig - oldValueOrig) < 0.005) return;

  input.classList.add('saving');
  input.classList.remove('saved');

  const { error } = await supabase
    .from('orcamento_geral')
    .update({ valor_previsto: newValueOrig })
    .eq('id', id);

  input.classList.remove('saving');

  if (error) {
    console.error('[saveCell]', error);
    showToast('Erro ao salvar: ' + error.message, 'error', 8000);
    const valorBRLAtual = convertToBRL(oldValueOrig, moeda, entry);
    input.value = (valorBRLAtual !== null ? valorBRLAtual : oldValueOrig).toFixed(2);
    return;
  }

  // Update local cache (em moeda original)
  entry.valor_previsto = newValueOrig;

  // Atualiza modified flag
  const sub = entry.subcategorias;
  const ocurrencias = sub ? countOccurrencesInMonth(sub, viewYear, viewMonth) : 1;
  const isVariavel = !!sub?.valor_variavel;
  const valorBaseTotal = (Number(sub?.valor_base) || 0) * ocurrencias;
  const row = input.closest('.orcamento-row, .compromisso-row');
  // Pra valor_variavel, "modified" não faz sentido (o valor é a referência mensal)
  if (row) row.classList.toggle('modified', !isVariavel && Math.abs(newValueOrig - valorBaseTotal) > 0.005);

  input.classList.add('saved');
  setTimeout(() => input.classList.remove('saved'), 1500);

  // Re-render
  if (viewMode === 'yearly') render12MonthsView();
  else renderOrcamento();
}

// -----------------------------
// Summary (totais Receitas/Despesas/Saldo)
// -----------------------------
function updateSummary() {
  let totalReceitas = 0, totalDespesas = 0;
  for (const entry of cachedOrcamento) {
    const tipo = entry.subcategorias?.tipo;
    const v = Number(entry.valor_previsto) || 0;
    const moeda = entry.moeda || 'BRL';
    const vBRL = convertToBRL(v, moeda, entry);
    if (vBRL === null) continue; // skip se cotação não disponível
    if (tipo === 'Receita') totalReceitas += vBRL;
    else if (tipo === 'Despesa') totalDespesas += vBRL;
  }
  const saldo = totalReceitas - totalDespesas;

  document.getElementById('summary-receitas').innerHTML = formatCurrencyHTML(totalReceitas, 'BRL');
  document.getElementById('summary-despesas').innerHTML = formatCurrencyHTML(-totalDespesas, 'BRL');

  const saldoEl = document.getElementById('summary-saldo');
  const saldoCard = document.getElementById('saldo-card');
  saldoEl.innerHTML = formatCurrencyHTML(saldo, 'BRL');

  // Alerta vermelho piscante se saldo ≤ 0
  if (saldo <= 0) {
    saldoCard.classList.add('alerta-negativo');
    saldoEl.classList.remove('dre-positive', 'dre-negative', 'dre-zero');
  } else {
    saldoCard.classList.remove('alerta-negativo');
    saldoEl.classList.add('dre-positive');
    saldoEl.classList.remove('dre-negative', 'dre-zero');
  }
}

// =============================================================
// Visão 12 meses (Fase 4.D)
// =============================================================
async function loadYearly() {
  const container = document.getElementById('orcamento-container');
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span>Carregando 12 meses…</div>';
  document.getElementById('orcamento-summary').classList.add('hidden');
  document.getElementById('frozen-banner').classList.add('hidden');
  document.getElementById('empty-state').classList.add('hidden');

  // Atualiza label: range de meses
  const startLabel = `${MONTH_SHORT_LABELS[viewMonth]}/${String(viewYear).slice(2)}`;
  const endDate = new Date(viewYear, viewMonth + 11, 1);
  const endLabel = `${MONTH_SHORT_LABELS[endDate.getMonth()]}/${String(endDate.getFullYear()).slice(2)}`;
  const label = document.getElementById('orc-month-label');
  label.textContent = `${startLabel} → ${endLabel}`;
  label.classList.add('range');

  // Auto-gera entries pra todos os 12 meses (idempotente, só insere o que falta)
  await ensureOrcamentoFor12Months();

  // Busca todas as entries do range
  const startMesAno = isoMonth(viewYear, viewMonth);
  const endMesAnoDate = new Date(viewYear, viewMonth + 11, 1);
  const endMesAno = isoMonth(endMesAnoDate.getFullYear(), endMesAnoDate.getMonth());

  const { data, error } = await supabase
    .from('orcamento_geral')
    .select('*, subcategorias(*, categorias(*))')
    .gte('mes_ano', startMesAno)
    .lte('mes_ano', endMesAno);

  if (error) {
    console.error('[loadYearly]', error);
    container.innerHTML = '';
    showToast('Erro: ' + (error.message || JSON.stringify(error)), 'error', 12000);
    return;
  }

  cachedOrcamento = (data || []).filter((e) => e.subcategorias?.status === 'ativa');

  // Refresh cotações pra moedas estrangeiras
  await refreshRates();

  render12MonthsView();
}

async function ensureOrcamentoFor12Months() {
  if (cachedSubcategorias.length === 0) return;
  const user = await getCurrentUser();
  if (!user) return;

  const allRows = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(viewYear, viewMonth + i, 1);
    const year = date.getFullYear();
    const month = date.getMonth();
    const mesAno = isoMonth(year, month);

    for (const sub of cachedSubcategorias) {
      if (!isActiveInMonth(sub, year, month)) continue;
      const occurrences = countOccurrencesInMonth(sub, year, month);
      if (occurrences === 0) continue;
      const valor = (Number(sub.valor_base) || 0) * occurrences;
      allRows.push({
        user_id: user.id,
        subcategoria_id: sub.id,
        mes_ano: mesAno,
        valor_previsto: valor,
        moeda: sub.moeda,
      });
    }
  }

  if (allRows.length === 0) return;

  const { error } = await supabase.from('orcamento_geral').upsert(allRows, {
    onConflict: 'user_id,subcategoria_id,mes_ano',
    ignoreDuplicates: true,
  });

  if (error) console.error('[ensureOrcamentoFor12Months]', error);
}

function render12MonthsView() {
  const container = document.getElementById('orcamento-container');
  const summary = document.getElementById('orcamento-summary');
  const emptyState = document.getElementById('empty-state');
  summary.classList.add('hidden');

  if (cachedOrcamento.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  // Build month headers (12 meses partindo do view atual)
  const today = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(viewYear, viewMonth + i, 1);
    const year = date.getFullYear();
    const month = date.getMonth();
    months.push({
      year, month,
      mesAno: isoMonth(year, month),
      label: `${MONTH_SHORT_LABELS[month]}/${String(year).slice(2)}`,
      isCurrent: year === today.getFullYear() && month === today.getMonth(),
    });
  }

  // Index entries por subId|mesAno
  const entryIndex = new Map();
  cachedOrcamento.forEach((e) => entryIndex.set(`${e.subcategoria_id}|${e.mes_ano}`, e));

  // Subcategorias únicas com pelo menos 1 entry no range
  const subById = new Map();
  cachedOrcamento.forEach((e) => {
    if (e.subcategorias) subById.set(e.subcategoria_id, e.subcategorias);
  });

  // Agrupa por categoria parent
  const groups = new Map();
  cachedCategorias.forEach((cat) => groups.set(cat.id, []));
  for (const sub of subById.values()) {
    const catId = sub.categoria_id;
    if (catId && groups.has(catId)) groups.get(catId).push(sub);
  }
  // Sort cada grupo alfabeticamente
  for (const arr of groups.values()) {
    arr.sort((a, b) => (a.apelido?.trim() || a.nome).localeCompare(b.apelido?.trim() || b.nome, 'pt-BR'));
  }

  // Header das colunas
  const monthHeaders = months.map((m) =>
    `<th class="text-right ${m.isCurrent ? 'current-month' : ''}">${m.label}</th>`
  ).join('');

  // Helper: renderiza as rows de UMA categoria (header + subs + subtotal por mês)
  function renderCatRows12m(cat, subs) {
    const out = [];
    out.push(`
      <tr class="categoria-section-header" style="--cat-color: ${cat.cor};">
        <td class="sticky-col" colspan="${1 + months.length}">
          <span class="cat-dot" style="background: ${cat.cor};"></span>
          ${escapeHtml(cat.nome)}
        </td>
      </tr>
    `);

    for (const sub of subs) {
      const cells = months.map((m) => {
        const entry = entryIndex.get(`${sub.id}|${m.mesAno}`);
        const occurrences = countOccurrencesInMonth(sub, m.year, m.month);
        const editable = isActiveInMonth(sub, m.year, m.month) && occurrences > 0;
        const currentClass = m.isCurrent ? 'current-month' : '';

        if (entry) {
          const valorOrig = Number(entry.valor_previsto) || 0;
          const valorBRL = convertToBRL(valorOrig, entry.moeda || 'BRL', entry);
          const inputValue = (valorBRL !== null ? valorBRL : valorOrig).toFixed(2);
          const monthLabel = `${String(m.month + 1).padStart(2, '0')}/${m.year}`;
          // v0.5.1: aba 12 meses é apenas visualização — sempre readonly
          return `<td class="text-right value-cell ${currentClass}">
            <input type="text" inputmode="decimal"
              class="orcamento-cell-edit-12m readonly-view"
              data-orcamento-id="${entry.id}"
              value="${inputValue}"
              readonly
              aria-label="Valor planejado de ${escapeHtml(sub.apelido?.trim() || sub.nome)} em ${monthLabel} em BRL"
            />
          </td>`;
        }
        return `<td class="text-right text-muted ${currentClass}" style="font-size: var(--fs-xs);">—</td>`;
      }).join('');

      const display = sub.apelido?.trim() || sub.nome;
      let vinculoBadgeBelow = '';
      if (sub.projeto_id) {
        const proj = getProjetoOrcamento(sub.projeto_id);
        if (proj) vinculoBadgeBelow = `<div class="sub-projeto-row"><span class="vinculo-badge vinculo-badge--projeto" style="--vinculo-cor: ${proj.cor};">${escapeHtml(proj.nome)}</span></div>`;
      } else if (sub.divida_id) {
        const div = cachedDividas.find((d) => d.id === sub.divida_id);
        if (div) vinculoBadgeBelow = `<div class="sub-projeto-row"><span class="vinculo-badge vinculo-badge--divida">${escapeHtml(div.nome)}</span></div>`;
      }
      out.push(`
        <tr class="compromisso-row tipo-${sub.tipo === 'Receita' ? 'receita' : 'despesa'}" style="--cat-color: ${cat.cor};" data-tipo="${sub.tipo}">
          <td class="sticky-col">
            <div class="sub-name-row">
              <span class="sub-name-text">${escapeHtml(display)}</span>
            </div>
            ${vinculoBadgeBelow}
          </td>
          ${cells}
        </tr>
      `);
    }

    // Subtotal da categoria por mês
    const subtotalCells = months.map((m) => {
      let total = 0;
      for (const sub of subs) {
        const entry = entryIndex.get(`${sub.id}|${m.mesAno}`);
        if (!entry) continue;
        const v = Number(entry.valor_previsto) || 0;
        const moeda = entry.moeda || 'BRL';
        const vBRL = convertToBRL(v, moeda, entry);
        if (vBRL === null) continue;
        total += (sub.tipo === 'Receita') ? vBRL : -vBRL;
      }
      const cls = total > 0 ? 'dre-positive' : (total < 0 ? 'dre-negative' : 'dre-zero');
      const currentClass = m.isCurrent ? 'current-month' : '';
      return `<td class="text-right tabular ${cls} ${currentClass}">${formatCurrency(total, 'BRL')}</td>`;
    }).join('');

    out.push(`
      <tr class="orcamento-categoria-total" style="--cat-color: ${cat.cor};">
        <td class="sticky-col text-right">Subtotal ${escapeHtml(cat.nome)}</td>
        ${subtotalCells}
      </tr>
    `);
    return out.join('');
  }

  // Rows agrupadas por super-bloco
  const rows = [];
  const colspan = 1 + months.length;
  for (const bloco of SUPER_BLOCOS) {
    const blocoCats = cachedCategorias.filter((c) => bloco.grupos.includes(c.grupo || 'custo_vida'));
    const renderedCats = [];
    const blocoCatsList = []; // pra calcular linha contribuição

    for (const cat of blocoCats) {
      const subs = groups.get(cat.id) || [];
      if (subs.length === 0) continue;
      renderedCats.push(renderCatRows12m(cat, subs));
      blocoCatsList.push({ cat, subs });
    }

    if (renderedCats.length === 0) continue;

    // Header do super-bloco (atravessa todas as colunas)
    rows.push(`
      <tr class="super-bloco-header" style="--bloco-accent: ${bloco.accent};">
        <td colspan="${colspan}" class="sticky-col">
          <div class="super-bloco-header-content">
            <div class="super-bloco-label">${escapeHtml(bloco.label)}</div>
            ${bloco.subtitle ? `<div class="super-bloco-subtitle">${escapeHtml(bloco.subtitle)}</div>` : ''}
          </div>
        </td>
      </tr>
    `);
    rows.push(...renderedCats);

    // Linha "Contribuição" no fim do super-bloco contribuicao (1 valor por mês)
    if (bloco.id === 'contribuicao') {
      const contribuicaoCells = months.map((m) => {
        let total = 0;
        for (const { subs } of blocoCatsList) {
          for (const sub of subs) {
            const entry = entryIndex.get(`${sub.id}|${m.mesAno}`);
            if (!entry) continue;
            const v = Number(entry.valor_previsto) || 0;
            const vBRL = convertToBRL(v, entry.moeda || 'BRL', entry);
            if (vBRL === null) continue;
            total += (sub.tipo === 'Receita') ? vBRL : -vBRL;
          }
        }
        const cls  = total > 0 ? 'dre-positive' : (total < 0 ? 'dre-negative' : 'dre-zero');
        const currentClass = m.isCurrent ? 'current-month' : '';
        return `<td class="text-right tabular ${cls} ${currentClass}"><strong>${formatCurrency(total, 'BRL')}</strong></td>`;
      }).join('');
      rows.push(`
        <tr class="contribuicao-row contribuicao-row-12m">
          <td class="sticky-col text-right"><span class="contribuicao-label">Contribuição</span></td>
          ${contribuicaoCells}
        </tr>
      `);
    }
  }

  // Totais por mês: Receitas, Despesas, Saldo
  const receitaCells = months.map((m) => {
    const t = sumByTipoForMonth('Receita', m.mesAno);
    const cls = m.isCurrent ? 'current-month' : '';
    return `<td class="text-right dre-positive ${cls}">${formatCurrency(t, 'BRL')}</td>`;
  }).join('');

  const despesaCells = months.map((m) => {
    const t = sumByTipoForMonth('Despesa', m.mesAno);
    const cls = m.isCurrent ? 'current-month' : '';
    return `<td class="text-right dre-negative ${cls}">${formatCurrency(-t, 'BRL')}</td>`;
  }).join('');

  const saldoCells = months.map((m) => {
    const r = sumByTipoForMonth('Receita', m.mesAno);
    const d = sumByTipoForMonth('Despesa', m.mesAno);
    const s = r - d;
    const cls = s > 0 ? 'dre-positive' : (s < 0 ? 'dre-negative' : 'dre-zero');
    const alertCls = s <= 0 ? 'alerta-negativo' : '';
    const currentCls = m.isCurrent ? 'current-month' : '';
    return `<td class="text-right ${cls} ${alertCls} ${currentCls}">${formatCurrency(s, 'BRL')}</td>`;
  }).join('');

  container.innerHTML = `
    <p style="font-size: var(--fs-xs); color: var(--color-text-muted); margin-bottom: var(--space-2);">
      Todos os valores na tabela estão convertidos em <strong style="color: var(--color-text-secondary);">R$ (BRL)</strong>.
    </p>
    <div class="contas-table-wrapper orcamento-12m-wrapper">
      <table class="contas-table compromissos-grouped-table orcamento-12m-table">
        <thead>
          <tr>
            <th class="sticky-col">Subcategoria</th>
            ${monthHeaders}
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
        <tfoot>
          <tr>
            <td class="sticky-col text-right">Total Receitas</td>
            ${receitaCells}
          </tr>
          <tr>
            <td class="sticky-col text-right">Total Despesas</td>
            ${despesaCells}
          </tr>
          <tr class="saldo">
            <td class="sticky-col text-right">Saldo</td>
            ${saldoCells}
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  bindCellEdits12m();
}

function sumByTipoForMonth(tipo, mesAno) {
  let total = 0;
  for (const e of cachedOrcamento) {
    if (e.mes_ano !== mesAno) continue;
    if (e.subcategorias?.tipo !== tipo) continue;
    const v = Number(e.valor_previsto) || 0;
    const moeda = e.moeda || 'BRL';
    const vBRL = convertToBRL(v, moeda, e);
    if (vBRL === null) continue;
    total += vBRL;
  }
  return total;
}

function bindCellEdits12m() {
  const container = document.getElementById('orcamento-container');
  if (!container || container._delegationBound12m) return;
  container._delegationBound12m = true;

  container.addEventListener('blur', (e) => {
    const inp = e.target.closest('.orcamento-cell-edit-12m');
    if (inp) saveCell(inp);
  }, true);

  container.addEventListener('keydown', (e) => {
    const inp = e.target.closest('.orcamento-cell-edit-12m');
    if (!inp) return;
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    else if (e.key === 'Escape') {
      const id = inp.dataset.orcamentoId;
      const entry = cachedOrcamento.find((x) => x.id === id);
      if (entry) inp.value = Number(entry.valor_previsto).toFixed(2);
      inp.blur();
    }
  });
}

// -----------------------------
// Recurrence helpers (occursOn / countOccurrencesInMonth)
// Mantidos locais nesta tela; espelham a lógica do calendário em compromissos.js
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

function getOccurrenceDatesInMonth(sub, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    if (occursOn(sub, d)) dates.push(new Date(d));
  }
  return dates;
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
function displayName(entry) {
  const sub = entry.subcategorias;
  return sub?.apelido?.trim() || sub?.nome || '';
}

function fmtPct(pct) {
  return pct.toFixed(1) === '100.0' ? '100%' : `${pct.toFixed(1)}%`;
}

function renderProgressoDonut(pct, color) {
  const r = 36, stroke = 12;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(pct, 100) / 100 * circ;
  return `
    <div class="invest-donut-wrapper invest-donut-sm orc-progresso-donut">
      <svg viewBox="0 0 100 100" class="invest-donut" aria-hidden="true">
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--color-surface-alt)" stroke-width="${stroke}"/>
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
          stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}"
          stroke-linecap="round"
          transform="rotate(-90 50 50)"/>
      </svg>
      <div class="invest-donut-center">
        <span class="invest-donut-pct${pct > 100 ? ' invest-donut-pct--over' : ''}">${fmtPct(pct)}</span>
      </div>
    </div>
  `;
}

function renderProgressoCell(sub) {
  if (sub?.projeto_id) {
    const proj = getProjetoOrcamento(sub.projeto_id);
    const meta = Number(proj?.meta_valor) || 0;
    if (meta <= 0) return '<span class="text-muted orc-sem-alvo">sem alvo</span>';
    const realizado = realizadoByProjetoOrc.get(sub.projeto_id) || 0;
    const pct = (realizado / meta) * 100;
    return renderProgressoDonut(pct, proj?.cor || 'var(--color-primary)');
  }
  if (sub?.divida_id) {
    const div = cachedDividas.find((d) => d.id === sub.divida_id);
    const total = Number(div?.valor_total) || 0;
    if (total <= 0) return '<span class="text-muted orc-sem-alvo">sem alvo</span>';
    const pago = Number(div?.valor_pago) || 0;
    const pct = (pago / total) * 100;
    return renderProgressoDonut(pct, 'var(--color-danger)');
  }
  return '<span class="text-muted">—</span>';
}

