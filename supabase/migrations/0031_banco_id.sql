-- Identificador único da transação fornecido pelo banco no extrato.
-- Usado para deduplicação automática ao re-importar o mesmo arquivo.
alter table public.transacoes
  add column if not exists banco_id text;

-- Índice único: mesmo banco não pode ter duas transações com o mesmo ID na mesma conta.
create unique index if not exists idx_transacoes_banco_id
  on public.transacoes(user_id, conta_id, banco_id)
  where banco_id is not null;
