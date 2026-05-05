-- =============================================================
-- FinFlow — Feedback Engine
-- Tabela única para bugs / sugestões / feature requests
-- Aceita submissões de usuários logados E do form público (anon)
-- =============================================================

create table if not exists public.feedback (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- null = veio do form público
  user_id         uuid references auth.users(id) on delete set null,

  -- preenchidos só quando user_id é null (form público)
  submitter_name  text,
  submitter_email text,

  type            text not null check (type in ('bug', 'sugestao', 'feature')),
  title           text not null,
  description     text not null,

  status          text not null default 'novo'
                    check (status in ('novo', 'em_progresso', 'descartado', 'feito')),
  priority        text check (priority in ('baixa', 'media', 'alta')),

  -- ID textual do changelog (src/js/lib/changelog.js) quando vira release
  changelog_id    text,

  admin_notes     text
);

create index if not exists feedback_status_idx     on public.feedback(status);
create index if not exists feedback_user_id_idx    on public.feedback(user_id);
create index if not exists feedback_created_at_idx on public.feedback(created_at desc);

-- Trigger updated_at (reusa função existente do 0001_schema.sql)
drop trigger if exists trg_feedback_updated_at on public.feedback;
create trigger trg_feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

-- =============================================================
-- RLS
-- =============================================================
alter table public.feedback enable row level security;

-- INSERT: anon pode inserir desde que não passe user_id;
-- authenticated pode inserir com user_id próprio ou null
drop policy if exists "feedback_insert_anon" on public.feedback;
create policy "feedback_insert_anon" on public.feedback
  for insert to anon
  with check (user_id is null);

drop policy if exists "feedback_insert_authenticated" on public.feedback;
create policy "feedback_insert_authenticated" on public.feedback
  for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

-- SELECT/UPDATE/DELETE: qualquer usuário logado (admin role fica pra depois)
drop policy if exists "feedback_select_authenticated" on public.feedback;
create policy "feedback_select_authenticated" on public.feedback
  for select to authenticated using (true);

drop policy if exists "feedback_update_authenticated" on public.feedback;
create policy "feedback_update_authenticated" on public.feedback
  for update to authenticated using (true) with check (true);

drop policy if exists "feedback_delete_authenticated" on public.feedback;
create policy "feedback_delete_authenticated" on public.feedback
  for delete to authenticated using (true);
