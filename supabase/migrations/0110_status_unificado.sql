-- 0110_status_unificado.sql
--
-- Unifica a taxonomia de STATUS de dívidas e projetos de investimento.
-- Mesma estrutura nos 2 contextos, só os rótulos mudam.
--
-- Dívidas:
--   Ativa       → 'A pagar' (se valor_pago=0) ou 'Pagando' (se valor_pago>0)
--   Atrasada    → 'A pagar' ou 'Pagando' (vira badge derivado, não status)
--   Negociando  → 'Em negociação'
--   Quitada     → 'Quitada' (mantém)
--
-- Projetos:
--   ativo       → 'Sem meta' / 'A começar' / 'Aportando' (depende de meta e aportes)
--   concluido   → 'Concluído'
--   pausado     → 'Pausado'
--   arquivado   → 'Arquivado'

-- =============================================================
-- DÍVIDAS
-- =============================================================

ALTER TABLE public.dividas DROP CONSTRAINT IF EXISTS dividas_status_check;

-- Migra valores existentes
UPDATE public.dividas SET status = CASE
  WHEN status IN ('Ativa', 'Atrasada') AND COALESCE(valor_pago, 0) > 0 THEN 'Pagando'
  WHEN status IN ('Ativa', 'Atrasada')                                 THEN 'A pagar'
  WHEN status = 'Negociando'                                            THEN 'Em negociação'
  WHEN status = 'Quitada'                                               THEN 'Quitada'
  WHEN status = 'Arquivada'                                             THEN 'Arquivada'
  ELSE 'A pagar'
END;

ALTER TABLE public.dividas
  ADD CONSTRAINT dividas_status_check
  CHECK (status IN ('Sem plano', 'A pagar', 'Pagando', 'Em negociação', 'Quitada', 'Arquivada'));

ALTER TABLE public.dividas ALTER COLUMN status SET DEFAULT 'A pagar';

-- =============================================================
-- PROJETOS DE INVESTIMENTO
-- =============================================================

ALTER TABLE public.projetos_investimento DROP CONSTRAINT IF EXISTS projetos_investimento_status_check;

UPDATE public.projetos_investimento SET status = CASE
  WHEN status = 'ativo' AND (
    COALESCE(saldo_inicial, 0) > 0
    OR EXISTS (SELECT 1 FROM public.aportes_projeto a WHERE a.projeto_id = projetos_investimento.id)
  ) THEN 'Aportando'
  WHEN status = 'ativo' AND COALESCE(meta_valor, 0) > 0 THEN 'A começar'
  WHEN status = 'ativo'                                  THEN 'Sem meta'
  WHEN status = 'concluido'                              THEN 'Concluído'
  WHEN status = 'pausado'                                THEN 'Pausado'
  WHEN status = 'arquivado'                              THEN 'Arquivado'
  ELSE 'Sem meta'
END;

ALTER TABLE public.projetos_investimento
  ADD CONSTRAINT projetos_investimento_status_check
  CHECK (status IN ('Sem meta', 'A começar', 'Aportando', 'Pausado', 'Concluído', 'Arquivado'));

ALTER TABLE public.projetos_investimento ALTER COLUMN status SET DEFAULT 'Sem meta';
