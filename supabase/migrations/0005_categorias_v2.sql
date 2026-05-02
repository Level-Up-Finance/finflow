-- ============================================================
-- 0005_categorias_v2.sql
--
-- Aplica os mesmos padrões de Contas v3 na tabela `categorias`:
--   • apelido (display name custom)
--   • descricao (anotações)
--   • status (ativa | inativa | arquivada) substituindo `ativo`
--   • fechada_em (data de arquivamento)
--
-- Idempotente.
-- ============================================================

-- 1) Apelido + Descrição + Fechada em
alter table public.categorias add column if not exists apelido    text;
alter table public.categorias add column if not exists descricao  text;
alter table public.categorias add column if not exists fechada_em date;

-- 2) Status (substitui ativo)
alter table public.categorias add column if not exists status text not null default 'ativa';
alter table public.categorias drop constraint if exists categorias_status_check;
alter table public.categorias add  constraint categorias_status_check
  check (status in ('ativa','inativa','arquivada'));

-- 3) Migrar ativo → status (se ainda existir)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorias' and column_name = 'ativo'
  ) then
    update public.categorias set status = 'inativa' where ativo = false;
  end if;
end $$;

-- 4) Drop ativo
alter table public.categorias drop column if exists ativo;
