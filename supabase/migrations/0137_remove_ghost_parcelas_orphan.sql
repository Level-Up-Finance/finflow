-- =============================================================
-- 0137 — Cleanup completo de transações fantasmas órfãs
-- =============================================================
-- Por que 0136 não pegou tudo:
--   A migration 0097_fix_reset_dividas_projetos.sql rodou antes e fez:
--     UPDATE transacoes SET divida_id = NULL WHERE divida_id IS NOT NULL;
--   Isso apagou o vínculo das transações criadas pelo saveParcela legado
--   (descrição "Parcela X/Y — <divida>"). Quando 0136 filtrou por
--   `divida_id IS NOT NULL`, perdeu ~todas as ghosts antigas — elas
--   ficaram órfãs (sem divida_id) mas com a descrição intacta.
--
-- Esta migration usa pattern matching na descrição como identificador
-- de fallback, com salvaguardas pra não tocar transações legítimas.
--
-- O que é considerado fantasma:
--   • Descrição começa com "Parcela " ou "Parcelas " seguido de número
--     (ex: "Parcela 11/20 — Tiguan", "Parcelas 3–5/60 — Financiamento")
--   • OU divida_id IS NOT NULL (cobre ghosts mais recentes)
--   • E data < cutoff (decisão do usuário: 2026-05-01)
--   • E SEM vínculo legítimo (pagamento_id NULL, transferencia_par_id NULL)
--
-- Por que essas salvaguardas:
--   • pagamento_id IS NULL: preserva transações criadas via Pagamentos >
--     popover "Marcar como Pago" (estas refletem movimentos reais)
--   • transferencia_par_id IS NULL: preserva transferências reais (par
--     saída/entrada de caixinha resgate, transferências manuais)
--
-- Idempotente — após rodar uma vez, restam zero fantasmas com padrão Parcela.
-- =============================================================

-- Diagnóstico antes (rodar isolado pra ver o que será deletado):
--   SELECT id, data, descricao, valor, conta_id, divida_id, pagamento_id
--   FROM   transacoes
--   WHERE  data < '2026-05-01'
--     AND  pagamento_id IS NULL
--     AND  transferencia_par_id IS NULL
--     AND  (
--           divida_id IS NOT NULL
--        OR descricao ~ '^Parcela[s]?\s+\d+(\s*[–-]\s*\d+)?\s*/\s*\d+'
--        OR descricao ILIKE 'Aporte %'
--     )
--   ORDER BY data;

DELETE FROM transacoes
WHERE  data < '2026-05-01'
  AND  pagamento_id IS NULL              -- preserva sync via Pagamentos
  AND  transferencia_par_id IS NULL      -- preserva transferências
  AND  (
        divida_id IS NOT NULL
     OR descricao ~ '^Parcela[s]?\s+\d+(\s*[–-]\s*\d+)?\s*/\s*\d+'
     OR descricao ILIKE 'Aporte %'        -- defensivo: nunca vimos esse padrão
                                          --            mas se algum legado criar, pega
  );

-- Verificação pós-execução (deve retornar 0):
--   SELECT COUNT(*) FROM transacoes
--   WHERE  data < '2026-05-01'
--     AND  descricao ~ '^Parcela[s]?\s+\d+';
