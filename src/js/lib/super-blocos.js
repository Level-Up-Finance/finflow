// =============================================================
// FinFlow — Super-blocos (Contribuição / Sonhos / Custo de vida)
// =============================================================
// Estrutura canônica de organização financeira. Categorias se agrupam em
// 3 super-blocos:
//   * Contribuição: receitas + dívidas (renda - obrigações = sobra)
//   * Sonhos: investimentos (onde a sobra vira patrimônio)
//   * Custo de vida: gastos do dia-a-dia
//
// Antes desta lib, a definição estava duplicada em 5 arquivos (dashboard,
// orcamento, configuracoes, compromissos, transacoes) com pequenas
// divergências de campos (subtitle só em orcamento, accent vs color).
// Agora todos importam daqui.
// =============================================================

/**
 * Lista canônica de super-blocos. Use em renders sequenciais.
 * @type {Array<{id: string, label: string, subtitle: string, grupos: string[], accent: string}>}
 */
export const SUPER_BLOCOS = [
  {
    id: 'contribuicao',
    label: 'Contribuição',
    subtitle: 'Receitas e dívidas. O que sobra contribui pra Sonhos e Custo de vida.',
    grupos: ['receitas', 'dividas'],
    accent: 'var(--color-success)',
  },
  {
    id: 'sonhos',
    label: 'Sonhos',
    subtitle: 'Investimentos.',
    grupos: ['investimentos'],
    accent: 'var(--color-primary)',
  },
  {
    id: 'custo_vida',
    label: 'Custo de vida',
    subtitle: 'Despesas operacionais do dia a dia.',
    grupos: ['custo_vida'],
    accent: 'var(--color-secondary)',
  },
];

/**
 * Map id → grupos[]. Útil pra filtrar categorias por bloco.
 * @type {Record<string, string[]>}
 */
export const BLOCO_GRUPOS = Object.fromEntries(
  SUPER_BLOCOS.map((b) => [b.id, b.grupos]),
);

/**
 * Map grupo → bloco. Lookup rápido "essa categoria pertence a qual bloco?".
 * @type {Record<string, {id, label, subtitle, grupos, accent}>}
 */
export const BLOCO_POR_GRUPO = Object.fromEntries(
  SUPER_BLOCOS.flatMap((b) => b.grupos.map((g) => [g, b])),
);

/**
 * Retorna o super-bloco a que um `grupo` de categoria pertence.
 * Default: 'custo_vida' (fallback seguro pra categorias mal-mapeadas).
 *
 * @param {string} grupo - 'receitas' | 'dividas' | 'investimentos' | 'custo_vida'
 * @returns {object} super-bloco
 */
export function getBlocoByGrupo(grupo) {
  return BLOCO_POR_GRUPO[grupo] || BLOCO_POR_GRUPO.custo_vida;
}

/**
 * Retorna o super-bloco por id.
 * @param {string} id - 'contribuicao' | 'sonhos' | 'custo_vida'
 * @returns {object|null}
 */
export function getBlocoById(id) {
  return SUPER_BLOCOS.find((b) => b.id === id) || null;
}
