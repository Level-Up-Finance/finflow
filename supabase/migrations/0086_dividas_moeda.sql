-- =============================================================
-- 0086 — Adiciona coluna moeda à tabela dividas
-- =============================================================
ALTER TABLE public.dividas
  ADD COLUMN IF NOT EXISTS moeda text NOT NULL DEFAULT 'BRL';
