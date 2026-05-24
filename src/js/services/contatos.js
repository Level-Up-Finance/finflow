// =============================================================
// FinFlow — Service: Contatos (clientes/fornecedores/pessoas)
// =============================================================
import { supabase } from '../lib/supabase.js';
import { requireWorkspaceId } from '../lib/workspace.js';

/** Lista contatos. */
export function listContatos(opts = {}) {
  let q = supabase.from('contatos').select('*');
  if (opts.excludeArchived) q = q.neq('status', 'arquivado');
  return q.order('nome');
}

/** Cria contato. */
export function createContato(payload, userId) {
  return supabase
    .from('contatos')
    .insert({
      ...payload,
      user_id: userId,
      workspace_id: requireWorkspaceId(),
    })
    .select()
    .single();
}

/** Update por id. */
export function updateContato(id, payload) {
  return supabase.from('contatos').update(payload).eq('id', id);
}

/** Delete (defense in depth). */
export function deleteContato(id) {
  return supabase
    .from('contatos')
    .delete()
    .eq('id', id)
    .eq('workspace_id', requireWorkspaceId());
}

/** Arquiva/desarquiva. */
export function setContatoStatus(id, status) {
  return supabase.from('contatos').update({ status }).eq('id', id);
}
