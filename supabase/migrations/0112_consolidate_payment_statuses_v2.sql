-- 0112_consolidate_payment_statuses_v2.sql
--
-- Consolidação da taxonomia de STATUS de pagamentos para alinhar com
-- o brand kit v2.0 (decisão 22/05/2026 — BRAND.md §11.5).
--
-- Sistema reduzido de 8 status para 5:
--   ANTES (v1):  A Pagar, Agendado, Pago, A Transferir, Transferido,
--                Cancelado, Cartão, Parcial
--   DEPOIS (v2): A Pagar (default), Pago, A Transferir, Transferido, Cancelado
--
-- Mapeamento das mudanças:
--   'Agendado'  → 'A Pagar'   (Agendado virou redundante com A Pagar)
--   'Cartão'    → 'Pago'      (cartão de crédito gera transação, na prática é pago)
--   'Parcial'   → 'Pago'      (com observacao no histórico se necessário)
--
-- IMPORTANTE: Esta migration pode ser idempotente — se rodar 2x, o UPDATE
-- apenas atualiza linhas que ainda não foram convertidas (já validamos pelos
-- valores antigos). O CHECK constraint só é re-criado se não existir.
--
-- ATENÇÃO PARA RELATÓRIOS HISTÓRICOS: alguns relatórios contavam 'Cartão'
-- separadamente. Pós-migração, esses relatórios verão tudo como 'Pago'.
-- Se precisar distinguir cartão de débito direto, use a coluna conta_id +
-- contas.tipo = 'Cartão de Crédito' como filtro (mais robusto que status).

BEGIN;

-- =============================================================
-- 1. Drop temporário do CHECK constraint pra permitir UPDATE
-- =============================================================
ALTER TABLE public.pagamentos
  DROP CONSTRAINT IF EXISTS pagamentos_status_check;

-- =============================================================
-- 2. UPDATE — consolida status removidos
-- =============================================================
UPDATE public.pagamentos
   SET status = 'Pago'
 WHERE status IN ('Cartão', 'Parcial');

UPDATE public.pagamentos
   SET status = 'A Pagar'
 WHERE status = 'Agendado';

-- =============================================================
-- 3. Default da coluna: A Pagar (era Agendado)
-- =============================================================
ALTER TABLE public.pagamentos
  ALTER COLUMN status SET DEFAULT 'A Pagar';

-- =============================================================
-- 4. Re-cria CHECK constraint com os 5 status oficiais
-- =============================================================
ALTER TABLE public.pagamentos
  ADD CONSTRAINT pagamentos_status_check
  CHECK (status IN ('A Pagar', 'Pago', 'A Transferir', 'Transferido', 'Cancelado'));

-- =============================================================
-- 5. Verificação (no-op em produção, útil em desenvolvimento)
--    Garante que não sobrou nenhum status fora do novo conjunto.
-- =============================================================
DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*) INTO invalid_count
    FROM public.pagamentos
   WHERE status NOT IN ('A Pagar', 'Pago', 'A Transferir', 'Transferido', 'Cancelado');
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Migration 0112: % linhas com status inválido após migração', invalid_count;
  END IF;
END $$;

COMMIT;
