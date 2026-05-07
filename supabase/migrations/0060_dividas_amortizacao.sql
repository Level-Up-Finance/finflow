-- Adiciona campos de regime de amortização e parcelamento à tabela dividas
alter table public.dividas
  add column if not exists regime text check (regime in ('SAC', 'Price')),
  add column if not exists n_parcelas integer,
  add column if not exists parcelas_pagas integer not null default 0,
  add column if not exists taxa_tipo text check (taxa_tipo in ('fixa', 'variavel')) not null default 'fixa',
  add column if not exists taxa_referencia text;

-- Adiciona colunas de amortização detalhada ao histórico de pagamentos
alter table public.pagamentos_divida_historico
  add column if not exists n_parcela integer,
  add column if not exists valor_amortizacao numeric(15,2),
  add column if not exists valor_juros numeric(15,2),
  add column if not exists desconto_antecipacao numeric(15,2);

-- Histórico de atualizações de taxa de juros (necessário para taxa variável)
create table if not exists public.divida_taxa_historico (
  id             uuid        primary key default gen_random_uuid(),
  divida_id      uuid        not null references public.dividas(id) on delete cascade,
  user_id        uuid        not null references auth.users(id)  on delete cascade,
  taxa_anterior  numeric(8,6),
  taxa_nova      numeric(8,6) not null,
  data_vigencia  date        not null,
  motivo         text,
  created_at     timestamptz not null default now()
);

alter table public.divida_taxa_historico enable row level security;

create policy "users access own divida_taxa_historico"
  on public.divida_taxa_historico for all using (auth.uid() = user_id);
