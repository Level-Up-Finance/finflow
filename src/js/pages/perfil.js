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
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';
import { PhonePicker } from '../components/phone-picker.js';
import { AddressPicker, renderAddressFieldsHtml } from '../components/address-picker.js';

let cachedProfile = null;
let userId = null;
let userEmail = null;

// Phone pickers
let ppTelefone = null;
let ppWhatsapp = null;

// Address picker
let apPerfil = null;

const FIELDS = [
  'nome', 'apelido', 'telefone', 'bio',
  'whatsapp', 'website',
  'empresa', 'cargo', 'aniversario',
  'instagram', 'twitter', 'linkedin',
];

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar(null); // não destaca nenhum item — perfil não está no nav
  await loadStrings();
  applyTranslationsToDom();

  const user = await getCurrentUser();
  if (!user) return;
  userId = user.id;
  userEmail = user.email;

  initPhonePickers();
  initAddressPicker();
  await loadProfile();
  bindEvents();
  bindDangerZoneEvents();
});

// -----------------------------
// Phone pickers
// -----------------------------
function initPhonePickers() {
  const elTel = document.getElementById('perfil-telefone');
  const elWa  = document.getElementById('perfil-whatsapp');
  if (elTel) ppTelefone = new PhonePicker(elTel, { placeholder: '(11) 99999-9999' });
  if (elWa)  ppWhatsapp = new PhonePicker(elWa,  { placeholder: '(11) 99999-9999' });
}

// -----------------------------
// Address picker
// -----------------------------
function initAddressPicker() {
  const container = document.getElementById('perfil-address-picker');
  if (!container) return;
  container.innerHTML = renderAddressFieldsHtml('perfil-');
  apPerfil = new AddressPicker('perfil-', document);
}

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
    if (field === 'telefone' || field === 'whatsapp') continue; // gerenciados pelo PhonePicker
    const el = document.getElementById(`perfil-${field}`);
    if (el) el.value = cachedProfile[field] || '';
  }

  // Phone pickers
  if (ppTelefone) ppTelefone.setValue(cachedProfile.telefone || '');
  if (ppWhatsapp) ppWhatsapp.setValue(cachedProfile.whatsapp || '');

  // Address picker
  if (apPerfil) apPerfil.setValue(cachedProfile);

  // "Mesmo número" — detecta se os dois são iguais
  const mesmoEl = document.getElementById('perfil-mesmo-numero');
  if (mesmoEl && cachedProfile.telefone && cachedProfile.whatsapp) {
    mesmoEl.checked = cachedProfile.telefone === cachedProfile.whatsapp;
    if (ppWhatsapp) ppWhatsapp.setDisabled(mesmoEl.checked);
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

  // Address fields → habilitar Salvar
  ['cep','logradouro','numero','complemento','bairro','cidade','estado-uf'].forEach((id) => {
    const el = document.getElementById(`perfil-${id}`);
    if (el) el.addEventListener('input', updateSaveButton);
  });

  // "Mesmo número" toggle
  const mesmoEl = document.getElementById('perfil-mesmo-numero');
  if (mesmoEl) {
    mesmoEl.addEventListener('change', () => {
      if (!ppWhatsapp || !ppTelefone) return;
      ppWhatsapp.setDisabled(mesmoEl.checked);
      if (mesmoEl.checked) {
        ppWhatsapp.syncFrom(ppTelefone);
      }
      updateSaveButton();
    });
  }

  // Quando telefone muda e "mesmo número" está marcado → espelha no whatsapp
  const telInput = document.getElementById('perfil-telefone');
  if (telInput) {
    telInput.addEventListener('input', () => {
      if (mesmoEl?.checked && ppWhatsapp && ppTelefone) {
        ppWhatsapp.syncFrom(ppTelefone);
      }
      updateSaveButton();
    });
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
    if (field === 'telefone' || field === 'whatsapp') continue; // via PhonePicker
    const el = document.getElementById(`perfil-${field}`);
    if (!el) continue;
    const cur = (el.value || '').trim();
    const old = (cachedProfile?.[field] || '').trim();
    if (cur !== old) { changed = true; break; }
  }

  // Check phone pickers
  if (!changed && ppTelefone && (ppTelefone.getValue() || '') !== (cachedProfile?.telefone || '')) changed = true;
  if (!changed && ppWhatsapp && (ppWhatsapp.getValue() || '') !== (cachedProfile?.whatsapp || '')) changed = true;

  // Check address fields
  if (!changed && apPerfil) {
    const addr = apPerfil.getValue();
    const addrFields = ['cep','logradouro','numero','complemento','bairro','cidade','estado_uf'];
    for (const f of addrFields) {
      if ((addr[f] || '') !== (cachedProfile?.[f] || '')) { changed = true; break; }
    }
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

  // Address fields
  if (apPerfil) {
    const addr = apPerfil.getValue();
    Object.keys(addr).forEach((k) => { payload[k] = addr[k] || null; });
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
  showToast(t('perfil.toast.atualizado', 'Perfil atualizado'), 'success');
}

// -----------------------------
// Foto: upload
// -----------------------------
async function handleFotoChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast(t('perfil.validacao.arquivo_imagem', 'Arquivo precisa ser uma imagem'), 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast(t('perfil.validacao.imagem_tamanho', 'Imagem maior que 5 MB. Reduza antes de subir.'), 'error', 6000);
    return;
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  showToast(t('perfil.toast.enviando_foto', 'Enviando foto…'), 'info', 2000);

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
    showToast(t('perfil.toast.erro_url_foto', 'Não foi possível gerar a URL pública da foto'), 'error', 8000);
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
  showToast(t('perfil.toast.foto_atualizada', 'Foto atualizada'), 'success');

  // Reset input pra permitir re-upload do mesmo arquivo
  e.target.value = '';
}

// -----------------------------
// Zona de perigo
// -----------------------------
const DANGER_CONFIG = {
  reset: {
    step1Title: 'Restaurar conta do zero',
    step2Title: 'Confirmação final — restaurar',
    step2Note:  'Todos os seus dados financeiros serão apagados permanentemente.',
    consequences: [
      'Todas as transações serão apagadas',
      'Todas as contas bancárias serão removidas',
      'Todas as categorias e subcategorias personalizadas serão excluídas',
      'Todos os compromissos, dívidas e investimentos serão deletados',
      'Seu perfil (nome, foto, bio) voltará ao estado inicial',
      'Seu e-mail e senha são mantidos — você não será deslogado',
    ],
  },
  delete: {
    step1Title: 'Excluir conta permanentemente',
    step2Title: 'Confirmação final — excluir conta',
    step2Note:  'Sua conta será removida para sempre. Você será deslogado imediatamente.',
    consequences: [
      'Todos os seus dados financeiros serão apagados para sempre',
      'Seu perfil, configurações e histórico serão removidos',
      'Você será deslogado imediatamente após a confirmação',
      'O e-mail ficará livre para criar uma nova conta do zero',
      'Não há backup — não é possível recuperar nada',
    ],
  },
};

let currentDangerAction = null;

function openDangerStep1(action) {
  const cfg = DANGER_CONFIG[action];
  currentDangerAction = action;
  document.getElementById('danger-step1-title').textContent = cfg.step1Title;
  document.getElementById('danger-step1-consequences').innerHTML =
    cfg.consequences.map((c) => `<li>${escapeHtml(c)}</li>`).join('');
  document.getElementById('modal-danger-step1').classList.remove('hidden');
}

function closeDangerStep1() {
  document.getElementById('modal-danger-step1').classList.add('hidden');
  currentDangerAction = null;
}

function openDangerStep2() {
  const cfg = DANGER_CONFIG[currentDangerAction];
  document.getElementById('danger-step2-title').textContent = cfg.step2Title;
  document.getElementById('danger-step2-note').textContent  = cfg.step2Note;
  document.getElementById('danger-email-confirm').value     = '';
  document.getElementById('btn-danger-step2-confirm').disabled = true;
  document.getElementById('modal-danger-step1').classList.add('hidden');
  document.getElementById('modal-danger-step2').classList.remove('hidden');
}

function closeDangerStep2() {
  document.getElementById('modal-danger-step2').classList.add('hidden');
  currentDangerAction = null;
}

async function executeDangerAction() {
  const action = currentDangerAction;
  const btn = document.getElementById('btn-danger-step2-confirm');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Aguarde…';

  try {
    if (action === 'reset') {
      const { error } = await supabase.rpc('user_reset_account');
      if (error) throw error;
      closeDangerStep2();
      showToast('Conta restaurada. Todos os dados foram apagados.', 'success', 6000);
      await loadProfile();
    } else if (action === 'delete') {
      const { error } = await supabase.rpc('user_delete_account');
      if (error) throw error;
      await supabase.auth.signOut();
      window.location.href = '/index.html';
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Confirmar';
    showToast('Erro: ' + err.message, 'error', 8000);
  }
}

function bindDangerZoneEvents() {
  document.getElementById('btn-danger-reset').addEventListener('click',  () => openDangerStep1('reset'));
  document.getElementById('btn-danger-delete').addEventListener('click', () => openDangerStep1('delete'));

  document.getElementById('btn-close-danger-step1').addEventListener('click',  closeDangerStep1);
  document.getElementById('btn-danger-step1-cancel').addEventListener('click', closeDangerStep1);
  document.getElementById('btn-danger-step1-next').addEventListener('click',   openDangerStep2);

  document.getElementById('btn-close-danger-step2').addEventListener('click',  closeDangerStep2);
  document.getElementById('btn-danger-step2-cancel').addEventListener('click', closeDangerStep2);
  document.getElementById('btn-danger-step2-confirm').addEventListener('click', executeDangerAction);

  document.getElementById('danger-email-confirm').addEventListener('input', (e) => {
    const match = e.target.value.trim().toLowerCase() === (userEmail || '').toLowerCase();
    document.getElementById('btn-danger-step2-confirm').disabled = !match;
  });

  ['modal-danger-step1', 'modal-danger-step2'].forEach((id) => {
    document.getElementById(id).addEventListener('click', (e) => {
      if (e.target.id === id) { closeDangerStep1(); closeDangerStep2(); }
    });
  });
}

// -----------------------------
// Foto: remover
// -----------------------------
async function removeFoto() {
  if (!cachedProfile?.foto_url) {
    showToast(t('perfil.toast.sem_foto', 'Você não tem foto ainda'), 'info');
    return;
  }
  if (!await showConfirm(t('perfil.confirm.remover_foto', 'Remover a foto do seu perfil?'), { okLabel: 'Remover' })) return;

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
  showToast(t('perfil.toast.foto_removida', 'Foto removida'), 'success');
}

// -----------------------------
