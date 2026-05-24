// =============================================================
// FinFlow — Página /tarefas
// Lista pendentes + concluídas. Permite criar tarefas manuais e
// concluir/dispensar tarefas automáticas. Auto-geração de tarefas
// (import_extrato, reconciliacao_pendente) roda em background.
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

let viewTab = 'pendentes'; // 'pendentes' | 'concluidas'
let cachedPendentes = [];
let cachedConcluidas = [];

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

  document.getElementById('tarefas-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    if (btn.dataset.tab === viewTab) return;
    viewTab = btn.dataset.tab;
    document.querySelectorAll('#tarefas-tabs [data-tab]').forEach((b) =>
      b.classList.toggle('active', b.dataset.tab === viewTab)
    );
    render();
  });

  // Fechar modal
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  // Salvar tarefa manual
  document.getElementById('form-tarefa').addEventListener('submit', salvarTarefa);

  // Delegation pra ações na lista (concluir, dispensar, etc)
  document.getElementById('tarefas-page-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'concluir') {
      await concluirTarefa(id);
      await loadAll();
      render();
      return;
    }
    if (action === 'snooze') {
      await dispensarTarefa(id, 3);
      await loadAll();
      render();
      showToast(t('tarefas.toast.snooze_3d', 'Lembrarei em 3 dias'), 'info', 4000);
      return;
    }
    if (action === 'never') {
      const contaId = btn.dataset.conta || null;
      await nuncaLembrarMais(id, contaId);
      await loadAll();
      render();
      return;
    }
    if (action === 'edit') {
      const t = cachedPendentes.find((x) => x.id === id) || cachedConcluidas.find((x) => x.id === id);
      if (t) openTarefaModal(t);
      return;
    }
    if (action === 'delete') {
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

function render() {
  const list  = document.getElementById('tarefas-page-list');
  const empty = document.getElementById('tarefas-page-empty');
  const data = viewTab === 'pendentes' ? cachedPendentes : cachedConcluidas;

  // Badge da aba Pendentes
  const badge = document.getElementById('tarefas-pendentes-count');
  badge.textContent = String(cachedPendentes.length);
  badge.classList.toggle('hidden', cachedPendentes.length === 0);

  if (data.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    document.getElementById('empty-title').textContent =
      viewTab === 'pendentes' ? 'Tudo em dia!' : 'Nenhuma tarefa concluída ainda';
    document.getElementById('empty-message').textContent =
      viewTab === 'pendentes'
        ? 'Nenhuma tarefa pendente. Use "Nova tarefa" pra criar seus lembretes.'
        : 'Quando você concluir uma tarefa, ela vai aparecer aqui.';
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = `<div class="tarefas-page-grid">${data.map(renderTarefaCard).join('')}</div>`;
}

function renderTarefaCard(t) {
  const isPendente = t.status === 'pendente';
  const isSistema  = t.criada_por === 'sistema';
  const prioCls = t.prioridade === 'alta'  ? 'tarefa-page-card--alta'
                : t.prioridade === 'baixa' ? 'tarefa-page-card--baixa'
                : '';
  const origemBadge = isSistema
    ? `<span class="tarefa-origem-badge tarefa-origem-badge--sistema" title="Gerada automaticamente pelo sistema">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Auto
      </span>`
    : `<span class="tarefa-origem-badge tarefa-origem-badge--usuario" title="Criada por você">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><circle cx="12" cy="7" r="4"/><path d="M17 21v-2a4 4 0 0 0-4-4H11a4 4 0 0 0-4 4v2"/></svg>
        Sua
      </span>`;

  const acoesPendente = `
    ${t.acao_url ? `<a href="${t.acao_url}" class="btn btn-primary btn-sm">${escapeHtml(t.acao_label || 'Abrir')}</a>` : ''}
    <button type="button" class="btn btn-ghost btn-sm" data-action="concluir" data-id="${t.id}">✓ Concluir</button>
    ${isSistema && t.tipo === 'import_extrato' ? `
      <button type="button" class="btn btn-ghost btn-sm" data-action="snooze" data-id="${t.id}">Lembrar em 3d</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="never" data-id="${t.id}" data-conta="${t.conta_id || ''}">Não lembrar</button>
    ` : ''}
    ${!isSistema ? `
      <button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${t.id}">Editar</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="delete" data-id="${t.id}" style="color:var(--color-danger);">Excluir</button>
    ` : ''}
  `;
  const acoesConcluida = `
    <span class="tarefa-completed-at">Concluída em ${formatDateBR(t.completed_at)}</span>
    ${!isSistema ? `<button type="button" class="btn btn-ghost btn-sm" data-action="delete" data-id="${t.id}" style="color:var(--color-danger);">Excluir</button>` : ''}
  `;

  return `
    <div class="tarefa-page-card ${prioCls}" data-id="${t.id}">
      <div class="tarefa-page-card-head">
        <span class="tarefa-page-card-title">${escapeHtml(t.titulo)}</span>
        ${origemBadge}
      </div>
      ${t.descricao ? `<p class="tarefa-page-card-desc">${escapeHtml(t.descricao)}</p>` : ''}
      <div class="tarefa-page-card-actions">
        ${isPendente ? acoesPendente : acoesConcluida}
      </div>
    </div>
  `;
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
