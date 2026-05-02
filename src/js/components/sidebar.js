// =============================================================
// FinFlow — Sidebar
// =============================================================
import { initTheme, getTheme, setTheme } from '../lib/theme.js';
import { showToast } from './toast.js';
import { mountHeaderUserMenu } from './header-user-menu.js';

const ICONS = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  pagamentos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  contas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`,
  compromissos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>`,
  orcamento: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>`,
  dividas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  investimentos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  relatorios: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="7" cy="18" r="2" fill="currentColor"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  monitor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`,
};

const NAV_ITEMS = [
  { id: 'dashboard',     label: 'Dashboard',      href: '/dashboard.html' },
  { id: 'pagamentos',    label: 'Pagamentos',     href: '/pagamentos.html' },
  { id: 'contas',        label: 'Contas',         href: '/contas.html' },
  { id: 'compromissos',  label: 'Compromissos',   href: '/compromissos.html' },
  { id: 'orcamento',     label: 'Orçamento',      href: '/orcamento.html' },
  { id: 'dividas',       label: 'Dívidas',        href: '/dividas.html' },
  { id: 'investimentos', label: 'Investimentos',  href: '/investimentos.html' },
  { id: 'relatorios',    label: 'Relatórios',     href: '/relatorios.html' },
];

/**
 * Renderiza a sidebar dentro de #sidebar-container e marca o item ativo.
 * @param {string} activePage  id do item ativo (ex: 'dashboard')
 */
export async function initSidebar(activePage) {
  const container = document.getElementById('sidebar-container');
  if (!container) return;

  container.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-logo">
        <span class="sidebar-logo-mark"></span>
        <span class="sidebar-logo-name">FinFlow</span>
      </div>
      <nav class="sidebar-nav">
        ${NAV_ITEMS.map(item => `
          <a href="${item.href}" class="sidebar-link ${item.id === activePage ? 'active' : ''}" aria-label="${item.label}">
            <span class="sidebar-link-icon">${ICONS[item.id] || ''}</span>
            <span class="sidebar-link-label">${item.label}</span>
          </a>
        `).join('')}
      </nav>
      <div class="sidebar-footer">
        <button class="sidebar-config" id="btn-sistema-config" type="button" aria-label="Configurações do sistema">
          <span class="sidebar-link-icon">${ICONS.settings}</span>
          <span class="sidebar-link-label">Configurações</span>
        </button>
      </div>
    </aside>

    ${renderSistemaConfigModal()}
  `;

  document.getElementById('btn-sistema-config')?.addEventListener('click', openSistemaConfig);
  bindSistemaConfigEvents();

  // Sincroniza tema com profiles em background (não bloqueia render)
  initTheme();

  // Monta o menu de perfil no canto superior direito do header
  mountHeaderUserMenu();
}

// ----- Configurações do sistema (modal próprio do sidebar) -----

function renderSistemaConfigModal() {
  const current = getTheme();
  const opt = (value, label, icon, hint) => `
    <button type="button" class="theme-option ${current === value ? 'active' : ''}" data-theme-option="${value}">
      <span class="theme-option-icon">${icon}</span>
      <span class="theme-option-text">
        <span class="theme-option-label">${label}</span>
        <span class="theme-option-hint">${hint}</span>
      </span>
    </button>
  `;

  return `
    <div class="modal-backdrop hidden" id="modal-sistema-config" role="dialog" aria-modal="true">
      <div class="modal modal-md">
        <div class="modal-header">
          <h2 class="modal-title">Configurações do sistema</h2>
          <button type="button" class="modal-close" data-close-sistema-config aria-label="Fechar">×</button>
        </div>
        <div class="modal-body">
          <div class="config-section">
            <h3 class="config-section-title">Aparência</h3>
            <p class="config-section-hint">Como o FinFlow é exibido pra você.</p>
            <div class="theme-options">
              ${opt('claro',  'Claro',  ICONS.sun,     'Tema claro fixo')}
              ${opt('escuro', 'Escuro', ICONS.moon,    'Tema escuro fixo')}
              ${opt('auto',   'Auto',   ICONS.monitor, 'Segue o tema do seu sistema')}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" data-close-sistema-config>Pronto</button>
        </div>
      </div>
    </div>
  `;
}

function openSistemaConfig() {
  document.getElementById('modal-sistema-config')?.classList.remove('hidden');
}

function closeSistemaConfig() {
  document.getElementById('modal-sistema-config')?.classList.add('hidden');
}

function bindSistemaConfigEvents() {
  const modal = document.getElementById('modal-sistema-config');
  if (!modal) return;

  // Close handlers (botões + backdrop click)
  modal.querySelectorAll('[data-close-sistema-config]').forEach((el) => {
    el.addEventListener('click', closeSistemaConfig);
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSistemaConfig();
  });

  // Theme option click
  modal.querySelectorAll('[data-theme-option]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const value = btn.dataset.themeOption;
      modal.querySelectorAll('[data-theme-option]').forEach((b) => b.classList.toggle('active', b === btn));
      await setTheme(value);
      const labels = { claro: 'Tema claro', escuro: 'Tema escuro', auto: 'Tema automático' };
      showToast(`${labels[value]} aplicado`, 'success', 2000);
    });
  });
}
