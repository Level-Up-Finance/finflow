// =============================================================
// FinFlow — Drawer de tarefas (ícone no header + painel lateral)
//
// Filosofia: drawer = TRIAGEM RÁPIDA, não management.
// Mostra só o que precisa de atenção AGORA + summary do resto +
// link pra página completa. Detalhes em /tarefas.html.
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
    trigger = document.createElement('button');
    trigger.id = 'tarefas-trigger';
    trigger.type = 'button';
    trigger.className = 'tarefas-trigger';
    trigger.setAttribute('aria-label', 'Tarefas');
    setMarkup(trigger, `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      <span id="tarefas-trigger-badge" class="tarefas-trigger-badge hidden">0</span>
    `);

    const headerRight = document.querySelector('.header-right, .header-controls, header .user-section');
    if (headerRight) {
      insertBeforeAvatar(trigger, headerRight);
    } else {
      document.body.appendChild(trigger);
    }
  }

  // Cria o drawer (painel lateral)
  let drawer = document.getElementById('tarefas-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'tarefas-drawer';
    drawer.className = 'tarefas-drawer hidden';
    setMarkup(drawer, `
      <div class="tarefas-drawer-backdrop" id="tarefas-drawer-backdrop"></div>
      <div class="tarefas-drawer-panel">
        <div class="tarefas-drawer-header">
          <h2 class="tarefas-drawer-title">Tarefas</h2>
          <button type="button" class="tarefas-drawer-close" id="tarefas-drawer-close" aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="tarefas-drawer-body" id="tarefas-drawer-body"></div>
      </div>
    `);
    document.body.appendChild(drawer);
  }

  trigger.addEventListener('click', openDrawer);
  document.getElementById('tarefas-drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('tarefas-drawer-backdrop').addEventListener('click', closeDrawer);

  // Geração em background — não bloqueia UI
  gerarTarefasImportExtrato().catch((err) => console.warn('[tarefas-drawer] gerar import extrato', err));

  // Render inicial
  await renderLista();
  await atualizarBadge();
}

function insertBeforeAvatar(el, headerRight) {
  // Tenta inserir antes do avatar/menu do usuário; se não achar, append.
  const avatar = headerRight.querySelector('.user-avatar, .avatar, [data-user-menu]');
  if (avatar) {
    headerRight.insertBefore(el, avatar);
  } else {
    headerRight.appendChild(el);
  }
}

// Helper que aceita HTML montado pelo próprio módulo (já escapado em valores
// de usuário via escapeHtml). Isolado pra ficar claro onde aplicamos innerHTML.
function setMarkup(el, html) {
  el.innerHTML = html;
}

async function openDrawer() {
  const drawer = document.getElementById('tarefas-drawer');
  drawer.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Re-render ao abrir pra garantir dados frescos
  await renderLista();
  await atualizarBadge();
}

function closeDrawer() {
  document.getElementById('tarefas-drawer').classList.add('hidden');
  document.body.style.overflow = '';
}

async function atualizarBadge() {
  const tarefas = await loadTarefasPendentes();
  const badge = document.getElementById('tarefas-trigger-badge');
  if (!badge) return;
  const n = tarefas.length;
  badge.textContent = String(n);
  badge.classList.toggle('hidden', n === 0);
}

// Calcula dias até uma data ISO. Negativo = atrasada. Null se data inválida.
function diasAteISO(iso) {
  if (!iso) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const target = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  target.setHours(0, 0, 0, 0);
  if (isNaN(target.getTime())) return null;
  return Math.round((target - hoje) / 86400000);
}

// Tarefa atrasada: minha + prazo passado (< 0).
function isAtrasada(t) {
  if (t.criada_por === 'sistema') return false;
  const dias = diasAteISO(t?.metadata?.prazo);
  return dias !== null && dias < 0;
}

// "Precisa de atenção hoje": minha + (prazo === 0 OU prioridade alta sem
// estar atrasada). Atrasadas vão pra grupo separado acima.
function isUrgente(t) {
  if (t.criada_por === 'sistema') return false;
  if (isAtrasada(t)) return false; // não duplica em "atenção hoje"
  if (t.prioridade === 'alta') return true;
  const dias = diasAteISO(t?.metadata?.prazo);
  return dias === 0;
}

// Retorna HTML do label de prazo apropriado pra tarefa.
// Atrasada: "atrasada Nd" (danger)
// Hoje:     "hoje" (warning)
// Futuro:   "em N dias" (muted)
// Sem prazo: "sem prazo" (muted) — só pra tasks de alta prioridade no grupo "atenção hoje"
function renderPrazoBadge(t, opts = {}) {
  const dias = diasAteISO(t?.metadata?.prazo);
  if (dias === null) {
    return opts.showSemPrazo
      ? `<span class="tarefas-drawer-urgente-prazo tarefas-drawer-urgente-prazo--muted">sem prazo</span>`
      : '';
  }
  if (dias < 0) {
    return `<span class="tarefas-drawer-urgente-prazo tarefas-drawer-urgente-prazo--atrasada">atrasada ${Math.abs(dias)}d</span>`;
  }
  if (dias === 0) {
    return `<span class="tarefas-drawer-urgente-prazo tarefas-drawer-urgente-prazo--hoje">hoje</span>`;
  }
  return `<span class="tarefas-drawer-urgente-prazo tarefas-drawer-urgente-prazo--futuro">em ${dias} dia${dias !== 1 ? 's' : ''}</span>`;
}

// Labels amigáveis pra grupos do sistema.
const SISTEMA_LABELS = {
  import_extrato:         'importações pendentes',
  reconciliacao_pendente: 'reconciliações pendentes',
  outro:                  'lembretes do sistema',
};

async function renderLista() {
  const body = document.getElementById('tarefas-drawer-body');
  if (!body) return;
  const tarefas = await loadTarefasPendentes();

  if (tarefas.length === 0) {
    setMarkup(body, `
      <div class="tarefas-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-success);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <p class="tarefas-empty-title">Tudo em dia!</p>
        <p class="tarefas-empty-sub">Nenhuma tarefa pendente no momento.</p>
      </div>
    `);
    return;
  }

  // Particiona em 4 buckets (princípio do drawer: triagem rápida com hierarquia temporal)
  //   atrasadas:  minhas com prazo já vencido (mais urgente, top)
  //   urgentes:   minhas com prazo === hoje OU prioridade alta (não atrasada)
  //   sistema:    agrupadas por tipo (uma linha por grupo)
  //   outras:     minhas não-urgentes (só contagem inline)
  const atrasadas = tarefas.filter(isAtrasada);
  const urgentes  = tarefas.filter(isUrgente);
  const sistema   = tarefas.filter((t) => t.criada_por === 'sistema');
  const outras    = tarefas.filter((t) => t.criada_por !== 'sistema' && !isAtrasada(t) && !isUrgente(t));

  // Agrupa sistema por tipo
  const sistemaGrupos = new Map();
  for (const t of sistema) {
    const tipo = t.tipo || 'outro';
    if (!sistemaGrupos.has(tipo)) sistemaGrupos.set(tipo, []);
    sistemaGrupos.get(tipo).push(t);
  }

  const parts = [];

  // Header com contagem total
  parts.push(`
    <div class="tarefas-drawer-summary">
      <span class="tarefas-drawer-summary-count">${tarefas.length}</span>
      <span class="tarefas-drawer-summary-text">tarefa${tarefas.length !== 1 ? 's' : ''} pendente${tarefas.length !== 1 ? 's' : ''}</span>
    </div>
  `);

  // SEÇÃO 0 — ATRASADAS (top: mais urgente, vermelho intenso)
  if (atrasadas.length > 0) {
    parts.push(`
      <div class="tarefas-drawer-section">
        <div class="tarefas-drawer-section-label tarefas-drawer-section-label--atrasada">Atrasadas · ${atrasadas.length}</div>
        ${atrasadas.map((t) => renderTarefaUrgente(t, true)).join('')}
      </div>
    `);
  }

  // SEÇÃO 1 — PRECISA DE ATENÇÃO HOJE (hoje OU alta prioridade não-atrasada)
  if (urgentes.length > 0) {
    parts.push(`
      <div class="tarefas-drawer-section">
        <div class="tarefas-drawer-section-label">Precisa de atenção hoje</div>
        ${urgentes.map((t) => renderTarefaUrgente(t, false)).join('')}
      </div>
    `);
  }

  // SEÇÃO 2 — SISTEMA (agrupado por tipo)
  if (sistemaGrupos.size > 0) {
    const sistemaHtml = [];
    if (urgentes.length === 0) {
      sistemaHtml.push(`<div class="tarefas-drawer-section-label">Lembretes do sistema</div>`);
    }
    for (const [tipo, items] of sistemaGrupos) {
      const label = SISTEMA_LABELS[tipo] || SISTEMA_LABELS.outro;
      sistemaHtml.push(`
        <a href="/tarefas.html" class="tarefas-drawer-grupo-row">
          <span class="tarefas-drawer-grupo-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </span>
          <span class="tarefas-drawer-grupo-text">
            <strong class="tarefas-drawer-grupo-count">${items.length}</strong> ${label}
          </span>
          <span class="tarefas-drawer-grupo-arrow" aria-hidden="true">→</span>
        </a>
      `);
    }
    parts.push(`<div class="tarefas-drawer-section">${sistemaHtml.join('')}</div>`);
  }

  // SEÇÃO 3 — OUTRAS MINHAS (só contagem inline)
  if (outras.length > 0) {
    parts.push(`
      <div class="tarefas-drawer-section">
        <a href="/tarefas.html" class="tarefas-drawer-grupo-row tarefas-drawer-grupo-row--secondary">
          <span class="tarefas-drawer-grupo-dot" aria-hidden="true"></span>
          <span class="tarefas-drawer-grupo-text">
            <strong class="tarefas-drawer-grupo-count">${outras.length}</strong> outra${outras.length !== 1 ? 's' : ''} tarefa${outras.length !== 1 ? 's' : ''} pessoa${outras.length !== 1 ? 'is' : 'l'}
          </span>
          <span class="tarefas-drawer-grupo-arrow" aria-hidden="true">→</span>
        </a>
      </div>
    `);
  }

  // FOOTER — link pra página completa
  parts.push(`
    <div class="tarefas-drawer-footer">
      <a href="/tarefas.html" class="tarefas-drawer-ver-todas">Ver todas as tarefas →</a>
    </div>
  `);

  setMarkup(body, parts.join(''));
  body.querySelectorAll('[data-tarefa-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => handleAction(e.currentTarget));
  });
}

// Renderiza tarefa urgente/atrasada como linha compacta com prazo inline.
// isAtrasadaSection=true muda o dot pra vermelho (atrasada sinaliza fail).
function renderTarefaUrgente(t, isAtrasadaSection = false) {
  // Mostra "sem prazo" só pras tarefas com prioridade alta que NÃO têm prazo
  // (aí o usuário entende por que está na seção urgente — não é por prazo)
  const showSemPrazo = !isAtrasadaSection && t.prioridade === 'alta'
    && diasAteISO(t?.metadata?.prazo) === null;
  const prazoStr = renderPrazoBadge(t, { showSemPrazo });

  let dotClass;
  if (isAtrasadaSection) {
    dotClass = 'tarefas-drawer-urgente-dot--atrasada';
  } else if (t.prioridade === 'alta') {
    dotClass = 'tarefas-drawer-urgente-dot--alta';
  } else {
    dotClass = 'tarefas-drawer-urgente-dot--normal';
  }

  return `
    <a href="/tarefas.html" class="tarefas-drawer-urgente" data-id="${t.id}">
      <span class="tarefas-drawer-urgente-dot ${dotClass}" aria-hidden="true"></span>
      <span class="tarefas-drawer-urgente-title">${escapeHtml(t.titulo)}</span>
      ${prazoStr}
    </a>
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
