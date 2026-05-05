-- Add description field to subcategorias (categorias already has it from 0005)
alter table public.subcategorias add column if not exists descricao text;
