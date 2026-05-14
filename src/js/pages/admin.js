// =============================================================
// FinFlow — Admin: página combinada (Feedback + Usuários + Idiomas)
// =============================================================
import { guardSession } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { loadStrings, applyTranslationsToDom } from '../lib/textos.js';

const initialized = { usuarios: false, idiomas: false };
const VALID_TABS   = new Set(['usuarios', 'idiomas']);

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('admin');
  await loadStrings();
  applyTranslationsToDom();

  bindTabEvents();
  const hash = location.hash.slice(1);
  await activateTab(VALID_TABS.has(hash) ? hash : 'usuarios');
});

function bindTabEvents() {
  document.getElementById('admin-sidenav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activateTab(btn.dataset.tab);
  });
}

async function activateTab(tab) {
  history.replaceState(null, '', '#' + tab);
  document.querySelectorAll('#admin-sidenav [data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.cfg-panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== `admin-panel-${tab}`);
  });

  if (initialized[tab]) return;
  initialized[tab] = true;

  // Cache-bust dos dynamic imports — força browser a baixar nova versão
  // quando o arquivo muda (em dev). Em produção, hash do build resolveria.
  const v = `?v=${Date.now()}`;
  if (tab === 'usuarios') {
    const { init } = await import('./admin-usuarios.js' + v);
    await init();
  } else if (tab === 'idiomas') {
    const { init } = await import('./admin-i18n.js' + v);
    await init();
  }
}
