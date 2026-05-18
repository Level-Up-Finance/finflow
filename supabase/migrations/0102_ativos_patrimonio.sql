-- ============================================================
-- 0102_ativos_patrimonio.sql
--
-- Ticket sg.app.000067: cálculo de patrimônio com FIPE/ativos
--
-- Adiciona:
-- 1. Coluna inclui_no_patrimonio em dividas e projetos_investimento
-- 2. Tabela ativos_subjacentes (1:1 com dívida): veículo (FIPE) ou imóvel (valor manual)
-- 3. RLS policies de ativos_subjacentes (próprio user)
--
-- Patrimônio Fixo será calculado em runtime no frontend como:
--   - dividas inclui_no_patrimonio=true: (valor_ativo - saldo_devedor)
--   - projetos_investimento inclui_no_patrimonio=true: valor_atual_investido
--
-- Patrimônio Corrente = Patrimônio Fixo + saldos contas - faturas cartão.
-- ============================================================

-- ── 1. Flags inclui_no_patrimonio ────────────────────────────
alter table public.dividas
  add column if not exists inclui_no_patrimonio boolean not null default false;

alter table public.projetos_investimento
  add column if not exists inclui_no_patrimonio boolean not null default false;

-- ── 2. Tabela ativos_subjacentes ─────────────────────────────
create table if not exists public.ativos_subjacentes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  divida_id          uuid not null references public.dividas(id) on delete cascade unique,
  tipo               text not null check (tipo in ('veiculo', 'imovel')),

  -- Veículo (tipo='veiculo')
  fipe_codigo        text,                -- ex: '021003-2'
  fipe_marca         text,                -- ex: 'Toyota'
  fipe_modelo        text,                -- ex: 'COROLLA XEi 2.0 Flex 16V Aut.'
  fipe_ano_modelo    text,                -- ex: '2020-1' (ano + tipo_combustivel)
  fipe_combustivel   text,                -- ex: 'Gasolina'
  placa              text,                -- opcional, livre

  -- Imóvel (tipo='imovel')
  endereco           text,                -- descrição livre
  area_m2            numeric(10,2),       -- opcional, p/ futuras integrações

  -- Comum
  descricao          text,
  valor_atual        numeric(15,2),       -- último valor conhecido (FIPE ou manual)
  valor_atualizado_em timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists ativos_subjacentes_user_idx    on public.ativos_subjacentes(user_id);
create index if not exists ativos_subjacentes_divida_idx  on public.ativos_subjacentes(divida_id);

-- Trigger updated_at (reusa função set_updated_at do 0001_schema.sql)
drop trigger if exists trg_ativos_subjacentes_updated_at on public.ativos_subjacentes;
create trigger trg_ativos_subjacentes_updated_at
  before update on public.ativos_subjacentes
  for each row execute function public.set_updated_at();

-- ── 3. RLS ───────────────────────────────────────────────────
alter table public.ativos_subjacentes enable row level security;

drop policy if exists "ativos_subjacentes_select_own" on public.ativos_subjacentes;
create policy "ativos_subjacentes_select_own" on public.ativos_subjacentes
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "ativos_subjacentes_insert_own" on public.ativos_subjacentes;
create policy "ativos_subjacentes_insert_own" on public.ativos_subjacentes
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "ativos_subjacentes_update_own" on public.ativos_subjacentes;
create policy "ativos_subjacentes_update_own" on public.ativos_subjacentes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "ativos_subjacentes_delete_own" on public.ativos_subjacentes;
create policy "ativos_subjacentes_delete_own" on public.ativos_subjacentes
  for delete to authenticated
  using (user_id = auth.uid());
