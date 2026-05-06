-- =============================================================
-- FinFlow — Feedback: adiciona status 'em_analise'
-- =============================================================
alter table public.feedback drop constraint if exists feedback_status_check;
alter table public.feedback
  add constraint feedback_status_check
  check (status in ('novo', 'em_analise', 'em_progresso', 'descartado', 'feito'));
