-- =============================================================
-- FinFlow — Expandir tipos de feedback
-- De: bug, sugestao, feature
-- Para: + pergunta, elogio, parceria
-- =============================================================
alter table public.feedback drop constraint if exists feedback_type_check;
alter table public.feedback
  add constraint feedback_type_check
  check (type in ('bug', 'sugestao', 'feature', 'pergunta', 'elogio', 'parceria'));
