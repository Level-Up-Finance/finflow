// =============================================================
// FinFlow — Página: Dashboard (Fase 7.B — Customizável)
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { fetchExchangeRate } from '../lib/currency.js';
import { formatCurrencyHTML } from '../lib/moedas.js';
import { isPaidStatus } from '../lib/transacao-pagamento-sync.js';
import { escapeHtml, isoMonth } from '../lib/utils.js';
import { loadStrings, applyTranslationsToDom } from '../lib/textos.js';
import { SUPER_BLOCOS } from '../lib/super-blocos.js';

const MONTH_LABELS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAY_LABELS   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];


const today      = new Date();
const viewYear   = today.getFullYear();
const viewMonth  = today.getMonth();
const ratesMap   = new Map();

let cachedProfile    = null;
let cachedOrcamento  = [];
let cachedPagamentos = [];
let cachedTransacoes = [];
let cachedSelic      = null; // { selic: 14.5, cdi: 14.4, ipca: 4.14 }
let cachedPatrimonio = null; // { dividas: [{ nome, valor_ativo, saldo_devedor }], investimentos: [{ nome, valor }] }


// ── Widget Registry ───────────────────────────────────────────

const WIDGET_REGISTRY = [
  {
    id: 'kpis',
    label: 'Indicadores do mês',
    defaultSize: 'wide',
    defaultVisible: true,
    defaultOrder: 0,
    sizes: ['half', 'wide'],
    bodyHTML: () => `<section class="dash-kpis" id="dash-kpis">
      <div class="dash-kpi dash-kpi-skeleton">Carregando saldo…</div>
      <div class="dash-kpi dash-kpi-skeleton">Carregando oportunidade…</div>
      <div class="dash-kpi dash-kpi-skeleton">Carregando pagamentos…</div>
      <div class="dash-kpi dash-kpi-skeleton">Carregando compromissos…</div>
    </section>`,
    render: renderKPIs,
  },
  {
    id: 'atrasados',
    label: 'Pagamentos atrasados',
    defaultSize: 'wide',
    defaultVisible: true,
    defaultOrder: 1,
    sizes: ['half', 'wide'],
    bodyHTML: () => `<div id="dash-atrasados" class="dash-atrasados-widget"></div>`,
    render: renderAtrasados,
  },
  {
    id: 'selic',
    label: 'Indicadores BCB',
    defaultSize: 'half',
    defaultVisible: false,
    defaultOrder: 2,
    sizes: ['half', 'wide'],
    bodyHTML: () => `<div class="dash-card">
      <header class="dash-card-header">
        <h2 class="dash-card-title">Indicadores BCB</h2>
        <p class="dash-card-hint">Selic · Poupança · Inflação (IPCA)</p>
      </header>
      <div class="dash-card-body" id="dash-selic"><div class="dash-empty">Carregando…</div></div>
    </div>`,
    render: renderSelic,
  },
  {
    id: 'cambio',
    label: 'Câmbio',
    defaultSize: 'half',
    defaultVisible: false,
    defaultOrder: 3,
    sizes: ['half', 'wide'],
    bodyHTML: () => `<div class="dash-card">
      <header class="dash-card-header">
        <h2 class="dash-card-title">Câmbio</h2>
        <p class="dash-card-hint">Cotações em tempo real → BRL.</p>
      </header>
      <div class="dash-card-body" id="dash-cambio"><div class="dash-empty">Carregando…</div></div>
    </div>`,
    render: renderCambio,
  },
  {
    id: 'patrimonio',
    label: 'Patrimônio (ativos)',
    defaultSize: 'half',
    defaultVisible: true,
    defaultOrder: 4,
    sizes: ['half', 'wide'],
    bodyHTML: () => `<div class="dash-card">
      <header class="dash-card-header">
        <h2 class="dash-card-title">Patrimônio (ativos)</h2>
        <p class="dash-card-hint">Ativos selecionados em Financiamentos e Investimentos.</p>
      </header>
      <div class="dash-card-body" id="dash-patrimonio"><div class="dash-empty">Carregando…</div></div>
    </div>`,
    render: renderPatrimonio,
  },
  {
    id: 'distribuicao',
    label: 'Distribuição do mês',
    defaultSize: 'half',
    defaultVisible: true,
    defaultOrder: 5,
    sizes: ['half', 'wide'],
    bodyHTML: () => `<div class="dash-card">
      <header class="dash-card-header">
        <h2 class="dash-card-title">Distribuição do mês</h2>
        <p class="dash-card-hint">Saída prevista por super-bloco.</p>
      </header>
      <div class="dash-card-body" id="dash-blocos-bars"><div class="dash-empty">Carregando…</div></div>
    </div>`,
    render: renderBlocosBars,
  },
  {
    id: 'vencimentos',
    label: 'Próximos 7 dias',
    defaultSize: 'half',
    defaultVisible: true,
    defaultOrder: 6,
    sizes: ['half', 'wide'],
    bodyHTML: () => `<div class="dash-card">
      <header class="dash-card-header">
        <h2 class="dash-card-title">Próximos 7 dias</h2>
        <p class="dash-card-hint">Pagamentos a vencer.</p>
      </header>
      <div class="dash-card-body" id="dash-vencimentos"><div class="dash-empty">Carregando…</div></div>
    </div>`,
    render: renderProximosVencimentos,
  },
  {
    id: 'top-gastos',
    label: 'Top gastos do mês',
    defaultSize: 'half',
    defaultVisible: false,
    defaultOrder: 7,
    sizes: ['half', 'wide'],
    bodyHTML: () => `<div class="dash-card">
      <header class="dash-card-header">
        <h2 class="dash-card-title">Top gastos</h2>
        <p class="dash-card-hint">Maiores categorias de despesa pagas este mês.</p>
      </header>
      <div class="dash-card-body" id="dash-top-gastos"><div class="dash-empty">Carregando…</div></div>
    </div>`,
    render: renderTopGastos,
  },
  {
    id: 'transacoes',
    label: 'Transações recentes',
    defaultSize: 'wide',
    defaultVisible: false,
    defaultOrder: 8,
    sizes: ['half', 'wide'],
    bodyHTML: () => `<div class="dash-card">
      <header class="dash-card-header">
        <h2 class="dash-card-title">Transações recentes</h2>
        <p class="dash-card-hint">Últimas movimentações registradas.</p>
      </header>
      <div class="dash-card-body" id="dash-transacoes"><div class="dash-empty">Carregando…</div></div>
    </div>`,
    render: renderTransacoesRecentes,
  },
  {
    id: 'shortcuts',
    label: 'Atalhos rápidos',
    defaultSize: 'wide',
    defaultVisible: true,
    defaultOrder: 9,
    sizes: ['half', 'wide'],
    bodyHTML: () => `<section class="dash-shortcuts">
      <a href="/pagamentos.html" class="dash-shortcut">
        <span class="dash-shortcut-icon" style="--shortcut-color: var(--color-primary);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
        </span>
        <div>
          <div class="dash-shortcut-title">Marcar pagamentos</div>
          <div class="dash-shortcut-hint">Atualizar status do mês</div>
        </div>
      </a>
      <a href="/orcamento.html" class="dash-shortcut">
        <span class="dash-shortcut-icon" style="--shortcut-color: var(--color-success);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
        </span>
        <div>
          <div class="dash-shortcut-title">Ajustar orçamento</div>
          <div class="dash-shortcut-hint">Receitas e despesas planejadas</div>
        </div>
      </a>
      <a href="/compromissos.html" class="dash-shortcut">
        <span class="dash-shortcut-icon" style="--shortcut-color: var(--color-secondary);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>
        </span>
        <div>
          <div class="dash-shortcut-title">Novo compromisso</div>
          <div class="dash-shortcut-hint">Cadastrar receita ou despesa</div>
        </div>
      </a>
      <a href="/relatorios.html" class="dash-shortcut">
        <span class="dash-shortcut-icon" style="--shortcut-color: var(--color-warning);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
        </span>
        <div>
          <div class="dash-shortcut-title">Relatórios</div>
          <div class="dash-shortcut-hint">Fluxo de caixa e análises</div>
        </div>
      </a>
    </section>`,
    render: () => {},
  },
];

// ── Config ────────────────────────────────────────────────────

const LS_KEY = 'finflow_dash_widgets_v1';
let widgetConfig = [];

function loadWidgetConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    if (!Array.isArray(saved) || saved.length === 0) return buildDefaultConfig();

    const result = WIDGET_REGISTRY.map((def) => {
      const s = saved.find((c) => c.id === def.id);
      return s
        ? { id: def.id, visible: s.visible ?? def.defaultVisible, order: Number(s.order ?? def.defaultOrder), size: s.size ?? def.defaultSize }
        : { id: def.id, visible: def.defaultVisible, order: def.defaultOrder + 100, size: def.defaultSize };
    });
    return result.sort((a, b) => a.order - b.order);
  } catch {
    return buildDefaultConfig();
  }
}

function buildDefaultConfig() {
  return WIDGET_REGISTRY
    .map((def) => ({ id: def.id, visible: def.defaultVisible, order: def.defaultOrder, size: def.defaultSize }))
    .sort((a, b) => a.order - b.order);
}

function saveWidgetConfig() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(widgetConfig)); } catch {}
}

// ── Edit mode ─────────────────────────────────────────────────

let isEditMode = false;

function enterEditMode() {
  isEditMode = true;
  document.getElementById('dash-canvas').classList.add('dash-canvas--editing');
  document.getElementById('dash-edit-bar').classList.remove('hidden');
  document.getElementById('btn-personalizar').classList.add('hidden');
  updateEditBarHiddenList();
}

function exitEditMode() {
  isEditMode = false;
  const canvas = document.getElementById('dash-canvas');
  canvas.classList.remove('dash-canvas--editing');
  document.getElementById('dash-edit-bar').classList.add('hidden');
  document.getElementById('btn-personalizar').classList.remove('hidden');

  // Persist order from current DOM sequence
  [...canvas.querySelectorAll('.dash-widget')].forEach((el, i) => {
    const cfg = widgetConfig.find((c) => c.id === el.dataset.widgetId);
    if (cfg) cfg.order = i;
  });
  saveWidgetConfig();
}

function updateEditBarHiddenList() {
  const container = document.getElementById('dash-hidden-widgets');
  if (!container) return;

  const hidden = widgetConfig.filter((c) => !c.visible);
  if (hidden.length === 0) {
    container.innerHTML = '<span class="dash-edit-empty-hint">Todos os widgets estão visíveis.</span>';
    return;
  }

  container.innerHTML = hidden.map((cfg) => {
    const def = WIDGET_REGISTRY.find((d) => d.id === cfg.id);
    if (!def) return '';
    return `<button class="dash-add-widget-btn" data-widget-id="${cfg.id}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
      ${escapeHtml(def.label)}
    </button>`;
  }).join('');

  container.querySelectorAll('.dash-add-widget-btn').forEach((btn) => {
    btn.addEventListener('click', () => onShowWidget(btn.dataset.widgetId));
  });
}

// ── Canvas rendering ──────────────────────────────────────────

function renderCanvas() {
  const canvas = document.getElementById('dash-canvas');
  canvas.innerHTML = '';

  const visible = widgetConfig.filter((c) => c.visible).sort((a, b) => a.order - b.order);

  for (const cfg of visible) {
    const def = WIDGET_REGISTRY.find((d) => d.id === cfg.id);
    if (!def) continue;
    canvas.appendChild(createWidgetEl(def, cfg));
  }

  for (const cfg of visible) {
    const def = WIDGET_REGISTRY.find((d) => d.id === cfg.id);
    if (def?.render) def.render();
  }

  if (isEditMode) canvas.classList.add('dash-canvas--editing');

  initDragDrop(canvas);
}

const SIZE_LABELS = { half: 'Metade', wide: 'Inteiro' };

function createWidgetEl(def, cfg) {
  const el = document.createElement('div');
  el.className = `dash-widget dash-widget--${cfg.size}`;
  el.dataset.widgetId = def.id;
  el.draggable = true;

  const sizePills = (def.sizes || ['half', 'wide'])
    .map((s) => `<button class="dash-widget-size-pill${cfg.size === s ? ' dash-widget-size-pill--active' : ''}" data-size="${s}">${SIZE_LABELS[s] || s}</button>`)
    .join('');

  el.innerHTML = `
    <div class="dash-widget-overlay">
      <span class="dash-widget-drag-handle" title="Arrastar para reordenar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="9"  cy="5"  r="1.5"/><circle cx="15" cy="5"  r="1.5"/>
          <circle cx="9"  cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9"  cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
        </svg>
      </span>
      <span class="dash-widget-label">${escapeHtml(def.label)}</span>
      <div class="dash-widget-size-pills">${sizePills}</div>
      <button class="dash-widget-hide-btn" data-widget-id="${def.id}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        Ocultar
      </button>
    </div>
    <div class="dash-widget-body">${def.bodyHTML()}</div>
  `;

  el.querySelectorAll('.dash-widget-size-pill').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); onSizeChange(def.id, btn.dataset.size); });
  });

  el.querySelector('.dash-widget-hide-btn').addEventListener('click', (e) => {
    e.stopPropagation(); onHideWidget(def.id);
  });

  return el;
}

// ── Widget actions ────────────────────────────────────────────

function onSizeChange(widgetId, newSize) {
  const cfg = widgetConfig.find((c) => c.id === widgetId);
  if (!cfg) return;
  cfg.size = newSize;
  saveWidgetConfig();

  const el = document.querySelector(`.dash-widget[data-widget-id="${widgetId}"]`);
  if (!el) return;
  el.classList.remove('dash-widget--wide', 'dash-widget--half');
  el.classList.add(`dash-widget--${newSize}`);
  el.querySelectorAll('.dash-widget-size-pill').forEach((btn) => {
    btn.classList.toggle('dash-widget-size-pill--active', btn.dataset.size === newSize);
  });
}

function onHideWidget(widgetId) {
  const cfg = widgetConfig.find((c) => c.id === widgetId);
  if (!cfg) return;
  cfg.visible = false;
  saveWidgetConfig();

  document.querySelector(`.dash-widget[data-widget-id="${widgetId}"]`)?.remove();
  updateEditBarHiddenList();
}

function onShowWidget(widgetId) {
  const cfg = widgetConfig.find((c) => c.id === widgetId);
  if (!cfg) return;
  cfg.visible = true;

  const canvas = document.getElementById('dash-canvas');
  const currentCount = canvas.querySelectorAll('.dash-widget').length;
  cfg.order = currentCount;
  saveWidgetConfig();

  const def = WIDGET_REGISTRY.find((d) => d.id === widgetId);
  if (!def) return;

  const el = createWidgetEl(def, cfg);
  canvas.appendChild(el);
  if (isEditMode) canvas.classList.add('dash-canvas--editing');
  if (def.render) def.render();

  updateEditBarHiddenList();
}

// ── Drag & Drop ───────────────────────────────────────────────

function initDragDrop(canvas) {
  let dragSrc = null;

  canvas.addEventListener('dragstart', (e) => {
    const widget = e.target.closest('.dash-widget');
    if (!widget || !isEditMode) { e.preventDefault(); return; }
    dragSrc = widget;
    requestAnimationFrame(() => widget.classList.add('dash-widget--dragging'));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', widget.dataset.widgetId);
  });

  canvas.addEventListener('dragend', () => {
    dragSrc?.classList.remove('dash-widget--dragging');
    canvas.querySelectorAll('.dash-widget--drag-over').forEach((el) => el.classList.remove('dash-widget--drag-over'));
    dragSrc = null;
  });

  canvas.addEventListener('dragover', (e) => {
    if (!isEditMode || !dragSrc) return;
    e.preventDefault();
    const target = e.target.closest('.dash-widget');
    if (!target || target === dragSrc) return;
    canvas.querySelectorAll('.dash-widget--drag-over').forEach((el) => el.classList.remove('dash-widget--drag-over'));
    target.classList.add('dash-widget--drag-over');
    e.dataTransfer.dropEffect = 'move';
  });

  canvas.addEventListener('dragleave', (e) => {
    if (!canvas.contains(e.relatedTarget)) {
      canvas.querySelectorAll('.dash-widget--drag-over').forEach((el) => el.classList.remove('dash-widget--drag-over'));
    }
  });

  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!isEditMode || !dragSrc) return;
    const target = e.target.closest('.dash-widget');
    if (!target || target === dragSrc) return;
    target.classList.remove('dash-widget--drag-over');

    const all = [...canvas.querySelectorAll('.dash-widget')];
    const srcIdx = all.indexOf(dragSrc);
    const tgtIdx = all.indexOf(target);

    if (srcIdx < tgtIdx) canvas.insertBefore(dragSrc, target.nextSibling);
    else canvas.insertBefore(dragSrc, target);

    [...canvas.querySelectorAll('.dash-widget')].forEach((el, i) => {
      const c = widgetConfig.find((c) => c.id === el.dataset.widgetId);
      if (c) c.order = i;
    });
    saveWidgetConfig();
  });
}

// ── Init ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('dashboard');
  initTutorial('dashboard');
  await loadStrings();
  applyTranslationsToDom();

  await loadAll();
  renderGreeting();

  widgetConfig = loadWidgetConfig();
  renderCanvas();

  document.getElementById('btn-personalizar').addEventListener('click', enterEditMode);
  document.getElementById('btn-edit-done').addEventListener('click', exitEditMode);
});

// ── Loaders ───────────────────────────────────────────────────

async function loadAll() {
  const user = await getCurrentUser();
  if (!user) return;

  const mesAno = isoMonth(viewYear, viewMonth);

  const [profile, orcamento, pagamentos, transacoes, dividasPatr, projetosPatr, ativos] = await Promise.all([
    supabase.from('profiles').select('nome, apelido').eq('id', user.id).maybeSingle(),
    supabase.from('orcamento_geral').select('*, subcategorias(*, categorias(*))').eq('mes_ano', mesAno),
    supabase.from('pagamentos')
      .select('*, subcategorias(*, categorias(*))')
      .eq('mes_ano', mesAno)
      .order('data_vencimento'),
    supabase.from('transacoes')
      .select('id, data, tipo, valor, moeda, cambio_travado, descricao, conta_id, contas(nome, apelido), subcategoria_id, subcategorias(categorias(grupo)), pagamento:pagamentos(status)')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
    // Patrimônio: dívidas e investimentos selecionados + ativos
    supabase.from('dividas').select('id, nome, moeda, valor_pago, valor_total, status').eq('inclui_no_patrimonio', true),
    supabase.from('projetos_investimento').select('id, nome, moeda, saldo_inicial').eq('inclui_no_patrimonio', true),
    supabase.from('ativos_subjacentes').select('divida_id, valor_atual, tipo'),
  ]);

  cachedProfile    = profile.data || {};
  cachedOrcamento  = (orcamento.data  || []).filter((e) => e.subcategorias?.status === 'ativa');
  cachedPagamentos = (pagamentos.data || []).filter((p) => p.subcategorias?.status === 'ativa');
  cachedTransacoes = transacoes.data || [];

  // Compõe estrutura de patrimônio
  const ativoByDivida = new Map((ativos.data || []).map((a) => [a.divida_id, a]));
  cachedPatrimonio = {
    dividas: (dividasPatr.data || []).map((d) => {
      const ativo = ativoByDivida.get(d.id);
      const saldo = Math.max(0, Number(d.valor_total || 0) - Number(d.valor_pago || 0));
      return {
        nome: d.nome,
        moeda: d.moeda || 'BRL',
        valor_ativo: Number(ativo?.valor_atual || 0),
        saldo_devedor: saldo,
        tem_ativo: !!ativo,
      };
    }),
    investimentos: (projetosPatr.data || []).map((p) => ({
      nome: p.nome,
      moeda: p.moeda || 'BRL',
      valor: Number(p.saldo_inicial || 0),
    })),
  };

  await Promise.all([refreshRates(), fetchSelic()]);
}

async function refreshRates() {
  const fromData = [...new Set([
    ...cachedOrcamento.map((e) => e.moeda).filter((m) => m && m !== 'BRL'),
    ...cachedPagamentos.map((p) => p.moeda).filter((m) => m && m !== 'BRL'),
    ...cachedTransacoes.map((t) => t.moeda).filter((m) => m && m !== 'BRL'),
    ...(cachedPatrimonio?.dividas || []).map((d) => d.moeda).filter((m) => m && m !== 'BRL'),
    ...(cachedPatrimonio?.investimentos || []).map((i) => i.moeda).filter((m) => m && m !== 'BRL'),
  ])];
  // Sempre inclui USD e EUR para o widget de câmbio
  const used = [...new Set([...fromData, 'USD', 'EUR'])];
  await Promise.all(used.map(async (c) => {
    try { ratesMap.set(c, await fetchExchangeRate(c, 'BRL')); }
    catch (err) { console.warn('[dashboard] cotação falhou:', c, err); }
  }));
}

async function fetchSelic() {
  try {
    const res = await fetch('https://brasilapi.com.br/api/taxas/v1');
    if (!res.ok) return;
    const items = await res.json();
    const find = (nome) => items.find((i) => i.nome.toLowerCase() === nome.toLowerCase())?.valor ?? null;
    cachedSelic = { selic: find('Selic'), cdi: find('CDI'), ipca: find('IPCA') };
  } catch (err) {
    console.warn('[dashboard] Selic fetch falhou:', err);
  }
}

function convertToBRL(value, currency, entry) {
  if (!currency || currency === 'BRL') return Number(value) || 0;
  if (entry?.cambio_travado) return (Number(value) || 0) * Number(entry.cambio_travado);
  const rate = ratesMap.get(currency);
  if (!rate) return null;
  return (Number(value) || 0) * rate;
}

// ── Greeting ──────────────────────────────────────────────────

function renderGreeting() {
  const hora = today.getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = cachedProfile?.apelido?.trim() || cachedProfile?.nome?.trim() || '';

  document.getElementById('dash-greeting').textContent = nome ? `${saudacao}, ${nome}` : saudacao;
  document.getElementById('dash-eyebrow').textContent = 'Visão geral';
  document.getElementById('dash-month-label').textContent = `Aqui está o resumo de ${MONTH_LABELS[viewMonth]} ${viewYear}.`;
}

// ── KPIs ──────────────────────────────────────────────────────

function renderKPIs() {
  // Previsto (orçamento)
  let receitasPrevBRL = 0, despesasPrevBRL = 0;
  for (const e of cachedOrcamento) {
    const vBRL = convertToBRL(Number(e.valor_previsto) || 0, e.moeda, e);
    if (vBRL === null) continue;
    if (e.subcategorias?.tipo === 'Receita') receitasPrevBRL += vBRL;
    else despesasPrevBRL += vBRL;
  }
  const saldoPrev = receitasPrevBRL - despesasPrevBRL;

  // Real (pagamentos efetivados)
  let receitasRealBRL = 0, despesasRealBRL = 0;
  for (const p of cachedPagamentos) {
    if (!isPaidStatus(p.status)) continue;
    const val = p.valor_real != null ? Number(p.valor_real) : Number(p.valor_previsto);
    const vBRL = convertToBRL(val || 0, p.moeda, p);
    if (vBRL === null) continue;
    if (p.subcategorias?.tipo === 'Receita') receitasRealBRL += vBRL;
    else despesasRealBRL += vBRL;
  }
  const saldoReal = receitasRealBRL - despesasRealBRL;

  const saldoCls  = saldoReal > 0 ? 'dre-positive' : saldoReal < 0 ? 'dre-negative' : 'dre-zero';

  // Oportunidade (bloco Contribuição)
  let oportunidade = 0;
  for (const e of cachedOrcamento) {
    const cat = e.subcategorias?.categorias;
    if (!cat || !['receitas', 'dividas'].includes(cat.grupo)) continue;
    const vBRL = convertToBRL(Number(e.valor_previsto) || 0, e.moeda, e);
    if (vBRL === null) continue;
    oportunidade += e.subcategorias?.tipo === 'Receita' ? vBRL : -vBRL;
  }
  const oportCls  = oportunidade > 0 ? 'dre-positive' : oportunidade < 0 ? 'dre-negative' : 'dre-zero';

  // Despesas pagas %
  let realPagoBRL = 0, totalPrevistoBRL = 0;
  for (const p of cachedPagamentos) {
    if (p.status === 'Cancelado' || p.subcategorias?.tipo !== 'Despesa') continue;
    const prevBRL = convertToBRL(Number(p.valor_previsto) || 0, p.moeda, p);
    if (prevBRL === null) continue;
    totalPrevistoBRL += prevBRL;
    if (isPaidStatus(p.status)) {
      const val = p.valor_real != null ? Number(p.valor_real) : Number(p.valor_previsto);
      const vBRL = convertToBRL(val || 0, p.moeda, p);
      if (vBRL !== null) realPagoBRL += vBRL;
    }
  }
  const pctPago  = totalPrevistoBRL > 0 ? Math.min(100, (realPagoBRL / totalPrevistoBRL) * 100) : 0;
  const pctColor = pctPago >= 100 ? 'var(--color-danger)' : 'var(--color-success)';

  // Compromissos ativos
  const subsAtivas = new Set(cachedPagamentos
    .filter((p) => p.subcategorias?.status === 'ativa')
    .map((p) => p.subcategoria_id));

  const container = document.getElementById('dash-kpis');
  if (!container) return;

  container.innerHTML = `
    <div class="dash-kpi" style="--kpi-accent: var(--color-primary);">
      <div class="dash-kpi-label">Saldo realizado</div>
      <div class="dash-kpi-value ${saldoCls}">${formatCurrencyHTML(saldoReal, 'BRL')}</div>
      <div class="dash-kpi-sub">
        <span class="dre-positive">${formatCurrencyHTML(receitasRealBRL, 'BRL')}</span>
        <span class="text-muted"> · </span>
        <span class="dre-negative">${formatCurrencyHTML(-despesasRealBRL, 'BRL')}</span>
      </div>
      <div class="dash-kpi-sub dash-kpi-prev">
        Previsto: <span class="${saldoPrev >= 0 ? 'dre-positive' : 'dre-negative'}">${formatCurrencyHTML(saldoPrev, 'BRL')}</span>
      </div>
    </div>

    <div class="dash-kpi" style="--kpi-accent: var(--color-success);">
      <div class="dash-kpi-label">Oportunidade de investimento</div>
      <div class="dash-kpi-value ${oportCls}">${formatCurrencyHTML(oportunidade, 'BRL')}</div>
      <div class="dash-kpi-sub">Sobra do bloco Contribuição</div>
    </div>

    <div class="dash-kpi" style="--kpi-accent: var(--color-warning);">
      <div class="dash-kpi-label">Despesas pagas</div>
      <div class="dash-kpi-value">${pctPago.toFixed(0)}%</div>
      <div class="dash-kpi-progress">
        <div class="dash-kpi-progress-fill" style="width: ${pctPago}%; background: ${pctColor};"></div>
      </div>
      <div class="dash-kpi-sub">${formatCurrencyHTML(realPagoBRL, 'BRL')} de ${formatCurrencyHTML(totalPrevistoBRL, 'BRL')}</div>
    </div>

    <div class="dash-kpi" style="--kpi-accent: var(--color-secondary);">
      <div class="dash-kpi-label">Compromissos ativos</div>
      <div class="dash-kpi-value">${subsAtivas.size}</div>
      <div class="dash-kpi-sub">com pagamento neste mês</div>
    </div>
  `;
}

// ── Patrimônio ────────────────────────────────────────────────

function renderPatrimonio() {
  const host = document.getElementById('dash-patrimonio');
  if (!host) return;
  const data = cachedPatrimonio;

  const dividasComAtivo = (data?.dividas || []).filter((d) => d.tem_ativo);
  const investimentos   = data?.investimentos || [];

  if (dividasComAtivo.length === 0 && investimentos.length === 0) {
    host.innerHTML = `
      <div class="dash-empty">
        Nenhum ativo selecionado.<br>
        Marque "Incluir no patrimônio" ao editar uma <a href="/dividas.html">dívida</a> ou um <a href="/investimentos.html">projeto de investimento</a>.
      </div>`;
    return;
  }

  const toBRLOr = (v, m) => {
    const conv = convertToBRL(Number(v) || 0, m);
    return conv != null ? conv : Number(v) || 0;
  };
  const totalDividas = dividasComAtivo.reduce(
    (s, d) => s + toBRLOr(d.valor_ativo - d.saldo_devedor, d.moeda),
    0,
  );
  const totalInvest  = investimentos.reduce((s, i) => s + toBRLOr(i.valor, i.moeda), 0);
  const patrimonioFixo = totalDividas + totalInvest;
  const fmt = (n) => formatCurrencyHTML(n, 'BRL');

  host.innerHTML = `
    <div class="dash-patrimonio-total">
      <span class="dash-patrimonio-label">Patrimônio fixo</span>
      <strong class="dash-patrimonio-value" style="font-size:var(--fs-2xl);">${fmt(patrimonioFixo)}</strong>
      <span class="dash-patrimonio-hint" style="display:block;color:var(--color-text-muted);font-size:var(--fs-sm);margin-top:var(--space-1);">
        ${dividasComAtivo.length} ${dividasComAtivo.length === 1 ? 'ativo' : 'ativos'} via financiamentos · ${investimentos.length} ${investimentos.length === 1 ? 'investimento' : 'investimentos'}
      </span>
    </div>
    ${dividasComAtivo.length > 0 ? `
      <div style="margin-top:var(--space-3);">
        <p style="font-weight:600;font-size:var(--fs-sm);margin-bottom:var(--space-2);color:var(--color-text-secondary);">Ativos físicos (Financiamentos)</p>
        ${dividasComAtivo.map((d) => `
          <div style="display:flex;justify-content:space-between;padding:var(--space-1) 0;font-size:var(--fs-sm);">
            <span>${escapeHtml(d.nome)}</span>
            <span class="tabular">${fmt(toBRLOr(d.valor_ativo - d.saldo_devedor, d.moeda))}</span>
          </div>
        `).join('')}
      </div>` : ''}
    ${investimentos.length > 0 ? `
      <div style="margin-top:var(--space-3);">
        <p style="font-weight:600;font-size:var(--fs-sm);margin-bottom:var(--space-2);color:var(--color-text-secondary);">Investimentos</p>
        ${investimentos.map((i) => `
          <div style="display:flex;justify-content:space-between;padding:var(--space-1) 0;font-size:var(--fs-sm);">
            <span>${escapeHtml(i.nome)}</span>
            <span class="tabular">${fmt(toBRLOr(i.valor, i.moeda))}</span>
          </div>
        `).join('')}
      </div>` : ''}
    <p style="margin-top:var(--space-3);font-size:var(--fs-xs);color:var(--color-text-muted);">
      Patrimônio corrente (com saldos de contas) em breve.
    </p>
  `;
}

// ── Distribuição por bloco ────────────────────────────────────

function renderBlocosBars() {
  const totalsByBloco = {};
  for (const bloco of SUPER_BLOCOS) totalsByBloco[bloco.id] = { signed: 0, absDespesa: 0 };

  for (const e of cachedOrcamento) {
    const cat = e.subcategorias?.categorias;
    if (!cat) continue;
    const bloco = SUPER_BLOCOS.find((b) => b.grupos.includes(cat.grupo || 'custo_vida'));
    if (!bloco) continue;
    const vBRL = convertToBRL(Number(e.valor_previsto) || 0, e.moeda, e);
    if (vBRL === null) continue;
    const t = totalsByBloco[bloco.id];
    t.signed += e.subcategorias?.tipo === 'Receita' ? vBRL : -vBRL;
    if (e.subcategorias?.tipo === 'Despesa') t.absDespesa += vBRL;
  }

  const maxValue = Math.max(
    Math.abs(totalsByBloco.contribuicao.signed),
    totalsByBloco.sonhos.absDespesa,
    totalsByBloco.custo_vida.absDespesa,
    1
  );

  const container = document.getElementById('dash-blocos-bars');
  if (!container) return;

  if (cachedOrcamento.length === 0) {
    container.innerHTML = '<div class="dash-empty">Nenhum dado de orçamento neste mês.</div>';
    return;
  }

  container.innerHTML = SUPER_BLOCOS.map((bloco) => {
    const t = totalsByBloco[bloco.id];
    const value = bloco.id === 'contribuicao' ? t.signed : t.absDespesa;
    const pct = (Math.abs(value) / maxValue) * 100;
    const display = bloco.id === 'contribuicao'
      ? formatCurrencyHTML(value, 'BRL')
      : formatCurrencyHTML(value, 'BRL');
    const valueCls = bloco.id === 'contribuicao' ? (value > 0 ? 'dre-positive' : value < 0 ? 'dre-negative' : '') : '';
    return `
      <div class="dash-bloco-bar" style="--bloco-accent: ${bloco.accent};">
        <div class="dash-bloco-bar-label">
          <span class="dash-bloco-bar-name">${bloco.label}</span>
          <span class="dash-bloco-bar-value ${valueCls}">${display}</span>
        </div>
        <div class="dash-bloco-bar-track">
          <div class="dash-bloco-bar-fill" style="width: ${pct}%;"></div>
        </div>
      </div>`;
  }).join('');
}

// ── Pagamentos atrasados ──────────────────────────────────────

function renderAtrasados() {
  const container = document.getElementById('dash-atrasados');
  if (!container) return;

  const hoje = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const atrasados = cachedPagamentos
    .filter((p) => p.status === 'A Pagar' && p.data_vencimento)
    .filter((p) => new Date(p.data_vencimento + 'T00:00:00') < hoje)
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));

  if (atrasados.length === 0) {
    container.className = 'dash-atrasados-widget dash-atrasados-ok';
    container.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
      <span>Sem pagamentos em atraso</span>`;
    return;
  }

  let totalBRL = 0;
  atrasados.forEach((p) => {
    const v = convertToBRL(Number(p.valor_previsto) || 0, p.moeda, p);
    if (v !== null) totalBRL += v;
  });

  container.className = 'dash-atrasados-widget dash-alert';
  container.innerHTML = `
    <div class="dash-alert-header">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
      <span class="dash-alert-summary">${atrasados.length} pagamento${atrasados.length > 1 ? 's' : ''} em atraso — ${formatCurrencyHTML(totalBRL, 'BRL')} total</span>
      <a href="/pagamentos.html" class="dash-alert-link">Ver em Pagamentos →</a>
    </div>
    <div class="dash-alert-list">${atrasados.map(renderAtrasadoRow).join('')}</div>`;
}

function renderAtrasadoRow(p) {
  const hoje  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const sub   = p.subcategorias;
  const display = sub?.apelido?.trim() || sub?.nome || '—';
  const vBRL  = convertToBRL(Number(p.valor_previsto) || 0, p.moeda, p);
  const valor = vBRL !== null ? formatCurrencyHTML(vBRL, 'BRL') : formatCurrencyHTML(Number(p.valor_previsto), p.moeda);
  const cat   = sub?.categorias;
  const d     = new Date(p.data_vencimento + 'T00:00:00');
  const dia   = String(d.getDate()).padStart(2, '0');
  const mes   = String(d.getMonth() + 1).padStart(2, '0');
  const diasAtraso = Math.round((hoje - d) / 86400000);
  return `
    <a href="/pagamentos.html" class="dash-venc-row">
      <div class="dash-venc-date dash-venc-date--atrasado">
        <span class="dash-venc-day">${dia}/${mes}</span>
        <span class="dash-atraso-badge">${diasAtraso}d</span>
      </div>
      <div class="dash-venc-info">
        <span class="dash-venc-name">
          <span class="dash-venc-dot" style="background: ${cat?.cor || '#9CA3AF'};"></span>
          ${escapeHtml(display)}
        </span>
        ${cat ? `<span class="dash-venc-cat">${escapeHtml(cat.nome)}</span>` : ''}
      </div>
      <div class="dash-venc-value dre-negative">−${valor}</div>
    </a>`;
}

// ── Próximos vencimentos ──────────────────────────────────────

function renderProximosVencimentos() {
  const container = document.getElementById('dash-vencimentos');
  if (!container) return;

  const hoje  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + 7);

  const upcoming = cachedPagamentos
    .filter((p) => p.status === 'A Pagar' && p.data_vencimento)
    .filter((p) => { const d = new Date(p.data_vencimento + 'T00:00:00'); return d >= hoje && d <= limite; })
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    .slice(0, 8);

  if (upcoming.length === 0) {
    container.innerHTML = '<div class="dash-empty">Sem vencimentos nos próximos 7 dias 🎉</div>';
    return;
  }

  container.innerHTML = upcoming.map((p) => {
    const sub   = p.subcategorias;
    const display = sub?.apelido?.trim() || sub?.nome || '—';
    const v     = Number(p.valor_previsto) || 0;
    const vBRL  = convertToBRL(v, p.moeda, p);
    const valor = vBRL !== null ? formatCurrencyHTML(vBRL, 'BRL') : formatCurrencyHTML(v, p.moeda);
    const cat   = sub?.categorias;
    const tipo  = sub?.tipo;
    const sign  = tipo === 'Receita' ? '+' : '−';
    const cls   = tipo === 'Receita' ? 'dre-positive' : 'dre-negative';
    const d     = new Date(p.data_vencimento + 'T00:00:00');
    const dia   = String(d.getDate()).padStart(2, '0');
    const mes   = String(d.getMonth() + 1).padStart(2, '0');
    return `
      <a href="/pagamentos.html" class="dash-venc-row">
        <div class="dash-venc-date">
          <span class="dash-venc-day">${dia}/${mes}</span>
          <span class="dash-venc-weekday">${DAY_LABELS[d.getDay()]}</span>
        </div>
        <div class="dash-venc-info">
          <span class="dash-venc-name">
            <span class="dash-venc-dot" style="background: ${cat?.cor || '#9CA3AF'};"></span>
            ${escapeHtml(display)}
          </span>
          ${cat ? `<span class="dash-venc-cat">${escapeHtml(cat.nome)}</span>` : ''}
        </div>
        <div class="dash-venc-value ${cls}">${sign}${valor}</div>
      </a>`;
  }).join('');
}

// ── Indicadores BCB ───────────────────────────────────────────

function calcPoupanca(selic) {
  if (selic === null) return null;
  return selic > 8.5 ? (Math.pow(1.005, 12) - 1) * 100 : selic * 0.70;
}

function renderSelic() {
  const container = document.getElementById('dash-selic');
  if (!container) return;

  if (!cachedSelic || cachedSelic.selic === null) {
    container.innerHTML = '<div class="dash-empty">Indicadores indisponíveis no momento.</div>';
    return;
  }

  const fmt = (v) => v !== null ? v.toFixed(2).replace('.', ',') + '%' : '—';
  const poupanca = calcPoupanca(cachedSelic.selic);

  container.innerHTML = `
    <div class="dash-bcb-indicators">
      <div class="dash-bcb-ind dash-bcb-ind--primary">
        <span class="dash-bcb-ind-label">Selic</span>
        <span class="dash-bcb-ind-value">${fmt(cachedSelic.selic)}</span>
        <span class="dash-bcb-ind-sub">meta COPOM · a.a.</span>
      </div>
      <div class="dash-bcb-ind">
        <span class="dash-bcb-ind-label">Poupança</span>
        <span class="dash-bcb-ind-value">${fmt(poupanca)}</span>
        <span class="dash-bcb-ind-sub">${cachedSelic.selic > 8.5 ? '0,5% a.m.' : '70% Selic'}</span>
      </div>
      <div class="dash-bcb-ind">
        <span class="dash-bcb-ind-label">Inflação</span>
        <span class="dash-bcb-ind-value">${fmt(cachedSelic.ipca)}</span>
        <span class="dash-bcb-ind-sub">IPCA · a.a.</span>
      </div>
    </div>
    <div class="dash-bcb-footer">Banco Central do Brasil · BrasilAPI</div>`;
}

// ── Câmbio ────────────────────────────────────────────────────

const CURRENCY_META = {
  USD: { name: 'Dólar americano', flag: '🇺🇸' },
  EUR: { name: 'Euro',            flag: '🇪🇺' },
  GBP: { name: 'Libra esterlina', flag: '🇬🇧' },
  ARS: { name: 'Peso argentino',  flag: '🇦🇷' },
  CAD: { name: 'Dólar canadense', flag: '🇨🇦' },
  JPY: { name: 'Iene japonês',    flag: '🇯🇵' },
  CHF: { name: 'Franco suíço',    flag: '🇨🇭' },
  AUD: { name: 'Dólar australiano', flag: '🇦🇺' },
};

function renderCambio() {
  const container = document.getElementById('dash-cambio');
  if (!container) return;

  if (ratesMap.size === 0) {
    container.innerHTML = '<div class="dash-empty">Cotações indisponíveis no momento.</div>';
    return;
  }

  // USD e EUR primeiro, depois o resto em ordem alfabética
  const priority = ['USD', 'EUR'];
  const others   = [...ratesMap.keys()].filter((c) => !priority.includes(c)).sort();
  const ordered  = [...priority.filter((c) => ratesMap.has(c)), ...others];

  const rows = ordered.map((currency) => {
    const rate = ratesMap.get(currency);
    const meta = CURRENCY_META[currency] || { name: currency, flag: '🌐' };
    const rateStr = rate.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return `
      <div class="dash-cambio-row">
        <span class="dash-cambio-flag" aria-hidden="true">${meta.flag}</span>
        <div class="dash-cambio-info">
          <span class="dash-cambio-code">${currency}</span>
          <span class="dash-cambio-name">${escapeHtml(meta.name)}</span>
        </div>
        <div class="dash-cambio-rate">
          <span class="dash-cambio-value">R$ ${rateStr}</span>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = rows;
}

// ── Top gastos ────────────────────────────────────────────────

function renderTopGastos() {
  const container = document.getElementById('dash-top-gastos');
  if (!container) return;

  // Agrupa despesas pagas por categoria
  const byCat = {};
  for (const p of cachedPagamentos) {
    if (!isPaidStatus(p.status) || p.subcategorias?.tipo !== 'Despesa') continue;
    const cat = p.subcategorias?.categorias;
    if (!cat) continue;
    const val = p.valor_real != null ? Number(p.valor_real) : Number(p.valor_previsto);
    const vBRL = convertToBRL(val || 0, p.moeda, p);
    if (vBRL === null || vBRL === 0) continue;
    if (!byCat[cat.id]) byCat[cat.id] = { nome: cat.nome, cor: cat.cor || '#9CA3AF', total: 0 };
    byCat[cat.id].total += vBRL;
  }

  const top = Object.values(byCat).sort((a, b) => b.total - a.total).slice(0, 6);

  if (top.length === 0) {
    container.innerHTML = '<div class="dash-empty">Sem despesas pagas este mês.</div>';
    return;
  }

  const maxVal = top[0].total;
  container.innerHTML = top.map((cat) => {
    const pct = (cat.total / maxVal) * 100;
    return `
      <div class="dash-top-gastos-row">
        <div class="dash-top-gastos-label">
          <span class="dash-venc-dot" style="background: ${cat.cor};"></span>
          <span class="dash-top-gastos-name">${escapeHtml(cat.nome)}</span>
          <span class="dash-top-gastos-value">${formatCurrencyHTML(cat.total, 'BRL')}</span>
        </div>
        <div class="dash-bloco-bar-track" style="height: 8px;">
          <div class="dash-bloco-bar-fill" style="width: ${pct}%; background: ${cat.cor};"></div>
        </div>
      </div>`;
  }).join('');
}

// ── Transações recentes ───────────────────────────────────────

function grupoToBloco(grupo) {
  if (grupo === 'investimentos') return { label: 'Sonhos',        color: 'var(--color-primary)'   };
  if (grupo === 'custo_vida')    return { label: 'Custo de vida', color: 'var(--color-secondary)' };
  if (grupo)                     return { label: 'Contribuição',  color: 'var(--color-success)'   };
  return null;
}

const TRANS_STATUS_CLS = {
  'Pago':         'dash-trans-status--pago',
  'Transferido':  'dash-trans-status--pago',
  'A Pagar':      'dash-trans-status--agendado',
  'A Transferir': 'dash-trans-status--agendado',
  'Cancelado':    'dash-trans-status--cancelado',
};

function renderTransacoesRecentes() {
  const container = document.getElementById('dash-transacoes');
  if (!container) return;

  if (cachedTransacoes.length === 0) {
    container.innerHTML = '<div class="dash-empty">Nenhuma transação registrada.</div>';
    return;
  }

  container.innerHTML = cachedTransacoes.map((t) => {
    const isReceita = t.tipo === 'Receita';
    const sign  = isReceita ? '+' : '−';
    const cls   = isReceita ? 'dre-positive' : 'dre-negative';
    const valBRL = convertToBRL(Number(t.valor) || 0, t.moeda, t);
    const valor = formatCurrencyHTML(valBRL != null ? valBRL : Number(t.valor) || 0, 'BRL');
    const d     = new Date(t.data + 'T00:00:00');
    const dia   = String(d.getDate()).padStart(2, '0');
    const mes   = String(d.getMonth() + 1).padStart(2, '0');
    const desc  = t.descricao?.trim() || `${t.tipo} sem descrição`;

    const grupo  = t.subcategorias?.categorias?.grupo;
    const bloco  = grupoToBloco(grupo);
    const banco  = t.contas?.apelido?.trim() || t.contas?.nome?.trim() || null;
    const status = t.pagamento?.status || null;

    const blocoHtml = bloco
      ? `<span class="dash-trans-col-val dash-trans-bloco" style="--bloco-color:${bloco.color};">${escapeHtml(bloco.label)}</span>`
      : `<span class="dash-trans-col-val dash-trans-col-val--muted">—</span>`;

    const tipoHtml   = `<span class="dash-trans-col-val ${isReceita ? 'dash-trans-tipo--receita' : 'dash-trans-tipo--despesa'}">${escapeHtml(t.tipo)}</span>`;
    const contaHtml  = banco
      ? `<span class="dash-trans-col-val">${escapeHtml(banco)}</span>`
      : `<span class="dash-trans-col-val dash-trans-col-val--muted">—</span>`;
    const statusHtml = status
      ? `<span class="dash-trans-col-val ${TRANS_STATUS_CLS[status] || ''}">${escapeHtml(status)}</span>`
      : `<span class="dash-trans-col-val dash-trans-col-val--muted">—</span>`;

    return `
      <div class="dash-trans-row">
        <div class="dash-trans-date">${dia}/${mes}</div>
        <div class="dash-trans-info">
          <span class="dash-trans-desc">${escapeHtml(desc)}</span>
          <div class="dash-trans-cols">
            <div class="dash-trans-col"><span class="dash-trans-col-label">Bloco</span>${blocoHtml}</div>
            <div class="dash-trans-col"><span class="dash-trans-col-label">Tipo</span>${tipoHtml}</div>
            <div class="dash-trans-col"><span class="dash-trans-col-label">Conta</span>${contaHtml}</div>
            <div class="dash-trans-col"><span class="dash-trans-col-label">Status</span>${statusHtml}</div>
          </div>
        </div>
        <div class="dash-trans-valor ${cls}">${sign}${valor}</div>
      </div>`;
  }).join('');
}

// ── Utils ─────────────────────────────────────────────────────
