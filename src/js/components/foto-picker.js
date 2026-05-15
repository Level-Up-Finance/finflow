// =============================================================
// FotoPicker — widget de upload de foto com crop interativo
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
const VP_SIZE    = 220;  // px — tamanho do viewport de crop circular
const CANVAS_OUT = 480;  // px — resolução de saída do canvas

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
      this._avatarEl.innerHTML = `<img src="${this._url}" alt="">`;
      this._avatarEl.querySelector('img').addEventListener('error', () => {
        this._url = null;
        this._refresh();
      });
      this._removeEl.classList.remove('hidden');
    } else {
      const nome     = this._nome;
      const color    = nome ? avatarColor(nome) : '#94a3b8';
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
  // File selection → crop modal
  // ─────────────────────────────────────────────────────────────

  async _handleChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Arquivo precisa ser uma imagem.', 'error'); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('Imagem maior que 10 MB. Reduza antes de subir.', 'error', 6000); return;
    }

    this._showCropModal(file);
  }

  // ─────────────────────────────────────────────────────────────
  // Crop modal
  // ─────────────────────────────────────────────────────────────

  _showCropModal(file) {
    const objUrl = URL.createObjectURL(file);

    // ── Build overlay ───────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'fp-crop-overlay';
    overlay.innerHTML = `
      <div class="fp-crop-modal" role="dialog" aria-modal="true" aria-label="Ajustar foto">
        <div class="fp-crop-header">
          <span class="fp-crop-title">Ajustar foto</span>
          <button type="button" class="fp-crop-close" aria-label="Fechar">×</button>
        </div>
        <div class="fp-crop-stage">
          <div class="fp-crop-viewport">
            <img class="fp-crop-img" src="${objUrl}" draggable="false" alt="">
          </div>
          <p class="fp-crop-hint">Arraste para reposicionar · scroll ou botões para zoom</p>
        </div>
        <div class="fp-crop-controls">
          <button type="button" class="fp-crop-zoom-btn" data-dir="-1" aria-label="Zoom out">−</button>
          <input type="range" class="fp-crop-range" min="1" max="4" step="0.01" value="1" aria-label="Zoom">
          <button type="button" class="fp-crop-zoom-btn" data-dir="1" aria-label="Zoom in">+</button>
        </div>
        <div class="fp-crop-footer">
          <button type="button" class="btn btn-ghost fp-crop-cancel">Cancelar</button>
          <button type="button" class="btn btn-primary fp-crop-confirm">Usar foto</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const img     = overlay.querySelector('.fp-crop-img');
    const vpEl    = overlay.querySelector('.fp-crop-viewport');
    const range   = overlay.querySelector('.fp-crop-range');

    // ── State: img position (top-left in viewport coords) + zoom ─
    let baseScale = 1;
    let imgLeft   = 0;
    let imgTop    = 0;
    let zoom      = 1;
    let rendW     = VP_SIZE;
    let rendH     = VP_SIZE;
    let ready     = false;

    const clampPos = () => {
      const w = rendW * zoom;
      const h = rendH * zoom;
      imgLeft = Math.min(0, Math.max(VP_SIZE - w, imgLeft));
      imgTop  = Math.min(0, Math.max(VP_SIZE - h, imgTop));
    };

    const applyPos = () => {
      const w = rendW * zoom;
      const h = rendH * zoom;
      img.style.width  = w + 'px';
      img.style.height = h + 'px';
      img.style.left   = imgLeft + 'px';
      img.style.top    = imgTop  + 'px';
    };

    const setZoom = (newZoom, pivotX = VP_SIZE / 2, pivotY = VP_SIZE / 2) => {
      newZoom = Math.min(4, Math.max(1, newZoom));
      // Keep pivot point fixed in viewport
      imgLeft = pivotX - (pivotX - imgLeft) * (newZoom / zoom);
      imgTop  = pivotY - (pivotY - imgTop)  * (newZoom / zoom);
      zoom = newZoom;
      clampPos();
      applyPos();
      range.value = zoom;
    };

    img.addEventListener('load', () => {
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      // Cover: scale so both dimensions ≥ VP_SIZE
      baseScale = Math.max(VP_SIZE / natW, VP_SIZE / natH);
      rendW     = natW * baseScale;
      rendH     = natH * baseScale;
      imgLeft   = (VP_SIZE - rendW) / 2;
      imgTop    = (VP_SIZE - rendH) / 2;
      zoom      = 1;
      clampPos();
      applyPos();
      ready = true;
    });

    // ── Drag to pan ─────────────────────────────────────────────
    let dragging = false;
    let lastX = 0, lastY = 0;

    vpEl.addEventListener('mousedown', (e) => {
      if (!ready) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      vpEl.style.cursor = 'grabbing';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      imgLeft += e.clientX - lastX;
      imgTop  += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      clampPos();
      applyPos();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      vpEl.style.cursor = 'grab';
    });

    // Touch
    vpEl.addEventListener('touchstart', (e) => {
      if (!ready || e.touches.length !== 1) return;
      dragging = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      if (!dragging || e.touches.length !== 1) return;
      imgLeft += e.touches[0].clientX - lastX;
      imgTop  += e.touches[0].clientY - lastY;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      clampPos();
      applyPos();
    }, { passive: true });
    window.addEventListener('touchend', () => { dragging = false; });

    // ── Mouse wheel zoom ─────────────────────────────────────────
    vpEl.addEventListener('wheel', (e) => {
      if (!ready) return;
      e.preventDefault();
      const vpRect = vpEl.getBoundingClientRect();
      const pivotX = e.clientX - vpRect.left;
      const pivotY = e.clientY - vpRect.top;
      setZoom(zoom - e.deltaY * 0.002, pivotX, pivotY);
    }, { passive: false });

    // ── Zoom buttons + range ─────────────────────────────────────
    overlay.querySelectorAll('.fp-crop-zoom-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setZoom(zoom + parseFloat(btn.dataset.dir) * 0.2);
      });
    });
    range.addEventListener('input', () => setZoom(parseFloat(range.value)));

    // ── Close / cancel ───────────────────────────────────────────
    const close = () => {
      URL.revokeObjectURL(objUrl);
      // remove event listeners attached to window
      dragging = false;
      overlay.remove();
    };
    overlay.querySelector('.fp-crop-close').addEventListener('click', close);
    overlay.querySelector('.fp-crop-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // ── Confirm: canvas crop → upload ────────────────────────────
    overlay.querySelector('.fp-crop-confirm').addEventListener('click', async () => {
      if (!ready) return;

      const canvas = document.createElement('canvas');
      canvas.width  = CANVAS_OUT;
      canvas.height = CANVAS_OUT;
      const ctx = canvas.getContext('2d');

      // Source rect in natural image pixels:
      // imgLeft/imgTop = position of img top-left in viewport coords
      // viewport starts at (0, 0), size VP_SIZE × VP_SIZE
      // rendered image dimensions: rendW*zoom × rendH*zoom
      // offset of viewport inside rendered image: (0 - imgLeft) × (0 - imgTop)
      // in natural pixels: divide by (baseScale * zoom)
      const totalScale = baseScale * zoom;
      const srcX = -imgLeft / totalScale;
      const srcY = -imgTop  / totalScale;
      const srcW = VP_SIZE  / totalScale;
      const srcH = VP_SIZE  / totalScale;

      // Draw circular crop (clip to circle for preview, but upload square — CSS handles circle)
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, CANVAS_OUT, CANVAS_OUT);

      close();

      canvas.toBlob(async (blob) => {
        if (!blob) { showToast('Erro ao processar imagem.', 'error'); return; }
        const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
        await this._upload(croppedFile);
      }, 'image/jpeg', 0.92);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Upload to Supabase Storage
  // ─────────────────────────────────────────────────────────────

  async _upload(file) {
    const user = await getCurrentUser();
    if (!user) { showToast('Sessão expirada. Faça login novamente.', 'error'); return; }

    const ext  = file.name.split('.').pop() || 'jpg';
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
  // Public API
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
    if (!this._url) this._refresh();
  }
}
