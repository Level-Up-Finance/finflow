-- =============================================================
-- FinFlow — Feedback: tabela de histórico de alterações
-- =============================================================
create table public.feedback_historico (
  id             uuid        primary key default gen_random_uuid(),
  feedback_id    uuid        not null references public.feedback(id) on delete cascade,
  campo          text        not null,
  valor_anterior text,
  valor_novo     text,
  alterado_por   text,
  alterado_em    timestamptz not null default now()
);

alter table public.feedback_historico enable row level security;

create policy "authenticated_full" on public.feedback_historico for all
  to authenticated using (true) with check (true);

create index on public.feedback_historico(feedback_id, alterado_em desc);
