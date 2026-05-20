-- =============================================================
-- Situação 3: Adiantamento de Receita
-- =============================================================
-- Modelo:
--   Usuário recebe R$ X de uma receita por mês.
--   Pede um adiantamento de R$ Y (valor_solicitado).
--   Recebe Y - taxa = valor_liquido na conta_credito_id em data_recebimento.
--   Esse adiantamento é descontado em N parcelas mensais começando
--   em mes_inicio_desconto. Cada parcela = valor_solicitado / N.
--
-- Em runtime:
--   - 1 transação Receita de valor_liquido é criada na data_recebimento.
--   - orcamento_geral dos N meses subsequentes recebe override:
--     valor_previsto = valor_base - parcela_mensal
--   - Pagamentos visualizam o badge "Adiantado (k/N)" + valor reduzido.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.adiantamentos_receita (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subcategoria_id      uuid NOT NULL REFERENCES public.subcategorias(id) ON DELETE CASCADE,
  conta_credito_id     uuid REFERENCES public.contas(id) ON DELETE SET NULL,
  data_recebimento     date NOT NULL,
  valor_solicitado     numeric(15,2) NOT NULL CHECK (valor_solicitado > 0),
  valor_liquido        numeric(15,2) NOT NULL CHECK (valor_liquido >= 0),
  taxa                 numeric(15,2) NOT NULL DEFAULT 0,
  taxa_percentual      numeric(8,4),
  n_parcelas           integer NOT NULL CHECK (n_parcelas > 0),
  mes_inicio_desconto  date NOT NULL,         -- YYYY-MM-01
  status               text NOT NULL DEFAULT 'ativo'
                          CHECK (status IN ('ativo', 'liquidado', 'cancelado')),
  transacao_credito_id uuid REFERENCES public.transacoes(id) ON DELETE SET NULL,
  observacao           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_adiantamentos_user_sub
  ON public.adiantamentos_receita(user_id, subcategoria_id);
CREATE INDEX IF NOT EXISTS idx_adiantamentos_user_status_mes
  ON public.adiantamentos_receita(user_id, status, mes_inicio_desconto);

ALTER TABLE public.adiantamentos_receita ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "adiant_select" ON public.adiantamentos_receita;
CREATE POLICY "adiant_select" ON public.adiantamentos_receita
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "adiant_insert" ON public.adiantamentos_receita;
CREATE POLICY "adiant_insert" ON public.adiantamentos_receita
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "adiant_update" ON public.adiantamentos_receita;
CREATE POLICY "adiant_update" ON public.adiantamentos_receita
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "adiant_delete" ON public.adiantamentos_receita;
CREATE POLICY "adiant_delete" ON public.adiantamentos_receita
  FOR DELETE USING (user_id = auth.uid());

-- Trigger pra atualizar updated_at
CREATE OR REPLACE FUNCTION public.set_adiantamentos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_adiantamentos_updated_at ON public.adiantamentos_receita;
CREATE TRIGGER trg_adiantamentos_updated_at
  BEFORE UPDATE ON public.adiantamentos_receita
  FOR EACH ROW EXECUTE FUNCTION public.set_adiantamentos_updated_at();

COMMENT ON TABLE public.adiantamentos_receita IS
  'Registro de adiantamentos de receita. Cria transação de entrada na data_recebimento e override do orcamento_geral nos N meses de desconto.';
