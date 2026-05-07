-- =============================================================
-- FinFlow — Status "Arquivada" + vínculo transacoes ↔ divida
-- =============================================================
-- Quando uma dívida tem pagamentos, ao "excluir" ela vira "Arquivada"
-- (vai pro grupo Terminado, compromisso/subcategoria são removidos)
-- mas as transações já registradas permanecem com link para a dívida.

-- 1) Adiciona 'Arquivada' aos status válidos
alter table public.dividas drop constraint if exists dividas_status_check;
alter table public.dividas add constraint dividas_status_check
  check (status in ('Ativa', 'Quitada', 'Negociando', 'Atrasada', 'Arquivada'));

-- 2) Vínculo transacoes → dividas (preservado mesmo após arquivar; SET NULL se
--    a dívida for hard-deleted no fluxo "sem pagamentos")
alter table public.transacoes
  add column if not exists divida_id uuid references public.dividas(id) on delete set null;

create index if not exists idx_transacoes_divida_id
  on public.transacoes(divida_id) where divida_id is not null;
