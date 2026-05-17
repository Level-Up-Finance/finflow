-- Adiciona 'A Transferir' ao check constraint de pagamentos.status
-- 'A Transferir' = transferência agendada ainda não executada (equivale a 'A Pagar' para transferências)

ALTER TABLE pagamentos DROP CONSTRAINT IF EXISTS pagamentos_status_check;

ALTER TABLE pagamentos
  ADD CONSTRAINT pagamentos_status_check
  CHECK (status IN ('Pago','Transferido','Agendado','Cancelado','Cartão','Parcial','A Transferir'));
