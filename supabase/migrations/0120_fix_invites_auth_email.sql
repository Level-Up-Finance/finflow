-- ============================================================================
-- 0120_fix_invites_auth_email.sql
-- ----------------------------------------------------------------------------
-- HOTFIX: policies de workspace_invites usavam (SELECT email FROM auth.users
-- WHERE id = auth.uid()), mas roles anon/authenticated não têm acesso a
-- auth.users — resultado: "permission denied for table users".
--
-- Solução: usar a função built-in auth.email() que retorna o email do JWT
-- atual sem precisar de SELECT em auth.users.
--
-- Idempotente.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- Recria policies que dependiam de auth.users
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invites_select_member_or_invitee" ON public.workspace_invites;
CREATE POLICY "invites_select_member_or_invitee" ON public.workspace_invites
  FOR SELECT USING (
    is_workspace_member(workspace_id)
    OR
    email = auth.email()
  );

DROP POLICY IF EXISTS "invites_update_invitee" ON public.workspace_invites;
CREATE POLICY "invites_update_invitee" ON public.workspace_invites
  FOR UPDATE USING (email = auth.email());

-- ───────────────────────────────────────────────────────────────────────────
-- Verificação
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Migration 0120 OK: policies de workspace_invites agora usam auth.email() (built-in JWT).';
END $$;

COMMIT;
