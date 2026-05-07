// =============================================================
// FinFlow — Admin Feedback (3 views: Triagem / Em andamento / Arquivo)
// Triagem  → tabela do status=novo, com filtros, busca, multi-select e bulk action
// Andamento → grid compacto do status=em_progresso (WIP baixo)
// Arquivo  → tabela buscável de feito + descartado
// =============================================================
import { guardSession } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { escapeHtml } from '../lib/utils.js';
import { CHANGELOG } from '../lib/changelog.js';
import { loadStrings, applyTranslationsToDom } from '../lib/textos.js';

let cachedFeedback = [];
let editingId      = null;
let pendingLinkId  = null;

let activeView = 'triagem';

// Filter state per view
let triagemFilters   = { tipo: 'todos', search: '' };
let andamentoFilters = { tipo: 'todos', search: '' };
let arquivoFilters   = { status: 'todos', search: '' };
let triagemSelected  = new Set();

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
  em_progresso: 'Em progresso',
  feito:        'Feito',
  agora_nao:    'Agora não',
};

export async function init() {
  populateChangelogSelects();
  bindEvents();
  await load();
}

// Standalone (admin-feedback.html acessado diretamente)
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('admin');
  await loadStrings();
  applyTranslationsToDom();
  await init();
});

function changelogOptionsHtml() {
  const options = ['<option value="">— sem vínculo —</option>'];
  for (const entry of CHANGELOG) {
    const label = entry.version
      ? `v${entry.version} · ${entry.title}`
      : `${entry.date} · ${entry.title}`;
    options.push(`<option value="${escapeHtml(entry.id)}">${escapeHtml(label)}</option>`);
  }
  return options.join('');
}

function populateChangelogSelects() {
  const html = changelogOptionsHtml();
  document.getElementById('modal-fb-changelog').innerHTML    = html;
  document.getElementById('link-changelog-select').innerHTML = html;
}

// -----------------------------
// Load
// -----------------------------
async function load() {
  const loading = document.getElementById('feedback-loading');
  loading.classList.remove('hidden');
  hideAllViews();

  const { data, error } = await supabase
    .from('feedback')
    .select('*, codigo')
    .order('priority', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  loading.classList.add('hidden');

  if (error) {
    showToast('Erro ao carregar: ' + error.message, 'error', 8000);
    return;
  }

  cachedFeedback = data || [];
  triagemSelected.clear();
  updateCounts();
  renderActiveView();
}

function hideAllViews() {
  document.querySelectorAll('.feedback-view').forEach((v) => v.classList.add('hidden'));
}

function updateCounts() {
  const counts = {
    triagem:   cachedFeedback.filter((f) => f.status === 'novo').length,
    andamento: cachedFeedback.filter((f) => f.status === 'em_analise' || f.status === 'em_progresso').length,
    arquivo:   cachedFeedback.filter((f) => f.status === 'feito' || f.status === 'agora_nao').length,
  };
  for (const [key, n] of Object.entries(counts)) {
    document.querySelector(`[data-count="${key}"]`).textContent = n;
  }
}

function renderActiveView() {
  hideAllViews();
  document.getElementById(`view-${activeView}`).classList.remove('hidden');

  if (activeView === 'triagem')   renderTriagem();
  if (activeView === 'andamento') renderAndamento();
  if (activeView === 'arquivo')   renderArquivo();
}

function setActiveView(view) {
  activeView = view;
  document.querySelectorAll('.feedback-view-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  renderActiveView();
}

// -----------------------------
// View: Triagem
// -----------------------------
function getTriagemItems() {
  let items = cachedFeedback.filter((f) => f.status === 'novo');
  if (triagemFilters.tipo !== 'todos') items = items.filter((f) => f.type === triagemFilters.tipo);
  if (triagemFilters.search) {
    const q = triagemFilters.search.toLowerCase();
    items = items.filter((f) =>
      (f.title || '').toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q)
    );
  }
  return items;
}

function renderTriagem() {
  const items = getTriagemItems();
  const tbody = document.getElementById('triagem-tbody');
  const empty = document.getElementById('triagem-empty');
  const wrap  = document.querySelector('#view-triagem .feedback-table-wrap');

  if (!items.length) {
    tbody.innerHTML = '';
    wrap.classList.add('hidden');
    empty.classList.remove('hidden');
  } else {
    tbody.innerHTML = items.map(renderTriagemRow).join('');
    wrap.classList.remove('hidden');
    empty.classList.add('hidden');
  }

  updateTriagemBulkBar();
  syncTriagemCheckAll();
}

function renderTriagemRow(fb) {
  const checked  = triagemSelected.has(fb.id) ? 'checked' : '';
  const criada   = new Date(fb.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const priorityCell = fb.priority
    ? `<span class="kanban-card-priority kanban-card-priority--${fb.priority}" title="${escapeHtml(fb.priority)}"></span> ${escapeHtml(fb.priority)}`
    : '<span class="ft-muted">—</span>';
  return `
    <tr data-id="${fb.id}" class="ft-row${triagemSelected.has(fb.id) ? ' ft-row--selected' : ''}">
      <td class="ft-td-check"><input type="checkbox" class="ft-check ft-row-check" data-row-check="${fb.id}" ${checked} aria-label="Selecionar"></td>
      <td class="ft-td-codigo"><span class="i18n-chave">${escapeHtml(fb.codigo || '—')}</span></td>
      <td><span class="feedback-type-pill feedback-type-pill--${fb.type}">${escapeHtml(TYPE_LABELS[fb.type] || fb.type)}</span></td>
      <td class="ft-td-title">${escapeHtml(fb.title)}</td>
      <td class="fb-col-desc">${escapeHtml(truncate(fb.description, 110))}</td>
      <td class="ft-td-submitter">${escapeHtml(submitterFor(fb))}</td>
      <td class="ft-td-date">${escapeHtml(criada)}</td>
      <td class="ft-td-date ft-muted">—</td>
      <td class="ft-td-priority">${priorityCell}</td>
      <td class="fb-col-retorno">${fb.resposta_usuario ? escapeHtml(truncate(fb.resposta_usuario, 80)) : '<span class="ft-muted">—</span>'}</td>
    </tr>
  `;
}

function updateTriagemBulkBar() {
  const bar   = document.getElementById('triagem-bulk-bar');
  const count = document.getElementById('triagem-bulk-count');
  const n = triagemSelected.size;
  if (n === 0) {
    bar.classList.add('hidden');
  } else {
    bar.classList.remove('hidden');
    count.textContent = `${n} selecionado${n > 1 ? 's' : ''}`;
  }
}

function syncTriagemCheckAll() {
  const items = getTriagemItems();
  const checkAll = document.getElementById('triagem-check-all');
  if (!items.length) { checkAll.checked = false; checkAll.indeterminate = false; return; }
  const allChecked  = items.every((f) => triagemSelected.has(f.id));
  const someChecked = items.some((f) => triagemSelected.has(f.id));
  checkAll.checked       = allChecked;
  checkAll.indeterminate = !allChecked && someChecked;
}

// -----------------------------
// View: Em andamento
// -----------------------------
function getAndamentoItems() {
  let items = cachedFeedback.filter((f) => f.status === 'em_analise' || f.status === 'em_progresso');
  if (andamentoFilters.tipo !== 'todos') items = items.filter((f) => f.type === andamentoFilters.tipo);
  if (andamentoFilters.search) {
    const q = andamentoFilters.search.toLowerCase();
    items = items.filter((f) =>
      (f.title || '').toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q)
    );
  }
  return items;
}

function renderAndamento() {
  const items = getAndamentoItems();
  const tbody = document.getElementById('andamento-tbody');
  const empty = document.getElementById('andamento-empty');
  const wrap  = document.querySelector('#view-andamento .feedback-table-wrap');

  if (!items.length) {
    tbody.innerHTML = '';
    wrap.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  wrap.classList.remove('hidden');
  tbody.innerHTML = items.map(renderAndamentoRow).join('');
}

function renderAndamentoRow(fb) {
  const criada = new Date(fb.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const priorityCell = fb.priority
    ? `<span class="kanban-card-priority kanban-card-priority--${fb.priority}" title="${escapeHtml(fb.priority)}"></span> ${escapeHtml(fb.priority)}`
    : '<span class="ft-muted">—</span>';
  return `
    <tr data-id="${fb.id}" class="ft-row">
      <td class="ft-td-codigo"><span class="i18n-chave">${escapeHtml(fb.codigo || '—')}</span></td>
      <td><span class="feedback-type-pill feedback-type-pill--${fb.type}">${escapeHtml(TYPE_LABELS[fb.type] || fb.type)}</span></td>
      <td class="ft-td-title">${escapeHtml(fb.title)}</td>
      <td class="fb-col-desc">${escapeHtml(truncate(fb.description, 110))}</td>
      <td class="ft-td-submitter">${escapeHtml(submitterFor(fb))}</td>
      <td class="ft-td-date">${escapeHtml(criada)}</td>
      <td class="ft-td-date ft-muted">—</td>
      <td class="ft-td-priority">${priorityCell}</td>
      <td class="fb-col-retorno">${fb.resposta_usuario ? escapeHtml(truncate(fb.resposta_usuario, 80)) : '<span class="ft-muted">—</span>'}</td>
    </tr>
  `;
}

// -----------------------------
// View: Arquivo
// -----------------------------
function getArquivoItems() {
  let items = cachedFeedback.filter((f) => f.status === 'feito' || f.status === 'agora_nao');
  if (arquivoFilters.status !== 'todos') items = items.filter((f) => f.status === arquivoFilters.status);
  if (arquivoFilters.search) {
    const q = arquivoFilters.search.toLowerCase();
    items = items.filter((f) =>
      (f.title || '').toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q)
    );
  }
  return items;
}

function renderArquivo() {
  const items = getArquivoItems();
  const tbody = document.getElementById('arquivo-tbody');
  const empty = document.getElementById('arquivo-empty');
  const wrap  = document.querySelector('#view-arquivo .feedback-table-wrap');

  if (!items.length) {
    tbody.innerHTML = '';
    wrap.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  wrap.classList.remove('hidden');
  empty.classList.add('hidden');
  tbody.innerHTML = items.map(renderArquivoRow).join('');
}

function renderArquivoRow(fb) {
  const criada     = new Date(fb.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const concluido  = fb.updated_at
    ? new Date(fb.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—';
  let changelogCell = '<span class="ft-muted">—</span>';
  if (fb.changelog_id) {
    const entry = CHANGELOG.find((e) => e.id === fb.changelog_id);
    if (entry) {
      changelogCell = `<span class="ft-changelog-link">v${escapeHtml(entry.version || '')} · ${escapeHtml(entry.title)}</span>`;
    }
  }
  return `
    <tr data-id="${fb.id}" class="ft-row">
      <td class="ft-td-codigo"><span class="i18n-chave">${escapeHtml(fb.codigo || '—')}</span></td>
      <td><span class="feedback-status-badge feedback-status-badge--${fb.status}">${escapeHtml(STATUS_LABELS[fb.status] || fb.status)}</span></td>
      <td><span class="feedback-type-pill feedback-type-pill--${fb.type}">${escapeHtml(TYPE_LABELS[fb.type] || fb.type)}</span></td>
      <td class="ft-td-title">${escapeHtml(fb.title)}</td>
      <td class="fb-col-desc">${escapeHtml(truncate(fb.description, 110))}</td>
      <td class="ft-td-submitter">${escapeHtml(submitterFor(fb))}</td>
      <td class="ft-td-date">${escapeHtml(criada)}</td>
      <td class="ft-td-date">${escapeHtml(concluido)}</td>
      <td class="fb-col-retorno">${fb.resposta_usuario ? escapeHtml(truncate(fb.resposta_usuario, 80)) : '<span class="ft-muted">—</span>'}</td>
      <td class="ft-td-changelog">${changelogCell}</td>
    </tr>
  `;
}

// -----------------------------
// History
// -----------------------------
const FIELD_LABELS_HIST = {
  status:           'Status',
  priority:         'Prioridade',
  resposta_usuario: 'Resposta',
  admin_notes:      'Notas internas',
  changelog_id:     'Vínculo',
};

async function loadHistory(feedbackId) {
  const container = document.getElementById('modal-fb-history');
  container.innerHTML = '<span class="spinner spinner-sm" style="display:block;margin:var(--space-3) 0"></span>';

  const { data, error } = await supabase
    .from('feedback_historico')
    .select('campo, valor_anterior, valor_novo, alterado_por, alterado_em')
    .eq('feedback_id', feedbackId)
    .order('alterado_em', { ascending: false });

  if (error || !data?.length) {
    container.innerHTML = '<p class="fb-history-empty">Nenhuma alteração registrada.</p>';
    return;
  }

  container.innerHTML = data.map(renderHistoryItem).join('');
}

function renderHistoryItem(h) {
  const dt      = new Date(h.alterado_em);
  const dateStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const field   = FIELD_LABELS_HIST[h.campo] || h.campo;
  const prev    = h.valor_anterior ?? '—';
  const next    = h.valor_novo     ?? '—';
  return `
    <div class="fb-history-item">
      <span class="fb-history-field">${escapeHtml(field)}</span>
      <span class="fb-history-change">${escapeHtml(prev)} → ${escapeHtml(next)}</span>
      <span class="fb-history-meta">${escapeHtml(h.alterado_por || 'Admin')} · ${escapeHtml(dateStr)} ${escapeHtml(timeStr)}</span>
    </div>`;
}

// -----------------------------
// Helpers
// -----------------------------
function submitterFor(fb) {
  if (fb.submitter_name)  return fb.submitter_name;
  if (fb.submitter_email) return fb.submitter_email;
  if (fb.user_id)         return 'Usuário logado';
  return 'Anônimo';
}

function truncate(text, n) {
  if (!text) return '';
  return text.length > n ? text.slice(0, n - 1) + '…' : text;
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// -----------------------------
// Events
// -----------------------------
function bindEvents() {
  // Tabs
  document.getElementById('feedback-views-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.feedback-view-tab');
    if (!tab) return;
    setActiveView(tab.dataset.view);
  });

  // Triagem: filters
  document.getElementById('triagem-tipo-filters').addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    document.querySelectorAll('#triagem-tipo-filters .filter-pill').forEach((p) => p.classList.toggle('active', p === pill));
    triagemFilters.tipo = pill.dataset.tipo;
    renderTriagem();
  });

  document.getElementById('triagem-search').addEventListener('input', debounce((e) => {
    triagemFilters.search = e.target.value.trim();
    renderTriagem();
  }, 200));

  // Triagem: select all
  document.getElementById('triagem-check-all').addEventListener('change', (e) => {
    const items = getTriagemItems();
    if (e.target.checked) items.forEach((f) => triagemSelected.add(f.id));
    else                  items.forEach((f) => triagemSelected.delete(f.id));
    renderTriagem();
  });

  // Triagem: row check + row click → modal
  document.getElementById('triagem-tbody').addEventListener('click', (e) => {
    const checkbox = e.target.closest('.ft-row-check');
    if (checkbox) {
      const id = checkbox.dataset.rowCheck;
      if (checkbox.checked) triagemSelected.add(id);
      else                  triagemSelected.delete(id);
      // Atualiza apenas o estado visual da linha sem re-renderizar tudo
      const row = checkbox.closest('tr');
      row.classList.toggle('ft-row--selected', checkbox.checked);
      updateTriagemBulkBar();
      syncTriagemCheckAll();
      return;
    }
    const row = e.target.closest('.ft-row');
    if (row) openEditModal(row.dataset.id);
  });

  // Triagem: bulk actions
  document.getElementById('triagem-bulk-bar').addEventListener('click', (e) => {
    const action = e.target.closest('[data-bulk-action]');
    if (action) return runBulkAction(action.dataset.bulkAction);
    if (e.target.id === 'triagem-bulk-clear') {
      triagemSelected.clear();
      renderTriagem();
    }
  });

  // Andamento: filters
  document.getElementById('andamento-tipo-filters').addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    document.querySelectorAll('#andamento-tipo-filters .filter-pill').forEach((p) => p.classList.toggle('active', p === pill));
    andamentoFilters.tipo = pill.dataset.tipo;
    renderAndamento();
  });

  document.getElementById('andamento-search').addEventListener('input', debounce((e) => {
    andamentoFilters.search = e.target.value.trim();
    renderAndamento();
  }, 200));

  // Andamento: row click → modal
  document.getElementById('andamento-tbody').addEventListener('click', (e) => {
    const row = e.target.closest('.ft-row');
    if (row) openEditModal(row.dataset.id);
  });

  // Arquivo: filters
  document.getElementById('arquivo-status-filters').addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    document.querySelectorAll('#arquivo-status-filters .filter-pill').forEach((p) => p.classList.toggle('active', p === pill));
    arquivoFilters.status = pill.dataset.status;
    renderArquivo();
  });

  document.getElementById('arquivo-search').addEventListener('input', debounce((e) => {
    arquivoFilters.search = e.target.value.trim();
    renderArquivo();
  }, 200));

  // Arquivo: row click → modal
  document.getElementById('arquivo-tbody').addEventListener('click', (e) => {
    const row = e.target.closest('.ft-row');
    if (row) openEditModal(row.dataset.id);
  });

  // Modal events (mantidos do design anterior)
  document.getElementById('btn-close-feedback').addEventListener('click', closeEditModal);
  document.getElementById('btn-feedback-cancel').addEventListener('click', closeEditModal);
  document.getElementById('modal-feedback').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditModal();
  });
  document.getElementById('btn-feedback-save').addEventListener('click', saveEdit);
  document.getElementById('btn-feedback-delete').addEventListener('click', openDeleteConfirm);

  document.getElementById('btn-close-confirm-delete').addEventListener('click', closeDeleteConfirm);
  document.getElementById('btn-confirm-delete-cancel').addEventListener('click', closeDeleteConfirm);
  document.getElementById('modal-confirm-delete').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDeleteConfirm();
  });
  document.getElementById('btn-confirm-delete-ok').addEventListener('click', confirmDelete);

  document.getElementById('btn-close-link-changelog').addEventListener('click', closeLinkChangelogModal);
  document.getElementById('btn-link-changelog-skip').addEventListener('click', closeLinkChangelogModal);
  document.getElementById('modal-link-changelog').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLinkChangelogModal();
  });
  document.getElementById('btn-link-changelog-save').addEventListener('click', saveLinkChangelog);
}

// -----------------------------
// Bulk actions (triagem)
// -----------------------------
async function runBulkAction(newStatus) {
  if (!triagemSelected.size) return;
  const ids = [...triagemSelected];
  const { error } = await supabase
    .from('feedback')
    .update({ status: newStatus })
    .in('id', ids);

  if (error) {
    showToast('Erro: ' + error.message, 'error', 8000);
    return;
  }

  showToast(`${ids.length} item(ns) movido(s).`, 'success');
  triagemSelected.clear();
  await load();
}

// -----------------------------
// Edit modal
// -----------------------------
function openEditModal(id) {
  const fb = cachedFeedback.find((f) => f.id === id);
  if (!fb) return;
  editingId = id;

  const date = new Date(fb.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  let submitterText = '';
  if (fb.submitter_name || fb.submitter_email) {
    const parts = [fb.submitter_name, fb.submitter_email].filter(Boolean);
    submitterText = `Enviado por ${parts.join(' · ')} (público)`;
  } else if (fb.user_id) {
    submitterText = 'Enviado por usuário logado';
  } else {
    submitterText = 'Enviado anonimamente';
  }

  document.getElementById('modal-fb-codigo').textContent = fb.codigo || '';

  const typeEl = document.getElementById('modal-fb-type');
  typeEl.textContent = TYPE_LABELS[fb.type] || fb.type;
  typeEl.className = `feedback-type-pill feedback-type-pill--${fb.type}`;

  const statusEl = document.getElementById('modal-fb-status');
  statusEl.textContent = STATUS_LABELS[fb.status] || fb.status;
  statusEl.className = `feedback-status-badge feedback-status-badge--${fb.status}`;

  document.getElementById('modal-fb-date').textContent        = date;
  document.getElementById('modal-fb-title').textContent       = fb.title;
  document.getElementById('modal-fb-submitter').textContent   = submitterText;
  document.getElementById('modal-fb-description').textContent = fb.description;

  document.getElementById('modal-fb-status-select').value   = fb.status;
  document.getElementById('modal-fb-priority-select').value = fb.priority || '';
  document.getElementById('modal-fb-resposta').value        = fb.resposta_usuario || '';
  document.getElementById('modal-fb-notes').value           = fb.admin_notes || '';
  document.getElementById('modal-fb-changelog').value       = fb.changelog_id || '';

  document.getElementById('modal-feedback').classList.remove('hidden');
  loadHistory(id);
}

function closeEditModal() {
  document.getElementById('modal-feedback').classList.add('hidden');
  editingId = null;
}

async function saveEdit() {
  if (!editingId) return;
  const fb = cachedFeedback.find((f) => f.id === editingId);
  const wasNotDone = fb && fb.status !== 'feito';

  const btn = document.getElementById('btn-feedback-save');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const newStatus      = document.getElementById('modal-fb-status-select').value;
  const newPriority    = document.getElementById('modal-fb-priority-select').value || null;
  const newResposta    = document.getElementById('modal-fb-resposta').value.trim() || null;
  const newNotes       = document.getElementById('modal-fb-notes').value.trim() || null;
  const newChangelogId = document.getElementById('modal-fb-changelog').value || null;

  const updates = {
    status:           newStatus,
    priority:         newPriority,
    resposta_usuario: newResposta,
    admin_notes:      newNotes,
    changelog_id:     newChangelogId,
  };

  const { error } = await supabase.from('feedback').update(updates).eq('id', editingId);

  btn.disabled = false;
  btn.textContent = 'Salvar';

  if (error) {
    showToast('Erro ao salvar: ' + error.message, 'error', 8000);
    return;
  }

  // Compute diffs and record history
  const diffs = [];
  if (newStatus !== fb.status) {
    diffs.push({ campo: 'status', valor_anterior: STATUS_LABELS[fb.status] || fb.status, valor_novo: STATUS_LABELS[newStatus] || newStatus });
  }
  if (newPriority !== (fb.priority || null)) {
    diffs.push({ campo: 'priority', valor_anterior: fb.priority || null, valor_novo: newPriority });
  }
  if (newResposta !== (fb.resposta_usuario || null)) {
    diffs.push({ campo: 'resposta_usuario', valor_anterior: truncate(fb.resposta_usuario || '', 80) || null, valor_novo: truncate(newResposta || '', 80) || null });
  }
  if (newNotes !== (fb.admin_notes || null)) {
    diffs.push({ campo: 'admin_notes', valor_anterior: truncate(fb.admin_notes || '', 80) || null, valor_novo: truncate(newNotes || '', 80) || null });
  }
  if (newChangelogId !== (fb.changelog_id || null)) {
    const prevEntry = fb.changelog_id  ? CHANGELOG.find((e) => e.id === fb.changelog_id) : null;
    const newEntry  = newChangelogId   ? CHANGELOG.find((e) => e.id === newChangelogId)  : null;
    diffs.push({ campo: 'changelog_id', valor_anterior: prevEntry ? `v${prevEntry.version} · ${prevEntry.title}` : null, valor_novo: newEntry ? `v${newEntry.version} · ${newEntry.title}` : null });
  }
  if (diffs.length) {
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || 'Admin';
    await supabase.from('feedback_historico').insert(
      diffs.map((d) => ({ feedback_id: editingId, ...d, alterado_por: email }))
    );
  }

  showToast('Salvo.', 'success');
  const justFinishedId = (newStatus === 'feito' && wasNotDone && !newChangelogId) ? editingId : null;
  closeEditModal();
  await load();

  if (justFinishedId) openLinkChangelogModal(justFinishedId);
}

// -----------------------------
// Delete
// -----------------------------
function openDeleteConfirm() {
  document.getElementById('modal-confirm-delete').classList.remove('hidden');
}

function closeDeleteConfirm() {
  document.getElementById('modal-confirm-delete').classList.add('hidden');
}

async function confirmDelete() {
  if (!editingId) return;
  const btn = document.getElementById('btn-confirm-delete-ok');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const { error } = await supabase.from('feedback').delete().eq('id', editingId);

  btn.disabled = false;
  btn.textContent = 'Excluir';

  if (error) {
    showToast('Erro ao excluir: ' + error.message, 'error', 8000);
    return;
  }

  showToast('Excluído.', 'success');
  closeDeleteConfirm();
  closeEditModal();
  await load();
}

// -----------------------------
// Link to changelog (drag-to-feito flow)
// -----------------------------
function openLinkChangelogModal(feedbackId) {
  pendingLinkId = feedbackId;
  document.getElementById('link-changelog-select').value = '';
  document.getElementById('modal-link-changelog').classList.remove('hidden');
}

function closeLinkChangelogModal() {
  document.getElementById('modal-link-changelog').classList.add('hidden');
  pendingLinkId = null;
}

async function saveLinkChangelog() {
  if (!pendingLinkId) return closeLinkChangelogModal();
  const changelogId = document.getElementById('link-changelog-select').value || null;
  if (!changelogId) return closeLinkChangelogModal();

  const btn = document.getElementById('btn-link-changelog-save');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const { error } = await supabase
    .from('feedback')
    .update({ changelog_id: changelogId })
    .eq('id', pendingLinkId);

  btn.disabled = false;
  btn.textContent = 'Vincular';

  if (error) {
    showToast('Erro ao vincular: ' + error.message, 'error', 8000);
    return;
  }

  showToast('Vinculado ao changelog.', 'success');
  closeLinkChangelogModal();
  await load();
}
