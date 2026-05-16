// =============================================================
// FinFlow — Tab strip compartilhada entre orcamento.html e
// compromissos.html. Une as duas páginas sob a nova
// "Orçamento" com 4 abas: Configurações / Mensal / 12 meses /
// Meses passados.
// =============================================================

const TABS = [
  { id: 'configuracoes', label: 'Configurações', href: '/compromissos.html' },
  { id: 'mensal',        label: 'Mensal',        href: '/orcamento.html?tab=mensal' },
  { id: '12meses',       label: '12 meses',      href: '/orcamento.html?tab=12meses' },
  { id: 'passados',      label: 'Meses passados',href: '/orcamento.html?tab=passados' },
];

/**
 * Renderiza tab strip dentro de #orc-tabs (ou outro id) e marca
 * a aba ativa. `activeTab` ∈ TABS[].id.
 */
export function mountOrcamentoTabs(containerId, activeTab) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <nav class="orc-tab-strip" role="tablist" aria-label="Abas do Orçamento">
      ${TABS.map((t) => `
        <a href="${t.href}"
           class="orc-tab${t.id === activeTab ? ' active' : ''}"
           role="tab"
           aria-selected="${t.id === activeTab ? 'true' : 'false'}">
          ${t.label}
        </a>
      `).join('')}
    </nav>
  `;
}

/** Devolve o tab atual a partir de ?tab=… (default 'mensal'). */
export function getActiveTabFromUrl() {
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab') || 'mensal';
  const valid = TABS.map((t) => t.id);
  return valid.includes(tab) ? tab : 'mensal';
}
