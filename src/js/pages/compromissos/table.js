// =============================================================
// FinFlow — Compromissos: render da tabela plana (flat)
// =============================================================
// Recebe rows pré-processados (de buildUnifiedRows) e dependências
// via params. Funções puras de rendering — não tocam em estado.
//
// `deps` deve fornecer:
//   { displayName, getDisplayValor, getProjeto, getDivida, getConta,
//     isRowConfigured }
// =============================================================
import { escapeHtml, formatDateBR, getInitials } from '../../lib/utils.js';
import {
  tipoIcon,
  tipoColor,
  tipoPill,
  formatCurrency,
  diaSemanaLabel,
} from '../../lib/compromissos-config.js';
import { findBank, logoUrl } from '../../lib/banks.js';

/** Converte 'YYYY-MM-DD' em 'mar/26' — também usado fora do table. */
export function monthLabelFromIso(iso) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}

export function renderFlatTable(rows, deps) {
  if (rows.length === 0) {
    return '<div class="empty-state"><p class="empty-state-message">Nenhum item com os filtros selecionados.</p></div>';
  }
  return `
    <div class="contas-table-wrapper">
      <table class="contas-table compromissos-grouped-table">
        <thead>
          <tr>
            <th>Compromisso</th>
            <th>Categoria</th>
            <th data-col="subcategoria">Subcategoria</th>
            <th data-col="tipo">Tipo</th>
            <th data-col="projeto">Vínculo</th>
            <th data-col="conta">Banco/Cartão</th>
            <th data-col="pagamento">Pagamento</th>
            <th data-col="vencimento">Vencimento</th>
            <th data-col="proximo">Próximo</th>
            <th data-col="termina">Termina em</th>
            <th data-col="periodo">Período</th>
            <th data-col="valor" class="text-right">Valor</th>
            <th data-col="descricao">Descrição</th>
            <th data-col="status">Status</th>
          </tr>
        </thead>
        <tbody>${rows.map((row) => renderUnifiedRow(row, deps)).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderUnifiedRow(row, deps) {
  const { displayName, getDisplayValor, getProjeto, getDivida, getConta, isRowConfigured } = deps;

  const isSub      = row._type === 'sub';
  const cat        = row._catObj;
  const catColor   = cat?.cor || '#9CA3AF';
  const configured = isRowConfigured(row);
  const isInactive = configured && row.status && row.status !== 'ativa';
  const statusLabel = { ativa: 'Ativa', inativa: 'Inativa', arquivada: 'Arquivada' }[row.status] || '—';

  const compDisplay = isSub ? displayName(row) : row.nome;
  const officialDiff = isSub && row.apelido?.trim() && row.apelido !== row.nome;

  const catCell = cat
    ? `<span style="display:inline-flex;align-items:center;gap:4px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${catColor};flex-shrink:0;"></span>
        ${escapeHtml(cat.nome)}
       </span>`
    : '<span class="text-muted">—</span>';

  const subCell = isSub
    ? `<span>${escapeHtml(displayName(row))}</span>`
    : '<span class="text-muted">—</span>';

  let vinculoCell;
  if (isSub && row.projeto_id) {
    const proj = getProjeto(row.projeto_id);
    vinculoCell = `<span class="vinculo-badge vinculo-badge--projeto" data-vinculo-type="projeto" data-vinculo-id="${row.projeto_id}" style="--vinculo-cor:${proj?.cor};">${escapeHtml(proj?.nome ?? '—')}</span>`;
  } else if (row.divida_id) {
    const div = getDivida(row.divida_id);
    vinculoCell = `<span class="vinculo-badge vinculo-badge--divida" data-vinculo-type="divida" data-vinculo-id="${row.divida_id}">${escapeHtml(div?.nome ?? '—')}</span>`;
  } else {
    vinculoCell = '<span class="text-muted">—</span>';
  }

  const dataAttr = isSub ? `data-id="${row.id}"` : `data-cat-id="${cat?.id}"`;

  const conta = getConta(row.conta_id);
  const contaCellHtml = configured && isSub
    ? renderContaTransferCell(row, conta, getConta)
    : (conta ? `<span class="conta-badge">${escapeHtml(conta.apelido?.trim() || conta.nome)}</span>` : '<span class="text-muted">—</span>');

  const valorCellHtml = configured
    ? (isSub
        ? renderValorCell(row, null, getDisplayValor)
        : (row.valor_variavel
            ? renderValorCell(row, 'cat_' + row.id, getDisplayValor)
            : formatCurrency(row.valor_base, row.moeda || 'BRL')))
    : '<span class="text-muted">—</span>';

  return `
    <tr class="compromisso-row ${isInactive ? 'inactive' : ''} ${row.status === 'arquivada' ? 'arquivada' : ''} ${!configured ? 'row-unconfigured' : ''}"
        style="--cat-color: ${catColor};" ${dataAttr}>
      <td>
        <div class="conta-row-name">
          ${configured ? renderTipoIcon(row.tipo, 'sm') : '<span style="width:20px;flex-shrink:0;"></span>'}
          <div class="conta-row-name-text">
            <span class="conta-row-name-display">${escapeHtml(compDisplay)}</span>
            ${officialDiff ? `<span class="conta-row-name-official">${escapeHtml(row.nome)}</span>` : ''}
          </div>
          ${isSub && row.is_parcial ? '<span class="parcial-indicator" title="Criado de pagamento parcial">½ rest.</span>' : ''}
        </div>
      </td>
      <td>${catCell}</td>
      <td data-col="subcategoria">${subCell}</td>
      <td data-col="tipo">${configured ? tipoPill(row.tipo || '—') : '<span class="text-muted">—</span>'}</td>
      <td data-col="projeto">${vinculoCell}</td>
      <td data-col="conta">${contaCellHtml}</td>
      <td data-col="pagamento">${row.tipo_pagamento || '<span class="text-muted">—</span>'}</td>
      <td data-col="vencimento" class="tabular">${configured ? renderVencCell(row) : '<span class="text-muted">—</span>'}</td>
      <td data-col="proximo">${configured && isSub ? renderNextDueCell(row) : '<span class="text-muted">—</span>'}</td>
      <td data-col="termina" class="tabular">${renderTerminaEmCell(row)}</td>
      <td data-col="periodo">${row.periodo || '<span class="text-muted">—</span>'}</td>
      <td data-col="valor" class="text-right tabular text-bold">${valorCellHtml}</td>
      <td data-col="descricao">${renderDescricaoCell(row)}</td>
      <td data-col="status">${configured ? `<span class="status-pill status-${row.status || 'ativa'}">${statusLabel}</span>` : '<span class="text-muted">—</span>'}</td>
    </tr>
  `;
}

function renderVencCell(c) {
  if (c.periodo === 'Semanal' || c.periodo === 'Quinzenal') {
    if (c.dia_semana == null) return '—';
    const label = diaSemanaLabel(c.dia_semana);
    if (c.periodo === 'Semanal') {
      const n = Number(c.intervalo_semanas) || 1;
      return n > 1 ? `${label} / ${n}sem` : label;
    }
    return label;
  }
  return c.vencimento_dia ? `Dia ${c.vencimento_dia}` : '—';
}

function renderTerminaEmCell(c) {
  if (!c.terminado_em) return '<span class="text-muted">Em curso</span>';
  return `<span>${formatDateBR(c.terminado_em)}</span>`;
}

function renderDescricaoCell(c) {
  const desc = (c.descricao || '').trim();
  if (!desc) return '<span class="text-muted">—</span>';
  const preview = desc.length > 32 ? desc.slice(0, 32) + '…' : desc;
  return `
    <span class="descricao-cell" tabindex="0">
      <span class="descricao-preview">${escapeHtml(preview)}</span>
      <span class="descricao-popover" role="tooltip">${escapeHtml(desc)}</span>
    </span>
  `;
}

function renderValorCell(c, proxKey, getDisplayValor) {
  const dv = getDisplayValor(c, proxKey);
  const valorStr = formatCurrency(dv.valor, dv.moeda);
  if (dv.isVariavel) {
    const tag = dv.mesAno
      ? `<span class="valor-variavel-tag" title="Próximo: ${monthLabelFromIso(dv.mesAno)}">varia</span>`
      : `<span class="valor-variavel-tag" title="Sem valor cadastrado pra próximos meses">varia</span>`;
    return `<span style="display:inline-flex; align-items:center; gap:6px; justify-content:flex-end;">${valorStr}${tag}</span>`;
  }
  return valorStr;
}

function renderTipoIcon(tipo, size = 'lg') {
  const color = tipoColor(tipo);
  const icon = tipoIcon(tipo);
  const dim = size === 'sm' ? 28 : 48;
  const iconDim = size === 'sm' ? 14 : 24;
  return `
    <div style="width: ${dim}px; height: ${dim}px; border-radius: var(--radius-full); background: ${color}1A; color: ${color}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
      <div style="width: ${iconDim}px; height: ${iconDim}px;">${icon}</div>
    </div>
  `;
}

function renderContaInline(conta) {
  const display = conta.apelido?.trim() || conta.nome;
  const bank = findBank(conta.nome);
  const fallbackColor = conta.icone_cor || '#6B7280';
  const initialsValue = getInitials(display);

  if (bank) {
    return `<span style="display:inline-flex;align-items:center;gap:6px;">
      <img src="${logoUrl(bank.domain)}" alt="${escapeHtml(conta.nome)}" style="width:18px;height:18px;border-radius:50%;background:#fff;border:1px solid var(--color-border);object-fit:contain;padding:1px;flex-shrink:0;" data-fallback-color="${fallbackColor}" onerror="this.outerHTML='<span style=&quot;width:18px;height:18px;border-radius:50%;background:${fallbackColor};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;flex-shrink:0;&quot;>${escapeHtml(initialsValue)}</span>'">
      <span>${escapeHtml(display)}</span>
    </span>`;
  }
  return `<span style="display:inline-flex;align-items:center;gap:6px;">
    <span style="width:18px;height:18px;border-radius:50%;background:${fallbackColor};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;flex-shrink:0;">${escapeHtml(initialsValue)}</span>
    <span>${escapeHtml(display)}</span>
  </span>`;
}

function renderContaTransferCell(c, contaOrigem, getConta) {
  if (c.tipo === 'Transferência' && c.conta_destino_id) {
    const destino = getConta(c.conta_destino_id);
    const oriHtml  = contaOrigem ? renderContaInline(contaOrigem) : '<span class="text-muted">—</span>';
    const destHtml = destino     ? renderContaInline(destino)      : '<span class="text-muted">—</span>';
    return `<span style="display:inline-flex;flex-direction:column;gap:2px;font-size:var(--fs-xs);">
      <span style="display:inline-flex;align-items:center;gap:4px;"><span style="color:var(--color-text-muted);font-size:10px;">De</span>${oriHtml}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;"><span style="color:var(--color-text-muted);font-size:10px;">→</span>${destHtml}</span>
    </span>`;
  }
  return contaOrigem ? renderContaInline(contaOrigem) : '<span class="text-muted">—</span>';
}

// -----------------------------
// Próximo vencimento — cálculo + render
// -----------------------------
export function calcNextDueDate(c, today = new Date()) {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);

  if (c.terminado_em) {
    const term = new Date(c.terminado_em + 'T00:00:00');
    if (term < t) return null;
  }

  const start = c.iniciado_em ? new Date(c.iniciado_em + 'T00:00:00') : null;

  if (c.periodo === 'Único') {
    if (!start) return null;
    return start >= t ? start : null;
  }

  if (c.periodo === 'Anual') {
    const dia = c.vencimento_dia;
    if (!dia) return null;
    const refMonth = start ? start.getMonth() : t.getMonth();
    let next = new Date(t.getFullYear(), refMonth, dia);
    if (next < t) next = new Date(t.getFullYear() + 1, refMonth, dia);
    return next;
  }

  if (c.periodo === 'Mensal') {
    const dia = c.vencimento_dia;
    if (!dia) return null;
    let next = new Date(t.getFullYear(), t.getMonth(), dia);
    if (next < t) next = new Date(t.getFullYear(), t.getMonth() + 1, dia);
    return next;
  }

  if (c.periodo === 'Semanal') {
    if (c.dia_semana === null || c.dia_semana === undefined) return null;
    const todayDow = t.getDay();
    const daysUntil = (c.dia_semana - todayDow + 7) % 7;
    const next = new Date(t);
    next.setDate(t.getDate() + daysUntil);
    return next;
  }

  if (c.periodo === 'Quinzenal') {
    if (c.dia_semana === null || c.dia_semana === undefined || !start) return null;
    const todayDow = t.getDay();
    const daysUntil = (c.dia_semana - todayDow + 7) % 7;
    const candidate = new Date(t);
    candidate.setDate(t.getDate() + daysUntil);

    const diff = Math.round((candidate - start) / (24 * 60 * 60 * 1000));
    if (diff >= 0 && diff % 14 !== 0) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate;
  }

  return null;
}

export function daysFromToday(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / (24 * 60 * 60 * 1000));
}

function renderNextDueCell(c) {
  const next = calcNextDueDate(c);
  if (!next) return '<span class="text-muted">—</span>';

  const days = daysFromToday(next);
  const dateStr = formatDateBR(next.toISOString().slice(0, 10));

  let badgeStyle;
  let label;

  if (days < 0) {
    badgeStyle = 'background: var(--color-danger-bg); color: #991B1B;';
    label = `${Math.abs(days)} d atrasado`;
  } else if (days === 0) {
    badgeStyle = 'background: #FED7AA; color: #9A3412;';
    label = 'Hoje';
  } else if (days <= 3) {
    badgeStyle = 'background: var(--color-warning-bg); color: #92400E;';
    label = `em ${days} d`;
  } else if (days <= 7) {
    badgeStyle = 'background: var(--color-info-bg); color: #1E40AF;';
    label = `em ${days} d`;
  } else {
    badgeStyle = 'background: var(--color-surface-alt); color: var(--color-text-secondary);';
    label = `em ${days} d`;
  }

  return `
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <span class="tabular" style="font-size: var(--fs-xs);">${dateStr}</span>
      <span style="display: inline-flex; padding: 2px 6px; border-radius: var(--radius-full); font-size: 10px; font-weight: var(--fw-semibold); width: fit-content; ${badgeStyle}">${label}</span>
    </div>
  `;
}

/**
 * Liga clicks nas linhas da tabela.
 * `handlers` deve fornecer: { onSubRowClick(id), onCatRowClick(catId) }
 */
export function bindRowClicks(handlers) {
  document.querySelectorAll('.contas-table tbody tr[data-id], .contas-table tbody tr[data-cat-id]')
    .forEach((row) => {
      row.addEventListener('click', () => {
        if (row.dataset.catId) handlers.onCatRowClick(row.dataset.catId);
        else                   handlers.onSubRowClick(row.dataset.id);
      });
    });
}
