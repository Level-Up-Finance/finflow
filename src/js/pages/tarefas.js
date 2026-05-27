// =============================================================
// FinFlow — Página /tarefas
// Vista única com 3 grupos colapsáveis empilhados:
//   1. MINHAS TAREFAS    (tabela — pendentes manuais)
//   2. LEMBRETES DO SISTEMA (list-rows agregadas — pendentes auto)
//   3. CONCLUÍDAS        (tabela — manuais + auto concluídas)
// Auto-geração de tarefas (import_extrato, reconciliacao_pendente)
// roda em background antes do primeiro render.
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { escapeHtml, showConfirm } from '../lib/utils.js';
import { requireWorkspaceId } from '../lib/workspace.js';
import { t } from '../lib/textos.js';
import {
  loadTarefasPendentes,
  gerarTarefasImportExtrato,
  gerarTarefasReconciliacaoPendente,
  concluirTarefa,
  dispensarTarefa,
  nuncaLembrarMais,
} from '../lib/tarefas.js';

let cachedPendentes = [];
let cachedConcluidas = [];
// Estado de expansão dos grupos do sistema (keyed por t.tipo)
let gruposExpandidos = new Set();
// Estado de colapso dos 3 grupos top-level: 'minhas' | 'sistema' | 'concluidas'
// Default: todos expandidos (set vazio = nada colapsado).
let gruposColapsados = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('tarefas');
  bindEvents();
  // Geração em background — antes de listar
  await Promise.all([
    gerarTarefasImportExtrato({ force: true }),
    gerarTarefasReconciliacaoPendente({ force: true }),
  ]);
  await loadAll();
  render();
});

function bindEvents() {
  document.getElementById('btn-nova-tarefa').addEventListener('click', () => openTarefaModal());

  // Fechar modal
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  // Salvar tarefa manual
  document.getElementById('form-tarefa').addEventListener('submit', salvarTarefa);

  // Ações dentro do modal de detalhes
  document.getElementById('modal-tarefa-detalhes').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-detail-action]');
    if (!btn) return;
    const action = btn.dataset.detailAction;
    const id = btn.dataset.id;
    if (!id) return;

    if (action === 'concluir') {
      await concluirTarefa(id);
      closeModal('modal-tarefa-detalhes');
      await loadAll();
      render();
      return;
    }
    if (action === 'edit') {
      const tarefa = cachedPendentes.find((x) => x.id === id) || cachedConcluidas.find((x) => x.id === id);
      closeModal('modal-tarefa-detalhes');
      if (tarefa) openTarefaModal(tarefa);
      return;
    }
    if (action === 'reabrir') {
      const ok = await showConfirm('Reabrir esta tarefa?', { okLabel: 'Reabrir', danger: false });
      if (!ok) return;
      closeModal('modal-tarefa-detalhes');
      await reabrirTarefa(id);
      return;
    }
    if (action === 'esconder') {
      closeModal('modal-tarefa-detalhes');
      await esconderTarefa(id);
      return;
    }
    if (action === 'delete') {
      const ok = await showConfirm('Excluir essa tarefa?', { okLabel: 'Excluir', danger: true });
      if (!ok) return;
      await supabase.from('tarefas_usuario').delete().eq('id', id).eq('workspace_id', requireWorkspaceId());
      closeModal('modal-tarefa-detalhes');
      await loadAll();
      render();
      return;
    }
  });

  // Delegation pra ações na lista
  document.getElementById('tarefas-page-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');

    // Se NÃO é um botão de ação, mas clicou numa row clicável → abre modal de detalhes
    if (!btn) {
      const row = e.target.closest('[data-row-open]');
      if (row) {
        openTarefaDetalhes(row.dataset.rowOpen);
      }
      return;
    }
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    // -----------------------------
    // Toggle de grupos top-level
    // -----------------------------
    if (action === 'toggle-top') {
      const key = btn.dataset.top;
      if (gruposColapsados.has(key)) gruposColapsados.delete(key);
      else gruposColapsados.add(key);
      render();
      return;
    }

    // -----------------------------
    // Ações de grupo (sistema)
    // -----------------------------
    if (action === 'expand-grupo') {
      e.stopPropagation();
      const tipo = btn.dataset.grupo;
      gruposExpandidos.add(tipo);
      render();
      return;
    }
    if (action === 'collapse-grupo') {
      e.stopPropagation();
      const tipo = btn.dataset.grupo;
      gruposExpandidos.delete(tipo);
      render();
      return;
    }
    if (action === 'snooze-grupo') {
      e.stopPropagation();
      const tipo = btn.dataset.grupo;
      const tarefasDoGrupo = cachedPendentes.filter((x) => x.criada_por === 'sistema' && x.tipo === tipo);
      await Promise.all(tarefasDoGrupo.map((x) => dispensarTarefa(x.id, 3)));
      await loadAll();
      render();
      showToast(t('tarefas.toast.snooze_3d', 'Lembrarei em 3 dias'), 'info', 4000);
      return;
    }
    if (action === 'dispensar-todos') {
      e.stopPropagation();
      const ok = await showConfirm('Dispensar todos os lembretes do sistema?', { okLabel: 'Dispensar', danger: true });
      if (!ok) return;
      const tarefasSistema = cachedPendentes.filter((x) => x.criada_por === 'sistema');
      await Promise.all(tarefasSistema.map((x) => nuncaLembrarMais(x.id, x.conta_id || null)));
      await loadAll();
      render();
      return;
    }
    if (action === 'primary') {
      // sub-row "Importar" — apenas navega
      const url = btn.dataset.url;
      if (url) window.location.href = url;
      return;
    }

    // -----------------------------
    // Ações individuais
    // -----------------------------
    if (action === 'concluir') {
      e.stopPropagation();
      await concluirTarefa(id);
      await loadAll();
      render();
      return;
    }
    if (action === 'snooze') {
      e.stopPropagation();
      await dispensarTarefa(id, 3);
      await loadAll();
      render();
      showToast(t('tarefas.toast.snooze_3d', 'Lembrarei em 3 dias'), 'info', 4000);
      return;
    }
    if (action === 'never') {
      e.stopPropagation();
      const contaId = btn.dataset.conta || null;
      await nuncaLembrarMais(id, contaId);
      await loadAll();
      render();
      return;
    }
    if (action === 'edit') {
      e.stopPropagation();
      const tarefa = cachedPendentes.find((x) => x.id === id) || cachedConcluidas.find((x) => x.id === id);
      if (tarefa) openTarefaModal(tarefa);
      return;
    }
    if (action === 'reabrir') {
      e.stopPropagation();
      const ok = await showConfirm('Reabrir esta tarefa?', { okLabel: 'Reabrir', danger: false });
      if (!ok) return;
      await reabrirTarefa(id);
      return;
    }
    if (action === 'esconder') {
      e.stopPropagation();
      await esconderTarefa(id);
      return;
    }
    if (action === 'delete') {
      e.stopPropagation();
      const ok = await showConfirm('Excluir essa tarefa?', { okLabel: 'Excluir', danger: true });
      if (!ok) return;
      // Defense in depth: filtra por workspace_id explícito
      await supabase.from('tarefas_usuario').delete().eq('id', id).eq('workspace_id', requireWorkspaceId());
      await loadAll();
      render();
      return;
    }
  });
}

async function loadAll() {
  cachedPendentes = await loadTarefasPendentes();
  const { data: concluidas } = await supabase
    .from('tarefas_usuario')
    .select('*')
    .eq('status', 'concluida')
    .order('completed_at', { ascending: false })
    .limit(50);
  cachedConcluidas = concluidas || [];
}

// =============================================================
// Render principal — 3 grupos empilhados, vista única
// =============================================================
function render() {
  const list = document.getElementById('tarefas-page-list');

  const minhas = cachedPendentes
    .filter((x) => x.criada_por !== 'sistema' && x.status !== 'concluida')
    .sort(sortMinhas);
  const sistema = cachedPendentes.filter((x) => x.criada_por === 'sistema' && x.status !== 'concluida');
  const concluidas = cachedConcluidas;

  const inner = [
    renderGrupoTopMinhas(minhas),
    sistema.length > 0 ? renderGrupoTopSistema(sistema) : '',
    renderGrupoTopConcluidas(concluidas),
  ].join('');

  list.innerHTML = `<div class="tarefas-page-list-inner">${inner}</div>`;
}

// =============================================================
// Header colapsável (chevron + título + count)
// =============================================================
function renderTopHeader(key, label, count) {
  const colapsado = gruposColapsados.has(key);
  const chevron = colapsado
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  return `
    <button type="button" class="tarefa-grupo-top-header" data-action="toggle-top" data-top="${key}" aria-expanded="${!colapsado}">
      <span class="tarefa-grupo-top-chevron">${chevron}</span>
      <span class="tarefa-grupo-top-label">${escapeHtml(label)} · ${count}</span>
    </button>
  `;
}

// =============================================================
// Grupo 1: MINHAS TAREFAS (tabela)
// =============================================================
function renderGrupoTopMinhas(minhas) {
  const colapsado = gruposColapsados.has('minhas');
  const body = colapsado ? '' : renderMinhasTarefasTabela(minhas);
  return `
    <section class="tarefa-grupo-top">
      ${renderTopHeader('minhas', 'MINHAS TAREFAS', minhas.length)}
      ${body}
    </section>
  `;
}

function renderMinhasTarefasTabela(tarefas) {
  if (tarefas.length === 0) {
    return `
      <div class="tarefas-table-empty">
        Nenhuma tarefa pendente. Use "Nova tarefa" pra criar.
      </div>
    `;
  }

  const rows = tarefas.map((t) => {
    const prio = t.prioridade || 'normal';
    const prazoIso = t.metadata?.prazo || null;
    const prazoHtml = renderPrazoCell(prazoIso);
    const desc = t.descricao ? clampText(t.descricao, 50) : '—';
    const descClass = t.descricao ? '' : 'tarefas-table-cell--empty';

    const badgePrio = prio === 'alta'
      ? '<span class="tarefa-prio-badge tarefa-prio-badge--alta">ALTA</span>'
      : prio === 'baixa'
        ? '<span class="tarefa-prio-badge tarefa-prio-badge--baixa">BAIXA</span>'
        : '<span class="tarefa-prio-badge tarefa-prio-badge--normal">NORMAL</span>';

    return `
      <div class="tarefas-table-row tarefas-table-row--clickable" data-id="${t.id}" data-row-open="${t.id}">
        <div class="tarefas-table-cell tarefas-table-cell--origem"><span class="tarefa-origem-badge tarefa-origem-badge--minha">MINHA</span></div>
        <div class="tarefas-table-cell tarefas-table-cell--title">${escapeHtml(t.titulo)}</div>
        <div class="tarefas-table-cell tarefas-table-cell--desc ${descClass}">${escapeHtml(desc)}</div>
        <div class="tarefas-table-cell tarefas-table-cell--prio">${badgePrio}</div>
        <div class="tarefas-table-cell tarefas-table-cell--prazo">${prazoHtml}</div>
        <div class="tarefas-table-cell tarefas-table-cell--actions">
          <button type="button" class="btn-icon tarefas-table-icon-btn tarefas-table-icon-btn--success" data-action="concluir" data-id="${t.id}" aria-label="Concluir tarefa" title="Concluir">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <button type="button" class="btn-icon tarefas-table-icon-btn tarefas-table-icon-btn--primary" data-action="edit" data-id="${t.id}" aria-label="Editar tarefa" title="Editar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          <button type="button" class="btn-icon tarefas-table-icon-btn tarefas-table-icon-btn--danger" data-action="delete" data-id="${t.id}" aria-label="Excluir tarefa" title="Excluir">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="tarefas-table">
      <div class="tarefas-table-head">
        <div class="tarefas-table-cell tarefas-table-cell--origem">ORIGEM</div>
        <div class="tarefas-table-cell tarefas-table-cell--title">TÍTULO</div>
        <div class="tarefas-table-cell tarefas-table-cell--desc">DESCRIÇÃO</div>
        <div class="tarefas-table-cell tarefas-table-cell--prio">PRIO</div>
        <div class="tarefas-table-cell tarefas-table-cell--prazo">PRAZO</div>
        <div class="tarefas-table-cell tarefas-table-cell--actions">AÇÕES</div>
      </div>
      ${rows}
    </div>
  `;
}

// =============================================================
// Grupo 2: LEMBRETES DO SISTEMA (list-rows agregadas — preserva design)
// =============================================================
function renderGrupoTopSistema(sistema) {
  const colapsado = gruposColapsados.has('sistema');
  let body = '';
  if (!colapsado) {
    // Agrupa sistema por t.tipo
    const gruposSistema = new Map();
    for (const t of sistema) {
      const tipo = t.tipo || 'outro';
      if (!gruposSistema.has(tipo)) gruposSistema.set(tipo, []);
      gruposSistema.get(tipo).push(t);
    }
    let inner = '';
    for (const [tipo, tarefas] of gruposSistema) {
      const expandido = gruposExpandidos.has(tipo);
      inner += expandido
        ? renderGrupoExpandido(tipo, tarefas)
        : renderGrupoRow(tipo, tarefas);
    }
    body = `
      <div class="tarefa-grupo-sistema-toolbar">
        <button type="button" class="tarefa-grupo-bulk" data-action="dispensar-todos">Dispensar todos</button>
      </div>
      ${inner}
    `;
  }
  return `
    <section class="tarefa-grupo-top">
      ${renderTopHeader('sistema', 'LEMBRETES DO SISTEMA', sistema.length)}
      ${body}
    </section>
  `;
}

// =============================================================
// Grupo 3: CONCLUÍDAS (tabela)
// =============================================================
function renderGrupoTopConcluidas(concluidas) {
  const colapsado = gruposColapsados.has('concluidas');
  const body = colapsado ? '' : renderConcluidasTabela(concluidas);
  return `
    <section class="tarefa-grupo-top">
      ${renderTopHeader('concluidas', 'CONCLUÍDAS', concluidas.length)}
      ${body}
    </section>
  `;
}

function renderConcluidasTabela(tarefas) {
  if (tarefas.length === 0) {
    return `
      <div class="tarefas-table-empty">
        Nenhuma tarefa concluída ainda.
      </div>
    `;
  }

  const rows = tarefas.map((t) => {
    const isSistema = t.criada_por === 'sistema';
    const origemBadge = isSistema
      ? '<span class="tarefa-origem-badge tarefa-origem-badge--auto">AUTO</span>'
      : '<span class="tarefa-origem-badge tarefa-origem-badge--minha">MINHA</span>';
    const desc = t.descricao ? clampText(t.descricao, 50) : '—';
    const descClass = t.descricao ? '' : 'tarefas-table-cell--empty';

    const prio = t.prioridade || 'normal';
    const badgePrio = isSistema
      ? '<span class="tarefas-table-cell--empty">—</span>'
      : prio === 'alta'
        ? '<span class="tarefa-prio-badge tarefa-prio-badge--alta">ALTA</span>'
        : prio === 'baixa'
          ? '<span class="tarefa-prio-badge tarefa-prio-badge--baixa">BAIXA</span>'
          : '<span class="tarefa-prio-badge tarefa-prio-badge--normal">NORMAL</span>';

    const acoes = isSistema
      ? `<button type="button" class="btn-icon tarefas-table-icon-btn tarefas-table-icon-btn--danger" data-action="esconder" data-id="${t.id}" aria-label="Esconder lembrete" title="Esconder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
        </button>`
      : `<button type="button" class="btn-icon tarefas-table-icon-btn tarefas-table-icon-btn--primary" data-action="reabrir" data-id="${t.id}" aria-label="Reabrir tarefa" title="Reabrir">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
        <button type="button" class="btn-icon tarefas-table-icon-btn tarefas-table-icon-btn--danger" data-action="delete" data-id="${t.id}" aria-label="Excluir tarefa" title="Excluir">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>`;

    return `
      <div class="tarefas-table-row tarefas-table-row--concluida tarefas-table-row--clickable" data-id="${t.id}" data-row-open="${t.id}">
        <div class="tarefas-table-cell tarefas-table-cell--origem">${origemBadge}</div>
        <div class="tarefas-table-cell tarefas-table-cell--title tarefas-table-cell--strike">${escapeHtml(t.titulo)}</div>
        <div class="tarefas-table-cell tarefas-table-cell--desc ${descClass}">${escapeHtml(desc)}</div>
        <div class="tarefas-table-cell tarefas-table-cell--prio">${badgePrio}</div>
        <div class="tarefas-table-cell tarefas-table-cell--prazo">${formatDateBR(t.completed_at)}</div>
        <div class="tarefas-table-cell tarefas-table-cell--actions">${acoes}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="tarefas-table">
      <div class="tarefas-table-head">
        <div class="tarefas-table-cell tarefas-table-cell--origem">ORIGEM</div>
        <div class="tarefas-table-cell tarefas-table-cell--title">TÍTULO</div>
        <div class="tarefas-table-cell tarefas-table-cell--desc">DESCRIÇÃO</div>
        <div class="tarefas-table-cell tarefas-table-cell--prio">PRIO</div>
        <div class="tarefas-table-cell tarefas-table-cell--prazo">CONCLUÍDA EM</div>
        <div class="tarefas-table-cell tarefas-table-cell--actions">AÇÕES</div>
      </div>
      ${rows}
    </div>
  `;
}

// =============================================================
// Row: grupo do sistema (colapsado)
// =============================================================
function renderGrupoRow(tipo, tarefas) {
  const meta = labelDoGrupo(tipo);
  const subtitulo = sumarizarContas(tarefas);
  return `
    <div class="tarefa-row tarefa-row--grupo" data-grupo="${tipo}">
      <span class="tarefa-origem-badge tarefa-origem-badge--sistema">⚙ AUTO</span>
      <div class="tarefa-row-content">
        <div class="tarefa-row-title">${escapeHtml(meta.titulo)} · ${tarefas.length} ${meta.unidade}</div>
        <div class="tarefa-row-desc">${escapeHtml(subtitulo)}</div>
      </div>
      <div class="tarefa-row-actions">
        <button type="button" class="btn btn-primary btn-sm" data-action="expand-grupo" data-grupo="${tipo}">Ver e ${meta.verbo}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="snooze-grupo" data-grupo="${tipo}">Lembrar em 3d</button>
      </div>
    </div>
  `;
}

// =============================================================
// Row: grupo do sistema (expandido — sub-rows individuais)
// =============================================================
function renderGrupoExpandido(tipo, tarefas) {
  const meta = labelDoGrupo(tipo);
  return `
    <div class="tarefa-row-grupo-expandido" data-grupo="${tipo}">
      <div class="tarefa-row tarefa-row--grupo-header">
        <span class="tarefa-origem-badge tarefa-origem-badge--sistema">⚙ AUTO</span>
        <div class="tarefa-row-content">
          <div class="tarefa-row-title">${escapeHtml(meta.titulo)} · ${tarefas.length} ${meta.unidade}</div>
        </div>
        <div class="tarefa-row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-action="collapse-grupo" data-grupo="${tipo}">Recolher</button>
        </div>
      </div>
      <ul class="tarefa-subrows">
        ${tarefas.map((t) => renderSubRow(t)).join('')}
      </ul>
    </div>
  `;
}

function renderSubRow(t) {
  // Extrai apenas o nome da conta do título "Importar extrato — LATAM Itau"
  const label = t.titulo.includes('—') ? t.titulo.split('—').slice(1).join('—').trim() : t.titulo;
  const url = t.acao_url || '';
  const primaryLabel = t.acao_label || 'Abrir';
  return `
    <li class="tarefa-subrow" data-id="${t.id}">
      <span class="tarefa-subrow-label">${escapeHtml(label)}</span>
      <div class="tarefa-subrow-actions">
        ${url ? `<button type="button" class="btn btn-primary btn-sm" data-action="primary" data-id="${t.id}" data-url="${escapeHtml(url)}">${escapeHtml(primaryLabel)}</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-action="snooze" data-id="${t.id}">Lembrar</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="never" data-id="${t.id}" data-conta="${t.conta_id || ''}">Dispensar</button>
      </div>
    </li>
  `;
}

// =============================================================
// Actions: reabrir, esconder
// =============================================================
async function reabrirTarefa(id) {
  const { error } = await supabase
    .from('tarefas_usuario')
    .update({ status: 'pendente', completed_at: null })
    .eq('id', id)
    .eq('workspace_id', requireWorkspaceId());
  if (error) {
    showToast(`${t('common.toast.erro', 'Erro')}: ${error.message}`, 'error', 8000);
    return;
  }
  await loadAll();
  render();
  showToast('Tarefa reaberta', 'success');
}

async function esconderTarefa(id) {
  const { error } = await supabase
    .from('tarefas_usuario')
    .delete()
    .eq('id', id)
    .eq('workspace_id', requireWorkspaceId());
  if (error) {
    showToast(`${t('common.toast.erro', 'Erro')}: ${error.message}`, 'error', 8000);
    return;
  }
  await loadAll();
  render();
}

// =============================================================
// Modal: detalhes da tarefa (read-only com ações)
// Conteúdo dinâmico é todo escapado via escapeHtml() — XSS-safe.
// =============================================================
function openTarefaDetalhes(id) {
  const tarefa = cachedPendentes.find((x) => x.id === id) || cachedConcluidas.find((x) => x.id === id);
  if (!tarefa) return;
  renderTarefaDetalhesModal(tarefa);
  openModal('modal-tarefa-detalhes');
}

function renderTarefaDetalhesModal(tarefa) {
  const isSistema = tarefa.criada_por === 'sistema';
  const isConcluida = tarefa.status === 'concluida';
  const prio = tarefa.prioridade || 'normal';
  const prazoIso = tarefa.metadata?.prazo || null;

  const priorityClass = isSistema
    ? 'modal-tarefa-detalhes--auto'
    : `modal-tarefa-detalhes--${prio}`;

  const origemBadge = isSistema
    ? '<span class="tarefa-origem-badge tarefa-origem-badge--auto">AUTO</span>'
    : '<span class="tarefa-origem-badge tarefa-origem-badge--minha">MINHA</span>';

  const prioBadge = isSistema
    ? ''
    : prio === 'alta'
      ? '<span class="tarefa-prio-badge tarefa-prio-badge--alta">ALTA</span>'
      : prio === 'baixa'
        ? '<span class="tarefa-prio-badge tarefa-prio-badge--baixa">BAIXA</span>'
        : '<span class="tarefa-prio-badge tarefa-prio-badge--normal">NORMAL</span>';

  const prazoLabel = prazoIso ? `${formatDateBR(prazoIso)} ${prazoFraseRelativa(prazoIso)}` : '—';
  const criadaEm = tarefa.created_at ? formatDateBR(tarefa.created_at) : '—';
  const origemLabel = isSistema ? 'Sistema (automática)' : 'Você (manual)';
  const concluidaEm = isConcluida && tarefa.completed_at ? formatDateBR(tarefa.completed_at) : null;

  const tid = escapeHtml(tarefa.id);
  let acoesHtml = '';
  if (!isConcluida) {
    acoesHtml = `
      <button type="button" class="btn btn-success btn-sm" data-detail-action="concluir" data-id="${tid}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Concluir
      </button>
      <button type="button" class="btn btn-ghost btn-sm" data-detail-action="edit" data-id="${tid}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        Editar
      </button>
      <button type="button" class="btn btn-ghost btn-sm" data-detail-action="delete" data-id="${tid}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
        Excluir
      </button>
    `;
  } else if (isSistema) {
    acoesHtml = `
      <button type="button" class="btn btn-ghost btn-sm" data-detail-action="esconder" data-id="${tid}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
        Esconder
      </button>
    `;
  } else {
    acoesHtml = `
      <button type="button" class="btn btn-primary btn-sm" data-detail-action="reabrir" data-id="${tid}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        Reabrir
      </button>
      <button type="button" class="btn btn-ghost btn-sm" data-detail-action="delete" data-id="${tid}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        Excluir
      </button>
    `;
  }

  const descricaoHtml = tarefa.descricao
    ? `<p class="modal-tarefa-detalhes-desc">${escapeHtml(tarefa.descricao)}</p>`
    : '<p class="modal-tarefa-detalhes-desc modal-tarefa-detalhes-desc--empty">Sem descrição</p>';

  const metaPrazoLabel = isConcluida ? 'Concluída em' : 'Prazo';
  const metaPrazoValue = isConcluida ? (concluidaEm || '—') : prazoLabel;

  const html = `
    <div class="modal modal-md modal-tarefa-detalhes ${priorityClass}">
      <div class="modal-header modal-tarefa-detalhes-header">
        <h2 class="modal-title">Detalhes da tarefa</h2>
        <button type="button" class="modal-close" data-close-modal="modal-tarefa-detalhes" aria-label="Fechar">×</button>
      </div>
      <div class="modal-body modal-tarefa-detalhes-body">
        <div class="modal-tarefa-detalhes-badges">
          ${origemBadge}
          ${prioBadge}
        </div>
        <h3 class="modal-tarefa-detalhes-title">${escapeHtml(tarefa.titulo)}</h3>
        ${descricaoHtml}
        <div class="modal-tarefa-detalhes-meta">
          <div class="modal-tarefa-detalhes-meta-row">
            <span class="modal-tarefa-detalhes-meta-label">${metaPrazoLabel}</span>
            <span class="modal-tarefa-detalhes-meta-value">${escapeHtml(metaPrazoValue)}</span>
          </div>
          <div class="modal-tarefa-detalhes-meta-row">
            <span class="modal-tarefa-detalhes-meta-label">Criada em</span>
            <span class="modal-tarefa-detalhes-meta-value">${escapeHtml(criadaEm)}</span>
          </div>
          <div class="modal-tarefa-detalhes-meta-row">
            <span class="modal-tarefa-detalhes-meta-label">Origem</span>
            <span class="modal-tarefa-detalhes-meta-value">${origemLabel}</span>
          </div>
        </div>
      </div>
      <div class="modal-footer modal-tarefa-detalhes-footer">
        ${acoesHtml}
      </div>
    </div>
  `;

  const root = document.getElementById('modal-tarefa-detalhes');
  setSafeMarkup(root, html);
}

// innerHTML wrapper isolado — todo input dinâmico passa por escapeHtml() acima.
function setSafeMarkup(el, markup) {
  // eslint-disable-next-line no-unsanitized/property
  el.innerHTML = markup;
}

function prazoFraseRelativa(iso) {
  const dias = diasAteISO(iso);
  if (dias === null) return '';
  if (dias < 0) return `(atrasada ${Math.abs(dias)}d)`;
  if (dias === 0) return '(hoje)';
  if (dias === 1) return '(em 1 dia)';
  return `(em ${dias} dias)`;
}

// =============================================================
// Helpers
// =============================================================
function sortMinhas(a, b) {
  const dA = diasAteISO(a.metadata?.prazo || null);
  const dB = diasAteISO(b.metadata?.prazo || null);
  // sem prazo no fim
  if (dA === null && dB !== null) return 1;
  if (dB === null && dA !== null) return -1;
  if (dA !== dB && dA !== null && dB !== null) return dA - dB;
  // depois prio: alta > normal > baixa
  return prioRank(a.prioridade) - prioRank(b.prioridade);
}

function prioRank(p) {
  if (p === 'alta') return 0;
  if (p === 'baixa') return 2;
  return 1;
}

function clampText(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function renderPrazoCell(iso) {
  const dias = diasAteISO(iso);
  if (dias === null) return '<span class="tarefa-row-prazo--vazio">—</span>';
  if (dias < 0)  return `<span class="tarefa-row-prazo--atrasada">atrasada ${Math.abs(dias)}d</span>`;
  if (dias === 0) return '<span class="tarefa-row-prazo--hoje">hoje</span>';
  if (dias === 1) return '<span>em 1 dia</span>';
  return `<span>em ${dias} dias</span>`;
}

function labelDoGrupo(tipo) {
  switch (tipo) {
    case 'import_extrato':
      return { titulo: 'Importações pendentes', unidade: 'contas', verbo: 'importar' };
    case 'reconciliacao_pendente':
      return { titulo: 'Reconciliações pendentes', unidade: 'contas', verbo: 'reconciliar' };
    default:
      return { titulo: `Lembretes (${tipo})`, unidade: 'itens', verbo: 'abrir' };
  }
}

function sumarizarContas(tarefas) {
  const nomes = tarefas
    .map((t) => (t.titulo.includes('—') ? t.titulo.split('—').slice(1).join('—').trim() : t.titulo))
    .filter(Boolean);
  const joined = nomes.join(', ');
  return joined.length > 80 ? joined.slice(0, 77) + '…' : joined;
}

function diasAteISO(iso) {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function formatDateBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function openTarefaModal(tarefa = null) {
  const title = tarefa ? 'Editar tarefa' : 'Nova tarefa';
  document.getElementById('modal-tarefa-title').textContent = title;
  document.getElementById('tarefa-id').value = tarefa?.id || '';
  document.getElementById('tarefa-titulo').value = tarefa?.titulo || '';
  document.getElementById('tarefa-descricao').value = tarefa?.descricao || '';
  document.getElementById('tarefa-prioridade').value = tarefa?.prioridade || 'normal';
  document.getElementById('tarefa-prazo').value = tarefa?.metadata?.prazo || '';
  openModal('modal-tarefa');
}

async function salvarTarefa(e) {
  e.preventDefault();
  const id        = document.getElementById('tarefa-id').value || null;
  const titulo    = document.getElementById('tarefa-titulo').value.trim();
  const descricao = document.getElementById('tarefa-descricao').value.trim() || null;
  const prioridade = document.getElementById('tarefa-prioridade').value;
  const prazoIso  = document.getElementById('tarefa-prazo').value || null;
  if (!titulo) { showToast(t('tarefas.validacao.titulo_obrigatorio', 'Informe o título'), 'error'); return; }

  const user = await getCurrentUser();
  if (!user) return;

  const metadata = prazoIso ? { prazo: prazoIso } : null;
  const payload = {
    titulo,
    descricao,
    prioridade,
    metadata,
  };

  let error;
  if (id) {
    ({ error } = await supabase.from('tarefas_usuario').update(payload).eq('id', id));
  } else {
    ({ error } = await supabase.from('tarefas_usuario').insert({
      ...payload,
      user_id: user.id,
      workspace_id: requireWorkspaceId(),
      created_by: user.id,
      tipo: 'manual',
      criada_por: 'usuario',
      status: 'pendente',
    }));
  }
  if (error) {
    showToast(`${t('common.toast.erro', 'Erro')}: ${error.message}`, 'error', 8000);
    return;
  }
  closeModal('modal-tarefa');
  await loadAll();
  render();
  showToast(id
    ? t('tarefas.toast.atualizada', 'Tarefa atualizada')
    : t('tarefas.toast.criada', 'Tarefa criada'), 'success');
}
