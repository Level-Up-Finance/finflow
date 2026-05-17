-- =============================================================
-- 0090 — Adiciona coluna `tipo` em `dividas`
-- =============================================================
-- 'a_pagar'   — dívida que o usuário deve a alguém (default)
-- 'a_receber' — empréstimo/valor que alguém deve ao usuário
-- =============================================================

ALTER TABLE public.dividas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'a_pagar'
    CHECK (tipo IN ('a_pagar', 'a_receber'));

COMMENT ON COLUMN public.dividas.tipo IS
  'Direção da dívida: a_pagar = eu devo (passivo); a_receber = me devem (ativo).';
