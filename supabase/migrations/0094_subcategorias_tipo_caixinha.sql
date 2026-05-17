-- Adiciona 'Caixinha' como tipo válido em subcategorias.
-- Caixinha = comprometimento virtual de poupança vinculado a uma Conta Reserva.

ALTER TABLE public.subcategorias DROP CONSTRAINT IF EXISTS subcategorias_tipo_check;
ALTER TABLE public.subcategorias ADD CONSTRAINT subcategorias_tipo_check
  CHECK (tipo IN ('Receita', 'Despesa', 'Caixinha'));
