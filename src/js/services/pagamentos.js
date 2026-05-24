// =============================================================
// FinFlow — Service: Pagamentos (controle do que foi pago no mês)
// =============================================================
// Centraliza queries Supabase das tabelas:
//   - pagamentos
//   - alocacoes_caixa_livre
//
// Multi-perfil: workspace_id obrigatório em INSERTs.
//
// Padrão de retorno: { data, error }.
// =============================================================
import { supabase } from '../lib/supabase.js';
import { requireWorkspaceId } from '../lib/workspace.js';

// =============================================================
// pagamentos — SELECT
// =============================================================

/** Lista pagamentos de um mês com JOIN subcategoria/categoria. */
export function listPagamentosByMonth(mesAno) {
  return supabase
    .from('pagamentos')
    .select('*, subcategorias(*, categorias(*))')
    .eq('mes_ano', mesAno)
    .order('data_vencimento');
}

/** Lista pagamentos por sub + range de datas (bloco crossover). */
export function listPagamentosByRange(mesAno, startIso, endIso) {
  return supabase
    .from('pagamentos')
    .select('*, subcategorias(*, categorias(*))')
    .eq('mes_ano', mesAno)
    .gte('data_vencimento', startIso)
    .lte('data_vencimento', endIso);
}

// =============================================================
// pagamentos — CREATE/UPDATE/DELETE
// =============================================================

/**
 * Insere pagamentos em batch. Cada row já deve trazer workspace_id +
 * created_by (callers que usam ensurePagamentosForMonth montam rows
 * com esses campos antes).
 */
export function insertPagamentos(rows) {
  return supabase.from('pagamentos').insert(rows);
}

/** Update arbitrário por id. */
export function updatePagamento(id, payload) {
  return supabase.from('pagamentos').update(payload).eq('id', id);
}

/** Update bulk por filtro (sub + mes_ano + status). */
export function updatePagamentosByFilter(filter, payload) {
  let q = supabase.from('pagamentos').update(payload);
  if (filter.subcategoria_id) q = q.eq('subcategoria_id', filter.subcategoria_id);
  if (filter.mes_ano)         q = q.eq('mes_ano', filter.mes_ano);
  if (filter.status)          q = q.in('status', Array.isArray(filter.status) ? filter.status : [filter.status]);
  return q;
}

/** Delete por id (defense in depth). */
export function deletePagamento(id) {
  return supabase
    .from('pagamentos')
    .delete()
    .eq('id', id)
    .eq('workspace_id', requireWorkspaceId());
}

// =============================================================
// alocacoes_caixa_livre
// =============================================================

/** Lista alocações de um mês. */
export function listAlocacoes(mesAno) {
  return supabase
    .from('alocacoes_caixa_livre')
    .select('*')
    .eq('mes_ano', mesAno)
    .order('created_at');
}

/** Delete alocação por id (defense in depth). */
export function deleteAlocacao(id) {
  return supabase
    .from('alocacoes_caixa_livre')
    .delete()
    .eq('id', id)
    .eq('workspace_id', requireWorkspaceId());
}
