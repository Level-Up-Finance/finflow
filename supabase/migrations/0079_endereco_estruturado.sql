-- ============================================================
-- 0079_endereco_estruturado.sql
-- Campos de endereço estruturado em contatos e profiles
-- ============================================================

-- Contatos
alter table public.contatos
  add column if not exists cep          text,
  add column if not exists logradouro   text,
  add column if not exists numero       text,
  add column if not exists complemento  text,
  add column if not exists bairro       text,
  add column if not exists cidade       text,
  add column if not exists estado_uf    text;

-- Profiles
alter table public.profiles
  add column if not exists cep          text,
  add column if not exists logradouro   text,
  add column if not exists numero       text,
  add column if not exists complemento  text,
  add column if not exists bairro       text,
  add column if not exists cidade       text,
  add column if not exists estado_uf    text;

-- Atualiza sync profile → contato (adicionar campos de endereço)
create or replace function public.sync_profile_to_contact()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.perfil_contato_id is null then
    return new;
  end if;
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
    cargo       = new.cargo,
    cep         = new.cep,
    logradouro  = new.logradouro,
    numero      = new.numero,
    complemento = new.complemento,
    bairro      = new.bairro,
    cidade      = new.cidade,
    estado_uf   = new.estado_uf
  where id = new.perfil_contato_id
    and is_perfil = true;
  perform set_config('app.syncing_from_profile', 'false', false);
  return new;
end;
$$;

-- Atualiza sync contato → profile
create or replace function public.sync_contact_to_profile()
returns trigger
language plpgsql
security definer
as $$
begin
  if not new.is_perfil then
    return new;
  end if;
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
    cargo       = new.cargo,
    cep         = new.cep,
    logradouro  = new.logradouro,
    numero      = new.numero,
    complemento = new.complemento,
    bairro      = new.bairro,
    cidade      = new.cidade,
    estado_uf   = new.estado_uf
  where perfil_contato_id = new.id;
  perform set_config('app.syncing_from_contact', 'false', false);
  return new;
end;
$$;
