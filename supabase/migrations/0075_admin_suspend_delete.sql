-- ============================================================
-- 0075_admin_suspend_delete.sql
--
-- Adiciona flag suspenso em profiles.
-- Atualiza get_admin_users() para incluir suspenso.
-- Adiciona admin_suspend_user() e admin_delete_user().
-- ============================================================

alter table public.profiles
  add column if not exists suspenso boolean not null default false;

-- ── Recria get_admin_users incluindo suspenso ──
create or replace function public.get_admin_users()
returns table (
  id               uuid,
  email            text,
  data_cadastro    timestamptz,
  ultimo_acesso    timestamptz,
  email_confirmado timestamptz,
  nome             text,
  apelido          text,
  bio              text,
  foto_url         text,
  telefone         text,
  plano            text,
  instagram        text,
  twitter          text,
  linkedin         text,
  moeda_padrao     text,
  tema             text,
  idioma           text,
  suspenso         boolean
)
language sql
security definer
stable
as $$
  select
    p.id,
    u.email,
    u.created_at       as data_cadastro,
    u.last_sign_in_at  as ultimo_acesso,
    u.confirmed_at     as email_confirmado,
    p.nome,
    p.apelido,
    p.bio,
    p.foto_url,
    p.telefone,
    p.plano,
    p.instagram,
    p.twitter,
    p.linkedin,
    p.moeda_padrao,
    p.tema,
    p.idioma,
    p.suspenso
  from public.profiles p
  join auth.users u on u.id = p.id
  order by u.created_at desc;
$$;

grant execute on function public.get_admin_users() to authenticated;

-- ── Suspender / reativar usuário ──
-- TODO: restringir ao admin quando RBAC estiver pronto.
create or replace function public.admin_suspend_user(
  target_user_id uuid,
  suspender       boolean
)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
     set suspenso = suspender
   where id = target_user_id;
end;
$$;

grant execute on function public.admin_suspend_user(uuid, boolean) to authenticated;

-- ── Deletar usuário permanentemente ──
-- Deleta de auth.users → cascateia para profiles via FK.
-- TODO: restringir ao admin quando RBAC estiver pronto.
create or replace function public.admin_delete_user(
  target_user_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  delete from auth.users where id = target_user_id;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;
