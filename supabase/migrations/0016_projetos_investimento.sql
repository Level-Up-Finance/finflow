-- ============================================================
-- 0016_projetos_investimento.sql
--
-- Cria a tabela de "Projetos de investimento" — agrupa subcategorias
-- de investimento sob um projeto específico (ex: "Casa própria",
-- "Aposentadoria", "Reserva de emergência"). Subcategoria pertence
-- a no máximo 1 projeto. Projeto é opcional.
--
-- Idempotente.
-- ============================================================

-- Tabela
create table if not exists public.projetos_investimento (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  nome        text not null,
  descricao   text,
  cor         text not null default '#6D5EF5',
  status      text not null default 'ativo',
  created_at  timestamptz not null default now()
);

alter table public.projetos_investimento
  drop constraint if exists projetos_investimento_status_check;

alter table public.projetos_investimento
  add constraint projetos_investimento_status_check
  check (status in ('ativo', 'concluido', 'pausado'));

create index if not exists idx_projetos_investimento_user
  on public.projetos_investimento(user_id);

-- RLS
alter table public.projetos_investimento enable row level security;

drop policy if exists "projetos_investimento_select" on public.projetos_investimento;
drop policy if exists "projetos_investimento_insert" on public.projetos_investimento;
drop policy if exists "projetos_investimento_update" on public.projetos_investimento;
drop policy if exists "projetos_investimento_delete" on public.projetos_investimento;

create policy "projetos_investimento_select"
  on public.projetos_investimento for select using (user_id = auth.uid());
create policy "projetos_investimento_insert"
  on public.projetos_investimento for insert with check (user_id = auth.uid());
create policy "projetos_investimento_update"
  on public.projetos_investimento for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "projetos_investimento_delete"
  on public.projetos_investimento for delete using (user_id = auth.uid());

-- FK em subcategorias (opcional)
alter table public.subcategorias
  add column if not exists projeto_id uuid references public.projetos_investimento(id) on delete set null;

create index if not exists idx_subcategorias_projeto
  on public.subcategorias(projeto_id);
