// =============================================================
// FinFlow — Página: Feedback (logado)
// Form pra enviar bugs/sugestões/features + lista das próprias entradas
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { escapeHtml } from '../lib/utils.js';

let userId = null;

const TYPE_LABELS = {
  bug:      'Bug',
  sugestao: 'Sugestão',
  feature:  'Funcionalidade',
  pergunta: 'Pergunta',
  elogio:   'Elogio',
  parceria: 'Parceria',
};

const STATUS_LABELS = {
  novo:         'Novo',
  em_progresso: 'Em progresso',
  feito:        'Feito',
  descartado:   'Descartado',
};

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar(null);

  const user = await getCurrentUser();
  if (!user) return;
  userId = user.id;

  bindEvents();
  await loadMine();
});

function bindEvents() {
  document.getElementById('form-feedback').addEventListener('submit', onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();

  const type        = document.querySelector('input[name="type"]:checked')?.value;
  const title       = document.getElementById('feedback-title').value.trim();
  const description = document.getElementById('feedback-description').value.trim();

  if (!type || !title || !description) {
    showToast('Preencha todos os campos.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-feedback-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const { error } = await supabase.from('feedback').insert({
    user_id:     userId,
    type,
    title,
    description,
    status:      'novo',
  });

  btn.disabled = false;
  btn.textContent = 'Enviar';

  if (error) {
    showToast('Erro ao enviar: ' + error.message, 'error', 8000);
    return;
  }

  showToast('Enviado! Obrigado pelo feedback.', 'success');
  document.getElementById('form-feedback').reset();
  // Garante que o radio "sugestao" volta selecionado
  const sug = document.querySelector('input[name="type"][value="sugestao"]');
  if (sug) sug.checked = true;
  await loadMine();
}

// -----------------------------
// Lista das próprias entradas
// -----------------------------
async function loadMine() {
  const loading = document.getElementById('feedback-mine-loading');
  const list    = document.getElementById('feedback-mine-list');
  const empty   = document.getElementById('feedback-mine-empty');

  loading.classList.remove('hidden');
  list.classList.add('hidden');
  empty.classList.add('hidden');

  const { data, error } = await supabase
    .from('feedback')
    .select('id, type, title, description, status, created_at, changelog_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  loading.classList.add('hidden');

  if (error) {
    showToast('Erro ao carregar suas entradas: ' + error.message, 'error', 8000);
    return;
  }

  if (!data?.length) {
    empty.classList.remove('hidden');
    return;
  }

  const groups = [
    { label: 'Novo',                 items: data.filter((f) => f.status === 'novo') },
    { label: 'Em progresso',         items: data.filter((f) => f.status === 'em_progresso') },
    { label: 'Feito & descartado',   items: data.filter((f) => f.status === 'feito' || f.status === 'descartado') },
  ];

  list.innerHTML = groups
    .filter((g) => g.items.length)
    .map(renderGroup)
    .join('');
  list.classList.remove('hidden');
}

function renderGroup(group) {
  return `
    <div class="feedback-group">
      <h3 class="feedback-group-title">
        ${escapeHtml(group.label)}
        <span class="feedback-group-count">${group.items.length}</span>
      </h3>
      <div class="feedback-group-list">
        ${group.items.map(renderCard).join('')}
      </div>
    </div>
  `;
}

function renderCard(fb) {
  const typeLabel   = TYPE_LABELS[fb.type] || fb.type;
  const statusLabel = STATUS_LABELS[fb.status] || fb.status;
  const date        = new Date(fb.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  return `
    <article class="feedback-card">
      <header class="feedback-card-header">
        <span class="feedback-type-pill feedback-type-pill--${fb.type}">${escapeHtml(typeLabel)}</span>
        <span class="feedback-status-badge feedback-status-badge--${fb.status}">${escapeHtml(statusLabel)}</span>
        <span class="feedback-card-date">${escapeHtml(date)}</span>
      </header>
      <h3 class="feedback-card-title">${escapeHtml(fb.title)}</h3>
      <p class="feedback-card-desc">${escapeHtml(fb.description)}</p>
    </article>
  `;
}
