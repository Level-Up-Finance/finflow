-- =============================================================
-- 0128_subcategorias_fatura_iniciado_em_dia_1.sql
--
-- Ajusta `iniciado_em` das subs de Fatura X para o primeiro dia
-- do mês em que foram criadas.
--
-- Causa do bug:
--   ensureSubcategoriaFatura setava iniciado_em = today(). Se o
--   user criava a conta cartão DEPOIS do dia de vencimento no mês
--   (ex: hoje dia 24, venc dia 20), countOccurrencesInMonth retornava
--   0 ocorrências (porque dia 20 < iniciado_em = 24). Resultado:
--   nem entry em orcamento_geral, nem pagamento gerado em Pagamentos.
--
-- Fix conceitual:
--   Sub Fatura "nasce" no início do mês de criação, não no dia exato
--   da criação. Assim ela captura o dia de vencimento mesmo que já
--   tenha passado nesse mês.
-- =============================================================

UPDATE public.subcategorias
   SET iniciado_em = DATE_TRUNC('month', iniciado_em)::date
 WHERE auto_tipo = 'fatura_cartao'
   AND iniciado_em IS NOT NULL
   AND EXTRACT(DAY FROM iniciado_em) > 1;
