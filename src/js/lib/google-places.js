// =============================================================
// FinFlow — Wrapper da Google Places API (New)
// =============================================================
// Docs: https://developers.google.com/maps/documentation/places/web-service
//
// Setup necessário (uma vez):
//   1. Google Cloud Console → criar projeto
//   2. APIs & Services → Library → "Places API (New)" → Enable
//   3. Credentials → Create API key
//   4. Restringir a API key:
//      • Application restrictions → HTTP referrers
//      • Adicionar: localhost:*, *.vercel.app, finflow.vercel.app, etc.
//      • API restrictions → "Places API (New)"
//   5. Adicionar no .env.local e nas env vars do Vercel:
//      VITE_GOOGLE_PLACES_KEY=AIza...
//
// Custos: $200/mês de créditos gratuitos (≈17k buscas/mês). Acima
// disso ~$0.017 por searchText e ~$0.017 por getDetails.
// =============================================================

const SEARCH_URL  = 'https://places.googleapis.com/v1/places:searchText';
const DETAILS_URL = 'https://places.googleapis.com/v1/places';

// Campos solicitados — afeta o preço. Quanto menos, mais barato.
const SEARCH_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress';

const DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'addressComponents',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'businessStatus',
].join(',');

/** Lê a chave da env do Vite. Retorna null se não configurada. */
export function getApiKey() {
  // @ts-ignore — Vite injeta import.meta.env em build
  return import.meta.env?.VITE_GOOGLE_PLACES_KEY || null;
}

export function isConfigured() {
  return !!getApiKey();
}

/**
 * Monta a URL do iframe do Google Maps Embed API para um endereço livre.
 * Embed Maps é gratuito ilimitado (não conta na cota paga do Places).
 * Requer a Maps Embed API habilitada no mesmo projeto do Cloud Console.
 *
 * @param {string} address  endereço como string (ex: "Av. Boa Viagem, 123, Recife/PE")
 * @param {Object} [opts]
 * @param {number} [opts.zoom=15]
 * @returns {string|null}   URL pronta pra usar em <iframe src> ou null se sem chave/endereço
 */
export function buildEmbedMapUrl(address, opts = {}) {
  const key = getApiKey();
  if (!key) return null;
  const q = (address || '').trim();
  if (!q) return null;
  const zoom = opts.zoom ?? 15;
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&zoom=${zoom}`;
}

/**
 * Busca empresas/locais por texto livre.
 * @param {string} query  ex: "Apple Store Recife" ou "Padaria Pão Quente"
 * @param {Object} [opts]
 * @param {string} [opts.regionCode='BR']  viés geográfico
 * @param {string} [opts.languageCode='pt-BR']
 * @returns {Promise<Array>}  até 10 resultados
 */
export async function searchPlaces(query, opts = {}) {
  const key = getApiKey();
  if (!key) throw new Error('Google Places API key não configurada (VITE_GOOGLE_PLACES_KEY)');
  if (!query || query.trim().length < 2) return [];

  const body = {
    textQuery: query.trim(),
    languageCode: opts.languageCode || 'pt-BR',
    regionCode: opts.regionCode || 'BR',
    maxResultCount: 10,
  };

  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': SEARCH_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Places searchText falhou (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  return data.places || [];
}

/**
 * Detalhes completos de um Place (após o usuário selecionar um resultado).
 * @param {string} placeId  ex: "ChIJN1t_tDeuEmsRUsoyG83frY4"
 */
export async function getPlaceDetails(placeId) {
  const key = getApiKey();
  if (!key) throw new Error('Google Places API key não configurada');
  if (!placeId) throw new Error('placeId obrigatório');

  const url = `${DETAILS_URL}/${encodeURIComponent(placeId)}?languageCode=pt-BR&regionCode=BR`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': DETAILS_FIELD_MASK,
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Places details falhou (${res.status}): ${errBody}`);
  }
  return res.json();
}

/**
 * Converte addressComponents do Google para a estrutura usada pelo
 * AddressPicker do app: { logradouro, numero, complemento?, bairro,
 * cidade, estado_uf, cep, pais }.
 *
 * Google retorna components com types como 'route' (rua),
 * 'street_number' (número), 'sublocality' (bairro), etc.
 */
export function parseAddressComponents(components = []) {
  const get = (type) => {
    const c = components.find((c) => (c.types || []).includes(type));
    return c?.longText || c?.shortText || '';
  };
  const getShort = (type) => {
    const c = components.find((c) => (c.types || []).includes(type));
    return c?.shortText || c?.longText || '';
  };

  return {
    logradouro: get('route'),
    numero:     get('street_number'),
    bairro:     get('sublocality_level_1') || get('sublocality') || get('neighborhood'),
    cidade:     get('administrative_area_level_2') || get('locality'),
    estado_uf:  getShort('administrative_area_level_1'),
    cep:        get('postal_code'),
    pais:       get('country'),
  };
}
