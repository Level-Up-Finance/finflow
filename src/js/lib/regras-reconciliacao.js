// =============================================================
// FinFlow — Regras de Auto-Reconciliação (Fase 3)
//
// Uma regra associa um contato a uma subcategoria. Quando o usuário
// cria uma transação com esse contato, a subcategoria é aplicada
// automaticamente sem prompt.
//
// Fluxo do usuário:
//  1. Cria a primeira transação manualmente (escolhe contato + subcategoria)
//  2. Sistema oferece criar uma regra ("sempre vincular este contato a essa subcategoria?")
//  3. A partir daí, toda nova transação com esse contato vem pré-preenchida
//
// Sem regra ainda: o sistema sugere a subcategoria mais usada no histórico
// (silenciosamente, ao escolher o contato).
// =============================================================
import { supabase } from './supabase.js';

/**
 * Carrega todas as regras do usuário (ordenadas por contato_id).
 */
export async function loadRules() {
  const { data, error } = await supabase
    .from('regras_reconciliacao')
    .select('*')
    .order('contato_id');
  if (error) {
    if (/relation.*regras_reconciliacao|column.*regras/i.test(error.message)) {
      console.warn('[loadRules] Tabela regras_reconciliacao não existe — rode a migration 0024');
    } else {
      console.warn('[loadRules]', error);
    }
    return [];
  }
  return data || [];
}

/**
 * Encontra a regra ativa para um contato.
 */
export function findRule(rules, contatoId) {
  if (!contatoId) return null;
  return rules.find((r) => r.contato_id === contatoId) || null;
}

/**
 * Cria ou atualiza a regra (uma por contato).
 */
export async function upsertRule(contatoId, subcategoriaId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'no_user' };
  const { error } = await supabase
    .from('regras_reconciliacao')
    .upsert(
      { user_id: user.id, contato_id: contatoId, subcategoria_id: subcategoriaId },
      { onConflict: 'user_id,contato_id' }
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Remove uma regra pelo id.
 */
export async function deleteRule(ruleId) {
  const { error } = await supabase
    .from('regras_reconciliacao')
    .delete()
    .eq('id', ruleId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Sugere uma subcategoria para um contato baseado no histórico.
 * Heurística: pega todas as transações passadas com esse contato_id
 * que tenham subcategoria_id setada. Retorna a mais frequente — desde
 * que apareça pelo menos `minCount` vezes E represente pelo menos
 * `minRatio` (0–1) das transações desse contato.
 *
 * Retorna null se não há sinal forte suficiente.
 */
export function suggestSubcategoriaFromHistory(transacoes, contatoId, { minCount = 2, minRatio = 0.5 } = {}) {
  if (!contatoId) return null;
  const past = transacoes.filter((t) => t.contato_id === contatoId && t.subcategoria_id);
  if (past.length < minCount) return null;

  const counts = new Map();
  for (const t of past) {
    counts.set(t.subcategoria_id, (counts.get(t.subcategoria_id) || 0) + 1);
  }

  let bestId = null;
  let bestCount = 0;
  for (const [subId, count] of counts) {
    if (count > bestCount) { bestId = subId; bestCount = count; }
  }
  if (bestCount / past.length < minRatio) return null;
  return bestId;
}
