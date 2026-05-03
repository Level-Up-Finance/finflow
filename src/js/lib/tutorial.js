// =============================================================
// FinFlow — Tutorial Popup System
// • Mostra popup de onboarding na primeira visita a cada tela
// • Injeta botão de ajuda no header para reabrir o tutorial
// • Estado de "já visto" salvo em localStorage
// =============================================================
import { TUTORIALS } from './tutorial-content.js';

const STORAGE_PREFIX = 'finflow_tutorial_seen_';
const MODAL_ID = 'tutorial-modal';

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Inicializa o sistema de tutorial para uma tela específica.
 * Injeta o botão de ajuda no header e exibe o popup na 1ª visita.
 * @param {string} pageId  Chave do tutorial (ex: 'contas', 'dashboard')
 */
export function initTutorial(pageId) {
  const tutorial = TUTORIALS[pageId];
  if (!tutorial) return;

  injectHelpButton(pageId, tutorial);

  const seen = localStorage.getItem(STORAGE_PREFIX + pageId);
  if (!seen) {
    setTimeout(() => showTutorial(pageId), 600);
  }
}

/**
 * Abre o modal de tutorial manualmente (chamado pelo botão de ajuda).
 */
export function showTutorial(pageId) {
  const tutorial = TUTORIALS[pageId];
  if (!tutorial) return;
  renderModal(tutorial, pageId);
}

// ─────────────────────────────────────────────────────────────
// Help button injection
// ─────────────────────────────────────────────────────────────

function injectHelpButton(pageId, tutorial) {
  // Evita duplicatas se initTutorial for chamado mais de uma vez
  if (document.getElementById('tutorial-help-btn')) return;

  const headerLeft = document.querySelector('.header-left');
  if (!headerLeft) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'tutorial-help-btn';
  btn.className = 'tutorial-help-btn';
  btn.setAttribute('aria-label', 'Ver tutorial desta tela');
  btn.title = `Tutorial: ${tutorial.title}`;
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <path d="M12 17h.01"/>
    </svg>
    <span>Tutorial</span>
  `;
  btn.addEventListener('click', () => showTutorial(pageId));
  headerLeft.appendChild(btn);
}

// ─────────────────────────────────────────────────────────────
// Modal render
// ─────────────────────────────────────────────────────────────

function renderModal(tutorial, pageId) {
  // Remove modal anterior se existir
  const existing = document.getElementById(MODAL_ID);
  if (existing) existing.remove();

  const totalSections = tutorial.sections.length;
  let currentSection = 0;

  const backdrop = document.createElement('div');
  backdrop.id = MODAL_ID;
  backdrop.className = 'tutorial-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', `Tutorial: ${tutorial.title}`);

  backdrop.innerHTML = buildModalHTML(tutorial, currentSection, totalSections);
  document.body.appendChild(backdrop);

  // Bind events
  bindModalEvents(backdrop, tutorial, pageId, { current: currentSection, total: totalSections });

  // Animate in
  requestAnimationFrame(() => backdrop.classList.add('tutorial-backdrop--visible'));

  // Trap focus
  const firstFocusable = backdrop.querySelector('button');
  if (firstFocusable) firstFocusable.focus();
}

function buildModalHTML(tutorial, currentSection, totalSections) {
  const section = tutorial.sections[currentSection];
  const isFirst = currentSection === 0;
  const isLast = currentSection === totalSections - 1;
  const progress = Math.round(((currentSection + 1) / totalSections) * 100);

  const tipsHTML = tutorial.tips && tutorial.tips.length
    ? `<div class="tutorial-tips">
        <div class="tutorial-tips-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          Dicas
        </div>
        <ul class="tutorial-tips-list">
          ${tutorial.tips.map(tip => `<li>${tip}</li>`).join('')}
        </ul>
      </div>`
    : '';

  return `
    <div class="tutorial-modal">
      <!-- Header -->
      <div class="tutorial-modal-header">
        <div class="tutorial-modal-title-row">
          <div class="tutorial-modal-icon" style="background: ${tutorial.color}20; color: ${tutorial.color};">
            ${tutorial.icon}
          </div>
          <div>
            <p class="tutorial-modal-eyebrow">${tutorial.categoryLabel}</p>
            <h2 class="tutorial-modal-title">${tutorial.title}</h2>
          </div>
        </div>
        <button type="button" class="tutorial-modal-close" aria-label="Fechar tutorial">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Progress bar -->
      <div class="tutorial-progress-bar">
        <div class="tutorial-progress-fill" style="width: ${progress}%;"></div>
      </div>

      <!-- Step indicator -->
      <div class="tutorial-step-indicator">
        ${tutorial.sections.map((_, i) => `
          <button type="button" class="tutorial-step-dot ${i === currentSection ? 'active' : i < currentSection ? 'done' : ''}"
            data-step="${i}" aria-label="Ir para seção ${i + 1}"></button>
        `).join('')}
      </div>

      <!-- Body -->
      <div class="tutorial-modal-body">
        <h3 class="tutorial-section-title">${section.title}</h3>
        <div class="tutorial-section-body">${section.body}</div>
        ${isLast ? tipsHTML : ''}
      </div>

      <!-- Footer -->
      <div class="tutorial-modal-footer">
        <label class="tutorial-dont-show">
          <input type="checkbox" id="tutorial-dont-show-chk">
          <span>Não mostrar novamente</span>
        </label>
        <div class="tutorial-modal-nav">
          ${!isFirst ? `<button type="button" class="btn btn-ghost tutorial-btn-prev">← Anterior</button>` : '<span></span>'}
          ${!isLast
            ? `<button type="button" class="btn btn-primary tutorial-btn-next">Próximo →</button>`
            : `<button type="button" class="btn btn-primary tutorial-btn-finish">Entendido!</button>`
          }
        </div>
      </div>

      <!-- Link para Academia -->
      <div class="tutorial-academy-link">
        <a href="/academia.html" class="tutorial-academy-anchor">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          Ver todos os tutoriais na Academia
        </a>
      </div>
    </div>
  `;
}

function bindModalEvents(backdrop, tutorial, pageId, state) {
  function markSeenIfChecked() {
    const chk = backdrop.querySelector('#tutorial-dont-show-chk');
    if (chk && chk.checked) {
      localStorage.setItem(STORAGE_PREFIX + pageId, '1');
    }
  }

  function close() {
    markSeenIfChecked();
    backdrop.classList.remove('tutorial-backdrop--visible');
    setTimeout(() => backdrop.remove(), 280);
  }

  function goToSection(index) {
    if (index < 0 || index >= state.total) return;
    state.current = index;
    const isLast = index === state.total - 1;

    // Re-render body + nav only (não fecha o modal)
    backdrop.querySelector('.tutorial-modal').innerHTML = buildModalHTML(tutorial, index, state.total).match(/<div class="tutorial-modal">([\s\S]*)<\/div>/)?.[0]
      || backdrop.querySelector('.tutorial-modal').innerHTML;

    // Simpler: replace the whole modal content
    const modal = backdrop.querySelector('.tutorial-modal');
    const temp = document.createElement('div');
    temp.innerHTML = buildModalHTML(tutorial, index, state.total);
    const newModal = temp.querySelector('.tutorial-modal');
    modal.replaceWith(newModal);

    bindInnerEvents(backdrop, tutorial, pageId, state);
    newModal.classList.add('tutorial-section-animate');
  }

  bindInnerEvents(backdrop, tutorial, pageId, state);

  // Close on backdrop click
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  // Close on Escape
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKeyDown);
    }
  }
  document.addEventListener('keydown', onKeyDown);
}

function bindInnerEvents(backdrop, tutorial, pageId, state) {
  function markSeenIfChecked() {
    const chk = backdrop.querySelector('#tutorial-dont-show-chk');
    if (chk && chk.checked) {
      localStorage.setItem(STORAGE_PREFIX + pageId, '1');
    }
  }

  function close() {
    markSeenIfChecked();
    backdrop.classList.remove('tutorial-backdrop--visible');
    setTimeout(() => backdrop.remove(), 280);
  }

  function goToSection(index) {
    if (index < 0 || index >= state.total) return;
    state.current = index;

    const modal = backdrop.querySelector('.tutorial-modal');
    const temp = document.createElement('div');
    temp.innerHTML = buildModalHTML(tutorial, index, state.total);
    const newModal = temp.querySelector('.tutorial-modal');
    modal.replaceWith(newModal);
    newModal.classList.add('tutorial-section-animate');
    setTimeout(() => newModal.classList.remove('tutorial-section-animate'), 300);

    bindInnerEvents(backdrop, tutorial, pageId, state);
    const btn = newModal.querySelector('.tutorial-btn-next, .tutorial-btn-finish, .tutorial-btn-prev');
    if (btn) btn.focus();
  }

  // Close button
  backdrop.querySelector('.tutorial-modal-close')?.addEventListener('click', close);

  // Next
  backdrop.querySelector('.tutorial-btn-next')?.addEventListener('click', () => goToSection(state.current + 1));

  // Prev
  backdrop.querySelector('.tutorial-btn-prev')?.addEventListener('click', () => goToSection(state.current - 1));

  // Finish
  backdrop.querySelector('.tutorial-btn-finish')?.addEventListener('click', () => {
    // Always mark as seen when finishing
    localStorage.setItem(STORAGE_PREFIX + pageId, '1');
    close();
  });

  // Step dots
  backdrop.querySelectorAll('.tutorial-step-dot').forEach(dot => {
    dot.addEventListener('click', () => goToSection(Number(dot.dataset.step)));
  });
}
