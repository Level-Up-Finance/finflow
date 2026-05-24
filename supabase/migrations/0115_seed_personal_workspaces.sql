-- ============================================================================
-- 0115_seed_personal_workspaces.sql
-- ----------------------------------------------------------------------------
-- Multi-perfil — Fase 1: backfill de workspaces pessoais.
--
-- Pra CADA profile existente, cria um "Workspace pessoal" e adiciona o user
-- como owner. Garante que o app continua funcionando solo após a migração:
-- todo dado existente vai ser associado a um workspace (próxima migration).
--
-- Idempotente: usa NOT EXISTS pra não duplicar workspaces se rodar 2x.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- Pra cada profile que AINDA não tem workspace, cria um workspace pessoal
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  prof RECORD;
  new_ws_id uuid;
BEGIN
  FOR prof IN
    SELECT p.id, COALESCE(p.nome, split_part(u.email, '@', 1), 'Você') AS nome
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.profile_id = p.id
    )
  LOOP
    -- Cria workspace pessoal
    INSERT INTO public.workspaces (nome, tipo, created_by)
    VALUES (
      'Pessoal — ' || prof.nome,
      'pessoal',
      prof.id
    )
    RETURNING id INTO new_ws_id;

    -- Adiciona o user como owner do workspace recém-criado
    INSERT INTO public.workspace_members (workspace_id, profile_id, role, cor)
    VALUES (new_ws_id, prof.id, 'owner', '#6D5EF5');
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- Trigger: handle_new_user agora também cria workspace pessoal
-- ───────────────────────────────────────────────────────────────────────────
-- Quando um novo user faz signup, queremos que ele já tenha um workspace
-- "Pessoal" pronto pra usar (sem precisar criar manualmente). Substituímos
-- (ou criamos) o trigger handle_new_user pra incluir esse passo.
--
-- Importante: a função roda como SECURITY DEFINER (privilégios de owner do
-- DB), então não bate em RLS. Necessário porque o user ainda não está
-- "logado" no momento do INSERT em profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  display_name text;
  new_ws_id    uuid;
BEGIN
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'nome',
    split_part(NEW.email, '@', 1),
    'Você'
  );

  -- 1. Cria profile (caso já não exista — proteção idempotente)
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, display_name)
  ON CONFLICT (id) DO NOTHING;

  -- 2. Cria workspace pessoal
  INSERT INTO public.workspaces (nome, tipo, created_by)
  VALUES ('Pessoal — ' || display_name, 'pessoal', NEW.id)
  RETURNING id INTO new_ws_id;

  -- 3. Adiciona user como owner do próprio workspace
  INSERT INTO public.workspace_members (workspace_id, profile_id, role, cor)
  VALUES (new_ws_id, NEW.id, 'owner', '#6D5EF5');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recria o trigger (drop + create pra ter idempotência)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────────
-- Verificação
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  profile_count integer;
  member_count  integer;
BEGIN
  SELECT count(*) INTO profile_count FROM public.profiles;
  SELECT count(DISTINCT profile_id) INTO member_count FROM public.workspace_members;
  IF member_count < profile_count THEN
    RAISE EXCEPTION 'Migration 0115: % profiles têm workspace, mas existem % profiles total. Algum profile ficou sem workspace.',
      member_count, profile_count;
  END IF;
  RAISE NOTICE 'Migration 0115 OK: % profiles, % com workspace pessoal.',
    profile_count, member_count;
END $$;

COMMIT;
