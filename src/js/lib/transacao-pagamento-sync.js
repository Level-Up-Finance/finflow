// =============================================================
// FinFlow — Sync bidirecional Transação ↔ Pagamento (Fase 2)
//
// Critério de match (decisão (a)): mesma subcategoria_id + mesmo mês.
// Não considera valor nem data exata — assume que ter 2 pagamentos
// distintos da mesma subcategoria no mesmo mês é raro.
// =============================================================
import { supabase } from './supabase.js';
import { todayISO } from './utils.js';
import { requireWorkspaceId } from './workspace.js';

/** @typedef {import('./shapes.js').Pagamento} Pagamento */
/** @typedef {import('./shapes.js').Subcategoria} Subcategoria */
/** @typedef {import('./shapes.js').Transacao} Transacao */

const PAID_STATUSES = ['Pago', 'Transferido'];

export function isPaidStatus(status) {
  return PAID_STATUSES.includes(status);
}

// 'YYYY-MM-DD' → 'YYYY-MM-01' (chave usada em pagamentos.mes_ano)
export function monthOfDate(dateString) {
  return (dateString || '').slice(0, 7) + '-01';
}

// -----------------------------
// LOOKUPS
// -----------------------------

/**
 * Busca um pagamento que case com a transação.
 * Match: mesma subcategoria_id + mesmo mês.
 * Se houver múltiplos blocos quinzenais no mês, retorna o primeiro
 * (Fase 2 não distingue blocos — ajuste se virar problema).
 */
export async function findMatchingPagamento({ subcategoria_id, data }) {
  if (!subcategoria_id || !data) return null;
  const mes = monthOfDate(data);
  const { data: rows, error } = await supabase
    .from('pagamentos')
    .select('id, subcategoria_id, mes_ano, status, valor_previsto, valor_real, bloco_quinzenal, data_vencimento')
    .eq('subcategoria_id', subcategoria_id)
    .eq('mes_ano', mes)
    .order('bloco_quinzenal');
  if (error || !rows || rows.length === 0) return null;
  return rows[0];
}

/**
 * Busca a transação atualmente vinculada a um pagamento (se houver).
 */
export async function findTransacaoLinkedToPagamento(pagamentoId) {
  if (!pagamentoId) return null;
  const { data, error } = await supabase
    .from('transacoes')
    .select('*')
    .eq('pagamento_id', pagamentoId)
    .maybeSingle();
  if (error) return null;
  return data;
}

/**
 * Verifica se o pagamento está "travado" por estar vinculado a uma transação
 * vinda de extrato bancário (importado ou reconciliado). Se sim, o usuário
 * não pode mudar o status — precisa primeiro desvincular pela página de transações.
 */
export async function isPagamentoLocked(pagamentoId) {
  if (!pagamentoId) return false;
  const { data, error } = await supabase
    .from('transacoes')
    .select('id, reconciliacao_status')
    .eq('pagamento_id', pagamentoId)
    .maybeSingle();
  if (error || !data) return false;
  return data.reconciliacao_status === 'importado' || data.reconciliacao_status === 'reconciliado';
}

// -----------------------------
// SYNC: pagamento → transação (chamado de pagamentos.js)
// -----------------------------

/**
 * Quando o status de um pagamento muda, garante que exista (ou não)
 * uma transação vinculada refletindo a realidade.
 *
 * Regras:
 *  - status virou pago → cria/atualiza transação vinculada com data = data_pagamento
 *    (fallback: data_vencimento)
 *  - status virou não-pago (Agendado/Cancelado):
 *    • se a transação era 'manual' (auto-criada) → DELETA
 *    • se a transação veio de extrato (importado/reconciliado) → não deveria
 *      acontecer (o pagamento está travado) — fallback: desvincula
 *  - valor_real ≤ 0 e sem valor_previsto → não cria nada
 */
export async function syncPagamentoToTransacao(pagamento, subcategoria) {
  const existing = await findTransacaoLinkedToPagamento(pagamento.id);

  // Status virou não-pago: deleta ou desvincula conforme origem da transação
  if (!isPaidStatus(pagamento.status)) {
    // Limpa conta_id_efetiva (foi setada no contexto de Pago/Cartão).
    // Se o usuário re-marcar Pago, volta ao default da subcategoria.
    if (pagamento.conta_id_efetiva) {
      await supabase.from('pagamentos').update({ conta_id_efetiva: null }).eq('id', pagamento.id);
    }
    if (existing) {
      const origem = existing.reconciliacao_status || 'manual';
      if (origem === 'manual') {
        // Transação auto-criada — pode deletar com segurança
        await supabase.from('transacoes').delete().eq('id', existing.id);
        return { action: 'deleted' };
      }
      // Veio do banco (importado/reconciliado): apenas desvincula
      await supabase.from('transacoes').update({ pagamento_id: null }).eq('id', existing.id);
      return { action: 'unlinked' };
    }
    return { action: 'noop' };
  }

  const valor = Number(pagamento.valor_real ?? pagamento.valor_previsto ?? 0);
  if (valor <= 0) return { action: 'skipped', reason: 'no_value' };

  const tipo     = subcategoria?.tipo === 'Receita' ? 'Receita' : 'Despesa';
  // Usa data_pagamento (data efetiva); fallback pra data_vencimento (planejada)
  const data     = pagamento.data_pagamento || pagamento.data_vencimento || todayISO();
  // Conta efetiva (se setada) tem prioridade sobre conta do compromisso —
  // cobre o caso de pagamento sair de conta diferente da configurada.
  const conta_id = pagamento.conta_id_efetiva || subcategoria?.conta_id || null;

  // Fronteira de moeda: uma transação criada a partir de um pagamento confirmado
  // já passou pela conversão BRL no popover (pagamentos.js saveStatus). O
  // valor_real está em BRL. Hardcoding moeda='BRL' aqui impede que o sync
  // herde a moeda original do compromisso (USD/EUR/etc) — o que causava
  // double-conversion downstream (display multiplicava por taxa USD).
  const payload = {
    data,
    valor,
    tipo,
    conta_id,
    subcategoria_id: pagamento.subcategoria_id,
    pagamento_id:    pagamento.id,
    moeda:           'BRL',
    descricao:       `Auto-criada do pagamento (${pagamento.status})`,
  };

  if (existing) {
    const { error } = await supabase.from('transacoes').update(payload).eq('id', existing.id);
    return error ? { action: 'error', reason: error.message } : { action: 'updated' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { action: 'error', reason: 'no_user' };

  const { error } = await supabase
    .from('transacoes')
    .insert({ ...payload, user_id: user.id, workspace_id: requireWorkspaceId(), created_by: user.id });
  return error ? { action: 'error', reason: error.message } : { action: 'created' };
}

// -----------------------------
// SYNC: transação → pagamento (chamado de transacoes.js)
// -----------------------------

/**
 * Marca um pagamento como pago e vincula uma transação a ele.
 * Usado quando o usuário cria uma transação manual e o sistema
 * detecta um pagamento agendado correspondente, OU quando a importação
 * de extrato faz match com um pagamento pendente.
 *
 * @param {string} pagamentoId
 * @param {string} transacaoId
 * @param {number|null} valorReal
 * @param {string|null} dataPagamento - data efetiva do pagamento (YYYY-MM-DD)
 * @param {string} novoStatus - 'Pago' (default), 'Transferido', etc.
 */
export async function markPagamentoPagoAndLink(pagamentoId, transacaoId, valorReal, dataPagamento = null, novoStatus = 'Pago') {
  const updatePag = {
    status: novoStatus,
    status_atualizado_em: new Date().toISOString(),
  };
  if (valorReal != null) updatePag.valor_real = valorReal;
  if (dataPagamento) updatePag.data_pagamento = dataPagamento;

  const { error: pagErr } = await supabase
    .from('pagamentos')
    .update(updatePag)
    .eq('id', pagamentoId);
  if (pagErr) return { ok: false, error: pagErr.message };

  const { error: trErr } = await supabase
    .from('transacoes')
    .update({ pagamento_id: pagamentoId })
    .eq('id', transacaoId);
  if (trErr) return { ok: false, error: trErr.message };

  return { ok: true };
}

/**
 * Vincula uma transação a um pagamento já marcado como pago
 * (sem alterar status do pagamento).
 */
export async function linkTransacaoToPagamento(pagamentoId, transacaoId) {
  const { error } = await supabase
    .from('transacoes')
    .update({ pagamento_id: pagamentoId })
    .eq('id', transacaoId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Mescla: descarta a nova transação e mantém a existente vinculada
 * ao pagamento. Opcionalmente atualiza a existente com campos da nova
 * (ex: estabelecimento, descricao, valor diferente).
 */
export async function mergeTransacaoIntoExisting(newTransacaoId, existingTransacaoId, fieldsToUpdate = null) {
  if (fieldsToUpdate && Object.keys(fieldsToUpdate).length > 0) {
    const { error: updErr } = await supabase
      .from('transacoes')
      .update(fieldsToUpdate)
      .eq('id', existingTransacaoId);
    if (updErr) return { ok: false, error: updErr.message };
  }
  const { error: delErr } = await supabase
    .from('transacoes')
    .delete()
    .eq('id', newTransacaoId);
  return delErr ? { ok: false, error: delErr.message } : { ok: true };
}

