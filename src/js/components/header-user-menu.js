// =============================================================
// FinFlow — Header User Menu (Fase 6.B)
//
// Avatar circular no canto superior direito do header. Click abre
// dropdown com nome, email, "Meu perfil" e "Sair".
//
// Uso (em cada page.js):
//   import { mountHeaderUserMenu } from './components/header-user-menu.js';
//   await mountHeaderUserMenu();
// =============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentUser, logout } from '../lib/auth.js';
import { escapeHtml, getInitials } from '../lib/utils.js';

let cachedProfile = null;
let dropdownOpen = false;
let docListenersAttached = false;

export async function mountHeaderUserMenu() {
  const header = document.querySelector('.app-header.header');
  if (!header) return;

  // Garante .header-right existe pra encaixar o menu
  let right = header.querySelector('.header-right');
  if (!right) {
    right = document.createElement('div');
    right.className = 'header-right';
    header.appendChild(right);
  }

  // Container do menu
  let host = right.querySelector('#header-user-menu');
  if (!host) {
    host = document.createElement('div');
    host.id = 'header-user-menu';
    right.appendChild(host);
  }

  // Renderiza com placeholder até carregar profile
  const user = await getCurrentUser().catch(() => null);
  if (!user) return;

  const email = user.email || '';
  const fallbackName = user.user_metadata?.nome || email;
  render(host, { email, nome: fallbackName, foto_url: null, apelido: null });

  // Carrega profile (foto, apelido) em background
  try {
    const { data } = await supabase
      .from('profiles')
      .select('nome, apelido, foto_url')
      .eq('id', user.id)
      .maybeSingle();
    cachedProfile = { ...(data || {}), email };
    render(host, {
      email,
      nome: data?.nome || fallbackName,
      apelido: data?.apelido || null,
      foto_url: data?.foto_url || null,
    });
  } catch (err) {
    console.debug('[header-user-menu] profile load failed:', err?.message);
  }
}

function render(host, profile) {
  const display = profile.apelido?.trim() || profile.nome?.trim() || profile.email || 'Usuário';
  const initials = getInitials(profile.nome || profile.apelido, profile.email);
  const avatar = profile.foto_url
    ? `<img src="${escapeHtml(profile.foto_url)}" alt="${escapeHtml(display)}" class="header-user-avatar-img">`
    : `<span class="header-user-avatar-initials">${escapeHtml(initials)}</span>`;

  host.innerHTML = `
    <button type="button" class="header-user-trigger" id="hum-trigger" aria-label="Menu do usuário" aria-haspopup="true" aria-expanded="false">
      <span class="header-user-avatar">${avatar}</span>
      <span class="header-user-chevron" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </span>
    </button>
    <div class="header-user-dropdown hidden" id="hum-dropdown" role="menu">
      <div class="header-user-dropdown-info">
        <div class="header-user-dropdown-avatar">${avatar}</div>
        <div class="header-user-dropdown-text">
          <div class="header-user-dropdown-name">${escapeHtml(display)}</div>
          <div class="header-user-dropdown-email">${escapeHtml(profile.email)}</div>
        </div>
      </div>
      <a href="/perfil.html" class="header-user-dropdown-item" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Meu perfil</span>
      </a>
      <a href="/feedback.html" class="header-user-dropdown-item" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
        <span>Ajuda &amp; Sugestões</span>
      </a>
      <button type="button" class="header-user-dropdown-item header-user-dropdown-logout" id="hum-logout" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
        <span>Sair</span>
      </button>
    </div>
  `;

  bindEvents(host);
}

function bindEvents(host) {
  const trigger = host.querySelector('#hum-trigger');
  const dropdown = host.querySelector('#hum-dropdown');
  const logoutBtn = host.querySelector('#hum-logout');

  trigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownOpen = !dropdownOpen;
    dropdown.classList.toggle('hidden', !dropdownOpen);
    trigger.setAttribute('aria-expanded', String(dropdownOpen));
  });

  logoutBtn?.addEventListener('click', () => logout());

  // Fecha quando clica fora e no Esc — apenas uma vez por página
  if (!docListenersAttached) {
    docListenersAttached = true;

    document.addEventListener('click', (e) => {
      if (!dropdownOpen) return;
      const menuHost = document.getElementById('header-user-menu');
      if (menuHost?.contains(e.target)) return;
      dropdownOpen = false;
      menuHost?.querySelector('#hum-dropdown')?.classList.add('hidden');
      menuHost?.querySelector('#hum-trigger')?.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !dropdownOpen) return;
      dropdownOpen = false;
      const menuHost = document.getElementById('header-user-menu');
      menuHost?.querySelector('#hum-dropdown')?.classList.add('hidden');
      menuHost?.querySelector('#hum-trigger')?.setAttribute('aria-expanded', 'false');
    });
  }
}
