-- =============================================================
-- 0134 — Alinha pagamento.valor_real ao valor da transação vinculada
-- =============================================================
-- Contexto:
--   Durante o período do bug de moeda, alguns pagamentos foram salvos
--   com valor_real ligeiramente diferente da transação vinculada
--   (diferença de centavos por causa de conversões intermediárias com
--   taxas levemente distintas em pontos diferentes do fluxo).
--
--   Decisão (por instrução do usuário): a transação é o source of truth
--   — ela foi observada e validada na interface. O pagamento se alinha.
--
-- Esta migration:
--   1) Atualiza pagamentos.valor_real = transacao.valor onde diferirem
--   2) Roda apenas pra pagamentos que já tem transação vinculada
--   3) Idempotente — após rodar uma vez, não há mais nada a alinhar
--
-- Ordem: rodar APÓS 0133 (que normaliza moeda='BRL' nas transações).
-- =============================================================

UPDATE pagamentos p
SET    valor_real = t.valor
FROM   transacoes t
WHERE  t.pagamento_id = p.id
  AND  p.valor_real IS DISTINCT FROM t.valor;

-- Diagnóstico opcional (rodar antes pra ver quantos serão tocados):
--   SELECT p.id, p.valor_real AS pag_valor, t.valor AS tx_valor,
--          (t.valor - p.valor_real) AS diff
--   FROM   pagamentos p
--   JOIN   transacoes t ON t.pagamento_id = p.id
--   WHERE  p.valor_real IS DISTINCT FROM t.valor;
