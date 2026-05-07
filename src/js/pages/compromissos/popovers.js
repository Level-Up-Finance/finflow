// =============================================================
// FinFlow — Compromissos: popovers compartilhados
// =============================================================
// vinculo-popover: hover popup que mostra dados de dívida/projeto
// showInfoPopup: dialog modal "Entendi" pra avisos
// =============================================================
import { escapeHtml } from '../../lib/utils.js';
import { formatCurrency } from '../../lib/compromissos-config.js';

/**
 * Mostra popover ancorado num badge .data-vinculo-* element.
 * `lookups` deve fornecer: { getProjeto, getDivida }
 */
export function showVinculoPopover(badge, lookups) {
  const pop = document.getElementById('vinculo-popover');
  if (!pop) return;
  const html = buildVinculoPopoverContent(
    badge.dataset.vinculoType,
    badge.dataset.vinculoId,
    lookups
  );
  if (!html) return;

  pop.innerHTML = html;
  pop.classList.remove('hidden');

  const rect = badge.getBoundingClientRect();
  pop.style.top  = `${rect.bottom + 8 + window.scrollY}px`;
  pop.style.left = `${rect.left   + window.scrollX}px`;

  const pr = pop.getBoundingClientRect();
  if (pr.right > window.innerWidth - 12) {
    pop.style.left = `${rect.right - pr.width + window.scrollX}px`;
  }
}

export function hideVinculoPopover() {
  document.getElementById('vinculo-popover')?.classList.add('hidden');
}

function buildVinculoPopoverContent(type, id, lookups) {
  const { getProjeto, getDivida } = lookups;

  if (type === 'projeto') {
    const p = getProjeto(id);
    if (!p) return null;
    const meta = Number(p.meta_valor) || 0;
    return `
      <div class="vp-header">
        <span class="vp-type-label vp-type-projeto">Investimento</span>
        <strong class="vp-title">${escapeHtml(p.nome)}</strong>
      </div>
      <div class="vp-body">
        ${meta ? `<div class="vp-row"><span>Meta</span><strong>${formatCurrency(meta)}</strong></div>` : ''}
        ${p.saldo_inicial ? `<div class="vp-row"><span>Saldo inicial</span><strong>${formatCurrency(Number(p.saldo_inicial))}</strong></div>` : ''}
      </div>
      <a class="vp-link" href="/investimentos.html">Ver investimentos →</a>`;
  }

  if (type === 'divida') {
    const d = getDivida(id);
    const total    = d ? Number(d.valor_total) : 0;
    const pago     = d ? Number(d.valor_pago)  : 0;
    const restante = Math.max(0, total - pago);
    const pct      = total > 0 ? Math.min(100, (pago / total) * 100) : 0;
    const stCors   = { Ativa: 'var(--color-primary)', Atrasada: 'var(--color-danger)', Negociando: 'var(--color-warning)', Quitada: 'var(--color-success)' };
    const stCor    = stCors[d?.status] || 'var(--color-primary)';
    return `
      <div class="vp-header">
        <span class="vp-type-label vp-type-divida">Dívida</span>
        <strong class="vp-title">${d ? escapeHtml(d.nome) : '—'}</strong>
      </div>
      <div class="vp-body">
        ${d?.credor  ? `<div class="vp-row"><span>Credor</span><strong>${escapeHtml(d.credor)}</strong></div>` : ''}
        ${d?.status  ? `<div class="vp-row"><span>Status</span><strong style="color:${stCor}">${d.status}</strong></div>` : ''}
        ${total      ? `<div class="vp-row"><span>Total</span><strong>${formatCurrency(total)}</strong></div>` : ''}
        ${d          ? `<div class="vp-row"><span>Pago</span><strong style="color:var(--color-success)">${formatCurrency(pago)} (${pct.toFixed(0)}%)</strong></div>` : ''}
        ${d          ? `<div class="vp-row"><span>Restante</span><strong style="color:var(--color-danger)">${formatCurrency(restante)}</strong></div>` : ''}
      </div>
      <a class="vp-link" href="/dividas.html">Ver dívidas →</a>`;
  }

  return null;
}

/**
 * Popup informativo simples — fecha só com botão "Entendi".
 * Útil pra avisos modais sem confirm/cancel.
 */
export function showInfoPopup(title, message) {
  let dialog = document.getElementById('subcategoria-info-dialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'subcategoria-info-dialog';
    dialog.className = 'modal-backdrop';
    dialog.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-header">
          <h2 class="modal-title" id="info-dialog-title"></h2>
        </div>
        <div class="modal-body">
          <p id="info-dialog-msg" style="color: var(--color-text-secondary);"></p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" id="btn-info-dialog-ok">Entendi</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.querySelector('#btn-info-dialog-ok').addEventListener('click', () => {
      dialog.classList.add('hidden');
    });
  }
  dialog.querySelector('#info-dialog-title').textContent = title;
  dialog.querySelector('#info-dialog-msg').textContent = message;
  dialog.classList.remove('hidden');
}
