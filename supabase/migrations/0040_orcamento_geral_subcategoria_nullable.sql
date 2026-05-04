-- 0040_orcamento_geral_subcategoria_nullable.sql
--
-- Permite registros de orcamento_geral vinculados a categorias diretas,
-- sem subcategoria_id. Até agora a coluna era NOT NULL.

ALTER TABLE public.orcamento_geral
  ALTER COLUMN subcategoria_id DROP NOT NULL;
