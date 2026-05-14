// =============================================================
// FinFlow — CEP Lookup via ViaCEP
// =============================================================
// formatCep('01310100')  → '01310-100'
// fetchCep('01310-100') → { cep, logradouro, bairro, cidade, estado_uf }
// =============================================================

export function formatCep(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length <= 5) return digits;
  return digits.slice(0, 5) + '-' + digits.slice(5, 8);
}

export function isValidCep(raw) {
  return (raw || '').replace(/\D/g, '').length === 8;
}

/**
 * Busca endereço pelo CEP via ViaCEP.
 * @param {string} cep - CEP com ou sem máscara
 * @returns {Promise<{cep, logradouro, bairro, cidade, estado_uf}>}
 * @throws {Error} se CEP inválido ou não encontrado
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
