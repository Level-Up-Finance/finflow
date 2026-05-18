-- ============================================================
-- 0100_rename_dividas_label.sql
--
-- Renomeia o label coletivo/seção "Dívidas" para "Financiamentos e Dívidas".
--
-- Escopo limitado: apenas labels plurais/seção. Referências singulares
-- ("Nova dívida", "Excluir dívida" etc.) permanecem como estão no código.
--
-- Tabelas DB e variáveis JS internas (`dividas`, `divida_id`, etc.) NÃO
-- são renomeadas — só o display name.
-- ============================================================

-- 1. Categorias dos usuários (default + qualquer outra com nome "Dívidas")
update public.categorias
   set nome = 'Financiamentos e Dívidas'
 where nome = 'Dívidas';

-- 2. i18n_strings — só os 3 labels coletivos/seção
--    Demais strings (toasts, validações, modais) referem-se a item individual
--    e permanecem como "Dívida(s)" sem alteração.
update public.i18n_strings
   set pt_br = 'Financiamentos e Dívidas'
 where chave in (
   'nav.dividas',           -- label do menu lateral
   'dividas.titulo',        -- título H1 da página
   'tutorial.dividas.title' -- título do card de tutorial
 );
