-- Banco ID: texto bruto do extrato bancário, imutável após importação.
-- Permite auto-reconhecimento por histórico de reconciliações anteriores.
alter table public.transacoes
  add column if not exists banco_desc text;

create index if not exists idx_transacoes_banco_desc
  on public.transacoes(user_id, banco_desc)
  where banco_desc is not null;
