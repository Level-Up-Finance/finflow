-- =============================================================
-- FinFlow — Schema inicial
-- Rodar no Supabase SQL Editor (Project → SQL Editor → New query)
-- =============================================================

-- Extensão para gen_random_uuid() (já vem habilitada por padrão no Supabase)
create extension if not exists "pgcrypto";

-- =============================================================
-- profiles — extends auth.users
-- =============================================================
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nome            text,
  moeda_padrao    text not null default 'BRL',
  moedas_widget   jsonb not null default '["USD","EUR","GBP"]'::jsonb,
  created_at      timestamptz not null default now()
);

-- =============================================================
-- contas — bancos, cartões, carteiras
-- =============================================================
create table if not exists public.contas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  nome            text not null,
  tipo            text not null check (tipo in ('Corrente','Poupança','Crédito','Investimento','Carteira')),
  icone_cor       text not null default '#6D5EF5',
  icone_simbolo   text not null default '$',
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists idx_contas_user on public.contas(user_id);

-- =============================================================
-- categorias — entradas/saídas recorrentes
-- =============================================================
create table if not exists public.categorias (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  nome             text not null,
  tipo_conta       text not null check (tipo_conta in ('Receita','Dívidas','Outros')),
  conta_id         uuid references public.contas(id) on delete set null,
  tipo_pagamento   text check (tipo_pagamento in ('Débito','Crédito','PIX','TED','Boleto','Dinheiro')),
  vencimento_dia   integer check (vencimento_dia between 1 and 31),
  periodo          text not null default 'Mensal' check (periodo in ('Mensal','Quinzenal','Semanal','Anual','Único')),
  iniciado_em      date not null default current_date,
  moeda            text not null default 'BRL',
  valor_base       numeric(15,2) not null default 0,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists idx_categorias_user on public.categorias(user_id);
create index if not exists idx_categorias_conta on public.categorias(conta_id);

-- =============================================================
-- orcamento_geral — visão 12 meses, alimentado pelas categorias
-- =============================================================
create table if not exists public.orcamento_geral (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  categoria_id     uuid not null references public.categorias(id) on delete cascade,
  mes_ano          date not null,                 -- primeiro dia do mês (ex: 2026-02-01)
  valor_previsto   numeric(15,2) not null default 0,
  moeda            text not null default 'BRL',
  cambio_travado   numeric(15,6),                 -- taxa congelada no freeze
  travado_em       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(user_id, categoria_id, mes_ano)
);
create index if not exists idx_orcamento_user_mes on public.orcamento_geral(user_id, mes_ano);

-- =============================================================
-- pagamentos — operacional mensal (status real)
-- =============================================================
create table if not exists public.pagamentos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  orcamento_id      uuid not null references public.orcamento_geral(id) on delete cascade,
  categoria_id      uuid not null references public.categorias(id) on delete cascade,
  mes_ano           date not null,
  bloco_quinzenal   integer not null check (bloco_quinzenal in (1,2)),
  valor_previsto    numeric(15,2) not null default 0,
  valor_real        numeric(15,2),
  moeda             text not null default 'BRL',
  status            text not null default 'Agendado' check (status in ('Pago','Transferido','Agendado','Cancelado','Cartão','Parcial')),
  data_vencimento   date not null,
  observacao        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_pagamentos_user_mes on public.pagamentos(user_id, mes_ano, bloco_quinzenal);

-- =============================================================
-- dividas
-- =============================================================
create table if not exists public.dividas (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  nome              text not null,
  credor            text,
  valor_total       numeric(15,2) not null,
  valor_pago        numeric(15,2) not null default 0,
  juros_percentual  numeric(8,4),
  data_inicio       date not null default current_date,
  data_vencimento   date,
  status            text not null default 'Ativa' check (status in ('Ativa','Quitada','Negociando','Atrasada')),
  conta_id          uuid references public.contas(id) on delete set null,
  observacao        text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_dividas_user on public.dividas(user_id);

-- =============================================================
-- investimentos
-- =============================================================
create table if not exists public.investimentos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  nome            text not null,
  tipo            text not null check (tipo in ('Ações','Renda Fixa','FII','Cripto','Poupança','Outro')),
  valor_aportado  numeric(15,2) not null,
  valor_atual     numeric(15,2),
  moeda           text not null default 'BRL',
  data_inicio     date not null default current_date,
  conta_id        uuid references public.contas(id) on delete set null,
  observacao      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_investimentos_user on public.investimentos(user_id);

-- =============================================================
-- cambio_cache — opcional, cache de cotações por usuário
-- =============================================================
create table if not exists public.cambio_cache (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete cascade,
  moeda_base      text not null,
  moeda_alvo      text not null,
  taxa            numeric(15,6) not null,
  fonte           text default 'frankfurter',
  capturado_em    timestamptz not null default now()
);
create index if not exists idx_cambio_cache_pair on public.cambio_cache(moeda_base, moeda_alvo, capturado_em desc);

-- =============================================================
-- Trigger: updated_at
-- =============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_orcamento_geral_updated on public.orcamento_geral;
create trigger trg_orcamento_geral_updated
  before update on public.orcamento_geral
  for each row execute function public.set_updated_at();

drop trigger if exists trg_pagamentos_updated on public.pagamentos;
create trigger trg_pagamentos_updated
  before update on public.pagamentos
  for each row execute function public.set_updated_at();

drop trigger if exists trg_investimentos_updated on public.investimentos;
create trigger trg_investimentos_updated
  before update on public.investimentos
  for each row execute function public.set_updated_at();

-- =============================================================
-- Trigger: cria profile automaticamente quando um auth.user é criado
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
