// =============================================================
// FinFlow — Página: Dívidas (stub)
// Implementação completa virá na Fase 7.
// =============================================================
import { guardSession } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('dividas');
});
