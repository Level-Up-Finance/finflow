-- =============================================================
-- 0136 — Remove transações fantasmas geradas por cadastro retroativo
--        de pagamentos de dívida
-- =============================================================
-- Contexto:
--   Até esta migration, o modal "Registrar pagamento de parcela" em
--   dividas.js criava 3 coisas: registro em pagamentos_divida_historico,
--   UPDATE do saldo da dívida, e uma transação em `transacoes` linkada
--   por divida_id.
--
--   Pra pagamentos retroativos (cadastros de histórico ao iniciar uso
--   do app), a 3a parte corrompe o saldo das contas — o dinheiro já
--   tinha saído da conta real no passado, criar transação agora gera
--   double-counting (saldo do FinFlow ≠ saldo do banco).
--
--   Decisão (system-design discussion): modal não cria mais transação
--   (commit que acompanha esta migration). Pra movimento real de caixa,
--   o usuário usa Pagamentos > popover "Marcar como Pago".
--
-- Cleanup:
--   Deleta transações com divida_id IS NOT NULL E data < 2026-05-01.
--   Cutoff escolhido pelo usuário: tudo de maio/2026 em diante são
--   pagamentos "reais" da era de uso atual do FinFlow.
--
-- Diagnóstico (rodar antes pra ver o que será deletado):
--   SELECT id, data, valor, descricao, divida_id, conta_id
--   FROM   transacoes
--   WHERE  divida_id IS NOT NULL
--     AND  data < '2026-05-01'
--   ORDER  BY data;
--
-- Idempotente: após rodar uma vez, restam zero transações fantasmas.
-- =============================================================

DELETE FROM transacoes
WHERE  divida_id IS NOT NULL
  AND  data < '2026-05-01';
