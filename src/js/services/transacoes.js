// =============================================================
// FinFlow — Service: Transacoes (lançamentos + splits + reconciliação)
// =============================================================
// Centraliza queries Supabase das tabelas:
//   - transacoes
//   - transacao_splits
//   - contato_banco_descs
//
// Multi-perfil: todas as escritas exigem workspace_id no payload.
// Pattern de defesa em profundidade: helpers de DELETE/UPDATE também
// filtram por workspace_id (extra além da RLS).
//
// Padrão de retorno: { data, error } (mesma forma que Supabase nativo).
//
// Uso:
//   import * as txService from '../services/transacoes.js';
//   const { data, error } = await txService.listTransacoes();
// =============================================================
import { supabase } from '../lib/supabase.js';
import { requireWorkspaceId } from '../lib/workspace.js';

// =============================================================
// transacoes — SELECT
// =============================================================

/** Lista todas as transações (RLS filtra por workspace). */
export function listTransacoes() {
  return supabase
    .from('transacoes')
    .select('*')
    .order('data', { ascending: false });
}

/** Busca transação por id (uso em modais de edit). */
export function getTransacao(id) {
  return supabase.from('transacoes').select('*').eq('id', id).maybeSingle();
}

/** Lista transações de um período (inclusive). */
export function listTransacoesByDateRange(startIso, endIso) {
  return supabase
    .from('transacoes')
    .select('*')
    .gte('data', startIso)
    .lte('data', endIso)
    .order('data');
}

// =============================================================
// transacoes — CREATE/UPDATE/DELETE
// =============================================================

/**
 * Cria transação. Payload deve conter user_id; service injeta
 * workspace_id e created_by automaticamente.
 *
 * @param {object} payload  campos da transação (sem workspace_id)
 * @param {string} userId   id do user logado
 */
export function createTransacao(payload, userId) {
  return supabase
    .from('transacoes')
    .insert({
      ...payload,
      user_id: userId,
      workspace_id: requireWorkspaceId(),
      created_by: userId,
    })
    .select()
    .single();
}

/** Update arbitrário por id. RLS protege workspace. */
export function updateTransacao(id, payload) {
  return supabase.from('transacoes').update(payload).eq('id', id);
}

/** Delete por id. Defense in depth: filtra por workspace_id explícito. */
export function deleteTransacao(id) {
  return supabase
    .from('transacoes')
    .delete()
    .eq('id', id)
    .eq('workspace_id', requireWorkspaceId());
}

/** Delete bulk por ids. Defense in depth via workspace_id. */
export function deleteTransacoesBulk(ids) {
  return supabase
    .from('transacoes')
    .delete()
    .in('id', ids)
    .eq('workspace_id', requireWorkspaceId());
}

/** Marca transação como reconciliada. */
export function confirmarReconciliacao(id) {
  return supabase
    .from('transacoes')
    .update({ reconciliacao_status: 'reconciliado' })
    .eq('id', id);
}

// =============================================================
// transacoes — Transferência (par saída/entrada)
// =============================================================

/**
 * Cria o par de transações de uma transferência: saída + entrada
 * vinculadas via transferencia_par_id.
 *
 * @param {object} saidaPayload   campos da saída (sem ids/workspace)
 * @param {object} entradaPayload campos da entrada (sem ids/workspace, vai com transferencia_par_id após saída)
 * @param {string} userId
 * @returns {Promise<{ saida, entrada } | { error }>}
 */
export async function createTransferPair(saidaPayload, entradaPayload, userId) {
  const wsId = requireWorkspaceId();
  const baseFields = { user_id: userId, workspace_id: wsId, created_by: userId };

  const saida = await supabase
    .from('transacoes')
    .insert({ ...saidaPayload, ...baseFields })
    .select('id')
    .single();
  if (saida.error) return { error: saida.error };

  const entrada = await supabase
    .from('transacoes')
    .insert({ ...entradaPayload, ...baseFields, transferencia_par_id: saida.data.id })
    .select('id')
    .single();
  if (entrada.error) {
    // Rollback: remove saída órfã
    await supabase.from('transacoes').delete().eq('id', saida.data.id);
    return { error: entrada.error };
  }

  // Liga saída ↔ entrada
  await supabase
    .from('transacoes')
    .update({ transferencia_par_id: entrada.data.id })
    .eq('id', saida.data.id);

  return { saida: saida.data, entrada: entrada.data };
}

// =============================================================
// transacao_splits
// =============================================================

/** Lista splits de uma transação. */
export function listSplits(transacaoId) {
  return supabase
    .from('transacao_splits')
    .select('*')
    .eq('transacao_id', transacaoId)
    .order('ordem');
}

/** Substitui splits de uma transação (delete-then-insert). */
export async function replaceSplits(transacaoId, rows, userId) {
  await supabase.from('transacao_splits').delete().eq('transacao_id', transacaoId);
  if (!rows || rows.length === 0) return { data: [], error: null };
  const payload = rows.map((r, i) => ({
    ...r,
    transacao_id: transacaoId,
    user_id: userId,
    workspace_id: requireWorkspaceId(),
    ordem: i,
  }));
  return supabase.from('transacao_splits').insert(payload);
}

// =============================================================
// contato_banco_descs (cache de "essa descrição do banco é desse contato")
// =============================================================

/**
 * Upsert: liga banco_desc + contato_id + ultima sub usada.
 * Onconflict via PK composta (user_id, contato_id, banco_desc).
 */
export function upsertContatoBancoDesc(contatoId, bancoDesc, subcategoriaId, userId) {
  return supabase
    .from('contato_banco_descs')
    .upsert(
      {
        user_id: userId,
        workspace_id: requireWorkspaceId(),
        contato_id: contatoId,
        banco_desc: bancoDesc,
        last_subcategoria_id: subcategoriaId || null,
      },
      { onConflict: 'user_id,contato_id,banco_desc' },
    );
}
