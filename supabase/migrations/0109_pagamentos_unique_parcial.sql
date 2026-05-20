-- 0109_pagamentos_unique_parcial.sql
--
-- Torna o constraint pagamentos_unique_sub_month_vencimento PARCIAL:
-- só impede duplicação de pagamentos positivos (mensalidades automáticas).
-- Valores negativos (resgates de caixinha) podem coexistir no mesmo dia.

ALTER TABLE public.pagamentos
  DROP CONSTRAINT IF EXISTS pagamentos_unique_sub_month_vencimento;

CREATE UNIQUE INDEX IF NOT EXISTS pagamentos_unique_sub_month_vencimento
  ON public.pagamentos (user_id, subcategoria_id, mes_ano, data_vencimento)
  WHERE valor_real IS NULL OR valor_real >= 0;
