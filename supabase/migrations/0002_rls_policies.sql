-- =============================================================
-- FinFlow — Row Level Security
-- Rodar APÓS 0001_schema.sql
-- =============================================================

-- =============================================================
-- Habilita RLS em todas as tabelas
-- =============================================================
alter table public.profiles         enable row level security;
alter table public.contas           enable row level security;
alter table public.categorias       enable row level security;
alter table public.orcamento_geral  enable row level security;
alter table public.pagamentos       enable row level security;
alter table public.dividas          enable row level security;
alter table public.investimentos    enable row level security;
alter table public.cambio_cache     enable row level security;

-- =============================================================
-- profiles: cada usuário só vê/edita o próprio
-- =============================================================
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- INSERT em profiles é feito pelo trigger handle_new_user (security definer),
-- então não precisamos de policy de insert pública aqui.

-- =============================================================
-- Helper: macro de policies para tabelas escopadas por user_id
-- =============================================================
-- Tabelas com user_id seguem todas o mesmo padrão.
-- Repetimos o bloco pra cada tabela explicitamente (Postgres não tem loop em DDL).

-- ---------- contas ----------
drop policy if exists "contas_select" on public.contas;
create policy "contas_select" on public.contas for select using (user_id = auth.uid());

drop policy if exists "contas_insert" on public.contas;
create policy "contas_insert" on public.contas for insert with check (user_id = auth.uid());

drop policy if exists "contas_update" on public.contas;
create policy "contas_update" on public.contas for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "contas_delete" on public.contas;
create policy "contas_delete" on public.contas for delete using (user_id = auth.uid());

-- ---------- categorias ----------
drop policy if exists "categorias_select" on public.categorias;
create policy "categorias_select" on public.categorias for select using (user_id = auth.uid());

drop policy if exists "categorias_insert" on public.categorias;
create policy "categorias_insert" on public.categorias for insert with check (user_id = auth.uid());

drop policy if exists "categorias_update" on public.categorias;
create policy "categorias_update" on public.categorias for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "categorias_delete" on public.categorias;
create policy "categorias_delete" on public.categorias for delete using (user_id = auth.uid());

-- ---------- orcamento_geral ----------
drop policy if exists "orcamento_select" on public.orcamento_geral;
create policy "orcamento_select" on public.orcamento_geral for select using (user_id = auth.uid());

drop policy if exists "orcamento_insert" on public.orcamento_geral;
create policy "orcamento_insert" on public.orcamento_geral for insert with check (user_id = auth.uid());

drop policy if exists "orcamento_update" on public.orcamento_geral;
create policy "orcamento_update" on public.orcamento_geral for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "orcamento_delete" on public.orcamento_geral;
create policy "orcamento_delete" on public.orcamento_geral for delete using (user_id = auth.uid());

-- ---------- pagamentos ----------
drop policy if exists "pagamentos_select" on public.pagamentos;
create policy "pagamentos_select" on public.pagamentos for select using (user_id = auth.uid());

drop policy if exists "pagamentos_insert" on public.pagamentos;
create policy "pagamentos_insert" on public.pagamentos for insert with check (user_id = auth.uid());

drop policy if exists "pagamentos_update" on public.pagamentos;
create policy "pagamentos_update" on public.pagamentos for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "pagamentos_delete" on public.pagamentos;
create policy "pagamentos_delete" on public.pagamentos for delete using (user_id = auth.uid());

-- ---------- dividas ----------
drop policy if exists "dividas_select" on public.dividas;
create policy "dividas_select" on public.dividas for select using (user_id = auth.uid());

drop policy if exists "dividas_insert" on public.dividas;
create policy "dividas_insert" on public.dividas for insert with check (user_id = auth.uid());

drop policy if exists "dividas_update" on public.dividas;
create policy "dividas_update" on public.dividas for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "dividas_delete" on public.dividas;
create policy "dividas_delete" on public.dividas for delete using (user_id = auth.uid());

-- ---------- investimentos ----------
drop policy if exists "investimentos_select" on public.investimentos;
create policy "investimentos_select" on public.investimentos for select using (user_id = auth.uid());

drop policy if exists "investimentos_insert" on public.investimentos;
create policy "investimentos_insert" on public.investimentos for insert with check (user_id = auth.uid());

drop policy if exists "investimentos_update" on public.investimentos;
create policy "investimentos_update" on public.investimentos for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "investimentos_delete" on public.investimentos;
create policy "investimentos_delete" on public.investimentos for delete using (user_id = auth.uid());

-- ---------- cambio_cache ----------
-- Cache opcional: leitura permitida pra qualquer usuário autenticado (cotações são públicas)
-- Insert/update restritos ao próprio user_id.
drop policy if exists "cambio_select" on public.cambio_cache;
create policy "cambio_select" on public.cambio_cache for select using (auth.uid() is not null);

drop policy if exists "cambio_insert" on public.cambio_cache;
create policy "cambio_insert" on public.cambio_cache for insert with check (user_id = auth.uid() or user_id is null);

drop policy if exists "cambio_delete" on public.cambio_cache;
create policy "cambio_delete" on public.cambio_cache for delete using (user_id = auth.uid());
