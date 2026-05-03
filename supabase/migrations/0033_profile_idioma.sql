alter table public.profiles
  add column if not exists idioma text not null default 'auto';
