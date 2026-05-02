-- ============================================================
-- 0003_contas_redesign.sql
--
-- Refactor da tabela `contas` (Fase 2.1):
--   • Atualiza enum de tipo: 'Crédito' → 'Cartão de Crédito',
--                            'Carteira' → 'Cofrinho'
--   • Adiciona: descricao, desde, fechada_em, status, papel,
--               fec_fatura, vencimento
--   • Remove: ativo (substituído por status), icone_simbolo
--             (ícone agora é automático pelo tipo)
--
-- Idempotente — pode rodar múltiplas vezes sem quebrar.
-- ============================================================

-- 1) Migrar valores existentes pro novo enum
update public.contas set tipo = 'Cartão de Crédito' where tipo = 'Crédito';
update public.contas set tipo = 'Cofrinho'           where tipo = 'Carteira';

-- 2) Trocar check do tipo
alter table public.contas drop constraint if exists contas_tipo_check;
alter table public.contas add  constraint contas_tipo_check
  check (tipo in ('Corrente','Poupança','Cofrinho','Investimento','Cartão de Crédito'));

-- 3) Novas colunas
alter table public.contas add column if not exists descricao   text;
alter table public.contas add column if not exists desde       date    not null default current_date;
alter table public.contas add column if not exists fechada_em  date;
alter table public.contas add column if not exists status      text    not null default 'ativa';
alter table public.contas add column if not exists papel       text    not null default 'secundaria';
alter table public.contas add column if not exists fec_fatura  integer;
alter table public.contas add column if not exists vencimento  integer;

-- 4) Constraints nas novas colunas
alter table public.contas drop constraint if exists contas_status_check;
alter table public.contas add  constraint contas_status_check
  check (status in ('ativa','inativa','arquivada'));

alter table public.contas drop constraint if exists contas_papel_check;
alter table public.contas add  constraint contas_papel_check
  check (papel in ('principal','secundaria'));

alter table public.contas drop constraint if exists contas_fec_fatura_check;
alter table public.contas add  constraint contas_fec_fatura_check
  check (fec_fatura is null or (fec_fatura between 1 and 31));

alter table public.contas drop constraint if exists contas_vencimento_check;
alter table public.contas add  constraint contas_vencimento_check
  check (vencimento is null or (vencimento between 1 and 31));

-- 5) Migrar `ativo` (boolean) → `status` (texto), se a coluna ainda existir
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contas' and column_name = 'ativo'
  ) then
    update public.contas set status = 'inativa' where ativo = false;
  end if;
end $$;

-- 6) Drop colunas antigas
alter table public.contas drop column if exists ativo;
alter table public.contas drop column if exists icone_simbolo;
