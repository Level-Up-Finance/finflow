// =============================================================
// FinFlow — Drawer de tarefas (ícone no header + painel lateral)
//
// Inicializa o ícone com badge no header (próximo ao avatar) e
// abre um drawer com a lista de tarefas pendentes ao clicar.
//
// Inicia geração automática de tarefas em background (sem bloquear UI).
// =============================================================
import {
  loadTarefasPendentes,
  gerarTarefasImportExtrato,
  concluirTarefa,
  dispensarTarefa,
  nuncaLembrarMais,
} from '../lib/tarefas.js';

let drawerInitialized = false;

export async function initTarefasDrawer() {
  if (drawerInitialized) return;
  drawerInitialized = true;

  // Cria o trigger (botão no header com badge) — sempre antes do avatar do usuário
  let trigger = document.getElementById('tarefas-trigger');
  if (!trigger) {
    const headerRight = document.querySelector('.app-header .header-right') || document.querySelector('.app-header');
    if (!headerRight) return;
    trigger = document.createElement('button');
    trigger.id = 'tarefas-trigger';
    trigger.type = 'button';
    trigger.className = 'tarefas-trigger';
    trigger.setAttribute('aria-label', 'Tarefas');
    trigger.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      <span class="tarefas-trigger-badge hidden" id="tarefas-trigger-badge">0</span>
    `;
    insertBeforeAvatar(trigger, headerRight);
  }

  // Cria o drawer (overlay + painel lateral) só uma vez
  let drawer = document.getElementById('tarefas-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'tarefas-drawer';
    drawer.className = 'tarefas-drawer hidden';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Tarefas pendentes');
    drawer.innerHTML = `
      <div class="tarefas-drawer-backdrop" data-close-drawer></div>
      <aside class="tarefas-drawer-panel">
        <header class="tarefas-drawer-header">
          <h2 class="tarefas-drawer-title">Tarefas</h2>
          <button type="button" class="tarefas-drawer-close" data-close-drawer aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div class="tarefas-drawer-body" id="tarefas-drawer-body">
          <div class="loading-overlay" style="position:relative;min-height:120px;"><span class="spinner"></span></div>
        </div>
      </aside>
    `;
    document.body.appendChild(drawer);
  }

  // Bindings
  trigger.addEventListener('click', () => openDrawer());
  drawer.addEventListener('click', (e) => {
    // Usa closest pra capturar cliques no SVG dentro do botão
    if (e.target.closest('[data-close-drawer]')) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.classList.contains('hidden')) closeDrawer();
  });

  // Geração em background (não bloqueia init) + badge inicial
  gerarTarefasImportExtrato().then(() => atualizarBadge());
  atualizarBadge();
}

/**
 * Mantém o avatar (#header-user-menu) sempre por último na direita do header.
 * Se o avatar já existe → insere ANTES dele.
 * Se ainda não existe (ordem de inicialização) → insere o elemento e usa
 * window.MutationObserver pra reorganizar quando o avatar for adicionado.
 */
function insertBeforeAvatar(el, headerRight) {
  const avatar = headerRight.querySelector('#header-user-menu');
  if (avatar) {
    headerRight.insertBefore(el, avatar);
    return;
  }
  headerRight.appendChild(el);
  const MO = window.MutationObserver;
  if (!MO) return;
  const obs = new MO(() => {
    const av = headerRight.querySelector('#header-user-menu');
    if (av && av.previousSibling !== el) {
      headerRight.insertBefore(el, av);
      obs.disconnect();
    }
  });
  obs.observe(headerRight, { childList: true });
  setTimeout(() => obs.disconnect(), 5000);
}

async function openDrawer() {
  const drawer = document.getElementById('tarefas-drawer');
  if (!drawer) return;
  drawer.classList.remove('hidden');
  // Garante geração antes de listar (caso seja a primeira abertura da sessão)
  await gerarTarefasImportExtrato();
  await renderLista();
  atualizarBadge();
}

function closeDrawer() {
  const drawer = document.getElementById('tarefas-drawer');
  if (drawer) drawer.classList.add('hidden');
}

async function atualizarBadge() {
  const tarefas = await loadTarefasPendentes();
  const badge = document.getElementById('tarefas-trigger-badge');
  if (!badge) return;
  const n = tarefas.length;
  badge.textContent = String(n);
  badge.classList.toggle('hidden', n === 0);
}

async function renderLista() {
  const body = document.getElementById('tarefas-drawer-body');
  if (!body) return;
  const tarefas = await loadTarefasPendentes();
  if (tarefas.length === 0) {
    body.innerHTML = `
      <div class="tarefas-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-success);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <p class="tarefas-empty-title">Tudo em dia!</p>
        <p class="tarefas-empty-sub">Nenhuma tarefa pendente no momento.</p>
      </div>
    `;
    return;
  }
  body.innerHTML = tarefas.map(renderTarefaItem).join('');
  body.querySelectorAll('[data-tarefa-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => handleAction(e.currentTarget));
  });
}

function renderTarefaItem(t) {
  const prioClass = t.prioridade === 'alta' ? 'tarefa-item--alta' : '';
  return `
    <div class="tarefa-item ${prioClass}" data-id="${t.id}">
      <div class="tarefa-item-content">
        <div class="tarefa-item-title">${escapeHtml(t.titulo)}</div>
        ${t.descricao ? `<div class="tarefa-item-desc">${escapeHtml(t.descricao)}</div>` : ''}
      </div>
      <div class="tarefa-item-actions">
        ${t.acao_url ? `<a href="${t.acao_url}" class="btn btn-primary btn-sm" data-tarefa-action="acao" data-id="${t.id}">${escapeHtml(t.acao_label || 'Abrir')}</a>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-tarefa-action="snooze" data-id="${t.id}" title="Lembrar em 3 dias">Lembrar depois</button>
        <button type="button" class="btn btn-ghost btn-sm" data-tarefa-action="never" data-id="${t.id}" data-conta="${t.conta_id || ''}" title="Não lembrar mais">Não lembrar</button>
      </div>
    </div>
  `;
}

async function handleAction(btn) {
  const action = btn.dataset.tarefaAction;
  const id     = btn.dataset.id;
  if (action === 'acao') {
    // Não impede a navegação do link — apenas marca como concluída em background
    await concluirTarefa(id);
    return;
  }
  if (action === 'snooze') {
    await dispensarTarefa(id, 3);
    await renderLista();
    await atualizarBadge();
    return;
  }
  if (action === 'never') {
    const contaId = btn.dataset.conta || null;
    await nuncaLembrarMais(id, contaId);
    await renderLista();
    await atualizarBadge();
    return;
  }
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
