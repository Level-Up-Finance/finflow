// =============================================================
// FinFlow — Shared Conta Picker
// Factory function that creates a bank-avatar + grouped dropdown
// picker backed by a hidden input.
// =============================================================
import { typeIcon, typeColor } from './account-types.js';
import { escapeHtml } from './utils.js';

const GROUPS = [
  { label: 'Conta Corrente',    test: (c) => c.tipo === 'Corrente'           && (!c.moeda || c.moeda === 'BRL') },
  { label: 'Conta Poupança',    test: (c) => c.tipo === 'Poupança'           && (!c.moeda || c.moeda === 'BRL') },
  { label: 'Cofrinho',          test: (c) => c.tipo === 'Cofrinho'           && (!c.moeda || c.moeda === 'BRL') },
  { label: 'Investimento',      test: (c) => c.tipo === 'Investimento'       && (!c.moeda || c.moeda === 'BRL') },
  { label: 'Cartão de Crédito', test: (c) => c.tipo === 'Cartão de Crédito' },
  { label: 'Conta Estrangeira', test: (c) => c.tipo !== 'Cartão de Crédito' && c.moeda && c.moeda !== 'BRL' },
];

function _contaInitials(name) {
  const s = String(name || '?').trim();
  const parts = s.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function _avatarHtml(conta, size = 'sm') {
  const sizeClass = size === 'sm' ? 'size-sm' : size === 'xs' ? 'size-xs' : '';
  if (!conta) {
    return `<div class="bank-avatar ${sizeClass}"><div class="bank-avatar-fallback" style="background:#9CA3AF;">?</div></div>`;
  }
  const tipo  = conta.tipo || '';
  const color = conta.icone_cor || typeColor(tipo) || '#6B7280';
  const init  = _contaInitials(conta.apelido || conta.nome || '?');
  const badge = tipo
    ? `<div class="bank-avatar-badge" style="--type-color:${typeColor(tipo)};">${typeIcon(tipo)}</div>`
    : '';
  return `<div class="bank-avatar ${sizeClass}"><div class="bank-avatar-fallback" style="background:${color};">${init}</div>${badge}</div>`;
}

/** Named export — render a bank avatar for use outside the picker (e.g. table rows). */
export function contaAvatarHtml(conta, size = 'sm') { return _avatarHtml(conta, size); }

/**
 * Creates a conta picker instance.
 *
 * @param {object} opts
 * @param {string}   opts.triggerBtnId   - id of the <button> that opens the dropdown
 * @param {string}   opts.hiddenInputId  - id of the <input type="hidden">
 * @param {string}   [opts.avatarWrapId] - id of the avatar wrapper element (optional)
 * @param {string}   [opts.nameElId]     - id of the span that shows the conta name (optional)
 * @param {Function} opts.getContas      - () => Array — live-cache accessor
 * @param {string}   [opts.placeholder]  - text shown when nothing is selected
 * @param {boolean}  [opts.allowBlank]   - if true, shows a blank/none option at the top
 * @param {string}   [opts.blankLabel]   - label for the blank option (default: '— Nenhuma —')
 * @param {Function} [opts.onChange]     - callback(contaId) called after setValue
 *
 * @returns {{ init: Function, setValue: Function, getValue: Function }}
 */
export function createContaPicker({
  triggerBtnId,
  hiddenInputId,
  avatarWrapId,
  nameElId,
  getContas,
  placeholder = 'Selecione uma conta…',
  allowBlank = false,
  blankLabel = '— Nenhuma —',
  avatarSize = 'sm',
  onChange,
} = {}) {
  let _dropdownEl = null;
  let _isOpen     = false;

  function _getBtn()        { return document.getElementById(triggerBtnId); }
  function _getHidden()     { return document.getElementById(hiddenInputId); }
  function _getAvatarWrap() { return avatarWrapId ? document.getElementById(avatarWrapId) : null; }
  function _getNameEl()     { return nameElId ? document.getElementById(nameElId) : null; }

  function _close() {
    _dropdownEl?.classList.add('hidden');
    _isOpen = false;
    _getBtn()?.classList.remove('is-open');
  }

  function _renderDropdown(q = '') {
    if (!_dropdownEl) return;
    const contas    = getContas();
    const currentId = _getHidden()?.value || '';
    const qn        = q.toLowerCase();

    let html = `<div class="cp-search-wrap"><input class="cp-search-input" placeholder="Buscar conta…" value="${escapeHtml(q)}" autocomplete="off"></div>`;

    if (allowBlank) {
      const sel = currentId === '' ? ' cp-item--selected' : '';
      html += `<button type="button" class="cp-item${sel}" data-id="">
        <div class="bank-avatar size-sm"><div class="bank-avatar-fallback" style="background:#9CA3AF;">?</div></div>
        <span class="cp-item-name">${escapeHtml(blankLabel)}</span>
      </button>`;
    }

    let any = false;
    for (const g of GROUPS) {
      let items = contas.filter(g.test);
      if (qn) items = items.filter((c) => (c.apelido || c.nome || '').toLowerCase().includes(qn));
      if (!items.length) continue;
      any = true;
      html += `<div class="cp-group-label">${escapeHtml(g.label)}</div>`;
      for (const c of items) {
        const sel = c.id === currentId ? ' cp-item--selected' : '';
        html += `<button type="button" class="cp-item${sel}" data-id="${c.id}">
          ${_avatarHtml(c, 'sm')}
          <span class="cp-item-name">${escapeHtml(c.apelido || c.nome)}</span>
        </button>`;
      }
    }

    if (!any && !allowBlank) html += '<div class="cp-empty">Nenhuma conta encontrada</div>';

    _dropdownEl.innerHTML = html;

    _dropdownEl.querySelector('.cp-search-input').addEventListener('input', (e) => _renderDropdown(e.target.value));
    _dropdownEl.querySelectorAll('.cp-item').forEach((itemBtn) => {
      itemBtn.addEventListener('click', () => {
        setValue(itemBtn.dataset.id);
        _close();
      });
    });
  }

  function _open() {
    if (!_dropdownEl) return;
    _renderDropdown('');
    const btn  = _getBtn();
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const maxH = Math.min(320, Math.max(160, spaceBelow));
    const w    = Math.max(rect.width, 320);
    let left   = rect.left;
    if (left + w > window.innerWidth - 16) left = Math.max(8, window.innerWidth - w - 16);
    _dropdownEl.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${left}px;width:${w}px;max-height:${maxH}px;overflow-y:auto;z-index:9999;`;
    _dropdownEl.classList.remove('hidden');
    _isOpen = true;
    btn.classList.add('is-open');
    _dropdownEl.querySelector('.cp-search-input')?.focus();
  }

  function init() {
    const btn = _getBtn();
    if (!btn || btn._cpBound) return;
    btn._cpBound = true;

    _dropdownEl = document.createElement('div');
    _dropdownEl.className = 'conta-picker-dropdown hidden';
    document.body.appendChild(_dropdownEl);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _isOpen ? _close() : _open();
    });

    document.addEventListener('click', (e) => {
      if (_isOpen && !_dropdownEl.contains(e.target) && !btn.contains(e.target)) {
        _close();
      }
    });
  }

  function setValue(contaId) {
    const hidden     = _getHidden();
    const avatarWrap = _getAvatarWrap();
    const nameEl     = _getNameEl();
    const contas     = getContas();

    if (hidden) hidden.value = contaId || '';

    const c = contas.find((x) => x.id === contaId);

    if (avatarWrap) avatarWrap.innerHTML = _avatarHtml(c || null, avatarSize);
    if (nameEl) nameEl.textContent = c ? (c.apelido || c.nome) : placeholder;

    hidden?.dispatchEvent(new Event('change', { bubbles: true }));

    if (onChange) onChange(contaId);
  }

  function getValue() {
    return _getHidden()?.value || '';
  }

  return { init, setValue, getValue };
}
