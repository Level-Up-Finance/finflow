-- =============================================================
-- 0135 — Normaliza pagamentos pra BRL (boundary rule)
-- =============================================================
-- Contexto:
--   A partir do commit que muda ensurePagamentosForMonth, pagamentos
--   nascem em BRL na criação (taxa aplicada no momento). Pagamentos
--   legacy em moeda estrangeira precisam ser normalizados pra BRL,
--   senão o display (que NÃO converte mais) mostraria o valor RAW da
--   moeda estrangeira com prefixo R$ — erro grosseiro.
--
-- Estratégia em duas fases:
--
-- Phase A — "label wrong, data right":
--   Pagamentos com pag.moeda <> 'BRL' MAS o valor_real já bate com a
--   transação vinculada (que está em BRL pós-0133). Apenas flipa
--   pag.moeda='BRL'. Sem multiplicação — dados já corretos.
--
-- Phase B — "true non-BRL legacy":
--   Pagamentos com pag.moeda <> 'BRL' que NÃO se enquadram em Phase A
--   (sem transação vinculada, ou tx em moeda estrangeira igual ao pag,
--   ou pago antes do popover-em-BRL existir). Multiplica valor_previsto
--   e valor_real por taxa de câmbio atual e flipa moeda='BRL'.
--
--   Trade-off aceito: taxas usadas são as do momento desta migration,
--   não as históricas (que não temos). Pagamentos futuros não pagos:
--   o usuário ajusta no popover na hora de marcar Pago.
--
--   Pares caixinha (saída negativa + entrada positiva): excluídos
--   naturalmente porque já são criados em BRL (lib/gastos-diversos.js
--   + lib/faturas-cartao.js + contas.js post-fix).
--
-- Idempotente — após rodar uma vez, restam zero rows com moeda <> 'BRL'.
-- =============================================================

-- ============= PHASE A =============
-- Pagamentos onde o valor já está correto em BRL mas a moeda continua estrangeira
UPDATE pagamentos p
SET    moeda = 'BRL'
FROM   transacoes t
WHERE  t.pagamento_id = p.id
  AND  p.moeda IS DISTINCT FROM 'BRL'
  AND  t.moeda = 'BRL'
  AND  ROUND(p.valor_real::numeric, 2) = ROUND(t.valor::numeric, 2);

-- ============= PHASE B =============
-- Pagamentos legacy em moeda estrangeira — multiplica por taxa e flipa
WITH rates (moeda, taxa) AS (
  VALUES
    ('USD', 5.0435::numeric),
    ('EUR', 5.86167::numeric),
    ('GBP', 6.78101::numeric)
)
UPDATE pagamentos p
SET    valor_previsto = ROUND((p.valor_previsto * r.taxa)::numeric, 2),
       valor_real     = ROUND((p.valor_real     * r.taxa)::numeric, 2),
       moeda          = 'BRL'
FROM   rates r
WHERE  p.moeda = r.moeda;

-- ============= DIAGNÓSTICO =============
-- Esperado: zero rows após executar Phase A + B.
-- SELECT id, moeda, valor_previsto, valor_real
-- FROM   pagamentos
-- WHERE  moeda IS DISTINCT FROM 'BRL';
