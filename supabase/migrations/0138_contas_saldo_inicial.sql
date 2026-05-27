-- =============================================================
-- 0138 — Saldo inicial (opening balance) por conta
-- =============================================================
-- Contexto:
--   Antes desta migration, o saldo de uma conta no FinFlow era
--   computado como Σ(transações) inicializado em 0. Isso quebra o
--   fluxo "comecei a usar o app hoje, mas a conta já tinha R$ 5.000".
--
-- Modelo:
--   saldo_inicial      → o valor que a conta tinha na data de início
--   data_saldo_inicial → a data a partir da qual transações contam
--
-- Cálculo do saldo atual (no JS):
--   saldo_atual = saldo_inicial + Σ(transações WHERE data >= data_saldo_inicial)
--
-- Compatibilidade:
--   Default 0 em saldo_inicial e NULL em data_saldo_inicial preservam
--   o comportamento atual pra contas existentes (saldo = soma de tudo).
--   Conforme o usuário definir saldo inicial em cada conta, o cálculo
--   passa a usar o ponto de partida explícito.
-- =============================================================

ALTER TABLE public.contas
  ADD COLUMN IF NOT EXISTS saldo_inicial      NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_saldo_inicial DATE          NULL;

COMMENT ON COLUMN public.contas.saldo_inicial IS
  'Valor que a conta tinha na data_saldo_inicial. Usado como ponto de partida para o cálculo de saldo atual.';
COMMENT ON COLUMN public.contas.data_saldo_inicial IS
  'Data do snapshot inicial. Transações com data anterior são ignoradas no cálculo. NULL = considera todas (comportamento legado).';
