// =============================================================
// FinFlow — Popover de confirmação de data (+ opcional: conta)
//
// Usado pra confirmar a data efetiva ao mudar status de pagamento
// pra Pago/Cartão/Transferido. Pode opcionalmente mostrar também um
// seletor de conta — usado pra cobrir o caso "paguei de outra conta
// que não a configurada no compromisso".
//
// Retorno:
//  - sem accountSelector  → resolve(string YYYY-MM-DD | null)
//  - com accountSelector  → resolve({ date, accountId } | null)
// =============================================================

/**
 * @param {object} opts
 * @param {HTMLElement} opts.anchor - elemento ao qual o popover se ancora
 * @param {string} [opts.title='Quando foi pago?']
 * @param {string} [opts.initialDate] - YYYY-MM-DD (default: hoje)
 * @param {object} [opts.accountSelector] - se setado, mostra select de conta
 * @param {Array<{id, name}>} opts.accountSelector.accounts
 * @param {string} opts.accountSelector.currentId - conta default selecionada
 * @param {string} [opts.accountSelector.label='Conta']
 * @returns {Promise<string|{date,accountId}|null>}
 */
export function showDateConfirmPopover({
  anchor,
  title = 'Quando foi pago?',
  initialDate = null,
  accountSelector = null,
} = {}) {
  return new Promise((resolve) => {
    if (!anchor) { resolve(null); return; }

    // Default = hoje
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const defaultDate = initialDate || `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // Remove qualquer popover anterior
    document.querySelectorAll('.date-confirm-popover').forEach((el) => el.remove());

    // Monta opções do select de conta (se aplicável)
    let accountSelectorHtml = '';
    if (accountSelector?.accounts?.length) {
      const label = accountSelector.label || 'Conta';
      const opts = accountSelector.accounts.map((a) => {
        const sel = a.id === accountSelector.currentId ? ' selected' : '';
        return `<option value="${a.id}"${sel}>${escapeHtml(a.name)}</option>`;
      }).join('');
      accountSelectorHtml = `
        <label class="date-confirm-popover-label">${label}</label>
        <select class="input date-confirm-popover-account">${opts}</select>
      `;
    }

    // Cria o popover
    const pop = document.createElement('div');
    pop.className = 'date-confirm-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', title);
    pop.innerHTML = `
      <div class="date-confirm-popover-arrow"></div>
      <p class="date-confirm-popover-title">${title}</p>
      <input class="input date-confirm-popover-input" type="date" value="${defaultDate}">
      ${accountSelectorHtml}
      <div class="date-confirm-popover-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-action="cancel">Cancelar</button>
        <button type="button" class="btn btn-primary btn-sm" data-action="confirm">Confirmar</button>
      </div>
    `;
    document.body.appendChild(pop);

    // Posiciona ancorado ao elemento
    const rect = anchor.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX + (rect.width / 2) - (popRect.width / 2);
    // Mantém dentro da viewport
    const margin = 8;
    if (left < margin) left = margin;
    if (left + popRect.width > window.innerWidth - margin) left = window.innerWidth - popRect.width - margin;
    // Se o popover passar do bottom da viewport, abre pra cima
    let placeAbove = false;
    if (top + popRect.height > window.innerHeight + window.scrollY - margin) {
      top = rect.top + window.scrollY - popRect.height - 8;
      placeAbove = true;
    }
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    if (placeAbove) pop.classList.add('date-confirm-popover--above');

    const input = pop.querySelector('.date-confirm-popover-input');
    const accountEl = pop.querySelector('.date-confirm-popover-account');
    const btnConfirm = pop.querySelector('[data-action="confirm"]');
    const btnCancel = pop.querySelector('[data-action="cancel"]');

    // Foca o input depois do paint
    requestAnimationFrame(() => {
      input.focus();
      input.select?.();
    });

    let resolved = false;
    const close = (result) => {
      if (resolved) return;
      resolved = true;
      document.removeEventListener('mousedown', onOutsideClick);
      document.removeEventListener('keydown', onKeydown);
      pop.remove();
      resolve(result);
    };

    const confirm = () => {
      const val = input.value;
      if (!val) { input.focus(); return; }
      if (accountSelector) {
        close({ date: val, accountId: accountEl?.value || accountSelector.currentId });
      } else {
        close(val);
      }
    };

    const onKeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      else if (e.key === 'Enter') { e.preventDefault(); confirm(); }
    };

    const onOutsideClick = (e) => {
      if (!pop.contains(e.target)) close(null);
    };

    btnConfirm.addEventListener('click', confirm);
    btnCancel.addEventListener('click', () => close(null));
    document.addEventListener('keydown', onKeydown);
    // Delay outside-click pra evitar fechar imediatamente
    setTimeout(() => document.addEventListener('mousedown', onOutsideClick), 50);
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
