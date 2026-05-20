-- =============================================================
-- Situação 1: Sincronização pagamento ↔ transação ↔ extrato
-- =============================================================
-- Mudanças:
--   1. pagamentos.data_pagamento — data efetiva do pagamento (vs data_vencimento que é planejada)
--   2. pagamentos.status_atualizado_em — timestamp da última mudança de status
--   3. transacoes.confirmado_automaticamente — true quando o sistema confirmou via regra
--   4. transacoes.extrato_id + importada_em — rastreamento do lote de importação
--   5. regras_reconciliacao.auto_confirmar — opt-in pra auto-confirmação
--   6. tabela extratos_importados — registro dos lotes de importação
-- =============================================================

-- 1. data_pagamento e status_atualizado_em em pagamentos
ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS data_pagamento date,
  ADD COLUMN IF NOT EXISTS status_atualizado_em timestamptz;

COMMENT ON COLUMN public.pagamentos.data_pagamento IS
  'Data efetiva em que o pagamento foi marcado como Pago/Transferido. Diferente de data_vencimento que é a data planejada.';
COMMENT ON COLUMN public.pagamentos.status_atualizado_em IS
  'Timestamp da última mudança de status. Útil pra auditoria.';

-- 2. confirmado_automaticamente, extrato_id e importada_em em transacoes
ALTER TABLE public.transacoes
  ADD COLUMN IF NOT EXISTS confirmado_automaticamente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extrato_id uuid,
  ADD COLUMN IF NOT EXISTS importada_em timestamptz;

COMMENT ON COLUMN public.transacoes.confirmado_automaticamente IS
  'true = reconciliada automaticamente pelo sistema via regra de auto_confirmar. false = manual.';
COMMENT ON COLUMN public.transacoes.extrato_id IS
  'Referência ao lote de importação (tabela extratos_importados).';

-- 3. auto_confirmar em regras_reconciliacao
ALTER TABLE public.regras_reconciliacao
  ADD COLUMN IF NOT EXISTS auto_confirmar boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.regras_reconciliacao.auto_confirmar IS
  'Se true, transações importadas que casarem com esta regra são marcadas como reconciliado automaticamente.';

-- 4. Tabela extratos_importados (rastreamento de lotes)
CREATE TABLE IF NOT EXISTS public.extratos_importados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conta_id uuid REFERENCES public.contas(id) ON DELETE SET NULL,
  nome_arquivo text,
  formato text,                            -- 'csv' | 'excel' | 'ofx'
  total_linhas integer NOT NULL DEFAULT 0,
  total_novas integer NOT NULL DEFAULT 0,           -- criadas como 'importado'
  total_vinculadas integer NOT NULL DEFAULT 0,      -- linkadas a pagamento existente
  total_auto_confirmadas integer NOT NULL DEFAULT 0,-- reconciliadas via regra
  total_puladas integer NOT NULL DEFAULT 0,         -- duplicatas (banco_id ou dedup)
  importado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extratos_importados_user
  ON public.extratos_importados(user_id, importado_em DESC);

CREATE INDEX IF NOT EXISTS idx_transacoes_extrato_id
  ON public.transacoes(extrato_id) WHERE extrato_id IS NOT NULL;

-- 5. RLS para extratos_importados
ALTER TABLE public.extratos_importados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "extratos_importados_select" ON public.extratos_importados;
CREATE POLICY "extratos_importados_select" ON public.extratos_importados
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "extratos_importados_insert" ON public.extratos_importados;
CREATE POLICY "extratos_importados_insert" ON public.extratos_importados
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "extratos_importados_update" ON public.extratos_importados;
CREATE POLICY "extratos_importados_update" ON public.extratos_importados
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "extratos_importados_delete" ON public.extratos_importados;
CREATE POLICY "extratos_importados_delete" ON public.extratos_importados
  FOR DELETE USING (user_id = auth.uid());
