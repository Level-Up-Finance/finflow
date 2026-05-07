// =============================================================
// FinFlow — Página: Dívidas
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatCurrency } from '../lib/compromissos-config.js';
import { initColVisibility } from '../lib/col-visibility.js';
import { escapeHtml } from '../lib/utils.js';
import { initContatoPicker } from '../components/contato-picker.js';
import { gerarTabela, aplicarCorrecao, validarFases } from '../lib/amortizacao.js';
import { fetchIndicadores, resolveTaxaMensal, anualToMensal } from '../lib/indicadores.js';
import { parseDecimal, formatDecimal, autoAttachDecimalInputs } from '../lib/number-format.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';
import { renderGantt } from './dividas/gantt.js';

/** Atalho: lê o valor de um input decimal BR (vírgula) e retorna número ou null. */
function readDecimal(id) {
  const el = document.getElementById(id);
  return el ? parseDecimal(el.value) : null;
}

/** Atalho: escreve um número num input decimal BR formatado. */
function writeDecimal(id, num, decimals = 2) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = num == null || num === '' ? '' : formatDecimal(Number(num), decimals);
}

// -----------------------------
// Regime helpers
// -----------------------------
const REGIME_INFO = {
  SAC: {
    title: 'SAC — Sistema de Amortização Constante',
    desc:  'A amortização é fixa em todas as parcelas; os juros caem com o saldo. Resultado: a parcela diminui mês a mês.',
    example: 'Ex: financiamento imobiliário tradicional (CEF). Parcela inicial maior, vai reduzindo até a última.',
  },
  Price: {
    title: 'Price — Sistema Francês',
    desc:  'A parcela é fixa do início ao fim. No começo você paga mais juros e menos amortização; com o tempo inverte.',
    example: 'Ex: empréstimo pessoal, financiamento de veículo, crediário. Parcela igual nas 60 prestações.',
  },
  Customizado: {
    title: 'Customizado — Parcelas em fases',
    desc:  'Você define faixas de parcelas com valores fixos. Útil para carência, parcelas escalonadas ou contratos não-padrão.',
    example: 'Ex: 6 parcelas de R$124,48 (carência) + 54 parcelas de R$216,70 (amortização normal).',
  },
};

function setRegime(regime) {
  document.querySelectorAll('#div-regime-seg .view-toggle-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.regime === (regime ?? ''));
  });
  document.getElementById('div-n-parcelas-field').classList.toggle('hidden', !regime);
  document.getElementById('div-fases-field').classList.toggle('hidden', regime !== 'Customizado');

  // Caixa de explicação do regime
  const info = REGIME_INFO[regime];
  const box = document.getElementById('div-regime-info');
  if (info) {
    document.getElementById('div-regime-info-title').textContent = info.title;
    document.getElementById('div-regime-info-desc').textContent = info.desc;
    document.getElementById('div-regime-info-example').textContent = info.example;
    box.classList.remove('hidden');
  } else {
    box.classList.add('hidden');
  }

  if (regime === 'Customizado' && editingFases.length === 0) {
    const n = parseInt(document.getElementById('div-n-parcelas').value) || 1;
    editingFases = [{ de: 1, ate: n, valor: 0 }];
    renderFasesList();
  }

  // Recalcula vencimento final ao mudar regime/parcelas
  recalcVencimentoFinal();
}

/** Helpers para classificar juros_tipo (lê semântica unificada). */
function isManualTipo(t)        { return t === 'manual_fixo' || t === 'manual_variavel'; }
function isIndexedTipo(t)       { return t && !isManualTipo(t); }
function isVariableTipo(t)      { return t === 'manual_variavel' || isIndexedTipo(t); }

async function setJurosTipo(tipo) {
  const t = tipo || 'manual_fixo';
  document.getElementById('div-juros-tipo').value = t;
  const jurosLabel  = document.getElementById('div-juros-label');
  const jurosInput  = document.getElementById('div-juros');
  const jurosHint   = document.getElementById('div-juros-hint');
  const spreadField = document.getElementById('div-juros-spread-field');
  const refField    = document.getElementById('div-taxa-ref-field');

  // Spread só aparece para indexados +spread
  spreadField.classList.toggle('hidden', !t.endsWith('_plus'));
  // Índice de referência só aparece para Manual variável
  refField.classList.toggle('hidden', t !== 'manual_variavel');

  if (isManualTipo(t)) {
    jurosLabel.textContent = 'Juros ao mês (%)';
    jurosInput.readOnly = false;
    jurosInput.classList.remove('input--readonly');
    jurosHint.classList.add('hidden');
    return;
  }

  // Tipos atrelados a indicador
  jurosInput.readOnly = true;
  jurosInput.classList.add('input--readonly');
  jurosLabel.textContent = `Taxa efetiva (% a.m.) — ${t.replace('_plus', ' + spread').toUpperCase()}`;

  const ind = await fetchIndicadores();
  const baseAnual = t.startsWith('selic') ? ind.selic
                  : t.startsWith('cdi')   ? ind.cdi
                  :                          ind.ipca;
  const baseMensal = anualToMensal(baseAnual);
  const spread = t.endsWith('_plus') ? (readDecimal('div-juros-spread') || 0) : 0;

  if (baseAnual == null) {
    jurosHint.classList.remove('hidden');
    jurosHint.textContent = 'Indicador indisponível agora — informe taxa manual ou tente novamente.';
    jurosInput.readOnly = false;
    jurosInput.classList.remove('input--readonly');
    return;
  }

  const efetivo = baseMensal + spread;
  writeDecimal('div-juros', efetivo, 4);
  jurosHint.classList.remove('hidden');
  jurosHint.textContent = `Base anual: ${formatDecimal(baseAnual, 2)}% → ${formatDecimal(baseMensal, 4)}% a.m.${spread ? ` + ${formatDecimal(spread, 4)}% spread` : ''}`;
}

function setIndiceCorrecao(idx) {
  const i = idx || 'nenhum';
  document.getElementById('div-indice-correcao').value = i;
  document.getElementById('div-correcao-taxa-field').classList.toggle('hidden', i !== 'fixo');
}

// -----------------------------
// Fases editor
// -----------------------------
function renderFasesList() {
  const list = document.getElementById('div-fases-list');
  if (!list) return;
  if (editingFases.length === 0) { list.innerHTML = ''; return; }
  list.innerHTML = editingFases.map((f, idx) => `
    <div class="div-fase-row" data-idx="${idx}">
      <span class="div-fase-row-label">Parcelas</span>
      <input type="number" class="input input-sm fase-de"  value="${f.de}"  min="1" step="1" placeholder="de">
      <span class="div-fase-row-label">a</span>
      <input type="number" class="input input-sm fase-ate" value="${f.ate}" min="1" step="1" placeholder="até">
      <span class="div-fase-row-label">de R$</span>
      <input type="text" inputmode="decimal" class="input input-sm input-decimal fase-valor" value="${f.valor ? formatDecimal(f.valor, 2) : ''}" placeholder="0,00">
      <button type="button" class="btn btn-ghost btn-sm fase-remove" aria-label="Remover">×</button>
    </div>
  `).join('');
  list.querySelectorAll('.div-fase-row').forEach((row) => {
    const idx = parseInt(row.dataset.idx);
    row.querySelector('.fase-de').addEventListener('input', (e) => editingFases[idx].de = parseInt(e.target.value) || 0);
    row.querySelector('.fase-ate').addEventListener('input', (e) => editingFases[idx].ate = parseInt(e.target.value) || 0);
    const valorEl = row.querySelector('.fase-valor');
    valorEl.addEventListener('input', (e) => editingFases[idx].valor = parseDecimal(e.target.value) || 0);
    valorEl.addEventListener('blur', (e) => {
      const n = parseDecimal(e.target.value);
      e.target.value = n == null ? '' : formatDecimal(n, 2);
    });
    row.querySelector('.fase-remove').addEventListener('click', () => {
      editingFases.splice(idx, 1);
      renderFasesList();
    });
  });
}

/**
 * Auto-preenche "Vencimento final" = 1º vencimento + (n_parcelas - 1) meses.
 * Só sobrescreve se o campo estiver vazio OU foi preenchido automaticamente antes.
 */
function recalcVencimentoFinal() {
  const di  = document.getElementById('div-data-inicio').value;
  const np  = parseInt(document.getElementById('div-n-parcelas').value);
  const out = document.getElementById('div-data-vencimento');
  if (!di || !np || np <= 0) return;
  // Se o usuário editou manualmente (flag dataset.userEdited="true"), não sobrescreve
  if (out.dataset.userEdited === 'true' && out.value) return;
  const [y, m, day] = di.split('-').map(Number);
  const d = new Date(y, m - 1 + (np - 1), day);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  out.value = iso;
}

function addFaseRow() {
  const last = editingFases[editingFases.length - 1];
  const proxDe = last ? (last.ate + 1) : 1;
  const nTotal = parseInt(document.getElementById('div-n-parcelas').value) || proxDe;
  editingFases.push({ de: proxDe, ate: Math.max(proxDe, nTotal), valor: 0 });
  renderFasesList();
}

// -----------------------------
// Status config
// -----------------------------
const STATUS_CONFIG = {
  'Ativa':      { label: 'Ativa',      color: 'var(--color-primary)', bg: 'var(--color-primary-50)' },
  'Atrasada':   { label: 'Atrasada',   color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)' },
  'Negociando': { label: 'Negociando', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  'Quitada':    { label: 'Quitada',    color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  'Arquivada':  { label: 'Arquivada',  color: 'var(--color-text-muted)', bg: 'var(--color-surface-alt)' },
};

const TERMINADO_STATUS = new Set(['Quitada', 'Arquivada']);

const BLOCOS = [
  {
    id: 'em_progresso',
    label: 'Em progresso',
    filter: (d) => !TERMINADO_STATUS.has(d.status) && Number(d.valor_pago) > 0,
    emptyMsg: 'Nenhuma dívida em andamento.',
  },
  {
    id: 'por_comecar',
    label: 'Por começar',
    filter: (d) => !TERMINADO_STATUS.has(d.status) && Number(d.valor_pago) === 0,
    emptyMsg: 'Nenhuma dívida aguardando início.',
  },
  {
    id: 'terminado',
    label: 'Terminado',
    filter: (d) => TERMINADO_STATUS.has(d.status),
    emptyMsg: 'Nenhuma dívida finalizada ainda.',
  },
];

// -----------------------------
// State
// -----------------------------
let cachedDividas          = [];
let cachedContas           = [];
let cachedContatos         = [];
let cachedDividaHistorico  = []; // pagamentos_divida_historico
let cachedTaxaHistorico    = []; // divida_taxa_historico
let editingId              = null;
let historicoDividaId      = null;
let pendingDeleteId        = null;
let pagarParcelaId         = null;
let pagarParcelaN          = 1;
let pagarValorRealEditado  = false; // true após o usuário editar manualmente o valor real
let pagarDescEditado       = false; // true após o usuário editar manualmente o desconto
let atualizarTaxaId        = null;
let editingFases           = []; // fases sendo editadas no modal de dívida
let viewMode               = 'cards'; // 'cards' | 'table' | 'gantt'
let ganttZoom              = '1ano';  // '1ano' | '3anos' | '5anos'
let colVisEl               = null;

const today = new Date();
today.setHours(0, 0, 0, 0);

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('dividas');
  initTutorial('dividas');
  bindEvents();

  colVisEl = initColVisibility({
    storageKey: 'dividas',
    tableClass:  'divida-tabela',
    columns: [
      { key: 'credor',     label: 'Credor',      defaultVisible: true  },
      { key: 'status',     label: 'Status',       defaultVisible: true  },
      { key: 'total',      label: 'Total',        defaultVisible: true  },
      { key: 'pago',       label: 'Pago',         defaultVisible: true  },
      { key: 'restante',   label: 'Restante',     defaultVisible: true  },
      { key: 'pct',          label: '% Pago',       defaultVisible: true  },
      { key: 'pct-restante', label: '% Restante',  defaultVisible: true  },
      { key: 'vencimento',   label: 'Vencimento',  defaultVisible: true  },
      { key: 'inicio',     label: 'Início',       defaultVisible: false },
      { key: 'juros',      label: 'Juros',        defaultVisible: false },
      { key: 'regime',     label: 'Regime',       defaultVisible: false },
      { key: 'conta',      label: 'Conta',        defaultVisible: false },
    ],
    toolbarEl: document.querySelector('.toolbar'),
  });

  // Aplica formatação BR (vírgula) em todos os inputs .input-decimal
  autoAttachDecimalInputs();

  // Carrega catálogo de strings traduzidas e aplica nos elementos com data-i18n-*
  await loadStrings();
  applyTranslationsToDom();

  await loadAll();
});

/**
 * Atualiza juros_percentual de dívidas indexadas (SELIC, CDI, IPCA, +spread)
 * com a taxa atual do BrasilAPI. Registra mudanças em divida_taxa_historico.
 * Roda em background no loadAll — silencioso se a API falhar.
 */
async function refreshIndexedRates(dividas) {
  // Considera "indexada" qualquer juros_tipo que não seja Manual (fixo ou variável)
  const indexadas = dividas.filter((d) =>
    d.juros_tipo && d.juros_tipo !== 'manual_fixo' && d.juros_tipo !== 'manual_variavel' && d.juros_tipo !== 'manual'
  );
  if (indexadas.length === 0) return;
  try {
    for (const d of indexadas) {
      const nova = await resolveTaxaMensal({
        juros_tipo: d.juros_tipo,
        juros_spread: d.juros_spread,
      });
      if (nova == null) continue;
      const atual = Number(d.juros_percentual || 0);
      // Só atualiza se mudou mais que 0.0001 a.m. (evita ruído numérico)
      if (Math.abs(nova - atual) < 0.0001) continue;

      // Atualiza row local + persiste
      d.juros_percentual = nova;
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from('dividas').update({ juros_percentual: nova }).eq('id', d.id);
      await supabase.from('divida_taxa_historico').insert({
        divida_id:    d.id,
        user_id:      d.user_id,
        taxa_anterior: atual,
        taxa_nova:    nova,
        data_vigencia: today,
        motivo:       `Atualização automática do indicador ${d.juros_tipo.toUpperCase().replace('_PLUS', ' + spread')}`,
      });
    }
  } catch (err) {
    // Falha silenciosa — não bloqueia carregamento da página
    console.warn('[refreshIndexedRates]', err);
  }
}

// -----------------------------
// Load
// -----------------------------
async function loadAll() {
  const [divRes, contRes, contatosRes, histRes, taxaHistRes] = await Promise.all([
    supabase.from('dividas').select('*').order('created_at', { ascending: false }),
    supabase.from('contas').select('id, nome, apelido').order('nome'),
    supabase.from('contatos').select('id, nome, tipo, status').neq('status', 'arquivado').order('nome'),
    supabase.from('pagamentos_divida_historico').select('*').order('data'),
    supabase.from('divida_taxa_historico').select('*').order('data_vigencia'),
  ]);

  // Auto-refresh de taxas indexadas (SELIC/CDI/IPCA) — feito antes do render
  if (divRes.data) await refreshIndexedRates(divRes.data);

  if (divRes.error) {
    showToast(`${t('dividas.toast.erro_carregar', 'Erro ao carregar dívidas')}: ${divRes.error.message}`, 'error', 8000);
    return;
  }

  if (contatosRes.error) {
    if (!/relation.*contatos|column.*contatos/i.test(contatosRes.error.message)) {
      console.warn('[loadContatos]', contatosRes.error);
    }
    cachedContatos = [];
  } else {
    cachedContatos = contatosRes.data || [];
  }

  if (histRes.error) {
    if (!/relation.*pagamentos_divida_historico/i.test(histRes.error.message)) {
      console.warn('[loadDividaHistorico]', histRes.error);
    }
    cachedDividaHistorico = [];
  } else {
    cachedDividaHistorico = histRes.data || [];
  }

  if (taxaHistRes.error) {
    if (!/relation.*divida_taxa_historico/i.test(taxaHistRes.error.message)) {
      console.warn('[loadTaxaHistorico]', taxaHistRes.error);
    }
    cachedTaxaHistorico = [];
  } else {
    cachedTaxaHistorico = taxaHistRes.data || [];
  }

  cachedDividas = divRes.data || [];
  cachedContas  = contRes.data || [];

  populateContaSelect('div-conta');
  initContatoPickerOnce();
  renderWidgets();
  render();
}

let credorPicker = null;

function initContatoPickerOnce() {
  if (credorPicker) return;
  const rootEl = document.querySelector('[data-picker="div-credor"]');
  if (!rootEl) return;
  credorPicker = initContatoPicker({
    rootEl,
    contatos: () => cachedContatos,
    defaultTipo: 'fornecedor',
  });
}


// -----------------------------
// KPI widgets
// -----------------------------
function renderWidgets() {
  const totalGeral    = cachedDividas.reduce((s, d) => s + Number(d.valor_total), 0);
  const totalPago     = cachedDividas.reduce((s, d) => s + Number(d.valor_pago),  0);
  const totalRestante = Math.max(0, totalGeral - totalPago);

  const pctPago     = totalGeral > 0 ? Math.min(100, (totalPago     / totalGeral) * 100) : 0;
  const pctRestante = totalGeral > 0 ? Math.min(100, (totalRestante / totalGeral) * 100) : 0;

  // Widget 1 — quanto falta pagar
  document.getElementById('kpi-aberto-value').textContent = formatCurrency(totalRestante);
  document.getElementById('kpi-aberto-sub').textContent   = `${fmtPct(pctRestante)} do total ainda em aberto`;
  document.getElementById('kpi-aberto-chart').innerHTML   = renderDonutSVG(pctRestante, 'var(--color-danger)', 'lg');

  // Widget 2 — quanto já foi pago
  document.getElementById('kpi-pago-value').textContent = formatCurrency(totalPago);
  document.getElementById('kpi-pago-sub').textContent   = `${fmtPct(pctPago)} do total já pago`;
  document.getElementById('kpi-pago-chart').innerHTML   = renderDonutSVG(pctPago, 'var(--color-success)', 'lg');
}

// -----------------------------
// Render (roteador de views)
// -----------------------------
function render() {
  if (colVisEl) colVisEl.classList.toggle('hidden', viewMode !== 'table');

  const container  = document.getElementById('div-container');
  const emptyState = document.getElementById('empty-state');

  if (cachedDividas.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    document.getElementById('empty-title').textContent = 'Nenhuma dívida cadastrada';
    document.getElementById('empty-message').textContent = 'Cadastre sua primeira dívida para acompanhar o progresso de pagamento.';
    return;
  }
  emptyState.classList.add('hidden');

  let html = '';
  for (const bloco of BLOCOS) {
    const items = cachedDividas.filter(bloco.filter);
    let content;
    if (items.length === 0) {
      content = `<p class="bloco-empty">${bloco.emptyMsg}</p>`;
    } else if (viewMode === 'table') {
      content = renderTable(items);
    } else if (viewMode === 'gantt') {
      content = renderGantt(items, { zoom: ganttZoom, statusConfig: STATUS_CONFIG });
    } else {
      content = `<div class="div-cards">${items.map(renderCard).join('')}</div>`;
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
  bindRowClicks();
}

// Bind click nos rows de tabela/gantt para abrir modal de edição
function bindRowClicks() {
  document.querySelectorAll('.divida-tabela-row').forEach((el) => {
    el.addEventListener('click', () => openModalDivida(el.dataset.id));
  });
  document.querySelectorAll('.gantt-row[data-id]').forEach((el) => {
    el.addEventListener('click', () => openModalDivida(el.dataset.id));
  });
}

function renderCard(d) {
  const st      = STATUS_CONFIG[d.status] || STATUS_CONFIG['Ativa'];
  const total   = Number(d.valor_total);
  const pago    = Number(d.valor_pago);
  const restante = Math.max(0, total - pago);
  const pct     = total > 0 ? Math.min(100, (pago / total) * 100) : 0;
  const quitada = d.status === 'Quitada';

  const conta   = cachedContas.find((c) => c.id === d.conta_id);
  const contaNome = conta ? (conta.apelido || conta.nome) : null;

  const proximaParcela = (() => {
    if (!d.regime || !d.n_parcelas || d.status === 'Quitada') return null;
    const pagas = d.parcelas_pagas || 0;
    if (pagas >= d.n_parcelas) return null;
    return buildTabelaDisplay(d)[pagas]?.parcela ?? null;
  })();

  const fmtDate = (iso) => {
    if (!iso) return null;
    const [y, m, day] = iso.split('-');
    return `${day}/${m}/${y}`;
  };

  const vencimento = fmtDate(d.data_vencimento);
  const inicio     = fmtDate(d.data_inicio);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let vencInfo = '';
  if (d.data_vencimento && !quitada) {
    const vencDate = new Date(d.data_vencimento + 'T00:00:00');
    const diff = Math.round((vencDate - hoje) / 86400000);
    if (diff < 0)       vencInfo = `<span class="div-card-venc-alert">Venceu há ${Math.abs(diff)} dia${Math.abs(diff) !== 1 ? 's' : ''}</span>`;
    else if (diff === 0) vencInfo = `<span class="div-card-venc-alert">Vence hoje</span>`;
    else if (diff <= 30) vencInfo = `<span class="div-card-venc-warn">Vence em ${diff} dia${diff !== 1 ? 's' : ''}</span>`;
    else                 vencInfo = `<span class="div-card-venc-ok">Vence em ${vencimento}</span>`;
  }

  return `
    <div class="div-card" data-id="${d.id}">
      <div class="div-card-header">
        <div class="div-card-title-row">
          <span class="div-card-nome">${d.nome}</span>
          <span class="div-card-badge" style="color:${st.color}; background:${st.bg};">${st.label}</span>
          ${quitada && pago < total ? `<span class="tag-parcial" title="Encerrada antes de quitar o valor total">Parcial</span>` : ''}
        </div>
        ${d.credor ? `<span class="div-card-credor">${d.credor}</span>` : ''}
      </div>

      <div class="div-card-charts">
        <div class="div-card-chart-item">
          ${renderDonutSVG(pct, 'var(--color-success)', 'sm')}
          <span class="div-card-chart-label">Pago</span>
        </div>
        <div class="div-card-chart-item">
          ${renderDonutSVG(Math.max(0, 100 - pct), quitada ? 'var(--color-success)' : 'var(--color-danger)', 'sm')}
          <span class="div-card-chart-label">Restante</span>
        </div>
      </div>

      <div class="div-card-values">
        <div class="div-card-value-item">
          <span class="div-card-value-label">Total</span>
          <span class="div-card-value-num">${formatCurrency(total)}</span>
        </div>
        <div class="div-card-value-item">
          <span class="div-card-value-label">Pago</span>
          <span class="div-card-value-num div-card-value-num--success">${formatCurrency(pago)}</span>
        </div>
        <div class="div-card-value-item">
          <span class="div-card-value-label">Restante</span>
          <span class="div-card-value-num ${quitada ? '' : 'div-card-value-num--danger'}">${formatCurrency(restante)}</span>
        </div>
      </div>

      <div class="div-card-meta">
        ${inicio ? `<span class="div-card-meta-item">Início: ${inicio}</span>` : ''}
        ${d.regime && d.n_parcelas && d.data_inicio
          ? `<span class="div-card-meta-item">Término: ${calcTermino(d.data_inicio, d.n_parcelas)}</span>`
          : (vencInfo || (vencimento ? `<span class="div-card-meta-item">Venc.: ${vencimento}</span>` : ''))}
        ${d.juros_percentual ? `<span class="div-card-meta-item">${Number(d.juros_percentual).toFixed(2)}% a.m.</span>` : ''}
        ${d.regime ? `<span class="div-card-meta-item"><span class="div-regime-badge div-regime-badge--${d.regime.toLowerCase()}">${d.regime}</span>${d.n_parcelas ? ` ${d.parcelas_pagas || 0}/${d.n_parcelas}x` : ''}</span>` : ''}
        ${proximaParcela != null ? `<span class="div-card-meta-item div-card-proxima-parcela">Próx. ${formatCurrency(proximaParcela)}</span>` : ''}
        ${contaNome ? `<span class="div-card-meta-item">${contaNome}</span>` : ''}
      </div>

      ${d.observacao ? `<p class="div-card-obs">${d.observacao}</p>` : ''}

      <div class="div-card-actions">
        <button class="btn btn-sm btn-ghost div-btn-pagar" data-id="${d.id}" type="button" title="Registrar pagamento">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
          Pagamento
        </button>
        <button class="btn btn-sm btn-ghost div-btn-historico" data-id="${d.id}" type="button" title="Ver histórico de pagamentos">
          Histórico
        </button>
        ${d.juros_tipo === 'manual_variavel' && !quitada ? `<button class="btn btn-sm btn-ghost div-btn-taxa" data-id="${d.id}" type="button" title="Atualizar taxa manualmente">Taxa</button>` : ''}
        ${d.regime && d.n_parcelas ? `<button class="btn btn-sm btn-ghost div-btn-tabela" data-id="${d.id}" type="button" title="Ver tabela de amortização">Tabela</button>` : ''}
        <button class="btn btn-sm btn-ghost div-btn-editar" data-id="${d.id}" type="button" title="Editar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          Editar
        </button>
      </div>
    </div>
  `;
}

// -----------------------------
// Bind events
// -----------------------------
function bindEvents() {
  // Regime segmented
  document.getElementById('div-regime-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (btn) setRegime(btn.dataset.regime);
  });

  // (Toggle "Tipo de taxa" foi removido — agora unificado em "Origem da taxa")

  // Tipo de juros (manual_fixo / manual_variavel / SELIC / SELIC+% / etc)
  document.getElementById('div-juros-tipo').addEventListener('change', (e) => setJurosTipo(e.target.value));
  document.getElementById('div-juros-spread').addEventListener('input', () => {
    const t = document.getElementById('div-juros-tipo').value;
    if (t.endsWith('_plus')) setJurosTipo(t);
  });

  // Correção monetária
  document.getElementById('div-indice-correcao').addEventListener('change', (e) => setIndiceCorrecao(e.target.value));

  // Fases (Customizado)
  document.getElementById('btn-add-fase').addEventListener('click', addFaseRow);

  // Quando o usuário muda n_parcelas e está em Customizado, expande última fase
  document.getElementById('div-n-parcelas').addEventListener('input', () => {
    const regime = document.querySelector('#div-regime-seg .view-toggle-btn.active')?.dataset.regime;
    if (regime === 'Customizado' && editingFases.length > 0) {
      const n = parseInt(document.getElementById('div-n-parcelas').value) || 0;
      if (n > 0) {
        editingFases[editingFases.length - 1].ate = Math.max(editingFases[editingFases.length - 1].de, n);
        renderFasesList();
      }
    }
    recalcVencimentoFinal();
  });

  // Auto-fill Vencimento final ao mudar 1º vencimento
  document.getElementById('div-data-inicio').addEventListener('input', recalcVencimentoFinal);

  // Detecta edição manual de Vencimento final pra não sobrescrever depois
  document.getElementById('div-data-vencimento').addEventListener('input', (e) => {
    e.target.dataset.userEdited = 'true';
  });

  // Nova dívida
  document.getElementById('btn-nova-divida').addEventListener('click', () => openModalDivida(null));
  document.querySelector('[data-trigger-nova]')?.addEventListener('click', () => openModalDivida(null));

  // Salvar dívida
  document.getElementById('form-divida').addEventListener('submit', saveDivida);

  // Excluir / Arquivar / Restaurar
  document.getElementById('btn-deletar-divida').addEventListener('click', async () => {
    if (!editingId) return;
    const acao = document.getElementById('btn-deletar-divida').dataset.acao;

    // ── Restaurar (dívida arquivada → volta para Ativa + recria compromisso) ──
    if (acao === 'restaurar') {
      pendingDeleteId = editingId; // reuso do estado pra ação
      const d = cachedDividas.find((x) => x.id === editingId);
      const nPagamentos = cachedDividaHistorico.filter((h) => h.divida_id === editingId).length;
      const titleEl = document.getElementById('modal-confirmar')?.querySelector('.modal-title');
      const btnEl   = document.getElementById('btn-confirmar-excluir');
      const msgEl   = document.getElementById('confirmar-msg');
      const nome    = escapeHtml(d?.nome || '');
      if (titleEl) titleEl.textContent = 'Restaurar dívida';
      if (btnEl) {
        btnEl.textContent = 'Restaurar';
        btnEl.classList.remove('btn-danger', 'btn-warning');
        btnEl.classList.add('btn-success');
        btnEl.dataset.acao = 'restaurar';
      }
      msgEl.innerHTML = `
        <p style="margin-bottom: var(--space-3);">A dívida <strong>"${nome}"</strong> está arquivada. Restaurar irá colocá-la de volta no fluxo ativo.</p>

        <div class="confirm-section confirm-section--success">
          <h4 class="confirm-section-title">↻ O que vai acontecer</h4>
          <ul class="confirm-list">
            <li>Status muda de <strong>Arquivada</strong> → <strong>Ativa</strong></li>
            <li>A dívida volta para "${nPagamentos > 0 ? 'Em progresso' : 'Por começar'}"</li>
            <li>O <strong>compromisso (subcategoria) é recriado automaticamente</strong> em Compromissos → Dívidas, com mesmo valor base e dia de vencimento</li>
            <li>Pagamentos, transações vinculadas e histórico de taxa permanecem intactos</li>
          </ul>
        </div>
      `;
      closeModal('modal-divida');
      openModal('modal-confirmar');
      return;
    }

    pendingDeleteId = editingId;
    const d = cachedDividas.find((x) => x.id === editingId);
    const nPagamentos = cachedDividaHistorico.filter((h) => h.divida_id === editingId).length;
    const nTaxaHist   = cachedTaxaHistorico.filter((h) => h.divida_id === editingId).length;
    const { count: subCount }   = await supabase
      .from('subcategorias')
      .select('id', { count: 'exact', head: true })
      .eq('divida_id', editingId);
    const { count: transCount } = await supabase
      .from('transacoes')
      .select('id', { count: 'exact', head: true })
      .eq('divida_id', editingId);

    const titleEl = document.getElementById('modal-confirmar')?.querySelector('.modal-title');
    const btnEl   = document.getElementById('btn-confirmar-excluir');
    const msgEl   = document.getElementById('confirmar-msg');
    const nome    = escapeHtml(d?.nome || '');
    const plural  = (n) => (n === 1 ? '' : 's');
    const item    = (n, sing, pluralForm) => `${n} ${n === 1 ? sing : (pluralForm || sing + 's')}`;

    if (nPagamentos > 0) {
      // ─── COM PAGAMENTOS: arquivar (soft delete) ──────────────────
      if (titleEl) titleEl.textContent = 'Arquivar dívida';
      if (btnEl) {
        btnEl.textContent = 'Arquivar';
        btnEl.classList.remove('btn-danger', 'btn-success');
        btnEl.classList.add('btn-warning');
        btnEl.dataset.acao = 'arquivar';
      }

      const deletados = [];
      if (subCount > 0) deletados.push(`<li>${item(subCount, 'compromisso vinculado', 'compromissos vinculados')} (subcategoria)</li>`);

      const mantidos = [];
      mantidos.push(`<li>A própria <strong>dívida</strong> (movida para o grupo "Terminado" com status <strong>Arquivada</strong>)</li>`);
      mantidos.push(`<li>${item(nPagamentos, 'pagamento registrado', 'pagamentos registrados')} no histórico</li>`);
      if (transCount > 0) mantidos.push(`<li>${item(transCount, 'transação no extrato', 'transações no extrato')} das contas (com vínculo "→ ${nome}" preservado)</li>`);
      if (nTaxaHist > 0)  mantidos.push(`<li>${item(nTaxaHist, 'registro de mudança de taxa', 'registros de mudanças de taxa')}</li>`);

      msgEl.innerHTML = `
        <p style="margin-bottom: var(--space-3);">A dívida <strong>"${nome}"</strong> tem <strong>${item(nPagamentos, 'pagamento registrado', 'pagamentos registrados')}</strong>. Por isso ela será <strong>arquivada</strong> em vez de excluída.</p>

        ${deletados.length ? `
          <div class="confirm-section confirm-section--danger">
            <h4 class="confirm-section-title">🗑️ O que será removido</h4>
            <ul class="confirm-list">${deletados.join('')}</ul>
          </div>
        ` : ''}

        <div class="confirm-section confirm-section--info">
          <h4 class="confirm-section-title">📦 O que será mantido</h4>
          <ul class="confirm-list">${mantidos.join('')}</ul>
        </div>

        <div class="confirm-section confirm-section--success">
          <h4 class="confirm-section-title">↻ Se você reativar depois</h4>
          <ul class="confirm-list">
            <li>Status volta para <strong>Ativa</strong> (ou outro que você escolher)</li>
            <li>A dívida volta para "Em progresso" ou "Por começar"</li>
            <li>O <strong>compromisso é recriado automaticamente</strong> ao salvar</li>
            <li>Pagamentos, transações e histórico de taxa permanecem intactos</li>
          </ul>
        </div>
      `;
    } else {
      // ─── SEM PAGAMENTOS: hard delete ─────────────────────────────
      if (titleEl) titleEl.textContent = 'Excluir dívida';
      if (btnEl) {
        btnEl.textContent = 'Excluir';
        btnEl.classList.remove('btn-warning', 'btn-success');
        btnEl.classList.add('btn-danger');
        btnEl.dataset.acao = 'excluir';
      }

      const itens = [`<li>A própria <strong>dívida</strong> "${nome}"</li>`];
      if (subCount > 0)   itens.push(`<li>${item(subCount, 'compromisso vinculado', 'compromissos vinculados')} (subcategoria)</li>`);
      if (nTaxaHist > 0)  itens.push(`<li>${item(nTaxaHist, 'registro de mudança de taxa', 'registros de mudanças de taxa')}</li>`);

      msgEl.innerHTML = `
        <p style="margin-bottom: var(--space-3);">Como esta dívida <strong>não tem pagamentos registrados</strong>, ela será excluída permanentemente.</p>

        <div class="confirm-section confirm-section--danger">
          <h4 class="confirm-section-title">🗑️ O que será removido</h4>
          <ul class="confirm-list">${itens.join('')}</ul>
        </div>

        <p class="confirm-irreversible">⚠️ Esta ação não pode ser desfeita.</p>
      `;
    }

    closeModal('modal-divida');
    openModal('modal-confirmar');
  });
  document.getElementById('btn-confirmar-excluir').addEventListener('click', confirmarExcluir);

  // View toggle
  document.getElementById('view-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    document.querySelectorAll('#view-toggle .view-toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    viewMode = btn.dataset.view;
    render();
  });

  // Delegação: botões pagar/editar/histórico nos cards
  document.getElementById('div-container').addEventListener('click', (e) => {
    const btnPagar     = e.target.closest('.div-btn-pagar');
    const btnEditar    = e.target.closest('.div-btn-editar');
    const btnHistorico = e.target.closest('.div-btn-historico');
    const btnTabela    = e.target.closest('.div-btn-tabela');
    const btnTaxa      = e.target.closest('.div-btn-taxa');
    if (btnPagar) {
      const dp = cachedDividas.find((x) => x.id === btnPagar.dataset.id);
      if (dp?.regime && dp?.n_parcelas) openPagarParcelaModal(dp.id);
      else openHistoricoDividaModal(btnPagar.dataset.id);
    }
    if (btnEditar)    openModalDivida(btnEditar.dataset.id);
    if (btnHistorico) openHistoricoViewDivida(btnHistorico.dataset.id);
    if (btnTabela)    openTabelaAmort(btnTabela.dataset.id);
    if (btnTaxa)      openAtualizarTaxaModal(btnTaxa.dataset.id);
  });

  // Atualizar taxa
  document.getElementById('btn-confirmar-atualizar-taxa').addEventListener('click', saveAtualizarTaxa);

  // Pagar parcela
  document.getElementById('btn-pagar-menos').addEventListener('click', () => {
    if (pagarParcelaN > 1) {
      pagarParcelaN--;
      pagarDescEditado = false;       // re-sugere desconto
      pagarValorRealEditado = false;  // re-sugere valor real
      renderPagarCard();
    }
  });
  document.getElementById('btn-pagar-mais').addEventListener('click', () => {
    const dp = cachedDividas.find((x) => x.id === pagarParcelaId);
    if (!dp) return;
    const max = (dp.n_parcelas || 1) - (dp.parcelas_pagas || 0);
    if (pagarParcelaN < max) {
      pagarParcelaN++;
      pagarDescEditado = false;
      pagarValorRealEditado = false;
      renderPagarCard();
    }
  });
  document.getElementById('pagar-desc-input').addEventListener('input', () => {
    pagarDescEditado = true;
    renderPagarCard();
  });
  document.getElementById('pagar-valor-real').addEventListener('input', () => {
    pagarValorRealEditado = true;
    renderPagarCard();
  });
  // (toggle "Registrar em Transações" foi removido — agora é compulsório)
  document.getElementById('btn-confirmar-pagar-parcela').addEventListener('click', saveParcela);

  document.getElementById('btn-salvar-hist-divida').addEventListener('click', saveHistoricoDivida);

  document.getElementById('hist-divida-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    const mode = btn.dataset.histSeg;
    document.querySelectorAll('#hist-divida-seg .view-toggle-btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.histSeg === mode));
    document.getElementById('hist-divida-total-panel').classList.toggle('hidden', mode !== 'total');
    document.getElementById('hist-divida-extrato-panel').classList.toggle('hidden', mode !== 'extrato');
  });

  document.getElementById('btn-hist-divida-add-row').addEventListener('click', () => {
    let listEl = document.querySelector('#hist-divida-extrato-list .hist-extrato-list');
    if (!listEl) {
      listEl = document.createElement('div');
      listEl.className = 'hist-extrato-list';
      document.getElementById('hist-divida-extrato-list').appendChild(listEl);
    }
    const row = makeHistRow();
    listEl.appendChild(row);
    row.querySelector('.hist-row-data')?.focus();
  });

  // Zoom do Gantt — delegado em document (sobrevive a re-renders)
  document.addEventListener('click', (e) => {
    const zoomBtn = e.target.closest('[data-gantt-zoom]');
    if (zoomBtn) { ganttZoom = zoomBtn.dataset.ganttZoom; if (viewMode === 'gantt') render(); }

    const closeBtn = e.target.closest('[data-close-modal]');
    if (closeBtn) closeModal(closeBtn.dataset.closeModal);
  });
}

// -----------------------------
// Modal: nova / editar dívida
// -----------------------------
function openModalDivida(id) {
  editingId = id || null;
  const d   = id ? cachedDividas.find((x) => x.id === id) : null;

  document.getElementById('modal-divida-title').textContent = d ? 'Editar dívida' : 'Nova dívida';

  // Botão de exclusão muda comportamento conforme estado da dívida:
  // - Nova dívida (sem id) → escondido
  // - Arquivada → "Restaurar" (verde)
  // - Com pagamentos → "Arquivar" (amarelo)
  // - Sem pagamentos → "Excluir" (vermelho)
  const delBtn = document.getElementById('btn-deletar-divida');
  delBtn.classList.toggle('hidden', !d);
  delBtn.classList.remove('btn-danger', 'btn-warning', 'btn-success');
  if (d) {
    if (d.status === 'Arquivada') {
      delBtn.textContent = 'Restaurar';
      delBtn.classList.add('btn-success');
      delBtn.dataset.acao = 'restaurar';
    } else {
      const temPagamento = cachedDividaHistorico.some((h) => h.divida_id === d.id);
      if (temPagamento) {
        delBtn.textContent = 'Arquivar';
        delBtn.classList.add('btn-warning');
        delBtn.dataset.acao = 'arquivar';
      } else {
        delBtn.textContent = 'Excluir';
        delBtn.classList.add('btn-danger');
        delBtn.dataset.acao = 'excluir';
      }
    }
  }

  // Preenche campos
  document.getElementById('div-nome').value            = d?.nome             ?? '';
  writeDecimal('div-valor-total', d?.valor_total      ?? null, 2);
  writeDecimal('div-juros',       d?.juros_percentual ?? null, 4);
  writeDecimal('div-juros-spread',d?.juros_spread     ?? null, 4);

  // Carrega fases ANTES de chamar setRegime (para evitar criar fase default)
  editingFases = Array.isArray(d?.fases) ? d.fases.map((f) => ({ de: f.de, ate: f.ate, valor: Number(f.valor) })) : [];
  setRegime(d?.regime ?? '');
  document.getElementById('div-n-parcelas').value      = d?.n_parcelas       ?? '';
  if (d?.regime === 'Customizado') renderFasesList();

  // taxa_referencia agora é select. Para valores antigos (texto livre), adiciona
  // uma option temporária marcada como "(legado)" para preservar o que estava salvo.
  const refEl  = document.getElementById('div-taxa-referencia');
  const refVal = d?.taxa_referencia ?? '';
  // Limpa options antigas marcadas como legado (de aberturas anteriores)
  Array.from(refEl.options).forEach((o) => { if (o.dataset.legacy) o.remove(); });
  if (refVal && !Array.from(refEl.options).some((o) => o.value === refVal)) {
    const opt = document.createElement('option');
    opt.value = refVal;
    opt.textContent = `${refVal} (legado)`;
    opt.dataset.legacy = 'true';
    refEl.appendChild(opt);
  }
  refEl.value = refVal;
  setIndiceCorrecao(d?.indice_correcao ?? 'nenhum');
  writeDecimal('div-correcao-taxa', d?.correcao_taxa ?? null, 4);

  // Tipo de juros (await dispara fetch — mas tudo bem, é async)
  // Migra valor legado 'manual' caso ainda exista localmente em algum cache
  const jurosT = d?.juros_tipo === 'manual' ? 'manual_fixo' : (d?.juros_tipo ?? 'manual_fixo');
  setJurosTipo(jurosT);
  document.getElementById('div-data-inicio').value     = d?.data_inicio      ?? new Date().toISOString().slice(0, 10);
  const vencEl = document.getElementById('div-data-vencimento');
  vencEl.value = d?.data_vencimento ?? '';
  // Marca como "editado pelo usuário" se já tinha valor salvo (não sobrescreve)
  vencEl.dataset.userEdited = d?.data_vencimento ? 'true' : 'false';
  document.getElementById('div-status').value          = d?.status           ?? 'Ativa';
  document.getElementById('div-conta').value           = d?.conta_id         ?? '';

  // Credor agora é contato-picker — vincula ao contato_id da dívida
  initContatoPickerOnce();
  credorPicker?.setValue(d?.contato_id || '');
  // Se a dívida tem credor texto mas não tem contato_id (ex: dívida antiga), mostra o texto no input
  if (!d?.contato_id && d?.credor) {
    const inputEl = document.querySelector('#div-credor-search');
    if (inputEl) inputEl.value = d.credor;
  }

  document.getElementById('div-observacao').value      = d?.observacao       ?? '';

  openModal('modal-divida');
}

// -----------------------------
// Salvar dívida
// -----------------------------
async function saveDivida(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-salvar-divida');

  const nome            = document.getElementById('div-nome').value.trim();

  // Credor agora é contato-picker — credor (texto) é derivado do contato selecionado;
  // se o usuário só digitou um nome livre sem escolher, salvamos o texto e contato_id = null.
  const credorContatoId = credorPicker?.getValue() || null;
  const credorTexto     = (document.getElementById('div-credor-search')?.value || '').trim();
  let credor;
  if (credorContatoId) {
    const ct = cachedContatos.find((c) => c.id === credorContatoId);
    credor = ct?.nome || credorTexto || null;
  } else {
    credor = credorTexto || null;
  }

  const valor_total     = readDecimal('div-valor-total');
  const juros_tipo      = document.getElementById('div-juros-tipo').value || 'manual_fixo';
  const juros_percentual = readDecimal('div-juros');
  const juros_spread    = juros_tipo.endsWith('_plus') ? readDecimal('div-juros-spread') : null;
  // taxa_tipo é derivado de juros_tipo (mantido por retrocompat)
  const taxa_tipo       = juros_tipo === 'manual_fixo' ? 'fixa' : 'variavel';
  const regime          = document.querySelector('#div-regime-seg .view-toggle-btn.active')?.dataset.regime || null;
  const n_parcelas      = regime ? (parseInt(document.getElementById('div-n-parcelas').value) || null) : null;
  // Índice de referência só faz sentido para Manual variável
  const taxa_referencia = juros_tipo === 'manual_variavel'
    ? (document.getElementById('div-taxa-referencia').value.trim() || null)
    : null;
  const indice_correcao = document.getElementById('div-indice-correcao').value || 'nenhum';
  const correcao_taxa   = indice_correcao === 'fixo' ? readDecimal('div-correcao-taxa') : null;
  const data_inicio     = document.getElementById('div-data-inicio').value;
  const data_vencimento = document.getElementById('div-data-vencimento').value || null;
  const status          = document.getElementById('div-status').value;
  const conta_id        = document.getElementById('div-conta').value || null;
  // contato_id agora vem do credor (Cliente/Fornecedor foi removido)
  const contato_id      = credorContatoId;
  const observacao      = document.getElementById('div-observacao').value.trim() || null;

  if (!nome)              { showToast(t('dividas.validacao.nome_obrigatorio', 'Informe o nome da dívida'), 'error'); return; }
  if (!valor_total || isNaN(valor_total) || valor_total <= 0) {
    showToast(t('dividas.validacao.valor_total', 'Informe um valor total válido'), 'error'); return;
  }
  if (!data_inicio)       { showToast(t('dividas.validacao.data_inicio', 'Informe a data de início'), 'error'); return; }

  // Regime é exigido sempre que houver sinais de dívida estruturada:
  // parcelas preenchidas, juros indexado/variável, correção monetária.
  const nParcelasRaw = document.getElementById('div-n-parcelas').value;
  const motivosRegimeObrigatorio = [];
  if (nParcelasRaw && parseInt(nParcelasRaw) > 0)      motivosRegimeObrigatorio.push('número de parcelas informado');
  if (juros_tipo && juros_tipo !== 'manual_fixo')      motivosRegimeObrigatorio.push(`origem da taxa "${juros_tipo.replace('manual_variavel', 'Manual variável').replace('_plus', ' + spread').toUpperCase()}"`);
  if (indice_correcao && indice_correcao !== 'nenhum') motivosRegimeObrigatorio.push(`correção monetária (${indice_correcao})`);

  if (!regime && motivosRegimeObrigatorio.length > 0) {
    showToast(
      `Selecione o regime (SAC / Price / Customizado) — exigido por: ${motivosRegimeObrigatorio.join(', ')}.`,
      'error', 8000,
    );
    return;
  }
  if (regime && !n_parcelas) {
    showToast(
      t('dividas.validacao.regime_sem_parcelas', 'Regime selecionado — informe o número de parcelas.').replace('selecionado', `"${regime}" selecionado`),
      'error', 6000,
    );
    return;
  }

  // Validar fases se Customizado
  let fases = null;
  if (regime === 'Customizado') {
    if (!n_parcelas) { showToast(t('dividas.validacao.parcelas_obrigatorias', 'Informe o número de parcelas'), 'error'); return; }
    const erro = validarFases(editingFases, n_parcelas);
    if (erro) { showToast(erro, 'error'); return; }
    fases = editingFases.map((f) => ({ de: f.de, ate: f.ate, valor: Number(f.valor) }));
  }

  btn.disabled = true;
  btn.textContent = 'Salvando…';

  const user = await getCurrentUser();
  const payload = {
    nome, credor, valor_total,
    juros_tipo, juros_percentual, juros_spread,
    regime: regime || null, n_parcelas, fases,
    taxa_tipo, taxa_referencia,
    indice_correcao, correcao_taxa,
    data_inicio, data_vencimento, status, conta_id, contato_id, observacao,
    user_id: user.id,
  };

  let error;
  let savedId = editingId;
  if (editingId) {
    ({ error } = await supabase.from('dividas').update(payload).eq('id', editingId));
  } else {
    const ins = await supabase.from('dividas').insert({ ...payload, valor_pago: 0 }).select('id').single();
    error = ins.error;
    savedId = ins.data?.id;
  }

  if (error) {
    btn.disabled = false; btn.textContent = 'Salvar';
    showToast(`${t('dividas.toast.erro_salvar', 'Erro ao salvar')}: ${error.message}`, 'error', 8000); return;
  }

  // Auto-criar subcategoria se há regime + n_parcelas e ainda não existe vínculo
  if (savedId && regime && n_parcelas) {
    try { await ensureSubcategoriaForDivida(savedId, payload); }
    catch (err) { console.warn('[ensureSubcategoria]', err); }
  }

  btn.disabled = false;
  btn.textContent = 'Salvar';

  showToast(editingId
    ? t('dividas.toast.atualizada', 'Dívida atualizada')
    : t('dividas.toast.criada',     'Dívida cadastrada'),
    'success');
  closeModal('modal-divida');
  await loadAll();
}

// -----------------------------
// Auto-criar subcategoria vinculada à dívida
// -----------------------------
async function ensureSubcategoriaForDivida(dividaId, dvd) {
  // Já existe subcategoria vinculada a esta dívida?
  const { data: existing, error: existErr } = await supabase.from('subcategorias')
    .select('id')
    .eq('divida_id', dividaId)
    .limit(1);
  if (existErr) {
    showToast('Aviso: falha ao checar compromisso existente — ' + existErr.message, 'error', 8000);
    return;
  }
  if (existing && existing.length > 0) return; // já criada

  // Busca categoria "Dívidas" do usuário — NÃO cria, ela já vem por padrão no sistema
  const { data: cats, error: catSelErr } = await supabase.from('categorias')
    .select('id, nome')
    .eq('user_id', dvd.user_id);
  if (catSelErr) {
    showToast('Aviso: falha ao buscar categoria Dívidas — ' + catSelErr.message, 'error', 8000);
    return;
  }

  const catDividas = (cats || []).find((c) =>
    c.nome && (c.nome.toLowerCase() === 'dívidas' || c.nome.toLowerCase() === 'dividas')
  );
  if (!catDividas) {
    showToast(t('dividas.toast.categoria_nao_encontrada', 'Categoria "Dívidas" não encontrada — vá em Configurações para criá-la antes.'), 'error', 8000);
    return;
  }

  // Calcula valor base estimado da parcela
  const taxa = Number(dvd.juros_percentual || 0) / 100;
  const tabela = gerarTabela(dvd.regime, dvd.valor_total, taxa, dvd.n_parcelas, dvd.fases);
  const valorBase = tabela.length ? Number(tabela[0].parcela.toFixed(2)) : 0;

  // Dia de vencimento = dia da data_inicio
  const [, , diaStr] = dvd.data_inicio.split('-');
  const vencDia = parseInt(diaStr) || 1;

  const { error: insErr } = await supabase.from('subcategorias').insert({
    user_id:        dvd.user_id,
    nome:           dvd.nome,
    tipo:           'Despesa',
    categoria_id:   catDividas.id,
    conta_id:       dvd.conta_id,
    contato_id:     dvd.contato_id,
    divida_id:      dividaId,
    tipo_pagamento: 'Boleto',
    vencimento_dia: vencDia,
    periodo:        'Mensal',
    iniciado_em:    dvd.data_inicio,
    moeda:          'BRL',
    valor_base:     valorBase,
    status:         'ativa',
    descricao:      `Auto-criado para a dívida "${dvd.nome}"`,
  });
  if (insErr) {
    showToast('Falha ao criar compromisso vinculado: ' + insErr.message, 'error', 10000);
    console.error('[ensureSubcategoria] insert', insErr);
  }
}

// -----------------------------
// Modal: visualizar histórico (read-only)
// -----------------------------
function openHistoricoViewDivida(id) {
  const d = cachedDividas.find((x) => x.id === id);
  if (!d) return;

  document.getElementById('hist-view-divida-title').textContent = `Histórico — ${d.nome}`;

  const entradas  = cachedDividaHistorico.filter((h) => h.divida_id === id).sort((a, b) => b.data.localeCompare(a.data));
  const taxaHist  = cachedTaxaHistorico.filter((h) => h.divida_id === id).sort((a, b) => b.data_vigencia.localeCompare(a.data_vigencia));
  const hasVariavel = d.juros_tipo === 'manual_variavel' ||
                      (d.juros_tipo && d.juros_tipo !== 'manual_fixo' && d.juros_tipo !== 'manual');
  const fmtDate = (iso) => { const [y, m, day] = iso.split('-'); return `${day}/${m}/${y}`; };
  const content = document.getElementById('hist-view-divida-content');

  const pagamentosHtml = (() => {
    if (entradas.length === 0) return `
      <div style="text-align:center;padding:var(--space-6);color:var(--color-text-muted);font-size:var(--fs-sm);">
        Nenhum pagamento registrado ainda.<br>Use <strong>Pagamento</strong> para registrar.
      </div>`;
    const rows = entradas.map((h) => {
      const venc = h.n_parcela ? calcVencimentoParcela(d.data_inicio, h.n_parcela) : '';
      return `
      <div class="proj-hist-row hist-row-divida">
        <span class="hist-divida-dates">
          ${venc ? `<span class="hist-divida-venc"><span class="hist-divida-date-label">Venc.</span> ${venc}</span>` : ''}
          <span class="hist-divida-pago"><span class="hist-divida-date-label">Pago em</span> ${fmtDate(h.data)}</span>
        </span>
        <span class="proj-hist-name">${escapeHtml(h.descricao || 'Pagamento')}${h.n_parcela && h.valor_amortizacao
          ? `<span class="hist-breakdown"> · amort. ${formatCurrency(h.valor_amortizacao)} + juros ${formatCurrency(h.valor_juros)}${h.valor_correcao ? ` ${Number(h.valor_correcao) >= 0 ? '+' : ''} corr. ${formatCurrency(h.valor_correcao)}` : ''}${h.desconto_antecipacao ? ` − desc. ${formatCurrency(h.desconto_antecipacao)}` : ''}</span>`
          : ''}</span>
        <span class="proj-hist-value">${formatCurrency(Number(h.valor))}</span>
      </div>`;
    }).join('');
    const total = entradas.reduce((s, h) => s + Number(h.valor), 0);
    return `<div class="proj-hist-list">${rows}</div>
      <div style="display:flex;justify-content:flex-end;padding:var(--space-3) var(--space-4);font-weight:var(--fw-bold);font-size:var(--fs-sm);border-top:1px solid var(--color-border);margin-top:var(--space-1);">
        Total pago: ${formatCurrency(total)}</div>`;
  })();

  const taxasHtml = (() => {
    if (taxaHist.length === 0) return `
      <div style="text-align:center;padding:var(--space-6);color:var(--color-text-muted);font-size:var(--fs-sm);">
        Nenhuma atualização de taxa registrada ainda.
      </div>`;
    return `<div class="proj-hist-list">${taxaHist.map((h) => `
      <div class="proj-hist-row">
        <span class="proj-hist-date">${fmtDate(h.data_vigencia)}</span>
        <span class="proj-hist-name">
          ${h.taxa_anterior != null ? `${Number(h.taxa_anterior).toFixed(4)}% → ` : ''}
          <strong>${Number(h.taxa_nova).toFixed(4)}% a.m.</strong>
          ${h.motivo ? `<span class="hist-breakdown"> · ${escapeHtml(h.motivo)}</span>` : ''}
        </span>
      </div>`).join('')}</div>`;
  })();

  if (hasVariavel) {
    content.innerHTML = `
      <div class="hist-view-tabs">
        <button type="button" class="hist-view-tab active" data-tab="pagamentos">Pagamentos</button>
        <button type="button" class="hist-view-tab" data-tab="taxas">Taxas${taxaHist.length ? ` (${taxaHist.length})` : ''}</button>
      </div>
      <div id="hist-tab-pagamentos">${pagamentosHtml}</div>
      <div id="hist-tab-taxas" class="hidden">${taxasHtml}</div>`;
    content.querySelectorAll('.hist-view-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        content.querySelectorAll('.hist-view-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.getElementById('hist-tab-pagamentos').classList.toggle('hidden', tab !== 'pagamentos');
        document.getElementById('hist-tab-taxas').classList.toggle('hidden', tab !== 'taxas');
      });
    });
  } else {
    content.innerHTML = pagamentosHtml;
  }

  openModal('modal-historico-view-divida');
}

// -----------------------------
// Excluir
// -----------------------------
async function confirmarExcluir() {
  if (!pendingDeleteId) return;

  const acao = document.getElementById('btn-confirmar-excluir')?.dataset.acao;
  const d    = cachedDividas.find((x) => x.id === pendingDeleteId);

  // ─── RESTAURAR (Arquivada → Ativa + recria compromisso) ──────────
  if (acao === 'restaurar') {
    const { error: updErr } = await supabase.from('dividas')
      .update({ status: 'Ativa' })
      .eq('id', pendingDeleteId);
    if (updErr) { showToast(`${t('dividas.toast.erro_restaurar', 'Erro ao restaurar')}: ${updErr.message}`, 'error', 8000); return; }

    // Recria a subcategoria (ensureSubcategoriaForDivida pula se já existir)
    if (d && d.regime && d.n_parcelas) {
      // Atualiza status no payload pra ensureSubcategoria criar com dados corretos
      const dvdAtualizada = { ...d, status: 'Ativa' };
      try { await ensureSubcategoriaForDivida(pendingDeleteId, dvdAtualizada); }
      catch (err) { console.warn('[restaurar] ensureSubcategoria', err); }
    }

    showToast(
      `Dívida "${d?.nome || ''}" restaurada — compromisso recriado em Compromissos → Dívidas.`,
      'success', 6000,
    );
    closeModal('modal-confirmar');
    pendingDeleteId = null;
    await loadAll();
    return;
  }

  const nPagamentos = cachedDividaHistorico.filter((h) => h.divida_id === pendingDeleteId).length;

  if (nPagamentos > 0) {
    // SOFT DELETE — arquiva, remove compromisso, mantém transações com vínculo
    const { error: updErr } = await supabase.from('dividas')
      .update({ status: 'Arquivada' })
      .eq('id', pendingDeleteId);
    if (updErr) { showToast(`${t('dividas.toast.erro_arquivar', 'Erro ao arquivar')}: ${updErr.message}`, 'error', 8000); return; }

    const { error: subErr } = await supabase.from('subcategorias')
      .delete()
      .eq('divida_id', pendingDeleteId);
    if (subErr) console.warn('[arquivar] falha ao remover subcategoria', subErr);

    showToast(t('dividas.toast.arquivada', 'Dívida arquivada (movida para Terminado)'), 'success');
  } else {
    // HARD DELETE — remove tudo (CASCADE)
    const { error } = await supabase.from('dividas').delete().eq('id', pendingDeleteId);
    if (error) { showToast(`${t('dividas.toast.erro_excluir', 'Erro ao excluir')}: ${error.message}`, 'error', 8000); return; }
    showToast(t('dividas.toast.excluida', 'Dívida excluída'), 'success');
  }

  closeModal('modal-confirmar');
  pendingDeleteId = null;
  await loadAll();
}

// =============================================================
// Pagar parcela
// =============================================================
function openPagarParcelaModal(id) {
  const d = cachedDividas.find((x) => x.id === id);
  if (!d || !d.regime || !d.n_parcelas) return openHistoricoDividaModal(id);

  const pagas = d.parcelas_pagas || 0;
  if (pagas >= d.n_parcelas) { showToast(t('dividas.toast.todas_parcelas_pagas', 'Todas as parcelas já foram pagas'), 'info'); return; }

  pagarParcelaId = id;
  pagarParcelaN  = 1;
  pagarValorRealEditado = false;
  pagarDescEditado = false;

  document.getElementById('pagar-parcela-title').textContent = `Pagamento — ${d.nome}`;
  document.getElementById('pagar-parcela-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('pagar-desc-input').value   = '';
  document.getElementById('pagar-valor-real').value   = '';
  document.getElementById('pagar-valor-real-delta').textContent = '';

  // Conta select (obrigatório — pré-seleciona a conta vinculada à dívida se houver)
  const contaSelect = document.getElementById('pagar-transacao-conta');
  contaSelect.innerHTML = '<option value="">Selecionar conta…</option>' +
    cachedContas.map((c) => `<option value="${c.id}">${c.apelido || c.nome}</option>`).join('');
  if (d.conta_id) contaSelect.value = d.conta_id;

  renderPagarCard();
  openModal('modal-pagar-parcela');
}

function renderPagarCard() {
  const d = cachedDividas.find((x) => x.id === pagarParcelaId);
  if (!d) return;

  const pagas     = d.parcelas_pagas || 0;
  const n         = d.n_parcelas;
  const principal = Number(d.valor_total);
  const tabela    = buildTabelaDisplay(d);
  const maxN      = n - pagas;

  document.getElementById('btn-pagar-menos').disabled = pagarParcelaN <= 1;
  document.getElementById('btn-pagar-mais').disabled  = pagarParcelaN >= maxN;
  document.getElementById('pagar-parcela-n-display').textContent = pagarParcelaN;

  const rows = tabela.slice(pagas, pagas + pagarParcelaN);
  if (!rows.length) return;

  // Auto-cálculo do desconto de antecipação:
  // parcela atual (rows[0]) não tem desconto; demais têm desconto = juros teóricos
  const descontoSugerido = rows.slice(1).reduce((s, r) => s + r.juros, 0);
  // Sobrescreve apenas se o usuário não editou manualmente neste ciclo
  if (!pagarDescEditado) {
    writeDecimal('pagar-desc-input', descontoSugerido > 0 ? descontoSugerido : null, 2);
  }
  const desconto = readDecimal('pagar-desc-input') || 0;

  const firstN    = rows[0].n;
  const lastN     = rows[rows.length - 1].n;
  const label     = rows.length === 1 ? `Parcela ${firstN} de ${n}` : `Parcelas ${firstN}–${lastN} de ${n}`;
  const saldoDev  = pagas > 0 ? (tabela[pagas - 1]?.saldo_final ?? principal) : principal;

  const badge     = `<span class="div-regime-badge div-regime-badge--${d.regime.toLowerCase()}">${d.regime}</span>`;
  document.getElementById('pagar-parcela-label').innerHTML = `${badge} <span>${label}</span>`;
  document.getElementById('pagar-parcela-saldo').textContent = `Saldo devedor: ${formatCurrency(saldoDev)}`;

  // Decompõe parcela teórica em amortização base + juros base + correção
  // Para regimes Customizado/Price/SAC com correção, a tabela já vem corrigida — separamos
  // recalculando o "base" sem correção:
  const taxa = Number(d.juros_percentual || 0) / 100;
  const corrMensal = corrMensalDecimal(d);
  const tabelaBase = gerarTabela(d.regime, principal, taxa, n, d.fases || null);
  const rowsBase   = tabelaBase.slice(pagas, pagas + pagarParcelaN);

  const totalAmort = rowsBase.reduce((s, r) => s + r.amortizacao, 0);
  const totalJuros = rowsBase.reduce((s, r) => s + r.juros, 0);
  const totalCorr  = corrMensal
    ? rows.reduce((s, r, i) => s + (r.parcela - (rowsBase[i]?.parcela || 0)), 0)
    : 0;
  const totalPmt   = totalAmort + Math.max(0, totalJuros - desconto) + totalCorr;

  document.getElementById('pagar-parcela-amort-val').textContent = formatCurrency(totalAmort);
  document.getElementById('pagar-parcela-juros-val').textContent = formatCurrency(totalJuros);
  document.getElementById('pagar-parcela-total-val').textContent = formatCurrency(totalPmt);

  const corrRow = document.getElementById('pagar-correcao-display-row');
  corrRow.classList.toggle('hidden', Math.abs(totalCorr) < 0.01);
  if (Math.abs(totalCorr) >= 0.01) {
    document.getElementById('pagar-parcela-correcao-val').textContent = `+ ${formatCurrency(totalCorr)}`;
  }

  const descontoRow = document.getElementById('pagar-desconto-display-row');
  descontoRow.classList.toggle('hidden', desconto <= 0);
  if (desconto > 0) document.getElementById('pagar-parcela-desconto-val').textContent = `− ${formatCurrency(desconto)}`;

  // Auto-fill valor real (= total sugerido) se usuário não editou
  const valorRealInput = document.getElementById('pagar-valor-real');
  if (!pagarValorRealEditado) {
    writeDecimal('pagar-valor-real', totalPmt, 2);
    document.getElementById('pagar-valor-real-delta').textContent = '';
  } else {
    const real  = readDecimal('pagar-valor-real') || 0;
    const delta = real - totalPmt;
    const deltaEl = document.getElementById('pagar-valor-real-delta');
    if (Math.abs(delta) < 0.01) {
      deltaEl.textContent = '';
    } else if (delta > 0) {
      deltaEl.textContent = `Diferença +${formatCurrency(delta)} → registrada como correção monetária`;
      deltaEl.style.color = 'var(--color-warning)';
    } else {
      deltaEl.textContent = `Diferença −${formatCurrency(Math.abs(delta))} → registrada como desconto adicional`;
      deltaEl.style.color = 'var(--color-success)';
    }
  }
}

async function saveParcela() {
  const d = cachedDividas.find((x) => x.id === pagarParcelaId);
  if (!d) return;

  const data       = document.getElementById('pagar-parcela-data').value;
  const desconto   = readDecimal('pagar-desc-input') || 0;
  const valorReal  = readDecimal('pagar-valor-real') || 0;

  if (!data) { showToast(t('dividas.validacao.data_pagamento', 'Informe a data de pagamento'), 'error'); return; }

  const contaIdPgto = document.getElementById('pagar-transacao-conta').value;
  if (!contaIdPgto) { showToast(t('dividas.validacao.conta_obrigatoria', 'Selecione a conta debitada — pagamento sempre é registrado em Transações.'), 'error'); return; }

  const pagas     = d.parcelas_pagas || 0;
  const n         = d.n_parcelas;
  const principal = Number(d.valor_total);
  const taxa      = Number(d.juros_percentual || 0) / 100;
  const tabela    = gerarTabela(d.regime, principal, taxa, n, d.fases || null);
  const rows      = tabela.slice(pagas, pagas + pagarParcelaN);
  if (!rows.length) return;

  const totalJuros = rows.reduce((s, r) => s + r.juros, 0);
  if (desconto > totalJuros) { showToast(t('dividas.validacao.desconto_excede', 'Desconto não pode exceder o total de juros'), 'error'); return; }

  // Total teórico (sem correção, sem ajuste manual)
  const totalTeorico = rows.reduce((s, r) => s + r.amortizacao + Math.max(0, r.juros - (totalJuros > 0 ? desconto * r.juros / totalJuros : 0)), 0);
  const valorRealEfetivo = pagarValorRealEditado && valorReal > 0 ? valorReal : totalTeorico;
  const totalCorrecao    = valorRealEfetivo - totalTeorico;

  const btn = document.getElementById('btn-confirmar-pagar-parcela');
  btn.disabled = true; btn.textContent = 'Salvando…';

  try {
    const user = await getCurrentUser();

    // Distribui correção proporcional ao tamanho da parcela
    const totalParcelaBase = rows.reduce((s, r) => s + r.parcela, 0);
    const inserts = rows.map((r) => {
      const descontoRow = totalJuros > 0 ? desconto * (r.juros / totalJuros) : 0;
      const corrRow     = totalParcelaBase > 0 ? totalCorrecao * (r.parcela / totalParcelaBase) : 0;
      const valorRow    = r.amortizacao + Math.max(0, r.juros - descontoRow) + corrRow;
      return {
        divida_id:           pagarParcelaId,
        user_id:             user.id,
        data,
        valor:               valorRow,
        descricao:           `Parcela ${r.n}/${n}`,
        n_parcela:           r.n,
        valor_amortizacao:   r.amortizacao,
        valor_juros:         r.juros,
        valor_correcao:      Math.abs(corrRow) > 0.001 ? corrRow : null,
        desconto_antecipacao: descontoRow > 0.001 ? descontoRow : null,
        valor_real_override: pagarValorRealEditado,
      };
    });

    const { error: insErr } = await supabase.from('pagamentos_divida_historico').insert(inserts);
    if (insErr) throw insErr;

    const novasParcelasPagas = pagas + pagarParcelaN;
    const novoValorPago      = Number(d.valor_pago) + rows.reduce((s, r) => s + r.amortizacao, 0);
    const novoStatus         = novasParcelasPagas >= n ? 'Quitada' : (d.status === 'Quitada' ? 'Ativa' : d.status);

    const { error: updErr } = await supabase.from('dividas')
      .update({ parcelas_pagas: novasParcelasPagas, valor_pago: novoValorPago, status: novoStatus })
      .eq('id', pagarParcelaId);
    if (updErr) throw updErr;

    // Registrar em Transações (sempre — campo obrigatório). Vincula à dívida
    // pra preservar rastreio mesmo se ela for arquivada depois.
    const descTrans = rows.length === 1
      ? `Parcela ${rows[0].n}/${n} — ${d.nome}`
      : `Parcelas ${rows[0].n}–${rows[rows.length - 1].n}/${n} — ${d.nome}`;
    const { error: transErr } = await supabase.from('transacoes').insert({
      user_id: user.id, conta_id: contaIdPgto, tipo: 'Despesa',
      valor: valorRealEfetivo, data, descricao: descTrans,
      divida_id: pagarParcelaId,
    });
    if (transErr) throw transErr;

    const msg = pagarValorRealEditado && Math.abs(totalCorrecao) >= 0.01
      ? `${rows.length} parcela${rows.length > 1 ? 's' : ''} registrada${rows.length > 1 ? 's' : ''} (ajuste: ${totalCorrecao >= 0 ? '+' : ''}${formatCurrency(totalCorrecao)})`
      : `${rows.length} parcela${rows.length > 1 ? 's' : ''} registrada${rows.length > 1 ? 's' : ''}`;
    showToast(msg, 'success');
    closeModal('modal-pagar-parcela');
    await loadAll();
  } catch (err) {
    showToast('Erro: ' + (err?.message || String(err)), 'error', 8000);
  } finally {
    btn.disabled = false; btn.textContent = 'Registrar pagamento';
  }
}

// =============================================================
// Tabela de amortização
// =============================================================
function openTabelaAmort(id) {
  const d = cachedDividas.find((x) => x.id === id);
  if (!d || !d.regime || !d.n_parcelas) return;

  const principal = Number(d.valor_total);
  const taxa      = Number(d.juros_percentual || 0) / 100;
  const n         = d.n_parcelas;
  const pagas     = d.parcelas_pagas || 0;

  document.getElementById('tabela-amort-title').textContent = `Tabela de Amortização — ${d.nome}`;

  const isVariavel = d.juros_tipo === 'manual_variavel' ||
                     (d.juros_tipo && d.juros_tipo !== 'manual_fixo' && d.juros_tipo !== 'manual');
  const tabela = buildTabelaDisplay(d);

  const totalJuros = tabela.reduce((s, r) => s + r.juros, 0);
  const totalPmt   = tabela.reduce((s, r) => s + r.parcela, 0);
  const regimeBadge = `<span class="div-regime-badge div-regime-badge--${d.regime.toLowerCase()}">${d.regime}</span>`;
  const parcelaInfo = d.regime === 'Price'
    ? formatCurrency(tabela[0]?.parcela || 0)
    : `${formatCurrency(tabela[0]?.parcela || 0)} → ${formatCurrency(tabela[n - 1]?.parcela || 0)}`;

  document.getElementById('tabela-amort-summary').innerHTML = `
    <div class="tabela-amort-summary-item">
      <span class="tabela-amort-summary-label">Regime</span>
      <span class="tabela-amort-summary-value">${regimeBadge}</span>
    </div>
    <div class="tabela-amort-summary-item">
      <span class="tabela-amort-summary-label">Taxa</span>
      <span class="tabela-amort-summary-value">${Number(d.juros_percentual || 0).toFixed(4)}% a.m.${isVariavel ? ' <span class="div-regime-badge" style="background:var(--color-warning-bg);color:var(--color-warning);">variável</span>' : ''}</span>
    </div>
    <div class="tabela-amort-summary-item">
      <span class="tabela-amort-summary-label">Parcelas</span>
      <span class="tabela-amort-summary-value">${pagas} / ${n}</span>
    </div>
    <div class="tabela-amort-summary-item">
      <span class="tabela-amort-summary-label">Valor parcela</span>
      <span class="tabela-amort-summary-value">${parcelaInfo}</span>
    </div>
    <div class="tabela-amort-summary-item">
      <span class="tabela-amort-summary-label">Total juros</span>
      <span class="tabela-amort-summary-value tabela-amort-danger">${formatCurrency(totalJuros)}</span>
    </div>
    <div class="tabela-amort-summary-item">
      <span class="tabela-amort-summary-label">Total a pagar</span>
      <span class="tabela-amort-summary-value">${formatCurrency(totalPmt)}</span>
    </div>
  `;

  document.getElementById('tabela-amort-body').innerHTML = tabela.map((r) => {
    const isPaga    = r.n <= pagas;
    const isProxima = r.n === pagas + 1;
    const cls = isPaga ? 'tabela-amort-paga' : (isProxima ? 'tabela-amort-proxima' : '');
    const venc = calcVencimentoParcela(d.data_inicio, r.n);
    return `
      <tr class="${cls}">
        <td class="tabular">${r.n}${isProxima ? ' <span class="tabela-amort-next-badge">próxima</span>' : ''}</td>
        <td class="tabular">${venc}</td>
        <td class="tabular text-right">${formatCurrency(r.saldo_inicial)}</td>
        <td class="tabular text-right">${formatCurrency(r.amortizacao)}</td>
        <td class="tabular text-right tabela-amort-juros-cell">${formatCurrency(r.juros)}</td>
        <td class="tabular text-right tabela-amort-pmt-cell">${formatCurrency(r.parcela)}</td>
        <td class="tabular text-right">${formatCurrency(r.saldo_final)}</td>
      </tr>`;
  }).join('');

  openModal('modal-tabela-amort');
  requestAnimationFrame(() => {
    document.querySelector('.tabela-amort-proxima')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

// =============================================================
// Taxa variável
// =============================================================

/**
 * Gera tabela híbrida para dívidas de taxa variável:
 * parcelas já pagas → reconstituídas do histórico real;
 * parcelas futuras  → geradas da taxa atual sobre o saldo devedor.
 * Para taxa fixa ou sem pagamentos, equivale a gerarTabela().
 */
function buildTabelaDisplay(d) {
  const principal = Number(d.valor_total);
  const taxa      = Number(d.juros_percentual || 0) / 100;
  const n         = d.n_parcelas;
  const pagas     = d.parcelas_pagas || 0;
  const fases     = d.fases || null;

  // Correção monetária: aplicada apenas nos rows futuros (passados são reais)
  const corrMensal = corrMensalDecimal(d);

  // "Variável" agora deriva de juros_tipo (manual_variavel ou indexado)
  const isVar = d.juros_tipo === 'manual_variavel' ||
                (d.juros_tipo && d.juros_tipo !== 'manual_fixo' && d.juros_tipo !== 'manual');
  if (!isVar || pagas === 0) {
    const base = gerarTabela(d.regime, principal, taxa, n, fases);
    return corrMensal ? aplicarCorrecao(base, corrMensal) : base;
  }

  const pagamentos = cachedDividaHistorico
    .filter((h) => h.divida_id === d.id && h.n_parcela != null)
    .sort((a, b) => a.n_parcela - b.n_parcela);

  const saldoAtual = Math.max(0, principal - Number(d.valor_pago));
  const nRestantes = n - pagas;

  let paidRows;
  if (pagamentos.length >= pagas) {
    let saldo = principal;
    paidRows = pagamentos.slice(0, pagas).map((h) => {
      const amort    = Number(h.valor_amortizacao || 0);
      const juros    = Number(h.valor_juros || 0);
      const corr     = Number(h.valor_correcao || 0);
      const desconto = Number(h.desconto_antecipacao || 0);
      const row = {
        n: h.n_parcela, saldo_inicial: saldo,
        amortizacao: amort, juros,
        parcela: amort + juros + corr - desconto,
        saldo_final: Math.max(0, saldo - amort),
      };
      saldo = row.saldo_final;
      return row;
    });
  } else {
    const base = gerarTabela(d.regime, principal, taxa, n, fases);
    paidRows = (corrMensal ? aplicarCorrecao(base, corrMensal) : base).slice(0, pagas);
  }

  // Para fases: ajusta as fases pelo offset de parcelas pagas
  const fasesFuturas = fases ? fases
    .filter((f) => f.ate > pagas)
    .map((f) => ({ de: Math.max(1, f.de - pagas), ate: f.ate - pagas, valor: f.valor })) : null;

  let futureRows = gerarTabela(d.regime, saldoAtual, taxa, nRestantes, fasesFuturas);
  if (corrMensal) futureRows = aplicarCorrecao(futureRows, corrMensal).map((r) => ({ ...r, n: r.n }));
  futureRows = futureRows.map((r) => ({ ...r, n: pagas + r.n }));

  return [...paidRows, ...futureRows];
}

/**
 * Converte indice_correcao + correcao_taxa em taxa mensal decimal estimada.
 * TR ≈ 0.05% a.m. (estimativa); IPCA/IGPM ≈ últimas 12 meses ÷ 12; fixo = correcao_taxa%.
 */
function corrMensalDecimal(d) {
  const idx = d.indice_correcao || 'nenhum';
  if (idx === 'nenhum') return 0;
  if (idx === 'fixo')   return Number(d.correcao_taxa || 0) / 100;
  if (idx === 'TR')     return 0.0005; // ~0.05% a.m. (TR baixa, estimativa conservadora)
  // IPCA / IGPM: usa indicador atual em base anual e converte a mensal aproximado
  // (chamada async não cabe aqui; deixa fallback razoável)
  if (idx === 'IPCA' || idx === 'IGPM') return 0.004; // ~0.4% a.m. (aprox. IPCA recente)
  return 0;
}

function openAtualizarTaxaModal(id) {
  const d = cachedDividas.find((x) => x.id === id);
  if (!d) return;
  atualizarTaxaId = id;
  document.getElementById('atualizar-taxa-title').textContent = `Atualizar taxa — ${d.nome}`;
  document.getElementById('atualizar-taxa-atual').textContent = `${Number(d.juros_percentual || 0).toFixed(4)}% a.m.`;
  document.getElementById('nova-taxa-input').value    = '';
  document.getElementById('nova-taxa-vigencia').value = new Date().toISOString().slice(0, 10);
  document.getElementById('nova-taxa-motivo').value   = '';
  openModal('modal-atualizar-taxa');
}

async function saveAtualizarTaxa() {
  const d = cachedDividas.find((x) => x.id === atualizarTaxaId);
  if (!d) return;

  const novaTaxa = readDecimal('nova-taxa-input');
  const vigencia = document.getElementById('nova-taxa-vigencia').value;
  const motivo   = document.getElementById('nova-taxa-motivo').value.trim() || null;

  if (isNaN(novaTaxa) || novaTaxa < 0) { showToast(t('dividas.validacao.nova_taxa', 'Informe a nova taxa'), 'error'); return; }
  if (!vigencia)                         { showToast(t('dividas.validacao.vigencia', 'Informe a data de vigência'), 'error'); return; }

  const btn = document.getElementById('btn-confirmar-atualizar-taxa');
  btn.disabled = true; btn.textContent = 'Salvando…';

  try {
    const user = await getCurrentUser();

    const { error: histErr } = await supabase.from('divida_taxa_historico').insert({
      divida_id: atualizarTaxaId, user_id: user.id,
      taxa_anterior: d.juros_percentual, taxa_nova: novaTaxa,
      data_vigencia: vigencia, motivo,
    });
    if (histErr) throw histErr;

    const { error: updErr } = await supabase.from('dividas')
      .update({ juros_percentual: novaTaxa })
      .eq('id', atualizarTaxaId);
    if (updErr) throw updErr;

    showToast(t('dividas.toast.taxa_atualizada', 'Taxa atualizada'), 'success');
    closeModal('modal-atualizar-taxa');
    await loadAll();
  } catch (err) {
    showToast('Erro: ' + (err?.message || String(err)), 'error', 8000);
  } finally {
    btn.disabled = false; btn.textContent = 'Atualizar';
  }
}

// -----------------------------
// Helpers
// -----------------------------
function calcTermino(dataInicio, nParcelas) {
  const [y, m, day] = dataInicio.split('-').map(Number);
  const d = new Date(y, m - 1 + nParcelas, day);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Data de vencimento da parcela N (1-indexed) — base = primeiro vencimento. */
function calcVencimentoParcela(dataInicio, n) {
  if (!dataInicio || !n) return '';
  const [y, m, day] = dataInicio.split('-').map(Number);
  const d = new Date(y, m - 1 + (n - 1), day);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function populateContaSelect(selectId) {
  const sel = document.getElementById(selectId);
  const current = sel.value;
  sel.innerHTML = '<option value="">Nenhuma</option>' +
    cachedContas.map((c) => `<option value="${c.id}">${c.apelido || c.nome}</option>`).join('');
  if (current) sel.value = current;
}

// =============================================================
// View: Tabela
// =============================================================
function renderTable(dividas) {
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const rows = dividas.map((d) => {
    const st      = STATUS_CONFIG[d.status] || STATUS_CONFIG['Ativa'];
    const total   = Number(d.valor_total);
    const pago    = Number(d.valor_pago);
    const restante = Math.max(0, total - pago);
    const pct     = total > 0 ? Math.min(100, (pago / total) * 100) : 0;
    const quitada = d.status === 'Quitada';
    const cor     = st.color;
    const conta   = cachedContas.find((c) => c.id === d.conta_id);

    const vencInfo = (() => {
      if (!d.data_vencimento || quitada) return fmtDate(d.data_vencimento);
      const vencDate = new Date(d.data_vencimento + 'T00:00:00');
      const diff = Math.round((vencDate - today) / 86400000);
      if (diff < 0)       return `<span style="color:var(--color-danger);font-weight:600;">Vencida há ${Math.abs(diff)}d</span>`;
      if (diff === 0)     return `<span style="color:var(--color-danger);font-weight:600;">Vence hoje</span>`;
      if (diff <= 30)     return `<span style="color:var(--color-warning);font-weight:600;">Em ${diff}d</span>`;
      return fmtDate(d.data_vencimento);
    })();

    const pctCell = `
      <span class="divida-tabela-pct" style="--divida-cor:${cor};">
        <span class="divida-tabela-pct-bar"><span class="divida-tabela-pct-fill" style="width:${pct.toFixed(1)}%;"></span></span>
        <span class="divida-tabela-pct-text">${pct.toFixed(0)}%</span>
      </span>`;

    const pctRestanteCell = `
      <span class="divida-tabela-pct" style="--divida-cor:${quitada ? 'var(--color-success)' : 'var(--color-danger)'};">
        <span class="divida-tabela-pct-bar"><span class="divida-tabela-pct-fill" style="width:${Math.max(0, 100 - pct).toFixed(1)}%;"></span></span>
        <span class="divida-tabela-pct-text">${Math.max(0, 100 - pct).toFixed(0)}%</span>
      </span>`;

    return `
      <tr class="divida-tabela-row" data-id="${d.id}">
        <td>
          <span class="divida-tabela-nome">
            <span class="divida-tabela-dot" style="background:${cor};"></span>
            ${escapeHtml(d.nome)}
          </span>
        </td>
        <td data-col="credor" class="text-muted-if-empty">${d.credor ? escapeHtml(d.credor) : '<span class="text-muted">—</span>'}</td>
        <td data-col="status">
          <span class="div-card-badge" style="color:${st.color};background:${st.bg};">${st.label}</span>
          ${quitada && pago < total ? `<span class="tag-parcial" title="Encerrada antes de quitar o valor total">Parcial</span>` : ''}
        </td>
        <td data-col="total"   class="text-right tabular">${formatCurrency(total)}</td>
        <td data-col="pago"    class="text-right tabular" style="color:var(--color-success);">${formatCurrency(pago)}</td>
        <td data-col="restante" class="text-right tabular${quitada ? '' : ' text-bold'}" style="${quitada ? '' : 'color:var(--color-danger);'}">${formatCurrency(restante)}</td>
        <td data-col="pct">${pctCell}</td>
        <td data-col="pct-restante">${pctRestanteCell}</td>
        <td data-col="vencimento" class="tabular">${vencInfo}</td>
        <td data-col="inicio"   class="tabular">${fmtDate(d.data_inicio)}</td>
        <td data-col="juros"    class="tabular">${d.juros_percentual ? `${Number(d.juros_percentual).toFixed(2)}% a.m.` : '<span class="text-muted">—</span>'}</td>
        <td data-col="regime">${d.regime ? `<span class="div-regime-badge div-regime-badge--${d.regime.toLowerCase()}">${d.regime}</span>${d.n_parcelas ? `<span class="text-muted" style="font-size:var(--fs-xs);margin-left:4px;">${d.parcelas_pagas}/${d.n_parcelas}x</span>` : ''}` : '<span class="text-muted">—</span>'}</td>
        <td data-col="conta">${conta ? escapeHtml(conta.apelido || conta.nome) : '<span class="text-muted">—</span>'}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="divida-tabela-wrapper">
      <table class="divida-tabela">
        <thead>
          <tr>
            <th>Nome</th>
            <th data-col="credor">Credor</th>
            <th data-col="status">Status</th>
            <th data-col="total"    class="text-right">Total</th>
            <th data-col="pago"     class="text-right">Pago</th>
            <th data-col="restante" class="text-right">Restante</th>
            <th data-col="pct">% Pago</th>
            <th data-col="pct-restante">% Restante</th>
            <th data-col="vencimento">Vencimento</th>
            <th data-col="inicio">Início</th>
            <th data-col="juros">Juros</th>
            <th data-col="regime">Regime</th>
            <th data-col="conta">Conta</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// View: Gantt extraído para ./dividas/gantt.js

// =============================================================
// Donut SVG (idêntico ao de investimentos)
// =============================================================
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

// Formata porcentagem: 1 decimal exceto quando exato 100%
function fmtPct(pct) {
  return pct.toFixed(1) === '100.0' ? '100%' : `${pct.toFixed(1)}%`;
}

// =============================================================
// Histórico passado — Dívidas
// =============================================================
function makeHistRow(entry = null) {
  const div = document.createElement('div');
  div.className = 'hist-row';
  div.innerHTML = `
    <input type="date" class="input hist-row-data" value="${entry?.data || ''}">
    <input type="number" class="input hist-row-valor" value="${entry?.valor ?? ''}" step="0.01" min="0.01" placeholder="Valor (R$)">
    <input type="text" class="input hist-row-desc" value="${escapeHtml(entry?.descricao || '')}" placeholder="Descrição (opcional)" maxlength="100">
    <button type="button" class="hist-row-del" title="Remover">×</button>
  `;
  div.querySelector('.hist-row-del').addEventListener('click', () => div.remove());
  return div;
}

function openHistoricoDividaModal(id) {
  const d = cachedDividas.find((x) => x.id === id);
  if (!d) return;
  historicoDividaId = id;

  document.getElementById('hist-divida-title').textContent = `Histórico — ${d.nome}`;

  // Reset to total mode
  document.querySelectorAll('#hist-divida-seg .view-toggle-btn')
    .forEach((b) => b.classList.toggle('active', b.dataset.histSeg === 'total'));
  document.getElementById('hist-divida-total-panel').classList.remove('hidden');
  document.getElementById('hist-divida-extrato-panel').classList.add('hidden');

  // Pre-fill valor pago
  document.getElementById('hist-divida-total-valor').value = Number(d.valor_pago) > 0 ? d.valor_pago : '';

  // Render extrato rows from cached historico
  const entradas = cachedDividaHistorico.filter((h) => h.divida_id === id);
  const container = document.getElementById('hist-divida-extrato-list');
  container.innerHTML = '';
  if (entradas.length > 0) {
    const listEl = document.createElement('div');
    listEl.className = 'hist-extrato-list';
    for (const h of entradas) listEl.appendChild(makeHistRow(h));
    container.appendChild(listEl);
  }

  openModal('modal-historico-divida');
}

async function saveHistoricoDivida() {
  const btn = document.getElementById('btn-salvar-hist-divida');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';
  const mode = document.querySelector('#hist-divida-seg .view-toggle-btn.active')?.dataset.histSeg || 'total';
  const d = cachedDividas.find((x) => x.id === historicoDividaId);
  if (!d) { btn.disabled = false; btn.textContent = 'Salvar'; return; }

  try {
    if (mode === 'total') {
      const valor = parseFloat(document.getElementById('hist-divida-total-valor').value) || 0;
      const novoStatus = valor >= Number(d.valor_total) ? 'Quitada'
        : (d.status === 'Quitada' ? 'Ativa' : d.status);
      const { error } = await supabase
        .from('dividas')
        .update({ valor_pago: valor, status: novoStatus })
        .eq('id', historicoDividaId);
      if (error) throw error;
      showToast('Valor pago atualizado', 'success');
    } else {
      // Collect rows from DOM
      const rows = [];
      document.querySelectorAll('#hist-divida-extrato-list .hist-row').forEach((rowEl) => {
        const data = rowEl.querySelector('.hist-row-data').value;
        const valor = parseFloat(rowEl.querySelector('.hist-row-valor').value);
        const descricao = rowEl.querySelector('.hist-row-desc').value.trim() || null;
        if (data && valor && valor > 0) rows.push({ data, valor, descricao });
      });

      const user = await getCurrentUser();
      if (!user) throw new Error('Sessão expirada');

      // Full replace historico
      const { error: delErr } = await supabase
        .from('pagamentos_divida_historico')
        .delete()
        .eq('divida_id', historicoDividaId);
      if (delErr) throw delErr;

      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from('pagamentos_divida_historico')
          .insert(rows.map((r) => ({ ...r, divida_id: historicoDividaId, user_id: user.id })));
        if (insErr) throw insErr;
      }

      // Recalculate valor_pago from sum of extrato entries
      const totalPago = rows.reduce((s, r) => s + Number(r.valor), 0);
      const novoStatus = totalPago >= Number(d.valor_total) ? 'Quitada'
        : (d.status === 'Quitada' && totalPago < Number(d.valor_total) ? 'Ativa' : d.status);
      const { error: updErr } = await supabase
        .from('dividas')
        .update({ valor_pago: totalPago, status: novoStatus })
        .eq('id', historicoDividaId);
      if (updErr) throw updErr;

      showToast(`${rows.length} entrada${rows.length !== 1 ? 's' : ''} salva${rows.length !== 1 ? 's' : ''}`, 'success');
    }

    closeModal('modal-historico-divida');
    await loadAll();
  } catch (err) {
    showToast('Erro ao salvar: ' + (err?.message || String(err)), 'error', 8000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}

