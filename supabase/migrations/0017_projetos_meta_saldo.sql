-- ============================================================
-- 0017_projetos_meta_saldo.sql
--
-- Adiciona em projetos_investimento:
--   • meta_valor      — valor-objetivo opcional (ex: R$ 200.000)
--   • data_alvo       — prazo opcional pra atingir a meta
--   • saldo_inicial   — quanto já foi investido antes do app começar
--                       a controlar (default 0). Soma ao realizado.
--
-- Também: adiciona 'arquivado' como status válido. Projetos arquivados
-- ficam ocultos da listagem padrão, mas podem ser acessados via filtro.
--
-- Idempotente.
-- ============================================================

alter table public.projetos_investimento
  add column if not exists meta_valor    numeric(15,2);

alter table public.projetos_investimento
  add column if not exists data_alvo     date;

alter table public.projetos_investimento
  add column if not exists saldo_inicial numeric(15,2) not null default 0;

-- Atualiza check do status pra incluir 'arquivado'
alter table public.projetos_investimento
  drop constraint if exists projetos_investimento_status_check;

alter table public.projetos_investimento
  add constraint projetos_investimento_status_check
  check (status in ('ativo', 'concluido', 'pausado', 'arquivado'));
