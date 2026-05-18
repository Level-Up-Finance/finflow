-- =============================================================
-- Fix: reset completo de dívidas e projetos de investimento
-- Corrige falha de FK da migration 0096 (transacoes.divida_id
-- não foi desvinculado antes do DELETE, causando rollback parcial).
-- =============================================================

BEGIN;

-- 1. Desvincular transacoes (FK que bloqueou o DELETE anterior)
UPDATE public.transacoes SET divida_id = NULL WHERE divida_id IS NOT NULL;

-- 2. Desvincular subcategorias
UPDATE public.subcategorias SET divida_id  = NULL WHERE divida_id  IS NOT NULL;
UPDATE public.subcategorias SET projeto_id = NULL WHERE projeto_id IS NOT NULL;

-- 3. Limpar histórico dependente
DELETE FROM public.pagamentos_divida_historico;
DELETE FROM public.divida_taxa_historico;

-- 4. Deletar TODAS as dívidas e projetos existentes
DELETE FROM public.dividas;
DELETE FROM public.projetos_investimento;

-- 5. Recriar uma dívida por subcategoria em categorias do grupo "dividas"
DO $$
DECLARE
  r      RECORD;
  new_id UUID;
BEGIN
  FOR r IN
    SELECT
      s.id          AS sub_id,
      s.user_id,
      s.nome,
      s.iniciado_em,
      s.conta_id,
      s.contato_id
    FROM public.subcategorias s
    JOIN public.categorias c ON c.id = s.categoria_id
    WHERE c.grupo = 'dividas'
    ORDER BY s.user_id, s.nome
  LOOP
    INSERT INTO public.dividas (
      user_id, nome, valor_total, valor_pago,
      data_inicio, status, tipo,
      conta_id, contato_id
    )
    VALUES (
      r.user_id,
      r.nome,
      0,
      0,
      COALESCE(r.iniciado_em, CURRENT_DATE),
      'Ativa',
      'a_pagar',
      r.conta_id,
      r.contato_id
    )
    RETURNING id INTO new_id;

    UPDATE public.subcategorias
    SET divida_id = new_id
    WHERE id = r.sub_id;
  END LOOP;
END $$;

-- 6. Recriar um projeto por subcategoria em categorias do grupo "investimentos"
DO $$
DECLARE
  r      RECORD;
  new_id UUID;
BEGIN
  FOR r IN
    SELECT
      s.id     AS sub_id,
      s.user_id,
      s.nome,
      s.contato_id
    FROM public.subcategorias s
    JOIN public.categorias c ON c.id = s.categoria_id
    WHERE c.grupo = 'investimentos'
    ORDER BY s.user_id, s.nome
  LOOP
    INSERT INTO public.projetos_investimento (
      user_id, nome, meta_valor, status, cor, contato_id
    )
    VALUES (
      r.user_id,
      r.nome,
      NULL,
      'ativo',
      '#6D5EF5',
      r.contato_id
    )
    RETURNING id INTO new_id;

    UPDATE public.subcategorias
    SET projeto_id = new_id
    WHERE id = r.sub_id;
  END LOOP;
END $$;

COMMIT;
