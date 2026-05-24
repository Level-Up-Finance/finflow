// =============================================================
// FinFlow — Permissões baseadas em role do workspace (Multi-perfil)
// =============================================================
// Defesa em profundidade: a RLS no Postgres é a fonte única de verdade
// sobre quem pode escrever no quê. Mas a UI também precisa esconder/
// disable controles destrutivos quando o user não tem permissão —
// senão o usuário clica, vê 403, e fica confuso.
//
// Hierarquia de roles:
//   owner  → tudo (criar/editar/deletar, convidar pessoas, mudar settings)
//   editor → criar/editar/deletar dados de domínio (pagamentos, transações,
//            dívidas, etc), mas não convida nem gerencia membros
//   viewer → só lê
//
// Cache: lê do workspace-members.js que já é cacheado.
//
// Padrão de uso:
//   import { canWrite, canManage } from '../lib/permissions.js';
//   if (!canWrite()) selectEl.disabled = true;
//   if (!canManage()) inviteBtn.classList.add('hidden');
// =============================================================

import { supabase } from './supabase.js';
import { getMemberRole, listMembers } from './workspace-members.js';

let _cachedUserId = null;

/**
 * ID do user logado, cacheado em memória (não muda durante a sessão).
 * Síncrono via cache; primeira chamada async via supabase.auth.
 */
async function getCurrentUserId() {
  if (_cachedUserId) return _cachedUserId;
  const { data: { user } } = await supabase.auth.getUser();
  _cachedUserId = user?.id || null;
  return _cachedUserId;
}

/**
 * Pré-aquece o cache de userId + lista de members. Chamar no guardSession.
 * Depois, canWrite()/canManage() funcionam síncronos em qualquer página.
 */
export async function preloadPermissions() {
  await getCurrentUserId();
  await listMembers(); // garante cache de members populado pra getMemberRole
}

/**
 * Role do user logado no workspace ATIVO.
 * Síncrono — assume preloadPermissions já rodou.
 *
 * @returns {'owner'|'editor'|'viewer'|null}
 */
export function getRole() {
  if (!_cachedUserId) return null;
  return getMemberRole(_cachedUserId);
}

/**
 * True se o user pode CRIAR/EDITAR/DELETAR dados de domínio.
 * Owner + Editor. Viewer → false.
 */
export function canWrite() {
  const r = getRole();
  return r === 'owner' || r === 'editor';
}

/**
 * True se o user é OWNER do workspace ativo.
 * Necessário pra convidar pessoas, deletar workspace, mudar settings críticas.
 */
export function canManage() {
  return getRole() === 'owner';
}

/**
 * Limpa cache (chamado no logout ou ao trocar de workspace).
 */
export function clearPermissionsCache() {
  _cachedUserId = null;
}
