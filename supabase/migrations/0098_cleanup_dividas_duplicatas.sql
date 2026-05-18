-- =============================================================
-- Cleanup: zera "31.344 - DAS" + remove duplicatas por nome
-- =============================================================
-- Roda em DUAS etapas separadas — leia antes de executar.
--
-- ETAPA 1: Zerar "31.344 - DAS"
--   Seta valor_total=0 e valor_pago=0 → vai para o grupo
--   "Sem Configuração" no painel. O compromisso vinculado
--   é preservado.
--
-- ETAPA 2: Remover duplicatas de dívida por nome
--   Para cada nome que aparece mais de uma vez, mantém a
--   dívida com maior valor_total (a configurada pelo usuário)
--   e deleta a(s) extra(s) com valor_total=0.
--   Antes de deletar: desvincula subcategorias e transações.
-- =============================================================

-- ─── ETAPA 1 ────────────────────────────────────────────────
UPDATE public.dividas
SET    valor_total = 0,
       valor_pago  = 0
WHERE  nome = '31.344 - DAS';

-- ─── ETAPA 2 ────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Para cada nome que tem duplicatas, guarda o id do "bom"
  -- (maior valor_total) e deleta os outros.
  FOR r IN
    SELECT
      nome,
      user_id,
      -- id que vamos MANTER (o com maior valor_total; empate: mais recente)
      (
        SELECT id FROM public.dividas d2
        WHERE  d2.nome    = d.nome
          AND  d2.user_id = d.user_id
        ORDER  BY d2.valor_total DESC, d2.created_at DESC NULLS LAST
        LIMIT  1
      ) AS keep_id
    FROM   public.dividas d
    GROUP  BY nome, user_id
    HAVING COUNT(*) > 1
  LOOP
    -- Desvincular transações das cópias extras
    UPDATE public.transacoes
    SET    divida_id = NULL
    WHERE  divida_id IN (
      SELECT id FROM public.dividas
      WHERE  nome    = r.nome
        AND  user_id = r.user_id
        AND  id      <> r.keep_id
    );

    -- Desvincular subcategorias das cópias extras
    UPDATE public.subcategorias
    SET    divida_id = NULL
    WHERE  divida_id IN (
      SELECT id FROM public.dividas
      WHERE  nome    = r.nome
        AND  user_id = r.user_id
        AND  id      <> r.keep_id
    );

    -- Deletar histórico das cópias extras
    DELETE FROM public.pagamentos_divida_historico
    WHERE  divida_id IN (
      SELECT id FROM public.dividas
      WHERE  nome    = r.nome
        AND  user_id = r.user_id
        AND  id      <> r.keep_id
    );
    DELETE FROM public.divida_taxa_historico
    WHERE  divida_id IN (
      SELECT id FROM public.dividas
      WHERE  nome    = r.nome
        AND  user_id = r.user_id
        AND  id      <> r.keep_id
    );

    -- Deletar as cópias extras
    DELETE FROM public.dividas
    WHERE  nome    = r.nome
      AND  user_id = r.user_id
      AND  id      <> r.keep_id;

    RAISE NOTICE 'Duplicata removida: % (manteve %)', r.nome, r.keep_id;
  END LOOP;
END $$;
