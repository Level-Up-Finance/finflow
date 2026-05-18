-- ============================================================
-- 0099_admin_role.sql
--
-- Adiciona sistema de roles admin ao FinFlow.
--
-- 1. Coluna profiles.is_admin (boolean, default false).
-- 2. Função is_current_user_admin() (SECURITY DEFINER, stable).
-- 3. Bootstrap: flag is_admin = true nos UUIDs do dono do app
--    (arnaldo.oliveira@me.com + arnaldo@leveluponline.org).
-- 4. Atualiza 4 RPCs admin com guard:
--    - get_admin_users
--    - admin_set_plano
--    - admin_suspend_user
--    - admin_delete_user
-- 5. Atualiza RLS policies de i18n_strings (INSERT/UPDATE/DELETE)
--    e i18n_historico (todas) p/ exigir admin.
--    NOTA: SELECT de i18n_strings continua aberto p/ authenticated
--    porque toda a UI lê strings traduzidas via loadStrings().
--
-- PENDENTE (escopo futuro):
-- - feedback table SELECT/UPDATE/DELETE: várias páginas (novidades,
--   desenvolvimento, feedback) leem essa tabela com regras complexas.
--   Restringir SELECT a admin quebra fluxos não-admin. Refatorar
--   policies em separado depois de mapear cada uso.
-- ============================================================

-- ── 1. Coluna is_admin em profiles ────────────────────────────
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- ── 2. Função helper de check ─────────────────────────────────
-- SECURITY DEFINER porque precisa ler profiles bypassando RLS
-- (a policy de profiles só permite o próprio user ler seu row,
-- mas precisamos checar is_admin de auth.uid() sem importar de onde).
create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_current_user_admin() to authenticated;

-- ── 3. Bootstrap: dono do app vira admin ──────────────────────
-- Ambos UUIDs (prod e teste) flagged. Seguro rodar múltiplas vezes
-- — UPDATE com WHERE id IN só afeta os rows existentes.
update public.profiles
   set is_admin = true
 where id in (
   '7eda4f30-990d-4cca-93dd-81e8fbd90541'::uuid,  -- arnaldo.oliveira@me.com
   '7f38d643-89a5-4a3e-b58e-ad6ac6012259'::uuid   -- arnaldo@leveluponline.org
 );

-- ── 4. Guard nos 4 RPCs admin ─────────────────────────────────
-- Recriamos cada função adicionando check no início do corpo.
-- Idempotente: create or replace substitui a versão anterior.

-- 4.1 get_admin_users
drop function if exists public.get_admin_users();
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
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not is_current_user_admin() then
    raise exception 'Acesso negado: requer admin' using errcode = '42501';
  end if;
  return query
    select
      p.id,
      u.email::text,
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
end;
$$;

grant execute on function public.get_admin_users() to authenticated;

-- 4.2 admin_set_plano
create or replace function public.admin_set_plano(
  target_user_id uuid,
  new_plano       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_admin() then
    raise exception 'Acesso negado: requer admin' using errcode = '42501';
  end if;
  update public.profiles
     set plano = new_plano
   where id = target_user_id;
end;
$$;

grant execute on function public.admin_set_plano(uuid, text) to authenticated;

-- 4.3 admin_suspend_user
create or replace function public.admin_suspend_user(
  target_user_id uuid,
  suspender       boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_admin() then
    raise exception 'Acesso negado: requer admin' using errcode = '42501';
  end if;
  update public.profiles
     set suspenso = suspender
   where id = target_user_id;
end;
$$;

grant execute on function public.admin_suspend_user(uuid, boolean) to authenticated;

-- 4.4 admin_delete_user
create or replace function public.admin_delete_user(
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_admin() then
    raise exception 'Acesso negado: requer admin' using errcode = '42501';
  end if;
  -- Trava: não permite o admin deletar a si mesmo
  if target_user_id = auth.uid() then
    raise exception 'Não é possível deletar a própria conta admin' using errcode = '42501';
  end if;
  delete from auth.users where id = target_user_id;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ── 5. RLS policies i18n_strings (INSERT/UPDATE/DELETE) ────────
drop policy if exists "authenticated insert strings"  on public.i18n_strings;
drop policy if exists "authenticated update strings"  on public.i18n_strings;
drop policy if exists "authenticated delete strings"  on public.i18n_strings;

create policy "admin insert strings" on public.i18n_strings
  for insert to authenticated with check (is_current_user_admin());

create policy "admin update strings" on public.i18n_strings
  for update to authenticated using (is_current_user_admin()) with check (is_current_user_admin());

create policy "admin delete strings" on public.i18n_strings
  for delete to authenticated using (is_current_user_admin());

-- SELECT permanece aberto p/ authenticated (UI usa loadStrings).

-- ── 6. RLS policies i18n_historico (TODAS) ─────────────────────
drop policy if exists "authenticated read historico"   on public.i18n_historico;
drop policy if exists "authenticated insert historico" on public.i18n_historico;

create policy "admin read historico" on public.i18n_historico
  for select to authenticated using (is_current_user_admin());

create policy "admin insert historico" on public.i18n_historico
  for insert to authenticated with check (is_current_user_admin());
