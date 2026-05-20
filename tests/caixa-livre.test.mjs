// =============================================================
// Tests — src/js/lib/caixa-livre.js (funções puras)
// =============================================================
// Run: node --test tests/caixa-livre.test.mjs
// =============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  totalAlocado, carryForward, calcularCaixaLivre,
  labelDestinoTipo, iconeDestinoTipo,
} from '../src/js/lib/caixa-livre.js';

const aloc = (bloco_indice, valor, destino_tipo = 'avulsa', status = 'ativa') =>
  ({ bloco_indice, valor, destino_tipo, status });

// ── totalAlocado ──────────────────────────────────────────────────

test('totalAlocado — vazio retorna 0', () => {
  assert.equal(totalAlocado([], 1), 0);
  assert.equal(totalAlocado(null, 1), 0);
});

test('totalAlocado — soma só do bloco solicitado', () => {
  const a = [aloc(1, 100), aloc(1, 50), aloc(2, 200)];
  assert.equal(totalAlocado(a, 1), 150);
  assert.equal(totalAlocado(a, 2), 200);
});

test('totalAlocado — exclui canceladas', () => {
  const a = [aloc(1, 100), aloc(1, 50, 'avulsa', 'cancelada')];
  assert.equal(totalAlocado(a, 1), 100);
});

// ── carryForward ──────────────────────────────────────────────────

test('carryForward — bloco 1 sempre 0', () => {
  assert.equal(carryForward(1, [aloc(1, 100, 'rollover')]), 0);
});

test('carryForward — soma só rollover do bloco atual', () => {
  const a = [aloc(2, 500, 'rollover'), aloc(2, 100, 'avulsa'), aloc(1, 800, 'rollover')];
  assert.equal(carryForward(2, a), 500);
});

test('carryForward — exclui canceladas', () => {
  const a = [aloc(2, 500, 'rollover'), aloc(2, 200, 'rollover', 'cancelada')];
  assert.equal(carryForward(2, a), 500);
});

// ── calcularCaixaLivre ────────────────────────────────────────────

test('calcularCaixaLivre — bloco 1 sem alocações', () => {
  const r = calcularCaixaLivre(1000, 1, []);
  assert.deepEqual(r, { bruto: 1000, carry: 0, alocado: 0, livre: 1000 });
});

test('calcularCaixaLivre — bloco 2 com carry + alocações', () => {
  const a = [
    aloc(2, 200, 'rollover'),    // carry do bloco 1
    aloc(2, 100, 'investimento'), // alocação real
    aloc(2, 50, 'caixinha'),      // alocação real
  ];
  const r = calcularCaixaLivre(500, 2, a);
  // bruto 500 + carry 200 - alocado 150 = 550
  assert.deepEqual(r, { bruto: 500, carry: 200, alocado: 150, livre: 550 });
});

test('calcularCaixaLivre — rollover do próprio bloco NÃO conta como alocação', () => {
  // O rollover SAINDO desse bloco aparece na lista mas não deve descontar
  const a = [
    aloc(1, 100, 'investimento'),
    aloc(1, 50, 'rollover'),  // saindo para próximo bloco
  ];
  const r = calcularCaixaLivre(1000, 1, a);
  // bruto 1000 - alocado 100 = 900 (50 do rollover não conta)
  assert.equal(r.livre, 900);
});

test('calcularCaixaLivre — saldo negativo é permitido', () => {
  const a = [aloc(1, 2000, 'investimento')];
  const r = calcularCaixaLivre(1000, 1, a);
  assert.equal(r.livre, -1000);
});

// ── helpers visuais ───────────────────────────────────────────────

test('labelDestinoTipo — mapeia tipos conhecidos', () => {
  assert.equal(labelDestinoTipo('investimento'), 'Investimento');
  assert.equal(labelDestinoTipo('divida'), 'Quitar dívida');
  assert.equal(labelDestinoTipo('rollover'), 'Levar pro próximo bloco');
});

test('labelDestinoTipo — devolve o input se desconhecido', () => {
  assert.equal(labelDestinoTipo('xyz'), 'xyz');
});

test('iconeDestinoTipo — devolve emoji ou • default', () => {
  assert.equal(iconeDestinoTipo('investimento'), '🌱');
  assert.equal(iconeDestinoTipo('caixinha'), '🐷');
  assert.equal(iconeDestinoTipo('xyz'), '•');
});
