// =============================================================
// FinFlow — Página: Desenvolvimento (Rastreador de Sugestões)
// Tracker interno para planejamento de desenvolvimento.
// Trabalha sobre a tabela `feedback` com campos extras:
//   impacto, complexidade, modulo, notas, arquivos
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { escapeHtml } from '../lib/utils.js';
import { loadStrings, applyTranslationsToDom } from '../lib/textos.js';

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

const MODULOS = {
  dashboard:    'Dashboard',
  transacoes:   'Transações',
  pagamentos:   'Pagamentos',
  contas:       'Contas',
  compromissos: 'Compromissos',
  orcamento:    'Orçamento',
  dividas:      'Dívidas',
  investimentos:'Investimentos',
  relatorios:   'Relatórios',
  contatos:     'Contatos',
  importar:     'Importar extrato',
  perfil:       'Perfil & Configurações',
  admin:        'Admin',
  outros:       'Outros',
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

// Mapeamento de tab → statuses exibidos
const TAB_STATUSES = {
  pendentes:    ['novo', 'em_analise'],
  aprovadas:    ['aprovada'],
  em_progresso: ['em_progresso'],
  concluidas:   ['feito'],
  rejeitadas:   ['agora_nao'],
};

// ─────────────────────────────────────────────────────────────
// Estado global
// ─────────────────────────────────────────────────────────────

let todos          = [];   // todos os registros carregados
let currentUserId  = null;

// Filtros/navegação
let grupo      = 'pendentes'; // tab ativa
let busca      = '';
let filTipo    = '';
let filModulo  = '';
let filImpacto = '';
let filComplex = '';

// Controle de modais
let viewingId  = null;  // id do item em detalhe
let editingId  = null;  // id do item em edição
let addingNew  = false;

// Controle de dropdowns inline
let statusDropId = null;
let moduloDropId = null;

// Arquivos em edição (array de objetos {name, size, type, data:base64})
let editArquivos = [];

// ─────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('admin');
  await loadStrings();
  applyTranslationsToDom();

  const user = await getCurrentUser();
  currentUserId = user?.id ?? null;

  await loadFeedback();
  bindEvents();
});

// ─────────────────────────────────────────────────────────────
// Carregar dados
// ─────────────────────────────────────────────────────────────

async function loadFeedback() {
  showLoading(true);

  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false });

  showLoading(false);

  if (error) {
    showToast('Erro ao carregar sugestões: ' + error.message, 'error');
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
  renderTabBadges();
  renderTable();
}

function renderStats() {
  const total    = todos.length;
  const pendente = todos.filter(i => ['novo', 'em_analise'].includes(i.status)).length;
  const aprovada = todos.filter(i => i.status === 'aprovada').length;
  const progresso= todos.filter(i => i.status === 'em_progresso').length;
  const concluida= todos.filter(i => i.status === 'feito').length;
  const rejeitada= todos.filter(i => i.status === 'agora_nao').length;

  setText('stat-total',    total);
  setText('stat-pendente', pendente);
  setText('stat-aprovada', aprovada);
  setText('stat-progresso',progresso);
  setText('stat-concluida',concluida);
  setText('stat-rejeitada',rejeitada);
}

function renderTabBadges() {
  for (const [tab, statuses] of Object.entries(TAB_STATUSES)) {
    const count = todos.filter(i => statuses.includes(i.status)).length;
    setText(`tab-badge-${tab}`, count);
  }
}

function getFiltered() {
  const statuses = TAB_STATUSES[grupo] ?? [];

  return todos.filter(item => {
    // Tab
    if (!statuses.includes(item.status)) return false;

    // Busca
    if (busca) {
      const q = busca.toLowerCase();
      const haystack = [
        item.codigo ?? '',
        item.title ?? '',
        item.description ?? '',
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    // Filtros de select
    if (filTipo    && item.type         !== filTipo)    return false;
    if (filModulo  && item.modulo        !== filModulo)  return false;
    if (filImpacto && item.impacto       !== filImpacto) return false;
    if (filComplex && item.complexidade  !== filComplex) return false;

    return true;
  });
}

function renderTable() {
  const filtered = getFiltered();
  const tbody    = document.getElementById('dev-tbody');
  const wrap     = document.getElementById('dev-table-wrap');
  const empty    = document.getElementById('dev-empty');

  if (!filtered.length) {
    wrap.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  wrap.classList.remove('hidden');

  tbody.innerHTML = filtered.map(item => buildRow(item)).join('');
}

function buildRow(item) {
  const moduloLabel  = MODULOS[item.modulo] ?? item.modulo ?? '—';
  const typeLabel    = TYPE_LABELS[item.type] ?? item.type ?? '—';
  const statusLabel  = STATUS_LABELS[item.status] ?? item.status ?? '—';

  return `
    <tr class="dev-tr" data-id="${escapeHtml(item.id)}">
      <td class="dev-td dev-td-codigo" data-action="detail">${escapeHtml(item.codigo ?? '—')}</td>
      <td class="dev-td" data-action="detail">
        <span class="dev-tipo-pill dev-tipo-pill--${escapeHtml(item.type ?? '')}">${escapeHtml(typeLabel)}</span>
      </td>
      <td class="dev-td dev-td-titulo" data-action="detail">${escapeHtml(item.title ?? '—')}</td>
      <td class="dev-td dev-td-modulo" style="position:relative">
        <span class="dev-modulo-badge dev-modulo-clickable" data-modulo-drop="${escapeHtml(item.id)}">${escapeHtml(moduloLabel)}</span>
      </td>
      <td class="dev-td" data-action="detail">
        <span class="dev-impacto-badge dev-impacto-badge--${escapeHtml(item.impacto ?? '')}">${escapeHtml(item.impacto ?? '—')}</span>
      </td>
      <td class="dev-td" data-action="detail">
        <span class="dev-complex-badge dev-complex-badge--${escapeHtml((item.complexidade ?? '').replace(' ', '-'))}">${escapeHtml(item.complexidade ?? '—')}</span>
      </td>
      <td class="dev-td dev-td-status" style="position:relative">
        <span class="dev-status-badge dev-status-badge--${escapeHtml(item.status ?? '')} dev-status-clickable"
              data-status-drop="${escapeHtml(item.id)}">${escapeHtml(statusLabel)}</span>
      </td>
    </tr>
  `;
}

// ─────────────────────────────────────────────────────────────
// Eventos
// ─────────────────────────────────────────────────────────────

function bindEvents() {
  // ── Tabs ──────────────────────────────────────────────────
  document.getElementById('dev-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.dev-tab');
    if (!btn) return;
    grupo = btn.dataset.tab;
    document.querySelectorAll('.dev-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTable();
  });

  // ── Filtros ───────────────────────────────────────────────
  document.getElementById('dev-search').addEventListener('input', (e) => {
    busca = e.target.value.trim();
    renderTable();
  });
  document.getElementById('dev-fil-tipo').addEventListener('change', (e) => {
    filTipo = e.target.value;
    renderTable();
  });
  document.getElementById('dev-fil-modulo').addEventListener('change', (e) => {
    filModulo = e.target.value;
    renderTable();
  });
  document.getElementById('dev-fil-impacto').addEventListener('change', (e) => {
    filImpacto = e.target.value;
    renderTable();
  });
  document.getElementById('dev-fil-complex').addEventListener('change', (e) => {
    filComplex = e.target.value;
    renderTable();
  });
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    busca = filTipo = filModulo = filImpacto = filComplex = '';
    document.getElementById('dev-search').value = '';
    document.getElementById('dev-fil-tipo').value = '';
    document.getElementById('dev-fil-modulo').value = '';
    document.getElementById('dev-fil-impacto').value = '';
    document.getElementById('dev-fil-complex').value = '';
    renderTable();
  });

  // ── Tabela: cliques ───────────────────────────────────────
  document.getElementById('dev-tbody').addEventListener('click', (e) => {
    const td = e.target.closest('td');
    if (!td) return;
    const tr = td.closest('tr');
    const id = tr?.dataset.id;
    if (!id) return;

    // Dropdown de status
    if (e.target.closest('[data-status-drop]')) {
      const dropId = e.target.closest('[data-status-drop]').dataset.statusDrop;
      toggleStatusDrop(dropId, e.target.closest('[data-status-drop]'));
      return;
    }
    // Dropdown de módulo
    if (e.target.closest('[data-modulo-drop]')) {
      const dropId = e.target.closest('[data-modulo-drop]').dataset.moduloDrop;
      toggleModuloDrop(dropId, e.target.closest('[data-modulo-drop]'));
      return;
    }
    // Detalhe
    if (td.dataset.action === 'detail') {
      openDetailModal(id);
    }
  });

  // ── Fechar drops ao clicar fora ───────────────────────────
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.dev-inline-drop') &&
        !e.target.closest('[data-status-drop]') &&
        !e.target.closest('[data-modulo-drop]')) {
      closeAllDrops();
    }
  });

  // ── Exportar ──────────────────────────────────────────────
  document.getElementById('btn-export-csv').addEventListener('click', exportCsv);
  document.getElementById('btn-export-json').addEventListener('click', exportJson);

  // ── Nova sugestão ─────────────────────────────────────────
  document.getElementById('btn-nova-sugestao').addEventListener('click', openAddModal);

  // ── Modal Detalhe ─────────────────────────────────────────
  document.getElementById('btn-close-ddd').addEventListener('click',  closeDetailModal);
  document.getElementById('btn-cancel-ddd').addEventListener('click', closeDetailModal);
  document.getElementById('btn-edit-from-detail').addEventListener('click', () => {
    const id = viewingId;
    closeDetailModal();
    openEditModal(id);
  });
  document.getElementById('modal-dev-detail').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDetailModal();
  });

  // ── Modal Editar ──────────────────────────────────────────
  document.getElementById('btn-close-dde').addEventListener('click',  closeEditModal);
  document.getElementById('btn-cancel-dde').addEventListener('click', closeEditModal);
  document.getElementById('btn-save-dde').addEventListener('click',   saveEdit);
  document.getElementById('modal-dev-edit').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditModal();
  });

  // Upload de arquivos (editar)
  document.getElementById('dde-browse-btn').addEventListener('click', () => {
    document.getElementById('dde-file-input').click();
  });
  document.getElementById('dde-file-input').addEventListener('change', (e) => {
    handleFileSelect(e.target.files);
    e.target.value = '';
  });

  const uploadArea = document.getElementById('dde-upload-area');
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleFileSelect(e.dataTransfer.files);
  });

  // ── Modal Adicionar ───────────────────────────────────────
  document.getElementById('btn-close-dda').addEventListener('click',  closeAddModal);
  document.getElementById('btn-cancel-dda').addEventListener('click', closeAddModal);
  document.getElementById('btn-save-dda').addEventListener('click',   saveAdd);
  document.getElementById('modal-dev-add').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAddModal();
  });

  // ── Fechar modais com Escape ──────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (viewingId)  closeDetailModal();
    if (editingId)  closeEditModal();
    if (addingNew)  closeAddModal();
  });
}

// ─────────────────────────────────────────────────────────────
// Dropdowns inline: Status
// ─────────────────────────────────────────────────────────────

function toggleStatusDrop(id, anchor) {
  closeAllDrops();
  if (statusDropId === id) { statusDropId = null; return; }
  statusDropId = id;

  const drop = document.createElement('div');
  drop.className = 'dev-inline-drop';
  drop.id = 'status-drop-' + id;

  drop.innerHTML = Object.entries(STATUS_LABELS).map(([val, lbl]) => `
    <button type="button" class="dev-inline-drop-item dev-status-badge dev-status-badge--${val}" data-val="${val}">
      ${escapeHtml(lbl)}
    </button>
  `).join('');

  drop.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-val]');
    if (!btn) return;
    updateStatus(id, btn.dataset.val);
    closeAllDrops();
  });

  positionDrop(drop, anchor);
}

function toggleModuloDrop(id, anchor) {
  closeAllDrops();
  if (moduloDropId === id) { moduloDropId = null; return; }
  moduloDropId = id;

  const drop = document.createElement('div');
  drop.className = 'dev-inline-drop';
  drop.id = 'modulo-drop-' + id;

  drop.innerHTML = Object.entries(MODULOS).map(([val, lbl]) => `
    <button type="button" class="dev-inline-drop-item" data-val="${val}">
      ${escapeHtml(lbl)}
    </button>
  `).join('');

  drop.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-val]');
    if (!btn) return;
    updateModulo(id, btn.dataset.val);
    closeAllDrops();
  });

  positionDrop(drop, anchor);
}

function positionDrop(drop, anchor) {
  document.body.appendChild(drop);
  const rect = anchor.getBoundingClientRect();
  drop.style.position = 'fixed';
  drop.style.zIndex   = '9999';
  drop.style.minWidth = Math.max(rect.width, 160) + 'px';
  // Posiciona abaixo do anchor; se não couber, posiciona acima
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow >= 160 || spaceBelow >= drop.offsetHeight) {
    drop.style.top  = rect.bottom + 4 + 'px';
  } else {
    drop.style.top  = (rect.top - (drop.offsetHeight || 160) - 4) + 'px';
  }
  drop.style.left = rect.left + 'px';
}

function closeAllDrops() {
  document.querySelectorAll('.dev-inline-drop').forEach(d => d.remove());
  statusDropId = null;
  moduloDropId = null;
}

// ─────────────────────────────────────────────────────────────
// Actualizações optimistas
// ─────────────────────────────────────────────────────────────

async function updateStatus(id, newStatus) {
  // Optimistic
  const item = todos.find(i => i.id === id);
  if (!item) return;
  const oldStatus = item.status;
  item.status = newStatus;
  renderAll();

  const { error } = await supabase
    .from('feedback')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    item.status = oldStatus; // rollback
    renderAll();
    showToast('Erro ao atualizar status: ' + error.message, 'error');
    return;
  }

  showToast('Status atualizado.', 'success', 2000);
}

async function updateModulo(id, newModulo) {
  const item = todos.find(i => i.id === id);
  if (!item) return;
  const oldModulo = item.modulo;
  item.modulo = newModulo;
  renderAll();

  const { error } = await supabase
    .from('feedback')
    .update({ modulo: newModulo, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    item.modulo = oldModulo;
    renderAll();
    showToast('Erro ao atualizar módulo: ' + error.message, 'error');
    return;
  }

  showToast('Módulo atualizado.', 'success', 2000);
}

// ─────────────────────────────────────────────────────────────
// Modal: Detalhe
// ─────────────────────────────────────────────────────────────

function openDetailModal(id) {
  const item = todos.find(i => i.id === id);
  if (!item) return;
  viewingId = id;

  setText('ddd-codigo', item.codigo ?? '—');

  document.getElementById('ddd-tipo-pill').innerHTML =
    `<span class="dev-tipo-pill dev-tipo-pill--${escapeHtml(item.type ?? '')}">${escapeHtml(TYPE_LABELS[item.type] ?? item.type ?? '—')}</span>`;

  setText('ddd-title', item.title ?? '—');

  document.getElementById('ddd-desc').textContent = item.description ?? '—';

  document.getElementById('ddd-modulo').innerHTML =
    `<span class="dev-modulo-badge">${escapeHtml(MODULOS[item.modulo] ?? item.modulo ?? '—')}</span>`;

  document.getElementById('ddd-impacto').innerHTML =
    `<span class="dev-impacto-badge dev-impacto-badge--${escapeHtml(item.impacto ?? '')}">${escapeHtml(item.impacto ?? '—')}</span>`;

  document.getElementById('ddd-complex').innerHTML =
    `<span class="dev-complex-badge dev-complex-badge--${escapeHtml((item.complexidade ?? '').replace(' ', '-'))}">${escapeHtml(item.complexidade ?? '—')}</span>`;

  document.getElementById('ddd-status').innerHTML =
    `<span class="dev-status-badge dev-status-badge--${escapeHtml(item.status ?? '')}">${escapeHtml(STATUS_LABELS[item.status] ?? item.status ?? '—')}</span>`;

  const notasWrap = document.getElementById('ddd-notas-wrap');
  if (item.notas) {
    notasWrap.classList.remove('hidden');
    document.getElementById('ddd-notas').textContent = item.notas;
  } else {
    notasWrap.classList.add('hidden');
  }

  // Arquivos
  const arquivosWrap = document.getElementById('ddd-arquivos-wrap');
  const arquivos     = Array.isArray(item.arquivos) ? item.arquivos : [];
  if (arquivos.length) {
    arquivosWrap.classList.remove('hidden');
    document.getElementById('ddd-arquivos-list').innerHTML = arquivos.map(f => `
      <div class="dev-arquivo-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
        <a href="${escapeHtml(f.data ?? '#')}" download="${escapeHtml(f.name ?? 'arquivo')}"
           class="dev-arquivo-link">${escapeHtml(f.name ?? 'arquivo')}</a>
        <span class="dev-arquivo-size">${f.size ? formatBytes(f.size) : ''}</span>
      </div>
    `).join('');
  } else {
    arquivosWrap.classList.add('hidden');
  }

  const created = item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : '';
  setText('ddd-date', `Criado em ${created}`);

  document.getElementById('modal-dev-detail').classList.remove('hidden');
}

function closeDetailModal() {
  viewingId = null;
  document.getElementById('modal-dev-detail').classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────
// Modal: Editar
// ─────────────────────────────────────────────────────────────

function openEditModal(id) {
  const item = todos.find(i => i.id === id);
  if (!item) return;
  editingId    = id;
  editArquivos = Array.isArray(item.arquivos) ? [...item.arquivos] : [];

  document.getElementById('dde-modulo').value  = item.modulo       ?? 'outros';
  document.getElementById('dde-impacto').value = item.impacto      ?? 'Médio';
  document.getElementById('dde-complex').value = item.complexidade ?? 'Baixa';
  document.getElementById('dde-desc').value    = item.description  ?? '';
  document.getElementById('dde-notas').value   = item.notas        ?? '';

  renderFileList();
  document.getElementById('modal-dev-edit').classList.remove('hidden');
}

function closeEditModal() {
  editingId    = null;
  editArquivos = [];
  document.getElementById('modal-dev-edit').classList.add('hidden');
}

async function saveEdit() {
  if (!editingId) return;

  const modulo      = document.getElementById('dde-modulo').value;
  const impacto     = document.getElementById('dde-impacto').value;
  const complexidade= document.getElementById('dde-complex').value;
  const description = document.getElementById('dde-desc').value.trim();
  const notas       = document.getElementById('dde-notas').value.trim();

  const btn = document.getElementById('btn-save-dde');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const { data, error } = await supabase
    .from('feedback')
    .update({
      modulo,
      impacto,
      complexidade,
      description,
      notas,
      arquivos: editArquivos,
      updated_at: new Date().toISOString(),
    })
    .eq('id', editingId)
    .select()
    .single();

  btn.disabled = false;
  btn.textContent = 'Salvar';

  if (error) {
    showToast('Erro ao salvar: ' + error.message, 'error');
    return;
  }

  // Actualiza local
  const idx = todos.findIndex(i => i.id === editingId);
  if (idx !== -1) todos[idx] = data;

  renderAll();
  closeEditModal();
  showToast('Salvo com sucesso.', 'success');
}

// ─────────────────────────────────────────────────────────────
// Upload de arquivos (edit modal)
// ─────────────────────────────────────────────────────────────

function handleFileSelect(fileList) {
  const files = Array.from(fileList);
  let pending = files.length;
  if (pending === 0) return;

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      editArquivos.push({
        name: file.name,
        size: file.size,
        type: file.type,
        data: e.target.result, // base64 data URL
      });
      pending--;
      if (pending === 0) renderFileList();
    };
    reader.readAsDataURL(file);
  });
}

function renderFileList() {
  const list = document.getElementById('dde-file-list');
  if (!editArquivos.length) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = editArquivos.map((f, idx) => `
    <div class="dev-file-item">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
      <span class="dev-file-name">${escapeHtml(f.name)}</span>
      <span class="dev-file-size">${formatBytes(f.size)}</span>
      <button type="button" class="dev-file-remove" data-idx="${idx}" aria-label="Remover">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.dev-file-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.idx, 10);
      editArquivos.splice(i, 1);
      renderFileList();
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Modal: Adicionar nova sugestão
// ─────────────────────────────────────────────────────────────

function openAddModal() {
  addingNew = true;
  // Limpa campos
  document.getElementById('dda-titulo').value   = '';
  document.getElementById('dda-tipo').value     = 'sugestao';
  document.getElementById('dda-modulo').value   = 'outros';
  document.getElementById('dda-impacto').value  = 'Médio';
  document.getElementById('dda-complex').value  = 'Baixa';
  document.getElementById('dda-desc').value     = '';
  document.getElementById('modal-dev-add').classList.remove('hidden');
  document.getElementById('dda-titulo').focus();
}

function closeAddModal() {
  addingNew = false;
  document.getElementById('modal-dev-add').classList.add('hidden');
}

async function saveAdd() {
  const titulo = document.getElementById('dda-titulo').value.trim();
  if (!titulo) {
    showToast('Título é obrigatório.', 'warning');
    document.getElementById('dda-titulo').focus();
    return;
  }

  const tipo       = document.getElementById('dda-tipo').value;
  const modulo     = document.getElementById('dda-modulo').value;
  const impacto    = document.getElementById('dda-impacto').value;
  const complexidade=document.getElementById('dda-complex').value;
  const description= document.getElementById('dda-desc').value.trim();

  const btn = document.getElementById('btn-save-dda');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const { data, error } = await supabase
    .from('feedback')
    .insert({
      user_id:     currentUserId,
      type:        tipo,
      title:       titulo,
      description: description,
      status:      'novo',
      modulo,
      impacto,
      complexidade,
      notas:       '',
      arquivos:    [],
    })
    .select()
    .single();

  btn.disabled = false;
  btn.textContent = 'Criar';

  if (error) {
    showToast('Erro ao criar: ' + error.message, 'error');
    return;
  }

  todos.unshift(data);
  renderAll();
  closeAddModal();
  showToast('Sugestão criada!', 'success');
}

// ─────────────────────────────────────────────────────────────
// Exportação
// ─────────────────────────────────────────────────────────────

function exportCsv() {
  const headers = ['Código', 'Tipo', 'Título', 'Módulo', 'Impacto', 'Complexidade', 'Status', 'Notas'];
  const rows = todos.map(i => [
    i.codigo ?? '',
    TYPE_LABELS[i.type] ?? i.type ?? '',
    i.title ?? '',
    MODULOS[i.modulo] ?? i.modulo ?? '',
    i.impacto ?? '',
    i.complexidade ?? '',
    STATUS_LABELS[i.status] ?? i.status ?? '',
    (i.notas ?? '').replace(/\n/g, ' '),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`));

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadText(csv, 'finflow-desenvolvimento.csv', 'text/csv;charset=utf-8;');
  showToast('CSV exportado.', 'success', 2000);
}

function exportJson() {
  const json = JSON.stringify(todos, null, 2);
  downloadText(json, 'finflow-desenvolvimento.json', 'application/json');
  showToast('JSON exportado.', 'success', 2000);
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function showLoading(on) {
  document.getElementById('dev-loading').classList.toggle('hidden', !on);
  document.getElementById('dev-table-wrap').classList.toggle('hidden', on);
  document.getElementById('dev-empty').classList.add('hidden');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)         return bytes + ' B';
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
