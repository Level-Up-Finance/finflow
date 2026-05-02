// =============================================================
// FinFlow — Currency Widget (compartilhado)
//
// Renderiza um widget com cotações ao vivo de USD/EUR/GBP em BRL.
// Auto-refresh a cada 5 minutos via Frankfurter API.
//
// Uso:
//   <div id="meu-widget"></div>
//   <script type="module">
//     import { initCurrencyWidget } from '/src/js/components/currency-widget.js';
//     initCurrencyWidget('meu-widget');
//   </script>
// =============================================================
import { fetchExchangeRate, startCurrencyAutoRefresh } from '../lib/currency.js';

const SUPPORTED = ['USD', 'EUR', 'GBP'];
const sharedRates = new Map();
let lastFetch = null;
let autoRefreshHandle = null;

export async function initCurrencyWidget(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.classList.add('currency-widget');
  // Render placeholder enquanto busca
  renderInto(container);

  await refreshRates();
  renderInto(container);

  // Auto-refresh a cada 5 min (compartilhado entre instâncias)
  if (autoRefreshHandle) clearInterval(autoRefreshHandle);
  autoRefreshHandle = startCurrencyAutoRefresh(async () => {
    await refreshRates();
    renderInto(container);
  });
}

async function refreshRates() {
  const results = await Promise.allSettled(
    SUPPORTED.map((c) => fetchExchangeRate(c, 'BRL').then((rate) => [c, rate]))
  );
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const [currency, rate] = r.value;
      sharedRates.set(currency, rate);
    } else {
      console.warn('[currency-widget] falhou:', r.reason);
    }
  }
  lastFetch = new Date();
}

function renderInto(container) {
  const items = SUPPORTED.map((c) => {
    const rate = sharedRates.get(c);
    if (!rate) {
      return `<span class="currency-rate" style="opacity: 0.5;">1 <strong>${c}</strong> = —</span>`;
    }
    const formatted = `R$ ${rate.toFixed(4).replace('.', ',')}`;
    return `<span class="currency-rate">1 <strong>${c}</strong> = ${formatted}</span>`;
  }).join(' ');

  const time = lastFetch
    ? lastFetch.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—';

  container.innerHTML = `
    <span class="currency-widget-label">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
        <line x1="3" x2="21" y1="22" y2="22"/>
        <line x1="6" x2="6" y1="18" y2="11"/>
        <line x1="10" x2="10" y1="18" y2="11"/>
        <line x1="14" x2="14" y1="18" y2="11"/>
        <line x1="18" x2="18" y1="18" y2="11"/>
        <polygon points="12 2 20 7 4 7"/>
      </svg>
      Cotações:
    </span>
    <span>${items}</span>
    <span class="currency-widget-time">atualizado às ${time}</span>
  `;
}
