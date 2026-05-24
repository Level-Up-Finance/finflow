// =============================================================
// FinFlow — Helper de badge de atribuição (Multi-perfil Fase 2)
// =============================================================
// Renderiza um avatar circular mini com cor + inicial do membro do
// workspace que executou uma ação. Tooltip: "Maria criou · hoje".
//
// Uso:
//   import { renderAttribBadge } from '../lib/attribution-badge.js';
//   const html = renderAttribBadge({
//     profileId: row.created_by,
//     timestamp: row.created_at,
//     verb: 'criou',
//   });
//
// Retorna '' (string vazia) quando:
//   - workspace é solo (1 membro só) — não polui UI
//   - profileId é null/undefined
//   - membro não encontrado no cache (chegou de fora do workspace)
// =============================================================

import { getMember, isShared } from './workspace-members.js';
import { escapeHtml } from './utils.js';

/**
 * @param {object} opts
 * @param {string|null} opts.profileId  ID do member que executou a ação
 * @param {string|null} [opts.timestamp]  ISO timestamp pra tooltip relativo
 * @param {string} [opts.verb='criou']  Verbo: 'criou', 'marcou', 'editou', etc
 * @returns {string} HTML do badge, ou string vazia
 */
export function renderAttribBadge({ profileId, timestamp, verb = 'criou' }) {
  if (!isShared() || !profileId) return '';
  const m = getMember(profileId);
  if (!m) return '';
  const dateStr = timestamp ? formatRelativeDate(timestamp) : '';
  const tooltip = `${m.display} ${verb}${dateStr ? ' · ' + dateStr : ''}`;
  // .pag-attrib é a classe canônica — funciona pra qualquer linha (não só pagamentos)
  return `<span class="pag-attrib" title="${escapeHtml(tooltip)}" style="background:${escapeHtml(m.cor)}">${escapeHtml(m.initials)}</span>`;
}

/**
 * Formato relativo curto: "hoje", "ontem", "3d", "12/mai".
 */
export function formatRelativeDate(isoTs) {
  if (!isoTs) return '';
  const d = new Date(isoTs);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'hoje';
  if (diffDays === 1) return 'ontem';
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
