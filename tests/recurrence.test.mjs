// =============================================================
// Tests — src/js/lib/recurrence.js
// =============================================================
// Run: node --test tests/recurrence.test.mjs
// =============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  firstOccurrenceAfter,
  occursOn,
  nextOccurrence,
  countOccurrencesInMonth,
  getOccurrenceDatesInMonth,
} from '../src/js/lib/recurrence.js';

// ── Helpers ────────────────────────────────────────────────────────────────
function d(iso) { return new Date(iso + 'T00:00:00'); }
const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6, SUN = 0;

// ─────────────────────────────────────────────────────────────────────────
// firstOccurrenceAfter
// ─────────────────────────────────────────────────────────────────────────

test('firstOccurrenceAfter — Sexta 01/05/2026, Segunda → 04/05/2026', () => {
  const start = d('2026-05-01'); // Friday
  const first = firstOccurrenceAfter(start, MON);
  assert.equal(first.toISOString().slice(0, 10), '2026-05-04');
});

test('firstOccurrenceAfter — Segunda 04/05/2026, Segunda → mesmo dia', () => {
  const start = d('2026-05-04'); // Monday
  const first = firstOccurrenceAfter(start, MON);
  assert.equal(first.toISOString().slice(0, 10), '2026-05-04');
});

test('firstOccurrenceAfter — Sábado, Domingo → próximo Domingo', () => {
  const start = d('2026-05-02'); // Saturday
  const first = firstOccurrenceAfter(start, SUN);
  assert.equal(first.toISOString().slice(0, 10), '2026-05-03');
});

test('firstOccurrenceAfter — null/undefined retorna null', () => {
  assert.equal(firstOccurrenceAfter(null, MON), null);
  assert.equal(firstOccurrenceAfter(d('2026-05-01'), null), null);
});

// ─────────────────────────────────────────────────────────────────────────
// occursOn — Caso Gás de Cozinha (regression test do bug raiz)
// ─────────────────────────────────────────────────────────────────────────

const gasDeCozinha = {
  periodo: 'Semanal',
  dia_semana: MON,
  intervalo_semanas: 6,
  iniciado_em: '2026-05-01', // Sexta
};

test('occursOn — Gás (a cada 6sem, Seg, init Sex 01/05): ocorrências corretas', () => {
  // Primeira ocorrência: 04/05 (próxima Segunda após 01/05)
  assert.equal(occursOn(gasDeCozinha, d('2026-05-04')), true, '04/05 deve ocorrer');
  // Segundas no caminho não-ciclo: 11/05, 18/05, 25/05
  assert.equal(occursOn(gasDeCozinha, d('2026-05-11')), false, '11/05 NÃO deve ocorrer');
  assert.equal(occursOn(gasDeCozinha, d('2026-05-18')), false, '18/05 NÃO deve ocorrer');
  assert.equal(occursOn(gasDeCozinha, d('2026-05-25')), false, '25/05 NÃO deve ocorrer');
  // Próxima do ciclo: 04/05 + 42d = 15/06
  assert.equal(occursOn(gasDeCozinha, d('2026-06-15')), true, '15/06 deve ocorrer');
  // E 27/07 (+42)
  assert.equal(occursOn(gasDeCozinha, d('2026-07-27')), true, '27/07 deve ocorrer');
});

test('occursOn — antes de iniciado_em retorna false', () => {
  assert.equal(occursOn(gasDeCozinha, d('2026-04-27')), false);
});

test('occursOn — depois de terminado_em retorna false', () => {
  const ended = { ...gasDeCozinha, terminado_em: '2026-06-01' };
  assert.equal(occursOn(ended, d('2026-06-15')), false);
});

// ─────────────────────────────────────────────────────────────────────────
// occursOn — Semanal puro (intervalo = 1)
// ─────────────────────────────────────────────────────────────────────────

test('occursOn — Semanal toda Segunda', () => {
  const sub = { periodo: 'Semanal', dia_semana: MON, intervalo_semanas: 1, iniciado_em: '2026-05-01' };
  assert.equal(occursOn(sub, d('2026-05-04')), true);
  assert.equal(occursOn(sub, d('2026-05-11')), true);
  assert.equal(occursOn(sub, d('2026-05-18')), true);
  assert.equal(occursOn(sub, d('2026-05-25')), true);
  // Terça não vale
  assert.equal(occursOn(sub, d('2026-05-05')), false);
});

// ─────────────────────────────────────────────────────────────────────────
// occursOn — Quinzenal
// ─────────────────────────────────────────────────────────────────────────

test('occursOn — Quinzenal Segunda iniciado em Sex 01/05', () => {
  const sub = { periodo: 'Quinzenal', dia_semana: MON, iniciado_em: '2026-05-01' };
  // Primeira ocorrência válida: 04/05 (próxima Segunda)
  assert.equal(occursOn(sub, d('2026-05-04')), true);
  // +14 dias: 18/05
  assert.equal(occursOn(sub, d('2026-05-18')), true);
  // 11/05 não cai no ciclo
  assert.equal(occursOn(sub, d('2026-05-11')), false);
  // +14: 01/06
  assert.equal(occursOn(sub, d('2026-06-01')), true);
});

// ─────────────────────────────────────────────────────────────────────────
// occursOn — Mensal / Anual / Único
// ─────────────────────────────────────────────────────────────────────────

test('occursOn — Mensal dia 18', () => {
  const sub = { periodo: 'Mensal', vencimento_dia: 18, iniciado_em: '2026-01-01' };
  assert.equal(occursOn(sub, d('2026-05-18')), true);
  assert.equal(occursOn(sub, d('2026-06-18')), true);
  assert.equal(occursOn(sub, d('2026-05-17')), false);
});

test('occursOn — Anual: só no mesmo mês de iniciado_em, no dia configurado', () => {
  const sub = { periodo: 'Anual', vencimento_dia: 15, iniciado_em: '2026-08-15' };
  assert.equal(occursOn(sub, d('2026-08-15')), true);
  assert.equal(occursOn(sub, d('2027-08-15')), true);
  assert.equal(occursOn(sub, d('2026-09-15')), false);
});

test('occursOn — Único: só na data exata', () => {
  const sub = { periodo: 'Único', iniciado_em: '2026-05-15' };
  assert.equal(occursOn(sub, d('2026-05-15')), true);
  assert.equal(occursOn(sub, d('2026-05-14')), false);
  assert.equal(occursOn(sub, d('2026-05-16')), false);
});

// ─────────────────────────────────────────────────────────────────────────
// nextOccurrence
// ─────────────────────────────────────────────────────────────────────────

test('nextOccurrence — Gás (init Sex 01/05) consultado em 17/05', () => {
  const next = nextOccurrence(gasDeCozinha, d('2026-05-17'));
  assert.equal(next.toISOString().slice(0, 10), '2026-06-15');
});

test('nextOccurrence — Gás consultado em 04/05 (dia da 1ª ocorrência)', () => {
  // Se a data de hoje É exatamente a 1ª ocorrência, ela deve ser retornada
  const next = nextOccurrence(gasDeCozinha, d('2026-05-04'));
  assert.equal(next.toISOString().slice(0, 10), '2026-05-04');
});

test('nextOccurrence — Semanal toda Segunda, hoje Dom 03/05', () => {
  const sub = { periodo: 'Semanal', dia_semana: MON, intervalo_semanas: 1, iniciado_em: '2026-05-01' };
  const next = nextOccurrence(sub, d('2026-05-03'));
  assert.equal(next.toISOString().slice(0, 10), '2026-05-04');
});

test('nextOccurrence — Mensal dia 18, hoje 20', () => {
  const sub = { periodo: 'Mensal', vencimento_dia: 18, iniciado_em: '2026-01-01' };
  const next = nextOccurrence(sub, d('2026-05-20'));
  assert.equal(next.toISOString().slice(0, 10), '2026-06-18');
});

test('nextOccurrence — depois de terminado_em retorna null', () => {
  const sub = { ...gasDeCozinha, terminado_em: '2026-04-30' };
  assert.equal(nextOccurrence(sub, d('2026-05-17')), null);
});

// ─────────────────────────────────────────────────────────────────────────
// countOccurrencesInMonth — Caso Gás (regression: Maio 2026 deve ter 1)
// ─────────────────────────────────────────────────────────────────────────

test('countOccurrencesInMonth — Gás em Maio 2026: 1 ocorrência (04/05)', () => {
  assert.equal(countOccurrencesInMonth(gasDeCozinha, 2026, 4), 1);
});

test('countOccurrencesInMonth — Gás em Junho 2026: 1 ocorrência (15/06)', () => {
  assert.equal(countOccurrencesInMonth(gasDeCozinha, 2026, 5), 1);
});

test('countOccurrencesInMonth — Gás em Abril 2026: 0 (antes de iniciado_em)', () => {
  assert.equal(countOccurrencesInMonth(gasDeCozinha, 2026, 3), 0);
});

test('countOccurrencesInMonth — Semanal toda Segunda em Maio 2026: 4', () => {
  const sub = { periodo: 'Semanal', dia_semana: MON, intervalo_semanas: 1, iniciado_em: '2026-05-01' };
  assert.equal(countOccurrencesInMonth(sub, 2026, 4), 4); // 04, 11, 18, 25
});

test('countOccurrencesInMonth — Mensal dia 15 em qualquer mês: 1', () => {
  const sub = { periodo: 'Mensal', vencimento_dia: 15, iniciado_em: '2026-01-01' };
  assert.equal(countOccurrencesInMonth(sub, 2026, 4), 1);
  assert.equal(countOccurrencesInMonth(sub, 2026, 0), 1);
});

// ─────────────────────────────────────────────────────────────────────────
// getOccurrenceDatesInMonth
// ─────────────────────────────────────────────────────────────────────────

test('getOccurrenceDatesInMonth — Semanal toda Segunda em Maio 2026', () => {
  const sub = { periodo: 'Semanal', dia_semana: MON, intervalo_semanas: 1, iniciado_em: '2026-05-01' };
  const dates = getOccurrenceDatesInMonth(sub, 2026, 4);
  const isos = dates.map((dt) => dt.toISOString().slice(0, 10));
  assert.deepEqual(isos, ['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25']);
});

// ─────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────

test('occursOn — sem dia_semana retorna false (Semanal)', () => {
  const sub = { periodo: 'Semanal', dia_semana: null, iniciado_em: '2026-05-01' };
  assert.equal(occursOn(sub, d('2026-05-04')), false);
});

test('nextOccurrence — Único no passado retorna null', () => {
  const sub = { periodo: 'Único', iniciado_em: '2026-01-01' };
  assert.equal(nextOccurrence(sub, d('2026-05-17')), null);
});

test('nextOccurrence — Único no futuro retorna a data', () => {
  const sub = { periodo: 'Único', iniciado_em: '2026-12-25' };
  const next = nextOccurrence(sub, d('2026-05-17'));
  assert.equal(next.toISOString().slice(0, 10), '2026-12-25');
});
