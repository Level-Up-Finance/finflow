// =============================================================
// FinFlow — Popover de confirmação de data
//
// Usado pra confirmar a data efetiva ao mudar status de pagamento
// pra Pago/Transferido. Retorna uma Promise que resolve com a data
// confirmada (YYYY-MM-DD) ou null se o usuário cancelar.
// =============================================================

/**
 * Exibe um popover flutuante ancorado a um elemento DOM.
 * @param {object} opts
 * @param {HTMLElement} opts.anchor - elemento ao qual o popover se ancora
 * @param {string} [opts.title='Quando foi pago?']
 * @param {string} [opts.initialDate] - YYYY-MM-DD (default: hoje)
 * @returns {Promise<string|null>} - data confirmada ou null se cancelado
 */
export function showDateConfirmPopover({ anchor, title = 'Quando foi pago?', initialDate = null } = {}) {
  return new Promise((resolve) => {
    if (!anchor) { resolve(null); return; }

    // Default = hoje
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const defaultDate = initialDate || `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // Remove qualquer popover anterior
    document.querySelectorAll('.date-confirm-popover').forEach((el) => el.remove());

    // Cria o popover
    const pop = document.createElement('div');
    pop.className = 'date-confirm-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', title);
    pop.innerHTML = `
      <div class="date-confirm-popover-arrow"></div>
      <p class="date-confirm-popover-title">${title}</p>
      <input class="input date-confirm-popover-input" type="date" value="${defaultDate}">
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
      close(val);
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
