-- Remove categoria "Objetivos" (e suas subcategorias) de todos os usuários.
-- Desprotege Casa, Doações e Presentes e Educação e Saúde (is_default → false).

-- 1. Subcategorias de Objetivos
delete from public.subcategorias
where categoria_id in (
  select id from public.categorias
  where nome = 'Objetivos' and is_default = true
);

-- 2. Categoria Objetivos
delete from public.categorias
where nome = 'Objetivos' and is_default = true;

-- 3. Desproteger categorias de exemplo (usuário pode editar/deletar)
update public.categorias
set is_default = false
where nome in ('Casa', 'Doações e Presentes', 'Educação e Saúde')
  and is_default = true;
