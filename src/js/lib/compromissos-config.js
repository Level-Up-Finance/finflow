// =============================================================
// FinFlow — Config dos Compromissos (Subcategorias)
// • Tipo (Receita / Despesa)
// • Períodos de recorrência
// • Dias da semana
// • Tipos de pagamento (alfabético)
// • Moedas
// • Categorias defaults pra seed
// =============================================================

// ---------- Tipo (Receita / Despesa) ----------
const TIPO_ICONS = {
  Receita: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`,
  Despesa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`,
};

const TIPO_COLORS = {
  Receita: '#10B981', // verde
  Despesa: '#EF4444', // vermelho
};

export const TIPOS = [
  { value: 'Receita', label: 'Receita', icon: TIPO_ICONS.Receita, color: TIPO_COLORS.Receita },
  { value: 'Despesa', label: 'Despesa', icon: TIPO_ICONS.Despesa, color: TIPO_COLORS.Despesa },
];

const TIPO_BY_VALUE = Object.fromEntries(TIPOS.map((t) => [t.value, t]));

export function getTipo(value) {
  return TIPO_BY_VALUE[value] || null;
}

export function tipoIcon(value) {
  return TIPO_ICONS[value] || '';
}

export function tipoColor(value) {
  return TIPO_COLORS[value] || '#6B7280';
}

export function tipoPill(value) {
  const t = getTipo(value);
  if (!t) return '';
  return `
    <span class="type-pill" style="--type-color: ${t.color};">
      ${t.icon}
      <span class="type-pill-label">${t.label}</span>
    </span>
  `;
}

// ---------- Período de recorrência ----------
export const PERIODOS = [
  { value: 'Mensal',    label: 'Mensal' },
  { value: 'Quinzenal', label: 'Quinzenal' },
  { value: 'Semanal',   label: 'Semanal' },
  { value: 'Anual',     label: 'Anual' },
  { value: 'Único',     label: 'Único' },
];

// ---------- Dias da semana (0 = Domingo, padrão JS) ----------
export const DIAS_SEMANA = [
  { value: 0, label: 'Domingo',    short: 'Dom' },
  { value: 1, label: 'Segunda',    short: 'Seg' },
  { value: 2, label: 'Terça',      short: 'Ter' },
  { value: 3, label: 'Quarta',     short: 'Qua' },
  { value: 4, label: 'Quinta',     short: 'Qui' },
  { value: 5, label: 'Sexta',      short: 'Sex' },
  { value: 6, label: 'Sábado',     short: 'Sáb' },
];

const DIA_SEMANA_BY_VALUE = Object.fromEntries(DIAS_SEMANA.map((d) => [d.value, d]));

export function diaSemanaLabel(value) {
  return DIA_SEMANA_BY_VALUE[value]?.label || '—';
}

// ---------- Tipos de pagamento (ordem alfabética) ----------
export const TIPOS_PAGAMENTO = [
  'Boleto',
  'Crédito',
  'Débito',
  'Débito Direto',
  'Dinheiro',
  'PIX',
  'Transferência',
];

// ---------- Moedas ----------
// Cada moeda usa o locale padrão do seu país pra formatação (Intl.NumberFormat).
export const MOEDAS = [
  { code: 'BRL', symbol: 'R$', label: 'Real (BRL)',  locale: 'pt-BR' },
  { code: 'USD', symbol: '$',  label: 'Dólar (USD)', locale: 'en-US' },
  { code: 'EUR', symbol: '€',  label: 'Euro (EUR)',  locale: 'de-DE' },
  { code: 'GBP', symbol: '£',  label: 'Libra (GBP)', locale: 'en-GB' },
];

const MOEDA_BY_CODE = Object.fromEntries(MOEDAS.map((m) => [m.code, m]));

export function getMoeda(code) {
  return MOEDA_BY_CODE[code] || null;
}

/**
 * Formata um valor monetário com a convenção oficial da moeda:
 *   BRL → "R$ 1.234,56"
 *   USD → "$1,234.56"
 *   EUR → "1.234,56 €"
 *   GBP → "£1,234.56"
 */
export function formatCurrency(amount, code = 'BRL') {
  const moeda = MOEDA_BY_CODE[code] || MOEDA_BY_CODE.BRL;
  const value = Number(amount || 0);
  try {
    return new Intl.NumberFormat(moeda.locale, {
      style: 'currency',
      currency: moeda.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Fallback se o navegador não suportar o locale
    return `${moeda.symbol} ${value.toFixed(2)}`;
  }
}

// ---------- Defaults pra seed inicial ----------
export const CATEGORIAS_DEFAULT = [
  { nome: 'Receitas',      cor: '#10B981', ordem: 0 },
  { nome: 'Dívidas',       cor: '#EF4444', ordem: 1 },
  { nome: 'Investimentos', cor: '#8B5CF6', ordem: 2 },
];
