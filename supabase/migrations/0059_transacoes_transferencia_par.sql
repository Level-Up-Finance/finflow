-- Liga os dois lados de uma transferência: saída e entrada
alter table public.transacoes
  add column if not exists transferencia_par_id uuid references public.transacoes(id) on delete set null;

create index if not exists idx_transacoes_transferencia_par
  on public.transacoes(transferencia_par_id)
  where transferencia_par_id is not null;
