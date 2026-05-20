-- 0111_pagamentos_conta_efetiva.sql
--
-- Adiciona pagamentos.conta_id_efetiva: a conta de onde o dinheiro
-- REALMENTE saiu, quando diferente da conta configurada no compromisso.
--
-- Cenário: compromisso "Aluguel" configurado pra Nubank, mas no mês X o
-- usuário pagou via PIX do Inter. Antes desta migration, o sistema criava
-- a transação na Nubank (errado). Agora pode rastrear a conta efetiva.
--
-- NULL = pagamento saiu da conta configurada no compromisso (caso normal)
-- valor = id da conta de onde saiu de fato (override do default)

ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS conta_id_efetiva uuid
    REFERENCES public.contas(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pagamentos.conta_id_efetiva IS
  'Conta de onde o pagamento realmente saiu, quando diferente da conta do compromisso. NULL = usa subcategorias.conta_id.';
