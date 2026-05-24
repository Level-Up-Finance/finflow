// =============================================================
// FinFlow — Service: Categorias + Subcategorias (taxonomia financeira)
// =============================================================
import { supabase } from '../lib/supabase.js';
import { requireWorkspaceId } from '../lib/workspace.js';

// =============================================================
// categorias
// =============================================================

export function listCategorias() {
  return supabase.from('categorias').select('*').order('ordem').order('nome');
}

export function createCategoria(payload, userId) {
  return supabase
    .from('categorias')
    .insert({
      ...payload,
      user_id: userId,
      workspace_id: requireWorkspaceId(),
    })
    .select()
    .single();
}

export function updateCategoria(id, payload) {
  return supabase.from('categorias').update(payload).eq('id', id);
}

export function deleteCategoria(id) {
  return supabase
    .from('categorias')
    .delete()
    .eq('id', id)
    .eq('workspace_id', requireWorkspaceId());
}

// =============================================================
// subcategorias (compromissos recorrentes)
// =============================================================

export function listSubcategorias(opts = {}) {
  let q = supabase.from('subcategorias').select('*');
  if (opts.includeCategorias) {
    q = supabase.from('subcategorias').select('*, categorias(grupo, cor, nome)');
  }
  if (opts.status) q = q.eq('status', opts.status);
  return q.order('nome');
}

export function createSubcategoria(payload, userId) {
  return supabase
    .from('subcategorias')
    .insert({
      ...payload,
      user_id: userId,
      workspace_id: requireWorkspaceId(),
      created_by: userId,
    })
    .select()
    .single();
}

export function updateSubcategoria(id, payload) {
  return supabase.from('subcategorias').update(payload).eq('id', id);
}

export function deleteSubcategoria(id) {
  return supabase
    .from('subcategorias')
    .delete()
    .eq('id', id)
    .eq('workspace_id', requireWorkspaceId());
}

/** Marca subcategoria como ativa/arquivada/inativa. */
export function setSubcategoriaStatus(id, status) {
  return supabase.from('subcategorias').update({ status }).eq('id', id);
}
