-- ============================================================
-- 0023_contatos.sql
--
-- Cria a tabela de contatos (clientes / fornecedores) e adiciona
-- a FK contato_id em subcategorias, dividas, projetos_investimento
-- e transacoes para que o usuário possa identificar com quem cada
-- compromisso/dívida/projeto/transação se relaciona.
--
-- on delete set null em todas as FKs: excluir um contato preserva
-- os registros vinculados, apenas removendo o link.
-- ============================================================

-- Tabela principal
create table if not exists public.contatos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  nome        text not null,
  tipo        text not null default 'ambos'
              check (tipo in ('cliente', 'fornecedor', 'ambos')),
  email       text,
  telefone    text,
  documento   text,                          -- CPF / CNPJ (texto livre)
  observacao  text,
  status      text not null default 'ativo'
              check (status in ('ativo', 'arquivado')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_contatos_user_nome
  on public.contatos (user_id, nome);

create index if not exists idx_contatos_user_tipo
  on public.contatos (user_id, tipo)
  where status = 'ativo';

-- Trigger updated_at (reaproveita função do schema base)
drop trigger if exists trg_contatos_updated on public.contatos;
create trigger trg_contatos_updated
  before update on public.contatos
  for each row execute function public.set_updated_at();

-- RLS
alter table public.contatos enable row level security;

drop policy if exists "contatos_select" on public.contatos;
create policy "contatos_select" on public.contatos
  for select using (auth.uid() = user_id);

drop policy if exists "contatos_insert" on public.contatos;
create policy "contatos_insert" on public.contatos
  for insert with check (auth.uid() = user_id);

drop policy if exists "contatos_update" on public.contatos;
create policy "contatos_update" on public.contatos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "contatos_delete" on public.contatos;
create policy "contatos_delete" on public.contatos
  for delete using (auth.uid() = user_id);

-- FKs nas tabelas relacionadas
alter table public.subcategorias
  add column if not exists contato_id uuid
    references public.contatos(id) on delete set null;

alter table public.dividas
  add column if not exists contato_id uuid
    references public.contatos(id) on delete set null;

alter table public.projetos_investimento
  add column if not exists contato_id uuid
    references public.contatos(id) on delete set null;

alter table public.transacoes
  add column if not exists contato_id uuid
    references public.contatos(id) on delete set null;

-- Índices parciais nos contato_id (queries de listagem por contato)
create index if not exists idx_subcategorias_contato
  on public.subcategorias (contato_id) where contato_id is not null;

create index if not exists idx_dividas_contato
  on public.dividas (contato_id) where contato_id is not null;

create index if not exists idx_projetos_contato
  on public.projetos_investimento (contato_id) where contato_id is not null;

create index if not exists idx_transacoes_contato
  on public.transacoes (contato_id) where contato_id is not null;
