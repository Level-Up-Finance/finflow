// =============================================================
// FinFlow — Tipos de conta com SVG icons + cor de destaque
// Reusável em qualquer tela (Contas, Categorias, Pagamentos, etc.)
// =============================================================

const ICONS = {
  // Corrente — banco/instituição (colunas com telhado)
  Corrente: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 18 0"/><path d="M3 10v11"/><path d="M21 10v11"/><path d="M3 10l9-5 9 5"/><path d="M9 21V13"/><path d="M15 21V13"/><path d="M5 21V13"/><path d="M19 21V13"/></svg>`,

  // Poupança — porquinho
  Poupança: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.6.5 2.8 1.5 3.8L4 18h3l1-1.7c1 .4 2 .7 3 .7s2-.3 3-.7L15 18h3l-1.5-2.2c.7-.7 1.2-1.5 1.5-2.3 1 0 2-1 2-2v-2c0-1-1-2-2-2 0-1-1-2.5-1-2.5z"/><circle cx="16" cy="10" r="0.5" fill="currentColor"/><path d="M2 11v1c0 1 1 2 2 2"/></svg>`,

  // Reserva — pote de moedas (banco físico de reserva)
  Cofrinho: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="2"/><path d="M4 6v12c0 1.5 3.6 2 8 2s8-.5 8-2V6"/><path d="M4 12c0 1.5 3.6 2 8 2s8-.5 8-2"/></svg>`,

  // Investimento — gráfico ascendente
  Investimento: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,

  // Cartão de Crédito — cartão
  'Cartão de Crédito': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/><line x1="6" x2="9" y1="15" y2="15"/></svg>`,
};

const COLORS = {
  Corrente:            '#3B82F6', // azul
  Poupança:            '#10B981', // verde
  Cofrinho:            '#F59E0B', // âmbar
  Investimento:        '#8B5CF6', // roxo
  'Cartão de Crédito': '#EF4444', // vermelho
};

export const ACCOUNT_TYPES = [
  { value: 'Corrente',          label: 'Corrente',          icon: ICONS.Corrente,             color: COLORS.Corrente },
  { value: 'Poupança',          label: 'Poupança',          icon: ICONS.Poupança,             color: COLORS.Poupança },
  { value: 'Cofrinho',          label: 'Reserva',           icon: ICONS.Cofrinho,             color: COLORS.Cofrinho },
  { value: 'Investimento',      label: 'Investimento',      icon: ICONS.Investimento,         color: COLORS.Investimento },
  { value: 'Cartão de Crédito', label: 'Cartão de Crédito', icon: ICONS['Cartão de Crédito'], color: COLORS['Cartão de Crédito'] },
];

const TYPE_BY_VALUE = Object.fromEntries(ACCOUNT_TYPES.map((t) => [t.value, t]));

export function getType(value) {
  return TYPE_BY_VALUE[value] || null;
}

export function typeIcon(value) {
  return ICONS[value] || '';
}

export function typeColor(value) {
  return COLORS[value] || '#6B7280';
}

/**
 * Gera o HTML de um pill com ícone + label do tipo.
 * Reusável em outras telas.
 */
export function typePill(value, { compact = false } = {}) {
  const t = getType(value);
  if (!t) return '';
  const cls = compact ? 'type-pill type-pill-compact' : 'type-pill';
  return `
    <span class="${cls}" style="--type-color: ${t.color};">
      ${t.icon}
      <span class="type-pill-label">${t.label}</span>
    </span>
  `;
}
