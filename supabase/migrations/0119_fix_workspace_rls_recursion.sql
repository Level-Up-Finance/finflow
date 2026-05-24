-- ============================================================================
-- 0119_fix_workspace_rls_recursion.sql
-- ----------------------------------------------------------------------------
-- HOTFIX da 0114: policies de workspace_members tinham subquery na PRÓPRIA
-- tabela, causando "infinite recursion detected in policy" em runtime.
--
-- Solução: usar a função is_workspace_member(ws_id) (criada na 0117) que é
-- SECURITY DEFINER e bypassa RLS internamente — evita recursion.
--
-- Também usa nova função my_workspace_ids() pra casos onde precisa listar
-- workspaces do user (impossível inferir só pela function de membership).
--
-- Idempotente.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- Função helper: retorna SETOF uuid de workspaces que o user é membro
-- ───────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER bypassa RLS, evita recursion.
CREATE OR REPLACE FUNCTION public.my_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id FROM public.workspace_members
  WHERE profile_id = auth.uid();
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Reescreve policies de workspaces
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "workspaces_select_member" ON public.workspaces;
CREATE POLICY "workspaces_select_member" ON public.workspaces
  FOR SELECT USING (id IN (SELECT my_workspace_ids()));

DROP POLICY IF EXISTS "workspaces_update_owner" ON public.workspaces;
CREATE POLICY "workspaces_update_owner" ON public.workspaces
  FOR UPDATE USING (is_workspace_member_with_role(id, 'owner'));

DROP POLICY IF EXISTS "workspaces_delete_owner" ON public.workspaces;
CREATE POLICY "workspaces_delete_owner" ON public.workspaces
  FOR DELETE USING (is_workspace_member_with_role(id, 'owner'));

-- workspaces_insert_self continua igual (não tem recursion: só checa created_by)

-- ───────────────────────────────────────────────────────────────────────────
-- Reescreve policies de workspace_members (CRÍTICO — origem da recursion)
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "members_select_same_workspace" ON public.workspace_members;
CREATE POLICY "members_select_same_workspace" ON public.workspace_members
  FOR SELECT USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "members_insert_owner" ON public.workspace_members;
CREATE POLICY "members_insert_owner" ON public.workspace_members
  FOR INSERT WITH CHECK (
    -- Caso normal: owner adicionando outro membro
    is_workspace_member_with_role(workspace_id, 'owner')
    OR
    -- Bootstrap: user criando workspace pra si (primeiro membro = owner)
    (profile_id = auth.uid() AND role = 'owner')
  );

DROP POLICY IF EXISTS "members_update_owner" ON public.workspace_members;
CREATE POLICY "members_update_owner" ON public.workspace_members
  FOR UPDATE USING (is_workspace_member_with_role(workspace_id, 'owner'));

DROP POLICY IF EXISTS "members_delete_self_or_owner" ON public.workspace_members;
CREATE POLICY "members_delete_self_or_owner" ON public.workspace_members
  FOR DELETE USING (
    profile_id = auth.uid()
    OR
    is_workspace_member_with_role(workspace_id, 'owner')
  );

-- ───────────────────────────────────────────────────────────────────────────
-- Reescreve policies de workspace_invites
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invites_select_member_or_invitee" ON public.workspace_invites;
CREATE POLICY "invites_select_member_or_invitee" ON public.workspace_invites
  FOR SELECT USING (
    is_workspace_member(workspace_id)
    OR
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "invites_insert_owner" ON public.workspace_invites;
CREATE POLICY "invites_insert_owner" ON public.workspace_invites
  FOR INSERT WITH CHECK (
    is_workspace_member_with_role(workspace_id, 'owner')
    AND invited_by = auth.uid()
  );

DROP POLICY IF EXISTS "invites_delete_owner" ON public.workspace_invites;
CREATE POLICY "invites_delete_owner" ON public.workspace_invites
  FOR DELETE USING (is_workspace_member_with_role(workspace_id, 'owner'));

-- invites_update_invitee continua igual (não tem recursion: checa só email)

-- ───────────────────────────────────────────────────────────────────────────
-- Verificação smoke test (rodando como rolepostgres, vê tudo)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'my_workspace_ids') THEN
    RAISE EXCEPTION 'Migration 0119: função my_workspace_ids não criada.';
  END IF;
  RAISE NOTICE 'Migration 0119 OK: RLS recursion corrigida.';
END $$;

COMMIT;
