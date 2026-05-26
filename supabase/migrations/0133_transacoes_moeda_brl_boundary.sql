-- =============================================================
-- 0133 — Fronteira de moeda: transações vinculadas a pagamento são BRL
-- =============================================================
-- Contexto:
--   Antes do fix em transacao-pagamento-sync.js, o sync herdava a moeda
--   da subcategoria (USD/EUR/etc) ao criar a transação a partir de um
--   pagamento confirmado. Como pagamento.valor_real já está em BRL
--   (convertido no popover Pago/Transferido), isso causava a transação
--   mostrar moeda=USD com valor BRL — o display multiplicava por taxa
--   USD e exibia R$ 7503,90 onde deveria ser R$ 1.500.
--
-- Esta migration:
--   1) Normaliza todas as transações já vinculadas a um pagamento → moeda='BRL'
--   2) Não toca transações independentes (criadas manualmente em outra moeda)
--   3) Idempotente: pode rodar várias vezes sem efeito colateral
-- =============================================================

UPDATE transacoes
SET    moeda = 'BRL'
WHERE  pagamento_id IS NOT NULL
   AND moeda IS DISTINCT FROM 'BRL';

-- Diagnóstico opcional:
--   SELECT moeda, COUNT(*) FROM transacoes WHERE pagamento_id IS NOT NULL GROUP BY moeda;
