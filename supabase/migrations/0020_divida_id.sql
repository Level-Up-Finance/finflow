-- ============================================================
-- 0020_divida_id.sql
--
-- Adiciona divida_id em subcategorias para vincular um
-- compromisso da categoria "Dívidas" a um card de dívida.
-- Idempotente.
-- ============================================================

alter table public.subcategorias
  add column if not exists divida_id uuid
    references public.dividas(id)
    on delete set null;

create index if not exists idx_subcategorias_divida_id
  on public.subcategorias (divida_id)
  where divida_id is not null;
