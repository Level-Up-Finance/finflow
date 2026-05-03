-- Fase 5.A: Status de reconciliação para transações importadas de extrato bancário.
--   'manual'       – lançada manualmente pelo usuário (padrão histórico)
--   'importado'    – importada de extrato, aguardando confirmação do usuário
--   'reconciliado' – confirmada e reconciliada pelo usuário

alter table public.transacoes
  add column if not exists reconciliacao_status text not null default 'manual'
  check (reconciliacao_status in ('manual', 'importado', 'reconciliado'));

create index if not exists idx_transacoes_reconciliacao_status
  on public.transacoes(user_id, reconciliacao_status);

comment on column public.transacoes.reconciliacao_status is
  'manual = lançada pelo usuário; importado = vinda de extrato, pendente de confirmação; reconciliado = confirmada';
