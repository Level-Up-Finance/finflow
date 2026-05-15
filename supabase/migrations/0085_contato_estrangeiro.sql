-- Adiciona flag 'estrangeiro' à tabela contatos.
-- Quando true: o contato não possui CPF/CNPJ (campo oculto no formulário).
-- Default false preserva comportamento atual para todos os registros existentes.

alter table public.contatos
  add column if not exists estrangeiro boolean not null default false;
