// =============================================================
// FinFlow — Admin: página combinada (Feedback + Usuários + Idiomas)
// =============================================================
import { guardSession } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';

const initialized = { feedback: false, usuarios: false, idiomas: false };

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('admin');

  bindTabEvents();
  await activateTab('feedback');
});

function bindTabEvents() {
  document.getElementById('admin-sidenav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activateTab(btn.dataset.tab);
  });
}

async function activateTab(tab) {
  document.querySelectorAll('#admin-sidenav [data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.cfg-panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== `admin-panel-${tab}`);
  });

  if (initialized[tab]) return;
  initialized[tab] = true;

  if (tab === 'feedback') {
    const { init } = await import('./admin-feedback.js');
    await init();
  } else if (tab === 'usuarios') {
    const { init } = await import('./admin-usuarios.js');
    await init();
  } else if (tab === 'idiomas') {
    const { init } = await import('./admin-i18n.js');
    await init();
  }
}
