// =============================================================
// FinFlow — Indicadores BCB (SELIC, CDI, IPCA)
// =============================================================
// Cache em memória (persiste durante a sessão da página).
let cache = null;
let inflight = null;

const ENDPOINT = 'https://brasilapi.com.br/api/taxas/v1';

/**
 * Acesso síncrono ao cache. Retorna null se ainda não houver fetch.
 * Útil pra fluxos sync que não podem aguardar — caller deve fazer
 * `await fetchIndicadores()` no warm-up da página antes.
 */
export function getCachedIndicadores() {
  return cache;
}

/**
 * Retorna { selic, cdi, ipca } anuais (% a.a.).
 * Faz uma única chamada por sessão de página.
 */
export async function fetchIndicadores() {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(ENDPOINT);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = await res.json();
      const find = (nome) => items.find((i) => i.nome.toLowerCase() === nome.toLowerCase())?.valor ?? null;
      cache = { selic: find('Selic'), cdi: find('CDI'), ipca: find('IPCA') };
      return cache;
    } catch (err) {
      console.warn('[indicadores] fetch falhou:', err);
      cache = { selic: null, cdi: null, ipca: null };
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Converte taxa anual para mensal (juros compostos).
 * @param {number} anual  - taxa em % a.a. (ex: 11.25 → 11.25%)
 * @returns {number}      - taxa em % a.m. (ex: 0.8950)
 */
export function anualToMensal(anual) {
  if (anual == null || isNaN(anual)) return null;
  const a = Number(anual) / 100;
  const m = Math.pow(1 + a, 1 / 12) - 1;
  return m * 100;
}

/**
 * Resolve taxa mensal a partir de tipo + spread.
 * @param {{ juros_tipo, juros_percentual, juros_spread }} cfg
 * @returns {Promise<number|null>}  - taxa em % a.m.
 */
export async function resolveTaxaMensal(cfg) {
  const tipo = cfg?.juros_tipo || 'manual_fixo';

  // Manual (fixo ou variável): usa o valor digitado
  if (tipo === 'manual_fixo' || tipo === 'manual_variavel' || tipo === 'manual') {
    return Number(cfg.juros_percentual ?? 0);
  }

  // Indexado: puxa do BrasilAPI
  if (['selic','selic_plus','cdi','cdi_plus','ipca','ipca_plus'].includes(tipo)) {
    const ind = await fetchIndicadores();
    const baseAnual = tipo.startsWith('selic') ? ind.selic
                    : tipo.startsWith('cdi')   ? ind.cdi
                    :                            ind.ipca;
    if (baseAnual == null) return Number(cfg.juros_percentual ?? 0);
    const baseMensal = anualToMensal(baseAnual);
    const spread = (tipo.endsWith('_plus') ? Number(cfg.juros_spread ?? 0) : 0);
    return Number((baseMensal + spread).toFixed(6));
  }

  return Number(cfg.juros_percentual ?? 0);
}
