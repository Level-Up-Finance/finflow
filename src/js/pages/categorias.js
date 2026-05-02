// =============================================================
// FinFlow — Página: Categorias (stub)
// Implementação completa virá na Fase 3.
// =============================================================
import { guardSession } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('categorias');
});
