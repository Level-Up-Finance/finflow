// =============================================================
// FinFlow — Página: Novidades
// Mostra changelog estático + roadmap (feedback em_progresso) +
// vincula feedbacks "feito" às entradas do changelog que os atendem.
// =============================================================
import { guardSession } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { CHANGELOG } from '../lib/changelog.js';
import { supabase } from '../lib/supabase.js';
import { escapeHtml } from '../lib/utils.js';

const LS_KEY = 'finflow:changelog:seen';
const TYPE_LABELS = { new: 'Novidade', fix: 'Correção', improvement: 'Melhoria' };

const FB_TYPE_LABELS = {
  bug:      'Bug',
  sugestao: 'Sugestão',
  feature:  'Funcionalidade',
  pergunta: 'Pergunta',
  elogio:   'Elogio',
  parceria: 'Parceria',
};

function markSeen() {
  if (CHANGELOG.length > 0) localStorage.setItem(LS_KEY, CHANGELOG[0].id);
}

async function loadFeedback() {
  const { data, error } = await supabase
    .from('feedback')
    .select('id, type, title, status, changelog_id')
    .in('status', ['em_progresso', 'feito']);

  if (error) {
    console.debug('[novidades] feedback load failed:', error.message);
    return [];
  }
  return data || [];
}

function renderRoadmap(feedbacks) {
  const inProgress = feedbacks.filter((f) => f.status === 'em_progresso');
  const section = document.getElementById('roadmap-section');
  const list    = document.getElementById('roadmap-list');

  if (!inProgress.length) {
    section.classList.add('hidden');
    return;
  }

  list.innerHTML = inProgress.map((fb) => `
    <article class="roadmap-card">
      <span class="feedback-type-pill feedback-type-pill--${fb.type}">${escapeHtml(FB_TYPE_LABELS[fb.type] || fb.type)}</span>
      <h3 class="roadmap-card-title">${escapeHtml(fb.title)}</h3>
    </article>
  `).join('');
  section.classList.remove('hidden');
}

function renderChangelog(feedbacks) {
  const container = document.getElementById('changelog-content');
  if (!container) return;

  if (CHANGELOG.length === 0) {
    container.innerHTML = '<p class="field-hint">Nenhuma versão registrada ainda.</p>';
    return;
  }

  // Agrupa feedbacks "feito" por changelog_id
  const byChangelog = new Map();
  for (const fb of feedbacks) {
    if (fb.status !== 'feito' || !fb.changelog_id) continue;
    if (!byChangelog.has(fb.changelog_id)) byChangelog.set(fb.changelog_id, []);
    byChangelog.get(fb.changelog_id).push(fb);
  }

  container.innerHTML = `<div class="cfg-changelog-list">${CHANGELOG.map((entry) => {
    const linkedFb = byChangelog.get(entry.id) || [];
    const linkedHtml = linkedFb.length ? `
      <div class="changelog-feedback-credit">
        <span class="changelog-feedback-label">Atende sugestões:</span>
        <ul class="changelog-feedback-list">
          ${linkedFb.map((fb) => `
            <li>
              <span class="feedback-type-pill feedback-type-pill--${fb.type} feedback-type-pill--xs">${escapeHtml(FB_TYPE_LABELS[fb.type] || fb.type)}</span>
              <span>${escapeHtml(fb.title)}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    ` : '';

    return `
      <div class="cfg-changelog-entry">
        <div class="cfg-changelog-header">
          <span class="cfg-changelog-title">${entry.version ? `<span class="cfg-changelog-version">v${escapeHtml(entry.version)}</span> ` : ''}${escapeHtml(entry.title)}</span>
          <span class="cfg-changelog-date">${escapeHtml(entry.date)}</span>
        </div>
        <ul class="cfg-changelog-items">
          ${entry.items.map((item) => `
            <li class="cfg-changelog-item">
              <span class="cfg-changelog-type cfg-changelog-type--${item.type}">${TYPE_LABELS[item.type] || item.type}</span>
              <span>${escapeHtml(item.text)}</span>
            </li>
          `).join('')}
        </ul>
        ${linkedHtml}
      </div>
    `;
  }).join('')}</div>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  markSeen();
  await initSidebar('novidades');

  const feedbacks = await loadFeedback();
  renderRoadmap(feedbacks);
  renderChangelog(feedbacks);
});
