// =============================================================
// AddressPicker — formulário de endereço estruturado com CEP
// =============================================================
// Uso:
//   import { AddressPicker } from '../components/address-picker.js';
//   const ap = new AddressPicker('ct-');   // prefix dos IDs
//   ap.getValue()  → { cep, logradouro, numero, complemento, bairro, cidade, estado_uf }
//   ap.setValue(obj)
// =============================================================
import { formatCep, isValidCep, fetchCep } from '../lib/cep-lookup.js';
import { showToast } from './toast.js';

const ESTADOS = [
  '', 'AC','AL','AP','AM','BA','CE','DF','ES','GO',
  'MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ',
  'RN','RS','RO','RR','SC','SP','SE','TO',
];

export class AddressPicker {
  /**
   * @param {string} prefix  – prefixo dos IDs, ex: 'ct-' ou 'perfil-'
   * @param {HTMLElement} [container] – container onde buscar os elementos (default: document)
   */
  constructor(prefix, container) {
    this._p   = prefix;
    this._ctx = container || document;
    this._$ = (id) => this._ctx.querySelector(`#${this._p}${id}`);
    this._bindCep();
  }

  _bindCep() {
    const cepEl = this._$('cep');
    const btnEl = this._$('btn-buscar-cep');
    if (!cepEl) return;

    // Formata ao digitar
    cepEl.addEventListener('input', () => {
      const raw = cepEl.value.replace(/\D/g, '');
      cepEl.value = formatCep(raw);
      if (btnEl) btnEl.disabled = !isValidCep(raw);
    });

    // Busca ao sair do campo (blur) se válido
    cepEl.addEventListener('blur', () => {
      if (isValidCep(cepEl.value)) this._lookupCep();
    });

    // Busca ao pressionar Enter
    cepEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._lookupCep(); }
    });

    // Botão buscar
    if (btnEl) {
      btnEl.addEventListener('click', () => this._lookupCep());
    }
  }

  async _lookupCep() {
    const cepEl = this._$('cep');
    const btnEl = this._$('btn-buscar-cep');
    if (!cepEl || !isValidCep(cepEl.value)) return;

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '…'; }

    try {
      const addr = await fetchCep(cepEl.value);
      cepEl.value = addr.cep;

      const set = (id, val) => {
        const el = this._$(id);
        if (el && val) el.value = val;
      };
      set('logradouro', addr.logradouro);
      set('bairro',     addr.bairro);
      set('cidade',     addr.cidade);

      // Estado: select ou input
      const estadoEl = this._$('estado-uf');
      if (estadoEl && addr.estado_uf) estadoEl.value = addr.estado_uf;

      // Foca no número após preencher
      const numEl = this._$('numero');
      if (numEl) setTimeout(() => numEl.focus(), 30);

      // Dispara input em todos os campos para updateSaveButton
      ['cep','logradouro','bairro','cidade','estado-uf'].forEach((id) => {
        this._$(id)?.dispatchEvent(new Event('input', { bubbles: true }));
      });

    } catch (err) {
      showToast(err.message || 'CEP não encontrado.', 'error', 4000);
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Buscar'; }
    }
  }

  getValue() {
    const g = (id) => (this._$(id)?.value || '').trim();
    return {
      cep:         g('cep'),
      logradouro:  g('logradouro'),
      numero:      g('numero'),
      complemento: g('complemento'),
      bairro:      g('bairro'),
      cidade:      g('cidade'),
      estado_uf:   g('estado-uf'),
    };
  }

  setValue(obj) {
    if (!obj) return;
    const s = (id, val) => { const el = this._$(id); if (el) el.value = val || ''; };
    s('cep',         formatCep(obj.cep || ''));
    s('logradouro',  obj.logradouro  || '');
    s('numero',      obj.numero      || '');
    s('complemento', obj.complemento || '');
    s('bairro',      obj.bairro      || '');
    s('cidade',      obj.cidade      || '');
    s('estado-uf',   obj.estado_uf   || '');
  }

  /** Endereço formatado para exibição (backward compat) */
  getFormatted() {
    const v = this.getValue();
    const parts = [
      v.logradouro,
      v.numero      ? `nº ${v.numero}` : '',
      v.complemento,
      v.bairro,
      v.cidade && v.estado_uf ? `${v.cidade}/${v.estado_uf}` : v.cidade || v.estado_uf,
      v.cep,
    ].filter(Boolean);
    return parts.join(', ');
  }

  hasData() {
    const v = this.getValue();
    return Object.values(v).some(Boolean);
  }
}

/** Gera o HTML dos campos de endereço — inserir onde o textarea estava */
export function renderAddressFieldsHtml(prefix) {
  const p = prefix; // ex: 'ct-' ou 'perfil-'
  const estadoOptions = ESTADOS.map((e) =>
    e ? `<option value="${e}">${e}</option>` : `<option value="">UF</option>`
  ).join('');

  return `
    <div class="addr-cep-row">
      <input type="text" class="input addr-cep-input" id="${p}cep"
             maxlength="9" placeholder="00000-000" autocomplete="postal-code">
      <button type="button" class="btn btn-secondary btn-sm addr-cep-btn" id="${p}btn-buscar-cep" disabled>Buscar</button>
    </div>
    <div class="addr-grid">
      <div class="addr-field addr-field--logradouro">
        <label class="addr-label" for="${p}logradouro">Rua / Av.</label>
        <input type="text" class="input" id="${p}logradouro" maxlength="200" placeholder="Logradouro" autocomplete="address-line1">
      </div>
      <div class="addr-field addr-field--numero">
        <label class="addr-label" for="${p}numero">Nº</label>
        <input type="text" class="input" id="${p}numero" maxlength="20" placeholder="Número" autocomplete="off">
      </div>
      <div class="addr-field addr-field--complemento">
        <label class="addr-label" for="${p}complemento">Complemento</label>
        <input type="text" class="input" id="${p}complemento" maxlength="100" placeholder="Apto, sala…" autocomplete="address-line2">
      </div>
      <div class="addr-field addr-field--bairro">
        <label class="addr-label" for="${p}bairro">Bairro</label>
        <input type="text" class="input" id="${p}bairro" maxlength="100" placeholder="Bairro" autocomplete="address-level3">
      </div>
      <div class="addr-field addr-field--cidade">
        <label class="addr-label" for="${p}cidade">Cidade</label>
        <input type="text" class="input" id="${p}cidade" maxlength="100" placeholder="Cidade" autocomplete="address-level2">
      </div>
      <div class="addr-field addr-field--estado">
        <label class="addr-label" for="${p}estado-uf">Estado</label>
        <select class="select" id="${p}estado-uf" autocomplete="address-level1">
          ${estadoOptions}
        </select>
      </div>
    </div>
  `;
}
