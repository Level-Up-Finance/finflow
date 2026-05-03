// =============================================================
// FinFlow — Página: Login (Fase 1)
// Login + Signup + Forgot password
// =============================================================
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { redirectIfAuthenticated } from '../lib/auth.js';
import { showToast } from '../components/toast.js';

const HOME_PATH = '/dashboard.html';

// -----------------------------
// Helpers
// -----------------------------
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPassword = (password) => password.length >= 6;

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
    setError(form, 'email', 'Informe um email válido');
    hasError = true;
  }
  if (!isValidPassword(password)) {
    setError(form, 'password', 'Senha deve ter no mínimo 6 caracteres');
    hasError = true;
  }
  if (hasError) return;

  setLoadingState(button, true);
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    showToast('Bem-vindo de volta!', 'success');
    setTimeout(() => { window.location.href = HOME_PATH; }, 400);
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('invalid login credentials')) {
      showToast('Email ou senha incorretos', 'error');
    } else if (msg.includes('email not confirmed')) {
      showToast('Confirme seu email antes de entrar (verifique sua caixa de entrada)', 'warning', 6000);
    } else {
      showToast(err.message || 'Erro ao fazer login', 'error');
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
    showToast('Informe seu nome', 'error');
    return;
  }
  if (!isValidEmail(email)) {
    showToast('Informe um email válido', 'error');
    return;
  }
  if (!isValidPassword(password)) {
    showToast('A senha precisa de no mínimo 6 caracteres', 'error');
    return;
  }

  setLoadingState(button, true);
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome } }
    });
    if (error) throw error;

    if (data.session) {
      // Email confirmation desabilitado → já logado
      showToast(`Conta criada! Bem-vindo, ${nome}!`, 'success');
      setTimeout(() => { window.location.href = HOME_PATH; }, 600);
    } else {
      // Confirmation habilitada → precisa confirmar email
      showToast('Conta criada! Verifique seu email pra confirmar antes de entrar.', 'success', 8000);
      form.reset();
      showMode('login');
      setLoadingState(button, false);
    }
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('already registered') || msg.includes('user already')) {
      showToast('Este email já está cadastrado. Tente fazer login.', 'error');
    } else {
      showToast(err.message || 'Erro ao criar conta', 'error');
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
    showToast('Informe um email válido', 'error');
    return;
  }

  setLoadingState(button, true);
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/index.html',
    });
    if (error) throw error;
    showToast('Link de recuperação enviado pro seu email.', 'success', 6000);
    form.reset();
    showMode('login');
  } catch (err) {
    showToast(err.message || 'Erro ao enviar email', 'error');
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
      showToast('Configure Supabase em src/js/lib/config.js', 'warning', 8000);
      return;
    }
    await redirectIfAuthenticated();
  } finally {
    document.body.style.visibility = 'visible';
  }

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
