-- =============================================================
-- FinFlow — Feedback: campo resposta_usuario
-- Texto que o admin escreve e fica visível pro usuário
-- =============================================================
alter table public.feedback
  add column if not exists resposta_usuario text;
