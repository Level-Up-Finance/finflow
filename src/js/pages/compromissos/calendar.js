// =============================================================
// FinFlow — Compromissos: view calendar (extraído da página)
// =============================================================
// View independente; recebe dependências via params/callbacks pra
// não tocar no estado mutável de compromissos.js.
//
// Dependências (deps): { displayName, getDisplayValor }
// Para openDayModal também: { getCompromissoById, openDetailsModal }
// =============================================================
import { escapeHtml } from '../../lib/utils.js';
import { formatCurrency, formatCurrencyHTML, tipoPill } from '../../lib/compromissos-config.js';
import { openModal, closeModal } from '../../components/modal.js';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_LABELS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/** Verifica se um compromisso tem ocorrência num dia específico. */
export function occursOn(c, date) {
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

function renderCalendarPopover(events, day, month, deps) {
  const { displayName, getDisplayValor } = deps;
  const sorted = [...events].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'Receita' ? -1 : 1;
    return displayName(a).localeCompare(displayName(b), 'pt-BR');
  });

  let totalReceitas = 0, totalDespesas = 0;
  const items = sorted.map((c) => {
    const dv = getDisplayValor(c);
    const cls = c.tipo === 'Receita' ? 'dre-positive' : 'dre-negative';
    const signedValor = c.tipo === 'Receita' ? dv.valor : -dv.valor;
    if (c.tipo === 'Receita') totalReceitas += dv.valor;
    else totalDespesas += dv.valor;
    const variaTag = dv.isVariavel ? ' <span class="valor-variavel-tag">varia</span>' : '';
    return `
      <li class="calendar-popover-item">
        <span class="calendar-popover-name">${escapeHtml(displayName(c))}</span>
        <span class="calendar-popover-value ${cls}">${formatCurrencyHTML(signedValor, dv.moeda)}${variaTag}</span>
      </li>
    `;
  }).join('');

  const net = totalReceitas - totalDespesas;
  const netCls = net > 0 ? 'dre-positive' : (net < 0 ? 'dre-negative' : 'dre-zero');

  return `
    <div class="calendar-day-popover" role="tooltip">
      <div class="calendar-popover-title">${day} de ${MONTH_LABELS[month]}</div>
      <ul class="calendar-popover-list">${items}</ul>
      <div class="calendar-popover-summary">
        <span class="calendar-popover-summary-label">Saldo do dia</span>
        <span class="${netCls}">${formatCurrencyHTML(net, 'BRL')}</span>
      </div>
    </div>
  `;
}

export function renderCalendar(compromissos, year, month, deps) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = firstDay.getDay(); // 0 = Domingo

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const compsByDay = {};
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    compsByDay[day] = compromissos.filter((c) => occursOn(c, d));
  }

  const monthLabel = `${MONTH_LABELS[month]} ${year}`;
  const weekdayCells = WEEKDAY_LABELS.map((w) => `<div class="calendar-weekday">${w}</div>`).join('');
  const emptyCells = Array.from({ length: firstDayOfWeek }, () =>
    '<div class="calendar-day empty"></div>'
  ).join('');

  const dayCells = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const isToday = d.getFullYear() === today.getFullYear()
                 && d.getMonth() === today.getMonth()
                 && d.getDate() === today.getDate();
    const events = compsByDay[day];
    const hasEvents = events.length > 0;

    const receitaCount = events.filter((c) => c.tipo === 'Receita').length;
    const despesaCount = events.filter((c) => c.tipo === 'Despesa').length;

    const badges = [];
    if (receitaCount > 0) badges.push(`<span class="calendar-badge calendar-badge-receita">+${receitaCount}</span>`);
    if (despesaCount > 0) badges.push(`<span class="calendar-badge calendar-badge-despesa">-${despesaCount}</span>`);
    const badgeHtml = badges.length > 0 ? `<div class="calendar-badges">${badges.join('')}</div>` : '';

    const popoverHtml = hasEvents ? renderCalendarPopover(events, day, month, deps) : '';

    dayCells.push(`
      <div class="calendar-day ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}" data-day="${day}">
        <span class="calendar-day-num">${day}</span>
        ${badgeHtml}
        ${popoverHtml}
      </div>
    `);
  }

  return `
    <div class="calendar">
      <header class="calendar-header">
        <h2 class="calendar-title">${monthLabel}</h2>
        <div class="calendar-nav-group">
          <button class="calendar-nav" id="cal-today" type="button" title="Hoje" style="width: auto; padding: 0 var(--space-3); font-size: var(--fs-xs); font-weight: var(--fw-semibold);">Hoje</button>
          <button class="calendar-nav" id="cal-prev" type="button" aria-label="Mês anterior">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button class="calendar-nav" id="cal-next" type="button" aria-label="Próximo mês">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </header>
      <div class="calendar-grid">
        ${weekdayCells}
        ${emptyCells}
        ${dayCells.join('')}
      </div>
    </div>
  `;
}

/**
 * Liga handlers de navegação + click em dias do calendário.
 * `ctx` deve fornecer: { onPrev, onNext, onToday, onDayClick(day) }.
 */
export function bindCalendarClicks(ctx) {
  document.getElementById('cal-prev').addEventListener('click', ctx.onPrev);
  document.getElementById('cal-next').addEventListener('click', ctx.onNext);
  document.getElementById('cal-today').addEventListener('click', ctx.onToday);

  document.querySelectorAll('.calendar-day.has-events').forEach((dayEl) => {
    dayEl.addEventListener('click', () => ctx.onDayClick(Number(dayEl.dataset.day)));
  });
}

/**
 * Abre o modal #modal-day mostrando os eventos do dia.
 * `deps` deve fornecer: { displayName, getDisplayValor, getCompromissoById, openDetailsModal }
 */
export function openDayModal(date, events, deps) {
  const { displayName, getDisplayValor, getCompromissoById, openDetailsModal } = deps;

  const title = `${date.getDate()} de ${MONTH_LABELS[date.getMonth()]} de ${date.getFullYear()}`;
  document.getElementById('modal-day-title').textContent = title;

  let totalReceitas = 0, totalDespesas = 0;
  events.forEach((c) => {
    const v = getDisplayValor(c).valor;
    if (c.tipo === 'Receita') totalReceitas += v;
    else totalDespesas += v;
  });
  const net = totalReceitas - totalDespesas;
  const netClass = net > 0 ? 'dre-positive' : (net < 0 ? 'dre-negative' : 'dre-zero');

  document.getElementById('day-summary').innerHTML = `
    <div style="flex: 1;"><span style="color: var(--color-text-muted);">Receitas:</span> <strong class="dre-positive">${formatCurrencyHTML(totalReceitas, 'BRL')}</strong></div>
    <div style="flex: 1;"><span style="color: var(--color-text-muted);">Despesas:</span> <strong class="dre-negative">${formatCurrencyHTML(-totalDespesas, 'BRL')}</strong></div>
    <div style="flex: 1;"><span style="color: var(--color-text-muted);">Saldo:</span> <strong class="${netClass}">${formatCurrencyHTML(net, 'BRL')}</strong></div>
  `;

  const sorted = [...events].sort((a, b) => displayName(a).localeCompare(displayName(b), 'pt-BR'));
  const listEl = document.getElementById('day-list');
  if (sorted.length === 0) {
    listEl.innerHTML = '<p style="text-align: center; color: var(--color-text-muted); padding: var(--space-4);">Nenhum compromisso neste dia.</p>';
  } else {
    listEl.innerHTML = sorted.map((c) => {
      const dv = getDisplayValor(c);
      const colorClass = c.tipo === 'Receita' ? 'dre-positive' : 'dre-negative';
      const signedValor = c.tipo === 'Receita' ? dv.valor : -dv.valor;
      const valueDisplay = `${formatCurrencyHTML(signedValor, dv.moeda)}${dv.isVariavel ? ' <span class="valor-variavel-tag">varia</span>' : ''}`;
      return `
        <div class="day-item" data-id="${c.id}">
          <div class="day-item-info">
            <div class="day-item-name">${escapeHtml(displayName(c))}</div>
            <div class="day-item-meta">${tipoPill(c.tipo)} · ${c.periodo}</div>
          </div>
          <div class="day-item-value ${colorClass}">${valueDisplay}</div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.day-item').forEach((item) => {
      item.addEventListener('click', () => {
        const c = getCompromissoById(item.dataset.id);
        if (c) {
          closeModal('modal-day');
          openDetailsModal(c);
        }
      });
    });
  }

  openModal('modal-day');
}
