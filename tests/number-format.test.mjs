// =============================================================
// Tests — src/js/lib/number-format.js
// =============================================================
// Run: node --test tests/number-format.test.mjs
// =============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDecimal, formatDecimal } from '../src/js/lib/number-format.js';

// ── parseDecimal ──────────────────────────────────────────────────

test('parseDecimal — BR completo (1.234,56)', () => {
  assert.equal(parseDecimal('1.234,56'), 1234.56);
});

test('parseDecimal — BR simples (1234,56)', () => {
  assert.equal(parseDecimal('1234,56'), 1234.56);
});

test('parseDecimal — US completo (1,234.56)', () => {
  assert.equal(parseDecimal('1,234.56'), 1234.56);
});

test('parseDecimal — puro (1234.56)', () => {
  assert.equal(parseDecimal('1234.56'), 1234.56);
});

test('parseDecimal — milhares BR (10.000)', () => {
  // Sem decimal: heurística "só ponto → deixa como está" → 10.000 = 10
  // (caso ambíguo; documentando o comportamento atual)
  assert.equal(parseDecimal('10.000'), 10);
});

test('parseDecimal — número direto', () => {
  assert.equal(parseDecimal(42.5), 42.5);
  assert.equal(parseDecimal(0), 0);
});

test('parseDecimal — vazio/null/NaN', () => {
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal(null), null);
  assert.equal(parseDecimal(undefined), null);
  assert.equal(parseDecimal('abc'), null);
  assert.equal(parseDecimal(NaN), null);
  assert.equal(parseDecimal(Infinity), null);
});

test('parseDecimal — espaços ao redor', () => {
  assert.equal(parseDecimal('  1234,56  '), 1234.56);
});

test('parseDecimal — negativo', () => {
  assert.equal(parseDecimal('-1.234,56'), -1234.56);
});

// ── formatDecimal ─────────────────────────────────────────────────

test('formatDecimal — padrão 2 casas BR', () => {
  assert.equal(formatDecimal(1234.56), '1.234,56');
});

test('formatDecimal — zero', () => {
  assert.equal(formatDecimal(0), '0,00');
});

test('formatDecimal — sem casas decimais', () => {
  assert.equal(formatDecimal(1234, 0), '1.234');
});

test('formatDecimal — 4 casas', () => {
  assert.equal(formatDecimal(0.12345, 4), '0,1235');
});

test('formatDecimal — null/NaN devolve string vazia', () => {
  assert.equal(formatDecimal(null), '');
  assert.equal(formatDecimal(NaN), '');
});

test('formatDecimal — negativo', () => {
  assert.equal(formatDecimal(-1234.5), '-1.234,50');
});

// ── round-trip parse ↔ format ─────────────────────────────────────

test('round-trip BR → parse → format', () => {
  const formatted = '12.345,67';
  const parsed = parseDecimal(formatted);
  assert.equal(formatDecimal(parsed), formatted);
});
