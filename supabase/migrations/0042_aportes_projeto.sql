-- 0042_aportes_projeto.sql
--
-- Histórico manual de aportes por projeto de investimento.
-- Permite registrar entradas passadas (antes do FinFlow).
-- calcRealizado = saldo_inicial + sum(pagamentos) + sum(aportes_projeto).

CREATE TABLE IF NOT EXISTS public.aportes_projeto (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  projeto_id  UUID        NOT NULL REFERENCES public.projetos_investimento(id) ON DELETE CASCADE,
  data        DATE        NOT NULL,
  valor       NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  descricao   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.aportes_projeto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aportes_projeto: owner full access"
  ON public.aportes_projeto
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS aportes_projeto_projeto_id_idx ON public.aportes_projeto (projeto_id);
CREATE INDEX IF NOT EXISTS aportes_projeto_data_idx       ON public.aportes_projeto (data);
