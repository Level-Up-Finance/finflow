// =============================================================
// FinFlow — Modal de busca de empresa via Google Places
// =============================================================
// Uso:
//   import { openPlacesSearchModal } from './places-search-modal.js';
//   const result = await openPlacesSearchModal({ initialQuery: 'Apple' });
//   if (result) { // result tem { displayName, formattedAddress, addressComponents,
//                  //              nationalPhoneNumber, websiteUri, ... }
//     applyToForm(result);
//   }
// =============================================================
import { searchPlaces, getPlaceDetails, isConfigured } from '../lib/google-places.js';
import { escapeHtml } from '../lib/utils.js';

let openInstance = null;

export async function openPlacesSearchModal({ initialQuery = '' } = {}) {
  // Se outra instância aberta, fecha (sem resolver)
  if (openInstance) openInstance.close(null);

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Buscar empresa no Google');

    backdrop.innerHTML = `
      <div class="modal modal-md places-modal">
        <div class="modal-header">
          <h3 class="modal-title">Buscar empresa no Google</h3>
          <button type="button" class="modal-close" data-cancel aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          ${!isConfigured() ? `
            <div class="places-config-warning">
              <strong>⚠ Busca não configurada</strong>
              <p>A variável <code>VITE_GOOGLE_PLACES_KEY</code> não está definida. Configure no <code>.env.local</code> e nas variáveis do Vercel.</p>
            </div>
          ` : ''}
          <div class="field" style="margin-bottom: var(--space-3);">
            <label class="field-label" for="places-query">Nome da empresa, opcionalmente com cidade</label>
            <input type="text" id="places-query" class="input" placeholder="Ex: Neoenergia Recife" value="${escapeHtml(initialQuery)}" autofocus>
            <p class="field-hint">Digite ao menos 2 caracteres. Quanto mais específico, melhor.</p>
          </div>
          <div id="places-results" class="places-results"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const input    = backdrop.querySelector('#places-query');
    const resultsEl = backdrop.querySelector('#places-results');

    let debounceTimer = null;
    let lastQuery = '';
    let inflightController = null;

    function close(value) {
      if (inflightController) inflightController.abort();
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      openInstance = null;
      resolve(value);
    }
    openInstance = { close };

    function onKey(e) {
      if (e.key === 'Escape') close(null);
    }
    document.addEventListener('keydown', onKey);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-cancel]')) close(null);
    });

    async function runSearch() {
      const q = input.value.trim();
      if (q.length < 2) {
        resultsEl.innerHTML = '<p class="places-empty">Digite ao menos 2 caracteres…</p>';
        return;
      }
      if (q === lastQuery) return;
      lastQuery = q;

      resultsEl.innerHTML = `
        <div class="places-skeleton-row"></div>
        <div class="places-skeleton-row"></div>
        <div class="places-skeleton-row"></div>
      `;

      try {
        if (inflightController) inflightController.abort();
        inflightController = new AbortController();
        const places = await searchPlaces(q);
        if (places.length === 0) {
          resultsEl.innerHTML = '<p class="places-empty">Nenhum resultado encontrado. Tente refinar a busca.</p>';
          return;
        }
        resultsEl.innerHTML = places.map((p) => `
          <button type="button" class="places-result-item" data-place-id="${escapeHtml(p.id)}">
            <span class="places-result-name">${escapeHtml(p.displayName?.text || '—')}</span>
            <span class="places-result-address">${escapeHtml(p.formattedAddress || '')}</span>
          </button>
        `).join('');
      } catch (err) {
        if (err.name === 'AbortError') return;
        resultsEl.innerHTML = `<p class="places-error">Erro ao buscar: ${escapeHtml(err.message)}</p>`;
      }
    }

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runSearch, 350);
    });

    resultsEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-place-id]');
      if (!btn) return;
      const placeId = btn.dataset.placeId;

      // Visual: marca seleção e mostra spinner
      resultsEl.querySelectorAll('.places-result-item').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      btn.disabled = true;

      try {
        const details = await getPlaceDetails(placeId);
        close(details);
      } catch (err) {
        btn.disabled = false;
        const errBox = document.createElement('p');
        errBox.className = 'places-error';
        errBox.textContent = 'Erro ao carregar detalhes: ' + err.message;
        resultsEl.prepend(errBox);
      }
    });

    // Auto-run se já tem query inicial
    if (initialQuery && initialQuery.trim().length >= 2) {
      runSearch();
    }
  });
}
