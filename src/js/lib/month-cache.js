// =============================================================
// FinFlow — Month Preparation Cache
//
// Página Pagamentos roda uma cascata de ensures (orcamento_geral,
// pagamentos, faturas, gastos diversos) ao carregar cada mês.
// Esses ensures são IDEMPOTENTES — rodar 2x não causa side effect —
// mas custa 5-15 round-trips de rede por load.
//
// Este cache rastreia quais meses já foram preparados na sessão
// atual. Se já preparou '2026-05', próxima navegação pula ensures.
//
// Invalidação:
//   - markMonthAsStale(mesAno) — após mutação local (pagamento marcado pago, etc)
//   - markAllAsStale() — após mutação global (sub criada/editada/arquivada)
//   - markFutureAsStale(fromMesAno) — após mutação que afeta meses futuros
//
// Lifecycle:
//   - Cache vive em memória do módulo (sessão browser)
//   - Limpa naturalmente em hard refresh / mudança de workspace
//
// Uso típico em pagamentos.js:
//   if (!isMonthPrepared(mesAno)) {
//     await ensureSubcategoriasFaturas();
//     await ensureOrcamentoForMonth();
//     // ... outras ensures
//     markMonthAsPrepared(mesAno);
//   }
//
// Uso em saves (compromissos.js, pagamentos.js, etc):
//   markAllAsStale();  // depois de mutação que pode afetar qualquer mês
// =============================================================

const preparedMonths = new Set();

/**
 * Marca um mês como "ensures já rodaram nesta sessão".
 * @param {string} mesAno — 'YYYY-MM-01'
 */
export function markMonthAsPrepared(mesAno) {
  if (!mesAno) return;
  preparedMonths.add(mesAno);
}

/**
 * Verifica se ensures já rodaram pra esse mês.
 * @param {string} mesAno — 'YYYY-MM-01'
 * @returns {boolean}
 */
export function isMonthPrepared(mesAno) {
  return preparedMonths.has(mesAno);
}

/**
 * Invalida um mês específico. Chamar após mutação que afeta apenas
 * esse mês (ex: marcar pagamento como pago).
 */
export function markMonthAsStale(mesAno) {
  if (!mesAno) return;
  preparedMonths.delete(mesAno);
}

/**
 * Invalida todos os meses. Chamar após mutação que pode afetar
 * vários meses (ex: criar/editar/arquivar subcategoria, criar conta).
 *
 * Mais conservador que markFutureAsStale — usar quando não tem
 * certeza do escopo da mudança.
 */
export function markAllAsStale() {
  preparedMonths.clear();
}

/**
 * Invalida apenas meses >= fromMesAno. Chamar após mutação que afeta
 * o mês atual + futuros (ex: orçamento de uma sub editado).
 *
 * @param {string} fromMesAno — 'YYYY-MM-01' (inclusivo)
 */
export function markFutureAsStale(fromMesAno) {
  if (!fromMesAno) return;
  for (const m of [...preparedMonths]) {
    if (m >= fromMesAno) preparedMonths.delete(m);
  }
}

/**
 * Debug helper.
 */
export function _getPreparedMonths() {
  return [...preparedMonths];
}
