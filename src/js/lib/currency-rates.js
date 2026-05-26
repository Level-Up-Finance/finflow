// =============================================================
// FinFlow — Currency Rates (shared)
//
// Cache compartilhado de taxas de câmbio + helper de conversão pra BRL.
// Antes desse módulo, cada página (pagamentos.js, orcamento.js) tinha
// seu próprio ratesMap + convertToBRL — duplicação.
//
// Convenção do sistema:
//   - DISPLAY currency = BRL (moeda principal do usuário)
//   - convertToBRL é usado em renderização pra mostrar valores em BRL
//   - Storage de valor_real / transacoes.valor: sempre em BRL (novos)
//     ou na moeda original (legacy) — convertToBRL trata os 2 casos.
// =============================================================
import { fetchExchangeRate } from './currency.js';

// Cache em memória do módulo. Único pra toda a aplicação.
const ratesMap = new Map(); // 'USD' → 5.15

/**
 * Refresh do cache pras moedas usadas em uma lista de items.
 * @param {Array<{moeda?: string}>} items
 */
export async function refreshRatesFor(items) {
  const used = [...new Set(
    (items || [])
      .map((it) => it?.moeda)
      .filter((m) => m && m !== 'BRL')
  )];
  if (used.length === 0) return;

  await Promise.all(used.map(async (c) => {
    try {
      const rate = await fetchExchangeRate(c, 'BRL');
      ratesMap.set(c, rate);
    } catch (err) {
      console.warn('[refreshRatesFor] falhou pra', c, err);
    }
  }));
}

/**
 * Converte um valor em sua moeda original pra BRL.
 * @param {number} value
 * @param {string} currency - 'BRL', 'USD', 'EUR', etc
 * @returns {number|null} valor em BRL ou null se câmbio indisponível
 */
export function convertToBRL(value, currency) {
  if (!currency || currency === 'BRL') return Number(value) || 0;
  const rate = ratesMap.get(currency);
  if (!rate) return null;
  return (Number(value) || 0) * rate;
}

/**
 * Acesso direto ao Map (use com cuidado — pra leitura/escrita custom).
 */
export function getRatesMap() {
  return ratesMap;
}
