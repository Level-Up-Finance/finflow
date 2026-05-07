-- =============================================================
-- FinFlow — Projetos: backup do compromisso vinculado para restauração
-- =============================================================
-- Quando um projeto é arquivado (soft-delete com aportes), o
-- compromisso/subcategoria é removido mas guardamos os dados
-- necessários pra recriar automaticamente ao restaurar.

alter table public.projetos_investimento
  add column if not exists comp_valor_base   numeric(15,2),
  add column if not exists comp_periodo      text,
  add column if not exists comp_categoria_id uuid references public.categorias(id) on delete set null,
  add column if not exists comp_data_inicio  date;
