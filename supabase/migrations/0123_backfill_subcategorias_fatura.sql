-- =============================================================
-- 0123_backfill_subcategorias_fatura.sql
--
-- Marca como auto_gerado=true todas as subcategorias que são
-- espelho de cartão de crédito (criadas via lib/faturas-cartao.js
-- ensureSubcategoriaFatura).
--
-- Critério: subcategoria_id referenciada em faturas_cartao.
-- =============================================================

UPDATE public.subcategorias s
   SET auto_gerado = true,
       auto_tipo   = 'fatura_cartao'
 WHERE s.id IN (
   SELECT DISTINCT fc.subcategoria_id
     FROM public.faturas_cartao fc
    WHERE fc.subcategoria_id IS NOT NULL
 )
 AND (s.auto_gerado IS NULL OR s.auto_gerado = false);
