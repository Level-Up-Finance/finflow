-- ============================================================================
-- 0117_rls_workspace_based.sql
-- ----------------------------------------------------------------------------
-- Multi-perfil — Fase 1: reescreve RLS de todas as tabelas user-scoped pra
-- usar workspace_id ao invés de user_id.
--
-- Antes:  USING (user_id = auth.uid())
-- Depois: USING (is_workspace_member(workspace_id))
--
-- A função is_workspace_member() é IMMUTABLE + SECURITY DEFINER — Postgres
-- cacheia o resultado durante a query (perf) e bypassa RLS internamente pra
-- evitar recursion infinita.
--
-- ⚠️ MIGRATION CRÍTICA: RLS quebrada = vazamento de dados entre workspaces.
-- Antes de rodar em produção, testar em staging com 2 users diferentes.
--
-- ⚠️ AÇÃO REQUERIDA APÓS RODAR: validar com query:
--     SELECT count(*) FROM pagamentos;  -- deve respeitar workspace
--
-- Idempotente: usa DROP POLICY IF EXISTS + CREATE POLICY.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- Helper: is_workspace_member(workspace_id)
-- ───────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: roda como dono da função (postgres), bypassando RLS de
-- workspace_members. Sem isso, a policy de pagamentos chamaria a policy de
-- workspace_members em loop infinito.
--
-- STABLE: dentro de uma query, valor não muda → Postgres cacheia. Não usar
-- IMMUTABLE porque depende de auth.uid() que muda entre sessions.
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND profile_id = auth.uid()
  );
$$;

-- Variação com role: is_workspace_member_with_role(ws_id, 'owner')
CREATE OR REPLACE FUNCTION public.is_workspace_member_with_role(ws_id uuid, required_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND profile_id = auth.uid()
      AND (
        role = required_role
        OR (required_role = 'editor' AND role IN ('editor', 'owner'))
        OR (required_role = 'viewer' AND role IN ('viewer', 'editor', 'owner'))
      )
  );
$$;

-- Helper que retorna TRUE se o user pode ESCREVER no workspace
-- (não é viewer). Usada nas policies de INSERT/UPDATE/DELETE.
CREATE OR REPLACE FUNCTION public.can_write_workspace(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND profile_id = auth.uid()
      AND role IN ('owner', 'editor')
  );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Reescreve RLS de todas as tabelas user-scoped
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'contas', 'categorias', 'subcategorias', 'orcamento_geral', 'pagamentos',
    'dividas', 'investimentos', 'projetos_investimento', 'transacoes',
    'extratos_importados', 'pagamentos_divida_historico',
    'contatos', 'contato_banco_descs', 'regras_reconciliacao', 'faturas_cartao',
    'aportes_projeto', 'ativos_subjacentes', 'divida_taxa_historico',
    'alocacoes_caixa_livre', 'adiantamentos_receita', 'tarefas_usuario',
    'saldos_bancarios_snapshots', 'subcategoria_history'
  ];
  policy_names text[] := ARRAY['_select', '_insert', '_update', '_delete'];
  pname text;
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    -- Skip se tabela não existe ou não tem workspace_id
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl
        AND column_name = 'workspace_id'
    ) THEN
      RAISE NOTICE '  ⚠ skipping % (sem workspace_id)', tbl;
      CONTINUE;
    END IF;

    -- Drop policies antigas (legacy user_id-based)
    FOREACH pname IN ARRAY policy_names LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || pname, tbl);
    END LOOP;

    -- Cria policies novas (workspace_id-based)
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (is_workspace_member(workspace_id))',
      tbl || '_select', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (can_write_workspace(workspace_id))',
      tbl || '_insert', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (can_write_workspace(workspace_id)) WITH CHECK (can_write_workspace(workspace_id))',
      tbl || '_update', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (can_write_workspace(workspace_id))',
      tbl || '_delete', tbl
    );

    RAISE NOTICE '  ✓ RLS reescrita em %', tbl;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- Verificação smoke test
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'is_workspace_member'
  ) THEN
    RAISE EXCEPTION 'Migration 0117: função is_workspace_member não foi criada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'can_write_workspace'
  ) THEN
    RAISE EXCEPTION 'Migration 0117: função can_write_workspace não foi criada.';
  END IF;
  RAISE NOTICE 'Migration 0117 OK: funções helper criadas, policies reescritas.';
END $$;

COMMIT;
