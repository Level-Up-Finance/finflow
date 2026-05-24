// =============================================================
// FinFlow — Service: Contas (bancos, cartões, cofrinhos)
// =============================================================
// Centraliza queries Supabase das tabelas:
//   - contas
//   - saldos_bancarios_snapshots
// =============================================================
import { supabase } from '../lib/supabase.js';
import { requireWorkspaceId } from '../lib/workspace.js';

// =============================================================
// contas — SELECT
// =============================================================

/** Lista todas as contas (RLS filtra workspace). */
export function listContas(opts = {}) {
  let q = supabase.from('contas').select('*');
  if (opts.excludeArchived) q = q.neq('status', 'arquivada');
  if (opts.tipo) q = q.eq('tipo', opts.tipo);
  return q.order('nome');
}

/** Conta única por id. */
export function getConta(id) {
  return supabase.from('contas').select('*').eq('id', id).maybeSingle();
}

// =============================================================
// contas — CREATE/UPDATE/DELETE
// =============================================================

/** Cria conta. */
export function createConta(payload, userId) {
  return supabase
    .from('contas')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
}

/** Update por id. */
export function updateConta(id, payload) {
  return supabase.from('contas').update(payload).eq('id', id);
}

/** Delete por id (defense in depth). */
export function deleteConta(id) {
  return supabase
    .from('contas')
    .delete()
    .eq('id', id)
    .eq('workspace_id', requireWorkspaceId());
}

/** Atualiza status — arquivar/desarquivar. */
export function setContaStatus(id, status) {
  return supabase.from('contas').update({ status }).eq('id', id);
}

// =============================================================
// saldos_bancarios_snapshots
// =============================================================

/** Cria snapshot de saldo. */
export function createSnapshot(payload, userId) {
  return supabase
    .from('saldos_bancarios_snapshots')
    .insert({
      ...payload,
      user_id: userId,
      workspace_id: requireWorkspaceId(),
    });
}

/** Lista snapshots de uma conta, mais recentes primeiro. */
export function listSnapshots(contaId, limit = 30) {
  return supabase
    .from('saldos_bancarios_snapshots')
    .select('*')
    .eq('conta_id', contaId)
    .order('data', { ascending: false })
    .limit(limit);
}
