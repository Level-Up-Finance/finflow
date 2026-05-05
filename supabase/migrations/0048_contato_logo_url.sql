-- ============================================================
-- 0048_contato_logo_url.sql
--
-- Adiciona logo_url na tabela contatos. Usado pra avatar de
-- contatos do tipo Pessoa Jurídica (puxado via Clearbit Logo
-- API a partir do domínio do email/website).
-- ============================================================

alter table public.contatos
  add column if not exists logo_url text;
