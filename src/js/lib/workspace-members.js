// =============================================================
// FinFlow — Cache de membros do workspace atual (Multi-perfil Fase 2)
// =============================================================
// Lookup: profile_id → { nome, cor, role, initials }
// Usado pra renderizar "Maria marcou", avatares coloridos, etc.
//
// Cache populado on-demand. Invalida ao trocar workspace ou convidar/
// remover membro.
// =============================================================

import { supabase } from './supabase.js';
import { getCurrentWorkspaceId } from './workspace.js';
import { getInitials } from './utils.js';

let _membersCache = null;
let _cachedWsId = null;

/**
 * Lista membros do workspace ATIVO. Retorna array com { profile_id, nome,
 * apelido, cor, role, initials, display }.
 *
 * @returns {Promise<Array>}
 */
export async function listMembers() {
  const wsId = getCurrentWorkspaceId();
  if (!wsId) return [];

  // Invalida cache se workspace mudou
  if (_cachedWsId !== wsId) {
    _membersCache = null;
    _cachedWsId = wsId;
  }
  if (_membersCache) return _membersCache;

  const { data, error } = await supabase
    .from('workspace_members')
    .select('profile_id, role, cor, profile:profiles(id, nome, apelido)')
    .eq('workspace_id', wsId);

  if (error) {
    console.error('[workspace-members] listMembers:', error.message);
    return [];
  }

  _membersCache = (data || []).map((row) => {
    const p = row.profile || {};
    const display = (p.apelido || p.nome || '').trim() || 'Pessoa';
    return {
      profile_id: row.profile_id,
      nome: p.nome || '',
      apelido: p.apelido || '',
      display,
      cor: row.cor || '#6D5EF5',
      role: row.role,
      initials: getInitials(p.nome || p.apelido, '').slice(0, 2),
    };
  });
  return _membersCache;
}

/**
 * Lookup por profile_id. Retorna null se não encontrado.
 * Não-async — assume cache já populado (listMembers chamada antes).
 *
 * @param {string} profileId
 * @returns {object|null}
 */
export function getMember(profileId) {
  if (!profileId || !_membersCache) return null;
  return _membersCache.find((m) => m.profile_id === profileId) || null;
}

/**
 * True se o workspace ativo tem 2+ membros. Usado pra decidir se vale
 * a pena renderizar UI de atribuição (workspace solo não precisa).
 *
 * @returns {boolean}
 */
export function isShared() {
  return Boolean(_membersCache && _membersCache.length > 1);
}

/**
 * Retorna o role do user logado no workspace ativo.
 * Síncrono — assume cache populado (listMembers + auth carregados).
 * Aceita opcionalmente o profileId pra evitar buscar; senão lê do supabase.auth
 * (mas só funciona se quem chama já tem o id em mãos).
 *
 * @param {string} profileId  ID do user logado
 * @returns {'owner'|'editor'|'viewer'|null}
 */
export function getMemberRole(profileId) {
  if (!profileId || !_membersCache) return null;
  const m = _membersCache.find((x) => x.profile_id === profileId);
  return m ? m.role : null;
}

/**
 * Invalida o cache. Use após convidar/aceitar/remover membro.
 */
export function refreshMembers() {
  _membersCache = null;
  _cachedWsId = null;
}
