// =============================================================
// FinFlow — Importar Extrato Bancário (Fase 5.A)
// CSV e Excel (.xlsx/.xls/.ods) via SheetJS CDN.
// Transações importadas ficam com reconciliacao_status='importado'
// e precisam ser confirmadas na página de Transações.
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { requireWorkspaceId } from '../lib/workspace.js';
import { canWrite } from '../lib/permissions.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { loadRules, findRule } from '../lib/regras-reconciliacao.js';
import { formatCurrency } from '../lib/moedas.js';
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
  // Importar passou a ser parte de Transações — sidebar marca 'transacoes' como ativo
  await initSidebar('transacoes');
  initTutorial('importar');
  await loadStrings();
  applyTranslationsToDom();
  await loadData();
  bindStep1Events();
  applyRoleGating();
});

/**
 * Esconde o botão de importação pra viewer. RLS bloqueia o INSERT no DB
 * mesmo se o user burlar a UI — esse gating é UX (avisa antes de tentar).
 */
function applyRoleGating() {
  const writable = canWrite();
  document.body.dataset.canWrite = String(writable);
  // step3-import é o botão "Importar transações" final do fluxo.
  // Se viewer escolher arquivo + reconciliar, ao chegar no passo 3 não vê o botão.
  // (Em vez de esconder a página inteira, deixa o user explorar/preview.)
  const importBtn = document.getElementById('step3-import');
  if (importBtn) importBtn.style.display = writable ? '' : 'none';
}

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
    } else if (ext === 'ofx' || ext === 'qfx') {
      const text = await file.text();
      rawRows = parseOFX(text);
    } else if (['xlsx', 'xls', 'ods'].includes(ext)) {
      const ok = await loadSheetJs();
      if (!ok) {
        showToast(t('importar.toast.parser_falhou', 'Não foi possível carregar o parser Excel. Verifique sua conexão.'), 'error', 6000);
        return;
      }
      rawRows = await parseExcel(file);
    } else {
      showToast(t('importar.toast.formato_nao_suportado', 'Formato não suportado. Use CSV, XLSX, XLS ou OFX.'), 'error');
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

// ── OFX Parser ────────────────────────────────────────────────
// Suporta OFX 1.x (SGML, tags não fechadas) e OFX 2.x (XML).
// Extrai os blocos <STMTTRN> e mapeia: DTPOSTED → data, TRNAMT → valor,
// FITID → identificador único do banco (chave de dedup perfeita),
// MEMO/NAME → descrição.
//
// Também extrai LEDGERBAL/<BALAMT>+<DTASOF> (saldo final do extrato)
// e guarda em window._lastOFXLedgerBal pra ser persistido como snapshot
// após a importação (saldos_bancarios_snapshots).
function parseOFX(text) {
  const rows = [['Data', 'Identificador', 'Descrição', 'Valor', 'Tipo']];
  // Limpa o cabeçalho SGML (OFX 1.x) — fica só com o conteúdo de dados
  const cleaned = text.replace(/^[\s\S]*?<OFX>/i, '<OFX>');

  // Extrai saldo final (LEDGERBAL ou AVAILBAL) — funciona pra bancos (STMTRS) e cartões (CCSTMTRS)
  const extractBalance = (blockTag) => {
    const m = cleaned.match(new RegExp(`<${blockTag}>([\\s\\S]*?)</${blockTag}>`, 'i'))
           || cleaned.match(new RegExp(`<${blockTag}>([\\s\\S]*?)(?=<\\w)`, 'i'));
    if (!m) return null;
    const block = m[1];
    const tagVal = (name) => {
      const xm = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'));
      if (xm) return xm[1].trim();
      const sm = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
      return sm ? sm[1].trim() : '';
    };
    const amt = parseFloat(tagVal('BALAMT'));
    const dt  = tagVal('DTASOF');
    if (isNaN(amt) || !dt) return null;
    const dateISO = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(dateISO) ? { saldo: amt, data: dateISO } : null;
  };
  // Tenta LEDGERBAL primeiro, depois AVAILBAL como fallback
  const balance = extractBalance('LEDGERBAL') || extractBalance('AVAILBAL');
  window._lastOFXLedgerBal = balance; // consumido por doImport

  // Regex tolerante: captura cada bloco STMTTRN (com ou sem closing tag)
  const trnRegex = /<STMTTRN\b[^>]*>([\s\S]*?)(?=<STMTTRN\b|<\/BANKTRANLIST>|<\/STMTRS>|<\/STMTTRNRS>|<\/OFX>|$)/gi;
  let match;
  while ((match = trnRegex.exec(cleaned)) !== null) {
    const block = match[1];
    const tag = (name) => {
      // Tenta primeiro forma XML <TAG>valor</TAG>, depois SGML <TAG>valor (até final de linha ou próxima tag)
      const xmlMatch = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
      if (xmlMatch) return xmlMatch[1].trim();
      const sgmlMatch = block.match(new RegExp(`<${name}\\b[^>]*>([^<\\r\\n]*)`, 'i'));
      return sgmlMatch ? sgmlMatch[1].trim() : '';
    };

    const dtRaw   = tag('DTPOSTED');                  // ex: 20260519 ou 20260519120000[-3:BRT]
    const amount  = tag('TRNAMT');                    // ex: -123.45
    const fitid   = tag('FITID');                     // identificador único
    const memo    = tag('MEMO') || tag('NAME') || tag('PAYEE'); // descrição

    if (!dtRaw || !amount) continue;
    // Parse data YYYYMMDD (resto é hora/tz, ignoramos)
    const dateISO = `${dtRaw.slice(0, 4)}-${dtRaw.slice(4, 6)}-${dtRaw.slice(6, 8)}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) continue;

    const valNum = parseFloat(amount);
    if (isNaN(valNum)) continue;
    const tipo = valNum >= 0 ? 'Receita' : 'Despesa';

    rows.push([
      dateISO,
      fitid,
      memo || '',
      String(Math.abs(valNum)),
      tipo,
    ]);
  }
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
    // Detecta já-existentes e matches com pagamentos agendados ANTES do preview
    await detectExistingTransacoes(previewData, selectedContaId);
    await applyPagamentoMatches(previewData, selectedContaId);
    await applyCrossAccountMatches(previewData, selectedContaId);
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

// =============================================================
// MATCH com pagamentos agendados + detecção de já-existentes
// =============================================================
//
// Para cada linha do extrato:
//   - alreadyExists: já existe transação com mesmo banco_id ou (data, banco_desc, valor)
//   - matchedPagamento: pagamento agendado dessa conta que case (data ±3d, valor ±1%, tipo)
//
// O usuário vê 3 grupos no step 3:
//   ✓ Já existe (skip)
//   🔗 Vincular a {sub} (vai criar transação reconciliada + marcar pagamento como Pago)
//   + Nova (cria como 'importado', precisa confirmar depois)

async function detectExistingTransacoes(rows, contaId) {
  if (!rows.length || !contaId) return;
  const withId = rows.filter((r) => r.bancoId);
  const withoutId = rows.filter((r) => !r.bancoId);
  const existingBancoIds = new Set();
  const existingCombos = new Set();

  if (withId.length) {
    const { data: dup } = await supabase
      .from('transacoes')
      .select('banco_id')
      .eq('conta_id', contaId)
      .in('banco_id', withId.map((r) => r.bancoId));
    (dup || []).forEach((r) => existingBancoIds.add(r.banco_id));
  }

  if (withoutId.length) {
    const descs = [...new Set(withoutId.map((r) => r.desc).filter(Boolean))];
    if (descs.length) {
      const { data: dup } = await supabase
        .from('transacoes')
        .select('banco_desc, data, valor')
        .eq('conta_id', contaId)
        .in('banco_desc', descs);
      (dup || []).forEach((r) => existingCombos.add(`${r.data}|${r.banco_desc}|${Number(r.valor)}`));
    }
  }

  for (const row of rows) {
    if (row.bancoId) {
      row.alreadyExists = existingBancoIds.has(row.bancoId);
    } else {
      row.alreadyExists = existingCombos.has(`${row.date}|${row.desc}|${Number(row.valor)}`);
    }
  }
}

function expandDate(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function applyPagamentoMatches(rows, contaId) {
  if (!rows.length || !contaId) return;
  // Subcategorias da conta (apenas tipos que casam: Receita/Despesa — Caixinha/Transferência
  // têm fluxo de par, então deixamos pro usuário manualmente)
  const { data: subs } = await supabase
    .from('subcategorias')
    .select('id, nome, apelido, conta_id, tipo')
    .eq('conta_id', contaId)
    .eq('status', 'ativa');
  if (!subs?.length) return;
  const matchableSubs = subs.filter((s) => s.tipo === 'Receita' || s.tipo === 'Despesa');
  if (!matchableSubs.length) return;
  const subIds = matchableSubs.map((s) => s.id);

  // Range de datas pra busca eficiente (±3 dias do min/max das linhas)
  const candidateDates = rows.filter((r) => !r.alreadyExists).map((r) => r.date);
  if (!candidateDates.length) return;
  const minDate = candidateDates.reduce((a, b) => (a < b ? a : b));
  const maxDate = candidateDates.reduce((a, b) => (a > b ? a : b));

  const { data: pags } = await supabase
    .from('pagamentos')
    .select('id, subcategoria_id, status, valor_previsto, valor_real, data_vencimento, moeda')
    .in('subcategoria_id', subIds)
    .in('status', ['A Pagar', 'A Transferir'])
    .gte('data_vencimento', expandDate(minDate, -3))
    .lte('data_vencimento', expandDate(maxDate, 3));
  if (!pags?.length) return;

  const subMap = new Map(matchableSubs.map((s) => [s.id, s]));
  const usedPagIds = new Set();

  for (const row of rows) {
    if (row.alreadyExists) continue;
    const rowDate = new Date(row.date + 'T00:00:00');
    const cands = [];
    for (const p of pags) {
      if (usedPagIds.has(p.id)) continue;
      const sub = subMap.get(p.subcategoria_id);
      if (!sub) continue;
      const pagTipo = sub.tipo;
      if (pagTipo !== row.tipo) continue;
      const pagDate = new Date(p.data_vencimento + 'T00:00:00');
      const dayDiff = Math.abs(Math.round((pagDate - rowDate) / 86400000));
      if (dayDiff > 3) continue;
      const pagValor = Number(p.valor_real ?? p.valor_previsto);
      if (!pagValor || pagValor <= 0) continue;
      const valDiff = Math.abs(pagValor - row.valor) / pagValor;
      if (valDiff > 0.01) continue;
      cands.push({ p, sub, score: dayDiff + valDiff * 100 });
    }
    if (cands.length === 0) continue;
    cands.sort((a, b) => a.score - b.score);
    const best = cands[0];
    row.matchedPagamento = {
      id: best.p.id,
      subcategoria_id: best.p.subcategoria_id,
      subcategoria_nome: best.sub.apelido?.trim() || best.sub.nome,
      data_vencimento: best.p.data_vencimento,
      valor_previsto: Number(best.p.valor_real ?? best.p.valor_previsto),
    };
    row.subId = best.p.subcategoria_id;
    usedPagIds.add(best.p.id);
  }
}

// =============================================================
// Match CROSS-CONTA: detecta pagamentos JÁ pagos em OUTRAS contas
// =============================================================
//
// Cenário: usuário marcou "Aluguel" como Pago em /pagamentos (compromisso
// configurado pra Nubank → criou tx manual fantasma na Nubank). Mas o
// pagamento real saiu do Inter — agora, ao importar o extrato do Inter,
// queremos detectar e oferecer ao usuário "realocar pra esta conta".
//
// Critério: pagamento status pago/cartão, valor exato, data ±3d, OUTRA conta.
// O sistema NÃO realoca sozinho — o usuário decide via checkbox no preview.

async function applyCrossAccountMatches(rows, contaId) {
  if (!rows.length || !contaId) return;

  // Considera só rows que ainda não têm match na própria conta
  const candidates = rows.filter((r) => !r.alreadyExists && !r.matchedPagamento);
  if (!candidates.length) return;

  const minDate = candidates.map((r) => r.date).reduce((a, b) => (a < b ? a : b));
  const maxDate = candidates.map((r) => r.date).reduce((a, b) => (a > b ? a : b));

  // Subcategorias do USUÁRIO em outras contas (não a importada)
  const { data: subs } = await supabase
    .from('subcategorias')
    .select('id, nome, apelido, conta_id, tipo')
    .neq('conta_id', contaId)
    .in('tipo', ['Receita', 'Despesa'])
    .eq('status', 'ativa');
  if (!subs?.length) return;
  const subIds = subs.map((s) => s.id);
  const subMap = new Map(subs.map((s) => [s.id, s]));

  // Busca contas pra exibir nome amigável
  const otherContaIds = [...new Set(subs.map((s) => s.conta_id).filter(Boolean))];
  const contasMap = new Map();
  if (otherContaIds.length) {
    const { data: contas } = await supabase
      .from('contas')
      .select('id, nome, apelido')
      .in('id', otherContaIds);
    (contas || []).forEach((c) => contasMap.set(c.id, c.apelido?.trim() || c.nome));
  }

  // Pagamentos JÁ pagos nessas subs no range
  const { data: pags } = await supabase
    .from('pagamentos')
    .select('id, subcategoria_id, status, valor_previsto, valor_real, data_vencimento, data_pagamento, conta_id_efetiva')
    .in('subcategoria_id', subIds)
    .in('status', ['Pago'])
    .gte('data_vencimento', expandDate(minDate, -10))
    .lte('data_vencimento', expandDate(maxDate, 10));
  if (!pags?.length) return;

  const usedPagIds = new Set();

  for (const row of candidates) {
    const rowDate = new Date(row.date + 'T00:00:00');
    const cands = [];
    for (const p of pags) {
      if (usedPagIds.has(p.id)) continue;
      // Se conta_id_efetiva já foi setada pra a conta importada, esse já está OK
      if (p.conta_id_efetiva === contaId) continue;
      const sub = subMap.get(p.subcategoria_id);
      if (!sub) continue;
      if (sub.tipo !== row.tipo) continue;
      // Usa data_pagamento se disponível, senão data_vencimento
      const pagDateIso = p.data_pagamento || p.data_vencimento;
      const pagDate = new Date(pagDateIso + 'T00:00:00');
      const dayDiff = Math.abs(Math.round((pagDate - rowDate) / 86400000));
      if (dayDiff > 3) continue;
      const pagValor = Number(p.valor_real ?? p.valor_previsto);
      if (!pagValor || pagValor <= 0) continue;
      // Cross-conta: exige valor EXATO (mais conservador que match normal de 1%)
      if (Math.abs(pagValor - row.valor) > 0.01) continue;
      cands.push({ p, sub, score: dayDiff });
    }
    if (cands.length === 0) continue;
    cands.sort((a, b) => a.score - b.score);
    const best = cands[0];
    const contaAntigaNome = contasMap.get(best.sub.conta_id) || 'outra conta';
    row.crossAccountMatch = {
      id: best.p.id,
      subcategoria_id: best.p.subcategoria_id,
      subcategoria_nome: best.sub.apelido?.trim() || best.sub.nome,
      conta_antiga_id: best.sub.conta_id,
      conta_antiga_nome: contaAntigaNome,
      data_pagamento: best.p.data_pagamento || best.p.data_vencimento,
      valor: Number(best.p.valor_real ?? best.p.valor_previsto),
    };
    row.subId = best.p.subcategoria_id;
    usedPagIds.add(best.p.id);
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
  const existing     = previewData.filter((r) => r.alreadyExists).length;
  const linkable     = previewData.filter((r) => r.matchedPagamento && !r.alreadyExists).length;
  const crossMatched = previewData.filter((r) => r.crossAccountMatch && !r.alreadyExists && !r.matchedPagamento).length;
  const novel        = previewData.length - existing - linkable - crossMatched;

  // Resumo no topo: contadores por grupo
  const summaryParts = [`${previewData.length} transaç${previewData.length === 1 ? 'ão' : 'ões'} encontradas`];
  if (existing > 0)     summaryParts.push(`<span style="color:var(--color-text-muted)">${existing} já existem</span>`);
  if (linkable > 0)     summaryParts.push(`<span style="color:var(--color-primary)">🔗 ${linkable} vincular a pagamento</span>`);
  if (crossMatched > 0) summaryParts.push(`<span style="color:var(--color-warning)">🔄 ${crossMatched} realocar de outra conta</span>`);
  if (novel > 0)        summaryParts.push(`<span style="color:var(--color-success)">+ ${novel} nova${novel > 1 ? 's' : ''}</span>`);
  if (recognized > 0)   summaryParts.push(`<span style="color:var(--color-text-muted)">${recognized} reconhecida${recognized > 1 ? 's' : ''}</span>`);
  document.getElementById('step3-count').innerHTML = summaryParts.join(' · ');

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
    const tipoSel   = `<select class="input input-sm preview-tipo" data-idx="${i}" ${row.alreadyExists ? 'disabled' : ''}>
      <option value="Despesa" ${row.tipo === 'Despesa' ? 'selected' : ''}>Despesa</option>
      <option value="Receita" ${row.tipo === 'Receita' ? 'selected' : ''}>Receita</option>
    </select>`;
    const subSel      = `<select class="input input-sm preview-sub" data-idx="${i}" ${row.alreadyExists ? 'disabled' : ''}>${subOpts}</select>`;
    const contatoSel  = `<select class="input input-sm preview-contato" data-idx="${i}" ${row.alreadyExists ? 'disabled' : ''}>${contatoOpts}</select>`;

    // Badge de status do match (prioridade: alreadyExists > matched > crossAccount > recognized > nada)
    let statusBadge = '';
    if (row.alreadyExists) {
      statusBadge = `<span class="import-row-badge import-row-badge--existing" title="Essa transação já existe no sistema. Será pulada.">✓ Já existe</span>`;
    } else if (row.matchedPagamento) {
      const mp = row.matchedPagamento;
      statusBadge = `<span class="import-row-badge import-row-badge--linkable" title="Vai vincular a '${escapeHtml(mp.subcategoria_nome)}' (vencia ${mp.data_vencimento}). O pagamento ficará marcado como Pago.">🔗 Vincular: ${escapeHtml(mp.subcategoria_nome)}</span>`;
    } else if (row.crossAccountMatch) {
      const cm = row.crossAccountMatch;
      statusBadge = `<span class="import-row-badge import-row-badge--cross" title="O pagamento de '${escapeHtml(cm.subcategoria_nome)}' está marcado como pago em ${escapeHtml(cm.conta_antiga_nome)}. Se você marcar essa linha, o pagamento é realocado pra esta conta (a transação fantasma é removida).">🔄 Realocar de ${escapeHtml(cm.conta_antiga_nome)}: ${escapeHtml(cm.subcategoria_nome)}</span>`;
    } else if (row.isRecognized) {
      statusBadge = `<span class="import-row-badge import-row-badge--recognized" title="Reconhecida por histórico">✓ Reconhecida</span>`;
    }

    const descDisplay = row.desc.length > 45 ? row.desc.slice(0, 45) + '…' : row.desc;
    const idDisplay   = row.bancoId
      ? `<span class="preview-banco-id" title="${escapeHtml(row.bancoId)}">${escapeHtml(row.bancoId.length > 14 ? row.bancoId.slice(0, 14) + '…' : row.bancoId)}</span>`
      : '<span class="preview-id-empty">—</span>';

    const rowClass = row.alreadyExists
      ? 'preview-row--existing'
      : (row.matchedPagamento ? 'preview-row--linkable'
        : (row.crossAccountMatch ? 'preview-row--cross'
          : (row.isRecognized ? 'preview-row--recognized' : '')));
    const isChecked = !row.alreadyExists;

    return `<tr class="${rowClass}">
      <td class="preview-check-cell"><input type="checkbox" class="preview-row-check" data-idx="${i}" ${isChecked ? 'checked' : ''} ${row.alreadyExists ? 'disabled' : ''}></td>
      <td class="tabular" style="white-space:nowrap">${row.date}</td>
      <td>${idDisplay}</td>
      <td class="preview-banco-cell">${statusBadge ? statusBadge + '<br>' : ''}<span title="${escapeHtml(row.desc)}">${escapeHtml(descDisplay)}</span></td>
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

  // 1. Cria o registro de lote (extratos_importados)
  const totalLinhasPreview = previewData.length;
  const { data: extrato, error: extratoErr } = await supabase
    .from('extratos_importados')
    .insert({
      user_id: user.id,
      workspace_id: requireWorkspaceId(),
      conta_id: selectedContaId,
      formato: detectImportFormat(),
      total_linhas: totalLinhasPreview,
    })
    .select()
    .single();
  if (extratoErr) {
    console.warn('[import] extrato_importados insert failed', extratoErr);
  }
  const extratoId = extrato?.id || null;

  // 2. Separa candidatos selecionados em 4 grupos:
  //    - linkables: match com pagamento agendado → reconciliado + linkado
  //    - crossRealocacoes: pagamento já pago em OUTRA conta → realocar pra esta
  //    - autoConfirmed: contato tem regra com auto_confirmar=true → reconciliado + auto
  //    - novos: ficam como 'importado' pendente de confirmação manual
  const linkables = [];        // { row, payload, pagamento }
  const crossRealocacoes = []; // { row, payload, cross }
  const autoConfirmed = [];    // payload
  const novos     = [];        // payload
  let skippedExisting = 0;

  document.querySelectorAll('.preview-row-check:checked').forEach((cb) => {
    const i   = Number(cb.dataset.idx);
    const row = previewData[i];
    if (!row || row.alreadyExists) { skippedExisting++; return; }
    const tipo      = document.querySelector(`.preview-tipo[data-idx="${i}"]`)?.value    || row.tipo;
    const subId     = document.querySelector(`.preview-sub[data-idx="${i}"]`)?.value     || null;
    const contatoId = document.querySelector(`.preview-contato[data-idx="${i}"]`)?.value || null;
    const importTs  = new Date().toISOString();
    const basePayload = {
      user_id:               user.id,
      workspace_id:          requireWorkspaceId(),
      created_by:            user.id,
      data:                  row.date,
      tipo,
      valor:                 row.valor,
      moeda:                 'BRL',
      conta_id:              selectedContaId,
      subcategoria_id:       subId     || null,
      contato_id:            contatoId || null,
      banco_desc:            row.desc,
      banco_id:              row.bancoId || null,
      descricao:             row.desc,
      extrato_id:            extratoId,
      importada_em:          importTs,
    };
    if (row.matchedPagamento && subId === row.matchedPagamento.subcategoria_id) {
      linkables.push({
        row,
        payload: {
          ...basePayload,
          reconciliacao_status: 'reconciliado',
          pagamento_id: row.matchedPagamento.id,
        },
        pagamento: row.matchedPagamento,
      });
    } else if (row.crossAccountMatch && subId === row.crossAccountMatch.subcategoria_id) {
      // Realocação cross-conta: vincula a tx importada ao pagamento e marca
      // pra atualizar conta_id_efetiva + deletar tx manual antiga na conta original.
      crossRealocacoes.push({
        row,
        payload: {
          ...basePayload,
          reconciliacao_status: 'reconciliado',
          pagamento_id: row.crossAccountMatch.id,
        },
        cross: row.crossAccountMatch,
      });
    } else {
      // Verifica se há regra com auto_confirmar=true pra esse contato
      const rule = contatoId ? findRule(cachedRules, contatoId) : null;
      if (rule && rule.auto_confirmar && subId) {
        autoConfirmed.push({
          ...basePayload,
          reconciliacao_status: 'reconciliado',
          confirmado_automaticamente: true,
        });
      } else {
        novos.push({ ...basePayload, reconciliacao_status: 'importado' });
      }
    }
  });
  // Conta também as alreadyExists que apareceram no preview mas foram desmarcadas pelo user
  previewData.forEach((row) => { if (row.alreadyExists) skippedExisting++; });
  // Evita double-count: contamos só 1x
  skippedExisting = previewData.filter((r) => r.alreadyExists).length;

  const totalToImport = linkables.length + crossRealocacoes.length + autoConfirmed.length + novos.length;
  if (totalToImport === 0) {
    const msg = skippedExisting > 0
      ? `Todas as ${skippedExisting} transações já existem no sistema.`
      : 'Nenhuma transação selecionada.';
    showToast(msg, 'info', 7000);
    btn.disabled = false;
    updateImportBtn();
    if (extratoId) {
      await supabase.from('extratos_importados').update({ total_puladas: skippedExisting }).eq('id', extratoId);
    }
    return;
  }

  // 3a. Insere primeiro as "novas" em batch (vão pra aba Importações como pendentes)
  if (novos.length > 0) {
    for (let i = 0; i < novos.length; i += 100) {
      const { error } = await supabase.from('transacoes').insert(novos.slice(i, i + 100));
      if (error) {
        console.error('[import] insert novos error', error);
        showToast('Erro ao importar novas: ' + error.message, 'error', 10000);
        btn.disabled = false;
        updateImportBtn();
        return;
      }
    }
  }

  // 3b. Insere as auto-confirmadas (já vão pra aba Transações + afetam saldo)
  if (autoConfirmed.length > 0) {
    for (let i = 0; i < autoConfirmed.length; i += 100) {
      const { error } = await supabase.from('transacoes').insert(autoConfirmed.slice(i, i + 100));
      if (error) {
        console.error('[import] insert auto-confirmadas error', error);
        showToast('Erro ao importar auto-confirmadas: ' + error.message, 'error', 10000);
        btn.disabled = false;
        updateImportBtn();
        return;
      }
    }
  }

  // 4. Para cada "linkable": insere a transação reconciliada + marca pagamento como Pago
  let linkedOk = 0;
  for (const item of linkables) {
    const { error: trErr } = await supabase
      .from('transacoes')
      .insert(item.payload);
    if (trErr) {
      console.error('[import] insert linkable failed', trErr);
      continue;
    }
    // Marca o pagamento como Pago com data_pagamento = data do extrato
    const { error: pagErr } = await supabase
      .from('pagamentos')
      .update({
        status: 'Pago',
        data_pagamento: item.row.date,
        valor_real: item.row.valor,
        status_atualizado_em: new Date().toISOString(),
        marked_paid_by: user.id,
        marked_paid_at: new Date().toISOString(),
      })
      .eq('id', item.pagamento.id);
    if (pagErr) {
      console.warn('[import] mark pagamento Pago failed', pagErr);
      // Mesmo assim a transação foi inserida — conta como linkada
    }
    linkedOk++;
  }

  // 4b. Para cada cross-realocação: insere a tx importada vinculada ao pagamento,
  //     atualiza conta_id_efetiva, e DELETA a tx manual antiga (fantasma) na conta original.
  let crossRealocadoOk = 0;
  for (const item of crossRealocacoes) {
    // Insere a tx importada já reconciliada e linkada ao pagamento
    const { error: trErr } = await supabase.from('transacoes').insert(item.payload);
    if (trErr) {
      console.error('[import] insert cross-realocacao failed', trErr);
      continue;
    }
    // Atualiza pagamento: nova conta efetiva + data efetiva
    const { error: pagErr } = await supabase
      .from('pagamentos')
      .update({
        conta_id_efetiva: selectedContaId,
        data_pagamento: item.row.date,
        valor_real: item.row.valor,
        status_atualizado_em: new Date().toISOString(),
      })
      .eq('id', item.cross.id);
    if (pagErr) {
      console.warn('[import] update pagamento cross failed', pagErr);
    }
    // Deleta tx manual antiga (fantasma) que tinha sido criada na conta config
    const { error: delErr } = await supabase
      .from('transacoes')
      .delete()
      .eq('pagamento_id', item.cross.id)
      .eq('reconciliacao_status', 'manual')
      .eq('conta_id', item.cross.conta_antiga_id);
    if (delErr) {
      console.warn('[import] delete tx manual antiga failed', delErr);
    }
    crossRealocadoOk++;
  }

  // 5. Atualiza contadores do extrato
  if (extratoId) {
    await supabase.from('extratos_importados').update({
      total_novas: novos.length,
      total_vinculadas: linkedOk + crossRealocadoOk,
      total_auto_confirmadas: autoConfirmed.length,
      total_puladas: skippedExisting,
    }).eq('id', extratoId);
  }

  // 5b. Snapshot do saldo bancário (vindo do OFX LEDGERBAL/AVAILBAL)
  const ledger = window._lastOFXLedgerBal;
  if (ledger && ledger.saldo != null && ledger.data) {
    const conta = cachedContas.find((c) => c.id === selectedContaId);
    await supabase.from('saldos_bancarios_snapshots').insert({
      user_id: user.id,
      workspace_id: requireWorkspaceId(),
      conta_id: selectedContaId,
      data:     ledger.data,
      saldo:    ledger.saldo,
      moeda:    conta?.moeda || 'BRL',
      fonte:    'ofx',
      extrato_id: extratoId,
    });
    window._lastOFXLedgerBal = null;
  }

  // 6. Auto-complete de tarefas: importação concluída pra essa conta
  try {
    const { autoConcluirTarefas } = await import('../lib/tarefas.js');
    await autoConcluirTarefas({ tipo: 'import_extrato', conta_id: selectedContaId });
  } catch (err) { console.warn('[autoConcluirTarefas]', err); }

  // 7. Feedback ao usuário
  const parts = [];
  if (novos.length > 0)         parts.push(`${novos.length} nova${novos.length > 1 ? 's' : ''} pendente${novos.length > 1 ? 's' : ''}`);
  if (linkedOk > 0)             parts.push(`${linkedOk} vinculada${linkedOk > 1 ? 's' : ''} a pagamento`);
  if (crossRealocadoOk > 0)     parts.push(`${crossRealocadoOk} realocada${crossRealocadoOk > 1 ? 's' : ''} de outra conta`);
  if (autoConfirmed.length > 0) parts.push(`${autoConfirmed.length} auto-confirmada${autoConfirmed.length > 1 ? 's' : ''}`);
  if (skippedExisting > 0)      parts.push(`${skippedExisting} já existente${skippedExisting > 1 ? 's' : ''} pulada${skippedExisting > 1 ? 's' : ''}`);
  showToast(`Importação concluída: ${parts.join(' · ')}.`, 'success', 8000);
  setTimeout(() => { window.location.href = '/transacoes.html'; }, 2500);
}

function detectImportFormat() {
  // Heurística simples: extensão do nome do arquivo + tipo de parsing
  const fname = document.getElementById('import-file')?.files?.[0]?.name || '';
  if (/\.ofx$/i.test(fname)) return 'ofx';
  if (/\.csv|\.txt$/i.test(fname)) return 'csv';
  if (/\.xlsx?|\.ods$/i.test(fname)) return 'excel';
  return 'desconhecido';
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

