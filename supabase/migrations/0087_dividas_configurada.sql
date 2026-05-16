-- =============================================================
-- 0087 — Adiciona coluna configurada à tabela dividas
-- Dívidas existentes com regime definido já são consideradas configuradas.
-- =============================================================
ALTER TABLE public.dividas
  ADD COLUMN IF NOT EXISTS configurada boolean NOT NULL DEFAULT false;

UPDATE public.dividas
  SET configurada = true
  WHERE regime IS NOT NULL;
