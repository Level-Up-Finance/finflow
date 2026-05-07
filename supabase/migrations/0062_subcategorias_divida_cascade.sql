-- =============================================================
-- FinFlow — Subcategorias auto-criadas pela dívida cascade junto
-- =============================================================
-- Antes: ON DELETE SET NULL (subcategoria persiste como recorrência genérica)
-- Agora: ON DELETE CASCADE (subcategoria removida com a dívida)
--
-- Pagamentos da dívida já são CASCADE (migration 0043).

alter table public.subcategorias
  drop constraint if exists subcategorias_divida_id_fkey;

alter table public.subcategorias
  add constraint subcategorias_divida_id_fkey
  foreign key (divida_id) references public.dividas(id) on delete cascade;
