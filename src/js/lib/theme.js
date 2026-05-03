// =============================================================
// FinFlow — Tema (claro / escuro / auto)
//
// • Aplica `data-theme="dark"` no <html> quando apropriado
// • Persiste a preferência em localStorage (UX rápido) e em
//   profiles.tema (sincroniza entre dispositivos)
// • Modo "auto" segue prefers-color-scheme do OS e re-aplica
//   quando o usuário troca o tema do sistema
//
// Uso:
//   import { initTheme, setTheme, getTheme } from './lib/theme.js';
//   await initTheme();           // chama no boot de cada página
//   await setTheme('escuro');    // troca explícita
// =============================================================
import { supabase } from './supabase.js';

const STORAGE_KEY = 'finflow.tema';
const VALID = ['claro', 'escuro', 'auto'];

let mediaQuery = null;
let mediaListener = null;

// Lê preferência local (sincronia, sem hit no DB)
export function getStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

// Aplica imediatamente no momento do import — minimiza flash de branco→preto
// quando o tema persistido é "escuro". Re-aplicado em initTheme() depois.
(function bootstrapApply() {
  if (typeof document === 'undefined') return;
  const pref = getStoredTheme();
  const effective = pref === 'auto'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro')
    : pref;
  if (effective === 'escuro') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

// Tema efetivo (resolve "auto" → "claro" ou "escuro")
export function resolveEffectiveTheme(pref) {
  if (pref === 'auto') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  }
  return pref;
}

// Aplica no DOM (sem persistir)
export function applyTheme(pref) {
  const effective = resolveEffectiveTheme(pref);
  if (effective === 'escuro') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

// Configura listener pra mudar tema quando OS muda (só em modo "auto")
function setupAutoListener(pref) {
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener);
    mediaListener = null;
  }
  if (pref !== 'auto' || !window.matchMedia) return;
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaListener = () => applyTheme('auto');
  mediaQuery.addEventListener('change', mediaListener);
}

// Inicializa tema no boot — aplica imediato do localStorage,
// depois sincroniza com profiles em background.
export async function initTheme() {
  const local = getStoredTheme();
  applyTheme(local);
  setupAutoListener(local);

  // Sincroniza com profiles (não bloqueia render)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('tema')
      .eq('id', user.id)
      .maybeSingle();
    if (error || !data?.tema) return;
    if (data.tema !== local) {
      localStorage.setItem(STORAGE_KEY, data.tema);
      applyTheme(data.tema);
      setupAutoListener(data.tema);
    }
  } catch (err) {
    // Silencioso — schema pode não ter rodado a migration ainda
    console.debug('[theme] sync com profiles falhou:', err?.message);
  }
}

// Troca de tema (persiste local + DB)
export async function setTheme(pref) {
  if (!VALID.includes(pref)) return;
  localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(pref);
  setupAutoListener(pref);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update({ tema: pref }).eq('id', user.id);
  } catch (err) {
    console.warn('[theme] persistir em profiles falhou:', err?.message);
  }
}

export function getTheme() {
  return getStoredTheme();
}
