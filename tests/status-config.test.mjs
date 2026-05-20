// =============================================================
// Tests — src/js/lib/status-config.js
// =============================================================
// Run: node --test tests/status-config.test.mjs
// =============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STATUS_IDS, STATUS_RULES, STATUS_BY_CONTEXT,
  statusIdFromDb, statusConfig, calcularBadgeAtraso,
  statusOrder, renderStatusOptions,
} from '../src/js/lib/status-config.js';

// ── Invariantes ───────────────────────────────────────────────────

test('STATUS_IDS tem 6 ids semânticos esperados', () => {
  assert.deepEqual(STATUS_IDS, [
    'sem_definicao', 'a_comecar', 'em_curso', 'pausado', 'sucesso', 'arquivado',
  ]);
});

test('STATUS_RULES tem 1 regra por id', () => {
  STATUS_IDS.forEach((id) => {
    assert.ok(STATUS_RULES[id], `Sem regra para ${id}`);
    const r = STATUS_RULES[id];
    assert.equal(typeof r.exigeData, 'boolean');
    assert.equal(typeof r.geraCompromisso, 'boolean');
    assert.equal(typeof r.terminado, 'boolean');
    assert.equal(typeof r.permiteAtraso, 'boolean');
  });
});

test('STATUS_BY_CONTEXT cobre divida e investimento', () => {
  assert.ok(STATUS_BY_CONTEXT.divida);
  assert.ok(STATUS_BY_CONTEXT.investimento);
  STATUS_IDS.forEach((id) => {
    assert.ok(STATUS_BY_CONTEXT.divida[id], `divida sem ${id}`);
    assert.ok(STATUS_BY_CONTEXT.investimento[id], `investimento sem ${id}`);
  });
  assert.ok(STATUS_BY_CONTEXT.divida.badgeAtraso);
  assert.ok(STATUS_BY_CONTEXT.investimento.badgeAtraso);
});

// ── statusIdFromDb ────────────────────────────────────────────────

test('statusIdFromDb — divida', () => {
  assert.equal(statusIdFromDb('Sem plano', 'divida'), 'sem_definicao');
  assert.equal(statusIdFromDb('A pagar', 'divida'), 'a_comecar');
  assert.equal(statusIdFromDb('Pagando', 'divida'), 'em_curso');
  assert.equal(statusIdFromDb('Em negociação', 'divida'), 'pausado');
  assert.equal(statusIdFromDb('Quitada', 'divida'), 'sucesso');
  assert.equal(statusIdFromDb('Arquivada', 'divida'), 'arquivado');
});

test('statusIdFromDb — investimento', () => {
  assert.equal(statusIdFromDb('Sem meta', 'investimento'), 'sem_definicao');
  assert.equal(statusIdFromDb('A começar', 'investimento'), 'a_comecar');
  assert.equal(statusIdFromDb('Aportando', 'investimento'), 'em_curso');
  assert.equal(statusIdFromDb('Pausado', 'investimento'), 'pausado');
  assert.equal(statusIdFromDb('Concluído', 'investimento'), 'sucesso');
  assert.equal(statusIdFromDb('Arquivado', 'investimento'), 'arquivado');
});

test('statusIdFromDb — valor inválido retorna null', () => {
  assert.equal(statusIdFromDb('XYZ', 'divida'), null);
  assert.equal(statusIdFromDb('A pagar', 'inexistente'), null);
  assert.equal(statusIdFromDb(null, 'divida'), null);
});

// ── statusConfig ──────────────────────────────────────────────────

test('statusConfig — devolve label, color, desc e rules', () => {
  const cfg = statusConfig('Pagando', 'divida');
  assert.equal(cfg.id, 'em_curso');
  assert.equal(cfg.label, 'Pagando');
  assert.ok(cfg.color);
  assert.ok(cfg.desc);
  assert.equal(cfg.rules.geraCompromisso, true);
});

test('statusConfig — null para entrada inválida', () => {
  assert.equal(statusConfig('XYZ', 'divida'), null);
});

// ── calcularBadgeAtraso ───────────────────────────────────────────

const HOJE_ISO = new Date().toISOString().slice(0, 10);
const ONTEM_ISO = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
const AMANHA_ISO = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

test('calcularBadgeAtraso — divida A pagar com data passada → Atrasada', () => {
  const b = calcularBadgeAtraso({ data_vencimento: ONTEM_ISO }, 'A pagar', 'divida');
  assert.ok(b);
  assert.equal(b.label, 'Atrasada');
});

test('calcularBadgeAtraso — divida Pagando com data futura → null', () => {
  const b = calcularBadgeAtraso({ data_vencimento: AMANHA_ISO }, 'Pagando', 'divida');
  assert.equal(b, null);
});

test('calcularBadgeAtraso — divida Quitada não recebe badge mesmo vencida', () => {
  const b = calcularBadgeAtraso({ data_vencimento: ONTEM_ISO }, 'Quitada', 'divida');
  assert.equal(b, null);
});

test('calcularBadgeAtraso — divida Sem plano não recebe badge', () => {
  const b = calcularBadgeAtraso({ data_vencimento: ONTEM_ISO }, 'Sem plano', 'divida');
  assert.equal(b, null);
});

test('calcularBadgeAtraso — investimento Aportando com data_alvo passada → Meta vencida', () => {
  const b = calcularBadgeAtraso({ data_alvo: ONTEM_ISO }, 'Aportando', 'investimento');
  assert.ok(b);
  assert.equal(b.label, 'Meta vencida');
});

test('calcularBadgeAtraso — sem data não retorna badge', () => {
  const b = calcularBadgeAtraso({}, 'A pagar', 'divida');
  assert.equal(b, null);
});

test('calcularBadgeAtraso — hoje não é considerado vencido', () => {
  const b = calcularBadgeAtraso({ data_vencimento: HOJE_ISO }, 'A pagar', 'divida');
  assert.equal(b, null);
});

// ── statusOrder ───────────────────────────────────────────────────

test('statusOrder — devolve índice na enumeração', () => {
  assert.equal(statusOrder('Sem plano', 'divida'), 0);
  assert.equal(statusOrder('A pagar', 'divida'), 1);
  assert.equal(statusOrder('Arquivada', 'divida'), 5);
});

test('statusOrder — valor desconhecido retorna 999', () => {
  assert.equal(statusOrder('XYZ', 'divida'), 999);
});

// ── renderStatusOptions ───────────────────────────────────────────

test('renderStatusOptions — divida gera 6 options na ordem', () => {
  const html = renderStatusOptions('divida');
  // 6 ocorrências de "<option"
  const count = (html.match(/<option/g) || []).length;
  assert.equal(count, 6);
  // Sem plano antes de A pagar antes de Pagando
  assert.ok(html.indexOf('Sem plano') < html.indexOf('A pagar'));
  assert.ok(html.indexOf('A pagar') < html.indexOf('Pagando'));
});

test('renderStatusOptions — marca selected quando dbValue match', () => {
  const html = renderStatusOptions('divida', 'Pagando');
  assert.match(html, /value="Pagando" selected/);
});

test('renderStatusOptions — contexto inválido retorna string vazia', () => {
  assert.equal(renderStatusOptions('xyz'), '');
});
