-- 0081: adiciona status 'aprovada' ao fluxo de desenvolvimento do feedback
-- Posiciona entre em_analise e em_progresso no ciclo de vida

alter table public.feedback drop constraint if exists feedback_status_check;

alter table public.feedback
  add constraint feedback_status_check
  check (status in ('novo', 'em_analise', 'aprovada', 'em_progresso', 'feito', 'agora_nao'));
