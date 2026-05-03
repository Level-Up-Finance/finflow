-- Adds destination account field for transfer-type compromissos.
alter table public.subcategorias
  add column if not exists conta_destino_id uuid references public.contas(id) on delete set null;
