-- =============================================================
-- FinFlow — transacoes: tipo Transferência + campos de câmbio
-- =============================================================

-- Ampliar a constraint de tipo para incluir Transferência
alter table public.transacoes
  drop constraint if exists transacoes_tipo_check;

alter table public.transacoes
  add constraint transacoes_tipo_check
  check (tipo in ('Receita', 'Despesa', 'Transferência'));

-- Campos específicos de transferência entre contas
alter table public.transacoes
  add column if not exists conta_destino_id    uuid        references public.contas(id) on delete set null,
  add column if not exists taxa_cambio_oficial  numeric(15,6),   -- taxa Frankfurter no momento do registro
  add column if not exists valor_destino        numeric(15,2),   -- valor efetivamente recebido na conta destino (BRL)
  add column if not exists taxa_cambio_efetiva  numeric(15,6);   -- valor_destino / valor (calculado ao confirmar)

create index if not exists idx_transacoes_conta_destino on public.transacoes(conta_destino_id)
  where conta_destino_id is not null;
