-- ============================================================
-- 0049_admin_users.sql
--
-- Adiciona telefone e plano ao profiles.
-- Cria função get_admin_users() (SECURITY DEFINER) para o painel
-- admin acessar email/datas de auth.users sem service_role.
-- Cria função admin_set_plano() para alterar plano de qualquer
-- usuário a partir do front-end.
-- ============================================================

alter table public.profiles
  add column if not exists telefone text,
  add column if not exists plano    text not null default 'free';

-- ── Função que retorna todos os usuários com dados de auth.users ──
-- SECURITY DEFINER: roda com as permissões do criador (postgres),
-- que tem acesso ao schema auth. O front usa supabase.rpc('get_admin_users').
-- TODO: adicionar verificação de admin quando o sistema de roles estiver pronto.
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
  idioma           text
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
    p.idioma
  from public.profiles p
  join auth.users u on u.id = p.id
  order by u.created_at desc;
$$;

grant execute on function public.get_admin_users() to authenticated;

-- ── Função para alterar o plano de qualquer usuário ──
-- SECURITY DEFINER: bypassa o RLS que só permite o próprio usuário
-- atualizar seu perfil. Necessário para o admin alterar planos.
-- TODO: restringir ao usuário admin quando o sistema de roles estiver pronto.
create or replace function public.admin_set_plano(
  target_user_id uuid,
  new_plano       text
)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
     set plano = new_plano
   where id = target_user_id;
end;
$$;

grant execute on function public.admin_set_plano(uuid, text) to authenticated;
