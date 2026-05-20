// =============================================================
// FinFlow — Camada de queries Supabase centralizadas
// =============================================================
// Objetivo: evitar SELECT drift quando schema muda.
// Cada função aqui constrói um builder Supabase pra uma tabela —
// as páginas chamam o builder e adicionam filtros/order específicos.
//
// Padrão de uso:
//   import { selectDividas, fetchDividas } from '../services/queries.js';
//   const { data, error } = await selectDividas().eq('tipo', 'a_pagar');
//   // OU usar wrapper que já trata erro:
//   const dividas = await fetchDividas({ filter: (q) => q.eq('tipo', 'a_pagar') });
//
// Esta camada nasce vazia e vai sendo populada conforme cada módulo é
// auditado (Camada 2 da auditoria — ver Camada 1 §1.4 inconsistência #1).
// =============================================================

import { supabase } from '../lib/supabase.js';

// Colunas canônicas (única fonte de verdade) — quando o schema mudar,
// só este arquivo precisa ser atualizado.
export const COLUMNS = {
  dividas: `
    id, nome, credor, tipo, valor_total, valor_pago, juros_percentual,
    data_inicio, data_vencimento, status, n_parcelas, parcelas_pagas, moeda,
    contato_id, conta_id, inclui_no_patrimonio, regime, taxa_tipo, taxa_referencia,
    juros_tipo, juros_spread, fases, indice_correcao, correcao_taxa, observacao
  `.replace(/\s+/g, ' ').trim(),

  subcategorias_compromisso: `
    id, nome, apelido, tipo, tipo_pagamento, valor_base, valor_variavel,
    vencimento_dia, dia_semana, intervalo_semanas, periodo, status,
    conta_id, conta_destino_id, categoria_id, moeda, terminado_em,
    iniciado_em, descricao, contato_id, divida_id, projeto_id
  `.replace(/\s+/g, ' ').trim(),

  contas: `
    id, nome, apelido, tipo, descricao, moeda, limite, status,
    fec_fatura, vencimento, icone_cor, desde, fechada_em, frequencia_importacao_dias
  `.replace(/\s+/g, ' ').trim(),

  projetos_investimento: `
    id, nome, descricao, cor, status, meta_valor, data_alvo, saldo_inicial,
    contato_id, comp_valor_base, comp_periodo, comp_categoria_id,
    comp_data_inicio, inclui_no_patrimonio, data_inicio
  `.replace(/\s+/g, ' ').trim(),
};

// -------------------------------------------------------
// DÍVIDAS
// -------------------------------------------------------
export function selectDividas(extraCols = '') {
  const cols = extraCols ? `${COLUMNS.dividas}, ${extraCols}` : COLUMNS.dividas;
  return supabase.from('dividas').select(cols);
}

// -------------------------------------------------------
// SUBCATEGORIAS (compromissos)
// -------------------------------------------------------
export function selectSubcategoriasCompromisso(extraCols = '') {
  const cols = extraCols
    ? `${COLUMNS.subcategorias_compromisso}, ${extraCols}`
    : COLUMNS.subcategorias_compromisso;
  return supabase.from('subcategorias').select(cols);
}

// -------------------------------------------------------
// CONTAS
// -------------------------------------------------------
export function selectContas(extraCols = '') {
  const cols = extraCols ? `${COLUMNS.contas}, ${extraCols}` : COLUMNS.contas;
  return supabase.from('contas').select(cols);
}

// -------------------------------------------------------
// PROJETOS DE INVESTIMENTO
// -------------------------------------------------------
export function selectProjetos(extraCols = '') {
  const cols = extraCols
    ? `${COLUMNS.projetos_investimento}, ${extraCols}`
    : COLUMNS.projetos_investimento;
  return supabase.from('projetos_investimento').select(cols);
}
