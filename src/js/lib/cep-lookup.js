// =============================================================
// FinFlow — Lookup de código postal (CEP, ZIP Code, Post Code)
// =============================================================

// ── Brasil (ViaCEP) ───────────────────────────────────────────

export function formatCep(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length <= 5) return digits;
  return digits.slice(0, 5) + '-' + digits.slice(5, 8);
}

export function isValidCep(raw) {
  return (raw || '').replace(/\D/g, '').length === 8;
}

/**
 * Busca endereço pelo CEP via ViaCEP (Brasil).
 * @returns {Promise<{logradouro, bairro, cidade, estado_uf, cep}>}
 */
export async function fetchCep(cep) {
  const digits = (cep || '').replace(/\D/g, '');
  if (digits.length !== 8) throw new Error('CEP deve ter 8 dígitos.');
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!res.ok) throw new Error('Erro ao consultar ViaCEP.');
  const data = await res.json();
  if (data.erro) throw new Error('CEP não encontrado.');
  return {
    cep:        formatCep(data.cep || digits),
    logradouro: data.logradouro || '',
    bairro:     data.bairro     || '',
    cidade:     data.localidade || '',
    estado_uf:  data.uf         || '',
  };
}

// ── Estados Unidos (Zippopotam) ───────────────────────────────

export function isValidZip(raw) {
  return /^\d{5}$/.test((raw || '').replace(/\D/g, '').slice(0, 5));
}

/**
 * Busca cidade/estado pelo ZIP Code via api.zippopotam.us (EUA).
 * @returns {Promise<{cidade, estado_uf}>}
 */
export async function fetchZip(zip) {
  const digits = (zip || '').replace(/\D/g, '').slice(0, 5);
  if (digits.length !== 5) throw new Error('ZIP Code deve ter 5 dígitos.');
  const res = await fetch(`https://api.zippopotam.us/us/${digits}`);
  if (!res.ok) throw new Error('ZIP Code não encontrado.');
  const data = await res.json();
  const place = data.places?.[0];
  if (!place) throw new Error('ZIP Code não encontrado.');
  return {
    cidade:    place['place name']          || '',
    estado_uf: place['state abbreviation']  || '',
  };
}

// ── Reino Unido (postcodes.io) ────────────────────────────────

export function isValidPostcode(raw) {
  // Formato UK: AN NAA, ANN NAA, AAN NAA, AANN NAA, ANA NAA, AANA NAA
  const clean = (raw || '').replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/.test(clean) && clean.length >= 5;
}

/**
 * Busca endereço pelo Post Code via postcodes.io (Reino Unido).
 * @returns {Promise<{cidade, estado_uf}>}
 */
export async function fetchPostcode(postcode) {
  const clean = (postcode || '').trim().toUpperCase();
  if (!clean) throw new Error('Post Code inválido.');
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
  if (!res.ok) throw new Error('Post Code não encontrado.');
  const data = await res.json();
  if (data.status !== 200 || !data.result) throw new Error('Post Code não encontrado.');
  return {
    cidade:    data.result.admin_district || data.result.parish || '',
    estado_uf: data.result.region         || data.result.country || '',
  };
}
