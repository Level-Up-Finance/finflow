// =============================================================
// FinFlow — Página: Login (Fase 1)
// Login + Signup + Forgot password
// =============================================================
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { redirectIfAuthenticated } from '../lib/auth.js';
import { showToast } from '../components/toast.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';

const HOME_PATH = '/dashboard.html';

/**
 * Resolve pra onde redirecionar após login. Se ?redirect= está presente
 * e é uma URL relativa segura (mesma origem, sem protocol://), usa ela.
 * Caso contrário, volta pro dashboard. Evita open-redirect.
 */
function resolveRedirect() {
  try {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('redirect');
    if (!r) return HOME_PATH;
    // Apenas caminhos relativos começando com / e sem // (que iniciaria protocol-relative)
    if (r.startsWith('/') && !r.startsWith('//')) return r;
  } catch { /* ok */ }
  return HOME_PATH;
}

// -----------------------------
// Helpers
// -----------------------------
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
// Login aceita senha de 6+ chars (não trava usuários antigos com senha curta).
// Signup exige 8+ chars (política nova, alinhada com NIST).
const isValidLoginPassword  = (password) => password.length >= 6;
const isValidSignupPassword = (password) => password.length >= 8;

function setError(form, fieldName, message) {
  const errorEl = form.querySelector(`[data-error="${fieldName}"]`);
  if (!errorEl) return;
  if (message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  } else {
    errorEl.classList.add('hidden');
  }
}

function clearErrors(form) {
  form.querySelectorAll('[data-error]').forEach((el) => el.classList.add('hidden'));
}

function setLoadingState(button, loading) {
  if (loading) {
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Aguarde…';
  } else {
    button.disabled = false;
    button.textContent = button.dataset.label || button.textContent;
  }
}

function showMode(mode) {
  document.querySelectorAll('[data-mode]').forEach((section) => {
    section.classList.toggle('hidden', section.dataset.mode !== mode);
  });
  // Limpa erros e formulários ao trocar de modo
  document.querySelectorAll('[data-error]').forEach((el) => el.classList.add('hidden'));
}

// -----------------------------
// Submit handlers
// -----------------------------
async function handleLogin(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button[type="submit"]');
  clearErrors(form);

  const email = form.email.value.trim();
  const password = form.password.value;

  let hasError = false;
  if (!isValidEmail(email)) {
    setError(form, 'email', t('login.validacao.email_invalido', 'Informe um email válido'));
    hasError = true;
  }
  if (!isValidLoginPassword(password)) {
    setError(form, 'password', t('login.validacao.senha_minimo', 'Senha deve ter no mínimo 6 caracteres'));
    hasError = true;
  }
  if (hasError) return;

  setLoadingState(button, true);
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    showToast(t('login.toast.bem_vindo', 'Bem-vindo de volta!'), 'success');
    setTimeout(() => { window.location.href = resolveRedirect(); }, 400);
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('invalid login credentials')) {
      showToast(t('login.toast.credenciais_invalidas', 'Email ou senha incorretos'), 'error');
    } else if (msg.includes('email not confirmed')) {
      showToast(t('login.toast.email_nao_confirmado', 'Confirme seu email antes de entrar (verifique sua caixa de entrada)'), 'warning', 6000);
    } else {
      showToast(err.message || t('login.toast.erro_login', 'Erro ao fazer login'), 'error');
    }
    setLoadingState(button, false);
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button[type="submit"]');

  const nome = form.nome.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;

  if (!nome) {
    showToast(t('login.validacao.nome_obrigatorio', 'Informe seu nome'), 'error');
    return;
  }
  if (!isValidEmail(email)) {
    showToast(t('login.validacao.email_invalido', 'Informe um email válido'), 'error');
    return;
  }
  if (!isValidSignupPassword(password)) {
    showToast(t('login.validacao.senha_obrigatoria', 'A senha precisa de no mínimo 8 caracteres'), 'error');
    return;
  }

  setLoadingState(button, true);
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nome },
        emailRedirectTo: window.location.origin + '/index.html',
      },
    });
    if (error) throw error;

    if (data.session) {
      // Email confirmation desabilitado → já logado
      showToast(`Conta criada! Bem-vindo, ${nome}!`, 'success');
      setTimeout(() => { window.location.href = resolveRedirect(); }, 600);
    } else {
      // Confirmation habilitada → precisa confirmar email
      showToast(t('login.toast.conta_criada_confirmacao', 'Conta criada! Verifique seu email pra confirmar antes de entrar.'), 'success', 8000);
      form.reset();
      showMode('login');
      setLoadingState(button, false);
    }
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('already registered') || msg.includes('user already')) {
      showToast(t('login.toast.email_existe', 'Este email já está cadastrado. Tente fazer login.'), 'error');
    } else {
      showToast(err.message || t('login.toast.erro_signup', 'Erro ao criar conta'), 'error');
    }
    setLoadingState(button, false);
  }
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button[type="submit"]');

  const email = form.email.value.trim();
  if (!isValidEmail(email)) {
    showToast(t('login.validacao.email_invalido', 'Informe um email válido'), 'error');
    return;
  }

  setLoadingState(button, true);
  try {
    // Chama Edge Function customizada `send-password-reset` em vez do
    // resetPasswordForEmail default — pra ter template branded via Resend.
    // A Edge Function:
    //   1. Valida email
    //   2. Gera recovery link via admin.generateLink (service_role)
    //   3. Envia email com brand FinFlow via Resend
    //   4. Retorna sempre {ok: true} pra evitar enumeração de emails
    //
    // Fallback: se a Edge Function não estiver deployed ainda, cai pro
    // resetPasswordForEmail nativo do Supabase (template default sem brand).
    const { data, error: fnError } = await supabase.functions.invoke('send-password-reset', {
      body: {
        email,
        redirectTo: window.location.origin + '/index.html',
      },
    });

    // Fallback se Edge Function não existe (404) ou falhou de outra forma:
    // usa resetPasswordForEmail nativo (template default do Supabase).
    if (fnError || !data?.ok) {
      console.warn('[forgot] Edge Function indisponível, usando fallback nativo:', fnError);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/index.html',
      });
      if (error) throw error;
    }

    showToast(t('login.toast.link_enviado', 'Link de recuperação enviado pro seu email.'), 'success', 6000);
    form.reset();
    showMode('login');
  } catch (err) {
    showToast(err.message || t('login.toast.erro_email', 'Erro ao enviar email'), 'error');
  } finally {
    setLoadingState(button, false);
  }
}

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!isSupabaseConfigured()) {
      showToast(t('login.aviso.supabase_config', 'Configure Supabase em .env.local (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)'), 'warning', 8000);
      return;
    }
    // Captura o redirect pós-confirmação de email (PKCE: ?code=xxx na URL)
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        window.location.href = HOME_PATH;
      }
    });
    await redirectIfAuthenticated();
    const params = new URLSearchParams(window.location.search);
    if (params.get('suspenso')) {
      showToast('Sua conta está suspensa. Entre em contato com o suporte.', 'error', 8000);
    }
  } finally {
    document.body.classList.remove('body-loading');
  }

  await loadStrings();
  applyTranslationsToDom();

  // Toggle de modo (login / signup / forgot)
  document.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const map = { 'show-login': 'login', 'show-signup': 'signup', 'forgot': 'forgot' };
      const targetMode = map[el.dataset.action];
      if (targetMode) showMode(targetMode);
    });
  });

  // Toggle mostrar/ocultar senha
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // Form handlers
  document.getElementById('form-login')?.addEventListener('submit', handleLogin);
  document.getElementById('form-signup')?.addEventListener('submit', handleSignup);
  document.getElementById('form-forgot')?.addEventListener('submit', handleForgotPassword);
});
