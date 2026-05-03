-- Adds primary currency field to accounts.
alter table public.contas
  add column if not exists moeda text not null default 'BRL';
