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
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getInitials(name, fallback = '') {
  const src = (name || fallback || '?').trim();
  if (!src) return '?';
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/**
 * Parseia número digitado pelo usuário, aceitando tanto vírgula quanto ponto como decimal.
 * Exemplos:
 *   "1.500,00" → 1500     (europeu)
 *   "1,500.00" → 1500     (americano)
 *   "1500,00"  → 1500
 *   "1500.00"  → 1500
 *   "1500"     → 1500
 */
export function parseUserNumber(str) {
  if (str === '' || str == null) return NaN;
  const s = String(str).trim().replace(/\s/g, '');
  if (!s) return NaN;

  const lastDot   = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot > -1 && lastComma > -1) {
    // Ambos presentes: o que vier por último é o separador decimal
    if (lastComma > lastDot) {
      // Formato europeu: 1.234,56
      return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    } else {
      // Formato americano: 1,234.56
      return parseFloat(s.replace(/,/g, ''));
    }
  }

  if (lastComma > -1) return parseFloat(s.replace(',', '.'));
  return parseFloat(s);
}

/**
 * Renders grouped <option> / <optgroup> HTML for conta select dropdowns.
 * Groups: Conta Bancária | Cartão de Crédito | Conta Estrangeira
 *
 * @param {Array}  contas      - Array of conta objects (must have id, nome, apelido, tipo, moeda)
 * @param {string} selectedId  - Currently selected conta id (for pre-selection)
 * @param {Object} opts
 * @param {string} opts.blankLabel - Label for the empty/placeholder option (pass '' to omit)
 */
export function renderContaOptions(contas, selectedId = '', { blankLabel = 'Selecione…' } = {}) {
  function makeOpt(c) {
    const sel = String(c.id) === String(selectedId) ? ' selected' : '';
    return `<option value="${c.id}"${sel}>${escapeHtml(c.apelido || c.nome)}</option>`;
  }

  // Groups in display order — only rendered if at least one account exists in the group
  const GROUPS = [
    { label: 'Conta Corrente',   test: (c) => c.tipo === 'Corrente'    && (!c.moeda || c.moeda === 'BRL') },
    { label: 'Conta Poupança',   test: (c) => c.tipo === 'Poupança'    && (!c.moeda || c.moeda === 'BRL') },
    { label: 'Caixinha',         test: (c) => c.tipo === 'Cofrinho'    && (!c.moeda || c.moeda === 'BRL') },
    { label: 'Investimento',     test: (c) => c.tipo === 'Investimento' && (!c.moeda || c.moeda === 'BRL') },
    { label: 'Cartão de Crédito',test: (c) => c.tipo === 'Cartão de Crédito' },
    { label: 'Conta Estrangeira',test: (c) => c.tipo !== 'Cartão de Crédito' && c.moeda && c.moeda !== 'BRL' },
  ];

  let html = blankLabel !== '' ? `<option value="">${escapeHtml(blankLabel)}</option>` : '';
  for (const g of GROUPS) {
    const group = contas.filter(g.test);
    if (group.length === 0) continue;
    // If only one group type exists across all accounts, skip the optgroup label for cleaner UX
    html += `<optgroup label="${escapeHtml(g.label)}">${group.map(makeOpt).join('')}</optgroup>`;
  }
  return html;
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
