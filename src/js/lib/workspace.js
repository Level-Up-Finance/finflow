// =============================================================
// FinFlow — Workspace context (multi-perfil)
// =============================================================
// Camada central de "qual workspace está ativo agora".
//
// Modelo: cada user pertence a 1+ workspaces (tabela workspace_members).
// Toda query/insert que escreve dado de domínio precisa do workspace_id
// do workspace ATIVO — não do user.id.
//
// Storage: cache em memória + localStorage 'finflow.workspace.current'.
// Bootstrap: chamado em guardSession() — popula cache antes da primeira
// query rodar. Páginas podem chamar getCurrentWorkspaceId() de forma
// síncrona após o guard.
//
// Edge cases:
//   - User com 1 workspace: auto-seleciona, ignora cache.
//   - User com N workspaces, sem cache: pega o owned mais recente.
//   - Cache aponta pra workspace deletado/removido: fallback pro primeiro
//     disponível + limpa cache.
//   - User sem workspaces: trigger handle_new_user garante que isso não
//     acontece. Se acontecer (race condition), throw — caller decide UX.
// =============================================================

import { supabase } from './supabase.js';
import { STORAGE_KEYS } from './storage-keys.js';

// Cache em memória — fonte de verdade durante a sessão da página.
// Populado por bootstrapWorkspace() no guardSession.
let _currentWorkspaceId = null;
let _workspaceList = null;

/**
 * Workspace ativo (UUID). Lê do cache em memória.
 * Retorna null se ainda não foi feito bootstrap (caller deve aguardar
 * guardSession antes de chamar).
 */
export function getCurrentWorkspaceId() {
  return _currentWorkspaceId;
}

/**
 * Troca o workspace ativo. Persiste no localStorage e atualiza cache.
 * Não dispara reload — caller decide se precisa (geralmente sim,
 * pra refletir dados do novo workspace na página atual).
 *
 * @param {string} workspaceId UUID do workspace
 */
export function setCurrentWorkspaceId(workspaceId) {
  if (!workspaceId) throw new Error('[workspace] setCurrentWorkspaceId precisa de UUID');
  _currentWorkspaceId = workspaceId;
  try {
    localStorage.setItem(STORAGE_KEYS.WORKSPACE_CURRENT, workspaceId);
  } catch {
    // localStorage indisponível (modo privado em alguns browsers) — ok
  }
}

/**
 * Lista todos os workspaces do user atual, com role.
 * Cacheada após primeira chamada. Use refreshWorkspaceList() pra invalidar.
 *
 * @returns {Promise<Array<{id, nome, tipo, cor, role}>>}
 */
export async function listMyWorkspaces() {
  if (_workspaceList) return _workspaceList;
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, cor, workspace:workspaces(id, nome, tipo, cor_default, created_at)');
  if (error) {
    console.error('[workspace] listMyWorkspaces:', error.message || error);
    return [];
  }
  _workspaceList = (data || [])
    .filter((row) => row.workspace) // defensivo: workspace pode ser null se RLS bloquear
    .map((row) => ({
      id: row.workspace.id,
      nome: row.workspace.nome,
      tipo: row.workspace.tipo,
      cor: row.cor || row.workspace.cor_default,
      role: row.role,
      createdAt: row.workspace.created_at,
    }))
    // Ordena por created_at do workspace, ascendente (mais antigo = pessoal primeiro)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return _workspaceList;
}

/**
 * Invalida o cache da lista. Use após criar/aceitar/sair de workspace.
 */
export function refreshWorkspaceList() {
  _workspaceList = null;
}

/**
 * Bootstrap: roda em guardSession após validar a sessão.
 * Resolve o workspace ativo seguindo:
 *   1. Se localStorage tem id válido (user é membro) → usa.
 *   2. Se não, pega o primeiro owned (created_at asc).
 *   3. Se não tiver owned, pega qualquer membership.
 *   4. Se não tiver nenhum, throw (caller decide UX).
 *
 * Idempotente — pode rodar múltiplas vezes na mesma sessão.
 */
export async function bootstrapWorkspace() {
  const list = await listMyWorkspaces();
  if (list.length === 0) {
    throw new Error('[workspace] user não tem workspaces — trigger handle_new_user falhou?');
  }

  // Tenta cache
  let cached = null;
  try {
    cached = localStorage.getItem(STORAGE_KEYS.WORKSPACE_CURRENT);
  } catch { /* localStorage indisponível */ }

  const cachedValid = cached && list.some((w) => w.id === cached);
  if (cachedValid) {
    _currentWorkspaceId = cached;
    return cached;
  }

  // Fallback: primeiro owned, ou primeiro qualquer
  const owned = list.find((w) => w.role === 'owner');
  const chosen = owned ? owned.id : list[0].id;
  setCurrentWorkspaceId(chosen);
  return chosen;
}

/**
 * Limpa estado (usado no logout).
 */
export function clearWorkspaceState() {
  _currentWorkspaceId = null;
  _workspaceList = null;
  try {
    localStorage.removeItem(STORAGE_KEYS.WORKSPACE_CURRENT);
  } catch { /* ok */ }
}

/**
 * Helper síncrono pra usar em INSERTs: throw se não tiver workspace ativo
 * (significa que bootstrap não rodou — bug de ordem). Use depois de
 * guardSession().
 */
export function requireWorkspaceId() {
  if (!_currentWorkspaceId) {
    throw new Error('[workspace] requireWorkspaceId chamado antes do bootstrap. Garanta guardSession() antes.');
  }
  return _currentWorkspaceId;
}
