-- ============================================================
-- 0015_profile_fields.sql
--
-- Adiciona campos de perfil pra a tela "Meu perfil" (Fase 6.C):
--   • apelido     — como o user quer ser chamado
--   • bio         — descrição curta
--   • foto_url    — URL da foto de perfil (Supabase Storage)
--   • instagram   — URL/handle (link manual)
--   • twitter     — URL/handle
--   • linkedin    — URL/handle
--
-- Idempotente.
-- ============================================================

alter table public.profiles add column if not exists apelido   text;
alter table public.profiles add column if not exists bio       text;
alter table public.profiles add column if not exists foto_url  text;
alter table public.profiles add column if not exists instagram text;
alter table public.profiles add column if not exists twitter   text;
alter table public.profiles add column if not exists linkedin  text;

-- Bucket de Storage pras fotos.
-- Idempotente: se já existe, ignora.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Policies de storage: usuário só pode ler/escrever na "pasta" do próprio uid.
-- Convenção: paths são "<user_id>/<filename>".
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_user_write" on storage.objects;
create policy "avatars_user_write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_user_update" on storage.objects;
create policy "avatars_user_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_user_delete" on storage.objects;
create policy "avatars_user_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
