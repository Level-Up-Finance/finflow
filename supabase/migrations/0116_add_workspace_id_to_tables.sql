-- ============================================================================
-- 0116_add_workspace_id_to_tables.sql
-- ----------------------------------------------------------------------------
-- Multi-perfil — Fase 1: adiciona workspace_id em TODAS as tabelas que têm
-- user_id (= 24 tabelas user-scoped).
--
-- Estratégia:
--   1. Pra cada tabela com user_id, adiciona coluna workspace_id (nullable).
--   2. Backfill: workspace_id = workspace pessoal do user_id (via JOIN com
--      workspace_members WHERE role='owner').
--   3. Torna workspace_id NOT NULL após backfill completo.
--   4. Cria índice (workspace_id) pra queries futuras.
--
-- Mantém user_id pra: (a) backwards compat com código existente, (b) servir
-- como "created_by implícito" — vai ser substituído pelo created_by explícito
-- na migration 0118.
--
-- Tabelas excluídas (não recebem workspace_id):
--   * profiles            — é a identidade do user, não dado user-scoped
--   * cambio_cache        — cache global de cotações, compartilhado entre todos
--   * feedback            — sistema interno do admin, não user-scoped
--   * feedback_historico  — idem
--   * i18n                — traduções globais
--   * admin_*             — tabelas de admin
--
-- Lista explícita das 24 tabelas user-scoped (consolidada das migrations
-- 0001 a 0113). Auditada manualmente porque alguns nomes contém "user_id"
-- mas referem-se a OUTRO user (ex: feedback.target_user_id).
--
-- Idempotente. Pode rodar várias vezes (NOT NULL é mantido após primeira
-- aplicação completa).
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Adiciona workspace_id (nullable) em todas as 24 tabelas user-scoped
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    -- Core data (8 tabelas — migration 0001 + diretas)
    'contas',
    'categorias',
    'subcategorias',
    'orcamento_geral',
    'pagamentos',
    'dividas',
    'investimentos',
    'projetos_investimento',
    -- Transações e relacionados (4)
    'transacoes',
    'transacao_splits',
    'extratos_importados',
    'pagamentos_divida_historico',
    -- Contatos (3)
    'contatos',
    'contato_banco_descs',
    'regras_reconciliacao',
    -- Cartões (1)
    'faturas_cartao',
    -- Investimentos detalhados (3)
    'aportes_projeto',
    'ativos_subjacentes',
    'divida_taxa_historico',
    -- Caixa livre e tarefas (3)
    'alocacoes_caixa_livre',
    'adiantamentos_receita',
    'tarefas_usuario',
    -- Snapshots e histórico (2)
    'saldos_bancarios_snapshots',
    'subcategoria_history'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    -- Só adiciona se a tabela existe E não tem ainda a coluna
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl
        AND column_name = 'workspace_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE',
        tbl
      );
      RAISE NOTICE '  + workspace_id adicionado em %', tbl;
    ELSE
      RAISE NOTICE '  = workspace_id já existe ou tabela ausente: %', tbl;
    END IF;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Backfill: pra cada row, workspace_id = workspace pessoal do user_id
-- ───────────────────────────────────────────────────────────────────────────
-- Cria mapping temporário user_id → workspace_id (mais rápido que subquery
-- por row pra tabelas grandes).
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'contas', 'categorias', 'subcategorias', 'orcamento_geral', 'pagamentos',
    'dividas', 'investimentos', 'projetos_investimento', 'transacoes',
    'transacao_splits', 'extratos_importados', 'pagamentos_divida_historico',
    'contatos', 'contato_banco_descs', 'regras_reconciliacao', 'faturas_cartao',
    'aportes_projeto', 'ativos_subjacentes', 'divida_taxa_historico',
    'alocacoes_caixa_livre', 'adiantamentos_receita', 'tarefas_usuario',
    'saldos_bancarios_snapshots', 'subcategoria_history'
  ];
  rows_updated bigint;
BEGIN
  FOR tbl IN SELECT unnest(tbls) LOOP
    -- Só atualiza se a coluna workspace_id existe E há rows com workspace_id NULL
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl
        AND column_name = 'workspace_id'
    ) THEN
      -- Verifica se a tabela tem user_id (algumas como transacao_splits podem
      -- não ter — ligadas via transacao_id)
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl
          AND column_name = 'user_id'
      ) THEN
        EXECUTE format(
          'UPDATE public.%I t
           SET workspace_id = wm.workspace_id
           FROM public.workspace_members wm
           WHERE wm.profile_id = t.user_id
             AND wm.role = ''owner''
             AND t.workspace_id IS NULL',
          tbl
        );
        GET DIAGNOSTICS rows_updated = ROW_COUNT;
        RAISE NOTICE '  ↻ % rows backfilled em % via user_id', rows_updated, tbl;
      ELSE
        RAISE NOTICE '  ⚠ % não tem user_id direto — fica nullable até refactor manual', tbl;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Cria índices (workspace_id) pra queries futuras
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'contas', 'categorias', 'subcategorias', 'orcamento_geral', 'pagamentos',
    'dividas', 'investimentos', 'projetos_investimento', 'transacoes',
    'transacao_splits', 'extratos_importados', 'pagamentos_divida_historico',
    'contatos', 'contato_banco_descs', 'regras_reconciliacao', 'faturas_cartao',
    'aportes_projeto', 'ativos_subjacentes', 'divida_taxa_historico',
    'alocacoes_caixa_livre', 'adiantamentos_receita', 'tarefas_usuario',
    'saldos_bancarios_snapshots', 'subcategoria_history'
  ];
BEGIN
  FOR tbl IN SELECT unnest(tbls) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl
        AND column_name = 'workspace_id'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_workspace ON public.%I(workspace_id)',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Torna workspace_id NOT NULL APENAS nas tabelas que têm user_id direto
-- ───────────────────────────────────────────────────────────────────────────
-- Tabelas que NÃO têm user_id direto (ex: transacao_splits via transacao_id)
-- ficam nullable até refactor manual. Isso impede que migration falhe se
-- houver rows órfãs.
DO $$
DECLARE
  tbl text;
  null_count bigint;
  tbls text[] := ARRAY[
    'contas', 'categorias', 'subcategorias', 'orcamento_geral', 'pagamentos',
    'dividas', 'investimentos', 'projetos_investimento', 'transacoes',
    'extratos_importados', 'pagamentos_divida_historico',
    'contatos', 'contato_banco_descs', 'regras_reconciliacao', 'faturas_cartao',
    'aportes_projeto', 'ativos_subjacentes', 'divida_taxa_historico',
    'alocacoes_caixa_livre', 'adiantamentos_receita', 'tarefas_usuario',
    'saldos_bancarios_snapshots', 'subcategoria_history'
  ];
BEGIN
  FOR tbl IN SELECT unnest(tbls) LOOP
    -- Só prossegue se a coluna existe
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl
        AND column_name = 'workspace_id'
    ) THEN
      CONTINUE;
    END IF;

    -- Verifica se ainda há NULLs
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id IS NULL', tbl)
      INTO null_count;

    IF null_count = 0 THEN
      -- Já posso colocar NOT NULL
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id SET NOT NULL', tbl);
      RAISE NOTICE '  ✓ NOT NULL em %', tbl;
    ELSE
      RAISE NOTICE '  ⚠ % rows com workspace_id NULL em % — pula NOT NULL', null_count, tbl;
    END IF;
  END LOOP;
END $$;

COMMIT;
