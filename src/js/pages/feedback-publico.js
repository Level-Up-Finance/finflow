// =============================================================
// FinFlow — Página: Feedback público
// Form sem auth — qualquer um pode enviar via supabase anon key.
// Anti-spam: honeypot field (#hp-url). Se preenchido, finge sucesso.
// =============================================================
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';

document.addEventListener('DOMContentLoaded', async () => {
  await loadStrings();
  applyTranslationsToDom();
  document.getElementById('form-feedback').addEventListener('submit', onSubmit);
  document.getElementById('btn-feedback-again').addEventListener('click', resetForm);
});

async function onSubmit(e) {
  e.preventDefault();

  // Honeypot: se preenchido, é bot. Finge sucesso e não grava nada.
  const hp = document.getElementById('hp-url').value;
  if (hp) {
    showSuccess();
    return;
  }

  const type        = document.querySelector('input[name="type"]:checked')?.value;
  const name        = document.getElementById('feedback-name').value.trim() || null;
  const email       = document.getElementById('feedback-email').value.trim() || null;
  const title       = document.getElementById('feedback-title').value.trim();
  const description = document.getElementById('feedback-description').value.trim();

  if (!type || !title || !description) {
    showToast(t('feedback_publico.validacao.campos', 'Preencha tipo, título e descrição.'), 'warning');
    return;
  }

  const btn = document.getElementById('btn-feedback-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const { error } = await supabase.from('feedback').insert({
    user_id:         null,
    submitter_name:  name,
    submitter_email: email,
    type,
    title,
    description,
    status:          'novo',
  });

  btn.disabled = false;
  btn.textContent = 'Enviar feedback';

  if (error) {
    showToast('Erro ao enviar: ' + error.message, 'error', 8000);
    return;
  }

  showSuccess();
}

function showSuccess() {
  document.getElementById('feedback-card').classList.add('hidden');
  document.getElementById('feedback-success').classList.remove('hidden');
}

function resetForm() {
  const form = document.getElementById('form-feedback');
  form.reset();
  const sug = document.querySelector('input[name="type"][value="sugestao"]');
  if (sug) sug.checked = true;
  document.getElementById('feedback-success').classList.add('hidden');
  document.getElementById('feedback-card').classList.remove('hidden');
}
