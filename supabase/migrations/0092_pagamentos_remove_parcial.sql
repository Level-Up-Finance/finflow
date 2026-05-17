-- Remove status 'Parcial' de pagamentos.
-- Migra registros existentes: valor_real preenchido → Pago, sem valor → Agendado.

UPDATE pagamentos
  SET status = 'Pago'
  WHERE status = 'Parcial' AND valor_real IS NOT NULL;

UPDATE pagamentos
  SET status = 'Agendado'
  WHERE status = 'Parcial' AND valor_real IS NULL;

-- Recria constraint sem 'Parcial'
ALTER TABLE pagamentos DROP CONSTRAINT IF EXISTS pagamentos_status_check;

ALTER TABLE pagamentos
  ADD CONSTRAINT pagamentos_status_check
  CHECK (status IN ('Pago','Transferido','Agendado','Cancelado','Cartão','A Transferir'));
