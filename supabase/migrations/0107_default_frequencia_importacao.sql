-- =============================================================
-- Define frequência de importação default = 30 (mensal) pra TODAS as
-- contas. Quem quiser desativar usa a opção "Não lembrar" em
-- /configuracoes → Importações (que mantém o valor como NULL).
-- =============================================================

-- Garante que o default da coluna é 30 (mensal) pra novas contas
ALTER TABLE public.contas
  ALTER COLUMN frequencia_importacao_dias SET DEFAULT 30;

-- Backfill: contas que estão com NULL viram 30 (apenas ativas)
UPDATE public.contas
SET frequencia_importacao_dias = 30
WHERE frequencia_importacao_dias IS NULL
  AND status = 'ativa';
