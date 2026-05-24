-- =============================================================
-- 0126_subcategorias_oculta.sql
--
-- Adiciona flag `oculta` em subcategorias.
--
-- Conceito: algumas subs existem no DB pra reusar a maquinaria
-- de pagamentos/caixa livre/sync (precisam de FK válido), mas
-- NÃO devem aparecer em nenhuma UI onde o usuário interage com
-- elas como "compromisso". Exemplo canônico: "Gastos diversos" —
-- agregador de transações soltas que só faz sentido na página
-- Pagamentos (como placeholder), nunca em Compromissos /
-- Configurações / dropdowns / relatórios por sub.
--
-- Diferença em relação a `auto_gerado`:
--   - auto_gerado: sub é gerenciada pelo sistema (sub fatura tb é)
--   - oculta: sub é puramente placeholder, invisível pro user
-- Sub pode ser auto_gerado=true E oculta=false (caso: "Fatura X"
-- aparece como compromisso visível mas read-only).
-- =============================================================

ALTER TABLE public.subcategorias
  ADD COLUMN IF NOT EXISTS oculta boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subcategorias.oculta IS
  'true quando a sub é placeholder interno do sistema (ex: Gastos diversos) e nunca deve aparecer em UIs onde o user interage com subs. NÃO confundir com auto_gerado (que indica origem sistêmica mas pode ser visível e read-only).';

-- Backfill: marca a sub "Gastos diversos" como oculta
UPDATE public.subcategorias
   SET oculta = true
 WHERE auto_tipo = 'gastos_diversos';

-- Índice parcial pra queries comuns "todas subs visíveis"
CREATE INDEX IF NOT EXISTS idx_subcategorias_oculta_false
  ON public.subcategorias (workspace_id) WHERE oculta = false;
