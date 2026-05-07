// =============================================================
// FinFlow — Admin: Idiomas / i18n
// =============================================================
import { guardSession }                   from '../lib/auth.js';
import { initSidebar }                    from '../components/sidebar.js';
import { supabase }                       from '../lib/supabase.js';
import { showToast }                      from '../components/toast.js';
import { escapeHtml, formatDateBR }       from '../lib/utils.js';
import { loadStrings as loadTextos, applyTranslationsToDom } from '../lib/textos.js';

// ── Estado ────────────────────────────────────────────────────
let cachedStrings  = [];
let editingId      = null; // null = modo criar
let originalValues = {};   // snapshot do registro aberto
let csvParsedRows  = [];   // rows do CSV após parse

let filterSearch   = '';
let filterPagina   = '';
let filterCategoria = '';
let filterLang     = '';
let filterStatus   = '';

const LANGS = ['en', 'es', 'fr'];
const STATUS_LABELS = { ok: 'ok', pendente: 'pendente', desatualizado: 'desatualizado' };

// ── Init ──────────────────────────────────────────────────────
export async function init() {
  await loadStrings();
  bindEvents();
  renderTable();
}

// Standalone (admin-i18n.html acessado diretamente)
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('admin');
  await loadTextos();
  applyTranslationsToDom();
  await init();
});

// ── Dados ─────────────────────────────────────────────────────
async function loadStrings() {
  const { data, error } = await supabase
    .from('i18n_strings')
    .select('*')
    .order('pagina')
    .order('categoria')
    .order('chave');

  if (error) {
    showToast('Erro ao carregar strings: ' + error.message, 'error', 8000);
    document.getElementById('i18n-tbody').innerHTML =
      `<tr><td colspan="6" class="table-empty">Erro ao carregar dados.</td></tr>`;
    return;
  }

  cachedStrings = data || [];
  updateCount();
}

function updateCount() {
  const el = document.getElementById('i18n-count');
  el.textContent = cachedStrings.length;
  el.classList.remove('hidden');
}

// ── Filtros ───────────────────────────────────────────────────
function applyFilters() {
  const q = filterSearch.toLowerCase();
  return cachedStrings.filter((s) => {
    if (filterPagina    && s.pagina    !== filterPagina)    return false;
    if (filterCategoria && s.categoria !== filterCategoria) return false;

    if (filterStatus === 'aguardando_aprovacao') {
      if (s.aprovado !== false) return false;
    } else if (filterLang && filterStatus) {
      if (s[`status_${filterLang}`] !== filterStatus) return false;
    } else if (filterLang) {
      // only lang selected — show all statuses for that lang
    } else if (filterStatus) {
      const anyMatch = LANGS.some((l) => s[`status_${l}`] === filterStatus);
      if (!anyMatch) return false;
    }

    if (!q) return true;
    return (
      (s.chave   || '').toLowerCase().includes(q) ||
      (s.pt_br   || '').toLowerCase().includes(q) ||
      (s.en      || '').toLowerCase().includes(q) ||
      (s.es      || '').toLowerCase().includes(q) ||
      (s.fr      || '').toLowerCase().includes(q) ||
      (s.descricao || '').toLowerCase().includes(q)
    );
  });
}

// ── Tabela ────────────────────────────────────────────────────
function renderRow(s) {
  const langCells = LANGS.map((l) => {
    const status  = s[`status_${l}`] || 'pendente';
    const preview = (s[l] || '').slice(0, 50);
    return `<td>
      <div class="i18n-lang-cell">
        <span class="i18n-status-badge i18n-status-${status}">${status}</span>
        ${preview ? `<span class="i18n-lang-preview">${escapeHtml(preview)}</span>` : ''}
      </div>
    </td>`;
  }).join('');

  const ptPreview   = (s.pt_br || '').slice(0, 60);
  const isAtualizada = new Date(s.updated_at) - new Date(s.created_at) > 5000;
  const estadoBadge  = `<span class="i18n-status-badge i18n-status-${isAtualizada ? 'atualizada' : 'virgem'}">${isAtualizada ? 'atualizada' : 'virgem'}</span>`;

  const dateISO = isAtualizada ? s.updated_at : s.created_at;
  const dateObj = dateISO ? new Date(dateISO) : null;
  const dateVal = dateObj
    ? `${String(dateObj.getDate()).padStart(2,'0')}/${String(dateObj.getMonth()+1).padStart(2,'0')}/${dateObj.getFullYear()} ${String(dateObj.getHours()).padStart(2,'0')}:${String(dateObj.getMinutes()).padStart(2,'0')}`
    : '—';

  return `<tr class="adm-usr-row" data-id="${s.id}" tabindex="0" role="button">
    <td><div class="i18n-chave">${escapeHtml(s.codigo || '—')}</div></td>
    <td><div class="i18n-chave">${escapeHtml(s.chave)}</div></td>
    <td><div class="i18n-page-cat">${escapeHtml(s.pagina || '—')} · ${escapeHtml(s.categoria || '—')}</div></td>
    <td><div class="i18n-preview">${escapeHtml(ptPreview)}</div></td>
    ${langCells}
    <td>${estadoBadge}</td>
    <td><div style="font-size:var(--fs-xs);color:var(--color-text-secondary);white-space:nowrap">${escapeHtml(dateVal)}</div></td>
  </tr>`;
}

function groupHeader(label, count, mod) {
  return `<tr class="i18n-group-row i18n-group-row--${mod}">
    <td colspan="9">${escapeHtml(label)} <span class="i18n-group-count">${count}</span></td>
  </tr>`;
}

function renderTable() {
  const tbody = document.getElementById('i18n-tbody');
  const rows  = applyFilters();

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Nenhuma string encontrada.</td></tr>`;
    return;
  }

  const pendentes  = rows.filter((s) => s.aprovado === false);
  const aprovados  = rows.filter((s) => s.aprovado !== false);
  const parts = [];

  parts.push(groupHeader('Para Aprovação', pendentes.length, 'pending'));
  if (pendentes.length) {
    parts.push(...pendentes.map(renderRow));
  } else {
    parts.push(`<tr class="i18n-group-empty-row"><td colspan="9">Nenhuma string aguardando aprovação.</td></tr>`);
  }

  if (aprovados.length) {
    parts.push(groupHeader('Aprovados', aprovados.length, 'approved'));
    parts.push(...aprovados.map(renderRow));
  }

  tbody.innerHTML = parts.join('');

  tbody.querySelectorAll('.adm-usr-row').forEach((row) => {
    row.addEventListener('click',   () => openEditModal(row.dataset.id));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') openEditModal(row.dataset.id); });
  });
}

// ── Modal edição ──────────────────────────────────────────────
function openEditModal(id) {
  const s = cachedStrings.find((x) => x.id === id);
  if (!s) return;

  editingId      = id;
  originalValues = { ...s };

  document.getElementById('i18n-modal-chave').textContent = s.chave;
  document.getElementById('i18n-modal-meta').innerHTML =
    `${escapeHtml(s.pagina || '')} · ${escapeHtml(s.categoria || '')} · ${escapeHtml(s.visibilidade || '')}` +
    (s.codigo ? ` &nbsp;<span style="font-family:var(--font-mono,monospace);font-size:var(--fs-xs);color:var(--color-text-tertiary)">${escapeHtml(s.codigo)}</span>` : '');

  document.getElementById('i18n-create-form').classList.add('hidden');
  document.getElementById('i18n-history-section').classList.remove('hidden');
  document.getElementById('btn-aprovar-i18n').hidden = s.aprovado !== false;

  document.getElementById('i18n-edit-ptbr').value  = s.pt_br  || '';
  document.getElementById('i18n-edit-en').value    = s.en     || '';
  document.getElementById('i18n-edit-es').value    = s.es     || '';
  document.getElementById('i18n-edit-fr').value    = s.fr     || '';
  document.getElementById('i18n-edit-motivo').value = '';

  for (const lang of LANGS) {
    renderBadge(lang, s[`status_${lang}`] || 'pendente');
  }

  document.getElementById('modal-i18n').classList.remove('hidden');
  loadHistory(id);
}

function closeEditModal() {
  document.getElementById('modal-i18n').classList.add('hidden');
  editingId = null;
}

// ── Badges ────────────────────────────────────────────────────
function renderBadge(lang, status) {
  const el = document.getElementById(`i18n-badge-${lang}`);
  if (!el) return;
  el.className   = `i18n-status-badge i18n-status-${status}`;
  el.textContent = STATUS_LABELS[status] || status;
}

function computeLiveBadge(lang) {
  const val      = (document.getElementById(`i18n-edit-${lang}`)?.value || '').trim();
  const origPtBr = (originalValues.pt_br || '').trim();
  const curPtBr  = (document.getElementById('i18n-edit-ptbr')?.value || '').trim();
  const ptChanged = editingId && curPtBr !== origPtBr;

  if (!val) return 'pendente';
  if (editingId) {
    const origVal    = (originalValues[lang] || '').trim();
    const origStatus = originalValues[`status_${lang}`] || 'pendente';
    if (val !== origVal) return 'ok';
    if (ptChanged && origStatus === 'ok') return 'desatualizado';
    return origStatus;
  }
  return 'ok';
}

function refreshAllBadges() {
  for (const lang of LANGS) {
    renderBadge(lang, computeLiveBadge(lang));
  }
}

// ── Histórico ─────────────────────────────────────────────────
async function loadHistory(stringId) {
  const el = document.getElementById('i18n-history-list');
  el.innerHTML = `<span class="i18n-history-empty">Carregando…</span>`;

  const { data, error } = await supabase
    .from('i18n_historico')
    .select('*')
    .eq('string_id', stringId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error || !data?.length) {
    el.innerHTML = `<span class="i18n-history-empty">Sem alterações registradas.</span>`;
    return;
  }

  el.innerHTML = data.map((h) => {
    const date   = formatDateBR(h.created_at) || '';
    const campo  = escapeHtml(h.campo || '');
    const antes  = h.valor_antes ? `<em>"${escapeHtml(h.valor_antes.slice(0, 80))}"</em>` : '<em>(vazio)</em>';
    const depois = h.valor_depois ? `<em>"${escapeHtml(h.valor_depois.slice(0, 80))}"</em>` : '<em>(vazio)</em>';
    const motivo = h.motivo ? ` — <b>${escapeHtml(h.motivo)}</b>` : '';
    const autor  = h.alterado_por ? escapeHtml(h.alterado_por) : 'Admin';
    return `<div class="i18n-history-item">
      <b>${campo}</b>: ${antes} → ${depois}${motivo}
      <span style="float:right;color:var(--color-text-tertiary)">${autor} · ${date}</span>
    </div>`;
  }).join('');
}

// ── Salvar ────────────────────────────────────────────────────
async function saveString() {
  const btn     = document.getElementById('btn-save-i18n');
  const motivo  = (document.getElementById('i18n-edit-motivo').value || '').trim();
  const ptBr    = (document.getElementById('i18n-edit-ptbr').value || '').trim() || null;
  const en      = (document.getElementById('i18n-edit-en').value   || '').trim() || null;
  const es      = (document.getElementById('i18n-edit-es').value   || '').trim() || null;
  const fr      = (document.getElementById('i18n-edit-fr').value   || '').trim() || null;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  if (editingId) {
    await saveEdit({ pt_br: ptBr, en, es, fr }, motivo);
  } else {
    await saveCreate({ pt_br: ptBr, en, es, fr }, motivo);
  }

  btn.disabled = false;
  btn.textContent = 'Salvar';
}

async function saveEdit(updated, motivo, extras = {}) {
  const orig = originalValues;
  const ptChanged = (updated.pt_br || '') !== (orig.pt_br || '');

  // Compute new statuses
  const newStatuses = {};
  for (const lang of LANGS) {
    const newVal   = updated[lang] || '';
    const origVal  = orig[lang] || '';
    const origStat = orig[`status_${lang}`] || 'pendente';
    if (!newVal) {
      newStatuses[`status_${lang}`] = 'pendente';
    } else if (newVal !== origVal) {
      newStatuses[`status_${lang}`] = 'ok';
    } else if (ptChanged && origStat === 'ok') {
      newStatuses[`status_${lang}`] = 'desatualizado';
    } else {
      newStatuses[`status_${lang}`] = origStat;
    }
  }

  // `extras` permite ações combinadas (ex: aprovar + salvar)
  const payload = { ...updated, ...newStatuses, ...extras, updated_at: new Date().toISOString() };

  const { error } = await supabase
    .from('i18n_strings')
    .update(payload)
    .eq('id', editingId);

  if (error) {
    showToast('Erro ao salvar: ' + error.message, 'error', 8000);
    return;
  }

  // Registra histórico para cada campo alterado
  const { data: userData } = await supabase.auth.getUser();
  const autorEmail = userData?.user?.email || null;

  const histFields = ptChanged ? ['pt_br', ...LANGS] : LANGS;
  const histRows = histFields
    .filter((f) => (updated[f] || '') !== (orig[f] || ''))
    .map((f) => ({
      string_id:    editingId,
      campo:        f,
      valor_antes:  orig[f] || null,
      valor_depois: updated[f] || null,
      motivo:       motivo || null,
      alterado_por: autorEmail,
    }));

  if (histRows.length) {
    await supabase.from('i18n_historico').insert(histRows);
  }

  // Atualiza cache
  const idx = cachedStrings.findIndex((x) => x.id === editingId);
  if (idx !== -1) {
    cachedStrings[idx] = { ...cachedStrings[idx], ...payload };
  }

  showToast(extras.aprovado ? 'String aprovada e salva.' : 'String atualizada.', 'success');
  closeEditModal();
  renderTable();
}

async function saveCreate({ pt_br, en, es, fr }, _motivo) {
  const chave      = (document.getElementById('i18n-new-chave').value      || '').trim();
  const pagina     = (document.getElementById('i18n-new-pagina').value     || '').trim() || null;
  const categoria  = document.getElementById('i18n-new-categoria').value;
  const visibilidade = document.getElementById('i18n-new-visibilidade').value;
  const descricao  = (document.getElementById('i18n-new-descricao').value  || '').trim() || null;

  if (!chave) {
    showToast('Chave é obrigatória.', 'error');
    return;
  }

  const statusEn = en ? 'ok' : 'pendente';
  const statusEs = es ? 'ok' : 'pendente';
  const statusFr = fr ? 'ok' : 'pendente';

  const { data, error } = await supabase
    .from('i18n_strings')
    .insert({
      chave, pagina, categoria, visibilidade, descricao,
      pt_br, en, es, fr,
      status_en: statusEn, status_es: statusEs, status_fr: statusFr,
    })
    .select()
    .single();

  if (error) {
    showToast('Erro ao criar: ' + error.message, 'error', 8000);
    return;
  }

  cachedStrings.unshift(data);
  updateCount();
  showToast('String criada.', 'success');
  closeEditModal();
  renderTable();
}

// ── Aprovar string ────────────────────────────────────────────
async function approveString() {
  if (!editingId) return;
  const btn = document.getElementById('btn-aprovar-i18n');
  btn.disabled = true;
  btn.textContent = 'Aprovando…';

  // Aprovar = salvar valores atuais do form + marcar aprovado=true + fechar modal.
  // Reusa saveEdit pra registrar histórico, atualizar status por idioma e cache.
  const motivo = (document.getElementById('i18n-edit-motivo').value || '').trim();
  const ptBr   = (document.getElementById('i18n-edit-ptbr').value   || '').trim() || null;
  const en     = (document.getElementById('i18n-edit-en').value     || '').trim() || null;
  const es     = (document.getElementById('i18n-edit-es').value     || '').trim() || null;
  const fr     = (document.getElementById('i18n-edit-fr').value     || '').trim() || null;

  await saveEdit({ pt_br: ptBr, en, es, fr }, motivo, { aprovado: true });

  btn.disabled = false;
  btn.textContent = 'Aprovar string';
}

// ── Exportar CSV ──────────────────────────────────────────────
function exportCSV() {
  const cols = ['chave', 'pagina', 'categoria', 'visibilidade', 'descricao',
                'pt_br', 'en', 'es', 'fr', 'status_en', 'status_es', 'status_fr'];
  const lines = [cols.join(',')];

  for (const s of cachedStrings) {
    lines.push(cols.map((c) => csvCell(s[c] ?? '')).join(','));
  }

  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `finflow-i18n-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ── Importar CSV ──────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1)
    .map((line) => {
      const vals = splitCSVLine(line);
      const obj  = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
      return obj;
    })
    .filter((r) => r.chave);
}

function splitCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch   = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') { current += '"'; i++; }
    else if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function handleCSVFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const parsed = parseCSV(e.target.result);
    if (!parsed.length) {
      showToast('CSV vazio ou formato inválido.', 'error');
      return;
    }

    const keyMap = Object.fromEntries(cachedStrings.map((s) => [s.chave, s]));
    csvParsedRows = parsed.map((row) => ({
      ...row,
      _exists: !!keyMap[row.chave],
      _original: keyMap[row.chave] || null,
    }));

    renderCSVPreview();
    document.getElementById('csv-preview-wrap').classList.remove('hidden');
    document.getElementById('btn-confirm-csv').disabled = !csvParsedRows.some((r) => r._exists);
  };
  reader.readAsText(file, 'UTF-8');
}

function renderCSVPreview() {
  const tbody = document.getElementById('csv-preview-tbody');
  const found = csvParsedRows.filter((r) => r._exists).length;
  document.getElementById('csv-preview-count').textContent =
    `${csvParsedRows.length} linhas lidas — ${found} chaves encontradas no banco.`;

  tbody.innerHTML = csvParsedRows.map((row) => {
    const status = row._exists
      ? `<span class="i18n-status-badge i18n-status-ok">atualizar</span>`
      : `<span class="i18n-status-badge i18n-status-desatualizado">não encontrado</span>`;
    return `<tr>
      <td><div class="i18n-chave">${escapeHtml(row.chave)}</div></td>
      <td>${escapeHtml(row.en || '')}</td>
      <td>${escapeHtml(row.es || '')}</td>
      <td>${escapeHtml(row.fr || '')}</td>
      <td>${status}</td>
    </tr>`;
  }).join('');
}

async function confirmCSVImport() {
  const btn = document.getElementById('btn-confirm-csv');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Importando…';

  const toUpdate = csvParsedRows.filter((r) => r._exists && r._original);
  let ok = 0;
  let fail = 0;

  for (const row of toUpdate) {
    const en   = (row.en || '').trim() || null;
    const es   = (row.es || '').trim() || null;
    const fr   = (row.fr || '').trim() || null;

    const payload = {
      en, es, fr,
      status_en: en ? 'ok' : 'pendente',
      status_es: es ? 'ok' : 'pendente',
      status_fr: fr ? 'ok' : 'pendente',
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('i18n_strings')
      .update(payload)
      .eq('chave', row.chave);

    if (error) { fail++; continue; }
    ok++;

    // Atualiza cache local
    const idx = cachedStrings.findIndex((s) => s.chave === row.chave);
    if (idx !== -1) cachedStrings[idx] = { ...cachedStrings[idx], ...payload };
  }

  btn.disabled  = false;
  btn.textContent = 'Importar';
  closeCSVModal();

  if (fail) {
    showToast(`Importação: ${ok} ok, ${fail} erros.`, 'error', 8000);
  } else {
    showToast(`${ok} string${ok !== 1 ? 's' : ''} atualizada${ok !== 1 ? 's' : ''}.`, 'success');
  }

  renderTable();
}

function closeCSVModal() {
  document.getElementById('modal-csv-import').classList.add('hidden');
  document.getElementById('csv-preview-wrap').classList.add('hidden');
  document.getElementById('csv-file-input').value = '';
  csvParsedRows = [];
  document.getElementById('btn-confirm-csv').disabled = true;
}

// ── Eventos ───────────────────────────────────────────────────
function bindEvents() {
  // Filtros
  document.getElementById('i18n-search').addEventListener('input', (e) => {
    filterSearch = e.target.value;
    renderTable();
  });
  document.getElementById('i18n-filter-pagina').addEventListener('change', (e) => {
    filterPagina = e.target.value;
    renderTable();
  });
  document.getElementById('i18n-filter-categoria').addEventListener('change', (e) => {
    filterCategoria = e.target.value;
    renderTable();
  });
  document.getElementById('i18n-filter-lang').addEventListener('change', (e) => {
    filterLang = e.target.value;
    renderTable();
  });
  document.getElementById('i18n-filter-status').addEventListener('change', (e) => {
    filterStatus = e.target.value;
    renderTable();
  });

  // Botões header
  document.getElementById('btn-exportar-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-importar-csv').addEventListener('click', () => {
    document.getElementById('modal-csv-import').classList.remove('hidden');
  });

  // Modal edição — live badges
  document.getElementById('i18n-edit-ptbr').addEventListener('input', refreshAllBadges);
  for (const lang of LANGS) {
    document.getElementById(`i18n-edit-${lang}`).addEventListener('input', () => {
      renderBadge(lang, computeLiveBadge(lang));
    });
  }

  // Modal edição — fechar / salvar
  document.getElementById('btn-close-i18n').addEventListener('click', closeEditModal);
  document.getElementById('btn-cancel-i18n').addEventListener('click', closeEditModal);
  document.getElementById('modal-i18n').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-i18n')) closeEditModal();
  });
  document.getElementById('btn-save-i18n').addEventListener('click', saveString);
  document.getElementById('btn-aprovar-i18n').addEventListener('click', approveString);

  // Modal CSV
  document.getElementById('btn-close-csv').addEventListener('click', closeCSVModal);
  document.getElementById('btn-cancel-csv').addEventListener('click', closeCSVModal);
  document.getElementById('modal-csv-import').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-csv-import')) closeCSVModal();
  });

  const fileInput = document.getElementById('csv-file-input');
  document.getElementById('btn-choose-csv').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleCSVFile(file);
  });

  // Drag & drop na área de import
  const dropArea = document.getElementById('csv-drop-area');
  dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.classList.add('drag-over');
  });
  dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
  dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('drag-over');
    const file = e.dataTransfer.files?.[0];
    if (file) handleCSVFile(file);
  });

  document.getElementById('btn-confirm-csv').addEventListener('click', confirmCSVImport);

  // Esc fecha qualquer modal
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('modal-i18n').classList.contains('hidden'))        closeEditModal();
    if (!document.getElementById('modal-csv-import').classList.contains('hidden'))  closeCSVModal();
  });
}
