-- 0043_pagamentos_divida_historico.sql
--
-- Histórico manual de pagamentos por dívida.
-- Permite registrar pagamentos passados (antes do FinFlow).
-- Ao salvar extrato, valor_pago em dividas é recalculado como a soma das entradas.

CREATE TABLE IF NOT EXISTS public.pagamentos_divida_historico (
  id        UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id   UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  divida_id UUID          NOT NULL REFERENCES public.dividas(id) ON DELETE CASCADE,
  data      DATE          NOT NULL,
  valor     NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  descricao TEXT,
  created_at TIMESTAMPTZ  DEFAULT now()
);

ALTER TABLE public.pagamentos_divida_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pagamentos_divida_historico: owner full access"
  ON public.pagamentos_divida_historico
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS pag_div_hist_divida_id_idx ON public.pagamentos_divida_historico (divida_id);
CREATE INDEX IF NOT EXISTS pag_div_hist_data_idx      ON public.pagamentos_divida_historico (data);
