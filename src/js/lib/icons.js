// =============================================================
// FinFlow — Biblioteca centralizada de ícones SVG do sistema
// (substitui emojis em contextos onde queremos visual consistente)
// =============================================================

const ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

/** Carteira aberta com cifrão — Caixa Livre */
export const ICON_CAIXA_LIVRE = `
  <svg ${ATTRS}>
    <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1"/>
    <path d="M16 12h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a2 2 0 0 1 0-4Z"/>
    <circle cx="17.5" cy="14" r="0.5" fill="currentColor"/>
  </svg>`;

/** Brotinho — Investimento */
export const ICON_INVESTIR = `
  <svg ${ATTRS}>
    <path d="M12 22V12"/>
    <path d="M12 12c-3-3-7-2-7-2s-1 5 2 8 7 2 7 2"/>
    <path d="M12 12c3-3 7-2 7-2s1 5-2 8-7 2-7 2"/>
    <path d="M12 8a4 4 0 0 1 4-4"/>
  </svg>`;

/** Escudo com check — Quitar dívida */
export const ICON_DIVIDA = `
  <svg ${ATTRS}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 11 11 13 15 9"/>
  </svg>`;

/** Cofrinho (porquinho) — Caixinha */
export const ICON_CAIXINHA = `
  <svg ${ATTRS}>
    <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.5.5 2.7 1.4 3.7L5 18h3l1-1.5c.9.3 1.9.5 3 .5s2.1-.2 3-.5L16 18h3l-1.4-2.3c.7-.6 1.2-1.4 1.4-2.2 1 0 2-1 2-2v-2c0-1-1-2-2-2 0-1-1-2.5-1-2.5z"/>
    <circle cx="16" cy="10" r="0.6" fill="currentColor"/>
    <path d="M2 11v1c0 1 1 2 2 2"/>
  </svg>`;

/** Seta dupla pra direita — Próximo bloco (rollover) */
export const ICON_PROXIMO_BLOCO = `
  <svg ${ATTRS}>
    <polyline points="13 17 18 12 13 7"/>
    <polyline points="6 17 11 12 6 7"/>
  </svg>`;

/** Nota com asas — Avulsa */
export const ICON_AVULSA = `
  <svg ${ATTRS}>
    <rect width="14" height="9" x="5" y="8" rx="1"/>
    <circle cx="12" cy="12.5" r="1.5"/>
    <path d="M5 11c-2-1-3-3-3-4"/>
    <path d="M19 11c2-1 3-3 3-4"/>
  </svg>`;

/** Chevron pra baixo (expand indicator) */
export const ICON_CHEVRON_DOWN = `
  <svg ${ATTRS}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>`;

/** Mapa de destino → ícone (helper) */
export const ICON_DESTINO = {
  investimento: ICON_INVESTIR,
  divida:       ICON_DIVIDA,
  caixinha:     ICON_CAIXINHA,
  rollover:     ICON_PROXIMO_BLOCO,
  avulsa:       ICON_AVULSA,
};
