-- =============================================================
-- 0089 — Adiciona coluna `fase` em `feedback` para agrupar tickets
--        em fases de desenvolvimento (A..I).
-- =============================================================
-- A = Fundações / Infraestrutura
-- B = Marca e UX
-- C = Quality of life UX
-- D = Onboarding, ajuda e academia
-- E = Funcionalidades nativas
-- F = Integrações externas (médio risco)
-- G = Integrações financeiras (alto risco)
-- H = AI
-- I = Comunidade e educação
-- =============================================================

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS fase text;

COMMENT ON COLUMN public.feedback.fase IS
  'Fase de desenvolvimento sugerida (A..I) para ordenar a backlog. NULL = sem fase atribuída.';
