-- ============================================================
-- 0008_history_motivo.sql
--
-- Adiciona campo `motivo` no histórico de alterações.
-- Remove o trigger automático — agora o JS faz o logging
-- manualmente pra poder incluir o motivo informado pelo usuário.
--
-- Idempotente.
-- ============================================================

-- 1) Coluna motivo no history
alter table public.subcategoria_history add column if not exists motivo text;

-- 2) Remove o trigger automático e a função
drop trigger if exists trg_subcategoria_history on public.subcategorias;
drop function if exists public.log_subcategoria_changes();
