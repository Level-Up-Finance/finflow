-- ============================================================
-- 0014_categoria_grupo.sql
--
-- Adiciona "grupo" em categorias pra agrupar visualmente o orçamento
-- em 3 super-blocos:
--   • receitas      → CONTRIBUIÇÃO (entra no cálculo da linha "Contribuição")
--   • dividas       → CONTRIBUIÇÃO (subtrai da linha "Contribuição")
--   • investimentos → SONHOS
--   • custo_vida    → CUSTO DE VIDA  (default — categoria nova cai aqui)
--
-- O UPDATE inicial classifica as defaults pelo nome. Categorias
-- custom existentes ficam em "custo_vida" e podem ser reclassificadas
-- pelo usuário no modal de gerenciamento.
--
-- Idempotente.
-- ============================================================

alter table public.categorias
  add column if not exists grupo text not null default 'custo_vida';

alter table public.categorias
  drop constraint if exists categorias_grupo_check;

alter table public.categorias
  add constraint categorias_grupo_check
  check (grupo in ('receitas', 'dividas', 'investimentos', 'custo_vida'));

-- Classifica as 3 defaults pelo nome (idempotente — só sobrescreve se ainda em 'custo_vida')
update public.categorias
   set grupo = 'receitas'
 where grupo = 'custo_vida'
   and (nome ilike '%receita%' or nome ilike '%entrada%');

update public.categorias
   set grupo = 'dividas'
 where grupo = 'custo_vida'
   and (nome ilike '%dívida%' or nome ilike '%divida%');

update public.categorias
   set grupo = 'investimentos'
 where grupo = 'custo_vida'
   and nome ilike '%investiment%';
