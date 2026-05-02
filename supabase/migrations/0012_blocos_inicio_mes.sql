-- ============================================================
-- 0012_blocos_inicio_mes.sql
--
-- Permite bloco_quinzenal = 0 em pagamentos. O índice 0 é
-- reservado pra "Início do mês" — pagamentos cujas datas caem
-- ANTES da primeira ocorrência da renda principal no mês
-- (vivem com dinheiro do mês anterior).
--
-- Idempotente.
-- ============================================================

alter table public.pagamentos
  drop constraint if exists pagamentos_bloco_quinzenal_check;

alter table public.pagamentos
  add constraint pagamentos_bloco_quinzenal_check
  check (bloco_quinzenal >= 0);
