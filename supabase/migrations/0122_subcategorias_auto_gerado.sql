-- =============================================================
-- 0122_subcategorias_auto_gerado.sql
--
-- Adiciona flag pra subcategorias geradas automaticamente pelo
-- sistema (ex: "Fatura {Cartão}", futuramente "Gastos diversos").
-- Essas subs ficam blindadas contra edição/deleção manual do user.
--
-- Estratégia: trigger BEFORE UPDATE/DELETE bloqueia operações
-- crítica quando auto_gerado=true. Mensagem de erro PT-BR clara.
-- =============================================================

-- 1. Coluna ----------------------------------------------------
ALTER TABLE public.subcategorias
  ADD COLUMN IF NOT EXISTS auto_gerado boolean NOT NULL DEFAULT false;

ALTER TABLE public.subcategorias
  ADD COLUMN IF NOT EXISTS auto_tipo text;

-- Valores conhecidos pra auto_tipo (não enum pra não engessar):
--   'fatura_cartao'  — sub espelho de cartão de crédito (lib/faturas-cartao.js)
--   'gastos_diversos' — sub agregadora de transações soltas (migration 0124)

COMMENT ON COLUMN public.subcategorias.auto_gerado IS
  'true quando a sub foi criada automaticamente pelo sistema (ex: fatura de cartão). Bloqueia edição/deleção manual.';

COMMENT ON COLUMN public.subcategorias.auto_tipo IS
  'Discriminador da origem da sub auto-gerada (fatura_cartao | gastos_diversos | ...). NULL pra subs normais.';

-- Índice parcial pra queries de "todas as subs sistêmicas"
CREATE INDEX IF NOT EXISTS idx_subcategorias_auto_tipo
  ON public.subcategorias (auto_tipo) WHERE auto_gerado = true;


-- 2. Trigger BEFORE DELETE — bloqueia hard delete --------------
CREATE OR REPLACE FUNCTION public.subcategorias_block_auto_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.auto_gerado = true THEN
    RAISE EXCEPTION 'Subcategoria gerada automaticamente não pode ser deletada (tipo: %). Use a tela de origem (Contas / Configurações).', OLD.auto_tipo
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_subcategorias_block_auto_delete ON public.subcategorias;

CREATE TRIGGER trg_subcategorias_block_auto_delete
  BEFORE DELETE ON public.subcategorias
  FOR EACH ROW
  EXECUTE FUNCTION public.subcategorias_block_auto_delete();


-- 3. Trigger BEFORE UPDATE — bloqueia mudança de campos críticos
-- Campos críticos: nome, categoria_id, periodo, valor_variavel,
-- divida_id, projeto_id, tipo (Despesa/Receita).
--
-- Campos permitidos: vencimento_dia (cartão pode mudar venc.),
-- status (arquivar quando conta é arquivada), moeda, updated_at.
-- =============================================================
CREATE OR REPLACE FUNCTION public.subcategorias_block_auto_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Se a sub NÃO é auto-gerada, segue normal
  IF OLD.auto_gerado = false OR OLD.auto_gerado IS NULL THEN
    RETURN NEW;
  END IF;

  -- Auto-gerada — checa se algum campo crítico mudou
  IF NEW.nome           IS DISTINCT FROM OLD.nome
  OR NEW.categoria_id   IS DISTINCT FROM OLD.categoria_id
  OR NEW.periodo        IS DISTINCT FROM OLD.periodo
  OR NEW.valor_variavel IS DISTINCT FROM OLD.valor_variavel
  OR NEW.tipo           IS DISTINCT FROM OLD.tipo
  OR NEW.divida_id      IS DISTINCT FROM OLD.divida_id
  OR NEW.projeto_id     IS DISTINCT FROM OLD.projeto_id THEN
    RAISE EXCEPTION 'Subcategoria gerada automaticamente — campos críticos não podem ser editados (tipo: %).', OLD.auto_tipo
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subcategorias_block_auto_update ON public.subcategorias;

CREATE TRIGGER trg_subcategorias_block_auto_update
  BEFORE UPDATE ON public.subcategorias
  FOR EACH ROW
  EXECUTE FUNCTION public.subcategorias_block_auto_update();
