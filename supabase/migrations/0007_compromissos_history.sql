-- ============================================================
-- 0007_compromissos_history.sql
--
-- Adiciona em subcategorias:
--   • modificado_em (timestamp, auto-atualizado em cada UPDATE)
--   • terminado_em  (date, manual — quando o compromisso termina)
--
-- Cria tabela subcategoria_history pra log de alterações:
--   • valor_base, periodo, vencimento_dia, dia_semana, tipo
--
-- Idempotente.
-- ============================================================

-- ====================================================
-- STEP 1: Novas colunas em subcategorias
-- ====================================================
alter table public.subcategorias add column if not exists modificado_em timestamptz default now();
alter table public.subcategorias add column if not exists terminado_em  date;

-- ====================================================
-- STEP 2: Trigger pra auto-atualizar modificado_em
-- ====================================================
create or replace function public.set_subcategorias_modificado_em()
returns trigger
language plpgsql
as $$
begin
  new.modificado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_subcategorias_modificado on public.subcategorias;
create trigger trg_subcategorias_modificado
  before update on public.subcategorias
  for each row execute function public.set_subcategorias_modificado_em();

-- ====================================================
-- STEP 3: Tabela subcategoria_history
-- ====================================================
create table if not exists public.subcategoria_history (
  id              uuid primary key default gen_random_uuid(),
  subcategoria_id uuid not null references public.subcategorias(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  campo           text not null,
  valor_anterior  text,
  valor_novo      text,
  alterado_em     timestamptz not null default now()
);

create index if not exists idx_subcategoria_history_subcat
  on public.subcategoria_history(subcategoria_id, alterado_em desc);

-- ====================================================
-- STEP 4: RLS na history
-- ====================================================
alter table public.subcategoria_history enable row level security;

drop policy if exists "subcategoria_history_select" on public.subcategoria_history;
create policy "subcategoria_history_select" on public.subcategoria_history
  for select using (user_id = auth.uid());

drop policy if exists "subcategoria_history_insert" on public.subcategoria_history;
create policy "subcategoria_history_insert" on public.subcategoria_history
  for insert with check (user_id = auth.uid());

-- (Sem update/delete — histórico é imutável depois de gravado)

-- ====================================================
-- STEP 5: Trigger pra logar mudanças
-- ====================================================
create or replace function public.log_subcategoria_changes()
returns trigger
language plpgsql
security definer
as $$
begin
  -- valor_base
  if old.valor_base is distinct from new.valor_base then
    insert into public.subcategoria_history (subcategoria_id, user_id, campo, valor_anterior, valor_novo)
    values (new.id, new.user_id, 'valor_base', old.valor_base::text, new.valor_base::text);
  end if;

  -- periodo
  if old.periodo is distinct from new.periodo then
    insert into public.subcategoria_history (subcategoria_id, user_id, campo, valor_anterior, valor_novo)
    values (new.id, new.user_id, 'periodo', old.periodo, new.periodo);
  end if;

  -- vencimento_dia
  if old.vencimento_dia is distinct from new.vencimento_dia then
    insert into public.subcategoria_history (subcategoria_id, user_id, campo, valor_anterior, valor_novo)
    values (new.id, new.user_id, 'vencimento_dia', old.vencimento_dia::text, new.vencimento_dia::text);
  end if;

  -- dia_semana
  if old.dia_semana is distinct from new.dia_semana then
    insert into public.subcategoria_history (subcategoria_id, user_id, campo, valor_anterior, valor_novo)
    values (new.id, new.user_id, 'dia_semana', old.dia_semana::text, new.dia_semana::text);
  end if;

  -- tipo (Receita/Despesa)
  if old.tipo is distinct from new.tipo then
    insert into public.subcategoria_history (subcategoria_id, user_id, campo, valor_anterior, valor_novo)
    values (new.id, new.user_id, 'tipo', old.tipo, new.tipo);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_subcategoria_history on public.subcategorias;
create trigger trg_subcategoria_history
  after update on public.subcategorias
  for each row execute function public.log_subcategoria_changes();
