-- =============================================================
-- FinFlow — Migration 0078: Divisão de transações em partes
-- Permite alocar uma transação em múltiplas categorias/subcategorias,
-- cada parte com seu próprio valor, tags e descrição.
-- =============================================================

CREATE TABLE IF NOT EXISTS transacao_splits (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  transacao_id    uuid          NOT NULL REFERENCES transacoes(id) ON DELETE CASCADE,
  user_id         uuid          NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  valor           numeric(15,2) NOT NULL,
  categoria_id    uuid          REFERENCES categorias(id)    ON DELETE SET NULL,
  subcategoria_id uuid          REFERENCES subcategorias(id) ON DELETE SET NULL,
  tags            text[]        NOT NULL DEFAULT '{}',
  descricao       text,
  ordem           int           NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE transacao_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own splits" ON transacao_splits;
CREATE POLICY "Users manage own splits"
  ON transacao_splits
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_transacao_splits_transacao_id ON transacao_splits (transacao_id);
CREATE INDEX IF NOT EXISTS idx_transacao_splits_user_id      ON transacao_splits (user_id);
