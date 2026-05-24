// =============================================================
// FinFlow — Subcategorias: visibilidade na UI
//
// Algumas subcategorias existem no DB pra reusar a maquinaria de
// pagamentos / caixa livre / sync (precisam de FK válido), mas NÃO
// devem aparecer em UIs onde o user interage com elas como
// "compromisso". Exemplo: "Gastos diversos".
//
// Migration 0126 adicionou flag `oculta` no schema. Este helper
// centraliza a lógica de filtro em UM lugar — cada página chama
// `filterVisibleSubs(subs)` no array após o fetch.
//
// Subs ocultas continuam existindo:
//   - Página Pagamentos as RENDERIZA (especialmente "Gastos diversos"
//     como linha "Acompanhamento")
//   - Engine de caixa livre as CONSIDERA (somatório do bloco)
//   - Sync de transação não as TOCA (lib/transacao-pagamento-sync.js)
//
// O que NÃO devem aparecer:
//   - Lista de Compromissos
//   - Modal "Novo compromisso" (dropdown de sub vinculada)
//   - Configurações (árvore de categorias/subs)
//   - Dropdowns de alocação caixa livre (sub destino)
//   - Relatórios por sub
//   - Qualquer outro lugar que liste "compromissos do user"
// =============================================================

/**
 * Retorna true se a sub deve ser ocultada da UI conforme convenção.
 *
 * Critério (ANY of these triggers visibility=false):
 *   - oculta === true (migration 0126)
 *   - auto_tipo === 'gastos_diversos' (legacy, antes da migration)
 *   - nome === 'Gastos diversos' E (auto_gerado OU sem auto_tipo) (paranoia)
 */
export function isSubOculta(sub) {
  if (!sub) return false;
  if (sub.oculta === true) return true;
  if (sub.auto_tipo === 'gastos_diversos') return true;
  if (sub.nome === 'Gastos diversos' && (sub.auto_gerado === true || !sub.auto_tipo)) return true;
  return false;
}

/**
 * Filtra um array de subs, retornando só as visíveis pro user.
 * Idempotente — safe pra chamar antes de qualquer render/loop.
 */
export function filterVisibleSubs(subs) {
  return (subs || []).filter((s) => !isSubOculta(s));
}

/**
 * Atalho pra usar com .filter() inline:
 *   subs.filter(isSubVisible)
 */
export function isSubVisible(sub) {
  return !isSubOculta(sub);
}

/**
 * Categoria é "sistêmica" quando existe SÓ pra hospedar subs ocultas
 * (placeholders). Critério: tem 1+ sub, e TODAS são ocultas.
 *
 * Casos cobertos:
 *   - "Diversos" → única sub é "Gastos diversos" (oculta) → sistêmica
 *   - "Cartões"  → todas subs são "Fatura X" (ocultas)   → sistêmica
 *
 * Casos não cobertos (intencional):
 *   - Categoria vazia criada pelo user → NÃO é sistêmica
 *   - Categoria mista (1 sub real + 1 oculta) → NÃO é sistêmica
 *
 * @param {object} cat — categoria
 * @param {Array} allSubsRaw — todas as subs (NÃO filtradas)
 */
export function isCategoriaSistemica(cat, allSubsRaw) {
  if (!cat || !Array.isArray(allSubsRaw)) return false;
  const subsDaCat = allSubsRaw.filter((s) => s.categoria_id === cat.id);
  if (subsDaCat.length === 0) return false; // vazia → não é sistêmica
  return subsDaCat.every((s) => isSubOculta(s));
}

/**
 * Filtra um array de categorias, escondendo as sistêmicas.
 */
export function filterVisibleCategorias(cats, allSubsRaw) {
  return (cats || []).filter((c) => !isCategoriaSistemica(c, allSubsRaw));
}
