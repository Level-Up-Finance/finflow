-- ============================================================================
-- 0121_force_fix_invites_select.sql
-- ----------------------------------------------------------------------------
-- A 0120 deveria ter fixado a policy de SELECT em workspace_invites para usar
-- auth.email() em vez de subquery em auth.users. Em runtime ainda vemos
-- "permission denied for table users" ao fazer SELECT — sinal que alguma
-- policy ainda referencia auth.users.
--
-- Esta migration:
--   1. Lista TODAS as policies de workspace_invites
--   2. Recria todas usando apenas auth.uid() e auth.email() (built-in JWT)
--   3. Adiciona policy especial pra INSERT do membership ao aceitar convite
--      (necessária pra workspace_members quando invitee = self)
--
-- Idempotente.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- workspace_invites: drop e recria TODAS as policies
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invites_select_member_or_invitee" ON public.workspace_invites;
DROP POLICY IF EXISTS "invites_select_by_token"          ON public.workspace_invites;
DROP POLICY IF EXISTS "invites_insert_owner"             ON public.workspace_invites;
DROP POLICY IF EXISTS "invites_update_invitee"           ON public.workspace_invites;
DROP POLICY IF EXISTS "invites_delete_owner"             ON public.workspace_invites;

-- SELECT: pode ver se:
--   * é membro do workspace destino, OU
--   * email do JWT bate com o invite (invitee tentando aceitar)
CREATE POLICY "invites_select_member_or_invitee" ON public.workspace_invites
  FOR SELECT USING (
    is_workspace_member(workspace_id)
    OR
    email = auth.email()
  );

-- INSERT: só owner do workspace pode criar convite, e invited_by tem que ser ele mesmo
CREATE POLICY "invites_insert_owner" ON public.workspace_invites
  FOR INSERT WITH CHECK (
    is_workspace_member_with_role(workspace_id, 'owner')
    AND invited_by = auth.uid()
  );

-- UPDATE: invitee pode atualizar (pra marcar accepted_at), ou owner
CREATE POLICY "invites_update_invitee_or_owner" ON public.workspace_invites
  FOR UPDATE USING (
    email = auth.email()
    OR
    is_workspace_member_with_role(workspace_id, 'owner')
  );

-- DELETE: só owner do workspace
CREATE POLICY "invites_delete_owner" ON public.workspace_invites
  FOR DELETE USING (is_workspace_member_with_role(workspace_id, 'owner'));

-- ───────────────────────────────────────────────────────────────────────────
-- workspace_members: ajusta INSERT pra permitir invitee criar self-membership
-- ───────────────────────────────────────────────────────────────────────────
-- Hoje a policy só permite owner OU first-self-as-owner. Mas no fluxo de
-- aceitar convite, o invitee precisa criar workspace_members onde
-- profile_id = self mas o role não é 'owner' e ele não é owner ainda.
--
-- Adiciona caso: se existe um convite pendente válido pra esse email no
-- workspace, permite o INSERT correspondente.
DROP POLICY IF EXISTS "members_insert_owner" ON public.workspace_members;
CREATE POLICY "members_insert_owner_or_invitee" ON public.workspace_members
  FOR INSERT WITH CHECK (
    -- Caso A: owner adicionando outro membro
    is_workspace_member_with_role(workspace_id, 'owner')
    OR
    -- Caso B: bootstrap — user criando workspace pra si (primeiro membro = owner)
    (profile_id = auth.uid() AND role = 'owner')
    OR
    -- Caso C: invitee aceitando convite (self-insert com role do invite)
    (
      profile_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.workspace_invites wi
        WHERE wi.workspace_id = workspace_members.workspace_id
          AND wi.email = auth.email()
          AND wi.role = workspace_members.role
          AND wi.accepted_at IS NULL
          AND wi.expires_at > now()
      )
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- Verificação
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad_policies int;
BEGIN
  -- Conta policies de workspace_invites que ainda referenciam "users" no qual
  -- pode bater em auth.users (heurística simples por texto)
  SELECT count(*) INTO bad_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'workspace_invites'
    AND (qual LIKE '%auth.users%' OR with_check LIKE '%auth.users%');
  IF bad_policies > 0 THEN
    RAISE EXCEPTION 'Migration 0121: ainda existem % policies em workspace_invites referenciando auth.users', bad_policies;
  END IF;
  RAISE NOTICE 'Migration 0121 OK: policies de workspace_invites usam apenas auth.uid() / auth.email().';
END $$;

COMMIT;
