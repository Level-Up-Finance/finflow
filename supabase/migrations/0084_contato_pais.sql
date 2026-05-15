-- Adiciona coluna 'pais' à tabela contatos para suporte a endereços internacionais.
-- Default 'Brasil' preserva comportamento atual para todos os registros existentes.

alter table public.contatos
  add column if not exists pais text not null default 'Brasil';
