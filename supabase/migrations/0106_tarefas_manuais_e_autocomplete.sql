-- =============================================================
-- Refinamento Situação 2: Tarefas manuais + auto-complete
-- =============================================================
-- Mudanças:
--   1. tarefas_usuario.criada_por — 'sistema' (auto-gerada) ou 'usuario' (manual)
--   2. tarefas_usuario.auto_completa_quando — JSON com condição que dispara
--      conclusão automática (ex: {tipo:'import_extrato', conta_id:'...'})
--   3. tarefas_usuario.ordem — usuário pode reordenar tarefas manuais
--   4. tarefas_usuario.icone — ícone personalizado (opcional)
--   5. Novo tipo 'reconciliacao_pendente' (criado pelo sistema quando há
--      transações em status 'importado' pra uma conta)
-- =============================================================

ALTER TABLE public.tarefas_usuario
  ADD COLUMN IF NOT EXISTS criada_por text NOT NULL DEFAULT 'sistema'
    CHECK (criada_por IN ('sistema', 'usuario')),
  ADD COLUMN IF NOT EXISTS auto_completa_quando jsonb,
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS icone text;

COMMENT ON COLUMN public.tarefas_usuario.criada_por IS
  'sistema = gerada automaticamente. usuario = criada manualmente pelo user.';
COMMENT ON COLUMN public.tarefas_usuario.auto_completa_quando IS
  'Condição JSON para auto-conclusão. Ex: {"tipo":"import_extrato","conta_id":"uuid"} → conclui quando user importar extrato dessa conta.';
COMMENT ON COLUMN public.tarefas_usuario.ordem IS
  'Ordem manual (usado em /tarefas para reordenar tarefas manuais).';

-- Atualiza tarefas existentes pra ter os campos auto_completa_quando preenchidos
-- (pra tarefas auto-geradas de import_extrato)
UPDATE public.tarefas_usuario
SET auto_completa_quando = jsonb_build_object('tipo', 'import_extrato', 'conta_id', conta_id)
WHERE tipo = 'import_extrato'
  AND auto_completa_quando IS NULL
  AND conta_id IS NOT NULL;

-- Índice pra busca rápida de tarefas que casam com um evento de conclusão
CREATE INDEX IF NOT EXISTS idx_tarefas_auto_completa
  ON public.tarefas_usuario USING GIN (auto_completa_quando)
  WHERE status = 'pendente' AND auto_completa_quando IS NOT NULL;
