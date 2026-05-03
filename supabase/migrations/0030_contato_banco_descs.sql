-- Histórico de banco_desc por contato.
-- Toda vez que uma transação importada é vinculada a um contato (via edição ou
-- reconciliação), registramos o par banco_desc→contato_id aqui.
-- Isso permite que importações futuras do mesmo banco_desc reconheçam o contato
-- automaticamente — sem depender de ter uma transação anterior com aquele campo.
create table if not exists public.contato_banco_descs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users not null,
  contato_id          uuid references public.contatos(id) on delete cascade not null,
  banco_desc          text not null,
  last_subcategoria_id uuid references public.subcategorias(id) on delete set null,
  created_at          timestamptz default now(),
  unique(user_id, contato_id, banco_desc)
);

create index if not exists idx_cdb_user_banco_desc
  on public.contato_banco_descs(user_id, banco_desc);

-- RLS: cada usuário acessa apenas seus próprios registros
alter table public.contato_banco_descs enable row level security;

create policy "Users manage own contato_banco_descs"
  on public.contato_banco_descs
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
