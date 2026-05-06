-- =============================================================
-- FinFlow — i18n: aprovado + alterado_por no histórico
-- =============================================================

-- Quem fez a alteração no histórico
alter table public.i18n_historico
  add column if not exists alterado_por text;

-- Strings precisam de aprovação antes de entrar em produção.
-- false = aguardando aprovação, true = aprovado.
alter table public.i18n_strings
  add column if not exists aprovado boolean not null default false;

-- Todos os strings existentes já estão aprovados
update public.i18n_strings set aprovado = true;
