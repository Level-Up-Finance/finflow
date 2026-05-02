-- ============================================================
-- 0018_pagamentos_valor_real_default.sql
--
-- Backfill: pagamentos com valor_real null herdam o valor_previsto.
-- A partir dessa migration, o auto-gen passa a criar pagamentos com
-- valor_real = valor_previsto (no JS). Esta migration cobre os
-- pagamentos antigos pra não ficarem com a coluna vazia.
--
-- Idempotente.
-- ============================================================

update public.pagamentos
   set valor_real = valor_previsto
 where valor_real is null;
