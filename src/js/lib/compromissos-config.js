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
  Receita:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`,
  Despesa:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`,
  Transferência: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>`,
  Caixinha:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.6.5 2.8 1.5 3.8L4 18h3l1-1.7c1 .4 2 .7 3 .7s2-.3 3-.7L15 18h3l-1.5-2.2c.7-.7 1.2-1.5 1.5-2.3 1 0 2-1 2-2v-2c0-1-1-2-2-2 0-1-1-2.5-1-2.5z"/><circle cx="16" cy="10" r="0.5" fill="currentColor"/><path d="M2 11v1c0 1 1 2 2 2"/></svg>`,
};

const TIPO_COLORS = {
  Receita:       '#10B981', // verde
  Despesa:       '#EF4444', // vermelho
  Transferência: '#6366F1', // índigo
  Caixinha:      '#F59E0B', // âmbar
};

export const TIPOS = [
  { value: 'Receita',       label: 'Receita',       icon: TIPO_ICONS.Receita,       color: TIPO_COLORS.Receita       },
  { value: 'Despesa',       label: 'Despesa',       icon: TIPO_ICONS.Despesa,       color: TIPO_COLORS.Despesa       },
  { value: 'Transferência', label: 'Transferência', icon: TIPO_ICONS.Transferência, color: TIPO_COLORS.Transferência },
  { value: 'Caixinha',      label: 'Caixinha',      icon: TIPO_ICONS.Caixinha,      color: TIPO_COLORS.Caixinha      },
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

/** Gera <option> para cada moeda com exemplo do formato numérico.
 *  Ex: "BRL — R$ 1.234,56"  |  "USD — $1,234.56"
 */
export function renderMoedaOptions(selectedCode = 'BRL') {
  return MOEDAS.map((m) => {
    let example;
    try {
      example = new Intl.NumberFormat(m.locale, {
        style: 'currency', currency: m.code,
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(1234.56);
    } catch { example = `${m.symbol} 1234.56`; }
    const sel = m.code === selectedCode ? ' selected' : '';
    return `<option value="${m.code}"${sel}>${m.code} — ${example}</option>`;
  }).join('');
}

/** Placeholder para input monetário com o separador correto da moeda.
 *  BRL/EUR → "0,00"  |  USD/GBP → "0.00"
 */
export function moedaInputPlaceholder(code = 'BRL') {
  const m = MOEDA_BY_CODE[code] || MOEDA_BY_CODE.BRL;
  try {
    const parts = new Intl.NumberFormat(m.locale, { minimumFractionDigits: 2 }).formatToParts(0);
    const dec = parts.find((p) => p.type === 'decimal')?.value || '.';
    return `0${dec}00`;
  } catch { return '0.00'; }
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
      currencySign: 'accounting',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    const abs = Math.abs(value).toFixed(2);
    return value < 0 ? `(${moeda.symbol} ${abs})` : `${moeda.symbol} ${abs}`;
  }
}

// Split HTML display: <span class="currency-sym">R$</span><span class="currency-num">1.234,56</span>
// For negative (accounting): sym stays, num gets parens: (1.234,56)
export function formatCurrencyHTML(amount, code = 'BRL') {
  const moeda = MOEDA_BY_CODE[code] || MOEDA_BY_CODE.BRL;
  const value = Number(amount || 0);
  let sym, numStr;
  try {
    const parts = new Intl.NumberFormat(moeda.locale, {
      style: 'currency',
      currency: moeda.code,
      currencySign: 'accounting',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(value);
    sym = parts.find((p) => p.type === 'currency')?.value || moeda.symbol;
    const currIdx = parts.findIndex((p) => p.type === 'currency');
    const numParts = [];
    for (let i = 0; i < parts.length; i++) {
      if (i === currIdx) continue;
      if (i === currIdx + 1 && parts[i].type === 'literal' && parts[i].value.trim() === '') continue;
      numParts.push(parts[i].value);
    }
    numStr = numParts.join('');
  } catch {
    sym = moeda.symbol;
    const abs = Math.abs(value).toFixed(2);
    numStr = value < 0 ? `(${abs})` : abs;
  }
  return `<span class="currency-split"><span class="currency-sym">${sym}</span><span class="currency-num">${numStr}</span></span>`;
}

// ---------- Defaults pra seed inicial ----------
export const CATEGORIAS_DEFAULT = [
  { nome: 'Receitas',      cor: '#10B981', ordem: 0, grupo: 'receitas' },
  { nome: 'Financiamentos e Dívidas', cor: '#EF4444', ordem: 1, grupo: 'dividas' },
  { nome: 'Investimentos', cor: '#8B5CF6', ordem: 2, grupo: 'investimentos' },
];
