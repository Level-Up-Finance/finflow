-- ============================================================
-- 0025_faturas_cartao.sql
--
-- Sistema de faturas de cartão de crédito (Fase 4).
--
-- Conceito: cada conta do tipo cartão tem fec_fatura (dia de fechamento)
-- e vencimento (dia de vencimento). Toda transação numa conta de cartão
-- pertence a uma fatura, identificada por mes_referencia ('YYYY-MM').
--
-- Quando a data atual passa do data_fechamento de uma fatura aberta,
-- a fatura é "fechada" — o sistema cria uma entrada em orcamento_geral
-- com o valor total no mês de vencimento, que vai virar um pagamento
-- automático na página de Pagamentos.
--
-- Existe uma única "subcategoria espelho" por cartão, dentro da categoria
-- "Cartões" (auto-criada). Ela é Mensal + valor_variavel — cada fatura
-- escreve seu valor_total no orcamento_geral do mês correspondente.
--
-- on delete set null em fatura_cartao_id: excluir uma fatura preserva
-- as transações vinculadas (apenas remove o link).
-- ============================================================

create table if not exists public.faturas_cartao (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  conta_id        uuid not null references public.contas(id) on delete cascade,
  mes_referencia  text not null,                   -- 'YYYY-MM'
  data_fechamento date not null,
  data_vencimento date not null,
  valor_total     numeric(15,2) not null default 0,
  status          text not null default 'aberta'
                  check (status in ('aberta', 'fechada')),
  subcategoria_id uuid references public.subcategorias(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, conta_id, mes_referencia)
);

create index if not exists idx_faturas_user_status
  on public.faturas_cartao (user_id, status);

create index if not exists idx_faturas_conta
  on public.faturas_cartao (conta_id);

-- FK em transacoes
alter table public.transacoes
  add column if not exists fatura_cartao_id uuid
    references public.faturas_cartao(id) on delete set null;

create index if not exists idx_transacoes_fatura
  on public.transacoes (fatura_cartao_id)
  where fatura_cartao_id is not null;

-- Trigger updated_at
drop trigger if exists trg_faturas_updated on public.faturas_cartao;
create trigger trg_faturas_updated
  before update on public.faturas_cartao
  for each row execute function public.set_updated_at();

-- RLS
alter table public.faturas_cartao enable row level security;

drop policy if exists "faturas_select" on public.faturas_cartao;
create policy "faturas_select" on public.faturas_cartao
  for select using (auth.uid() = user_id);

drop policy if exists "faturas_insert" on public.faturas_cartao;
create policy "faturas_insert" on public.faturas_cartao
  for insert with check (auth.uid() = user_id);

drop policy if exists "faturas_update" on public.faturas_cartao;
create policy "faturas_update" on public.faturas_cartao
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "faturas_delete" on public.faturas_cartao;
create policy "faturas_delete" on public.faturas_cartao
  for delete using (auth.uid() = user_id);
