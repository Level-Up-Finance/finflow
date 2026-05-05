// Picker de contato com busca, autocomplete e detecção de duplicados.
//
// HTML esperado (em cada formulário que usa o picker):
//   <div class="contato-picker" data-picker="<id-único>">
//     <input type="text" class="contato-picker-input input" autocomplete="off"
//            placeholder="Buscar contato ou digitar novo nome…">
//     <input type="hidden" id="<id-do-form>" value="">
//   </div>
//
// O dropdown é portal'd para o <body> com position:fixed pra escapar do
// overflow:hidden dos modais.
import { findSimilarContatos, criarContato, normalize } from '../lib/contato-utils.js';
import { escapeHtml } from '../lib/utils.js';

const TIPO_LABELS = { cliente: 'Cliente', fornecedor: 'Fornecedor', ambos: 'Ambos' };

// "ambos" é renderizado como duas pills separadas (Cliente + Fornecedor).
function renderTipoPills(tipo) {
  if (tipo === 'ambos') {
    return `<span class="contato-picker-tipo tipo-cliente">Cliente</span><span class="contato-picker-tipo tipo-fornecedor">Fornecedor</span>`;
  }
  if (tipo === 'cliente' || tipo === 'fornecedor') {
    return `<span class="contato-picker-tipo tipo-${tipo}">${TIPO_LABELS[tipo]}</span>`;
  }
  return '';
}

let openPicker = null; // instância atual com dropdown aberto

export function initContatoPicker({ rootEl, contatos, defaultTipo = 'fornecedor', onCreated, allowEmpty = true }) {
  const inputEl = rootEl.querySelector('.contato-picker-input');
  const hiddenEl = rootEl.querySelector('input[type="hidden"]');

  const dropdownEl = document.createElement('div');
  dropdownEl.className = 'contato-picker-dropdown hidden';
  document.body.appendChild(dropdownEl);

  // Aceita array (mutado in-place pelo caller) ou função getter (que devolve
  // o array atual). Função é mais segura quando o caller reatribui a variável.
  function getList() {
    return typeof contatos === 'function' ? contatos() : contatos;
  }

  function pushContato(novo) {
    const list = getList();
    list.push(novo);
    list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  function setValue(id) {
    hiddenEl.value = id || '';
    if (id) {
      const c = getList().find((x) => x.id === id);
      inputEl.value = c?.nome || '';
    } else {
      inputEl.value = '';
    }
    closeDropdown();
    hiddenEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function getValue() { return hiddenEl.value || ''; }

  function positionDropdown() {
    const rect = inputEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const maxH = Math.max(160, Math.min(320, spaceBelow));
    dropdownEl.style.top = `${rect.bottom + 4}px`;
    dropdownEl.style.left = `${rect.left}px`;
    dropdownEl.style.width = `${rect.width}px`;
    dropdownEl.style.maxHeight = `${maxH}px`;
    dropdownEl.style.overflowY = 'auto';
  }

  function openDropdown() {
    if (openPicker && openPicker !== api) openPicker.close();
    openPicker = api;
    renderDropdown(inputEl.value);
    positionDropdown();
  }

  function closeDropdown() {
    dropdownEl.classList.add('hidden');
    if (openPicker === api) openPicker = null;
  }

  function renderDropdown(filterText) {
    const q = normalize(filterText);
    const sorted = [...getList()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const filtered = q ? sorted.filter((c) => normalize(c.nome).includes(q)) : sorted;

    let html = '';
    if (allowEmpty) {
      html += '<button type="button" class="contato-picker-item contato-picker-clear" data-clear>— Sem contato —</button>';
    }

    for (const c of filtered) {
      html += `
        <button type="button" class="contato-picker-item" data-id="${c.id}">
          <span class="contato-picker-name">${escapeHtml(c.nome)}</span>
          <span class="contato-picker-tipos">${renderTipoPills(c.tipo)}</span>
        </button>
      `;
    }

    const trimmed = filterText.trim();
    if (trimmed && !filtered.some((c) => normalize(c.nome) === q)) {
      html += `<button type="button" class="contato-picker-create" data-create><span class="contato-picker-create-icon">+</span> Criar contato "${escapeHtml(trimmed)}"</button>`;
    }

    if (filtered.length === 0 && !trimmed) {
      html += '<div class="contato-picker-empty">Nenhum contato. Comece a digitar um nome.</div>';
    }

    dropdownEl.innerHTML = html;
    dropdownEl.classList.remove('hidden');
  }

  function showTipoModal(nome) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.innerHTML = `
        <div class="modal modal-sm">
          <div class="modal-header"><h3 class="modal-title">Que tipo é esse contato?</h3></div>
          <div class="modal-body">
            <p>Definindo o tipo de "<strong>${escapeHtml(nome)}</strong>":</p>
            <div class="contato-tipo-grid">
              <button type="button" class="contato-tipo-btn ${defaultTipo === 'cliente' ? 'active' : ''}" data-tipo="cliente">
                <span class="contato-tipo-emoji">🤝</span><span>Cliente</span>
              </button>
              <button type="button" class="contato-tipo-btn ${defaultTipo === 'fornecedor' ? 'active' : ''}" data-tipo="fornecedor">
                <span class="contato-tipo-emoji">🏢</span><span>Fornecedor</span>
              </button>
              <button type="button" class="contato-tipo-btn ${defaultTipo === 'ambos' ? 'active' : ''}" data-tipo="ambos">
                <span class="contato-tipo-emoji">🔄</span><span>Ambos</span>
              </button>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
      function cleanup(result) {
        backdrop.remove();
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }
      function onKey(e) { if (e.key === 'Escape') cleanup(null); }
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) return cleanup(null);
        const tipoBtn = e.target.closest('[data-tipo]');
        if (tipoBtn) return cleanup(tipoBtn.dataset.tipo);
        if (e.target.closest('[data-cancel]')) return cleanup(null);
      });
      document.addEventListener('keydown', onKey);
    });
  }

  // Resolve com: id (usar existente) | '__new__' (criar mesmo) | null (cancelar)
  function showSimilarModal(nome, exact, similar) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      const items = [
        ...exact.map((c) => ({ c, kind: 'idêntico' })),
        ...similar.map((c) => ({ c, kind: 'parecido' })),
      ];
      const itemsHtml = items.map(({ c, kind }) => `
        <button type="button" class="contato-similar-item" data-id="${c.id}">
          <span class="contato-similar-name">${escapeHtml(c.nome)}</span>
          <span class="contato-similar-tipos">${renderTipoPills(c.tipo)}</span>
          <span class="contato-similar-meta">${kind}</span>
        </button>
      `).join('');

      backdrop.innerHTML = `
        <div class="modal modal-sm">
          <div class="modal-header"><h3 class="modal-title">Já existe contato parecido</h3></div>
          <div class="modal-body">
            <p>Encontrei contato${items.length > 1 ? 's' : ''} com nome similar a "<strong>${escapeHtml(nome)}</strong>". Usar um existente?</p>
            <div class="contato-similar-list">${itemsHtml}</div>
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
            <button type="button" class="btn btn-primary" data-create-new>Criar como novo</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
      function cleanup(result) {
        backdrop.remove();
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }
      function onKey(e) { if (e.key === 'Escape') cleanup(null); }
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) return cleanup(null);
        const useBtn = e.target.closest('[data-id]');
        if (useBtn) return cleanup(useBtn.dataset.id);
        if (e.target.closest('[data-create-new]')) return cleanup('__new__');
        if (e.target.closest('[data-cancel]')) return cleanup(null);
      });
      document.addEventListener('keydown', onKey);
    });
  }

  async function handleCreate() {
    const nome = inputEl.value.trim();
    if (!nome) return;

    const { exact, similar } = findSimilarContatos(nome, getList());

    if (exact.length > 0 || similar.length > 0) {
      const choice = await showSimilarModal(nome, exact, similar);
      if (choice === null) return;
      if (choice !== '__new__') {
        setValue(choice);
        return;
      }
    }

    const tipo = await showTipoModal(nome);
    if (!tipo) return;

    const novo = await criarContato(nome, tipo);
    if (novo) {
      pushContato(novo);
      onCreated?.(novo);
      setValue(novo.id);
    }
  }

  inputEl.addEventListener('focus', openDropdown);
  inputEl.addEventListener('input', () => {
    hiddenEl.value = '';
    renderDropdown(inputEl.value);
    positionDropdown();
  });
  inputEl.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = normalize(inputEl.value);
      const ex = getList().find((c) => normalize(c.nome) === q);
      if (ex) setValue(ex.id);
      else if (inputEl.value.trim()) await handleCreate();
    } else if (e.key === 'Escape') {
      closeDropdown();
      inputEl.blur();
    }
  });

  dropdownEl.addEventListener('mousedown', (e) => e.preventDefault()); // não tira foco do input
  dropdownEl.addEventListener('click', async (e) => {
    const idBtn = e.target.closest('[data-id]');
    if (idBtn) return setValue(idBtn.dataset.id);
    if (e.target.closest('[data-clear]')) return setValue('');
    if (e.target.closest('[data-create]')) return handleCreate();
  });

  const api = {
    setValue,
    getValue,
    close: closeDropdown,
    destroy: () => { dropdownEl.remove(); if (openPicker === api) openPicker = null; },
  };
  return api;
}

// Listener global de click-outside (registra apenas uma vez)
if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', (e) => {
    if (!openPicker) return;
    const inside = e.target.closest('.contato-picker, .contato-picker-dropdown');
    if (!inside) openPicker.close();
  });
  window.addEventListener('resize', () => openPicker?.close());
  // Fecha o dropdown ao scrollar a página, mas ignora scroll DENTRO do
  // próprio dropdown (pra permitir rolar a lista de contatos).
  window.addEventListener('scroll', (e) => {
    if (!openPicker) return;
    if (e.target instanceof Element && e.target.closest('.contato-picker-dropdown')) return;
    openPicker.close();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') openPicker?.close();
  });
}
