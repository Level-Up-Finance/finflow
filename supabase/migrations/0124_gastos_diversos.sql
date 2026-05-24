-- =============================================================
-- 0124_gastos_diversos.sql
--
-- Cria a categoria "Diversos" + subcategoria sistêmica "Gastos
-- diversos" por workspace. Essa sub agrega transações de despesa
-- soltas (sem pagamento_id vinculado) de contas não-cartão.
--
-- O valor_real dos pagamentos dessa sub é atualizado por JS
-- (lib/gastos-diversos.js) a cada save/delete de transação manual.
--
-- Características:
--   - auto_gerado = true     (blindado contra edição manual; trigger 0122)
--   - auto_tipo   = 'gastos_diversos'
--   - periodo     = 'Mensal'
--   - valor_variavel = true  (cada mês tem seu valor)
--   - tipo        = 'Despesa'
-- =============================================================

DO $$
DECLARE
  ws_id      uuid;
  ws_owner   uuid;
  cat_id     uuid;
  sub_id     uuid;
BEGIN
  -- Pra cada workspace existente, garante categoria + subcategoria
  FOR ws_id, ws_owner IN
    SELECT w.id, w.owner_id FROM public.workspaces w
  LOOP
    -- 1. Categoria "Diversos" (grupo='custo_vida')
    SELECT id INTO cat_id
      FROM public.categorias
     WHERE workspace_id = ws_id AND nome = 'Diversos'
     LIMIT 1;

    IF cat_id IS NULL THEN
      INSERT INTO public.categorias (
        user_id, workspace_id, nome, grupo, cor, ordem, is_default
      ) VALUES (
        ws_owner, ws_id, 'Diversos', 'custo_vida', '#94A3B8', 998, false
      )
      RETURNING id INTO cat_id;
    END IF;

    -- 2. Subcategoria sistêmica "Gastos diversos"
    SELECT id INTO sub_id
      FROM public.subcategorias
     WHERE workspace_id = ws_id
       AND auto_tipo = 'gastos_diversos'
     LIMIT 1;

    IF sub_id IS NULL THEN
      INSERT INTO public.subcategorias (
        user_id, workspace_id, created_by, categoria_id,
        nome, tipo, periodo, vencimento_dia, valor_base, valor_variavel,
        iniciado_em, moeda, status,
        auto_gerado, auto_tipo
      ) VALUES (
        ws_owner, ws_id, ws_owner, cat_id,
        'Gastos diversos', 'Despesa', 'Mensal', 1, 0, true,
        CURRENT_DATE, 'BRL', 'ativa',
        true, 'gastos_diversos'
      );
    END IF;
  END LOOP;
END $$;

-- Trigger: ao criar um workspace novo, cria também a sub "Gastos diversos"
-- (futuros workspaces ganham automaticamente)
CREATE OR REPLACE FUNCTION public.workspaces_ensure_gastos_diversos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cat_id uuid;
BEGIN
  -- 1. Categoria "Diversos"
  SELECT id INTO cat_id
    FROM public.categorias
   WHERE workspace_id = NEW.id AND nome = 'Diversos'
   LIMIT 1;

  IF cat_id IS NULL THEN
    INSERT INTO public.categorias (
      user_id, workspace_id, nome, grupo, cor, ordem, is_default
    ) VALUES (
      NEW.owner_id, NEW.id, 'Diversos', 'custo_vida', '#94A3B8', 998, false
    )
    RETURNING id INTO cat_id;
  END IF;

  -- 2. Subcategoria sistêmica
  IF NOT EXISTS (
    SELECT 1 FROM public.subcategorias
     WHERE workspace_id = NEW.id AND auto_tipo = 'gastos_diversos'
  ) THEN
    INSERT INTO public.subcategorias (
      user_id, workspace_id, created_by, categoria_id,
      nome, tipo, periodo, vencimento_dia, valor_base, valor_variavel,
      iniciado_em, moeda, status,
      auto_gerado, auto_tipo
    ) VALUES (
      NEW.owner_id, NEW.id, NEW.owner_id, cat_id,
      'Gastos diversos', 'Despesa', 'Mensal', 1, 0, true,
      CURRENT_DATE, 'BRL', 'ativa',
      true, 'gastos_diversos'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspaces_ensure_gastos_diversos ON public.workspaces;

CREATE TRIGGER trg_workspaces_ensure_gastos_diversos
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.workspaces_ensure_gastos_diversos();
