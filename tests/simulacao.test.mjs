// =============================================================
// Tests — src/js/lib/simulacao.js
// =============================================================
// Run: node --test tests/simulacao.test.mjs
// =============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  saldoFinal, tempoNecessario, aporteNecessario,
} from '../src/js/lib/simulacao.js';

// Helper pra comparar floats com tolerância
const near = (a, b, eps = 1e-2) => Math.abs(a - b) <= eps;

// ── saldoFinal ────────────────────────────────────────────────────

test('saldoFinal — sem juros (i=0)', () => {
  // PV=1000, PMT=100/mês, n=12 meses → 1000 + 100*12 = 2200
  assert.equal(saldoFinal(1000, 100, 0, 12), 2200);
});

test('saldoFinal — só saldo inicial, sem aportes', () => {
  // PV=1000, PMT=0, i=1%, n=12 → 1000 * 1.01^12 ≈ 1126.83
  const fv = saldoFinal(1000, 0, 0.01, 12);
  assert.ok(near(fv, 1126.83, 0.5), `esperado ~1126.83, recebi ${fv}`);
});

test('saldoFinal — só aportes, sem saldo inicial', () => {
  // PV=0, PMT=100, i=1%, n=12 → 100 * (1.01^12 - 1) / 0.01 ≈ 1268.25
  const fv = saldoFinal(0, 100, 0.01, 12);
  assert.ok(near(fv, 1268.25, 0.5), `esperado ~1268.25, recebi ${fv}`);
});

test('saldoFinal — n=0 retorna PV', () => {
  assert.equal(saldoFinal(500, 100, 0.01, 0), 500);
});

test('saldoFinal — entradas inválidas', () => {
  // Strings vazias viram 0
  assert.equal(saldoFinal(null, null, null, null), 0);
  assert.equal(saldoFinal('', '', '', ''), 0);
});

// ── tempoNecessario ───────────────────────────────────────────────

test('tempoNecessario — FV <= PV retorna 0', () => {
  assert.equal(tempoNecessario(1000, 100, 0.01, 1000), 0);
  assert.equal(tempoNecessario(1000, 100, 0.01, 500), 0);
});

test('tempoNecessario — sem juros (i=0)', () => {
  // FV=2200, PV=1000, PMT=100 → (2200-1000)/100 = 12 meses
  assert.equal(tempoNecessario(1000, 100, 0, 2200), 12);
});

test('tempoNecessario — sem juros e sem aporte é impossível', () => {
  assert.equal(tempoNecessario(1000, 0, 0, 2000), null);
});

test('tempoNecessario — caso realista', () => {
  // Pra dobrar 10.000 com 200/mês a 1%/mês
  const n = tempoNecessario(10000, 200, 0.01, 20000);
  assert.ok(n > 0 && n < 100, `n=${n} fora do esperado`);
});

// ── aporteNecessario ──────────────────────────────────────────────

test('aporteNecessario — n=0 retorna null', () => {
  assert.equal(aporteNecessario(1000, 0.01, 0, 5000), null);
});

test('aporteNecessario — sem juros', () => {
  // FV=2200, PV=1000, n=12 → (2200-1000)/12 = 100
  assert.equal(aporteNecessario(1000, 0, 12, 2200), 100);
});

test('aporteNecessario — PV já chega lá com juros, retorna 0', () => {
  // PV=10000, i=1%, n=12 → 10000*1.01^12 ≈ 11268. Pedindo FV=10500: já passou
  const pmt = aporteNecessario(10000, 0.01, 12, 10500);
  assert.equal(pmt, 0);
});

test('aporteNecessario — caso realista coerente com saldoFinal', () => {
  // Calcula aporte pra chegar em 50000 em 24 meses a 0.8%/mês com PV=5000
  const pmt = aporteNecessario(5000, 0.008, 24, 50000);
  assert.ok(pmt > 0);
  // Verifica round-trip: aplicar esse PMT chega no FV
  const fv = saldoFinal(5000, pmt, 0.008, 24);
  assert.ok(near(fv, 50000, 1), `round-trip falhou: fv=${fv}`);
});

// ── round-trip entre as 3 funções ─────────────────────────────────

test('round-trip — saldoFinal → tempoNecessario', () => {
  const fv = saldoFinal(1000, 200, 0.005, 36);
  const n = tempoNecessario(1000, 200, 0.005, fv);
  assert.ok(near(n, 36, 0.1), `n=${n}, esperado ~36`);
});
