// =============================================================
// FinFlow — Autenticação e Session Guard
// =============================================================
import { supabase, isSupabaseConfigured } from './supabase.js';
import { bootstrapWorkspace, clearWorkspaceState } from './workspace.js';
// Importa theme.js pelo efeito colateral — aplica tema persistido
// imediatamente, antes do primeiro render.
import './theme.js';

const LOGIN_PATH = '/index.html';
const HOME_PATH = '/dashboard.html';

/**
 * Verifica se há sessão ativa. Se não houver, redireciona pro login.
 * Deve ser chamada no topo de TODA página protegida.
 */
export async function guardSession() {
  if (!isSupabaseConfigured()) {
    console.warn('[guardSession] Supabase não configurado — pulando guard.');
    return null;
  }
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[guardSession]', error);
    window.location.href = LOGIN_PATH;
    return null;
  }
  if (!session) {
    window.location.href = LOGIN_PATH;
    return null;
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('suspenso')
    .eq('id', session.user.id)
    .single();
  if (profile?.suspenso) {
    await supabase.auth.signOut();
    window.location.href = LOGIN_PATH + '?suspenso=1';
    return null;
  }
  // Bootstrap do workspace ativo. Antes de qualquer query de domínio
  // rodar, garantimos que getCurrentWorkspaceId() vai retornar um UUID
  // válido. Falha hard: se o user não tem workspace algum, é bug de
  // setup (trigger handle_new_user deveria ter criado um).
  try {
    await bootstrapWorkspace();
  } catch (err) {
    console.error('[guardSession] bootstrapWorkspace falhou:', err);
    // Não bloqueia o login — algumas páginas (perfil, configuracoes
    // mínimas) podem funcionar sem workspace. Páginas de domínio
    // devem chamar requireWorkspaceId() e tratar o throw.
  }
  return session;
}

/**
 * Verifica se o usuário JÁ está logado. Se sim, redireciona pro dashboard.
 * Usada na tela de login pra evitar mostrar o form pra quem já está autenticado.
 */
export async function redirectIfAuthenticated() {
  if (!isSupabaseConfigured()) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = HOME_PATH;
    return session;
  }
  return null;
}

/**
 * Retorna o objeto User da sessão ativa.
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Encerra sessão e redireciona pro login.
 */
export async function logout() {
  clearWorkspaceState();
  await supabase.auth.signOut();
  window.location.href = LOGIN_PATH;
}

/**
 * Checa se o usuário atual é admin (profiles.is_admin = true).
 * Cache em memória por sessão de página — evita roundtrip a cada call.
 */
let _isAdminCache = null;
export async function isCurrentUserAdmin() {
  if (_isAdminCache !== null) return _isAdminCache;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      _isAdminCache = false;
      return false;
    }
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    _isAdminCache = Boolean(data?.is_admin);
    return _isAdminCache;
  } catch {
    _isAdminCache = false;
    return false;
  }
}

/**
 * Guard pra páginas admin. Roda guardSession e, se OK, checa is_admin.
 * Não-admin é redirecionado pro dashboard.
 */
export async function guardAdmin() {
  const session = await guardSession();
  if (!session) return null;
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) {
    window.location.href = HOME_PATH;
    return null;
  }
  return session;
}
