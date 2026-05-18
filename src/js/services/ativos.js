// =============================================================
// FinFlow — Service: Ativos Subjacentes (patrimônio)
// =============================================================
// Centraliza queries Supabase da tabela ativos_subjacentes.
//
// Ativo subjacente = bem físico que dá lastro à dívida:
//   - Veículo: vinculado à tabela FIPE (busca dinâmica)
//   - Imóvel: valor manual atualizado pelo usuário
//
// Cada dívida pode ter UM ativo (FK unique em divida_id).
// =============================================================
import { supabase } from '../lib/supabase.js';

/**
 * Lista todos os ativos do usuário (apenas próprios via RLS).
 */
export function listAtivos() {
  return supabase.from('ativos_subjacentes').select('*').order('created_at', { ascending: false });
}

/**
 * Busca o ativo vinculado a uma dívida específica.
 * Retorna null se a dívida não tem ativo.
 */
export function getAtivoByDivida(dividaId) {
  return supabase.from('ativos_subjacentes')
    .select('*')
    .eq('divida_id', dividaId)
    .maybeSingle();
}

/**
 * Cria ou atualiza o ativo de uma dívida (upsert por divida_id).
 * @param {Object} payload  campos do ativo (sem id; user_id e divida_id obrigatórios)
 */
export function upsertAtivo(payload) {
  return supabase.from('ativos_subjacentes')
    .upsert(payload, { onConflict: 'divida_id' })
    .select()
    .single();
}

/**
 * Atualiza apenas o valor_atual + timestamp (após refresh FIPE ou edição manual).
 */
export function updateValorAtual(id, valor) {
  return supabase.from('ativos_subjacentes')
    .update({
      valor_atual: valor,
      valor_atualizado_em: new Date().toISOString(),
    })
    .eq('id', id);
}

/**
 * Deleta o ativo de uma dívida.
 */
export function deleteAtivo(id) {
  return supabase.from('ativos_subjacentes').delete().eq('id', id);
}
