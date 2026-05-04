// =============================================================
// FinFlow — Página: Novidades
// =============================================================
import { guardSession } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { CHANGELOG } from '../lib/changelog.js';
import { escapeHtml } from '../lib/utils.js';

const LS_KEY = 'finflow:changelog:seen';
const TYPE_LABELS = { new: 'Novidade', fix: 'Correção', improvement: 'Melhoria' };

function markSeen() {
  if (CHANGELOG.length > 0) localStorage.setItem(LS_KEY, CHANGELOG[0].id);
}

function render() {
  const container = document.getElementById('novidades-content');
  if (!container) return;

  if (CHANGELOG.length === 0) {
    container.innerHTML = '<p class="field-hint">Nenhuma versão registrada ainda.</p>';
    return;
  }

  container.innerHTML = `<div class="cfg-changelog-list">${CHANGELOG.map((entry) => `
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
    </div>
  `).join('')}</div>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  markSeen();           // marca antes do sidebar pra não mostrar badge na própria página
  await initSidebar('novidades');
  render();
});
