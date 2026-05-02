-- ============================================================
-- 0019_fix_categorias_grupo.sql
--
-- Reclassifica categorias default que foram criadas antes da
-- coluna "grupo" existir e ficaram com grupo = 'custo_vida'.
-- Idempotente.
-- ============================================================

update public.categorias
   set grupo = 'receitas'
 where is_default = true
   and grupo = 'custo_vida'
   and (nome ilike '%receita%' or nome ilike '%entrada%');

update public.categorias
   set grupo = 'dividas'
 where is_default = true
   and grupo = 'custo_vida'
   and (nome ilike '%dívida%' or nome ilike '%divida%');

update public.categorias
   set grupo = 'investimentos'
 where is_default = true
   and grupo = 'custo_vida'
   and nome ilike '%investiment%';
