-- ============================================================
-- 0024_regras_reconciliacao.sql
--
-- Cria a tabela de regras de auto-reconciliação: o usuário pode
-- definir que toda transação com determinado contato seja
-- automaticamente categorizada com uma subcategoria específica.
--
-- Uma regra por (user_id, contato_id) — se o usuário criar/atualizar,
-- substitui a anterior. on delete cascade no contato e na subcategoria
-- garante que regras órfãs são limpas automaticamente.
-- ============================================================

create table if not exists public.regras_reconciliacao (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  contato_id      uuid not null references public.contatos(id) on delete cascade,
  subcategoria_id uuid not null references public.subcategorias(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique(user_id, contato_id)
);

create index if not exists idx_regras_user_contato
  on public.regras_reconciliacao (user_id, contato_id);

-- RLS
alter table public.regras_reconciliacao enable row level security;

drop policy if exists "regras_select" on public.regras_reconciliacao;
create policy "regras_select" on public.regras_reconciliacao
  for select using (auth.uid() = user_id);

drop policy if exists "regras_insert" on public.regras_reconciliacao;
create policy "regras_insert" on public.regras_reconciliacao
  for insert with check (auth.uid() = user_id);

drop policy if exists "regras_update" on public.regras_reconciliacao;
create policy "regras_update" on public.regras_reconciliacao
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "regras_delete" on public.regras_reconciliacao;
create policy "regras_delete" on public.regras_reconciliacao
  for delete using (auth.uid() = user_id);
