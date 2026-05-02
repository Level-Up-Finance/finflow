-- ============================================================
-- 0010_pagamentos_unique.sql
--
-- Adiciona constraint única na tabela pagamentos pra permitir
-- upsert idempotente (auto-gen do mês não cria duplicatas).
--
-- Chave: (user_id, subcategoria_id, mes_ano, bloco_quinzenal)
--
-- Idempotente.
-- ============================================================

alter table public.pagamentos
  drop constraint if exists pagamentos_unique_sub_month_bloco;

alter table public.pagamentos
  add  constraint pagamentos_unique_sub_month_bloco
  unique (user_id, subcategoria_id, mes_ano, bloco_quinzenal);
