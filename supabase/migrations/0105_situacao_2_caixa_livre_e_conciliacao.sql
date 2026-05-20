-- =============================================================
-- Situação 2: Caixa Livre alocável + Conciliação bancária + Tarefas
-- =============================================================
-- Mudanças:
--   1. saldos_bancarios_snapshots — fonte de verdade do saldo do banco (vindo do OFX)
--   2. tarefas_usuario — lista de tarefas reutilizável (começa com import_extrato)
--   3. contas.frequencia_importacao_dias — define cadência de lembrete
--   4. alocacoes_caixa_livre — distribuição do "Caixa Livre" do bloco
-- =============================================================

-- 1. Snapshots de saldo bancário (extraídos do OFX)
CREATE TABLE IF NOT EXISTS public.saldos_bancarios_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conta_id    uuid NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  data        date NOT NULL,                  -- data do snapshot (do OFX <DTASOF>)
  saldo       numeric(15,2) NOT NULL,
  moeda       text NOT NULL DEFAULT 'BRL',
  fonte       text NOT NULL DEFAULT 'ofx',    -- 'ofx' | (futuro: 'manual' | 'api')
  extrato_id  uuid REFERENCES public.extratos_importados(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saldos_snap_user_conta_data
  ON public.saldos_bancarios_snapshots(user_id, conta_id, data DESC);

ALTER TABLE public.saldos_bancarios_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saldos_snap_select" ON public.saldos_bancarios_snapshots;
CREATE POLICY "saldos_snap_select" ON public.saldos_bancarios_snapshots
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "saldos_snap_insert" ON public.saldos_bancarios_snapshots;
CREATE POLICY "saldos_snap_insert" ON public.saldos_bancarios_snapshots
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "saldos_snap_update" ON public.saldos_bancarios_snapshots;
CREATE POLICY "saldos_snap_update" ON public.saldos_bancarios_snapshots
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "saldos_snap_delete" ON public.saldos_bancarios_snapshots;
CREATE POLICY "saldos_snap_delete" ON public.saldos_bancarios_snapshots
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.saldos_bancarios_snapshots IS
  'Snapshots de saldo bancário extraídos do OFX (LEDGERBAL). Usado pra comparar com saldo calculado no FinFlow.';

-- 2. Frequência de lembrete de importação (em dias) por conta
-- NULL = não lembrar | 7 = semanal | 15 = quinzenal | 30 = mensal (default)
ALTER TABLE public.contas
  ADD COLUMN IF NOT EXISTS frequencia_importacao_dias integer;

COMMENT ON COLUMN public.contas.frequencia_importacao_dias IS
  'Dias entre lembretes de importação. NULL = sem lembrete. Default ao criar nova conta: 30.';

-- 3. Tarefas do usuário (lista genérica/reutilizável)
CREATE TABLE IF NOT EXISTS public.tarefas_usuario (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo            text NOT NULL,
  titulo          text NOT NULL,
  descricao       text,
  prioridade      text NOT NULL DEFAULT 'normal'
                     CHECK (prioridade IN ('baixa', 'normal', 'alta')),
  status          text NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente', 'concluida', 'dispensada')),
  conta_id        uuid REFERENCES public.contas(id) ON DELETE CASCADE,
  acao_url        text,
  acao_label      text,
  metadata        jsonb,
  dispensada_ate  date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tarefas_user_status
  ON public.tarefas_usuario(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tarefas_user_tipo_conta
  ON public.tarefas_usuario(user_id, tipo, conta_id);

ALTER TABLE public.tarefas_usuario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tarefas_select" ON public.tarefas_usuario;
CREATE POLICY "tarefas_select" ON public.tarefas_usuario
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "tarefas_insert" ON public.tarefas_usuario;
CREATE POLICY "tarefas_insert" ON public.tarefas_usuario
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tarefas_update" ON public.tarefas_usuario;
CREATE POLICY "tarefas_update" ON public.tarefas_usuario
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tarefas_delete" ON public.tarefas_usuario;
CREATE POLICY "tarefas_delete" ON public.tarefas_usuario
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.tarefas_usuario IS
  'Tarefas do usuário (genérico). Tipos atuais: import_extrato. Expansível pra outros tipos no futuro.';

-- 4. Alocações do Caixa Livre por bloco
CREATE TABLE IF NOT EXISTS public.alocacoes_caixa_livre (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes_ano         date NOT NULL,             -- YYYY-MM-01 (mês do bloco)
  bloco_indice    integer NOT NULL,          -- índice do bloco quinzenal (1, 2, 3...)
  destino_tipo    text NOT NULL
                     CHECK (destino_tipo IN ('investimento', 'divida', 'caixinha', 'rollover', 'avulsa')),
  destino_id      uuid,                       -- subcategoria_id / divida_id / null (rollover/avulsa)
  valor           numeric(15,2) NOT NULL,
  moeda           text NOT NULL DEFAULT 'BRL',
  descricao       text,
  pagamento_id    uuid REFERENCES public.pagamentos(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'planejada'
                     CHECK (status IN ('planejada', 'executada', 'cancelada')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_aloc_user_bloco
  ON public.alocacoes_caixa_livre(user_id, mes_ano, bloco_indice);

ALTER TABLE public.alocacoes_caixa_livre ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aloc_select" ON public.alocacoes_caixa_livre;
CREATE POLICY "aloc_select" ON public.alocacoes_caixa_livre
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "aloc_insert" ON public.alocacoes_caixa_livre;
CREATE POLICY "aloc_insert" ON public.alocacoes_caixa_livre
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "aloc_update" ON public.alocacoes_caixa_livre;
CREATE POLICY "aloc_update" ON public.alocacoes_caixa_livre
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "aloc_delete" ON public.alocacoes_caixa_livre;
CREATE POLICY "aloc_delete" ON public.alocacoes_caixa_livre
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.alocacoes_caixa_livre IS
  'Alocações do Caixa Livre do bloco (saldo positivo de Receitas - Despesas). Cada bloco pode ter N alocações: investimento, quitar dívida, caixinha, rollover pro próximo bloco, ou avulsa.';

-- 5. Trigger pra atualizar updated_at em alocacoes
CREATE OR REPLACE FUNCTION public.set_alocacoes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alocacoes_updated_at ON public.alocacoes_caixa_livre;
CREATE TRIGGER trg_alocacoes_updated_at
  BEFORE UPDATE ON public.alocacoes_caixa_livre
  FOR EACH ROW EXECUTE FUNCTION public.set_alocacoes_updated_at();
