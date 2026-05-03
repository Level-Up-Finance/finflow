-- ============================================================
-- 0021_transacoes.sql
--
-- Cria a tabela de transações: registro real de dinheiro movimentado.
-- Diferente de `pagamentos` (status mensal de compromisso) e de
-- `subcategorias` (compromisso recorrente), uma transação é um
-- evento atômico — uma entrada ou saída em uma data específica.
--
-- Fase 1: tabela base + entrada manual + vínculo opcional a subcategoria.
-- Fases seguintes adicionam: pagamento_id, fatura_cartao_id, status,
-- regras de reconciliação automática e fechamento de fatura de cartão.
-- ============================================================

create table if not exists public.transacoes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  data            date not null,
  valor           numeric(15,2) not null,
  tipo            text not null check (tipo in ('Receita','Despesa')),
  conta_id        uuid references public.contas(id) on delete set null,
  subcategoria_id uuid references public.subcategorias(id) on delete set null,
  descricao       text,
  estabelecimento text,
  moeda           text not null default 'BRL',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_transacoes_user_data
  on public.transacoes (user_id, data desc);

create index if not exists idx_transacoes_subcategoria
  on public.transacoes (subcategoria_id)
  where subcategoria_id is not null;

create index if not exists idx_transacoes_estabelecimento
  on public.transacoes (user_id, estabelecimento)
  where estabelecimento is not null;

-- Trigger updated_at (reaproveita a função set_updated_at do schema base)
drop trigger if exists trg_transacoes_updated on public.transacoes;
create trigger trg_transacoes_updated
  before update on public.transacoes
  for each row execute function public.set_updated_at();

-- RLS
alter table public.transacoes enable row level security;

drop policy if exists "transacoes_select" on public.transacoes;
create policy "transacoes_select" on public.transacoes
  for select using (auth.uid() = user_id);

drop policy if exists "transacoes_insert" on public.transacoes;
create policy "transacoes_insert" on public.transacoes
  for insert with check (auth.uid() = user_id);

drop policy if exists "transacoes_update" on public.transacoes;
create policy "transacoes_update" on public.transacoes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "transacoes_delete" on public.transacoes;
create policy "transacoes_delete" on public.transacoes
  for delete using (auth.uid() = user_id);
