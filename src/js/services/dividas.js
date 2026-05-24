// =============================================================
// FinFlow — Service: Dividas (financiamentos / empréstimos)
// =============================================================
// Centraliza todas as queries Supabase das tabelas:
//   - dividas
//   - pagamentos_divida_historico
//   - divida_taxa_historico
//
// Padrão de retorno: { data, error } (mesma forma que Supabase
// nativo, pra minimizar mudanças nos call sites).
//
// Uso:
//   import * as dividasService from '../services/dividas.js';
//   const { data, error } = await dividasService.listDividas();
// =============================================================
import { supabase } from '../lib/supabase.js';

/** @typedef {import('../lib/shapes.js').Divida} Divida */
/** @typedef {import('../lib/shapes.js').PagamentoDividaHistorico} PagamentoDividaHistorico */

// =============================================================
// dividas
// =============================================================

/** Lista todas as dívidas do usuário, mais recentes primeiro. */
export function listDividas() {
  return supabase.from('dividas').select('*').order('created_at', { ascending: false });
}

/**
 * Cria uma nova dívida. Retorna o id.
 * @param {Partial<Divida>} payload
 */
export function createDivida(payload) {
  return supabase.from('dividas').insert({ ...payload, valor_pago: 0 }).select('id').single();
}

/**
 * Atualiza campos arbitrários de uma dívida.
 * @param {string} id
 * @param {Partial<Divida>} payload
 */
export function updateDivida(id, payload) {
  return supabase.from('dividas').update(payload).eq('id', id);
}

/** Atualiza apenas a taxa de juros (used by refreshIndexedRates + atualizarTaxaModal). */
export function updateDividaJuros(id, novaTaxa) {
  return supabase.from('dividas').update({ juros_percentual: novaTaxa }).eq('id', id);
}

/** Atualiza status para 'Arquivada'. */
export function archiveDivida(id) {
  return supabase.from('dividas').update({ status: 'Arquivada' }).eq('id', id);
}

/**
 * Restaura dívida arquivada pra um status ativo. O caller passa o status
 * derivado do contexto (ex: 'Pagando' se há valor_pago > 0, 'A pagar' se
 * não — calculado via `statusAposDesquitar`). Status hardcoded 'Ativa'
 * legacy foi removido — não existe no enum STATUS_BY_CONTEXT.divida.
 *
 * @param {string} id          UUID da dívida
 * @param {string} novoStatus  dbValue do STATUS_BY_CONTEXT.divida
 */
export function restoreDivida(id, novoStatus) {
  return supabase.from('dividas').update({ status: novoStatus }).eq('id', id);
}

/**
 * Atualiza estado após registrar pagamento de parcela(s):
 * parcelas_pagas, valor_pago e status (pode virar Quitada).
 */
export function updateDividaPagamento(id, { parcelasPagas, valorPago, status }) {
  return supabase.from('dividas')
    .update({ parcelas_pagas: parcelasPagas, valor_pago: valorPago, status })
    .eq('id', id);
}

/** Deleta permanentemente (hard delete). */
export function deleteDivida(id) {
  return supabase.from('dividas').delete().eq('id', id);
}

// =============================================================
// pagamentos_divida_historico
// =============================================================

/** Lista todo o histórico de pagamentos, ordenado por n_parcela. */
export function listPagamentosDividaHistorico() {
  return supabase.from('pagamentos_divida_historico').select('*').order('n_parcela');
}

/**
 * Insere uma ou mais entradas no histórico de pagamentos.
 * @param {Partial<PagamentoDividaHistorico>[]} rows
 */
export function insertPagamentosDividaHistorico(rows) {
  return supabase.from('pagamentos_divida_historico').insert(rows);
}

// =============================================================
// divida_taxa_historico
// =============================================================

/** Lista todo o histórico de mudanças de taxa, mais antigos primeiro. */
export function listTaxaHistorico() {
  return supabase.from('divida_taxa_historico').select('*').order('data_vigencia');
}

/**
 * Insere uma entrada no histórico de taxa.
 * @param {Object} entry
 * @param {string} entry.divida_id
 * @param {string} entry.user_id
 * @param {number} entry.taxa_anterior
 * @param {number} entry.taxa_nova
 * @param {string} entry.data_vigencia    'YYYY-MM-DD'
 * @param {string} [entry.motivo]
 */
export function insertTaxaHistorico(entry) {
  return supabase.from('divida_taxa_historico').insert(entry);
}
