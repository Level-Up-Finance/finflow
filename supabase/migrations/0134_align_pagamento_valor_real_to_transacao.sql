-- =============================================================
-- 0134 — Alinha pagamento.valor_real ao valor da transação vinculada
--        (apenas para casos de "currency raw stored" — bug histórico)
-- =============================================================
-- Contexto:
--   Durante o período do bug de moeda, alguns pagamentos foram salvos
--   com valor_real no valor RAW da moeda original (ex: USD 3603.04)
--   enquanto a transação vinculada já tinha o BRL convertido
--   (ex: 18024.58). O display dos pagamentos converte na hora, mas o
--   storage está sujo. Esta migration alinha tudo a BRL.
--
--   Decisão (por instrução do usuário): a transação é o source of truth.
--
-- Não toca pares caixinha resgate:
--   Existem pagamentos com valor_real negativo (saída de caixinha) que
--   formam par com um positivo (entrada). O constraint
--   pagamentos_unique_sub_month_vencimento é PARCIAL (vale só pra
--   valor_real >= 0), então os negativos coexistem legitimamente. Se
--   convertêssemos o negativo pra positivo aqui, violaria a uniqueness.
--   Filtro SIGN() = SIGN() pula esses pares.
--
-- Idempotente — após rodar uma vez, nada mais a alinhar.
-- =============================================================

UPDATE pagamentos p
SET    valor_real = t.valor
FROM   transacoes t
WHERE  t.pagamento_id = p.id
  AND  p.valor_real IS DISTINCT FROM t.valor
  AND  SIGN(p.valor_real) = SIGN(t.valor);    -- pula pares caixinha

-- Diagnóstico opcional (antes de rodar — mostra o que SERÁ tocado):
--   SELECT p.id, p.valor_real AS pag_valor, t.valor AS tx_valor,
--          (t.valor - p.valor_real) AS diff
--   FROM   pagamentos p
--   JOIN   transacoes t ON t.pagamento_id = p.id
--   WHERE  p.valor_real IS DISTINCT FROM t.valor
--     AND  SIGN(p.valor_real) = SIGN(t.valor);

-- Diagnóstico do que NÃO será tocado (pares caixinha legítimos):
--   SELECT p.id, p.valor_real, t.valor
--   FROM   pagamentos p
--   JOIN   transacoes t ON t.pagamento_id = p.id
--   WHERE  SIGN(p.valor_real) <> SIGN(t.valor);
