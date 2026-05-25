-- =============================================================
-- 0132_perf_indexes.sql
--
-- Indexes estratégicos pra acelerar queries frequentes em
-- Pagamentos. Foco em queries que rodam várias vezes por load
-- (na cascata de ensures).
--
-- Princípios:
--   - Composto sempre com workspace_id primeiro (multi-perfil)
--   - Ordenação match com ORDER BY das queries
--   - Partial indexes onde aplicável (status NULL filter)
-- =============================================================

-- ─── pagamentos ──────────────────────────────────────────────

-- Hot query: pagamentos do mês visível (loadMonth)
-- WHERE workspace_id=X AND mes_ano=Y ORDER BY data_vencimento
CREATE INDEX IF NOT EXISTS idx_pagamentos_ws_mes
  ON public.pagamentos (workspace_id, mes_ano, data_vencimento);

-- Hot query: idempotência de pagamento de Fatura/Gastos diversos
-- WHERE subcategoria_id=X AND data_vencimento=Y
-- (substitui scans no ensurePagamentosFaturaForMonths e
-- ensurePagamentoGastosDiversos)
CREATE INDEX IF NOT EXISTS idx_pagamentos_sub_venc
  ON public.pagamentos (subcategoria_id, data_vencimento);

-- Hot query: range de data_vencimento dentro de bloco
-- WHERE workspace_id=X AND data_vencimento BETWEEN A AND B
CREATE INDEX IF NOT EXISTS idx_pagamentos_ws_venc
  ON public.pagamentos (workspace_id, data_vencimento);

-- ─── orcamento_geral ─────────────────────────────────────────

-- Hot query: idempotência de orcamento entry
-- WHERE subcategoria_id=X AND mes_ano=Y
-- (a tabela já tem UNIQUE em (user_id, subcategoria_id, mes_ano),
-- mas índice composto aqui acelera o lookup quando user_id ainda
-- não foi setado em queries SELECT — caso comum em maybeSingle().)
CREATE INDEX IF NOT EXISTS idx_orcamento_sub_mes
  ON public.orcamento_geral (subcategoria_id, mes_ano);

-- Hot query: orcamento_geral no range de meses cobertos
-- WHERE workspace_id=X AND mes_ano IN (...)
CREATE INDEX IF NOT EXISTS idx_orcamento_ws_mes
  ON public.orcamento_geral (workspace_id, mes_ano);

-- ─── transacoes ──────────────────────────────────────────────

-- Hot query: soma transações soltas do bloco (recalcGastosDiversos)
-- WHERE conta_id IN (X) AND data BETWEEN A AND B
--   AND pagamento_id IS NULL AND tipo='Despesa'
-- Partial index sem pagamento_id reduz tamanho do índice e acelera.
CREATE INDEX IF NOT EXISTS idx_transacoes_solta_data
  ON public.transacoes (conta_id, data)
  WHERE pagamento_id IS NULL AND tipo = 'Despesa';

-- Hot query: transações vinculadas a uma fatura (recalcFaturaTotal)
-- WHERE fatura_cartao_id=X
-- Partial index só pra rows com fatura vinculada
CREATE INDEX IF NOT EXISTS idx_transacoes_fatura
  ON public.transacoes (fatura_cartao_id)
  WHERE fatura_cartao_id IS NOT NULL;

-- Hot query: transações vinculadas a pagamento (sync de status)
-- WHERE pagamento_id IN (X, Y, ...)
CREATE INDEX IF NOT EXISTS idx_transacoes_pagamento
  ON public.transacoes (pagamento_id)
  WHERE pagamento_id IS NOT NULL;

-- ─── faturas_cartao ──────────────────────────────────────────

-- Hot query: faturas no range de meses (ensurePagamentosFatura)
-- WHERE workspace_id=X AND data_vencimento BETWEEN A AND B
CREATE INDEX IF NOT EXISTS idx_faturas_ws_venc
  ON public.faturas_cartao (workspace_id, data_vencimento);

-- Hot query: fatura por (conta, mes_referencia) — upsertFatura
-- A tabela já tem UNIQUE em (user_id, conta_id, mes_referencia),
-- mas índice composto sem user_id acelera maybeSingle().
CREATE INDEX IF NOT EXISTS idx_faturas_conta_mes
  ON public.faturas_cartao (conta_id, mes_referencia);

-- ─── subcategorias ───────────────────────────────────────────

-- Hot query: subs do workspace (loadSubcategorias)
-- WHERE workspace_id=X AND status='ativa'
-- Partial: status='ativa' é o filtro mais comum
CREATE INDEX IF NOT EXISTS idx_subcategorias_ws_ativa
  ON public.subcategorias (workspace_id)
  WHERE status = 'ativa';

-- Hot query: sub por auto_tipo (placeholders)
-- WHERE workspace_id=X AND auto_tipo='gastos_diversos'
CREATE INDEX IF NOT EXISTS idx_subcategorias_ws_auto_tipo
  ON public.subcategorias (workspace_id, auto_tipo)
  WHERE auto_tipo IS NOT NULL;

-- ─── ANALYZE ──────────────────────────────────────────────────
-- Força Postgres a atualizar estatísticas das tabelas modificadas,
-- garantindo que o query planner use os novos índices imediatamente.
ANALYZE public.pagamentos;
ANALYZE public.orcamento_geral;
ANALYZE public.transacoes;
ANALYZE public.faturas_cartao;
ANALYZE public.subcategorias;
