// =============================================================
// FinFlow — Utilitários compartilhados
// =============================================================

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function isoMonth(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function getInitials(name, fallback = '') {
  const src = (name || fallback || '?').trim();
  if (!src) return '?';
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function showConfirm(message, { okLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = true } = {}) {
  return new Promise((resolve) => {
    const existing = document.getElementById('util-confirm-modal');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'util-confirm-modal';
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'alertdialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'util-confirm-msg');

    const lines = String(message).split('\n').map((l) => escapeHtml(l)).join('<br>');
    backdrop.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <h3 class="modal-title">Confirmação</h3>
        </div>
        <div class="modal-body">
          <p id="util-confirm-msg">${lines}</p>
        </div>
        <div class="modal-footer" style="display:flex;gap:var(--space-2);justify-content:flex-end;padding:var(--space-4);">
          <button type="button" class="btn btn-ghost" id="util-confirm-cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="util-confirm-ok">${escapeHtml(okLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#util-confirm-ok').focus();

    function cleanup(result) {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') cleanup(false);
    }
    backdrop.querySelector('#util-confirm-cancel').addEventListener('click', () => cleanup(false));
    backdrop.querySelector('#util-confirm-ok').addEventListener('click', () => cleanup(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
    document.addEventListener('keydown', onKey);
  });
}
