-- ============================================================
-- 0013_profile_tema.sql
--
-- Adiciona preferência de tema na tabela profiles.
-- Valores: 'claro' | 'escuro' | 'auto'  (auto = segue OS).
--
-- Idempotente.
-- ============================================================

alter table public.profiles
  add column if not exists tema text not null default 'auto';

alter table public.profiles
  drop constraint if exists profiles_tema_check;

alter table public.profiles
  add constraint profiles_tema_check
  check (tema in ('claro', 'escuro', 'auto'));
