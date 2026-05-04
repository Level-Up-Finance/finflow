-- Adiciona campos de compromisso direto na tabela categorias
-- Permite que uma categoria tenha valor, tipo e demais dados de compromisso
-- sem precisar criar uma subcategoria

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS conta_id       uuid REFERENCES public.contas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS divida_id      uuid REFERENCES public.dividas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contato_id     uuid REFERENCES public.contatos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_pagamento text,
  ADD COLUMN IF NOT EXISTS periodo        text,
  ADD COLUMN IF NOT EXISTS vencimento_dia integer,
  ADD COLUMN IF NOT EXISTS dia_semana     integer,
  ADD COLUMN IF NOT EXISTS iniciado_em    date,
  ADD COLUMN IF NOT EXISTS terminado_em   date,
  ADD COLUMN IF NOT EXISTS status         text,
  ADD COLUMN IF NOT EXISTS descricao      text;

ALTER TABLE public.categorias
  DROP CONSTRAINT IF EXISTS categorias_status_check;

ALTER TABLE public.categorias
  ADD CONSTRAINT categorias_status_check
  CHECK (status IS NULL OR status IN ('ativa', 'inativa', 'arquivada'));
