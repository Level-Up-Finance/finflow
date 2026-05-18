// =============================================================
// FinFlow — Wrapper da API FIPE (parallelum.com.br)
// =============================================================
// API gratuita, sem chave. Rate limit alto o suficiente p/ uso humano.
// Endpoints:
//   /carros/marcas
//   /carros/marcas/:marca/modelos
//   /carros/marcas/:marca/modelos/:modelo/anos
//   /carros/marcas/:marca/modelos/:modelo/anos/:ano
//
// Tipos suportados pela API: 'carros', 'motos', 'caminhoes'.
// MVP do FinFlow usa apenas 'carros'.
//
// Cache: localStorage com TTL de 24h para reduzir requests.
// Cache key: fipe:<endpoint-hash>
// =============================================================

const BASE = 'https://parallelum.com.br/fipe/api/v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Fetch com cache localStorage.
 * @param {string} path  ex: '/carros/marcas'
 * @returns {Promise<any>}
 */
async function cachedFetch(path) {
  const key = `fipe:${path}`;
  const now = Date.now();

  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (now - ts < CACHE_TTL_MS) return data;
    }
  } catch { /* ignore parse/quota errors */ }

  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`FIPE ${res.status}: ${path}`);
  const data = await res.json();

  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: now }));
  } catch { /* localStorage cheio — ignore */ }

  return data;
}

/**
 * Lista todas as marcas de carros.
 * @returns {Promise<Array<{codigo: string, nome: string}>>}
 */
export function listMarcas() {
  return cachedFetch('/carros/marcas');
}

/**
 * Lista modelos de uma marca.
 * @param {string} codigoMarca
 * @returns {Promise<{modelos: Array<{codigo: number, nome: string}>}>}
 */
export function listModelos(codigoMarca) {
  return cachedFetch(`/carros/marcas/${codigoMarca}/modelos`);
}

/**
 * Lista anos disponíveis para um modelo.
 * @param {string} codigoMarca
 * @param {string|number} codigoModelo
 * @returns {Promise<Array<{codigo: string, nome: string}>>}
 */
export function listAnos(codigoMarca, codigoModelo) {
  return cachedFetch(`/carros/marcas/${codigoMarca}/modelos/${codigoModelo}/anos`);
}

/**
 * Busca o valor FIPE de um carro específico (marca + modelo + ano).
 * @param {string} codigoMarca
 * @param {string|number} codigoModelo
 * @param {string} codigoAno    ex: '2020-1' (ano + tipo_combustivel)
 * @returns {Promise<{Valor: string, Marca: string, Modelo: string, AnoModelo: number, Combustivel: string, CodigoFipe: string, MesReferencia: string, TipoVeiculo: number, SiglaCombustivel: string}>}
 */
export function getValor(codigoMarca, codigoModelo, codigoAno) {
  return cachedFetch(`/carros/marcas/${codigoMarca}/modelos/${codigoModelo}/anos/${codigoAno}`);
}

/**
 * Parseia string FIPE "R$ 65.000,00" para number 65000.
 * @param {string} valorStr
 * @returns {number|null}
 */
export function parseFipeValor(valorStr) {
  if (!valorStr) return null;
  // Remove "R$ ", espaços e pontos de milhares; troca vírgula por ponto.
  const cleaned = String(valorStr)
    .replace(/R\$\s*/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}
