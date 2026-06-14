// =============================================================
// FinFlow — Página: Feedback (logado)
// Design alinhado com o Gerenciador de Sugestões.
// Mostra as próprias entradas + abre modal para nova entrada.
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { escapeHtml } from '../lib/utils.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';

let userId = null;
let todos  = [];   // todos os registros do usuário

// Filtros
let busca   = '';
let filTipo = '';
let grupo   = 'pendentes';   // visualização padrão = pendentes

// Cada "grupo" (widget/coluna Status) mapeia para 1+ status reais.
// null = sem filtro de status (todas).
const TAB_STATUSES = {
  todas:        null,
  pendentes:    ['novo', 'em_analise'],
  aprovadas:    ['aprovada'],
  em_progresso: ['em_progresso'],
  concluidas:   ['feito'],
  rejeitadas:   ['agora_nao'],
};


const TYPE_LABELS = {
  bug:      'Bug',
  sugestao: 'Sugestão',
  feature:  'Funcionalidade',
  pergunta: 'Pergunta',
  elogio:   'Elogio',
  parceria: 'Parceria',
};

const STATUS_LABELS = {
  novo:         'Novo',
  em_analise:   'Em análise',
  aprovada:     'Aprovada',
  em_progresso: 'Em progresso',
  feito:        'Feito',
  agora_nao:    'Agora não',
};

// Label mais descritivo para o modal de detalhe
const STATUS_LABELS_DETAIL = {
  ...STATUS_LABELS,
  aprovada: 'Aprovada para desenvolvimento',
};

// ─────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar(null);
  await loadStrings();
  applyTranslationsToDom();

  const user = await getCurrentUser();
  if (!user) return;
  userId = user.id;

  bindEvents();
  await loadMine();
});

// ─────────────────────────────────────────────────────────────
// Carregar dados
// ─────────────────────────────────────────────────────────────

async function loadMine() {
  showLoading(true);

  const { data, error } = await supabase
    .from('feedback')
    .select('id, codigo, type, title, description, status, created_at, updated_at, resposta_usuario')
    .eq('user_id', userId)
    .eq('origem', 'usuario')
    .order('created_at', { ascending: false });

  showLoading(false);

  if (error) {
    showToast('Erro ao carregar suas entradas: ' + error.message, 'error', 8000);
    return;
  }

  todos = data ?? [];
  renderAll();
}

// ─────────────────────────────────────────────────────────────
// Renderização
// ─────────────────────────────────────────────────────────────

function renderAll() {
  renderStats();
  renderTable();
}

function renderStats() {
  const total     = todos.length;
  const pendente  = todos.filter(i => ['novo', 'em_analise'].includes(i.status)).length;
  const aprovada  = todos.filter(i => i.status === 'aprovada').length;
  const progresso = todos.filter(i => i.status === 'em_progresso').length;
  const concluida = todos.filter(i => i.status === 'feito').length;
  const rejeitada = todos.filter(i => i.status === 'agora_nao').length;

  setText('fb-stat-total',    total);
  setText('fb-stat-pendente', pendente);
  setText('fb-stat-aprovada', aprovada);
  setText('fb-stat-progresso',progresso);
  setText('fb-stat-concluida',concluida);
  setText('fb-stat-rejeitada',rejeitada);
}

function getFiltered() {
  const statuses = TAB_STATUSES[grupo]; // null = todas
  return todos.filter(item => {
    if (statuses && !statuses.includes(item.status)) return false;
    if (filTipo  && item.type !== filTipo)           return false;
    if (busca) {
      const q = busca.toLowerCase();
      const hay = [item.codigo ?? '', item.title ?? '', item.description ?? ''].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// Troca o grupo ativo e sincroniza os dois pontos de entrada
// (widgets-botão e o dropdown no cabeçalho da coluna Status).
function setGrupo(g) {
  grupo = g;
  document.querySelectorAll('#fb-stats .dev-stats-card')
    .forEach(c => c.classList.toggle('is-active', c.dataset.group === g));
  // O cabeçalho da coluna sempre exibe "Status"; quem indica o grupo
  // ativo é o widget destacado. Por isso o select volta à opção-título.
  const sel = document.getElementById('fb-fil-status-grupo');
  if (sel) sel.selectedIndex = 0;
  renderTable();
}

// Realça o cabeçalho-filtro quando há um valor selecionado.
const markFilterState = (el) => el && el.classList.toggle('is-filtering', !!el.value);

function renderTable() {
  const filtered = getFiltered();
  const tbody    = document.getElementById('fb-tbody');
  const wrap     = document.getElementById('fb-table-wrap');
  const empty    = document.getElementById('fb-empty');

  if (!filtered.length) {
    wrap.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  wrap.classList.remove('hidden');

  tbody.innerHTML = filtered.map(item => {
    const typeLabel   = TYPE_LABELS[item.type]    ?? item.type   ?? '—';
    const statusLabel = STATUS_LABELS[item.status] ?? item.status ?? '—';
    const criada      = item.created_at
      ? new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '—';
    const retorno = item.resposta_usuario
      ? escapeHtml(truncate(item.resposta_usuario, 60))
      : '<span style="color:var(--color-text-tertiary)">—</span>';

    return `
      <tr class="dev-tr" data-id="${escapeHtml(item.id)}">
        <td class="dev-td dev-td-codigo" data-action="detail">${escapeHtml(item.codigo ?? '—')}</td>
        <td class="dev-td" data-action="detail">
          <span class="dev-tipo-pill dev-tipo-pill--${escapeHtml(item.type ?? '')}">${escapeHtml(typeLabel)}</span>
        </td>
        <td class="dev-td dev-td-titulo" data-action="detail">${escapeHtml(item.title ?? '—')}</td>
        <td class="dev-td fb-td-desc" data-action="detail">${escapeHtml(truncate(item.description, 80))}</td>
        <td class="dev-td" data-action="detail">
          <span class="feedback-status-badge feedback-status-badge--${escapeHtml(item.status ?? '')}">${escapeHtml(statusLabel)}</span>
        </td>
        <td class="dev-td fb-td-retorno" data-action="detail">${retorno}</td>
        <td class="dev-td fb-td-date" data-action="detail">${escapeHtml(criada)}</td>
      </tr>
    `;
  }).join('');
}

// ─────────────────────────────────────────────────────────────
// Eventos
// ─────────────────────────────────────────────────────────────

function bindEvents() {
  // Widgets-botão → trocam o grupo ativo
  document.getElementById('fb-stats').addEventListener('click', (e) => {
    const card = e.target.closest('.dev-stats-card');
    if (card?.dataset.group) setGrupo(card.dataset.group);
  });

  // Busca
  document.getElementById('fb-search').addEventListener('input', (e) => {
    busca = e.target.value.trim();
    renderTable();
  });

  // Dropdown no cabeçalho da coluna Tipo
  document.getElementById('fb-fil-tipo').addEventListener('change', (e) => {
    filTipo = e.target.value;
    markFilterState(e.target);
    renderTable();
  });

  // Dropdown no cabeçalho da coluna Status (sincroniza com os widgets)
  document.getElementById('fb-fil-status-grupo').addEventListener('change', (e) => {
    setGrupo(e.target.value);
  });

  // Limpar filtros → volta ao padrão (pendentes)
  document.getElementById('fb-btn-clear').addEventListener('click', () => {
    busca = filTipo = '';
    document.getElementById('fb-search').value = '';
    const tipoSel = document.getElementById('fb-fil-tipo');
    tipoSel.value = '';
    markFilterState(tipoSel);
    setGrupo('pendentes');
  });

  // Clique na linha → detalhe
  document.getElementById('fb-tbody').addEventListener('click', (e) => {
    const td = e.target.closest('td[data-action="detail"]');
    if (!td) return;
    const id = td.closest('tr')?.dataset.id;
    if (id) openDetailModal(id);
  });

  // Modal Nova entrada
  document.getElementById('btn-nova-entrada').addEventListener('click', openAddModal);
  document.getElementById('btn-close-fba').addEventListener('click',   closeAddModal);
  document.getElementById('btn-cancel-fba').addEventListener('click',  closeAddModal);
  document.getElementById('btn-save-fba').addEventListener('click',    saveAdd);
  document.getElementById('modal-fb-add').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAddModal();
  });

  // Modal Detalhe
  document.getElementById('btn-close-fbd').addEventListener('click',  closeDetailModal);
  document.getElementById('btn-cancel-fbd').addEventListener('click', closeDetailModal);
  document.getElementById('modal-fb-detail').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDetailModal();
  });

  // Escape fecha qualquer modal aberto
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeDetailModal();
    closeAddModal();
  });
}

// ─────────────────────────────────────────────────────────────
// Modal: Nova entrada
// ─────────────────────────────────────────────────────────────

function openAddModal() {
  document.getElementById('fba-titulo').value = '';
  document.getElementById('fba-desc').value   = '';
  const sug = document.querySelector('input[name="fba-type"][value="sugestao"]');
  if (sug) sug.checked = true;
  document.getElementById('modal-fb-add').classList.remove('hidden');
  document.getElementById('fba-titulo').focus();
}

function closeAddModal() {
  document.getElementById('modal-fb-add').classList.add('hidden');
}

async function saveAdd() {
  const type  = document.querySelector('input[name="fba-type"]:checked')?.value;
  const title = document.getElementById('fba-titulo').value.trim();
  const desc  = document.getElementById('fba-desc').value.trim();

  if (!type || !title || !desc) {
    showToast(t('feedback.validacao.campos_obrigatorios', 'Preencha todos os campos.'), 'warning');
    return;
  }

  const btn = document.getElementById('btn-save-fba');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const { data, error } = await supabase
    .from('feedback')
    .insert({ user_id: userId, type, title, description: desc, status: 'novo', origem: 'usuario' })
    .select()
    .single();

  btn.disabled = false;
  btn.textContent = 'Enviar';

  if (error) {
    showToast('Erro ao enviar: ' + error.message, 'error', 8000);
    return;
  }

  todos.unshift(data);
  renderAll();
  closeAddModal();
  showToast(t('feedback.toast.enviado', 'Enviado! Obrigado pelo feedback.'), 'success');
}

// ─────────────────────────────────────────────────────────────
// Modal: Detalhe
// ─────────────────────────────────────────────────────────────

function openDetailModal(id) {
  const item = todos.find(i => i.id === id);
  if (!item) return;

  const typeLabel   = TYPE_LABELS[item.type]           ?? item.type   ?? '—';
  const statusLabel = STATUS_LABELS_DETAIL[item.status] ?? item.status ?? '—';
  const date        = item.created_at
    ? new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  document.getElementById('fbd-codigo').textContent = item.codigo ?? '';
  document.getElementById('fbd-tipo-pill').innerHTML =
    `<span class="feedback-type-pill feedback-type-pill--${escapeHtml(item.type ?? '')}">${escapeHtml(typeLabel)}</span>`;
  document.getElementById('fbd-title').textContent = item.title ?? '';
  document.getElementById('fbd-desc').textContent  = item.description ?? '';

  document.getElementById('fbd-status').innerHTML =
    `<span class="feedback-status-badge feedback-status-badge--${escapeHtml(item.status ?? '')}">${escapeHtml(statusLabel)}</span>`;

  const retornoWrap = document.getElementById('fbd-retorno-wrap');
  if (item.resposta_usuario) {
    document.getElementById('fbd-retorno').textContent = item.resposta_usuario;
    retornoWrap.classList.remove('hidden');
  } else {
    retornoWrap.classList.add('hidden');
  }

  document.getElementById('fbd-date').textContent = `Enviado em ${date}`;
  document.getElementById('modal-fb-detail').classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('modal-fb-detail').classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function showLoading(on) {
  document.getElementById('fb-loading').classList.toggle('hidden', !on);
  document.getElementById('fb-table-wrap').classList.toggle('hidden', on);
  document.getElementById('fb-empty').classList.add('hidden');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function truncate(text, n) {
  if (!text) return '';
  return text.length > n ? text.slice(0, n - 1) + '…' : text;
}
