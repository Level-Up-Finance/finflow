// =============================================================
// Tests — src/js/lib/amortizacao.js
// =============================================================
// Run: node --test tests/amortizacao.test.mjs
// =============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  gerarTabela, aplicarCorrecao, validarFases,
} from '../src/js/lib/amortizacao.js';

const near = (a, b, eps = 1e-2) => Math.abs(a - b) <= eps;

// ── gerarTabela — SAC ─────────────────────────────────────────────

test('SAC — sem juros gera amortização constante e saldo zera no fim', () => {
  const t = gerarTabela('SAC', 1200, 0, 12);
  assert.equal(t.length, 12);
  assert.equal(t[0].amortizacao, 100);
  assert.equal(t[11].amortizacao, 100);
  assert.equal(t[11].saldo_final, 0);
});

test('SAC — com juros: amortização constante, parcela decrescente', () => {
  const t = gerarTabela('SAC', 12000, 0.01, 12);
  assert.equal(t.length, 12);
  // Amortização sempre 1000
  assert.ok(t.every((r) => near(r.amortizacao, 1000)));
  // Parcela primeira > parcela última (juros caem com saldo)
  assert.ok(t[0].parcela > t[11].parcela);
  // Saldo final zera
  assert.ok(near(t[11].saldo_final, 0));
});

// ── gerarTabela — Price ───────────────────────────────────────────

test('Price — sem juros: parcela = principal/n', () => {
  const t = gerarTabela('Price', 1200, 0, 12);
  assert.equal(t.length, 12);
  assert.ok(t.every((r) => near(r.parcela, 100)));
  assert.ok(near(t[11].saldo_final, 0));
});

test('Price — com juros: parcela constante, juros decrescentes', () => {
  const t = gerarTabela('Price', 10000, 0.01, 12);
  assert.equal(t.length, 12);
  // Parcela constante
  const pmt = t[0].parcela;
  assert.ok(t.every((r) => near(r.parcela, pmt)));
  // Juros do primeiro mês > juros do último
  assert.ok(t[0].juros > t[11].juros);
  // Amortização cresce
  assert.ok(t[0].amortizacao < t[11].amortizacao);
  // Saldo final zera
  assert.ok(near(t[11].saldo_final, 0, 0.01));
});

// ── gerarTabela — Customizado ─────────────────────────────────────

test('Customizado — 3 fases distintas', () => {
  const fases = [
    { de: 1, ate: 6,  valor: 100 },
    { de: 7, ate: 11, valor: 200 },
    { de: 12, ate: 12, valor: 500 },
  ];
  const t = gerarTabela('Customizado', 1500, 0, 12, fases);
  assert.equal(t.length, 12);
  assert.equal(t[0].parcela, 100);
  assert.equal(t[6].parcela, 200);
  assert.equal(t[11].parcela, 500);
});

test('Customizado — fase auto:true quita o saldo restante', () => {
  const fases = [
    { de: 1, ate: 11, valor: 100 },
    { de: 12, ate: 12, auto: true },
  ];
  const t = gerarTabela('Customizado', 2000, 0, 12, fases);
  // Mensal de 100 por 11 meses = 1100 amortizado; resta 900
  // Última parcela: saldo + juros (juros=0 → 900)
  assert.equal(t[11].parcela, 900);
  assert.ok(near(t[11].saldo_final, 0));
});

// ── gerarTabela — bordas ──────────────────────────────────────────

test('gerarTabela — n=0 ou principal=0 retorna vazio', () => {
  assert.deepEqual(gerarTabela('SAC', 0, 0.01, 12), []);
  assert.deepEqual(gerarTabela('Price', 1000, 0.01, 0), []);
});

test('gerarTabela — regime desconhecido retorna vazio', () => {
  assert.deepEqual(gerarTabela('XYZ', 1000, 0.01, 12), []);
});

// ── aplicarCorrecao ───────────────────────────────────────────────

test('aplicarCorrecao — corrMensal=0 retorna tabela inalterada', () => {
  const t = gerarTabela('SAC', 1200, 0, 12);
  const c = aplicarCorrecao(t, 0);
  assert.deepEqual(c, t);
});

test('aplicarCorrecao — parcela 1 não muda, parcela n cresce', () => {
  const t = gerarTabela('Price', 1200, 0, 12);
  const c = aplicarCorrecao(t, 0.01); // 1% ao mês
  assert.equal(c[0].parcela, t[0].parcela); // (1+0.01)^0 = 1
  assert.ok(c[11].parcela > t[11].parcela);
  // fator do mês 12 = 1.01^11 ≈ 1.1157
  assert.ok(near(c[11].parcela / t[11].parcela, 1.1157, 0.001));
});

// ── validarFases ──────────────────────────────────────────────────

test('validarFases — array vazio', () => {
  assert.equal(validarFases([], 12), 'Defina ao menos uma fase');
  assert.equal(validarFases(null, 12), 'Defina ao menos uma fase');
});

test('validarFases — primeira fase não começa em 1', () => {
  const r = validarFases([{ de: 2, ate: 12, valor: 100 }], 12);
  assert.match(r, /primeira fase/i);
});

test('validarFases — última fase não termina em n', () => {
  const r = validarFases([{ de: 1, ate: 6, valor: 100 }], 12);
  assert.match(r, /última fase deve terminar/i);
});

test('validarFases — gap entre fases', () => {
  const r = validarFases([
    { de: 1, ate: 4, valor: 100 },
    { de: 6, ate: 12, valor: 200 },
  ], 12);
  assert.match(r, /gap/i);
});

test('validarFases — fase com valor zero', () => {
  const r = validarFases([{ de: 1, ate: 12, valor: 0 }], 12);
  assert.match(r, /valor deve ser positivo/i);
});

test('validarFases — fase auto:true pode ter valor zero/undefined', () => {
  const r = validarFases([
    { de: 1, ate: 11, valor: 100 },
    { de: 12, ate: 12, auto: true },
  ], 12);
  assert.equal(r, null);
});

test('validarFases — fases corretas retorna null', () => {
  const r = validarFases([
    { de: 1, ate: 6,  valor: 100 },
    { de: 7, ate: 12, valor: 200 },
  ], 12);
  assert.equal(r, null);
});
