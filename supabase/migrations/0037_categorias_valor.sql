-- ============================================================
-- 0037_categorias_valor.sql
--
-- Permite que uma Categoria tenha um valor de compromisso direto,
-- sem precisar criar uma Subcategoria intermediária.
--
-- Campos adicionados:
--   • valor_base   — valor mensal direto (0 = sem compromisso direto)
--   • tipo         — 'Receita' | 'Despesa' (nullable, obrigatório quando valor_base > 0)
--   • moeda        — código ISO (default BRL)
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS valor_base numeric(15,2) NOT NULL DEFAULT 0;

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS tipo text;

ALTER TABLE public.categorias
  DROP CONSTRAINT IF EXISTS categorias_tipo_check;

ALTER TABLE public.categorias
  ADD CONSTRAINT categorias_tipo_check
    CHECK (tipo IS NULL OR tipo IN ('Receita', 'Despesa'));

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS moeda text NOT NULL DEFAULT 'BRL';
