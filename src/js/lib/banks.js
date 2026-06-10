// =============================================================
// FinFlow — Catálogo de bancos
// • 18 bancos curados com logo local (ícone oficial da App Store,
//   256×256, em /public/logo/banks/{domain}.png) + cor de marca
// • aliases: nomes alternativos pra matching de contas existentes
//   ("Caixa" → Caixa Econômica Federal, "Cartão Nubank" → Nubank)
// • Lista completa de bancos brasileiros via BrasilAPI (sem logo)
// =============================================================

export const CURATED_BANKS = [
  { name: 'Itaú Unibanco',           domain: 'itau.com.br',                color: '#EC7000', aliases: ['itaú', 'itau', 'banco itaú', 'banco itau'] },
  { name: 'Banco do Brasil',         domain: 'bb.com.br',                  color: '#FAE128', aliases: ['bb'] },
  { name: 'Bradesco',                domain: 'bradesco.com.br',            color: '#CC092F', aliases: ['banco bradesco'] },
  { name: 'Caixa Econômica Federal', domain: 'caixa.gov.br',               color: '#005CA9', aliases: ['caixa', 'cef', 'caixa econômica', 'caixa economica', 'caixa economica federal'] },
  { name: 'Santander Brasil',        domain: 'santander.com.br',           color: '#EC0000', aliases: ['santander', 'banco santander'] },
  { name: 'Nubank',                  domain: 'nubank.com.br',              color: '#820AD1', aliases: ['nu'] },
  { name: 'C6 Bank',                 domain: 'c6bank.com.br',              color: '#1E1E1E', aliases: ['c6'] },
  { name: 'Inter',                   domain: 'bancointer.com.br',          color: '#FF6900', aliases: ['banco inter'] },
  { name: 'Neon',                    domain: 'neon.com.br',                color: '#00B5A0' },
  { name: 'PagBank',                 domain: 'pagbank.com.br',             color: '#008C39', aliases: ['pagseguro', 'pag bank'] },
  { name: 'PicPay',                  domain: 'picpay.com',                 color: '#21C25E', aliases: ['pic pay'] },
  { name: 'Genial',                  domain: 'genial.com.br',              color: '#1A1A2E' },
  { name: 'Rico Investimentos',      domain: 'rico.com.vc',                color: '#00B7E1', aliases: ['rico'] },
  { name: 'BTG Pactual',             domain: 'btgpactual.com',             color: '#00377A', aliases: ['btg'] },
  { name: 'XP Investimentos',        domain: 'xpi.com.br',                 color: '#000000', aliases: ['xp'] },
  { name: 'Clear Corretora',         domain: 'clear.com.br',               color: '#00B7E1', aliases: ['clear'] },
  { name: 'NuInvest',                domain: 'nuinvest.com.br',            color: '#820AD1', aliases: ['nu invest'] },
  { name: 'Genial Investimentos',    domain: 'genialinvestimentos.com.br', color: '#1A1A2E' },
];

// Domínios com logo local em /public/logo/banks/ (servido na raiz pelo Vite)
const LOCAL_LOGO_DOMAINS = new Set(CURATED_BANKS.map((b) => b.domain));

const BRASIL_API_URL = 'https://brasilapi.com.br/api/banks/v1';
const CACHE_KEY = 'finflow:banks-cache';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

let allBanksCache = null;

/**
 * URL do logo de um banco.
 * Curados: asset local (ícone oficial da App Store, nítido em qualquer
 * tamanho, zero dependência externa). Demais domínios: icon.horse como
 * fallback (gratuito, sem chave — qualidade varia).
 */
export function logoUrl(domain) {
  if (!domain) return null;
  if (LOCAL_LOGO_DOMAINS.has(domain)) return `/logo/banks/${domain}.png`;
  return `https://icon.horse/icon/${domain}`;
}

/**
 * Procura um banco curado pelo nome da conta (case-insensitive).
 *
 * Estratégia de match, da mais forte pra mais fraca:
 *  1. Igualdade exata com o nome ou um alias ("Caixa" → Caixa Econômica)
 *  2. O nome da conta CONTÉM o nome/alias como palavra(s) inteira(s)
 *     ("Cartão Nubank" → Nubank). Word-boundary evita falso positivo
 *     ("Conta Internacional" NÃO vira Inter). Empate: vence o match
 *     mais longo ("Genial Investimentos" > "Genial").
 *
 * Retorna o objeto com domain + color, ou null.
 */
export function findBank(name) {
  if (!name) return null;
  const lc = String(name).trim().toLowerCase();
  if (!lc) return null;

  let best = null;
  let bestLen = 0;
  for (const b of CURATED_BANKS) {
    for (const cand of [b.name, ...(b.aliases || [])]) {
      const c = cand.toLowerCase();
      if (lc === c) return b; // exato ganha na hora
      if (c.length > bestLen && containsAsWords(lc, c)) {
        best = b;
        bestLen = c.length;
      }
    }
  }
  return best;
}

// true se `phrase` aparece em `text` como sequência de palavras inteiras.
// Split por tudo que não é letra/dígito (acentos preservados como letras).
function containsAsWords(text, phrase) {
  const tw = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const pw = phrase.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (pw.length === 0 || pw.length > tw.length) return false;
  for (let i = 0; i <= tw.length - pw.length; i++) {
    if (pw.every((w, j) => tw[i + j] === w)) return true;
  }
  return false;
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
