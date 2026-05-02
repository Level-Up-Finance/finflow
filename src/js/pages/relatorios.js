// =============================================================
// FinFlow — Página: Relatórios (stub)
// Implementação completa virá na Fase 9.
// =============================================================
import { guardSession } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('relatorios');
});
