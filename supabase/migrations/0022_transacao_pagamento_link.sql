-- ============================================================
-- 0022_transacao_pagamento_link.sql
--
-- Adiciona pagamento_id em transacoes para o sync bidirecional
-- com a página de pagamentos (Fase 2 do módulo de Transações).
--
-- Quando um pagamento é marcado como Pago/Cartão/Transferido/Parcial,
-- o sistema auto-cria uma transação vinculada. Quando o usuário cria
-- uma transação manual com subcategoria do mesmo mês de um pagamento
-- agendado, o sistema oferece marcar o pagamento como pago.
--
-- on delete set null: se o pagamento for excluído (ex: regeneração
-- mensal), a transação fica órfã (sem link) mas preservada.
-- ============================================================

alter table public.transacoes
  add column if not exists pagamento_id uuid
    references public.pagamentos(id)
    on delete set null;

create index if not exists idx_transacoes_pagamento_id
  on public.transacoes (pagamento_id)
  where pagamento_id is not null;
