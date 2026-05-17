// =============================================================
// FinFlow — Helpers de recorrência (Semanal / Quinzenal)
// =============================================================
// Lógica única de "quando uma recorrência ocorre" — antes ficava
// duplicada (e divergente) em calendar.js, orcamento.js e table.js.
// =============================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Retorna uma cópia de `date` com horas zeradas. */
function atMidnight(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Encontra a primeira ocorrência válida de um compromisso semanal/quinzenal
 * a partir de `iniciadoEm`. Se `iniciadoEm` cai num dia diferente do
 * `diaSemana` configurado, avança até o próximo `diaSemana`.
 *
 * Ex: iniciadoEm=01/05/2026 (Sexta), diaSemana=1 (Segunda)
 *  → firstOccurrence = 04/05/2026 (próxima Segunda)
 *
 * @returns {Date|null}
 */
export function firstOccurrenceAfter(iniciadoEm, diaSemana) {
  if (!iniciadoEm || diaSemana == null) return null;
  const start = atMidnight(iniciadoEm);
  const startDow = start.getDay();
  const daysUntil = ((diaSemana - startDow) + 7) % 7;
  const first = new Date(start);
  first.setDate(start.getDate() + daysUntil);
  return first;
}

/**
 * Verifica se um compromisso recorrente "ocorre" em uma data específica.
 * Suporta Único, Mensal, Anual, Semanal (com intervalo_semanas),
 * Quinzenal. Para Semanal/Quinzenal, alinha o ciclo à PRIMEIRA
 * ocorrência válida (não a iniciado_em bruto).
 */
export function occursOn(c, date) {
  const target = atMidnight(date);
  const start = c.iniciado_em ? atMidnight(c.iniciado_em + 'T00:00:00') : null;
  if (start && target < start) return false;

  if (c.terminado_em) {
    const term = atMidnight(c.terminado_em + 'T00:00:00');
    if (target > term) return false;
  }

  if (c.periodo === 'Único') {
    return !!start && target.getTime() === start.getTime();
  }
  if (c.periodo === 'Mensal') {
    return c.vencimento_dia === target.getDate();
  }
  if (c.periodo === 'Anual') {
    return !!start
      && c.vencimento_dia === target.getDate()
      && start.getMonth() === target.getMonth();
  }
  if (c.periodo === 'Semanal') {
    if (c.dia_semana !== target.getDay()) return false;
    const n = Number(c.intervalo_semanas) || 1;
    if (n <= 1) return true; // semanal toda semana
    if (!start) return true;
    const first = firstOccurrenceAfter(start, c.dia_semana);
    if (!first || target < first) return false;
    const diff = Math.round((target - first) / MS_PER_DAY);
    return diff % (n * 7) === 0;
  }
  if (c.periodo === 'Quinzenal') {
    if (c.dia_semana !== target.getDay() || !start) return false;
    const first = firstOccurrenceAfter(start, c.dia_semana);
    if (!first || target < first) return false;
    const diff = Math.round((target - first) / MS_PER_DAY);
    return diff % 14 === 0;
  }
  return false;
}

/**
 * Calcula a próxima ocorrência a partir de `fromDate` (default: hoje).
 * Retorna `null` se a recorrência já terminou (terminado_em < fromDate).
 */
export function nextOccurrence(c, fromDate = new Date()) {
  const today = atMidnight(fromDate);

  if (c.terminado_em) {
    const term = atMidnight(c.terminado_em + 'T00:00:00');
    if (term < today) return null;
  }

  const start = c.iniciado_em ? atMidnight(c.iniciado_em + 'T00:00:00') : null;

  if (c.periodo === 'Único') {
    if (!start) return null;
    return start >= today ? start : null;
  }

  if (c.periodo === 'Anual') {
    const dia = c.vencimento_dia;
    if (!dia) return null;
    const refMonth = start ? start.getMonth() : today.getMonth();
    let next = new Date(today.getFullYear(), refMonth, dia);
    if (next < today) next = new Date(today.getFullYear() + 1, refMonth, dia);
    return next;
  }

  if (c.periodo === 'Mensal') {
    const dia = c.vencimento_dia;
    if (!dia) return null;
    let next = new Date(today.getFullYear(), today.getMonth(), dia);
    if (next < today) next = new Date(today.getFullYear(), today.getMonth() + 1, dia);
    return next;
  }

  if (c.periodo === 'Semanal') {
    if (c.dia_semana == null) return null;
    const n = Number(c.intervalo_semanas) || 1;
    // Primeira ocorrência válida (na semana de iniciado_em ou depois)
    const first = start ? firstOccurrenceAfter(start, c.dia_semana) : null;
    if (n <= 1 || !first) {
      // Sem âncora de ciclo → próximo dia_semana a partir de hoje
      const dow = today.getDay();
      const daysUntil = (c.dia_semana - dow + 7) % 7;
      const next = new Date(today);
      next.setDate(today.getDate() + daysUntil);
      // Respeita data de início
      if (start && next < start) {
        const fromStartDow = start.getDay();
        const daysFromStart = (c.dia_semana - fromStartDow + 7) % 7;
        const result = new Date(start);
        result.setDate(start.getDate() + daysFromStart);
        return result;
      }
      return next;
    }
    // Com intervalo > 1: ciclo ancorado na primeira ocorrência
    if (today <= first) return first;
    const cycleDays = n * 7;
    const diff = Math.round((today - first) / MS_PER_DAY);
    const k = Math.ceil(diff / cycleDays);
    const next = new Date(first);
    next.setDate(first.getDate() + k * cycleDays);
    return next;
  }

  if (c.periodo === 'Quinzenal') {
    if (c.dia_semana == null || !start) return null;
    const first = firstOccurrenceAfter(start, c.dia_semana);
    if (!first) return null;
    if (today <= first) return first;
    const diff = Math.round((today - first) / MS_PER_DAY);
    const k = Math.ceil(diff / 14);
    const next = new Date(first);
    next.setDate(first.getDate() + k * 14);
    return next;
  }

  return null;
}

/** Conta quantas vezes o compromisso ocorre em um mês específico. */
export function countOccurrencesInMonth(c, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    if (occursOn(c, new Date(year, month, day))) count++;
  }
  return count;
}

/** Retorna as datas em que o compromisso ocorre no mês. */
export function getOccurrenceDatesInMonth(c, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    if (occursOn(c, d)) dates.push(d);
  }
  return dates;
}
