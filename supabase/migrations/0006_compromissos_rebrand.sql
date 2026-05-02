-- ============================================================
-- 0006_compromissos_rebrand.sql
--
-- Renomeia "Categorias" → "Compromissos" e introduz hierarquia:
--   • Categoria (NOVA tabela, parent): Receitas / Dívidas /
--     Investimentos + customizáveis
--   • Subcategoria (RENAME de categorias): os compromissos
--     individuais que pertencem a uma Categoria
--
-- Mudanças adicionais:
--   • tipo: 'Receita'/'Dívidas'/'Outros' → 'Receita'/'Despesa'
--   • tipo_pagamento: lista atualizada (Débito Direto + Transferência)
--   • dia_semana: nova coluna pra recorrência Semanal/Quinzenal
--
-- Idempotente.
-- ============================================================

-- ====================================================
-- STEP 1: Rename FK columns (categoria_id → subcategoria_id)
-- em orcamento_geral e pagamentos
-- ====================================================
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='orcamento_geral' and column_name='categoria_id') then
    alter table public.orcamento_geral rename column categoria_id to subcategoria_id;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='pagamentos' and column_name='categoria_id') then
    alter table public.pagamentos rename column categoria_id to subcategoria_id;
  end if;
end $$;

-- ====================================================
-- STEP 2: Rename tabela categorias → subcategorias
-- (apenas se for a "antiga" categorias com tipo_conta)
-- ====================================================
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='categorias')
     and exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='categorias' and column_name='tipo_conta')
     and not exists (select 1 from information_schema.tables
                     where table_schema='public' and table_name='subcategorias') then
    alter table public.categorias rename to subcategorias;
  end if;
end $$;

-- ====================================================
-- STEP 3: Atualiza enum tipo (Receita/Dívidas/Outros → Receita/Despesa)
-- e renomeia coluna tipo_conta → tipo
-- ORDEM IMPORTANTE: drop check ANTES de update valores
-- ====================================================
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='subcategorias' and column_name='tipo_conta') then
    -- 1. Drop old constraint PRIMEIRO (pra liberar valores fora do enum antigo)
    alter table public.subcategorias drop constraint if exists categorias_tipo_conta_check;
    alter table public.subcategorias drop constraint if exists subcategorias_tipo_conta_check;

    -- 2. AGORA migrar valores
    update public.subcategorias set tipo_conta = 'Despesa' where tipo_conta in ('Dívidas', 'Outros');

    -- 3. Rename column
    alter table public.subcategorias rename column tipo_conta to tipo;
  end if;
end $$;

-- Garante o check correto (idempotente)
alter table public.subcategorias drop constraint if exists subcategorias_tipo_check;
alter table public.subcategorias add  constraint subcategorias_tipo_check
  check (tipo in ('Receita', 'Despesa'));

-- ====================================================
-- STEP 4: Atualiza enum tipo_pagamento
-- ORDEM IMPORTANTE: drop check ANTES de update valores
-- ====================================================
-- 1. Drop old constraint PRIMEIRO
alter table public.subcategorias drop constraint if exists categorias_tipo_pagamento_check;
alter table public.subcategorias drop constraint if exists subcategorias_tipo_pagamento_check;

-- 2. AGORA migrar valores (TED → Transferência)
update public.subcategorias set tipo_pagamento = 'Transferência' where tipo_pagamento = 'TED';

-- 3. Adicionar nova constraint
alter table public.subcategorias add  constraint subcategorias_tipo_pagamento_check
  check (tipo_pagamento is null or tipo_pagamento in
    ('Boleto', 'Crédito', 'Débito', 'Débito Direto', 'Dinheiro', 'PIX', 'Transferência')
  );

-- ====================================================
-- STEP 5: Adiciona dia_semana (0-6, Domingo=0)
-- ====================================================
alter table public.subcategorias add column if not exists dia_semana integer;
alter table public.subcategorias drop constraint if exists subcategorias_dia_semana_check;
alter table public.subcategorias add  constraint subcategorias_dia_semana_check
  check (dia_semana is null or dia_semana between 0 and 6);

-- ====================================================
-- STEP 6: Cria tabela categorias (parent groups)
-- ====================================================
create table if not exists public.categorias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  nome        text not null,
  descricao   text,
  cor         text not null default '#6D5EF5',
  ativo       boolean not null default true,
  ordem       integer not null default 0,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_categorias_user on public.categorias(user_id);

-- ====================================================
-- STEP 7: Adiciona FK categoria_id em subcategorias
-- ====================================================
alter table public.subcategorias add column if not exists categoria_id
  uuid references public.categorias(id) on delete set null;

-- ====================================================
-- STEP 8: RLS na nova tabela categorias
-- ====================================================
alter table public.categorias enable row level security;

drop policy if exists "categorias_select" on public.categorias;
drop policy if exists "categorias_insert" on public.categorias;
drop policy if exists "categorias_update" on public.categorias;
drop policy if exists "categorias_delete" on public.categorias;

create policy "categorias_select" on public.categorias for select using (user_id = auth.uid());
create policy "categorias_insert" on public.categorias for insert with check (user_id = auth.uid());
create policy "categorias_update" on public.categorias for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "categorias_delete" on public.categorias for delete using (user_id = auth.uid());

-- ====================================================
-- STEP 9: Renomeia policies em subcategorias (eram categorias_*)
-- ====================================================
drop policy if exists "categorias_select" on public.subcategorias;
drop policy if exists "categorias_insert" on public.subcategorias;
drop policy if exists "categorias_update" on public.subcategorias;
drop policy if exists "categorias_delete" on public.subcategorias;

drop policy if exists "subcategorias_select" on public.subcategorias;
drop policy if exists "subcategorias_insert" on public.subcategorias;
drop policy if exists "subcategorias_update" on public.subcategorias;
drop policy if exists "subcategorias_delete" on public.subcategorias;

create policy "subcategorias_select" on public.subcategorias for select using (user_id = auth.uid());
create policy "subcategorias_insert" on public.subcategorias for insert with check (user_id = auth.uid());
create policy "subcategorias_update" on public.subcategorias for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "subcategorias_delete" on public.subcategorias for delete using (user_id = auth.uid());
