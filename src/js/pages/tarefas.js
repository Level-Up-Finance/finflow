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
// Estado de expansão dos grupos do sistema (keyed por t.tipo)
let gruposExpandidos = new Set();
// Estado dos menus kebab abertos (id da tarefa)
let menuAbertoId = null;

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

    // -----------------------------
    // Ações de grupo (sistema)
    // -----------------------------
    if (action === 'expand-grupo') {
      const tipo = btn.dataset.grupo;
      gruposExpandidos.add(tipo);
      render();
      return;
    }
    if (action === 'collapse-grupo') {
      const tipo = btn.dataset.grupo;
      gruposExpandidos.delete(tipo);
      render();
      return;
    }
    if (action === 'snooze-grupo') {
      const tipo = btn.dataset.grupo;
      const tarefasDoGrupo = cachedPendentes.filter((x) => x.criada_por === 'sistema' && x.tipo === tipo);
      await Promise.all(tarefasDoGrupo.map((x) => dispensarTarefa(x.id, 3)));
      await loadAll();
      render();
      showToast(t('tarefas.toast.snooze_3d', 'Lembrarei em 3 dias'), 'info', 4000);
      return;
    }
    if (action === 'dispensar-todos') {
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
    // Menu kebab (suas tarefas)
    // -----------------------------
    if (action === 'menu') {
      e.stopPropagation();
      menuAbertoId = (menuAbertoId === id) ? null : id;
      render();
      return;
    }

    // -----------------------------
    // Ações individuais
    // -----------------------------
    if (action === 'concluir') {
      await concluirTarefa(id);
      menuAbertoId = null;
      await loadAll();
      render();
      return;
    }
    if (action === 'snooze') {
      await dispensarTarefa(id, 3);
      menuAbertoId = null;
      await loadAll();
      render();
      showToast(t('tarefas.toast.snooze_3d', 'Lembrarei em 3 dias'), 'info', 4000);
      return;
    }
    if (action === 'never') {
      const contaId = btn.dataset.conta || null;
      await nuncaLembrarMais(id, contaId);
      menuAbertoId = null;
      await loadAll();
      render();
      return;
    }
    if (action === 'edit') {
      const tarefa = cachedPendentes.find((x) => x.id === id) || cachedConcluidas.find((x) => x.id === id);
      menuAbertoId = null;
      if (tarefa) openTarefaModal(tarefa);
      return;
    }
    if (action === 'delete') {
      const ok = await showConfirm('Excluir essa tarefa?', { okLabel: 'Excluir', danger: true });
      menuAbertoId = null;
      if (!ok) return;
      // Defense in depth: filtra por workspace_id explícito
      await supabase.from('tarefas_usuario').delete().eq('id', id).eq('workspace_id', requireWorkspaceId());
      await loadAll();
      render();
      return;
    }
  });

  // Fechar menu kebab ao clicar fora
  document.addEventListener('click', (e) => {
    if (menuAbertoId && !e.target.closest('.tarefa-row-menu, [data-action="menu"]')) {
      menuAbertoId = null;
      render();
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

  if (viewTab === 'pendentes') {
    list.innerHTML = renderPendentes(data);
  } else {
    list.innerHTML = renderConcluidas(data);
  }
}

// =============================================================
// Render: pendentes (Suas tarefas + Lembretes do sistema)
// =============================================================
function renderPendentes(pendentes) {
  const suas = pendentes.filter((t) => t.criada_por !== 'sistema');
  const sistema = pendentes.filter((t) => t.criada_por === 'sistema');

  // Agrupa sistema por t.tipo
  const gruposSistema = new Map();
  for (const t of sistema) {
    const tipo = t.tipo || 'outro';
    if (!gruposSistema.has(tipo)) gruposSistema.set(tipo, []);
    gruposSistema.get(tipo).push(t);
  }

  let out = '<div class="tarefas-page-list-inner">';

  // Suas tarefas
  if (suas.length > 0) {
    out += `
      <div class="tarefa-grupo-header">
        <span>Suas tarefas · ${suas.length}</span>
      </div>
      ${suas.map(renderTarefaRow).join('')}
    `;
  }

  // Lembretes do sistema
  if (sistema.length > 0) {
    out += `
      <div class="tarefa-grupo-header">
        <span>Lembretes do sistema · ${sistema.length}</span>
        <button type="button" class="tarefa-grupo-bulk" data-action="dispensar-todos">Dispensar todos</button>
      </div>
    `;
    for (const [tipo, tarefas] of gruposSistema) {
      const expandido = gruposExpandidos.has(tipo);
      out += expandido
        ? renderGrupoExpandido(tipo, tarefas)
        : renderGrupoRow(tipo, tarefas);
    }
  }

  out += '</div>';
  return out;
}

// =============================================================
// Render: aba "Concluídas" — mantém visualização simples como rows
// =============================================================
function renderConcluidas(concluidas) {
  return `<div class="tarefas-page-list-inner">${concluidas.map(renderTarefaRowConcluida).join('')}</div>`;
}

// =============================================================
// Row: tarefa "sua" (pendente)
// =============================================================
function renderTarefaRow(t) {
  const prio = t.prioridade || 'normal';
  const prazoIso = t.metadata?.prazo || null;
  const prazoInfo = renderPrazo(prazoIso);
  const menuOpen = menuAbertoId === t.id;

  const badgePrio = prio === 'alta'
    ? '<span class="tarefa-prio-badge tarefa-prio-badge--alta">🔥 ALTA</span>'
    : prio === 'baixa'
      ? '<span class="tarefa-prio-badge tarefa-prio-badge--baixa">BAIXA</span>'
      : '<span class="tarefa-prio-badge tarefa-prio-badge--normal">NORMAL</span>';

  return `
    <div class="tarefa-row tarefa-row--sua tarefa-row--${prio}" data-id="${t.id}" data-prio="${prio}">
      ${badgePrio}
      <div class="tarefa-row-content">
        <div class="tarefa-row-title">${escapeHtml(t.titulo)}</div>
        ${t.descricao ? `<div class="tarefa-row-desc">${escapeHtml(t.descricao)}</div>` : ''}
      </div>
      <div class="tarefa-row-meta">
        ${prazoInfo}
      </div>
      <div class="tarefa-row-actions">
        <div class="tarefa-row-menu-wrap">
          <button type="button" class="btn btn-icon tarefa-row-menu-btn" data-action="menu" data-id="${t.id}" aria-label="Mais ações">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
          </button>
          ${menuOpen ? `
            <div class="tarefa-row-menu">
              <button type="button" class="tarefa-row-menu-item" data-action="concluir" data-id="${t.id}">✓ Concluir</button>
              <button type="button" class="tarefa-row-menu-item" data-action="edit" data-id="${t.id}">Editar</button>
              <button type="button" class="tarefa-row-menu-item tarefa-row-menu-item--danger" data-action="delete" data-id="${t.id}">Excluir</button>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

// =============================================================
// Row: tarefa concluída (simples)
// =============================================================
function renderTarefaRowConcluida(t) {
  const isSistema = t.criada_por === 'sistema';
  const origemBadge = isSistema
    ? '<span class="tarefa-origem-badge tarefa-origem-badge--sistema">⚙ AUTO</span>'
    : '<span class="tarefa-origem-badge tarefa-origem-badge--usuario">SUA</span>';
  return `
    <div class="tarefa-row tarefa-row--concluida" data-id="${t.id}">
      ${origemBadge}
      <div class="tarefa-row-content">
        <div class="tarefa-row-title">${escapeHtml(t.titulo)}</div>
        ${t.descricao ? `<div class="tarefa-row-desc">${escapeHtml(t.descricao)}</div>` : ''}
      </div>
      <div class="tarefa-row-meta">
        <span class="tarefa-completed-at">Concluída em ${formatDateBR(t.completed_at)}</span>
      </div>
      <div class="tarefa-row-actions">
        ${!isSistema ? `<button type="button" class="btn btn-ghost btn-sm" data-action="delete" data-id="${t.id}" style="color:var(--color-danger);">Excluir</button>` : ''}
      </div>
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
// Helpers
// =============================================================
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

function renderPrazo(iso) {
  const dias = diasAteISO(iso);
  if (dias === null) return '<span class="tarefa-row-prazo tarefa-row-prazo--vazio">Sem prazo</span>';
  if (dias < 0)  return `<span class="tarefa-row-prazo tarefa-row-prazo--atrasada">⏰ atrasada ${Math.abs(dias)}d</span>`;
  if (dias === 0) return '<span class="tarefa-row-prazo tarefa-row-prazo--hoje">⏰ hoje</span>';
  if (dias === 1) return '<span class="tarefa-row-prazo">⏰ em 1 dia</span>';
  return `<span class="tarefa-row-prazo">⏰ em ${dias} dias</span>`;
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
