-- ============================================================
-- 0039_categorias_valor_variavel.sql
--
-- Permite que uma categoria com compromisso direto tenha valor
-- variável por mês, igual às subcategorias.
--
-- Campos adicionados:
--   categorias.valor_variavel  — flag de valor variável
--   orcamento_geral.categoria_id — referência à categoria para
--                                  valores mensais diretos
-- ============================================================

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS valor_variavel boolean NOT NULL DEFAULT false;

ALTER TABLE public.orcamento_geral
  ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.categorias(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS orcamento_geral_cat_mes_uniq
  ON public.orcamento_geral (user_id, categoria_id, mes_ano)
  WHERE categoria_id IS NOT NULL;
