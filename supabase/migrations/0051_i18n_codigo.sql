-- =============================================================
-- FinFlow — i18n strings: código legível (st.app.NNNNNN)
-- Depende de: 0050_i18n.sql (tabela i18n_strings já criada)
-- =============================================================

-- Coluna
alter table public.i18n_strings
  add column if not exists codigo text unique;

-- Sequência
create sequence if not exists public.i18n_strings_codigo_seq start 1;

-- Função geradora
create or replace function public.gen_i18n_codigo()
returns trigger language plpgsql as $$
begin
  if new.codigo is null then
    new.codigo := 'st.app.' || lpad(nextval('public.i18n_strings_codigo_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

-- Trigger
drop trigger if exists trg_i18n_codigo on public.i18n_strings;
create trigger trg_i18n_codigo
  before insert on public.i18n_strings
  for each row execute function public.gen_i18n_codigo();

-- Backfill das linhas já inseridas pelo seed do 0050
with numbered as (
  select id,
         row_number() over (order by created_at, id) as rn
  from public.i18n_strings
  where codigo is null
)
update public.i18n_strings s
set    codigo = 'st.app.' || lpad(n.rn::text, 6, '0')
from   numbered n
where  s.id = n.id;

-- Avança a sequência além das linhas backfilladas
select setval(
  'public.i18n_strings_codigo_seq',
  greatest(coalesce((select max(
    regexp_replace(codigo, '^st\.app\.', '')::bigint
  ) from public.i18n_strings where codigo is not null), 0), 1)
);
