// =============================================================
// FinFlow — Sistema de Modais
// =============================================================

const listenerMap = new WeakMap();

/**
 * Abre um modal pelo seu id, opcionalmente preenchendo campos com `data`.
 * O modal deve ser um <div class="modal-backdrop" id="modal-xxx"> que
 * envolve um <div class="modal">.
 *
 * @param {string} modalId
 * @param {object} [data]  pares chave→valor pra popular campos do form
 */
export function openModal(modalId, data) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  if (data) populateModal(modalId, data);

  modal.classList.remove('hidden');

  // Foca o primeiro campo focável
  requestAnimationFrame(() => {
    modal.querySelector('input, select, textarea, button[type="submit"]')?.focus();
  });

  const escListener = (e) => {
    if (e.key === 'Escape') closeModal(modalId);
  };
  const overlayListener = (e) => {
    if (e.target === modal) closeModal(modalId);
  };

  document.addEventListener('keydown', escListener);
  modal.addEventListener('click', overlayListener);

  listenerMap.set(modal, { escListener, overlayListener });
}

/**
 * Fecha o modal e limpa o form interno.
 */
export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.add('hidden');
  modal.querySelector('form')?.reset();
  delete modal.dataset.id;

  const listeners = listenerMap.get(modal);
  if (listeners) {
    document.removeEventListener('keydown', listeners.escListener);
    modal.removeEventListener('click', listeners.overlayListener);
    listenerMap.delete(modal);
  }
}

/**
 * Preenche os campos do formulário interno com os valores em `data`.
 * Salva data.id em modal.dataset.id pra modo edição.
 */
export function populateModal(modalId, data) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  for (const [key, value] of Object.entries(data)) {
    const field = modal.querySelector(`[name="${key}"]`);
    if (!field) continue;

    if (field.type === 'checkbox') {
      field.checked = Boolean(value);
    } else {
      field.value = value ?? '';
    }
  }

  if (data.id) modal.dataset.id = data.id;
}
