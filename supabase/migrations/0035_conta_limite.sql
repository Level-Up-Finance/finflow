-- Adds credit limit field to accounts (relevant for credit cards).
alter table public.contas
  add column if not exists limite numeric(15,2);
