// =============================================================
// FinFlow — Tab strip compartilhada entre orcamento.html e
// compromissos.html. Une as duas páginas sob a nova
// "Orçamento" com 4 abas: Compromissos / Mensal / Anual /
// Histórico.
//
// Semântica: <nav> com <a> + `aria-current="page"` na ativa
// (NÃO usa role=tablist/tab — esse padrão é pra tab-control
// dentro da mesma página; nosso caso é navegação multi-página).
// =============================================================

const TABS = [
  { id: 'configuracoes', label: 'Compromissos', href: '/compromissos.html' },
  { id: 'mensal',        label: 'Mensal',       href: '/orcamento.html?tab=mensal' },
  { id: '12meses',       label: 'Anual',        href: '/orcamento.html?tab=12meses' },
  { id: 'passados',      label: 'Histórico',    href: '/orcamento.html?tab=passados' },
];

/**
 * Renderiza tab strip dentro de #orc-tabs (ou outro id) e marca
 * a aba ativa. `activeTab` ∈ TABS[].id.
 */
export function mountOrcamentoTabs(containerId, activeTab) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <nav class="orc-tab-strip" aria-label="Abas do Orçamento">
      ${TABS.map((t) => `
        <a href="${t.href}"
           class="orc-tab${t.id === activeTab ? ' active' : ''}"
           ${t.id === activeTab ? 'aria-current="page"' : ''}>
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
