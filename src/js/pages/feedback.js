// =============================================================
// FinFlow — Página: Feedback (logado)
// Form pra enviar bugs/sugestões/features + lista das próprias entradas
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { escapeHtml } from '../lib/utils.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';

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
  em_analise:   'Em análise',
  em_progresso: 'Em progresso',
  feito:        'Feito',
  agora_nao:    'Agora não',
};

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar(null);
  await loadStrings();
  applyTranslationsToDom();

  const user = await getCurrentUser();
  if (!user) return;
  userId = user.id;

  bindEvents();
  await loadMine();
});

function bindEvents() {
  document.getElementById('form-feedback').addEventListener('submit', onSubmit);

  document.getElementById('btn-close-fbd').addEventListener('click',  closeDetailModal);
  document.getElementById('btn-cancel-fbd').addEventListener('click', closeDetailModal);
  document.getElementById('modal-fb-detail').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDetailModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetailModal();
  });
}

async function onSubmit(e) {
  e.preventDefault();

  const type        = document.querySelector('input[name="type"]:checked')?.value;
  const title       = document.getElementById('feedback-title').value.trim();
  const description = document.getElementById('feedback-description').value.trim();

  if (!type || !title || !description) {
    showToast(t('feedback.validacao.campos_obrigatorios', 'Preencha todos os campos.'), 'warning');
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

  showToast(t('feedback.toast.enviado', 'Enviado! Obrigado pelo feedback.'), 'success');
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
    .select('id, codigo, type, title, description, status, created_at, updated_at, changelog_id, resposta_usuario')
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

  list.innerHTML = renderTable(data);
  list.classList.remove('hidden');
  initDetailModal(data);
}

// ── Tabela agrupada ───────────────────────────────────────────
const GROUPS = [
  { label: t('feedback.group.novas', 'Novas'),                    statuses: ['novo'] },
  { label: t('feedback.group.analise', 'Em análise e em andamento'), statuses: ['em_analise', 'em_progresso'] },
  { label: t('feedback.group.concluidas', 'Concluídas e rejeitadas'),  statuses: ['feito', 'agora_nao'] },
];

function renderTable(items) {
  const thead = `
    <thead>
      <tr>
        <th class="ft-th-codigo">Código</th>
        <th class="ft-th-type">Tipo</th>
        <th>Título</th>
        <th>Descrição</th>
        <th class="ft-th-status">Status</th>
        <th class="ft-th-retorno">Retorno</th>
        <th class="ft-th-date">Criada</th>
        <th class="ft-th-date">Concluído</th>
      </tr>
    </thead>`;

  const bodies = GROUPS.map((group) => {
    const filtered = items.filter((f) => group.statuses.includes(f.status));
    if (!filtered.length) return '';

    const rows = filtered.map((fb) => {
      const typeLabel   = TYPE_LABELS[fb.type]    || fb.type;
      const statusLabel = STATUS_LABELS[fb.status] || fb.status;
      const criada      = new Date(fb.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      const concluido   = (fb.status === 'feito' || fb.status === 'agora_nao') && fb.updated_at
        ? new Date(fb.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '—';
      return `
        <tr class="ft-row fb-mine-row" data-id="${fb.id}">
          <td><span class="i18n-chave">${escapeHtml(fb.codigo || '—')}</span></td>
          <td><span class="feedback-type-pill feedback-type-pill--${fb.type}">${escapeHtml(typeLabel)}</span></td>
          <td class="fb-col-title">${escapeHtml(fb.title)}</td>
          <td class="fb-col-desc">${escapeHtml(truncate(fb.description, 100))}</td>
          <td><span class="feedback-status-badge feedback-status-badge--${fb.status}">${escapeHtml(statusLabel)}</span></td>
          <td class="fb-col-retorno">${fb.resposta_usuario ? escapeHtml(truncate(fb.resposta_usuario, 60)) : '<span style="color:var(--color-text-tertiary)">—</span>'}</td>
          <td class="ft-td-date">${escapeHtml(criada)}</td>
          <td class="ft-td-date">${escapeHtml(concluido)}</td>
        </tr>`;
    }).join('');

    return `
      <tbody>
        <tr class="fb-group-header-row">
          <td colspan="8">
            <span class="fb-group-header-label">${escapeHtml(group.label)}</span>
            <span class="feedback-group-count">${filtered.length}</span>
          </td>
        </tr>
        ${rows}
      </tbody>`;
  }).join('');

  return `<table class="table fb-mine-table">${thead}${bodies}</table>`;
}

function truncate(text, n) {
  if (!text) return '';
  return text.length > n ? text.slice(0, n - 1) + '…' : text;
}

// ── Modal de detalhe ──────────────────────────────────────────
function initDetailModal(items) {
  document.querySelectorAll('.fb-mine-row').forEach((row) => {
    const fb = items.find((f) => f.id === row.dataset.id);
    if (!fb) return;
    row.addEventListener('click', () => openDetailModal(fb));
  });
}

function openDetailModal(fb) {
  const date        = new Date(fb.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const typeLabel   = TYPE_LABELS[fb.type]    || fb.type;
  const statusLabel = STATUS_LABELS[fb.status] || fb.status;

  document.getElementById('fbd-codigo').textContent = fb.codigo || '';
  document.getElementById('fbd-meta').innerHTML =
    `<span class="feedback-type-pill feedback-type-pill--${fb.type}">${escapeHtml(typeLabel)}</span>` +
    `<span class="feedback-status-badge feedback-status-badge--${fb.status}">${escapeHtml(statusLabel)}</span>`;
  document.getElementById('fbd-title').textContent = fb.title;
  document.getElementById('fbd-desc').textContent  = fb.description;

  const retornoWrap = document.getElementById('fbd-retorno-wrap');
  if (fb.resposta_usuario) {
    document.getElementById('fbd-retorno').textContent = fb.resposta_usuario;
    retornoWrap.classList.remove('hidden');
  } else {
    retornoWrap.classList.add('hidden');
  }

  document.getElementById('fbd-date').textContent  = `Enviado em ${date}`;

  document.getElementById('modal-fb-detail').classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('modal-fb-detail').classList.add('hidden');
}
