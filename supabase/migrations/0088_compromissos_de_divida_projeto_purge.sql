-- =============================================================
-- 0088 — Purga compromissos vinculados a dívidas/projetos e remove
--        coluna `configurada` (obsoleta após refatoração v0.4.0).
-- =============================================================
-- Contexto: a partir do v0.4.0, dívidas e projetos de investimento
-- são a fonte de verdade dos compromissos vinculados a eles. Não há
-- mais criação/edição de compromissos dessas categorias via página
-- de Compromissos. Para evitar inconsistência entre modelos antigos
-- e o novo, apagamos todos os compromissos vinculados existentes:
-- o usuário recriará via página de Dívidas/Projetos, agora com a
-- experiência correta (regime, parcelas, valores mensais coerentes).
-- =============================================================

-- 1) Apaga valores mensais (orcamento_geral) dos compromissos vinculados
DELETE FROM public.orcamento_geral
WHERE subcategoria_id IN (
  SELECT id FROM public.subcategorias
  WHERE divida_id IS NOT NULL OR projeto_id IS NOT NULL
);

-- 2) Apaga pagamentos avulsos desses compromissos (se houver)
DELETE FROM public.pagamentos
WHERE subcategoria_id IN (
  SELECT id FROM public.subcategorias
  WHERE divida_id IS NOT NULL OR projeto_id IS NOT NULL
);

-- 3) Apaga as subcategorias (compromissos) vinculadas a dívida/projeto
DELETE FROM public.subcategorias
WHERE divida_id IS NOT NULL OR projeto_id IS NOT NULL;

-- 4) Remove a coluna `configurada` (era flag para o fluxo anterior)
ALTER TABLE public.dividas
  DROP COLUMN IF EXISTS configurada;
