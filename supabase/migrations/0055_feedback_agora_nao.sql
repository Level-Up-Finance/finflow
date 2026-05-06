-- =============================================================
-- FinFlow — Feedback: renomeia status 'descartado' → 'agora_nao'
-- =============================================================
alter table public.feedback drop constraint if exists feedback_status_check;

update public.feedback set status = 'agora_nao' where status = 'descartado';

alter table public.feedback
  add constraint feedback_status_check
  check (status in ('novo', 'em_analise', 'em_progresso', 'feito', 'agora_nao'));
