// =============================================================
// FinFlow — Catálogo de bancos
// • 18 bancos curados com logo + cor de marca (Clearbit)
// • Lista completa de bancos brasileiros via BrasilAPI (sem logo)
// =============================================================

export const CURATED_BANKS = [
  { name: 'Itaú Unibanco',           domain: 'itau.com.br',                color: '#EC7000' },
  { name: 'Banco do Brasil',         domain: 'bb.com.br',                  color: '#FAE128' },
  { name: 'Bradesco',                domain: 'bradesco.com.br',            color: '#CC092F' },
  { name: 'Caixa Econômica Federal', domain: 'caixa.gov.br',               color: '#005CA9' },
  { name: 'Santander Brasil',        domain: 'santander.com.br',           color: '#EC0000' },
  { name: 'Nubank',                  domain: 'nubank.com.br',              color: '#820AD1' },
  { name: 'C6 Bank',                 domain: 'c6bank.com.br',              color: '#1E1E1E' },
  { name: 'Inter',                   domain: 'bancointer.com.br',          color: '#FF6900' },
  { name: 'Neon',                    domain: 'neon.com.br',                color: '#00B5A0' },
  { name: 'PagBank',                 domain: 'pagbank.com.br',             color: '#008C39' },
  { name: 'PicPay',                  domain: 'picpay.com',                 color: '#21C25E' },
  { name: 'Genial',                  domain: 'genial.com.br',              color: '#1A1A2E' },
  { name: 'Rico Investimentos',      domain: 'rico.com.vc',                color: '#00B7E1' },
  { name: 'BTG Pactual',             domain: 'btgpactual.com',             color: '#00377A' },
  { name: 'XP Investimentos',        domain: 'xpi.com.br',                 color: '#000000' },
  { name: 'Clear Corretora',         domain: 'clear.com.br',               color: '#00B7E1' },
  { name: 'NuInvest',                domain: 'nuinvest.com.br',            color: '#820AD1' },
  { name: 'Genial Investimentos',    domain: 'genialinvestimentos.com.br', color: '#1A1A2E' },
];

const BRASIL_API_URL = 'https://brasilapi.com.br/api/banks/v1';
const CACHE_KEY = 'finflow:banks-cache';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

let allBanksCache = null;

/**
 * URL do logo de um banco.
 * Usa icon.horse — gratuito, sem chave, sem rate limit.
 * (Clearbit Logo API foi descontinuada em 2025.)
 */
export function logoUrl(domain) {
  if (!domain) return null;
  return `https://icon.horse/icon/${domain}`;
}

/**
 * Procura um banco curado pelo nome (case-insensitive).
 * Retorna o objeto com domain + color, ou null.
 */
export function findBank(name) {
  if (!name) return null;
  const lc = String(name).trim().toLowerCase();
  return CURATED_BANKS.find((b) => b.name.toLowerCase() === lc) || null;
}

/**
 * Busca a lista completa de bancos brasileiros via BrasilAPI.
 * Cacheia em localStorage com TTL de 7 dias.
 */
export async function fetchAllBanks() {
  if (allBanksCache) return allBanksCache;

  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      allBanksCache = cached.banks;
      return allBanksCache;
    }
  } catch { /* ignore */ }

  try {
    const res = await fetch(BRASIL_API_URL);
    if (!res.ok) throw new Error(`BrasilAPI ${res.status}`);
    const data = await res.json();
    allBanksCache = data.filter((b) => b && b.name);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ banks: allBanksCache, ts: Date.now() }));
    } catch { /* quota exceeded */ }
    return allBanksCache;
  } catch (err) {
    console.warn('[banks] BrasilAPI indisponível:', err.message);
    return [];
  }
}

/**
 * Pesquisa bancos por nome — combina os curados (com logo) e a lista BrasilAPI.
 * @param {string} query  Texto digitado pelo usuário
 * @param {number} limit  Máximo de sugestões retornadas
 * @returns {Promise<Array<{name, domain?, color?, code?, source}>>}
 */
export async function searchBanks(query, limit = 12) {
  const q = String(query || '').trim().toLowerCase();

  // Sem query: mostra todos os curados
  if (!q) return CURATED_BANKS.slice(0, limit).map((b) => ({ ...b, source: 'curated' }));

  // Curados que dão match
  const curated = CURATED_BANKS
    .filter((b) => b.name.toLowerCase().includes(q))
    .map((b) => ({ ...b, source: 'curated' }));

  // BrasilAPI matches (excluindo duplicatas com curados)
  const all = await fetchAllBanks();
  const others = all
    .filter((b) => b.name.toLowerCase().includes(q))
    .filter((b) => !curated.some((c) => c.name.toLowerCase() === b.name.toLowerCase()))
    .slice(0, Math.max(0, limit - curated.length))
    .map((b) => ({ name: b.name, code: b.code, source: 'brasilapi' }));

  return [...curated, ...others];
}
