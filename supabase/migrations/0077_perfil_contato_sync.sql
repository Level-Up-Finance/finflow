-- ============================================================
-- 0077_perfil_contato_sync.sql
--
-- 1. Renomeia observacao → bio em contatos.
-- 2. Adiciona twitter, is_perfil a contatos.
-- 3. Adiciona website, whatsapp, aniversario, empresa, cargo a profiles.
-- 4. Adiciona perfil_contato_id a profiles (FK → contatos).
-- 5. Atualiza handle_new_user para criar contato vinculado.
-- 6. Backfill: cria contatos para usuários já existentes.
-- 7. Triggers bidirecionais de sincronização (com proteção de loop).
-- ============================================================

-- ── 1. contatos: renomear observacao → bio ──
alter table public.contatos
  rename column observacao to bio;

-- ── 2. contatos: novos campos ──
alter table public.contatos
  add column if not exists twitter   text,
  add column if not exists is_perfil boolean not null default false;

-- ── 3. profiles: novos campos ──
alter table public.profiles
  add column if not exists website    text,
  add column if not exists whatsapp   text,
  add column if not exists aniversario date,
  add column if not exists empresa    text,
  add column if not exists cargo      text;

-- ── 4. profiles: FK para contato vinculado ──
alter table public.profiles
  add column if not exists perfil_contato_id uuid
    references public.contatos(id) on delete set null;

-- ── 5. Atualiza handle_new_user ──
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome       text;
  v_contato_id uuid;
begin
  v_nome := coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1));

  insert into public.profiles (id, nome)
  values (new.id, v_nome);

  insert into public.contatos (user_id, nome, email, tipo, is_perfil)
  values (new.id, v_nome, new.email, 'ambos', true)
  returning id into v_contato_id;

  update public.profiles
     set perfil_contato_id = v_contato_id
   where id = new.id;

  return new;
end;
$$;

-- ── 6. Backfill: contatos para usuários já existentes ──
do $$
declare
  p           record;
  v_contato_id uuid;
begin
  for p in
    select pr.id,
           pr.nome,
           pr.telefone,
           pr.bio,
           pr.instagram,
           pr.linkedin,
           pr.twitter,
           pr.foto_url,
           pr.website,
           pr.whatsapp,
           pr.aniversario,
           pr.empresa,
           pr.cargo,
           u.email
      from public.profiles pr
      join auth.users u on u.id = pr.id
     where pr.perfil_contato_id is null
  loop
    if not exists (
      select 1 from public.contatos
       where user_id = p.id and is_perfil = true
    ) then
      insert into public.contatos (
        user_id, nome, email, tipo, is_perfil,
        telefone, bio, instagram, linkedin, twitter,
        logo_url, website, whatsapp, aniversario, empresa, cargo
      ) values (
        p.id, p.nome, p.email, 'ambos', true,
        p.telefone, p.bio, p.instagram, p.linkedin, p.twitter,
        p.foto_url, p.website, p.whatsapp, p.aniversario, p.empresa, p.cargo
      ) returning id into v_contato_id;

      update public.profiles
         set perfil_contato_id = v_contato_id
       where id = p.id;
    end if;
  end loop;
end;
$$;

-- ── 7. Triggers de sincronização bidirecional ──

-- Função: profile → contato
create or replace function public.sync_profile_to_contact()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.perfil_contato_id is null then
    return new;
  end if;

  -- Evita loop: se esta atualização veio do trigger contato→profile, pula
  if coalesce(current_setting('app.syncing_from_contact', true), '') = 'true' then
    return new;
  end if;

  perform set_config('app.syncing_from_profile', 'true', false);

  update public.contatos set
    nome        = new.nome,
    telefone    = new.telefone,
    bio         = new.bio,
    instagram   = new.instagram,
    linkedin    = new.linkedin,
    twitter     = new.twitter,
    logo_url    = new.foto_url,
    website     = new.website,
    whatsapp    = new.whatsapp,
    aniversario = new.aniversario,
    empresa     = new.empresa,
    cargo       = new.cargo
  where id = new.perfil_contato_id
    and is_perfil = true;

  perform set_config('app.syncing_from_profile', 'false', false);

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_to_contact on public.profiles;
create trigger trg_sync_profile_to_contact
  after update on public.profiles
  for each row execute function public.sync_profile_to_contact();

-- Função: contato → profile
create or replace function public.sync_contact_to_profile()
returns trigger
language plpgsql
security definer
as $$
begin
  if not new.is_perfil then
    return new;
  end if;

  -- Evita loop: se esta atualização veio do trigger profile→contato, pula
  if coalesce(current_setting('app.syncing_from_profile', true), '') = 'true' then
    return new;
  end if;

  perform set_config('app.syncing_from_contact', 'true', false);

  update public.profiles set
    nome        = new.nome,
    telefone    = new.telefone,
    bio         = new.bio,
    instagram   = new.instagram,
    linkedin    = new.linkedin,
    twitter     = new.twitter,
    foto_url    = new.logo_url,
    website     = new.website,
    whatsapp    = new.whatsapp,
    aniversario = new.aniversario,
    empresa     = new.empresa,
    cargo       = new.cargo
  where perfil_contato_id = new.id;

  perform set_config('app.syncing_from_contact', 'false', false);

  return new;
end;
$$;

drop trigger if exists trg_sync_contact_to_profile on public.contatos;
create trigger trg_sync_contact_to_profile
  after update on public.contatos
  for each row execute function public.sync_contact_to_profile();
