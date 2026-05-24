-- =============================================================
-- 0131_nuke_placeholders_recriar.sql
--
-- NUKE TOTAL dos pagamentos+orcamento_geral de placeholders
-- (subs com oculta=true: Gastos diversos + Fatura X).
--
-- Justificativa: migrations anteriores (0129, 0130) tentaram limpar
-- conservadoramente (valor_real=0, status='A Pagar', sem tx). Mas
-- a função recalcGastosDiversosBloco ATUALIZA valor_real toda vez,
-- então pagamentos legados ficam com valor_real != 0 e NÃO eram
-- limpados. Resultado: estado defeituoso persiste indefinidamente.
--
-- Solução: nuke TOTAL. JS recria tudo na próxima abertura de
-- Pagamentos, usando regras corretas:
--   - Gastos diversos: 1 por bloco real (endDate da renda principal)
--   - Fatura X: 1 por fatura_cartao real
--
-- O QUE PRESERVA:
--   - faturas_cartao (são source of truth, mantidas)
--   - subcategorias placeholder (mantidas, são as referências)
--   - transacoes (NUNCA mexe — só desvincula via SET NULL no FK)
--
-- O QUE APAGA:
--   - TODOS pagamentos de subs ocultas (incluindo com valor_real)
--   - TODOS orcamento_geral de subs ocultas
--
-- EFEITO COLATERAL:
--   - Transações com pagamento_id apontando pra placeholder ficam
--     com pagamento_id=NULL (FK ON DELETE SET NULL, se existir, ou
--     CASCADE — depende do schema). Mas como Gastos diversos = só
--     agregador, isso é OK: transação volta a contar como "solta"
--     e será re-agregada no próximo recalc.
-- =============================================================

-- 1. Apaga pagamentos de subs ocultas (NUKE)
DELETE FROM public.pagamentos p
 WHERE EXISTS (
   SELECT 1 FROM public.subcategorias s
    WHERE s.id = p.subcategoria_id
      AND s.oculta = true
 );

-- 2. Apaga orcamento_geral de subs ocultas (NUKE)
DELETE FROM public.orcamento_geral og
 WHERE EXISTS (
   SELECT 1 FROM public.subcategorias s
    WHERE s.id = og.subcategoria_id
      AND s.oculta = true
 );

-- 3. Log informativo
DO $$
DECLARE pag_count integer; orc_count integer;
BEGIN
  SELECT COUNT(*) INTO pag_count FROM public.pagamentos p
    WHERE EXISTS (SELECT 1 FROM public.subcategorias s WHERE s.id = p.subcategoria_id AND s.oculta = true);
  SELECT COUNT(*) INTO orc_count FROM public.orcamento_geral og
    WHERE EXISTS (SELECT 1 FROM public.subcategorias s WHERE s.id = og.subcategoria_id AND s.oculta = true);
  RAISE NOTICE 'Após NUKE: % pagamentos e % orcamentos restantes (deveria ser 0)', pag_count, orc_count;
END $$;
