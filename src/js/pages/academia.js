// =============================================================
// FinFlow — Página: Academia
// =============================================================
import { guardSession } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { TUTORIALS, TUTORIAL_ORDER, CATEGORIES } from '../lib/tutorial-content.js';
import { loadStrings, applyTranslationsToDom } from '../lib/textos.js';

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('academia');
  await loadStrings();
  applyTranslationsToDom();
  init();
});

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────
let activeCat = 'all';
let searchQuery = '';
let activeId = null;

// ─────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────
function init() {
  renderGrid();
  bindFilters();
  bindSearch();

  // Open first tutorial by default on desktop
  if (window.innerWidth >= 900) {
    openDetail(TUTORIAL_ORDER[0]);
  }
}

// ─────────────────────────────────────────────────────────────
// Filter & Search
// ─────────────────────────────────────────────────────────────
function bindFilters() {
  document.querySelectorAll('.academia-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCat = btn.dataset.cat;
      document.querySelectorAll('.academia-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGrid();
    });
  });
}

function bindSearch() {
  const input = document.getElementById('academia-search');
  input.addEventListener('input', () => {
    searchQuery = input.value.toLowerCase().trim();
    renderGrid();
  });
}

function filteredTutorials() {
  return TUTORIAL_ORDER
    .map(id => TUTORIALS[id])
    .filter(t => {
      if (activeCat !== 'all' && t.category !== activeCat) return false;
      if (searchQuery) {
        const haystack = `${t.title} ${t.tagline} ${t.sections.map(s => s.title + ' ' + s.body).join(' ')}`.toLowerCase();
        return haystack.includes(searchQuery);
      }
      return true;
    });
}

// ─────────────────────────────────────────────────────────────
// Grid render
// ─────────────────────────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('academia-grid');
  const list = filteredTutorials();

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="academia-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p>Nenhum tutorial encontrado para <strong>"${searchQuery}"</strong>.</p>
      </div>`;
    return;
  }

  grid.innerHTML = list.map(t => cardHTML(t)).join('');

  grid.querySelectorAll('.academia-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(card.dataset.id); }
    });
  });

  // Mark active card
  if (activeId) markActiveCard(activeId);
}

function cardHTML(t) {
  const catInfo = CATEGORIES[t.category] || {};
  const sectionCount = t.sections.length;
  return `
    <div class="academia-card" data-id="${t.id}" tabindex="0" role="button" aria-label="Abrir tutorial: ${t.title}">
      <div class="academia-card-icon" style="background:${t.color}18; color:${t.color};">
        ${t.icon}
      </div>
      <div class="academia-card-body">
        <span class="academia-card-cat" style="color:${catInfo.color || t.color};">${t.categoryLabel}</span>
        <h3 class="academia-card-title">${t.title}</h3>
        <p class="academia-card-tagline">${t.tagline}</p>
        <div class="academia-card-meta">
          <span>${sectionCount} seção${sectionCount > 1 ? 'ões' : ''}</span>
          ${t.tips?.length ? `<span>${t.tips.length} dica${t.tips.length > 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>
      <div class="academia-card-arrow">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>
  `;
}

function markActiveCard(id) {
  document.querySelectorAll('.academia-card').forEach(c => {
    c.classList.toggle('academia-card--active', c.dataset.id === id);
  });
}

// ─────────────────────────────────────────────────────────────
// Detail panel
// ─────────────────────────────────────────────────────────────
function openDetail(id) {
  const t = TUTORIALS[id];
  if (!t) return;

  activeId = id;
  markActiveCard(id);

  const panel = document.getElementById('academia-detail');
  const inner = document.getElementById('academia-detail-inner');

  inner.innerHTML = detailHTML(t);
  panel.classList.remove('hidden');

  // On mobile, scroll to detail
  if (window.innerWidth < 900) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Bind back button (mobile)
  inner.querySelector('.academia-detail-back')?.addEventListener('click', () => {
    panel.classList.add('hidden');
    activeId = null;
    markActiveCard(null);
  });

  // Bind open-page button
  inner.querySelector('.academia-open-page')?.addEventListener('click', () => {
    window.location.href = `/${id}.html`;
  });

  // Bind section nav
  bindSectionNav(inner, t);
}

function detailHTML(t) {
  const catInfo = CATEGORIES[t.category] || {};
  const sectionsHTML = t.sections.map((s, i) => `
    <div class="academia-section" id="acad-sec-${i}">
      <div class="academia-section-header">
        <span class="academia-section-num">${i + 1}</span>
        <h3 class="academia-section-title">${s.title}</h3>
      </div>
      <div class="academia-section-body">${s.body}</div>
    </div>
  `).join('');

  const tipsHTML = t.tips?.length ? `
    <div class="academia-tips-block">
      <div class="academia-tips-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
        Dicas para tirar o máximo desta tela
      </div>
      <ul class="academia-tips-list">
        ${t.tips.map(tip => `<li>${tip}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  // TOC
  const tocHTML = `
    <nav class="academia-toc">
      <p class="academia-toc-label">Nesta página</p>
      <ol class="academia-toc-list">
        ${t.sections.map((s, i) => `<li><a href="#acad-sec-${i}" class="academia-toc-link">${s.title}</a></li>`).join('')}
        ${t.tips?.length ? `<li><a href="#acad-tips" class="academia-toc-link">Dicas</a></li>` : ''}
      </ol>
    </nav>
  `;

  return `
    <button type="button" class="academia-detail-back">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      Voltar
    </button>

    <div class="academia-detail-hero" style="border-left: 4px solid ${t.color};">
      <div class="academia-detail-icon" style="background:${t.color}18; color:${t.color};">${t.icon}</div>
      <div>
        <span class="academia-detail-cat" style="color:${catInfo.color || t.color};">${t.categoryLabel}</span>
        <h2 class="academia-detail-title">${t.title}</h2>
        <p class="academia-detail-tagline">${t.tagline}</p>
      </div>
    </div>

    <div class="academia-detail-columns">
      <div class="academia-detail-content">
        ${sectionsHTML}
        <div id="acad-tips">${tipsHTML}</div>
      </div>
      <aside class="academia-detail-aside">
        ${tocHTML}
        <button type="button" class="btn btn-primary academia-open-page" style="width:100%; margin-top: var(--space-4);">
          Abrir esta tela
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
      </aside>
    </div>
  `;
}

function bindSectionNav(inner, t) {
  // Smooth scroll TOC links
  inner.querySelectorAll('.academia-toc-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = inner.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}
