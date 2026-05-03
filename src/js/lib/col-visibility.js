// =============================================================
// FinFlow — Col Visibility
// Gerencia visibilidade de colunas de tabelas.
// Persistência em localStorage; ocultação via CSS injection
// (auto-aplica a tabelas re-renderizadas via innerHTML).
// =============================================================

const PREFIX = 'finflow:cols:';

/**
 * @param {object} opts
 * @param {string} opts.storageKey   - Chave única (ex. 'compromissos')
 * @param {string} opts.tableClass   - Classe CSS da <table> (ex. 'contas-table')
 * @param {Array}  opts.columns      - [{ key, label, defaultVisible }]
 * @param {Element} opts.toolbarEl   - Elemento onde o botão será injetado
 * @returns {HTMLElement}            - O wrapper (.col-vis-wrap) — pode ser hidden/shown
 */
export function initColVisibility({ storageKey, tableClass, columns, toolbarEl }) {
  const state = _loadState(storageKey, columns);
  _applyCSS(storageKey, tableClass, state);

  // Wrapper
  const wrap = document.createElement('div');
  wrap.className = 'col-vis-wrap';

  // Botão
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-ghost col-vis-btn';
  btn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="9" y1="3" x2="9" y2="21"/>
      <line x1="15" y1="3" x2="15" y2="21"/>
    </svg>
    Colunas
  `;

  // Dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'col-vis-dropdown';

  // "Todas" — Select All checkbox
  const allLbl = document.createElement('label');
  allLbl.className = 'col-vis-item col-vis-item--all';
  const allCb = document.createElement('input');
  allCb.type = 'checkbox';

  function _syncAllCheckbox() {
    const vals = columns.map((c) => !!state[c.key]);
    const allOn = vals.every(Boolean);
    const allOff = vals.every((v) => !v);
    allCb.checked = allOn;
    allCb.indeterminate = !allOn && !allOff;
  }
  _syncAllCheckbox();

  allCb.addEventListener('change', () => {
    const newVal = allCb.checked;
    for (const col of columns) state[col.key] = newVal;
    colCheckboxes.forEach((cb) => { cb.checked = newVal; });
    allCb.indeterminate = false;
    _persist(storageKey, state);
    _applyCSS(storageKey, tableClass, state);
  });

  allLbl.appendChild(allCb);
  allLbl.append(' Todas');
  dropdown.appendChild(allLbl);

  const sep = document.createElement('hr');
  sep.className = 'col-vis-sep';
  dropdown.appendChild(sep);

  const colCheckboxes = [];

  for (const col of columns) {
    const lbl = document.createElement('label');
    lbl.className = 'col-vis-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!state[col.key];
    colCheckboxes.push(cb);

    cb.addEventListener('change', () => {
      state[col.key] = cb.checked;
      _persist(storageKey, state);
      _applyCSS(storageKey, tableClass, state);
      _syncAllCheckbox();
    });

    lbl.appendChild(cb);
    lbl.append(' ' + col.label);
    dropdown.appendChild(lbl);
  }

  // Toggle dropdown ao clicar no botão
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('col-vis-dropdown--open');
  });

  // Cliques dentro do dropdown não fecham
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  // Clique fora fecha
  document.addEventListener('click', () => {
    dropdown.classList.remove('col-vis-dropdown--open');
  });

  wrap.appendChild(btn);
  wrap.appendChild(dropdown);
  toolbarEl.appendChild(wrap);

  return wrap;
}

// -----------------------------
// Internals
// -----------------------------
function _loadState(storageKey, columns) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PREFIX + storageKey) || '{}'); } catch {}
  const state = {};
  for (const col of columns) {
    state[col.key] = col.key in saved ? !!saved[col.key] : col.defaultVisible;
  }
  return state;
}

function _persist(storageKey, state) {
  try { localStorage.setItem(PREFIX + storageKey, JSON.stringify(state)); } catch {}
}

function _applyCSS(storageKey, tableClass, state) {
  const id = 'cv-' + storageKey;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = Object.entries(state)
    .filter(([, v]) => !v)
    .map(([k]) => `.${tableClass} [data-col="${k}"] { display: none !important; }`)
    .join('\n');
}
