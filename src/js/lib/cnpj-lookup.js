// Busca de empresas por CNPJ usando Brasil API (gratuita, sem chave).
// Logo via Clearbit Logo API a partir do domínio do email/website.
//
// Brasil API endpoint: https://brasilapi.com.br/api/cnpj/v1/<cnpj>
// Clearbit Logo:       https://logo.clearbit.com/<dominio>
//
// Rate limit Brasil API: ~3 req/min sem chave (suficiente pra uso humano).

export function digitsOnly(s) {
  return (s || '').replace(/\D/g, '');
}

export function isValidCnpj(s) {
  return digitsOnly(s).length === 14;
}

export function formatCnpj(cnpj) {
  const d = digitsOnly(cnpj);
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// Extrai domínio de email ('contato@coca-cola.com' → 'coca-cola.com')
// ou de URL ('https://www.coca-cola.com/path' → 'coca-cola.com').
export function extractDomain(emailOrUrl) {
  if (!emailOrUrl) return null;
  const s = String(emailOrUrl).trim().toLowerCase();
  if (s.includes('@')) {
    const parts = s.split('@');
    return parts[1] || null;
  }
  try {
    const url = s.startsWith('http') ? s : `https://${s}`;
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function inferLogoUrl(emailOrWebsite) {
  const domain = extractDomain(emailOrWebsite);
  if (!domain) return null;
  return `https://logo.clearbit.com/${domain}`;
}

// Verifica se uma URL de imagem carrega (pra evitar avatar quebrado).
// Resolve com a URL se ok, ou null se 404.
export function checkImageExists(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(null), 4000); // timeout
  });
}

// Busca CNPJ na Brasil API. Retorna objeto normalizado pra preencher o form,
// ou lança Error com mensagem amigável.
export async function fetchCnpjData(cnpj) {
  const cleaned = digitsOnly(cnpj);
  if (cleaned.length !== 14) {
    throw new Error('CNPJ inválido — precisa ter 14 dígitos.');
  }

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleaned}`);

  if (res.status === 404) {
    throw new Error('CNPJ não encontrado na Receita Federal.');
  }
  if (res.status === 429) {
    throw new Error('Muitas buscas em pouco tempo. Aguarde alguns segundos e tente novamente.');
  }
  if (!res.ok) {
    throw new Error(`Erro na consulta (HTTP ${res.status}). Tente novamente.`);
  }

  const data = await res.json();

  // Normalização: Brasil API retorna campos em snake_case.
  // Ref: https://brasilapi.com.br/docs#tag/CNPJ
  const nome = (data.nome_fantasia || '').trim() || (data.razao_social || '').trim();
  const enderecoParts = [
    data.descricao_tipo_de_logradouro,
    data.logradouro,
    data.numero,
  ].filter(Boolean).join(' ');
  const enderecoLinha2 = [
    data.complemento,
    data.bairro,
    data.municipio && `${data.municipio}/${data.uf || ''}`,
    data.cep && formatCep(data.cep),
  ].filter(Boolean).join(' · ');
  const endereco = [enderecoParts, enderecoLinha2].filter(Boolean).join('\n');

  const email = (data.email || '').trim().toLowerCase() || null;

  return {
    nome,
    razao_social:   (data.razao_social || '').trim(),
    nome_fantasia:  (data.nome_fantasia || '').trim(),
    cnpj:           formatCnpj(cleaned),
    email,
    telefone:       (data.ddd_telefone_1 || '').trim() || null,
    endereco:       endereco || null,
    cnae:           data.cnae_fiscal_descricao || null,
    cnae_codigo:    data.cnae_fiscal || null,
    situacao:       data.descricao_situacao_cadastral || null,
    data_inicio:    data.data_inicio_atividade || null,
    capital_social: data.capital_social ?? null,
    porte:          data.descricao_porte || null,
  };
}

function formatCep(cep) {
  const d = (cep || '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep;
}

// URL de busca no Google pra ajudar o usuário a achar o CNPJ.
export function googleCnpjSearchUrl(nome) {
  const q = encodeURIComponent(`cnpj ${(nome || '').trim()}`);
  return `https://www.google.com/search?q=${q}`;
}
