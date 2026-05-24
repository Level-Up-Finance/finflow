-- =============================================================
-- 0129_cleanup_pagamentos_placeholder_legados.sql
--
-- Antes dos paths próprios pra placeholders (Fatura X, Gastos
-- diversos), o ensurePagamentosForMonth iterava todas as subs e
-- gerava pagamentos baseado em vencimento_dia. Pra Gastos diversos
-- (vencimento_dia=1), isso criava pagamentos dia 1 do mês.
--
-- Esses pagamentos antigos persistem mesmo após o fix em JS, e
-- causam duplicação visual ("2 Gastos diversos no mesmo bloco").
--
-- Limpa pagamentos de subs oculta=true com:
--   - valor_real = 0 ou NULL (não tocou — safe pra deletar)
--   - Status 'A Pagar' (não foi marcado pago)
--   - Sem transação vinculada
--
-- Os paths próprios (ensurePagamentosFaturaForMonths,
-- ensurePagamentoGastosDiversos) recriam os pagamentos com
-- data_vencimento correto na próxima abertura de Pagamentos.
-- =============================================================

-- 1. Apaga pagamentos legados de subs ocultas que nunca foram tocados
DELETE FROM public.pagamentos p
 WHERE EXISTS (
   SELECT 1 FROM public.subcategorias s
    WHERE s.id = p.subcategoria_id
      AND s.oculta = true
 )
 AND (p.valor_real IS NULL OR p.valor_real = 0)
 AND p.status = 'A Pagar'
 AND NOT EXISTS (
   SELECT 1 FROM public.transacoes t
    WHERE t.pagamento_id = p.id
 );

-- 2. Apaga orcamento_geral órfãos de subs ocultas que sobraram sem
-- pagamento vinculado (idempotente nas próximas execuções).
DELETE FROM public.orcamento_geral og
 WHERE EXISTS (
   SELECT 1 FROM public.subcategorias s
    WHERE s.id = og.subcategoria_id
      AND s.oculta = true
 )
 AND NOT EXISTS (
   SELECT 1 FROM public.pagamentos p
    WHERE p.orcamento_id = og.id
 );
