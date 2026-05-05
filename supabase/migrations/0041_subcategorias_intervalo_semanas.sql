-- 0041_subcategorias_intervalo_semanas.sql
--
-- Suporte a "Semanal a cada N semanas".
-- intervalo_semanas = 1 → toda semana (padrão).
-- intervalo_semanas = 4 → a cada 4 semanas, a partir de iniciado_em.
-- Só aplicado quando periodo = 'Semanal'.

ALTER TABLE public.subcategorias
  ADD COLUMN IF NOT EXISTS intervalo_semanas INTEGER NOT NULL DEFAULT 1;
