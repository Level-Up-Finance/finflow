// =============================================================
// FinFlow — Página: Meu perfil (Fase 6.C)
//
// Edita campos da tabela `profiles` e faz upload de foto pro
// Storage bucket `avatars` (path: <user_id>/<timestamp>.<ext>).
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { escapeHtml, getInitials, showConfirm } from '../lib/utils.js';

let cachedProfile = null;
let userId = null;
let userEmail = null;

const FIELDS = ['nome', 'apelido', 'bio', 'instagram', 'twitter', 'linkedin'];

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar(null); // não destaca nenhum item — perfil não está no nav

  const user = await getCurrentUser();
  if (!user) return;
  userId = user.id;
  userEmail = user.email;

  await loadProfile();
  bindEvents();
});

// -----------------------------
// Load
// -----------------------------
async function loadProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    showToast('Erro ao carregar perfil: ' + error.message, 'error', 8000);
    return;
  }

  cachedProfile = data || {};

  // Preenche campos
  document.getElementById('perfil-email').value = userEmail || '';
  for (const field of FIELDS) {
    const el = document.getElementById(`perfil-${field}`);
    if (el) el.value = cachedProfile[field] || '';
  }

  renderFotoDisplay(cachedProfile.foto_url, cachedProfile.nome || cachedProfile.apelido || userEmail);
}

function renderFotoDisplay(fotoUrl, nameForFallback) {
  const display = document.getElementById('perfil-foto-display');
  if (fotoUrl) {
    display.innerHTML = `<img src="${escapeHtml(fotoUrl)}" alt="Foto de perfil" class="perfil-foto-img">`;
  } else {
    const initials = getInitials(nameForFallback);
    display.innerHTML = `<span class="perfil-foto-placeholder">${escapeHtml(initials)}</span>`;
  }
}

// -----------------------------
// Bind events
// -----------------------------
function bindEvents() {
  // Inputs → habilitar Salvar
  for (const field of FIELDS) {
    const el = document.getElementById(`perfil-${field}`);
    if (el) el.addEventListener('input', updateSaveButton);
  }

  // Submit (form)
  document.getElementById('form-perfil').addEventListener('submit', (e) => {
    e.preventDefault();
    saveProfile();
  });

  // Cancelar → recarrega valores
  document.getElementById('btn-perfil-cancelar').addEventListener('click', () => {
    loadProfile();
    updateSaveButton();
  });

  // Foto: upload
  document.getElementById('btn-foto-upload').addEventListener('click', () => {
    document.getElementById('perfil-foto-input').click();
  });
  document.getElementById('perfil-foto-input').addEventListener('change', handleFotoChange);

  // Foto: remover
  document.getElementById('btn-foto-remove').addEventListener('click', removeFoto);
}

function updateSaveButton() {
  const btn = document.getElementById('btn-perfil-salvar');
  let changed = false;
  for (const field of FIELDS) {
    const el = document.getElementById(`perfil-${field}`);
    if (!el) continue;
    const cur = (el.value || '').trim();
    const old = (cachedProfile?.[field] || '').trim();
    if (cur !== old) { changed = true; break; }
  }
  btn.disabled = !changed;
}

// -----------------------------
// Save (campos texto)
// -----------------------------
async function saveProfile() {
  const btn = document.getElementById('btn-perfil-salvar');
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  const payload = {};
  for (const field of FIELDS) {
    const el = document.getElementById(`perfil-${field}`);
    if (!el) continue;
    const v = (el.value || '').trim();
    payload[field] = v || null;
  }

  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId);

  if (error) {
    btn.disabled = false;
    btn.textContent = original;
    showToast('Erro ao salvar: ' + error.message, 'error', 8000);
    return;
  }

  cachedProfile = { ...cachedProfile, ...payload };
  btn.disabled = true;
  btn.textContent = original;
  showToast('Perfil atualizado', 'success');
}

// -----------------------------
// Foto: upload
// -----------------------------
async function handleFotoChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Arquivo precisa ser uma imagem', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Imagem maior que 5 MB. Reduza antes de subir.', 'error', 6000);
    return;
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  showToast('Enviando foto…', 'info', 2000);

  const { error: upError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (upError) {
    showToast('Erro ao enviar: ' + upError.message, 'error', 8000);
    return;
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
  const fotoUrl = urlData?.publicUrl;
  if (!fotoUrl) {
    showToast('Não foi possível gerar a URL pública da foto', 'error', 8000);
    return;
  }

  // Salva no profile e atualiza display
  const { error: updError } = await supabase
    .from('profiles')
    .update({ foto_url: fotoUrl })
    .eq('id', userId);

  if (updError) {
    showToast('Erro ao salvar URL: ' + updError.message, 'error', 8000);
    return;
  }

  cachedProfile.foto_url = fotoUrl;
  renderFotoDisplay(fotoUrl, cachedProfile.nome || cachedProfile.apelido || userEmail);
  showToast('Foto atualizada', 'success');

  // Reset input pra permitir re-upload do mesmo arquivo
  e.target.value = '';
}

// -----------------------------
// Foto: remover
// -----------------------------
async function removeFoto() {
  if (!cachedProfile?.foto_url) {
    showToast('Você não tem foto ainda', 'info');
    return;
  }
  if (!await showConfirm('Remover a foto do seu perfil?', { okLabel: 'Remover' })) return;

  const { error } = await supabase
    .from('profiles')
    .update({ foto_url: null })
    .eq('id', userId);

  if (error) {
    showToast('Erro ao remover: ' + error.message, 'error', 8000);
    return;
  }

  cachedProfile.foto_url = null;
  renderFotoDisplay(null, cachedProfile.nome || cachedProfile.apelido || userEmail);
  showToast('Foto removida', 'success');
}

// -----------------------------
