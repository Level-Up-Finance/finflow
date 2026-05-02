// =============================================================
// FinFlow — Autenticação e Session Guard
// =============================================================
import { supabase, isSupabaseConfigured } from './supabase.js';
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
  await supabase.auth.signOut();
  window.location.href = LOGIN_PATH;
}
