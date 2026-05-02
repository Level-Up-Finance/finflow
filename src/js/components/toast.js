// =============================================================
// FinFlow — Toast (notificações flutuantes)
// =============================================================

const DEFAULT_DURATION = 4000;
const MAX_TOASTS = 3;

/**
 * Exibe uma notificação flutuante no canto inferior direito.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type='info']
 * @param {number} [duration=4000]
 */
export function showToast(message, type = 'info', duration = DEFAULT_DURATION) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  // Limita 3 toasts simultâneos
  const existing = container.querySelectorAll('.toast');
  if (existing.length >= MAX_TOASTS) existing[0].remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
