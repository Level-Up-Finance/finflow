-- ============================================================================
-- 0118_created_by_attribution.sql
-- ----------------------------------------------------------------------------
-- Multi-perfil — Fase 1: adiciona created_by em tabelas-chave pra rastrear
-- "quem fez qual ação" em workspaces compartilhados.
--
-- Estratégia: created_by = profile_id que criou o row. NULL pra dados
-- históricos (anteriores ao multi-perfil). UI gracefully handles NULL
-- mostrando apenas a ação sem o nome do autor.
--
-- 5 tabelas onde atribuição importa:
--   * subcategorias          — "Maria cadastrou esse compromisso"
--   * pagamentos             — "Arnaldo marcou como pago"
--   * transacoes             — "Maria registrou esta transação"
--   * dividas                — "Arnaldo criou esta dívida"
--   * projetos_investimento  — "Maria criou esse projeto"
--
-- Backfill: created_by ← user_id (mantém retrocompat). Workflows existentes
-- (1 user solo) ficam com created_by = ele mesmo, sem mudança visual.
--
-- Idempotente.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- Adiciona created_by + backfill com user_id atual
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'subcategorias',
    'pagamentos',
    'transacoes',
    'dividas',
    'projetos_investimento'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    -- Skip se tabela não existe
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      RAISE NOTICE '  ⚠ skipping % (não existe)', tbl;
      CONTINUE;
    END IF;

    -- Adiciona coluna se não existir
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl
        AND column_name = 'created_by'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL',
        tbl
      );
      RAISE NOTICE '  + created_by adicionado em %', tbl;

      -- Backfill: created_by = user_id existente (se a tabela tiver user_id)
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl
          AND column_name = 'user_id'
      ) THEN
        EXECUTE format(
          'UPDATE public.%I SET created_by = user_id WHERE created_by IS NULL',
          tbl
        );
        RAISE NOTICE '    ↻ backfilled created_by ← user_id em %', tbl;
      END IF;
    ELSE
      RAISE NOTICE '  = created_by já existe em %', tbl;
    END IF;

    -- Cria índice (workspace_id, created_by) pra queries do tipo
    -- "ações da Maria neste workspace neste mês"
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl
        AND column_name = 'workspace_id'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_ws_creator ON public.%I(workspace_id, created_by)',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- Coluna especial em pagamentos: marked_paid_by + marked_paid_at
-- ───────────────────────────────────────────────────────────────────────────
-- Pagamento tem 2 momentos relevantes: quando foi CADASTRADO e quando foi
-- MARCADO como pago. Pra "Arnaldo marcou o aluguel como pago" precisamos
-- saber quem mudou o status. Vamos preencher via trigger ou via JS.
ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS marked_paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS marked_paid_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_pagamentos_marked_paid
  ON public.pagamentos(marked_paid_by, marked_paid_at DESC)
  WHERE marked_paid_at IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- Verificação
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pagamentos'
      AND column_name = 'created_by'
  ) THEN
    RAISE EXCEPTION 'Migration 0118: created_by não foi criado em pagamentos.';
  END IF;
  RAISE NOTICE 'Migration 0118 OK: attribution columns criadas.';
END $$;

COMMIT;
