// =============================================================
// FotoPicker — widget de upload de foto para formulários
// =============================================================
// Uso:
//   import { FotoPicker } from '../components/foto-picker.js';
//   const fp = new FotoPicker(document.getElementById('meu-foto-picker'));
//   fp.setValue(url, nome)   → exibe foto ou iniciais
//   fp.getValue()            → URL atual (string | null)
// =============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentUser } from '../lib/auth.js';
import { showToast } from './toast.js';

const COLORS = ['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EF4444','#06B6D4','#F97316','#84CC16'];

function avatarColor(nome) {
  let hash = 0;
  for (let i = 0; i < (nome || '').length; i++)
    hash = (nome.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(nome) {
  const parts = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const CAMERA_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
  <circle cx="12" cy="13" r="4"/>
</svg>`;

export class FotoPicker {
  /**
   * @param {HTMLElement} el - container onde o widget será renderizado
   * @param {object} [opts]
   * @param {string} [opts.nome] - nome inicial para gerar iniciais
   */
  constructor(el, { nome = '' } = {}) {
    this._el   = el;
    this._url  = null;
    this._nome = nome;
    this._render();
    this._bind();
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  _render() {
    this._el.innerHTML = `
      <button type="button" class="foto-picker-btn" aria-label="Adicionar foto">
        <div class="foto-picker-avatar" id="_fp-avatar"></div>
        <div class="foto-picker-overlay">${CAMERA_ICON}</div>
      </button>
      <input type="file" class="foto-picker-input" accept="image/jpeg,image/png,image/webp,image/gif"
             style="position:absolute;opacity:0;pointer-events:none;width:0;height:0" tabindex="-1">
      <button type="button" class="foto-picker-remove hidden" title="Remover foto">Remover foto</button>
    `;
    this._btnEl    = this._el.querySelector('.foto-picker-btn');
    this._avatarEl = this._el.querySelector('.foto-picker-avatar');
    this._inputEl  = this._el.querySelector('.foto-picker-input');
    this._removeEl = this._el.querySelector('.foto-picker-remove');
    this._refresh();
  }

  _refresh() {
    if (this._url) {
      this._avatarEl.style.background = '';
      this._avatarEl.innerHTML = `<img src="${this._url}" alt="" onerror="this.parentElement._fallback && this.parentElement._fallback()">`;
      // Fallback se imagem falhar
      this._avatarEl.querySelector('img').addEventListener('error', () => {
        this._url = null;
        this._refresh();
      });
      this._removeEl.classList.remove('hidden');
    } else {
      const nome   = this._nome;
      const color  = nome ? avatarColor(nome) : '#94a3b8';
      const initials = getInitials(nome);
      this._avatarEl.style.background = color;
      this._avatarEl.innerHTML = `<span>${initials}</span>`;
      this._removeEl.classList.add('hidden');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Events
  // ─────────────────────────────────────────────────────────────

  _bind() {
    this._btnEl.addEventListener('click', () => this._inputEl.click());
    this._inputEl.addEventListener('change', (e) => this._handleChange(e));
    this._removeEl.addEventListener('click', () => { this._url = null; this._refresh(); });
  }

  // ─────────────────────────────────────────────────────────────
  // Upload
  // ─────────────────────────────────────────────────────────────

  async _handleChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Arquivo precisa ser uma imagem.', 'error'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Imagem maior que 5 MB. Reduza antes de subir.', 'error', 6000); return;
    }

    const user = await getCurrentUser();
    if (!user) { showToast('Sessão expirada. Faça login novamente.', 'error'); return; }

    const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${user.id}/contato-${Date.now()}.${ext}`;

    this._btnEl.disabled = true;
    this._btnEl.classList.add('foto-picker-loading');
    showToast('Enviando foto…', 'info', 2500);

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (upErr) {
      showToast('Erro ao enviar: ' + upErr.message, 'error', 8000);
      this._btnEl.disabled = false;
      this._btnEl.classList.remove('foto-picker-loading');
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    this._url = urlData?.publicUrl || null;
    this._refresh();
    this._btnEl.disabled = false;
    this._btnEl.classList.remove('foto-picker-loading');
  }

  // ─────────────────────────────────────────────────────────────
  // API
  // ─────────────────────────────────────────────────────────────

  getValue() { return this._url; }

  setValue(url, nome) {
    if (nome !== undefined) this._nome = nome;
    this._url = url || null;
    this._refresh();
  }

  /** Atualiza só o nome (para gerar iniciais corretas sem trocar a foto) */
  setNome(nome) {
    this._nome = nome || '';
    if (!this._url) this._refresh(); // só redesenha se não tem foto
  }
}
