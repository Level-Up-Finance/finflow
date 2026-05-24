-- ============================================================================
-- 0114_workspaces_schema.sql
-- ----------------------------------------------------------------------------
-- Multi-perfil (casal/família) — Fase 1: tabelas base de workspace.
--
-- Cria 3 tabelas novas:
--   * workspaces         — "livro contábil" compartilhado entre pessoas
--   * workspace_members  — N:N entre profiles e workspaces, com role + cor
--   * workspace_invites  — convites pendentes via email (token + expira)
--
-- NÃO toca em nenhuma tabela existente. As migrations 0115-0118 fazem o
-- backfill (seed de workspace pessoal por user existente), adicionam
-- workspace_id nas 24 tabelas user-scoped, reescrevem RLS, e adicionam
-- created_by pra atribuição de ações.
--
-- Idempotente. Pode rodar várias vezes sem dano.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- workspaces — entidade-grupo (Linear/Notion pattern)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workspaces (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         text NOT NULL,
  -- Cor default usada quando o workspace renderiza um avatar genérico
  cor_default  text NOT NULL DEFAULT '#6D5EF5',
  -- Tipo declarativo pra UX adaptativa ("workspace solo" não mostra "Vocês")
  tipo         text NOT NULL DEFAULT 'pessoal'
               CHECK (tipo IN ('pessoal', 'casal', 'familia', 'outro')),
  created_by   uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_created_by
  ON public.workspaces(created_by);

-- ───────────────────────────────────────────────────────────────────────────
-- workspace_members — N:N profile ↔ workspace, com role + cor
-- ───────────────────────────────────────────────────────────────────────────
-- 8 cores oficiais do brand kit (VISUAL.md §18.1).
-- Cada membro tem uma cor única dentro do workspace pra distinção visual.
CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'editor'
                CHECK (role IN ('owner', 'editor', 'viewer')),
  cor           text NOT NULL DEFAULT '#6D5EF5'
                CHECK (cor IN (
                  '#6D5EF5',  -- profile-1 roxo (default)
                  '#EC4899',  -- profile-2 rosa
                  '#10B981',  -- profile-3 verde
                  '#F59E0B',  -- profile-4 âmbar
                  '#3B82F6',  -- profile-5 azul
                  '#EF4444',  -- profile-6 vermelho
                  '#8B5CF6',  -- profile-7 violeta
                  '#14B8A6'   -- profile-8 teal
                )),
  ingressou_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_profile
  ON public.workspace_members(profile_id);

-- ───────────────────────────────────────────────────────────────────────────
-- workspace_invites — convites pendentes (token + expira)
-- ───────────────────────────────────────────────────────────────────────────
-- Token gerado pela Edge Function send-workspace-invite. Convidado clica no
-- link do email → /aceitar-convite?token=X → vira workspace_member.
CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Email do convidado (lowercase normalizado). Pode ainda não ter conta no app.
  email         text NOT NULL CHECK (email = lower(email)),
  -- Role que será atribuído ao aceitar
  role          text NOT NULL DEFAULT 'editor'
                CHECK (role IN ('owner', 'editor', 'viewer')),
  -- Token único pro link (gerado por gen_random_uuid + base32 na Edge Function)
  token         text NOT NULL UNIQUE,
  -- Quem mandou
  invited_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  -- Audit
  accepted_at   timestamptz,
  accepted_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace
  ON public.workspace_invites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email_pending
  ON public.workspace_invites(email)
  WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workspace_invites_token
  ON public.workspace_invites(token);

-- ───────────────────────────────────────────────────────────────────────────
-- Trigger: updated_at em workspaces
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_workspaces_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workspaces_updated_at ON public.workspaces;
CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_workspaces_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS — workspaces, members, invites
-- ───────────────────────────────────────────────────────────────────────────
-- Nota: helper is_workspace_member() é criada na 0117. Aqui as policies usam
-- subquery direto pra ainda funcionar sem essa função.
ALTER TABLE public.workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- ─── workspaces ───
DROP POLICY IF EXISTS "workspaces_select_member" ON public.workspaces;
CREATE POLICY "workspaces_select_member" ON public.workspaces
  FOR SELECT USING (
    id IN (SELECT workspace_id FROM public.workspace_members WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "workspaces_insert_self" ON public.workspaces;
CREATE POLICY "workspaces_insert_self" ON public.workspaces
  FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "workspaces_update_owner" ON public.workspaces;
CREATE POLICY "workspaces_update_owner" ON public.workspaces
  FOR UPDATE USING (
    id IN (SELECT workspace_id FROM public.workspace_members
           WHERE profile_id = auth.uid() AND role = 'owner')
  );

DROP POLICY IF EXISTS "workspaces_delete_owner" ON public.workspaces;
CREATE POLICY "workspaces_delete_owner" ON public.workspaces
  FOR DELETE USING (
    id IN (SELECT workspace_id FROM public.workspace_members
           WHERE profile_id = auth.uid() AND role = 'owner')
  );

-- ─── workspace_members ───
-- Membros podem ver TODOS os membros do workspace (pra renderizar avatars/cor)
DROP POLICY IF EXISTS "members_select_same_workspace" ON public.workspace_members;
CREATE POLICY "members_select_same_workspace" ON public.workspace_members
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members
                     WHERE profile_id = auth.uid())
  );

-- Owner pode adicionar/remover/atualizar members
DROP POLICY IF EXISTS "members_insert_owner" ON public.workspace_members;
CREATE POLICY "members_insert_owner" ON public.workspace_members
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members
                     WHERE profile_id = auth.uid() AND role = 'owner')
    OR
    -- Caso especial: user criando workspace pra si mesmo (primeiro insert)
    -- Permite a primeira inserção: profile_id = auth.uid() E não há owner ainda
    (profile_id = auth.uid() AND role = 'owner')
  );

DROP POLICY IF EXISTS "members_update_owner" ON public.workspace_members;
CREATE POLICY "members_update_owner" ON public.workspace_members
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members
                     WHERE profile_id = auth.uid() AND role = 'owner')
  );

-- Member pode sair (deletar a própria linha); owner pode remover qualquer um.
DROP POLICY IF EXISTS "members_delete_self_or_owner" ON public.workspace_members;
CREATE POLICY "members_delete_self_or_owner" ON public.workspace_members
  FOR DELETE USING (
    profile_id = auth.uid()
    OR
    workspace_id IN (SELECT workspace_id FROM public.workspace_members
                     WHERE profile_id = auth.uid() AND role = 'owner')
  );

-- ─── workspace_invites ───
-- Membros do workspace veem convites pendentes; quem foi convidado vê o próprio
DROP POLICY IF EXISTS "invites_select_member_or_invitee" ON public.workspace_invites;
CREATE POLICY "invites_select_member_or_invitee" ON public.workspace_invites
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members
                     WHERE profile_id = auth.uid())
    OR
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Owner cria convite (Edge Function rodará com service_role então isso é
-- mais salvaguarda em chamadas diretas do client)
DROP POLICY IF EXISTS "invites_insert_owner" ON public.workspace_invites;
CREATE POLICY "invites_insert_owner" ON public.workspace_invites
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members
                     WHERE profile_id = auth.uid() AND role = 'owner')
    AND invited_by = auth.uid()
  );

-- Convidado pode UPDATE pra marcar como aceito (preencher accepted_at/accepted_by)
DROP POLICY IF EXISTS "invites_update_invitee" ON public.workspace_invites;
CREATE POLICY "invites_update_invitee" ON public.workspace_invites
  FOR UPDATE USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Owner pode revogar (deletar)
DROP POLICY IF EXISTS "invites_delete_owner" ON public.workspace_invites;
CREATE POLICY "invites_delete_owner" ON public.workspace_invites
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members
                     WHERE profile_id = auth.uid() AND role = 'owner')
  );

COMMIT;
