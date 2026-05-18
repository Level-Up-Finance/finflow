// =============================================================
// AddressPicker — formulário de endereço com suporte internacional
// =============================================================
// Uso:
//   import { AddressPicker, renderAddressFieldsHtml } from '../components/address-picker.js';
//   const ap = new AddressPicker('ct-', container);
//   ap.getValue()  → { pais, cep, logradouro, numero, complemento, bairro, cidade, estado_uf }
//   ap.setValue(obj)
// =============================================================
import {
  formatCep, isValidCep, fetchCep,
} from '../lib/cep-lookup.js';
import { showToast } from './toast.js';

// ── Países ────────────────────────────────────────────────────
// Países mais relevantes no topo; demais em ordem alfabética.
export const PAISES = [
  'Brasil',
  'Estados Unidos',
  'Reino Unido',
  '—',
  'África do Sul', 'Alemanha', 'Argentina', 'Austrália', 'Áustria',
  'Bélgica', 'Bolívia', 'Canadá', 'Chile', 'China', 'Colômbia',
  'Coreia do Sul', 'Costa Rica', 'Cuba', 'Dinamarca', 'Emirados Árabes',
  'Equador', 'Espanha', 'Filipinas', 'Finlândia', 'França', 'Grécia',
  'Guatemala', 'Honduras', 'Hong Kong', 'Hungria', 'Índia', 'Indonésia',
  'Irlanda', 'Israel', 'Itália', 'Japão', 'Malásia', 'Marrocos',
  'México', 'Nigéria', 'Noruega', 'Nova Zelândia', 'Países Baixos',
  'Panamá', 'Paraguai', 'Peru', 'Polônia', 'Portugal', 'República Tcheca',
  'Romênia', 'Rússia', 'Singapura', 'Suécia', 'Suíça', 'Tailândia',
  'Taiwan', 'Turquia', 'Ucrânia', 'Uruguai', 'Venezuela', 'Vietnã',
  'Outro',
];

// Configuração por país: qual lookup usar
// ZIP Code (EUA) e Post Code (UK) removidos temporariamente — sg.app.000042.
// Lookup automático só disponível para Brasil via ViaCEP.
const LOOKUP_CONFIG = {
  'Brasil': { type: 'cep', label: 'CEP', placeholder: '00000-000' },
};

export class AddressPicker {
  /**
   * @param {string} prefix  – prefixo dos IDs, ex: 'ct-' ou 'perfil-'
   * @param {HTMLElement} [container] – container onde buscar os elementos (default: document)
   */
  constructor(prefix, container) {
    this._p   = prefix;
    this._ctx = container || document;
    this._$ = (id) => this._ctx.querySelector(`#${this._p}${id}`);
    this._bindPais();
  }

  _bindPais() {
    const paisEl = this._$('pais');
    if (!paisEl) return;

    // Aplica UI inicial baseado no país atual
    this._updatePostalUI(paisEl.value);

    paisEl.addEventListener('change', () => {
      this._updatePostalUI(paisEl.value);
      // Limpa código postal ao trocar de país
      const postalEl = this._$('cep');
      if (postalEl) postalEl.value = '';
    });
  }

  _updatePostalUI(pais) {
    const config    = LOOKUP_CONFIG[pais];
    const postalEl  = this._$('cep');
    const btnEl     = this._$('btn-buscar-cep');
    const labelEl   = this._$('postal-label');
    const _rowEl    = this._$('postal-row');

    if (labelEl && config) labelEl.textContent = config.label;
    if (postalEl && config) postalEl.placeholder = config.placeholder;

    // Mostra/oculta botão de busca — só para BR, US e UK
    if (btnEl) {
      btnEl.classList.toggle('hidden', !config);
      if (config) btnEl.textContent = `Buscar ${config.label}`;
    }

    // Rebinda o postal input
    if (postalEl) {
      // Remove listeners antigos clonando o elemento
      const clone = postalEl.cloneNode(true);
      postalEl.parentNode.replaceChild(clone, postalEl);
      this._bindPostal(pais);
    }
  }

  _bindPostal(pais) {
    const postalEl = this._$('cep');
    const btnEl    = this._$('btn-buscar-cep');
    if (!postalEl) return;

    const config = LOOKUP_CONFIG[pais];
    if (!config) return; // outros países: sem lookup

    const validate = () => isValidCep(postalEl.value);

    // Formata CEP ao digitar
    postalEl.addEventListener('input', () => {
      const raw = postalEl.value.replace(/\D/g, '');
      postalEl.value = formatCep(raw);
      if (btnEl) btnEl.disabled = !validate();
    });

    postalEl.addEventListener('blur', () => {
      if (validate()) this._lookup(pais);
    });

    postalEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._lookup(pais); }
    });

    if (btnEl) {
      // Clona para remover listeners antigos do botão também
      const btnClone = btnEl.cloneNode(true);
      btnEl.parentNode.replaceChild(btnClone, btnEl);
      this._$('btn-buscar-cep').addEventListener('click', () => this._lookup(pais));
    }
  }

  async _lookup(pais) {
    const postalEl = this._$('cep');
    const btnEl    = this._$('btn-buscar-cep');
    const config   = LOOKUP_CONFIG[pais];
    if (!postalEl || !config) return;

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '…'; }

    try {
      const addr = await fetchCep(postalEl.value);
      if (!addr) return;

      // Preenche campos disponíveis (não sobrescreve se já preenchido manualmente,
      // exceto CEP que normaliza)
      const set = (id, val) => {
        const el = this._$(id);
        if (el && val) el.value = val;
      };
      if (addr.cep)        postalEl.value = addr.cep;
      if (addr.logradouro) set('logradouro', addr.logradouro);
      if (addr.bairro)     set('bairro',     addr.bairro);
      set('cidade',        addr.cidade);
      set('estado-uf',     addr.estado_uf);

      // Foca no número após preencher
      const numEl = this._$('numero');
      if (numEl) setTimeout(() => numEl.focus(), 30);

      ['cep','logradouro','bairro','cidade','estado-uf'].forEach((id) => {
        this._$(id)?.dispatchEvent(new Event('input', { bubbles: true }));
      });

    } catch (err) {
      showToast(err.message || 'Código postal não encontrado.', 'error', 4000);
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = `Buscar ${config?.label ?? ''}`;
      }
    }
  }

  getValue() {
    const g = (id) => (this._$(id)?.value || '').trim();
    return {
      pais:        g('pais'),
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
    const pais = obj.pais || 'Brasil';
    s('pais',        pais);
    s('cep',         pais === 'Brasil' ? formatCep(obj.cep || '') : (obj.cep || ''));
    s('logradouro',  obj.logradouro  || '');
    s('numero',      obj.numero      || '');
    s('complemento', obj.complemento || '');
    s('bairro',      obj.bairro      || '');
    s('cidade',      obj.cidade      || '');
    s('estado-uf',   obj.estado_uf   || '');
    // Atualiza UI após setar o país
    this._updatePostalUI(pais);
  }

  /** Endereço formatado para exibição */
  getFormatted() {
    const v = this.getValue();
    const parts = [
      v.logradouro,
      v.numero      ? `nº ${v.numero}` : '',
      v.complemento,
      v.bairro,
      v.cidade && v.estado_uf ? `${v.cidade}/${v.estado_uf}` : v.cidade || v.estado_uf,
      v.cep,
      v.pais && v.pais !== 'Brasil' ? v.pais : '',
    ].filter(Boolean);
    return parts.join(', ');
  }

  hasData() {
    const v = this.getValue();
    return Object.values(v).some(Boolean);
  }
}

/** Gera o HTML dos campos de endereço */
export function renderAddressFieldsHtml(prefix) {
  const p = prefix;

  const paisOptions = PAISES.map((c) =>
    c === '—'
      ? `<option disabled>──────────────</option>`
      : `<option value="${c}">${c}</option>`
  ).join('');

  return `
    <div class="addr-pais-row">
      <label class="addr-label" for="${p}pais">País</label>
      <select class="select addr-pais-select" id="${p}pais" autocomplete="country-name">
        ${paisOptions}
      </select>
    </div>
    <div class="addr-cep-row" id="${p}postal-row">
      <label class="addr-label" id="${p}postal-label" for="${p}cep">CEP</label>
      <div class="addr-cep-input-wrap">
        <input type="text" class="input addr-cep-input" id="${p}cep"
               maxlength="12" placeholder="00000-000" autocomplete="postal-code">
        <button type="button" class="btn btn-secondary btn-sm addr-cep-btn" id="${p}btn-buscar-cep" disabled>Buscar CEP</button>
      </div>
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
        <input type="text" class="input" id="${p}complemento" maxlength="100" placeholder="Apto, suite…" autocomplete="address-line2">
      </div>
      <div class="addr-field addr-field--bairro">
        <label class="addr-label" for="${p}bairro">Bairro / Distrito</label>
        <input type="text" class="input" id="${p}bairro" maxlength="100" placeholder="Bairro" autocomplete="address-level3">
      </div>
      <div class="addr-field addr-field--cidade">
        <label class="addr-label" for="${p}cidade">Cidade</label>
        <input type="text" class="input" id="${p}cidade" maxlength="100" placeholder="Cidade" autocomplete="address-level2">
      </div>
      <div class="addr-field addr-field--estado">
        <label class="addr-label" for="${p}estado-uf">Estado / Região</label>
        <input type="text" class="input" id="${p}estado-uf" maxlength="60" placeholder="Estado" autocomplete="address-level1">
      </div>
    </div>
  `;
}
