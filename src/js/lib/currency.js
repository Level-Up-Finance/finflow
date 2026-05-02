// =============================================================
// FinFlow — Câmbio (Frankfurter API + cache + freeze)
// =============================================================
import { supabase } from './supabase.js';
import { CURRENCY_REFRESH_MS } from './config.js';

// Em 2026, Frankfurter migrou de api.frankfurter.app pra api.frankfurter.dev/v1.
// O domínio antigo retorna 301 redirect que pode ser bloqueado por CORS.
const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1/latest';
const CACHE_TTL_MS = CURRENCY_REFRESH_MS;
const memCache = new Map(); // key: "FROM_TO" → { taxa, ts }

/**
 * Busca a taxa de câmbio entre duas moedas. Usa cache de 5 minutos
 * em memória + fallback no localStorage se a API falhar.
 *
 * @param {string} from  Moeda origem (ex: 'USD')
 * @param {string} to    Moeda destino (ex: 'BRL')
 * @returns {Promise<number>}  taxa: 1 from = X to
 */
export async function fetchExchangeRate(from, to) {
  if (from === to) return 1;
  const key = `${from}_${to}`;
  const now = Date.now();

  const cached = memCache.get(key);
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.taxa;

  try {
    const res = await fetch(`${FRANKFURTER_BASE}?from=${from}&to=${to}`);
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
    const data = await res.json();
    const taxa = data?.rates?.[to];
    if (typeof taxa !== 'number') throw new Error('Taxa inválida');

    memCache.set(key, { taxa, ts: now });
    try {
      localStorage.setItem(`fx:${key}`, JSON.stringify({ taxa, ts: now }));
    } catch { /* ignore quota errors */ }

    return taxa;
  } catch (err) {
    console.warn('[fetchExchangeRate] usando fallback:', err.message);
    const stored = localStorage.getItem(`fx:${key}`);
    if (stored) {
      const { taxa } = JSON.parse(stored);
      return taxa;
    }
    throw err;
  }
}

/**
 * Busca o câmbio congelado pra um mês específico no orcamento_geral.
 * @returns {Promise<number|null>}  null se ainda não congelado.
 */
export async function getFrozenRate(mesAno, moeda) {
  if (moeda === 'BRL') return null;
  const { data } = await supabase
    .from('orcamento_geral')
    .select('cambio_travado')
    .eq('mes_ano', mesAno)
    .eq('moeda', moeda)
    .not('cambio_travado', 'is', null)
    .limit(1)
    .maybeSingle();
  return data?.cambio_travado ?? null;
}

/**
 * Converte um valor em moeda estrangeira para BRL.
 * Se houver câmbio congelado pro mes_ano, usa esse valor; senão usa a taxa live.
 */
export async function calcBRLValue(valor, moeda, mesAno) {
  if (moeda === 'BRL') return valor;
  const frozen = await getFrozenRate(mesAno, moeda);
  if (frozen) return valor * frozen;
  const live = await fetchExchangeRate(moeda, 'BRL');
  return valor * live;
}

/**
 * Inicia setInterval que executa callback a cada N ms (default 5min).
 * @returns {number}  intervalId, pra clearInterval depois
 */
export function startCurrencyAutoRefresh(callback, intervalMs = CACHE_TTL_MS) {
  return setInterval(callback, intervalMs);
}

/**
 * Limpa caches (útil em dev / testes).
 */
export function clearCurrencyCache() {
  memCache.clear();
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('fx:')) localStorage.removeItem(key);
  }
}
