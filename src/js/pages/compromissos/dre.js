// =============================================================
// FinFlow — Compromissos: view DRE (extraído da página)
// =============================================================
// View pura: recebe a lista de compromissos filtrados e o conjunto
// de categorias para mostrar; devolve HTML como string.
//
// `deps` deve fornecer: { displayName, getDisplayValor, compareByVencimento, diaSemanaLabel }
// =============================================================
import { escapeHtml } from '../../lib/utils.js';
import { formatCurrencyHTML } from '../../lib/compromissos-config.js';

export function renderDre(filteredCompromissos, ctx, deps) {
  const { cachedCategorias, filterCategorias } = ctx;
  const { compareByVencimento, getDisplayValor } = deps;

  const showAllCategorias = filterCategorias.has('all');
  const categoriasToShow = showAllCategorias
    ? cachedCategorias
    : cachedCategorias.filter((c) => filterCategorias.has(c.id));

  // Agrupa compromissos por categoria_id
  const groupedByCategoria = new Map();
  categoriasToShow.forEach((cat) => groupedByCategoria.set(cat.id, []));
  const orphans = [];
  filteredCompromissos.forEach((c) => {
    if (groupedByCategoria.has(c.categoria_id)) {
      groupedByCategoria.get(c.categoria_id).push(c);
    } else if (showAllCategorias) {
      orphans.push(c);
    }
  });

  for (const arr of groupedByCategoria.values()) {
    arr.sort(compareByVencimento);
  }
  orphans.sort(compareByVencimento);

  let totalReceitas = 0;
  let totalDespesas = 0;
  filteredCompromissos.forEach((c) => {
    const v = getDisplayValor(c).valor;
    if (c.tipo === 'Receita') totalReceitas += v;
    else totalDespesas += v;
  });
  const resultado = totalReceitas - totalDespesas;

  const blocks = [];
  for (const cat of categoriasToShow) {
    const items = groupedByCategoria.get(cat.id) || [];
    blocks.push(renderDreBlock(cat, items, deps));
  }
  if (orphans.length > 0) {
    blocks.push(renderDreBlock(
      { id: null, nome: 'Sem categoria', cor: '#9CA3AF' },
      orphans,
      deps
    ));
  }

  if (blocks.length === 0) {
    return '<div class="empty-state"><p class="empty-state-message">Nenhuma categoria pra mostrar.</p></div>';
  }

  return `
    <div class="dre-view">
      ${blocks.join('')}
      ${renderDreSummary(totalReceitas, totalDespesas, resultado)}
    </div>
  `;
}

function renderDreBlock(cat, items, deps) {
  const { getDisplayValor } = deps;

  let categoriaTotal = 0;
  items.forEach((c) => {
    const v = getDisplayValor(c).valor;
    categoriaTotal += (c.tipo === 'Receita') ? v : -v;
  });

  const totalClass = categoriaTotal > 0 ? 'dre-positive' : (categoriaTotal < 0 ? 'dre-negative' : 'dre-zero');
  const totalDisplay = formatCurrencyHTML(categoriaTotal, 'BRL');

  const itemsHtml = items.length === 0
    ? '<div class="dre-empty">Sem compromissos nesta categoria</div>'
    : `<div class="dre-items">${items.map((c) => renderDreItem(c, deps)).join('')}</div>`;

  return `
    <div class="dre-categoria">
      <header class="dre-categoria-header">
        <span class="dre-categoria-color" style="background: ${cat.cor};"></span>
        <h3 class="dre-categoria-name">${escapeHtml(cat.nome)}</h3>
        <span class="dre-categoria-count">${items.length} ${items.length === 1 ? 'item' : 'itens'}</span>
      </header>
      ${itemsHtml}
      <footer class="dre-categoria-total">
        <span>Total ${escapeHtml(cat.nome)}</span>
        <span class="${totalClass}">${totalDisplay}</span>
      </footer>
    </div>
  `;
}

function renderDreItem(c, deps) {
  const { displayName, getDisplayValor, diaSemanaLabel } = deps;

  const dv = getDisplayValor(c);
  const sign = c.tipo === 'Receita' ? '+' : '-';
  const colorClass = c.tipo === 'Receita' ? 'dre-positive' : 'dre-negative';
  const valueDisplay = `${sign}${formatCurrencyHTML(dv.valor, dv.moeda)}${dv.isVariavel ? ' <span class="valor-variavel-tag">varia</span>' : ''}`;

  let venc = '';
  if (c.periodo === 'Semanal' || c.periodo === 'Quinzenal') {
    venc = (c.dia_semana !== null && c.dia_semana !== undefined) ? diaSemanaLabel(c.dia_semana) : '';
  } else if (c.vencimento_dia) {
    venc = `Dia ${c.vencimento_dia}`;
  }
  const meta = `${c.periodo}${venc ? ' · ' + venc : ''}`;

  const isInactive = c.status !== 'ativa';
  const inactiveClass = isInactive ? (c.status === 'arquivada' ? 'arquivada' : 'inactive') : '';

  return `
    <div class="dre-item ${inactiveClass}" data-id="${c.id}">
      <div>
        <div class="dre-item-name">${escapeHtml(displayName(c))}</div>
        <div class="dre-item-meta">${meta}${isInactive ? ` · ${c.status}` : ''}</div>
      </div>
      <span class="dre-item-value ${colorClass}">${valueDisplay}</span>
    </div>
  `;
}

function renderDreSummary(totalReceitas, totalDespesas, resultado) {
  const resultClass = resultado > 0 ? 'dre-positive' : (resultado < 0 ? 'dre-negative' : 'dre-zero');
  return `
    <div class="dre-result">
      <div class="dre-summary-row">
        <span>Total Receitas</span>
        <strong class="dre-positive">${formatCurrencyHTML(totalReceitas, 'BRL')}</strong>
      </div>
      <div class="dre-summary-row">
        <span>Total Despesas</span>
        <strong class="dre-negative">${formatCurrencyHTML(-totalDespesas, 'BRL')}</strong>
      </div>
      <div class="dre-summary-row dre-net">
        <span>Resultado Líquido</span>
        <span class="${resultClass}">${formatCurrencyHTML(resultado, 'BRL')}</span>
      </div>
    </div>
  `;
}
