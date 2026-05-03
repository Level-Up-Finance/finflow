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
import { formatCurrency } from '../lib/compromissos-config.js';
import { initColVisibility } from '../lib/col-visibility.js';

let cachedProjetos = [];
let cachedSubcategorias = []; // só as do grupo investimentos
let cachedPagamentos = [];    // pagos/cartão das subs de investimento
let cachedOrcamento = [];     // mês corrente — pra "previsto neste mês"
let cachedContatos = [];      // clientes/fornecedores do usuário
let editingId = null;
let detailsId = null;
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
  bindEvents();
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

  const [projetos, subcats, pagamentos, orcamento, contatos] = await Promise.all([
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
  ]);

  if (projetos.error) {
    if (/relation.*projetos_investimento/i.test(projetos.error.message)) {
      showToast('Schema desatualizado. Rode a migration 0016 + 0017 no Supabase.', 'error', 12000);
    } else {
      showToast('Erro ao carregar projetos: ' + projetos.error.message, 'error', 8000);
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
}

function populateContatoSelect() {
  const sel = document.getElementById('proj-contato');
  if (!sel) return;
  const opts = ['<option value="">— Sem contato —</option>'];
  for (const c of cachedContatos) {
    opts.push(`<option value="${c.id}">${escapeHtml(c.nome)}</option>`);
  }
  opts.push('<option value="__new__">+ Criar novo contato…</option>');
  sel.innerHTML = opts.join('');
}

async function criarContatoInline(nome) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('contatos')
    .insert({ user_id: user.id, nome, tipo: 'fornecedor' })
    .select()
    .single();
  if (error) {
    let msg = error.message;
    if (/relation.*contatos|column.*contatos/i.test(msg)) {
      msg = 'Tabela contatos não existe — rode a migration 0023 no Supabase.';
    }
    showToast('Erro ao criar contato: ' + msg, 'error', 8000);
    return null;
  }
  cachedContatos.push(data);
  cachedContatos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  showToast(`Contato "${data.nome}" criado`, 'success');
  return data;
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

  // Select de contato: "__new__" abre prompt pra criar inline
  document.getElementById('proj-contato')?.addEventListener('change', async (e) => {
    if (e.target.value !== '__new__') return;
    e.target.value = '';
    const nome = window.prompt('Nome do novo contato (cliente/fornecedor):');
    if (!nome || !nome.trim()) return;
    const novo = await criarContatoInline(nome.trim());
    if (novo) {
      populateContatoSelect();
      e.target.value = novo.id;
    }
  });


  document.getElementById('btn-editar-projeto').addEventListener('click', () => {
    const proj = cachedProjetos.find((p) => p.id === detailsId);
    if (!proj) return;
    closeModal('modal-projeto-details');
    openProjetoModal(proj);
  });

  document.getElementById('btn-arquivar-projeto').addEventListener('click', arquivarProjeto);

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
function render() {
  // Counters por status
  const counts = { todos: cachedProjetos.length, ativo: 0, concluido: 0, pausado: 0, arquivado: 0 };
  cachedProjetos.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.querySelector(`[data-count-status="${k}"]`);
    if (el) el.textContent = v;
  });

  // KPIs (Widget 1: total universal · Widget 2: projetos com meta)
  renderWidgets(counts);

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
function renderWidgets(counts) {
  // ===== Widget 1: Total investido universal =====
  const ativosNaoArq = cachedProjetos.filter((p) => p.status !== 'arquivado');
  const totalUniversal = ativosNaoArq.reduce((sum, p) => sum + calcRealizado(p.id), 0);

  document.getElementById('kpi-universal-value').textContent = formatCurrency(totalUniversal, 'BRL');
  document.getElementById('kpi-universal-sub').textContent =
    `${counts.ativo} projeto${counts.ativo === 1 ? '' : 's'} ativo${counts.ativo === 1 ? '' : 's'}`;
  document.getElementById('kpi-universal-chart').innerHTML = renderUniversalSparkline(ativosNaoArq);

  // ===== Widget 2: Projetos com meta =====
  const projetosComMeta = ativosNaoArq.filter((p) => Number(p.meta_valor) > 0);
  const valueEl = document.getElementById('kpi-meta-value');
  const subEl   = document.getElementById('kpi-meta-sub');
  const chartEl = document.getElementById('kpi-meta-chart');

  if (projetosComMeta.length === 0) {
    valueEl.innerHTML = '<span class="invest-kpi-value-empty">—</span>';
    subEl.textContent = 'Nenhum projeto com meta cadastrada';
    chartEl.innerHTML = '';
    return;
  }

  const metaTotal = projetosComMeta.reduce((sum, p) => sum + (Number(p.meta_valor) || 0), 0);
  const metaRealizado = projetosComMeta.reduce((sum, p) => sum + calcRealizado(p.id), 0);
  const pctMeta = metaTotal > 0 ? Math.min(100, (metaRealizado / metaTotal) * 100) : 0;

  // Valor agora é o total investido em projetos com meta; % vai pro centro do donut
  valueEl.textContent = formatCurrency(metaRealizado, 'BRL');
  subEl.textContent =
    `${projetosComMeta.length} projeto${projetosComMeta.length === 1 ? '' : 's'} · meta ${formatCurrency(metaTotal, 'BRL')}`;
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

  return `
    <article class="projeto-card status-${p.status}" data-id="${p.id}" style="--projeto-cor: ${p.cor};">
      <header class="projeto-card-header">
        <div class="projeto-card-color-bar"></div>
        <div class="projeto-card-titles">
          <h3 class="projeto-card-name">${escapeHtml(p.nome)}</h3>
          <span class="projeto-card-status status-${p.status}">${STATUS_LABELS[p.status] || p.status}</span>
        </div>
      </header>
      ${p.descricao ? `<p class="projeto-card-desc">${escapeHtml(p.descricao)}</p>` : ''}

      <div class="projeto-card-stats">
        <div class="projeto-card-stat">
          <span class="projeto-card-stat-label">Realizado</span>
          <span class="projeto-card-stat-value">${formatCurrency(realizado, 'BRL')}</span>
        </div>
        <div class="projeto-card-stat">
          <span class="projeto-card-stat-label">Previsto este mês</span>
          <span class="projeto-card-stat-value">${formatCurrency(previstoMes, 'BRL')}</span>
        </div>
      </div>

      ${grafico}

      <footer class="projeto-card-footer">
        <span class="projeto-card-subs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
          ${subsCount} compromisso${subsCount === 1 ? '' : 's'}
        </span>
        ${prazo}
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
      ? `Faltam ${formatCurrency(restante, 'BRL')}`
      : '🎯 Meta alcançada';
    return `
      <div class="projeto-card-grafico projeto-card-grafico-meta">
        ${renderDonutSVG(pct, p.cor, 'sm')}
        <div class="projeto-card-grafico-meta-info">
          <div class="projeto-card-grafico-meta-amount">${formatCurrency(realizado, 'BRL')} de ${formatCurrency(meta, 'BRL')}</div>
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
    const metaCell = meta > 0 ? formatCurrency(meta, 'BRL') : '<span class="text-muted">—</span>';
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
        <td data-col="status"><span class="projeto-card-status status-${p.status}">${STATUS_LABELS[p.status] || p.status}</span></td>
        <td data-col="realizado" class="text-right tabular text-bold">${formatCurrency(realizado, 'BRL')}</td>
        <td data-col="previsto-mes" class="text-right tabular">${formatCurrency(previstoMes, 'BRL')}</td>
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
    el.addEventListener('click', () => openDetailsModal(el.dataset.id));
  });
}

// -----------------------------
// Cálculos
// -----------------------------
function calcRealizado(projetoId) {
  const proj = cachedProjetos.find((p) => p.id === projetoId);
  if (!proj) return 0;
  let total = Number(proj.saldo_inicial) || 0;

  // Subs do projeto
  const subIds = cachedSubcategorias.filter((s) => s.projeto_id === projetoId).map((s) => s.id);
  for (const p of cachedPagamentos) {
    if (!subIds.includes(p.subcategoria_id)) continue;
    const v = Number(p.valor_real) || 0;
    total += v;
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
function openProjetoModal(p = null) {
  editingId = p?.id || null;
  document.getElementById('modal-projeto-title').textContent = p ? 'Editar projeto' : 'Novo projeto';
  document.getElementById('btn-salvar-projeto').textContent = p ? 'Salvar alterações' : 'Salvar';

  document.getElementById('form-projeto').reset();
  document.getElementById('proj-nome').value          = p?.nome || '';
  document.getElementById('proj-descricao').value     = p?.descricao || '';
  document.getElementById('proj-cor').value           = p?.cor || '#6D5EF5';
  document.getElementById('proj-status').value        = p?.status || 'ativo';
  document.getElementById('proj-meta-valor').value    = p?.meta_valor ?? '';
  document.getElementById('proj-data-alvo').value     = p?.data_alvo || '';
  document.getElementById('proj-saldo-inicial').value = p?.saldo_inicial ?? '';

  populateContatoSelect();
  document.getElementById('proj-contato').value       = p?.contato_id || '';

  openModal('modal-projeto');
}

async function saveProjeto(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-salvar-projeto');

  const nome = document.getElementById('proj-nome').value.trim();
  if (!nome) { showToast('Informe o nome do projeto', 'error'); return; }

  const contatoRaw = document.getElementById('proj-contato')?.value || '';

  const payload = {
    nome,
    descricao:   document.getElementById('proj-descricao').value.trim() || null,
    cor:         document.getElementById('proj-cor').value,
    status:      document.getElementById('proj-status').value,
    meta_valor:  parseNum(document.getElementById('proj-meta-valor').value),
    data_alvo:   document.getElementById('proj-data-alvo').value || null,
    saldo_inicial: parseNum(document.getElementById('proj-saldo-inicial').value) || 0,
    contato_id:  (contatoRaw && contatoRaw !== '__new__') ? contatoRaw : null,
  };

  const labelOriginal = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    let response;
    if (editingId) {
      response = await supabase.from('projetos_investimento').update(payload).eq('id', editingId).select().single();
    } else {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sessão expirada');
      response = await supabase.from('projetos_investimento').insert({ ...payload, user_id: user.id }).select().single();
    }
    if (response.error) throw response.error;

    showToast(editingId ? 'Projeto atualizado' : 'Projeto criado', 'success');
    closeModal('modal-projeto');
    editingId = null;
    await loadAll();
    render();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = labelOriginal;
    showToast('Erro ao salvar: ' + (err?.message || JSON.stringify(err)), 'error', 8000);
  }
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
        <span class="proj-details-stat-value">${formatCurrency(realizado, 'BRL')}</span>
        ${p.saldo_inicial ? `<span class="proj-details-stat-sub">Inclui saldo inicial: ${formatCurrency(Number(p.saldo_inicial), 'BRL')}</span>` : ''}
      </div>
      <div class="proj-details-stat">
        <span class="proj-details-stat-label">Previsto este mês</span>
        <span class="proj-details-stat-value">${formatCurrency(previsto, 'BRL')}</span>
      </div>
      ${meta > 0 ? `
        <div class="proj-details-stat">
          <span class="proj-details-stat-label">Meta</span>
          <span class="proj-details-stat-value">${formatCurrency(meta, 'BRL')}</span>
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
            <span class="proj-details-sub-valor">${formatCurrency(Number(s.valor_base) || 0, s.moeda || 'BRL')}</span>
          </div>
        `).join('')}</div>`
    }
  `;

  // Histórico (pagamentos efetivados ordenados por data)
  const subIds = subs.map((s) => s.id);
  const historico = cachedPagamentos
    .filter((p) => subIds.includes(p.subcategoria_id))
    .sort((a, b) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));

  const histRowsHtml = [];
  if (Number(p.saldo_inicial) > 0) {
    histRowsHtml.push(`
      <div class="proj-hist-row proj-hist-row-saldo">
        <span class="proj-hist-date">—</span>
        <span class="proj-hist-name">Saldo inicial</span>
        <span class="proj-hist-value">${formatCurrency(Number(p.saldo_inicial), 'BRL')}</span>
      </div>
    `);
  }
  for (const pag of historico) {
    const d = pag.data_vencimento ? formatDateBR(pag.data_vencimento) : '—';
    const subNome = pag.subcategorias?.apelido?.trim() || pag.subcategorias?.nome || '—';
    const v = Number(pag.valor_real) || 0;
    histRowsHtml.push(`
      <div class="proj-hist-row">
        <span class="proj-hist-date">${d}</span>
        <span class="proj-hist-name">${escapeHtml(subNome)} <span class="proj-hist-status">${pag.status}</span></span>
        <span class="proj-hist-value">${formatCurrency(v, 'BRL')}</span>
      </div>
    `);
  }

  document.getElementById('proj-details-historico').innerHTML = `
    <h3 class="proj-details-section-title">Histórico de aportes (${histRowsHtml.length})</h3>
    ${histRowsHtml.length === 0
      ? '<div class="proj-details-empty">Sem aportes registrados ainda. Os pagamentos efetivados (Pago/Cartão) das subcategorias atreladas vão aparecer aqui.</div>'
      : `<div class="proj-hist-list">${histRowsHtml.join('')}</div>`
    }
  `;

  // Botão Arquivar: hide se já está arquivado
  const btnArq = document.getElementById('btn-arquivar-projeto');
  btnArq.classList.toggle('hidden', p.status === 'arquivado');

  openModal('modal-projeto-details');
}

// -----------------------------
// Arquivar projeto
// -----------------------------
async function arquivarProjeto() {
  const p = cachedProjetos.find((x) => x.id === detailsId);
  if (!p) return;
  if (!window.confirm(`Arquivar "${p.nome}"? Ele some da listagem ativa, mas os dados ficam preservados. Você pode reativar depois.`)) return;

  const { error } = await supabase
    .from('projetos_investimento')
    .update({ status: 'arquivado' })
    .eq('id', p.id);
  if (error) {
    showToast('Erro ao arquivar: ' + error.message, 'error', 8000);
    return;
  }
  showToast('Projeto arquivado', 'success');
  closeModal('modal-projeto-details');
  await loadAll();
  render();
}

// -----------------------------
// Utils
// -----------------------------
function isoMonth(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function parseNum(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtPct(pct) {
  return pct.toFixed(1) === '100.0' ? '100%' : `${pct.toFixed(1)}%`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
