// =============================================================
// FinFlow — Importar Extrato Bancário (Fase 5.A)
// CSV e Excel (.xlsx/.xls/.ods) via SheetJS CDN.
// Transações importadas ficam com reconciliacao_status='importado'
// e precisam ser confirmadas na página de Transações.
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { loadRules, findRule } from '../lib/regras-reconciliacao.js';
import { formatCurrency } from '../lib/compromissos-config.js';
import { escapeHtml } from '../lib/utils.js';
import { createContaPicker } from '../lib/conta-picker.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';

// ── State ─────────────────────────────────────────────────────
let rawRows      = [];   // todas as linhas parseadas (inclui header)
let headers      = [];   // nomes das colunas (após skipRows)
let dataRows     = [];   // linhas de dados após o header
let cachedContas        = [];
let cachedContatos      = [];
let cachedSubcategorias = [];
let cachedCategorias    = [];
let cachedRules         = [];
let selectedContaId     = '';
let previewData  = [];   // [{date, desc, tipo, valor, subId, contatoId}]

let colMap = {
  date:      '',
  desc:      '',
  id:        '',          // identificador único do banco (opcional)
  modo:      'single',    // 'single' | 'debitcredit'
  valor:     '',
  debito:    '',
  credito:   '',
  tipoFixed: '',          // '' | 'Receita' | 'Despesa'
  dateFmt:   'auto',
  skipRows:  0,
};

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('importar');
  initTutorial('importar');
  await loadStrings();
  applyTranslationsToDom();
  await loadData();
  bindStep1Events();
});

async function loadData() {
  const [contasRes, contatosRes, subRes, catRes] = await Promise.all([
    supabase.from('contas').select('id, nome, apelido, tipo, icone_cor, moeda').neq('status', 'arquivada').order('nome'),
    supabase.from('contatos').select('id, nome, nome_extrato').order('nome'),
    supabase.from('subcategorias').select('id, nome, apelido, categoria_id').neq('status', 'arquivada').order('nome'),
    supabase.from('categorias').select('id, nome, grupo').order('nome'),
  ]);
  cachedContas        = contasRes.data   || [];
  cachedContatos      = contatosRes.data || [];
  cachedSubcategorias = subRes.data      || [];
  cachedCategorias    = catRes.data      || [];
  cachedRules         = await loadRules();

  // Initialize conta picker
  const importContaPicker = createContaPicker({
    triggerBtnId: 'import-conta-btn',
    hiddenInputId: 'import-conta',
    avatarWrapId:  'import-conta-avatar-wrap',
    nameElId:      'import-conta-name',
    getContas:     () => cachedContas,
    placeholder:   'Selecione a conta…',
    allowBlank:    false,
  });
  importContaPicker.init();
}

// ── Step 1: Upload + Conta ────────────────────────────────────
function bindStep1Events() {
  const fileInput = document.getElementById('import-file');
  const dropZone  = document.getElementById('import-dropzone');
  const contaSel  = document.getElementById('import-conta');

  // Click na drop zone abre o file picker
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

  // Drag-and-drop
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('is-drag-over'); });
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('is-drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
  });

  contaSel.addEventListener('change', (e) => {
    selectedContaId = e.target.value;
    updateStep1NextBtn();
  });

  document.getElementById('step1-next').addEventListener('click', () => goToStep(2));
}

function updateStep1NextBtn() {
  document.getElementById('step1-next').disabled = !(rawRows.length > 0 && selectedContaId);
}

async function handleFileSelect(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  try {
    if (ext === 'csv' || ext === 'txt') {
      const text = await file.text();
      rawRows = parseCSV(text);
    } else if (['xlsx', 'xls', 'ods'].includes(ext)) {
      const ok = await loadSheetJs();
      if (!ok) {
        showToast(t('importar.toast.parser_falhou', 'Não foi possível carregar o parser Excel. Verifique sua conexão.'), 'error', 6000);
        return;
      }
      rawRows = await parseExcel(file);
    } else {
      showToast(t('importar.toast.formato_nao_suportado', 'Formato não suportado. Use CSV, XLSX ou XLS.'), 'error');
      return;
    }

    if (rawRows.length < 2) {
      showToast(t('importar.toast.arquivo_vazio', 'Arquivo vazio ou sem dados suficientes.'), 'error');
      rawRows = [];
      return;
    }

    autoDetectColumns(rawRows[0].map(String));

    // Atualiza status visual
    const statusEl = document.getElementById('import-file-status');
    document.getElementById('import-filename').textContent = file.name;
    document.getElementById('import-row-count').textContent = `${rawRows.length - 1} linhas`;
    statusEl.classList.remove('hidden');
    document.getElementById('import-dropzone').classList.add('has-file');

    updateStep1NextBtn();
  } catch (err) {
    console.error('[import] parse error', err);
    showToast('Erro ao ler o arquivo: ' + err.message, 'error', 8000);
    rawRows = [];
  }
}

// ── CSV Parser ────────────────────────────────────────────────
function parseCSV(text) {
  // Detecta delimitador: ponto-e-vírgula vs vírgula
  const sample = text.slice(0, 1000);
  const delim = (sample.split(';').length - 1) > (sample.split(',').length - 1) ? ';' : ',';

  const rows = [];
  let row = [], field = '', inQ = false;

  const pushField = () => { row.push(field.trim()); field = ''; };
  const pushRow   = () => { if (row.some((f) => f !== '')) rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if      (c === '"')  { inQ = true; }
      else if (c === delim){ pushField(); }
      else if (c === '\n' || (c === '\r' && n === '\n')) {
        if (c === '\r') i++;
        pushField(); pushRow();
      } else if (c === '\r') {
        pushField(); pushRow();
      } else {
        field += c;
      }
    }
  }
  pushField();
  pushRow();
  return rows;
}

// ── Excel Parser (SheetJS via CDN) ───────────────────────────
async function loadSheetJs() {
  if (window.XLSX) return true;
  showToast(t('importar.toast.carregando_sheetjs', 'Carregando SheetJS para ler Excel…'), 'info', 3000);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload  = () => resolve(true);
    s.onerror = () => { showToast('Falha ao carregar SheetJS — verifique sua conexão', 'error', 6000); resolve(false); };
    document.head.appendChild(s);
  });
}

async function parseExcel(file) {
  const buf = await file.arrayBuffer();
  const wb  = window.XLSX.read(buf, { type: 'array', cellDates: false });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  return raw.map((row) => row.map((cell) => String(cell ?? '').trim()));
}

// ── Auto-detect columns ───────────────────────────────────────
function autoDetectColumns(hdrs) {
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const h = hdrs.map(norm);

  const find = (...keys) => {
    for (const k of keys) {
      const i = h.findIndex((hh) => hh.includes(k));
      if (i !== -1) return String(i);
    }
    return '';
  };

  colMap.date = find('data', 'date', 'dt lançamento', 'dt.lanc', 'vencimento', 'lançamento');
  colMap.desc = find('histórico', 'historico', 'descricao', 'descrição', 'memo', 'complemento', 'titulo', 'título', 'lançamento');
  colMap.id   = find('identificador', 'id transação', 'id transacao', 'num doc', 'documento', 'cod transacao', 'cod.transacao', 'nsu', 'número doc', 'numero doc');

  const debIdx = find('débito', 'debito', 'saída', 'saida', 'debit');
  const creIdx = find('crédito', 'credito', 'entrada', 'credit');
  if (debIdx !== '' && creIdx !== '' && debIdx !== creIdx) {
    colMap.modo   = 'debitcredit';
    colMap.debito  = debIdx;
    colMap.credito = creIdx;
  } else {
    colMap.modo  = 'single';
    colMap.valor = find('valor', 'value', 'montante', 'amount', 'crédito', 'credito', 'débito', 'debito');
  }
}

// ── Step 2: Mapeamento de colunas ─────────────────────────────
function renderStep2() {
  const skip = Number(colMap.skipRows) || 0;
  headers  = (rawRows[skip] || []).map(String);
  dataRows = rawRows.slice(skip + 1).filter((r) => r.some((c) => c !== ''));

  ['step2-col-date', 'step2-col-desc', 'step2-col-id', 'step2-col-valor', 'step2-col-debito', 'step2-col-credito'].forEach((elId) => {
    const el = document.getElementById(elId);
    if (el) {
      // Identificador é opcional — adiciona opção vazia extra
      el.innerHTML = (elId === 'step2-col-id'
        ? '<option value="">— Não usar —</option>'
        : '<option value="">— Selecionar —</option>')
        + headers.map((h, i) => `<option value="${i}">${escapeHtml(h) || `Coluna ${i + 1}`}</option>`).join('');
    }
  });

  // Aplica valores auto-detectados
  if (colMap.date)  document.getElementById('step2-col-date').value  = colMap.date;
  if (colMap.desc)  document.getElementById('step2-col-desc').value  = colMap.desc;
  if (colMap.id)    document.getElementById('step2-col-id')?.value   !== undefined && (document.getElementById('step2-col-id').value = colMap.id);

  if (colMap.modo === 'debitcredit') {
    document.getElementById('modo-debitcredit').checked = true;
    if (colMap.debito)  document.getElementById('step2-col-debito').value  = colMap.debito;
    if (colMap.credito) document.getElementById('step2-col-credito').value = colMap.credito;
  } else {
    document.getElementById('modo-single').checked = true;
    if (colMap.valor) document.getElementById('step2-col-valor').value = colMap.valor;
  }

  updateModoVisibility();
  refreshRawPreview();
  bindStep2Events();
}

function refreshRawPreview() {
  const skip    = Number(document.getElementById('step2-skip').value) || 0;
  const hdrs    = (rawRows[skip] || []).map(String);
  const preview = rawRows.slice(skip + 1, skip + 6);

  const thead = `<thead><tr>${hdrs.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${preview.map((row) =>
    `<tr>${row.map((c) => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`
  ).join('')}</tbody>`;
  document.getElementById('step2-raw-preview').innerHTML = thead + tbody;
}

function updateModoVisibility() {
  const isSingle = document.querySelector('[name="valor-modo"]:checked')?.value === 'single';
  document.getElementById('step2-single-fields').classList.toggle('hidden', !isSingle);
  document.getElementById('step2-dc-fields').classList.toggle('hidden', isSingle);
}

function bindStep2Events() {
  document.querySelectorAll('[name="valor-modo"]').forEach((r) => {
    r.addEventListener('change', updateModoVisibility);
  });

  document.getElementById('step2-skip').addEventListener('change', refreshRawPreview);

  document.getElementById('step2-back').addEventListener('click', () => goToStep(1));

  document.getElementById('step2-next').addEventListener('click', async () => {
    // Lê mapeamento da UI
    colMap.skipRows  = Number(document.getElementById('step2-skip').value) || 0;
    colMap.date      = document.getElementById('step2-col-date').value;
    colMap.desc      = document.getElementById('step2-col-desc').value;
    colMap.id        = document.getElementById('step2-col-id')?.value || '';
    colMap.dateFmt   = document.getElementById('step2-date-fmt').value;
    colMap.modo      = document.querySelector('[name="valor-modo"]:checked')?.value || 'single';

    if (colMap.modo === 'single') {
      colMap.valor     = document.getElementById('step2-col-valor').value;
      colMap.tipoFixed = document.getElementById('step2-tipo-fixed').value;
    } else {
      colMap.debito  = document.getElementById('step2-col-debito').value;
      colMap.credito = document.getElementById('step2-col-credito').value;
    }

    if (!colMap.date || !colMap.desc) {
      showToast('Selecione pelo menos a coluna de Data e a de Descrição.', 'error'); return;
    }
    if (colMap.modo === 'single' && !colMap.valor) {
      showToast('Selecione a coluna de Valor.', 'error'); return;
    }
    if (colMap.modo === 'debitcredit' && (!colMap.debito || !colMap.credito)) {
      showToast('Selecione as colunas de Débito e Crédito.', 'error'); return;
    }

    processRows();
    await applyBancoDescSuggestions();
    goToStep(3);
  });
}

// ── Processar linhas ──────────────────────────────────────────
function processRows() {
  const skip = Number(colMap.skipRows) || 0;
  headers  = (rawRows[skip] || []).map(String);
  dataRows = rawRows.slice(skip + 1).filter((r) => r.some((c) => c !== ''));

  previewData = [];

  for (const row of dataRows) {
    const dateStr  = String(row[Number(colMap.date)] ?? '');
    const descStr  = String(row[Number(colMap.desc)] ?? '').trim();
    const bancoId  = colMap.id !== '' ? String(row[Number(colMap.id)] ?? '').trim() || null : null;
    const isoDate  = parseDate(dateStr, colMap.dateFmt);
    if (!isoDate || !descStr) continue;

    let tipo, valor;

    if (colMap.modo === 'single') {
      const raw = parseValue(row[Number(colMap.valor)] ?? '');
      if (raw === null) continue;
      if      (colMap.tipoFixed === 'Receita')  { tipo = 'Receita'; valor = Math.abs(raw); }
      else if (colMap.tipoFixed === 'Despesa')  { tipo = 'Despesa'; valor = Math.abs(raw); }
      else { tipo = raw >= 0 ? 'Receita' : 'Despesa'; valor = Math.abs(raw); }
    } else {
      const deb = parseValue(row[Number(colMap.debito)]  ?? '');
      const cre = parseValue(row[Number(colMap.credito)] ?? '');
      if (cre && Math.abs(cre) > 0)      { tipo = 'Receita'; valor = Math.abs(cre); }
      else if (deb && Math.abs(deb) > 0) { tipo = 'Despesa'; valor = Math.abs(deb); }
      else continue;
    }

    if (valor <= 0) continue;

    const { contatoId, subId } = suggestForDescription(descStr);
    previewData.push({ date: isoDate, desc: descStr, bancoId, tipo, valor, subId, contatoId });
  }
}

// Fallback: match via campo "Nome no extrato" cadastrado no contato
function suggestForDescription(desc) {
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const dNorm = norm(desc);

  for (const c of cachedContatos) {
    if (!c.nome_extrato) continue;
    const ext = norm(c.nome_extrato);
    if (!ext) continue;
    if (dNorm.includes(ext) || (ext.length >= 6 && ext.includes(dNorm.slice(0, 8)))) {
      const rule = findRule(cachedRules, c.id);
      return { contatoId: c.id, subId: rule?.subcategoria_id || null };
    }
  }
  return { contatoId: null, subId: null };
}

// Normaliza banco_desc para matching: remove códigos, datas, sufixos numéricos
// Ex: "UBER *TRIP 2024-05-01 XJ3K" → "UBER TRIP"
function normalizeBancoDesc(desc) {
  return (desc || '')
    .toUpperCase()
    .replace(/\d{4}[-\/]\d{2}[-\/]\d{2}/g, '')   // remove datas ISO
    .replace(/\d{2}[-\/]\d{2}[-\/]\d{4}/g, '')   // remove datas BR
    .replace(/\b[A-Z0-9]{6,}\b/g, (m) => /[0-9]{3,}/.test(m) ? '' : m)  // remove IDs com números
    .replace(/[*#@\-_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 60);
}

// Carrega sugestões de reconciliações anteriores para uma lista de banco_descs.
// Tenta matching exato primeiro; se não achar, tenta via descrição normalizada.
async function loadBancoDescSuggestions(descs) {
  if (!descs.length) return new Map();

  const normDescs = [...new Set(descs.map(normalizeBancoDesc).filter(Boolean))];
  const allDescs  = [...new Set([...descs, ...normDescs])];

  // Consulta em paralelo: histórico direto de transações + histórico de contatos
  const [{ data: txData }, { data: cdbData }] = await Promise.all([
    supabase
      .from('transacoes')
      .select('banco_desc, contato_id, subcategoria_id')
      .in('banco_desc', allDescs)
      .not('contato_id', 'is', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('contato_banco_descs')
      .select('banco_desc, contato_id, last_subcategoria_id')
      .in('banco_desc', allDescs),
  ]);

  const map = new Map();

  // Prioridade 1: match direto em transações já reconciliadas (tem subcategoria precisa)
  for (const row of (txData || [])) {
    if (!map.has(row.banco_desc)) {
      map.set(row.banco_desc, { contatoId: row.contato_id, subId: row.subcategoria_id });
    }
  }

  // Prioridade 2: histórico de contato_banco_descs (cobre banco_descs novos já vistos em outros contextos)
  for (const row of (cdbData || [])) {
    if (!map.has(row.banco_desc)) {
      map.set(row.banco_desc, { contatoId: row.contato_id, subId: row.last_subcategoria_id });
    }
  }

  return map;
}

// Aplica sugestões de banco_desc ao previewData.
// Prioridade: (1) match exato no histórico → (2) match normalizado no histórico → (3) nome_extrato
async function applyBancoDescSuggestions() {
  const descs    = [...new Set(previewData.map((r) => r.desc).filter(Boolean))];
  const bancoMap = await loadBancoDescSuggestions(descs);

  for (const row of previewData) {
    const hist = bancoMap.get(row.desc) || bancoMap.get(normalizeBancoDesc(row.desc));
    if (hist) {
      row.contatoId    = hist.contatoId;
      row.subId        = hist.subId;
      row.isRecognized = true;
    } else {
      // Fallback: nome_extrato do contato
      const fallback   = suggestForDescription(row.desc);
      row.contatoId    = fallback.contatoId;
      row.subId        = fallback.subId;
      row.isRecognized = false;
    }
  }
}

// ── Parse helpers ─────────────────────────────────────────────
function parseDate(str, fmt) {
  str = (str || '').trim().replace(/^'/, '');
  if (!str) return null;

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = str.slice(0, 10);
    return isNaN(new Date(d)) ? null : d;
  }

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    let day, month;
    if (fmt === 'mdy') { month = Number(a); day = Number(b); }
    else               { day = Number(a);   month = Number(b); }
    const iso = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return isNaN(new Date(iso)) ? null : iso;
  }
  return null;
}

function parseValue(str) {
  if (str === null || str === undefined) return null;
  str = String(str).trim().replace(/[R$\s]/g, '').replace(/−/g, '-').replace(/–/g, '-');
  if (!str || str === '-') return null;

  const lastDot   = str.lastIndexOf('.');
  const lastComma = str.lastIndexOf(',');
  let normalized;

  if (lastComma > lastDot) {
    // Formato brasileiro: 1.234,56
    normalized = str.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Formato internacional: 1,234.56
    normalized = str.replace(/,/g, '');
  } else {
    // Sem separadores ou só um tipo
    normalized = str.replace(',', '.');
  }

  const v = parseFloat(normalized);
  return isNaN(v) ? null : v;
}

// ── Step 3: Prévia + Importar ─────────────────────────────────
function renderStep3() {
  const subOpts      = buildSubOpts();
  const contatoOpts  = buildContatoOpts();
  const recognized   = previewData.filter((r) => r.isRecognized).length;

  document.getElementById('step3-count').textContent =
    `${previewData.length} transaç${previewData.length === 1 ? 'ão' : 'ões'} encontradas`
    + (recognized > 0 ? ` · ${recognized} reconhecida${recognized > 1 ? 's' : ''} automaticamente` : '');

  if (previewData.length === 0) {
    document.getElementById('step3-tbody').innerHTML =
      `<tr><td colspan="8" class="text-center" style="color:var(--color-text-muted); padding:var(--space-6)">
         Nenhuma linha válida encontrada. Verifique o mapeamento de colunas.
       </td></tr>`;
    document.getElementById('step3-import').disabled = true;
    return;
  }

  document.getElementById('step3-tbody').innerHTML = previewData.map((row, i) => {
    const tipoCls   = row.tipo === 'Receita' ? 'dre-positive' : 'dre-negative';
    const tipoSel   = `<select class="input input-sm preview-tipo" data-idx="${i}">
      <option value="Despesa" ${row.tipo === 'Despesa' ? 'selected' : ''}>Despesa</option>
      <option value="Receita" ${row.tipo === 'Receita' ? 'selected' : ''}>Receita</option>
    </select>`;
    const subSel      = `<select class="input input-sm preview-sub" data-idx="${i}">${subOpts}</select>`;
    const contatoSel  = `<select class="input input-sm preview-contato" data-idx="${i}">${contatoOpts}</select>`;
    const recBadge    = row.isRecognized
      ? `<span class="import-recognized-badge" title="Reconhecido por histórico de reconciliações">✓</span>`
      : '';

    const descDisplay = row.desc.length > 45 ? row.desc.slice(0, 45) + '…' : row.desc;
    const idDisplay   = row.bancoId
      ? `<span class="preview-banco-id" title="${escapeHtml(row.bancoId)}">${escapeHtml(row.bancoId.length > 14 ? row.bancoId.slice(0, 14) + '…' : row.bancoId)}</span>`
      : '<span class="preview-id-empty">—</span>';

    return `<tr class="${row.isRecognized ? 'preview-row--recognized' : ''}">
      <td class="preview-check-cell"><input type="checkbox" class="preview-row-check" data-idx="${i}" checked></td>
      <td class="tabular" style="white-space:nowrap">${row.date}</td>
      <td>${idDisplay}</td>
      <td class="preview-banco-cell">${recBadge}<span title="${escapeHtml(row.desc)}">${escapeHtml(descDisplay)}</span></td>
      <td class="preview-contato-cell">${contatoSel}</td>
      <td>${tipoSel}</td>
      <td class="tabular text-right ${tipoCls}">${formatCurrency(row.valor, 'BRL')}</td>
      <td>${subSel}</td>
    </tr>`;
  }).join('');

  // Pré-seleciona contato e subcategoria sugeridos
  previewData.forEach((row, i) => {
    if (row.contatoId) {
      const sel = document.querySelector(`.preview-contato[data-idx="${i}"]`);
      if (sel) sel.value = row.contatoId;
    }
    if (row.subId) {
      const sel = document.querySelector(`.preview-sub[data-idx="${i}"]`);
      if (sel && Array.from(sel.options).some((o) => o.value === row.subId)) {
        sel.value = row.subId;
      }
    }
  });

  // Eventos do step 3
  const selectAll = document.getElementById('step3-select-all');
  const fresh = selectAll.cloneNode(true);
  selectAll.parentNode.replaceChild(fresh, selectAll);
  fresh.addEventListener('change', (e) => {
    document.querySelectorAll('.preview-row-check').forEach((cb) => { cb.checked = e.target.checked; });
    updateImportBtn();
  });

  document.getElementById('step3-tbody').addEventListener('change', updateImportBtn);
  document.getElementById('step3-back').addEventListener('click', () => goToStep(2));

  const importBtn = document.getElementById('step3-import');
  const freshBtn  = importBtn.cloneNode(true);
  importBtn.parentNode.replaceChild(freshBtn, importBtn);
  freshBtn.addEventListener('click', doImport);

  updateImportBtn();
}

function buildSubOpts() {
  const byCat = new Map();
  for (const sub of cachedSubcategorias) {
    const arr = byCat.get(sub.categoria_id) || [];
    arr.push(sub);
    byCat.set(sub.categoria_id, arr);
  }
  const parts = ['<option value="">— Sem vínculo —</option>'];
  for (const cat of cachedCategorias) {
    const subs = byCat.get(cat.id) || [];
    if (!subs.length) continue;
    parts.push(`<optgroup label="${escapeHtml(cat.nome)}">`);
    for (const sub of subs) {
      parts.push(`<option value="${sub.id}">${escapeHtml(sub.apelido || sub.nome)}</option>`);
    }
    parts.push('</optgroup>');
  }
  return parts.join('');
}

function buildContatoOpts() {
  const parts = ['<option value="">— Sem contato —</option>'];
  for (const c of cachedContatos) {
    parts.push(`<option value="${c.id}">${escapeHtml(c.nome)}</option>`);
  }
  return parts.join('');
}

function updateImportBtn() {
  const checked = document.querySelectorAll('.preview-row-check:checked').length;
  const btn = document.getElementById('step3-import');
  if (!btn) return;
  btn.textContent = `Importar ${checked} transaç${checked === 1 ? 'ão' : 'ões'}`;
  btn.disabled    = checked === 0;
}

async function doImport() {
  const user = await getCurrentUser();
  if (!user) return;

  const btn = document.getElementById('step3-import');
  btn.disabled  = true;
  btn.textContent = 'Importando…';

  const candidates = [];
  document.querySelectorAll('.preview-row-check:checked').forEach((cb) => {
    const i         = Number(cb.dataset.idx);
    const row       = previewData[i];
    if (!row) return;
    const tipo      = document.querySelector(`.preview-tipo[data-idx="${i}"]`)?.value    || row.tipo;
    const subId     = document.querySelector(`.preview-sub[data-idx="${i}"]`)?.value     || null;
    const contatoId = document.querySelector(`.preview-contato[data-idx="${i}"]`)?.value || null;
    candidates.push({
      user_id:               user.id,
      data:                  row.date,
      tipo,
      valor:                 row.valor,
      moeda:                 'BRL',
      conta_id:              selectedContaId,
      subcategoria_id:       subId     || null,
      contato_id:            contatoId || null,
      banco_desc:            row.desc,
      banco_id:              row.bancoId || null,
      descricao:             row.desc,   // pré-popula com texto do extrato (editável depois)
      reconciliacao_status:  'importado',
    });
  });

  if (!candidates.length) {
    showToast('Nenhuma transação selecionada.', 'error');
    updateImportBtn();
    return;
  }

  // ── Deduplicação: filtra transações já existentes ──────────────
  btn.textContent = 'Verificando duplicatas…';
  const withId    = candidates.filter((r) => r.banco_id);
  const withoutId = candidates.filter((r) => !r.banco_id);
  const existingBancoIds   = new Set();
  const existingCombos     = new Set(); // "data|banco_desc|valor"

  if (withId.length) {
    const { data: dup } = await supabase
      .from('transacoes')
      .select('banco_id')
      .eq('conta_id', selectedContaId)
      .in('banco_id', withId.map((r) => r.banco_id));
    (dup || []).forEach((r) => existingBancoIds.add(r.banco_id));
  }

  if (withoutId.length) {
    const descs = [...new Set(withoutId.map((r) => r.banco_desc).filter(Boolean))];
    if (descs.length) {
      const { data: dup } = await supabase
        .from('transacoes')
        .select('banco_desc, data, valor')
        .eq('conta_id', selectedContaId)
        .in('banco_desc', descs);
      (dup || []).forEach((r) => existingCombos.add(`${r.data}|${r.banco_desc}|${Number(r.valor)}`));
    }
  }

  const rows = candidates.filter((r) => {
    if (r.banco_id) return !existingBancoIds.has(r.banco_id);
    return !existingCombos.has(`${r.data}|${r.banco_desc}|${Number(r.valor)}`);
  });

  const skipped = candidates.length - rows.length;

  if (!rows.length) {
    showToast(`Todas as ${candidates.length} transações já foram importadas anteriormente.`, 'info', 7000);
    btn.disabled = false;
    updateImportBtn();
    return;
  }

  btn.textContent = 'Importando…';

  // Insere em lotes de 100
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from('transacoes').insert(rows.slice(i, i + 100));
    if (error) {
      let msg = error.message;
      if (/column.*reconciliacao_status/i.test(msg)) {
        msg = 'Execute a migration 0028_reconciliacao_status.sql no Supabase primeiro.';
      } else if (/column.*banco_desc/i.test(msg)) {
        msg = 'Execute a migration 0029_banco_desc.sql no Supabase primeiro.';
      } else if (/column.*banco_id/i.test(msg)) {
        msg = 'Execute a migration 0031_banco_id.sql no Supabase primeiro.';
      }
      console.error('[import] insert error', error);
      showToast('Erro ao importar: ' + msg, 'error', 10000);
      btn.disabled = false;
      updateImportBtn();
      return;
    }
  }

  const n = rows.length;
  const skipMsg = skipped > 0 ? ` (${skipped} duplicada${skipped > 1 ? 's' : ''} ignorada${skipped > 1 ? 's' : ''})` : '';
  showToast(
    `${n} transaç${n === 1 ? 'ão importada' : 'ões importadas'}${skipMsg}! Confirme em Transações → Pendentes.`,
    'success', 7000,
  );
  setTimeout(() => { window.location.href = '/transacoes.html'; }, 2500);
}

// ── Navegação entre steps ─────────────────────────────────────
function goToStep(n) {
  if (n === 2) renderStep2();
  if (n === 3) renderStep3();

  document.querySelectorAll('.import-panel').forEach((p) => p.classList.add('hidden'));
  document.getElementById(`step-${n}`).classList.remove('hidden');

  document.querySelectorAll('.import-step').forEach((s) => {
    const sn = Number(s.dataset.step);
    s.classList.toggle('is-active', sn === n);
    s.classList.toggle('is-done',   sn < n);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

