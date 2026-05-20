// =============================================================
// FinFlow — Compromissos: bindings de eventos
// =============================================================
// Recebe um objeto `deps` com tudo que os handlers precisam:
// state getters/setters + funções de modal/save/toggle.
// Mantém todos os addEventListener em um lugar focado.
// =============================================================
import { escapeHtml } from '../../lib/utils.js';
import { closeModal } from '../../components/modal.js';
import {
  showVinculoPopover,
  hideVinculoPopover,
} from './popovers.js';

/**
 * deps esperado:
 *   {
 *     // state setters
 *     setFilterSearch, setViewMode, setFilterStatus, setFilterConfig,
 *     setFilterCategorias, setEditingCatId, setPendingAction,
 *     // state getters
 *     getFilterCategorias, getEditingId, getDetailsCompromisso,
 *     getPendingAction, getCachedCompromissos,
 *     // modal openers
 *     openCompromissoModal, openValorUpdateModal, openEncerrarModal,
 *     // save / status
 *     saveCompromisso, saveQuickValor, changeStatus, deleteCompromisso,
 *     confirmarEncerrar,
 *     // toggles / lookups (UI)
 *     setNivelMode, toggleDividaField, toggleProjetoField,
 *     toggleVencimentoFields, toggleValorVariavelFields,
 *     toggleRendaPrincipalRow, toggleTransferFields,
 *     updateLimiteInfo, getConta, getProjeto, getDivida,
 *     displayName, populateValoresMensaisGrid,
 *     criarProjeto, renderProjetoOptions,
 *     syncCategoriaFilterUI, renderCompromissos,
 *     showConfirm,
 *   }
 */
export function bindAllEvents(deps) {
  const d = deps;

  document.getElementById('btn-novo-compromisso').addEventListener('click', () => d.openCompromissoModal());
  document.querySelector('[data-trigger-novo]')?.addEventListener('click', () => d.openCompromissoModal());

  document.getElementById('search-compromissos').addEventListener('input', (e) => {
    d.setFilterSearch(e.target.value.toLowerCase().trim());
    d.renderCompromissos();
  });

  // View toggle (Tabela / DRE)
  document.getElementById('view-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    document.querySelectorAll('#view-toggle .view-toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    d.setViewMode(btn.dataset.view);
    d.renderCompromissos();
  });

  // Filtro: status
  document.getElementById('status-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.cf-status-tab');
    if (!btn) return;
    document.querySelectorAll('#status-filters .cf-status-tab').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    d.setFilterStatus(btn.dataset.status);
    d.renderCompromissos();
  });

  // Filtro: configurado / sem compromisso
  document.getElementById('config-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.cf-status-tab');
    if (!btn) return;
    document.querySelectorAll('#config-filters .cf-status-tab').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    d.setFilterConfig(btn.dataset.config);
    d.renderCompromissos();
  });

  // Filtro: categoria (multi)
  document.getElementById('categoria-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.cf-tipo-chip');
    if (!btn) return;
    const id = btn.dataset.categoria;
    let filterCategorias = d.getFilterCategorias();
    if (id === 'all') {
      filterCategorias = new Set(['all']);
    } else {
      filterCategorias.delete('all');
      if (filterCategorias.has(id)) filterCategorias.delete(id);
      else filterCategorias.add(id);
      if (filterCategorias.size === 0) filterCategorias = new Set(['all']);
    }
    d.setFilterCategorias(filterCategorias);
    d.syncCategoriaFilterUI();
    d.renderCompromissos();
  });

  // Nivel toggle (Nova subcategoria / Categoria existente)
  document.getElementById('nivel-segmented').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nivel]');
    if (!btn) return;
    d.setNivelMode(btn.dataset.nivel);
  });

  // Categoria existente → sync com comp-categoria e re-toggle campos
  document.getElementById('comp-cat-existente').addEventListener('change', (e) => {
    document.getElementById('comp-categoria').value = e.target.value;
    d.toggleDividaField();
    d.toggleProjetoField();
    d.toggleVinculoBanner();
    d.toggleVinculoInvestimentoField();
  });

  // Tipo selector
  document.getElementById('tipo-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('.tipo-btn');
    if (!btn) return;
    document.querySelectorAll('.tipo-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('comp-tipo').value = btn.dataset.tipo;
    d.toggleRendaPrincipalRow();
    d.toggleTransferFields();
  });

  // Conta origin → limit info + auto-set tipo_pagamento se cartão de crédito
  document.getElementById('comp-conta').addEventListener('change', (e) => {
    d.updateLimiteInfo(e.target.value);
    const conta = d.getConta(e.target.value);
    if (conta?.tipo === 'Cartão de Crédito') {
      document.getElementById('comp-tipo-pagamento').value = 'Crédito';
    }
  });

  // Período → mostra/esconde dia mês ou dia semana
  document.getElementById('comp-periodo').addEventListener('change', d.toggleVencimentoFields);

  // Categoria muda → mostra/esconde campos de projeto e dívida
  document.getElementById('comp-categoria').addEventListener('change', () => {
    d.toggleProjetoField();
    d.toggleDividaField();
    d.toggleVinculoBanner();
    d.toggleVinculoInvestimentoField();
  });

  // Select de projeto: "__new__" abre prompt pra criar inline
  document.getElementById('comp-projeto').addEventListener('change', async (e) => {
    if (e.target.value !== '__new__') {
      e.target.dataset.lastGood = e.target.value;
      return;
    }
    const prev = e.target.dataset.lastGood || '';
    e.target.value = '';
    const nome = window.prompt('Nome do novo projeto de investimento:');
    if (!nome || !nome.trim()) { e.target.value = prev; return; }
    const novo = await d.criarProjeto(nome.trim());
    if (novo) {
      d.renderProjetoOptions();
      e.target.value = novo.id;
    } else {
      e.target.value = prev;
    }
  });

  // Select de dívida: "__new__" mantém placeholder; criação real acontece no save
  document.getElementById('comp-divida')?.addEventListener('change', () => { /* no-op */ });

  // Checkbox "valor variável"
  document.getElementById('comp-valor-variavel').addEventListener('change', () => {
    d.toggleValorVariavelFields();
    if (document.getElementById('comp-valor-variavel').checked) {
      const editingId = d.getEditingId();
      const c = editingId ? d.getCachedCompromissos().find((x) => x.id === editingId) : null;
      d.populateValoresMensaisGrid(c);
    }
  });

  // Sincroniza moeda entre os 2 selects (modo fixo / modo variável)
  const moedaFixa = document.getElementById('comp-moeda');
  const moedaVar  = document.getElementById('comp-moeda-var');
  if (moedaFixa && moedaVar) {
    moedaFixa.addEventListener('change', () => { moedaVar.value = moedaFixa.value; });
    moedaVar.addEventListener('change', () => { moedaFixa.value = moedaVar.value; });
  }

  // Status segmented
  document.getElementById('status-segmented').addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    document.querySelectorAll('#status-segmented .segmented-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('comp-status').value = btn.dataset.status;
  });

  // Form submit
  document.getElementById('form-compromisso').addEventListener('submit', d.saveCompromisso);

  // Close modals
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.closeModal === 'modal-compromisso') {
        d.setEditingCatId(null);
      }
      closeModal(btn.dataset.closeModal);
    });
  });

  // Details modal buttons
  document.getElementById('btn-editar').addEventListener('click', () => {
    const c = d.getDetailsCompromisso();
    if (!c) return;
    closeModal('modal-details');
    d.openCompromissoModal(c);
  });

  // "Ir para Dívida/Projeto" — navega para a página fonte de verdade
  document.getElementById('btn-ir-vinculo').addEventListener('click', () => {
    const c = d.getDetailsCompromisso();
    if (!c) return;
    if (c.divida_id) {
      location.href = `dividas.html?divida_id=${encodeURIComponent(c.divida_id)}`;
    } else if (c.projeto_id) {
      location.href = `investimentos.html?projeto_id=${encodeURIComponent(c.projeto_id)}`;
    } else {
      // Compromisso em categoria dividas/investimentos sem vínculo direto
      const cats = d.getCachedCategorias ? d.getCachedCategorias() : [];
      const cat = cats.find((cc) => cc.id === c.categoria_id);
      if (cat?.grupo === 'dividas') {
        location.href = 'dividas.html';
      } else {
        location.href = 'investimentos.html';
      }
    }
  });

  // "Ir para Dívidas/Investimentos" (do banner do form de criação)
  document.getElementById('btn-comp-ir-pagina').addEventListener('click', () => {
    const destino = document.getElementById('btn-comp-ir-pagina').dataset.destino;
    location.href = destino === 'investimentos' ? 'investimentos.html' : 'dividas.html';
  });

  document.getElementById('btn-atualizar-valor').addEventListener('click', () => {
    const c = d.getDetailsCompromisso();
    if (!c) return;
    d.openValorUpdateModal(c);
  });

  document.getElementById('form-quick-valor').addEventListener('submit', d.saveQuickValor);

  document.getElementById('btn-arquivar').addEventListener('click', () => {
    const c = d.getDetailsCompromisso();
    if (!c) return;
    d.setPendingAction({ type: 'arquivar', id: c.id });
    d.showConfirm(
      'Arquivar compromisso?',
      `Arquivar <strong>${escapeHtml(d.displayName(c))}</strong>? Ele não vai mais aparecer nas listagens ativas.`,
      'Arquivar'
    );
  });

  document.getElementById('btn-deletar').addEventListener('click', () => {
    const c = d.getDetailsCompromisso();
    if (!c) return;
    d.setPendingAction({ type: 'delete', id: c.id });
    d.showConfirm(
      'Deletar permanentemente?',
      `Tem certeza que quer deletar <strong>${escapeHtml(d.displayName(c))}</strong> definitivamente? <br><br><strong style="color: var(--color-danger);">Esta ação não pode ser desfeita.</strong>`,
      'Deletar'
    );
  });

  document.getElementById('btn-encerrar').addEventListener('click', () => {
    const c = d.getDetailsCompromisso();
    if (!c) return;
    d.openEncerrarModal(c);
  });

  // Registrar adiantamento (só visível pra subs Receita)
  document.getElementById('btn-registrar-adiantamento')?.addEventListener('click', async () => {
    const c = d.getDetailsCompromisso();
    if (!c) return;
    const { openAdiantamentoModal } = await import('./adiantamento-modal.js');
    openAdiantamentoModal(c, d);
  });

  document.getElementById('btn-confirmar-encerrar').addEventListener('click', d.confirmarEncerrar);

  // Confirmar
  document.getElementById('btn-confirmar-acao').addEventListener('click', async () => {
    const action = d.getPendingAction();
    if (!action) return;
    const { type, id } = action;
    closeModal('modal-confirmar');
    if (type === 'arquivar') {
      await d.changeStatus(id, 'arquivada');
      closeModal('modal-details');
    } else if (type === 'delete') {
      await d.deleteCompromisso(id);
      closeModal('modal-details');
    }
    d.setPendingAction(null);
  });

  // Popover de vínculo — cria elemento uma vez no DOM
  const pop = document.createElement('div');
  pop.id = 'vinculo-popover';
  pop.className = 'vinculo-popover hidden';
  document.body.appendChild(pop);
  pop.addEventListener('mouseleave', hideVinculoPopover);

  // Delegação: mostra/oculta popover ao passar mouse em badges
  document.addEventListener('mouseover', (e) => {
    const badge = e.target.closest('.vinculo-badge');
    if (badge) showVinculoPopover(badge, { getProjeto: d.getProjeto, getDivida: d.getDivida });
  });
  document.addEventListener('mouseout', (e) => {
    const badge = e.target.closest('.vinculo-badge');
    if (!badge) return;
    if (!e.relatedTarget?.closest('#vinculo-popover') && !e.relatedTarget?.closest('.vinculo-badge')) {
      hideVinculoPopover();
    }
  });
}
