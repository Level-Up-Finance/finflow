-- Fase 3: muda chave única de pagamentos de (sub+mes+bloco) → (sub+mes+data_vencimento).
-- Permite múltiplas ocorrências do mesmo compromisso no mesmo bloco (ex: faxineira semanal).

-- 1. Apaga pagamentos pendentes para regeração com a nova granularidade por data.
--    Pago/Transferido/Cancelado/Cartão são preservados.
DELETE FROM pagamentos
  WHERE status IN ('Agendado', 'A Transferir');

-- 2. Remove constraint antiga (1 row por sub+mes+bloco)
ALTER TABLE pagamentos
  DROP CONSTRAINT IF EXISTS pagamentos_unique_sub_month_bloco;

-- 3. Deduplica linhas restantes (Pago/Cancelado/etc.) que tenham o mesmo
--    (user_id, subcategoria_id, mes_ano, data_vencimento).
--    Prioridade: Pago > Transferido > Cartão > Cancelado.
--    Em caso de empate de status, mantém o row com menor id (mais antigo).
DELETE FROM pagamentos
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, subcategoria_id, mes_ano, data_vencimento
        ORDER BY
          CASE status
            WHEN 'Pago'        THEN 1
            WHEN 'Transferido' THEN 2
            WHEN 'Cartão'      THEN 3
            WHEN 'Cancelado'   THEN 4
            ELSE 5
          END,
          id
      ) AS rn
    FROM pagamentos
  ) ranked
  WHERE rn > 1
);

-- 4. Adiciona nova constraint (1 row por sub+mes+data_vencimento)
ALTER TABLE pagamentos
  ADD CONSTRAINT pagamentos_unique_sub_month_vencimento
  UNIQUE (user_id, subcategoria_id, mes_ano, data_vencimento);

-- 5. Atualiza índice de busca
DROP INDEX IF EXISTS idx_pagamentos_user_mes;
CREATE INDEX IF NOT EXISTS idx_pagamentos_user_mes
  ON public.pagamentos(user_id, mes_ano, bloco_quinzenal);
