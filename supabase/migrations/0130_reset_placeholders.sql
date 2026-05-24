-- =============================================================
-- 0130_reset_placeholders.sql
--
-- RESET de pagamentos+orcamentos de placeholders (Fatura X e
-- Gastos diversos) — apaga tudo que foi acumulado por versões
-- anteriores da lógica de geração.
--
-- O JS atual (lib/faturas-cartao.js ensurePagamentosFaturaForMonths
-- + lib/gastos-diversos.js ensureGastosDiversosForMonth) recria
-- do zero usando faturas_cartao como source of truth.
--
-- SAFETY:
--   - NÃO apaga pagamentos com transação vinculada
--   - NÃO apaga pagamentos com valor_real > 0
--   - NÃO apaga pagamentos com status diferente de 'A Pagar'
--
-- Idempotente: rodar várias vezes não causa side effect.
-- =============================================================

-- 1. Apaga pagamentos órfãos de subs ocultas (placeholders)
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

-- 2. Apaga orcamento_geral órfãos de subs ocultas
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

-- 3. Conta quantas linhas sobraram (informativo, pra log)
DO $$
DECLARE
  pag_count integer;
  orc_count integer;
BEGIN
  SELECT COUNT(*) INTO pag_count FROM public.pagamentos p
    WHERE EXISTS (SELECT 1 FROM public.subcategorias s WHERE s.id = p.subcategoria_id AND s.oculta = true);
  SELECT COUNT(*) INTO orc_count FROM public.orcamento_geral og
    WHERE EXISTS (SELECT 1 FROM public.subcategorias s WHERE s.id = og.subcategoria_id AND s.oculta = true);
  RAISE NOTICE 'Após reset: % pagamentos e % orcamentos de placeholders mantidos (com valor_real>0 ou transação vinculada)', pag_count, orc_count;
END $$;
