-- ============================================================
-- 0011_valor_variavel_renda_principal.sql
--
-- Adições em subcategorias:
--   • valor_variavel: marca compromisso cujo valor muda mês a mês.
--     Quando true, o valor_planejado do orcamento_geral NÃO é
--     seedado a partir de valor_base — fica em 0 e o usuário
--     define mês a mês (na tela de compromissos ou orçamento).
--   • eh_renda_principal: marca a receita principal do usuário.
--     Apenas 1 por user (unique parcial). As ocorrências dela no
--     mês definem os blocos da página de Pagamentos.
--
-- Também: relaxa o check de bloco_quinzenal em pagamentos pra
-- aceitar índices ≥ 1 (era 1 ou 2). A coluna preserva o nome
-- legado mas semanticamente vira "índice do bloco no mês".
--
-- Idempotente.
-- ============================================================

-- ====================================================
-- valor_variavel
-- ====================================================
alter table public.subcategorias
  add column if not exists valor_variavel boolean not null default false;

-- ====================================================
-- eh_renda_principal
-- ====================================================
alter table public.subcategorias
  add column if not exists eh_renda_principal boolean not null default false;

-- Apenas 1 renda principal por user (e só faz sentido pra Receita).
drop index if exists subcategorias_renda_principal_unique;
create unique index subcategorias_renda_principal_unique
  on public.subcategorias (user_id)
  where eh_renda_principal = true;

-- ====================================================
-- Permitir bloco_quinzenal ≥ 1 (pra suportar 3+ blocos)
-- ====================================================
alter table public.pagamentos
  drop constraint if exists pagamentos_bloco_quinzenal_check;

alter table public.pagamentos
  add constraint pagamentos_bloco_quinzenal_check
  check (bloco_quinzenal >= 1);
