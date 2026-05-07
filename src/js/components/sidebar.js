// =============================================================
// FinFlow — Sidebar
// =============================================================
import { initTheme } from '../lib/theme.js';
import { mountHeaderUserMenu } from './header-user-menu.js';
import { CHANGELOG } from '../lib/changelog.js';

function getUnseenCount() {
  if (CHANGELOG.length === 0) return 0;
  const seen = localStorage.getItem('finflow:changelog:seen');
  if (!seen) return CHANGELOG.length;
  const idx = CHANGELOG.findIndex(e => e.id === seen);
  return idx === -1 ? CHANGELOG.length : idx;
}

const ICONS = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  pagamentos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  transacoes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  contas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`,
  compromissos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>`,
  orcamento: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>`,
  dividas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  investimentos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  relatorios: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`,
  importar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  contatos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  academia:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
  novidades: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  feedback: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  admin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="7" cy="18" r="2" fill="currentColor"/></svg>`,
  configuracoes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  monitor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`,
};

const NAV_ITEMS = [
  // ── Financeiro ────────────────────────────────────────────────
  { id: 'dashboard',     label: 'Dashboard',       href: '/dashboard.html' },
  { id: 'pagamentos',    label: 'Pagamentos',       href: '/pagamentos.html' },
  { id: 'transacoes',    label: 'Transações',       href: '/transacoes.html' },
  { id: 'contas',        label: 'Contas',           href: '/contas.html' },
  { id: 'compromissos',  label: 'Compromissos',     href: '/compromissos.html' },
  { id: 'orcamento',     label: 'Orçamento',        href: '/orcamento.html' },
  { id: 'dividas',       label: 'Dívidas',          href: '/dividas.html' },
  { id: 'investimentos', label: 'Investimentos',    href: '/investimentos.html' },
  { divider: true },
  // ── Ferramentas ───────────────────────────────────────────────
  { id: 'relatorios',    label: 'Relatórios',       href: '/relatorios.html' },
  { id: 'contatos',      label: 'Contatos',         href: '/contatos.html' },
  { id: 'importar',      label: 'Importar extrato', href: '/importar.html' },
  { divider: true },
  // ── Comunidade ────────────────────────────────────────────────
  { id: 'academia',      label: 'Academia',         href: '/academia.html' },
  { id: 'novidades',     label: 'Novidades',        href: '/novidades.html' },
  { id: 'feedback',      label: 'Feedback',         href: '/feedback.html' },
];

/**
 * Renderiza a sidebar dentro de #sidebar-container e marca o item ativo.
 * @param {string} activePage  id do item ativo (ex: 'dashboard')
 */
export async function initSidebar(activePage) {
  const container = document.getElementById('sidebar-container');
  if (!container) return;

  const unseenCount = getUnseenCount();

  container.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-logo">
        <span class="sidebar-logo-mark"></span>
        <span class="sidebar-logo-name">FinFlow</span>
      </div>
      <nav class="sidebar-nav">
        ${NAV_ITEMS.map(item => {
          if (item.divider) return '<hr class="sidebar-divider">';
          const badge = item.id === 'novidades'
            ? `<span class="sidebar-badge${unseenCount > 0 ? '' : ' hidden'}" id="sidebar-changelog-badge">${unseenCount > 9 ? '9+' : unseenCount}</span>`
            : '';
          return `
            <a href="${item.href}" class="sidebar-link ${item.id === activePage ? 'active' : ''}" aria-label="${item.label}">
              <span class="sidebar-link-icon"${item.id === 'novidades' ? ' style="position:relative"' : ''}>
                ${ICONS[item.id] || ''}
                ${badge}
              </span>
              <span class="sidebar-link-label">${item.label}</span>
            </a>
          `;
        }).join('')}
      </nav>
      <div class="sidebar-footer">
        <a href="/admin.html" class="sidebar-config ${activePage === 'admin' ? 'active' : ''}" aria-label="Admin">
          <span class="sidebar-link-icon">${ICONS.admin}</span>
          <span class="sidebar-link-label">Admin</span>
        </a>
        <a href="/configuracoes.html" class="sidebar-config ${activePage === 'configuracoes' ? 'active' : ''}" aria-label="Configurações">
          <span class="sidebar-link-icon">${ICONS.configuracoes}</span>
          <span class="sidebar-link-label">Configurações</span>
        </a>
      </div>
    </aside>
  `;

  // ── Mobile: hambúrguer + overlay ─────────────────────────────
  const headerLeft = document.querySelector('.header-left');
  if (headerLeft && !headerLeft.querySelector('.sidebar-toggle')) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sidebar-toggle';
    toggle.setAttribute('aria-label', 'Abrir menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/></svg>`;
    headerLeft.insertBefore(toggle, headerLeft.firstChild);
  }

  if (!document.getElementById('sidebar-overlay')) {
    const ov = document.createElement('div');
    ov.id = 'sidebar-overlay';
    ov.className = 'sidebar-overlay';
    document.body.appendChild(ov);
  }

  function openSidebar() {
    container.classList.add('open');
    document.getElementById('sidebar-overlay')?.classList.add('visible');
    document.querySelector('.sidebar-toggle')?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    container.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('visible');
    document.querySelector('.sidebar-toggle')?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  document.querySelector('.sidebar-toggle')?.addEventListener('click', () => {
    container.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && container.classList.contains('open')) closeSidebar();
  });

  // Sincroniza tema com profiles em background (não bloqueia render)
  initTheme();

  // Monta o menu de perfil no canto superior direito do header
  mountHeaderUserMenu();
}

