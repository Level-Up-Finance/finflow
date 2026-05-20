// =============================================================
// FinFlow — Dívidas: Gantt view
// =============================================================
// Pure renderer — recebe lista de dívidas e config de zoom como input.
// Não toca em estado global de dividas.js. Caller injeta STATUS_CONFIG.
import { escapeHtml } from '../../lib/utils.js';
import { formatCurrency } from '../../lib/moedas.js';

const today = new Date();
const MES_ABBR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function getGanttRange(zoom) {
  const now = new Date(today);

  if (zoom === '1ano') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 12, 0);
    const cols  = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return { label: MES_ABBR[d.getMonth()], sublabel: String(d.getFullYear()).slice(2), isCurrent: i === 0 };
    });
    return { start, end, cols };
  }

  if (zoom === '3anos') {
    // quarterly (12 quarters)
    const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const end   = new Date(start.getFullYear() + 3, start.getMonth(), 0);
    const cols  = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth() + i * 3, 1);
      const q = Math.floor(d.getMonth() / 3) + 1;
      const isCurrentQ = d.getFullYear() === now.getFullYear() && q === Math.floor(now.getMonth() / 3) + 1;
      return { label: `Q${q}`, sublabel: String(d.getFullYear()).slice(2), isCurrent: isCurrentQ };
    });
    return { start, end, cols };
  }

  // 5anos
  const start = new Date(now.getFullYear(), 0, 1);
  const end   = new Date(now.getFullYear() + 5, 0, 0);
  const cols  = Array.from({ length: 5 }, (_, i) => ({
    label: String(now.getFullYear() + i),
    isCurrent: i === 0,
  }));
  return { start, end, cols };
}

/**
 * @param {Array} dividas
 * @param {object} opts
 * @param {string} opts.zoom - '1ano' | '3anos' | '5anos'
 * @param {object} opts.statusConfig - { [status]: { color, ... } }
 * @returns {string} HTML do gantt
 */
export function renderGantt(dividas, { zoom = '1ano', statusConfig = {} } = {}) {
  const { start: rangeStart, end: rangeEnd, cols } = getGanttRange(zoom);
  const rangeMs = rangeEnd - rangeStart;

  const zoomBtns = [
    { id: '1ano',  label: '1 ano'  },
    { id: '3anos', label: '3 anos' },
    { id: '5anos', label: '5 anos' },
  ].map((z) =>
    `<button class="timeline-zoom-btn ${zoom === z.id ? 'active' : ''}" data-gantt-zoom="${z.id}" type="button">${z.label}</button>`
  ).join('');

  const colHeaders = cols.map((c) =>
    `<div class="timeline-month ${c.isCurrent ? 'timeline-month-current' : ''}">${c.label}${c.sublabel ? `<span class="timeline-month-year">${c.sublabel}</span>` : ''}</div>`
  ).join('');

  const todayPct = Math.min(100, Math.max(0, ((today - rangeStart) / rangeMs) * 100));
  const todayLine = (today >= rangeStart && today <= rangeEnd)
    ? `<div class="timeline-today" style="left:calc(220px + (100% - 220px) * ${todayPct / 100});" title="Hoje"></div>`
    : '';

  const bars = dividas.map((d) => {
    const st     = statusConfig[d.status] || statusConfig['Ativa'] || { color: '#6D5EF5' };
    const cor    = st.color;
    const dStart = d.data_inicio  ? new Date(d.data_inicio  + 'T00:00:00') : rangeStart;
    const dEnd   = d.data_vencimento ? new Date(d.data_vencimento + 'T23:59:59') : rangeEnd;

    const barStart  = dStart < rangeStart ? rangeStart : dStart;
    const barEnd    = dEnd   > rangeEnd   ? rangeEnd   : dEnd;

    const total   = Number(d.valor_total);
    const pago    = Number(d.valor_pago);
    const fillPct = total > 0 ? Math.min(100, (pago / total) * 100) : 0;

    if (barStart > rangeEnd || barEnd < rangeStart) {
      return `
        <div class="gantt-row timeline-row" data-id="${d.id}">
          <div class="timeline-row-label">
            <span class="timeline-row-dot" style="background:${cor};"></span>
            <span class="timeline-row-name">${escapeHtml(d.nome)}</span>
          </div>
          <div class="timeline-row-track">
            <span class="timeline-row-empty">Fora do período visível</span>
          </div>
        </div>`;
    }

    const leftPct  = Math.max(0, ((barStart - rangeStart) / rangeMs) * 100);
    const widthPct = Math.max(1.5, ((barEnd - barStart) / rangeMs) * 100);

    const fillBar = `<span class="timeline-bar-fill" style="width:${fillPct}%;background:${cor};"></span>`;
    const pctLeft = Math.min(fillPct, 82).toFixed(1);
    const tooltip = `${d.nome} · ${formatCurrency(pago)} pago de ${formatCurrency(total)} (${fillPct.toFixed(0)}%)`;

    return `
      <div class="gantt-row timeline-row" data-id="${d.id}">
        <div class="timeline-row-label">
          <span class="timeline-row-dot" style="background:${cor};"></span>
          <span class="timeline-row-name">${escapeHtml(d.nome)}</span>
        </div>
        <div class="timeline-row-track">
          <div class="timeline-bar" style="left:${leftPct}%;width:${widthPct}%;--projeto-cor:${cor};" title="${escapeHtml(tooltip)}">
            ${fillBar}
            <span class="timeline-bar-pct" style="left:${pctLeft}%;">${fillPct.toFixed(0)}%</span>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="timeline-toolbar">
      <span class="timeline-toolbar-label">Escala:</span>
      <div class="timeline-zoom-group">${zoomBtns}</div>
    </div>
    <div class="timeline-wrapper" style="--timeline-cols:${cols.length};">
      <div class="timeline-header">
        <div class="timeline-row-label timeline-row-label-header">Dívida</div>
        <div class="timeline-months">${colHeaders}</div>
      </div>
      <div class="timeline-body">
        ${bars || '<div class="empty-state"><p class="empty-state-message">Nenhuma dívida no período visível.</p></div>'}
        ${todayLine}
      </div>
    </div>
  `;
}
