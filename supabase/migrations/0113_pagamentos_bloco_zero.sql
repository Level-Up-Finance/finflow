-- 0113_pagamentos_bloco_zero.sql
--
-- Garante que pagamentos.bloco_quinzenal aceita o valor 0.
--
-- O bloco 0 é reservado pra "Bloco anterior" (crossover) — pagamentos cujas
-- datas caem ANTES da 1ª ocorrência da renda principal no mês visível, e
-- portanto pertencem ao último bloco do ciclo de salário do mês anterior
-- que se estende pra dentro do mês visível.
--
-- A migration 0012_blocos_inicio_mes.sql já tinha implementado isso, mas o
-- constraint atual no banco está rejeitando 0 (provavelmente substituído por
-- alguma rerun da 0011 ou recriação manual). Esta migration é idempotente:
-- pode rodar várias vezes sem dano.
--
-- Caso de uso real (descoberto em 23/05/2026): renda principal quinzenal
-- (sexta-feira). Mês de Agosto/2026 — primeira ocorrência da renda é 7/8.
-- Compromissos com data 1-6/8 ficam no "bloco anterior" (24/7 a 6/8), que
-- visualmente aparece como bloco 0 na visão de Agosto.

ALTER TABLE public.pagamentos
  DROP CONSTRAINT IF EXISTS pagamentos_bloco_quinzenal_check;

ALTER TABLE public.pagamentos
  ADD CONSTRAINT pagamentos_bloco_quinzenal_check
  CHECK (bloco_quinzenal >= 0);
