-- ============================================================
-- 0004_contas_v3.sql
--
-- Mudanças na tabela `contas`:
--   • Remove papel (principal/secundaria) — agora todas as contas
--     ficam em uma única lista
--   • Adiciona apelido (text, opcional) — nome customizado para
--     exibição. Preserva o nome oficial em `nome`.
--
-- Idempotente.
-- ============================================================

-- 1) Apelido: novo campo opcional pra display name
alter table public.contas add column if not exists apelido text;

-- 2) Drop papel + constraint
alter table public.contas drop constraint if exists contas_papel_check;
alter table public.contas drop column     if exists papel;
