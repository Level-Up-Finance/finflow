-- =============================================================
-- FinFlow — Migration 0080
-- Adiciona campos de rastreamento interno na tabela feedback
-- Usados pelo Rastreador de Sugestões (desenvolvimento.html)
-- =============================================================

alter table public.feedback
  add column if not exists impacto      text not null default 'Médio',
  add column if not exists complexidade text not null default 'Baixa',
  add column if not exists modulo       text not null default 'outros',
  add column if not exists notas        text not null default '',
  add column if not exists arquivos     jsonb not null default '[]';
