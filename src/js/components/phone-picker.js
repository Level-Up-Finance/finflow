// =============================================================
// PhonePicker — seletor de país (bandeira + nome) + campo tel
// =============================================================
// Uso:
//   import { PhonePicker } from '../components/phone-picker.js';
//   const pp = new PhonePicker(inputEl);   // inputEl pode ser text ou hidden
//   pp.getValue()   → "+55 11 99999-9999"
//   pp.setValue(v)  → preenche picker + número
//   pp.setDisabled(bool)
//
// O input original é mantido dentro do wrapper e recebe o valor
// completo (+CC localpart) a cada mudança — compatível com qualquer
// listener de 'input' já existente no código.
// =============================================================

export const PHONE_COUNTRIES = [
  { iso: 'BR', flag: '🇧🇷', name: 'Brasil',           code: '+55'  },
  { iso: 'PT', flag: '🇵🇹', name: 'Portugal',         code: '+351' },
  { iso: 'US', flag: '🇺🇸', name: 'Estados Unidos',   code: '+1'   },
  { iso: 'CA', flag: '🇨🇦', name: 'Canadá',           code: '+1'   },
  { iso: 'AR', flag: '🇦🇷', name: 'Argentina',        code: '+54'  },
  { iso: 'BO', flag: '🇧🇴', name: 'Bolívia',          code: '+591' },
  { iso: 'CL', flag: '🇨🇱', name: 'Chile',            code: '+56'  },
  { iso: 'CO', flag: '🇨🇴', name: 'Colômbia',         code: '+57'  },
  { iso: 'EC', flag: '🇪🇨', name: 'Equador',          code: '+593' },
  { iso: 'MX', flag: '🇲🇽', name: 'México',           code: '+52'  },
  { iso: 'PE', flag: '🇵🇪', name: 'Peru',             code: '+51'  },
  { iso: 'PY', flag: '🇵🇾', name: 'Paraguai',         code: '+595' },
  { iso: 'UY', flag: '🇺🇾', name: 'Uruguai',          code: '+598' },
  { iso: 'VE', flag: '🇻🇪', name: 'Venezuela',        code: '+58'  },
  { iso: 'GB', flag: '🇬🇧', name: 'Reino Unido',      code: '+44'  },
  { iso: 'DE', flag: '🇩🇪', name: 'Alemanha',         code: '+49'  },
  { iso: 'AT', flag: '🇦🇹', name: 'Áustria',          code: '+43'  },
  { iso: 'BE', flag: '🇧🇪', name: 'Bélgica',          code: '+32'  },
  { iso: 'DK', flag: '🇩🇰', name: 'Dinamarca',        code: '+45'  },
  { iso: 'ES', flag: '🇪🇸', name: 'Espanha',          code: '+34'  },
  { iso: 'FR', flag: '🇫🇷', name: 'França',           code: '+33'  },
  { iso: 'IT', flag: '🇮🇹', name: 'Itália',           code: '+39'  },
  { iso: 'NL', flag: '🇳🇱', name: 'Holanda',          code: '+31'  },
  { iso: 'NO', flag: '🇳🇴', name: 'Noruega',          code: '+47'  },
  { iso: 'PL', flag: '🇵🇱', name: 'Polônia',          code: '+48'  },
  { iso: 'RU', flag: '🇷🇺', name: 'Rússia',           code: '+7'   },
  { iso: 'SE', flag: '🇸🇪', name: 'Suécia',           code: '+46'  },
  { iso: 'CH', flag: '🇨🇭', name: 'Suíça',            code: '+41'  },
  { iso: 'TR', flag: '🇹🇷', name: 'Turquia',          code: '+90'  },
  { iso: 'ZA', flag: '🇿🇦', name: 'África do Sul',    code: '+27'  },
  { iso: 'AE', flag: '🇦🇪', name: 'Emirados Árabes',  code: '+971' },
  { iso: 'IL', flag: '🇮🇱', name: 'Israel',           code: '+972' },
  { iso: 'SA', flag: '🇸🇦', name: 'Arábia Saudita',   code: '+966' },
  { iso: 'AU', flag: '🇦🇺', name: 'Austrália',        code: '+61'  },
  { iso: 'CN', flag: '🇨🇳', name: 'China',            code: '+86'  },
  { iso: 'IN', flag: '🇮🇳', name: 'Índia',            code: '+91'  },
  { iso: 'JP', flag: '🇯🇵', name: 'Japão',            code: '+81'  },
  { iso: 'KR', flag: '🇰🇷', name: 'Coreia do Sul',    code: '+82'  },
  { iso: 'SG', flag: '🇸🇬', name: 'Singapura',        code: '+65'  },
];

const CHEVRON_SVG = `<svg class="phone-picker-chevron" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>`;

export class PhonePicker {
  /**
   * @param {HTMLInputElement} inputEl   – input original (text/hidden)
   * @param {object}           [opts]
   * @param {string}           [opts.defaultIso='BR']   – ISO padrão
   * @param {string}           [opts.placeholder='']    – placeholder do número
   */
  constructor(inputEl, opts = {}) {
    this.input       = inputEl;
    this.defaultIso  = opts.defaultIso || 'BR';
    this.placeholder = opts.placeholder || '';
    this._country    = PHONE_COUNTRIES.find(c => c.iso === this.defaultIso) || PHONE_COUNTRIES[0];
    this._disabled   = false;
    this._build();
    this._parseValue(this.input.value || '');
  }

  // ── build DOM ──────────────────────────────────────────────
  _build() {
    const wrapper = document.createElement('div');
    wrapper.className = 'phone-picker';

    // ── country button ──
    this._btn = document.createElement('button');
    this._btn.type = 'button';
    this._btn.className = 'phone-picker-btn';
    this._btn.setAttribute('aria-haspopup', 'listbox');
    this._btn.setAttribute('aria-expanded', 'false');

    this._flagEl = document.createElement('span');
    this._flagEl.className = 'phone-picker-flag';

    this._nameEl = document.createElement('span');
    this._nameEl.className = 'phone-picker-name';

    this._codeEl = document.createElement('span');
    this._codeEl.className = 'phone-picker-dial';

    this._btn.appendChild(this._flagEl);
    this._btn.appendChild(this._nameEl);
    this._btn.appendChild(this._codeEl);
    this._btn.insertAdjacentHTML('beforeend', CHEVRON_SVG);

    // ── dropdown ──
    this._dropdown = document.createElement('div');
    this._dropdown.className = 'phone-picker-dropdown hidden';
    this._dropdown.setAttribute('role', 'listbox');

    this._searchEl = document.createElement('input');
    this._searchEl.type = 'text';
    this._searchEl.className = 'phone-picker-search';
    this._searchEl.placeholder = 'Buscar país…';
    this._searchEl.autocomplete = 'off';

    this._listEl = document.createElement('ul');
    this._listEl.className = 'phone-picker-list';

    this._dropdown.appendChild(this._searchEl);
    this._dropdown.appendChild(this._listEl);

    // ── number input ──
    this._numInput = document.createElement('input');
    this._numInput.type = 'tel';
    this._numInput.className = 'phone-picker-number';
    this._numInput.placeholder = this.placeholder;
    this._numInput.autocomplete = 'tel-national';

    // hide & move original input inside wrapper
    this.input.type = 'hidden';
    this.input.parentNode.insertBefore(wrapper, this.input);
    wrapper.appendChild(this._btn);
    wrapper.appendChild(this._dropdown);
    wrapper.appendChild(this._numInput);
    wrapper.appendChild(this.input);

    this._wrapper = wrapper;

    // ── events ──
    this._btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._disabled) return;
      this._toggleDropdown();
    });

    this._searchEl.addEventListener('input', () => {
      this._renderList(this._searchEl.value);
    });

    this._numInput.addEventListener('input', () => {
      this._writeValue();
    });

    // close on outside click
    document.addEventListener('click', (e) => {
      if (!this._wrapper.contains(e.target)) this._closeDropdown();
    });

    this._renderList('');
    this._applyCountry();
  }

  // ── render country list ────────────────────────────────────
  _renderList(q) {
    const lq = q.toLowerCase().trim();
    const countries = lq
      ? PHONE_COUNTRIES.filter(c =>
          c.name.toLowerCase().includes(lq) ||
          c.code.includes(lq) ||
          c.iso.toLowerCase().includes(lq))
      : PHONE_COUNTRIES;

    this._listEl.innerHTML = '';
    for (const c of countries) {
      const li = document.createElement('li');
      li.className = 'phone-picker-item' + (c.iso === this._country.iso ? ' is-selected' : '');
      li.setAttribute('role', 'option');
      li.innerHTML =
        `<span class="pp-item-flag">${c.flag}</span>` +
        `<span class="pp-item-name">${c.name}</span>` +
        `<span class="pp-item-code">${c.code}</span>`;
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        this._country = c;
        this._applyCountry();
        this._closeDropdown();
        this._writeValue();
        this._numInput.focus();
      });
      this._listEl.appendChild(li);
    }
  }

  // ── apply selected country to button ──────────────────────
  _applyCountry() {
    this._flagEl.textContent = this._country.flag;
    this._nameEl.textContent = this._country.name;
    this._codeEl.textContent = this._country.code;
  }

  // ── dropdown ──────────────────────────────────────────────
  _toggleDropdown() {
    const hidden = this._dropdown.classList.contains('hidden');
    if (hidden) this._openDropdown();
    else        this._closeDropdown();
  }

  _openDropdown() {
    this._searchEl.value = '';
    this._renderList('');
    this._dropdown.classList.remove('hidden');
    this._btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => this._searchEl.focus());
  }

  _closeDropdown() {
    this._dropdown.classList.add('hidden');
    this._btn.setAttribute('aria-expanded', 'false');
  }

  // ── value helpers ─────────────────────────────────────────
  _writeValue() {
    const num = this._numInput.value.trim();
    this.input.value = num ? `${this._country.code} ${num}` : '';
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  _parseValue(v) {
    if (!v) { this._numInput.value = ''; return; }

    // Sort by code length desc to avoid short codes eating long ones (+1 vs +351)
    const sorted = [...PHONE_COUNTRIES].sort((a, b) => b.code.length - a.code.length);
    for (const c of sorted) {
      if (v.startsWith(c.code + ' ') || v === c.code) {
        this._country = c;
        this._applyCountry();
        this._numInput.value = v.slice(c.code.length).trim();
        return;
      }
    }
    // No match: put raw value in number field, keep default country
    this._numInput.value = v;
  }

  // ── public API ────────────────────────────────────────────
  getValue() {
    const num = this._numInput.value.trim();
    return num ? `${this._country.code} ${num}` : '';
  }

  setValue(v) {
    this.input.value = v || '';
    this._parseValue(v || '');
  }

  setDisabled(bool) {
    this._disabled = bool;
    this._btn.disabled      = bool;
    this._numInput.disabled = bool;
    this._wrapper.classList.toggle('phone-picker--disabled', bool);
    if (bool) this._closeDropdown();
  }

  syncFrom(other) {
    // Mirror country + number from another PhonePicker
    this._country = other._country;
    this._applyCountry();
    this._numInput.value = other._numInput.value;
    this._writeValue();
  }
}
