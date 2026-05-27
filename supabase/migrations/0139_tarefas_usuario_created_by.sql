-- =============================================================
-- 0139 — Adiciona created_by em tarefas_usuario
-- =============================================================
-- Contexto:
--   A migration 0118 (Multi-perfil) adicionou a coluna created_by em
--   subcategorias, pagamentos, transacoes, dividas, projetos_investimento
--   — mas NÃO em tarefas_usuario. Quando o INSERT manual do modal "Nova
--   tarefa" passou a incluir created_by (commit 510312f), o PostgREST
--   rejeitou o INSERT com "Could not find the 'created_by' column".
--
-- Esta migration corrige a lacuna:
--   • adiciona created_by uuid → profiles(id) ON DELETE SET NULL
--   • backfill: created_by = user_id (mantém retrocompat — tarefas
--     existentes ficam atribuídas ao próprio dono).
-- =============================================================

ALTER TABLE public.tarefas_usuario
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Backfill: tasks antigas ficam atribuídas ao próprio dono.
-- (profiles.id == user_id na convenção do app — vide migration 0114)
UPDATE public.tarefas_usuario
SET    created_by = user_id
WHERE  created_by IS NULL
  AND  user_id IS NOT NULL;

COMMENT ON COLUMN public.tarefas_usuario.created_by IS
  'Perfil que criou a tarefa. Útil em workspaces compartilhados pra rastrear autoria.';
