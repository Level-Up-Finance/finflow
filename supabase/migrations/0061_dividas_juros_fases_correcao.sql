-- =============================================================
-- FinFlow — Dívidas: tipo de juros (SELIC/CDI/IPCA), fases (carência), correção monetária
-- =============================================================

-- 1) Tipo de juros: manual, SELIC, SELIC+%, CDI, CDI+%, IPCA, IPCA+%
alter table public.dividas
  add column if not exists juros_tipo text not null default 'manual',
  add column if not exists juros_spread numeric(8,4);

alter table public.dividas drop constraint if exists dividas_juros_tipo_check;
alter table public.dividas
  add constraint dividas_juros_tipo_check
  check (juros_tipo in ('manual','selic','selic_plus','cdi','cdi_plus','ipca','ipca_plus'));

-- 2) Regime: adiciona 'Customizado' (fases) à lista permitida
alter table public.dividas drop constraint if exists dividas_regime_check;
alter table public.dividas
  add constraint dividas_regime_check
  check (regime is null or regime in ('SAC','Price','Customizado'));

-- Fases: jsonb array. Ex: [{"de":1,"ate":6,"valor":124.48},{"de":7,"ate":60,"valor":216.70}]
alter table public.dividas
  add column if not exists fases jsonb;

-- 3) Correção monetária mensal aplicada ao saldo/parcela
alter table public.dividas
  add column if not exists indice_correcao text not null default 'nenhum',
  add column if not exists correcao_taxa numeric(8,4);  -- usado quando indice_correcao = 'fixo'

alter table public.dividas drop constraint if exists dividas_indice_correcao_check;
alter table public.dividas
  add constraint dividas_indice_correcao_check
  check (indice_correcao in ('nenhum','TR','IPCA','IGPM','fixo'));

-- 4) Histórico: valor de correção monetária + flag de override manual
alter table public.pagamentos_divida_historico
  add column if not exists valor_correcao numeric(15,2),
  add column if not exists valor_real_override boolean not null default false;
