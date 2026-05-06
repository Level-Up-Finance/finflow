-- =============================================================
-- FinFlow — Feedback: código legível (sg.app.NNNNNN)
-- Tabela feedback já existe desde 0045_feedback.sql
-- =============================================================

-- Coluna
alter table public.feedback
  add column if not exists codigo text unique;

-- Sequência
create sequence if not exists public.feedback_codigo_seq start 1;

-- Função geradora
create or replace function public.gen_feedback_codigo()
returns trigger language plpgsql as $$
begin
  if new.codigo is null then
    new.codigo := 'sg.app.' || lpad(nextval('public.feedback_codigo_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

-- Trigger
drop trigger if exists trg_feedback_codigo on public.feedback;
create trigger trg_feedback_codigo
  before insert on public.feedback
  for each row execute function public.gen_feedback_codigo();

-- Backfill das linhas existentes (em ordem de criação)
with numbered as (
  select id,
         row_number() over (order by created_at, id) as rn
  from public.feedback
  where codigo is null
)
update public.feedback f
set    codigo = 'sg.app.' || lpad(n.rn::text, 6, '0')
from   numbered n
where  f.id = n.id;

-- Avança a sequência além das linhas backfilladas
select setval(
  'public.feedback_codigo_seq',
  greatest(coalesce((select max(
    regexp_replace(codigo, '^sg\.app\.', '')::bigint
  ) from public.feedback where codigo is not null), 0), 1)
);
