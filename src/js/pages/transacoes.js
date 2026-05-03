// =============================================================
// FinFlow — Página: Transações (Fase 1)
//
// Registro real de dinheiro movimentado. Diferente de pagamentos
// (status mensal de compromisso) e de subcategorias (compromisso
// recorrente), cada transação é um evento atômico.
//
// Próximas fases:
//   - Fase 2: sync bidirecional com pagamentos (auto-cria transação
//             quando pagamento é marcado pago/cartão/transferido/parcial;
//             alerta de duplicata; alerta de pagamento agendado)
//   - Fase 3: auto-reconciliação por estabelecimento + regras salvas
//   - Fase 4: faturas de cartão de crédito + compromisso automático
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatCurrency } from '../lib/compromissos-config.js';
import {
  findMatchingPagamento,
  findTransacaoLinkedToPagamento,
  isPaidStatus,
  markPagamentoPagoAndLink,
  linkTransacaoToPagamento,
  mergeTransacaoIntoExisting,
} from '../lib/transacao-pagamento-sync.js';
import {
  loadRules,
  findRule,
  upsertRule,
  suggestSubcategoriaFromHistory,
} from '../lib/regras-reconciliacao.js';
import { escapeHtml, formatDateBR, showConfirm } from '../lib/utils.js';
import { initColVisibility } from '../lib/col-visibility.js';
import {
  isContaCartao,
  syncTransacaoFatura,
  recalcFaturaTotal,
  checkAndCloseFaturas,
} from '../lib/faturas-cartao.js';

// -----------------------------
// State
// -----------------------------
let cachedTransacoes    = [];
let cachedContas        = [];
let cachedSubcategorias = [];
let cachedCategorias    = [];
let cachedContatos      = [];
let cachedRules         = [];
let editingId           = null;
let pendingDeleteId     = null;
let pendingRuleState    = null; // { contato_id, subcategoria_id } pra modal de criar regra

const MONTH_LABELS_LONG = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Colunas visíveis — persistidas no localStorage
const TRANS_COLUMNS = [
  { key: 'planejada',    label: 'Planejada',           defaultVisible: true },
  { key: 'id',           label: 'Identificador',       defaultVisible: true },
  { key: 'banco',        label: 'Descrição',           defaultVisible: true },
  { key: 'contato',      label: 'Cliente / Fornecedor',defaultVisible: true },
  { key: 'bloco',        label: 'Bloco',               defaultVisible: true },
  { key: 'categoria',    label: 'Categoria',           defaultVisible: true },
  { key: 'subcategoria', label: 'Subcategoria',        defaultVisible: true },
  { key: 'conta',        label: 'Conta',               defaultVisible: true },
  { key: 'valor',        label: 'Valor',               defaultVisible: true },
  { key: 'saldo',        label: 'Saldo',               defaultVisible: true },
];

// Seleção de linhas para exclusão em lote
let selectedIds     = new Set();

// Filtros
let filterMode          = 'mes';  // 'mes' | 'ano' | 'periodo' | 'todos'
let filterStart         = '';     // YYYY-MM-DD
let filterEnd           = '';     // YYYY-MM-DD
let filterConta         = '';
let filterTipo          = '';
let filterBusca         = '';
let filterReconciliacao = '';     // '' | 'importado'

// Estado do modal de sync
let syncModalState = null;

// Mapa de grupo da categoria → super-bloco (mesma lógica de configuracoes/orcamento)
const SUPER_BLOCOS = {
  receitas:      { id: 'contribuicao', label: 'Contribuição',  color: 'var(--color-success)' },
  dividas:       { id: 'contribuicao', label: 'Contribuição',  color: 'var(--color-success)' },
  investimentos: { id: 'sonhos',       label: 'Sonhos',        color: 'var(--color-primary)' },
  custo_vida:    { id: 'custo_vida',   label: 'Custo de vida', color: 'var(--color-secondary)' },
};

// Mapeia id do bloco → grupos de categoria que pertencem a ele
const BLOCO_GRUPOS = {
  contribuicao: ['receitas', 'dividas'],
  sonhos:       ['investimentos'],
  custo_vida:   ['custo_vida'],
};

function getBlocoFromSub(sub) {
  if (!sub) return null;
  const cat = cachedCategorias.find((c) => c.id === sub.categoria_id);
  if (!cat) return null;
  return SUPER_BLOCOS[cat.grupo] || SUPER_BLOCOS.custo_vida;
}

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('transacoes');
  initTutorial('transacoes');
  initFilters();
  bindEvents();
  await loadAll();
  render();
});

// -----------------------------
// Loaders
// -----------------------------
async function loadAll() {
  document.getElementById('trans-loading').classList.remove('hidden');

  // On-demand: fecha faturas vencidas + cria pagamentos automáticos (Fase 4)
  // Roda em background — não bloqueia o load
  checkAndCloseFaturas()
    .then((n) => { if (n > 0) showToast(`${n} fatura${n > 1 ? 's' : ''} de cartão fechada${n > 1 ? 's' : ''} — confira em Pagamentos`, 'success', 5000); })
    .catch((e) => console.warn('[checkAndCloseFaturas]', e));

  const [transRes, contRes, subRes, catRes, contatosRes] = await Promise.all([
    supabase
      .from('transacoes')
      .select('*, pagamento:pagamentos(data_vencimento, status)')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('contas')
      .select('id, nome, apelido, tipo, icone_cor, status, fec_fatura, vencimento')
      .neq('status', 'arquivada')
      .order('nome'),
    supabase
      .from('subcategorias')
      .select('id, nome, apelido, categoria_id, descricao, contato_id, status, is_parcial')
      .neq('status', 'arquivada')
      .order('nome'),
    supabase
      .from('categorias')
      .select('id, nome, grupo, cor')
      .order('nome'),
    supabase
      .from('contatos')
      .select('id, nome, tipo, status')
      .neq('status', 'arquivado')
      .order('nome'),
  ]);

  if (transRes.error) {
    showToast('Erro ao carregar transações: ' + transRes.error.message, 'error', 8000);
    document.getElementById('trans-loading').classList.add('hidden');
    return;
  }

  cachedTransacoes    = transRes.data || [];
  cachedContas        = contRes.data  || [];
  cachedSubcategorias = subRes.data   || [];
  cachedCategorias    = catRes.data   || [];

  if (contatosRes.error) {
    if (!/relation.*contatos|column.*contatos/i.test(contatosRes.error.message)) {
      console.warn('[loadContatos]', contatosRes.error);
    }
    cachedContatos = [];
  } else {
    cachedContatos = contatosRes.data || [];
  }

  // Regras de auto-reconciliação (Fase 3) — silenciosamente ignora se a migration 0024 não rodou
  cachedRules = await loadRules();

  populateContaSelects();
  populateSubcategoriaSelect();
  populateContatoSelectModal();

  document.getElementById('trans-loading').classList.add('hidden');
}

// -----------------------------
// Selects population
// -----------------------------
function populateContaSelects() {
  const opts = ['<option value="">Todas</option>']
    .concat(cachedContas.map((c) => `<option value="${c.id}">${escapeHtml(c.apelido || c.nome)}</option>`))
    .join('');
  document.getElementById('filter-conta').innerHTML = opts;

  const formOpts = ['<option value="">Selecione…</option>']
    .concat(cachedContas.map((c) => `<option value="${c.id}">${escapeHtml(c.apelido || c.nome)}</option>`))
    .join('');
  document.getElementById('trans-conta').innerHTML = formOpts;
}

function buildContatoOptions(includeNew = true) {
  const parts = ['<option value="">— Sem contato —</option>'];
  for (const c of cachedContatos) {
    parts.push(`<option value="${c.id}">${escapeHtml(c.nome)}</option>`);
  }
  if (includeNew) parts.push('<option value="__new__">+ Criar novo contato…</option>');
  return parts.join('');
}

function populateContatoSelectModal() {
  const sel = document.getElementById('trans-contato');
  if (!sel) return;
  sel.innerHTML = buildContatoOptions(true);
}

async function criarContatoInline(nome) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('contatos')
    .insert({ user_id: user.id, nome, tipo: 'ambos' })
    .select()
    .single();
  if (error) {
    let msg = error.message;
    if (/relation.*contatos|column.*contatos/i.test(msg)) {
      msg = 'Tabela contatos não existe — rode a migration 0023 no Supabase.';
    }
    showToast('Erro ao criar contato: ' + msg, 'error', 8000);
    return null;
  }
  cachedContatos.push(data);
  cachedContatos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  showToast(`Contato "${data.nome}" criado`, 'success');
  return data;
}

function populateSubcategoriaSelect() {
  filterSubForModal('', '');
}

// Preenche o select de categoria filtrado pelo bloco selecionado.
function populateCategoriaForModal(blocoId, currentCatId = '') {
  const grupos = BLOCO_GRUPOS[blocoId] || null;
  const cats   = grupos
    ? cachedCategorias.filter((c) => grupos.includes(c.grupo))
    : cachedCategorias;
  const catEl  = document.getElementById('trans-categoria');
  if (!catEl) return;
  catEl.innerHTML = '<option value="">— Todas as categorias —</option>'
    + cats.map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
  if (currentCatId) catEl.value = currentCatId;
}

// Preenche/filtra o select de subcategoria. Sem categoriaId = mostra todas (agrupadas).
function filterSubForModal(categoriaId, currentSubId = '') {
  const sel = document.getElementById('trans-subcategoria');
  if (!sel) return;

  if (categoriaId) {
    const subs = cachedSubcategorias.filter((s) => s.categoria_id === categoriaId);
    sel.innerHTML = '<option value="">— Sem vínculo —</option>'
      + subs.map((s) => `<option value="${s.id}">${escapeHtml(s.apelido || s.nome)}</option>`).join('');
  } else {
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
    sel.innerHTML = parts.join('');
  }

  if (currentSubId) sel.value = currentSubId;
}

// -----------------------------
// Filtros
// -----------------------------
function initFilters() {
  const colVisToolbar = document.getElementById('trans-col-vis');
  if (colVisToolbar) {
    initColVisibility({
      storageKey: 'transacoes',
      tableClass: 'trans-table',
      columns: TRANS_COLUMNS,
      toolbarEl: colVisToolbar,
    });
  }
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();

  const mesMonthSel = document.getElementById('filter-mes-month');
  MONTH_LABELS_LONG.forEach((label, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1;
    opt.textContent = label;
    if (i === m) opt.selected = true;
    mesMonthSel.appendChild(opt);
  });

  const mesYearSel = document.getElementById('filter-mes-year');
  for (let yr = y; yr >= y - 6; yr--) {
    const opt = document.createElement('option');
    opt.value = yr;
    opt.textContent = yr;
    if (yr === y) opt.selected = true;
    mesYearSel.appendChild(opt);
  }

  const anoSel = document.getElementById('filter-ano');
  for (let yr = y; yr >= y - 6; yr--) {
    const opt = document.createElement('option');
    opt.value = yr;
    opt.textContent = yr;
    anoSel.appendChild(opt);
  }

  const first = new Date(y, m, 1);
  const last  = new Date(y, m + 1, 0);
  document.getElementById('filter-dt-inicio').value = toISODate(first);
  document.getElementById('filter-dt-fim').value    = toISODate(last);

  updateFilterInputVisibility();
  const range = getFilterRange();
  if (range) { filterStart = range.start || ''; filterEnd = range.end || ''; }
}

function updateFilterInputVisibility() {
  document.getElementById('trans-input-mes').classList.toggle('hidden', filterMode !== 'mes');
  document.getElementById('trans-input-ano').classList.toggle('hidden', filterMode !== 'ano');
  document.getElementById('trans-input-periodo').classList.toggle('hidden', filterMode !== 'periodo');
  document.getElementById('btn-trans-aplicar').classList.toggle('hidden', filterMode !== 'periodo');
}

function getFilterRange() {
  if (filterMode === 'mes') {
    const mo = Number(document.getElementById('filter-mes-month').value);
    const yr = Number(document.getElementById('filter-mes-year').value);
    return { start: toISODate(new Date(yr, mo - 1, 1)), end: toISODate(new Date(yr, mo, 0)) };
  }
  if (filterMode === 'ano') {
    const yr = Number(document.getElementById('filter-ano').value);
    return { start: `${yr}-01-01`, end: `${yr}-12-31` };
  }
  if (filterMode === 'periodo') {
    const start = document.getElementById('filter-dt-inicio').value;
    const end   = document.getElementById('filter-dt-fim').value;
    if (!start || !end) { showToast('Informe as duas datas do período', 'warning'); return null; }
    if (start > end)    { showToast('Data de início deve ser anterior ao fim', 'warning'); return null; }
    return { start, end };
  }
  return { start: null, end: null };
}

function applyPeriodAndRender() {
  const range = getFilterRange();
  if (!range) return;
  filterStart = range.start || '';
  filterEnd   = range.end   || '';
  render();
}


// ── Seleção de linhas ──────────────────────────────────────────
function updateSelectionBar() {
  const bar  = document.getElementById('trans-selection-bar');
  const info = document.getElementById('trans-selection-count');
  const btn  = document.getElementById('btn-bulk-delete');
  if (!bar) return;
  const n = selectedIds.size;
  bar.classList.toggle('hidden', n === 0);
  if (info) info.textContent = `${n} selecionada${n !== 1 ? 's' : ''}`;
  if (btn) {
    const label = btn.querySelector('.bulk-delete-label');
    if (label) label.textContent = `Excluir ${n}`;
  }

  const allCheckEl = document.getElementById('trans-select-all');
  if (allCheckEl) {
    const all = [...document.querySelectorAll('.trans-row-check')].map((c) => c.dataset.id);
    allCheckEl.checked       = all.length > 0 && all.every((id) => selectedIds.has(id));
    allCheckEl.indeterminate = selectedIds.size > 0 && !allCheckEl.checked;
  }
}

async function execBulkDelete() {
  const ids = [...selectedIds];
  if (!ids.length) return;
  const n = ids.length;
  if (!await showConfirm(`Excluir ${n} transaç${n > 1 ? 'ões' : 'ão'}?\n\nEsta ação não pode ser desfeita.`)) return;

  const { error } = await supabase.from('transacoes').delete().in('id', ids);
  if (error) { showToast('Erro ao excluir: ' + error.message, 'error', 8000); return; }

  ids.forEach((id) => {
    const idx = cachedTransacoes.findIndex((t) => t.id === id);
    if (idx !== -1) cachedTransacoes.splice(idx, 1);
  });
  selectedIds.clear();
  showToast(`${n} transaç${n > 1 ? 'ões excluídas' : 'ão excluída'}`, 'success');
  render();
}

// -----------------------------
// Render
// -----------------------------
let shellRendered = false;

function render() {
  const filtered = applyFilters(cachedTransacoes);
  renderWidgets(filtered);

  if (filtered.length === 0 && cachedTransacoes.length === 0) {
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('trans-container').classList.add('hidden');
    return;
  }
  document.getElementById('empty-state').classList.add('hidden');

  const container = document.getElementById('trans-container');
  container.classList.remove('hidden');

  if (!shellRendered) {
    container.innerHTML = renderTableShell();
    shellRendered = true;
  }

  const dataTbody = document.getElementById('trans-data-tbody');
  dataTbody.innerHTML = renderDataRows(filtered);
  bindRowEvents();
  updateSelectionBar();
}

function applyFilters(items) {
  const buscaNorm = filterBusca.trim().toLowerCase();

  return items.filter((t) => {
    // Filtro de pendentes ignora a restrição de período — mostra tudo não reconciliado
    if (filterReconciliacao) {
      const status = t.reconciliacao_status || 'manual';
      if (status !== filterReconciliacao) return false;
    } else {
      if (filterStart && t.data < filterStart) return false;
      if (filterEnd   && t.data > filterEnd)   return false;
    }
    if (filterConta && t.conta_id !== filterConta) return false;
    if (filterTipo  && t.tipo     !== filterTipo)  return false;
    if (buscaNorm) {
      const contato = t.contato_id ? cachedContatos.find((c) => c.id === t.contato_id) : null;
      const haystack = `${t.descricao || ''} ${t.estabelecimento || ''} ${contato?.nome || ''}`.toLowerCase();
      if (!haystack.includes(buscaNorm)) return false;
    }
    return true;
  });
}

function renderWidgets(items) {
  const recItems = items.filter((t) => t.tipo === 'Receita');
  const desItems = items.filter((t) => t.tipo === 'Despesa');
  const receitas = recItems.reduce((s, t) => s + Number(t.valor || 0), 0);
  const despesas = desItems.reduce((s, t) => s + Number(t.valor || 0), 0);
  const saldo    = receitas - despesas;

  document.getElementById('kpi-receitas-value').textContent = formatCurrency(receitas);
  document.getElementById('kpi-despesas-value').textContent = formatCurrency(despesas);
  document.getElementById('kpi-saldo-value').textContent    = formatCurrency(saldo);

  document.getElementById('kpi-receitas-sub').textContent = `${recItems.length} ${recItems.length === 1 ? 'transação' : 'transações'}`;
  document.getElementById('kpi-despesas-sub').textContent = `${desItems.length} ${desItems.length === 1 ? 'transação' : 'transações'}`;
  document.getElementById('kpi-saldo-sub').textContent    = saldo >= 0 ? 'positivo' : 'negativo';

  const saldoEl = document.getElementById('kpi-saldo-value');
  saldoEl.style.color = saldo >= 0 ? 'var(--color-success)' : 'var(--color-danger)';

  const total = items.length;
  document.getElementById('kpi-count-value').textContent = total;
  document.getElementById('kpi-count-sub').textContent   = `${recItems.length} rec · ${desItems.length} desp`;

  // Atualiza badge de pendentes no botão de filtro
  const pendentes = cachedTransacoes.filter((t) => (t.reconciliacao_status || 'manual') === 'importado');
  const countEl   = document.getElementById('filter-pendentes-count');
  const filterBtn = document.getElementById('filter-pendentes');
  if (countEl) {
    countEl.textContent = pendentes.length;
    countEl.classList.toggle('hidden', pendentes.length === 0);
  }
  if (filterBtn) {
    filterBtn.classList.toggle('has-pending', pendentes.length > 0);
  }
}

function renderTableShell() {
  return `
    <table class="trans-table">
      <thead>
        <tr>
          <th class="trans-th-data">Data</th>
          <th class="trans-th-planejada" data-col="planejada" title="Data planejada do compromisso vinculado. 'Extrato' = importado sem compromisso.">Planejada</th>
          <th class="trans-th-id" data-col="id" title="Identificador único fornecido pelo banco no extrato">Identificador</th>
          <th class="trans-th-banco" data-col="banco">Descrição</th>
          <th class="trans-th-contato" data-col="contato">Cliente / Fornecedor</th>
          <th class="trans-th-bloco" data-col="bloco">Bloco</th>
          <th class="trans-th-categoria" data-col="categoria">Categoria</th>
          <th class="trans-th-subcategoria" data-col="subcategoria">Subcategoria</th>
          <th class="trans-th-conta" data-col="conta">Conta</th>
          <th class="trans-th-valor" data-col="valor">Valor</th>
          <th class="trans-th-saldo" data-col="saldo">Saldo</th>
          <th class="trans-th-actions" title="Selecionar tudo">
            <input type="checkbox" id="trans-select-all" title="Selecionar / desmarcar tudo">
          </th>
        </tr>
      </thead>
      <tbody id="trans-data-tbody"></tbody>
    </table>`;
}

function buildSubcategoriaOptions() {
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

function renderDataRows(items) {
  if (items.length === 0) {
    return `<tr class="trans-empty-row"><td colspan="12">Nenhuma transação encontrada com os filtros atuais.</td></tr>`;
  }

  // Saldo corrente: acumula do mais antigo para o mais novo (items vem newest-first)
  const runningBalances = new Map();
  let balance = 0;
  const itemsAsc = [...items].reverse();
  for (const t of itemsAsc) {
    balance += t.tipo === 'Receita' ? Number(t.valor || 0) : -Number(t.valor || 0);
    runningBalances.set(t.id, balance);
  }

  const rows = items.map((t) => {
    const conta   = cachedContas.find((c) => c.id === t.conta_id);
    const sub     = cachedSubcategorias.find((s) => s.id === t.subcategoria_id);
    const cat     = sub ? cachedCategorias.find((c) => c.id === sub.categoria_id) : null;
    const bloco   = getBlocoFromSub(sub);
    const contato = t.contato_id ? cachedContatos.find((c) => c.id === t.contato_id) : null;

    const tipoCls = t.tipo === 'Receita' ? 'trans-tipo-receita' : 'trans-tipo-despesa';
    const sinal   = t.tipo === 'Receita' ? '+' : '−';

    const blocoHtml = bloco
      ? `<span class="trans-bloco-pill" style="--bloco-color:${bloco.color};">${escapeHtml(bloco.label)}</span>`
      : '<span class="trans-bloco-empty">—</span>';

    const catHtml = cat
      ? `<span class="trans-cat-name">${escapeHtml(cat.nome)}</span>`
      : '<span class="trans-cat-empty">—</span>';

    const subHtml = sub
      ? `<span class="trans-sub-name">${escapeHtml(sub.apelido || sub.nome)}</span>`
      : '<span class="trans-sub-empty">—</span>';

    // Identificador: ID único do banco (banco_id)
    const bancoIdHtml = t.banco_id
      ? `<span class="trans-banco-id" title="${escapeHtml(t.banco_id)}">${escapeHtml(t.banco_id.length > 14 ? t.banco_id.slice(0, 14) + '…' : t.banco_id)}</span>`
      : '<span class="trans-banco-empty">—</span>';

    // Descrição: texto bruto do extrato (banco_desc)
    const bancoDescHtml = t.banco_desc
      ? `<span class="trans-banco-desc" title="${escapeHtml(t.banco_desc)}">${escapeHtml(t.banco_desc.length > 42 ? t.banco_desc.slice(0, 42) + '…' : t.banco_desc)}</span>`
      : '<span class="trans-banco-empty">—</span>';

    // Cliente/Fornecedor: prefere contato vinculado → fallback banco_desc → fallback legado
    let contatoHtml;
    if (contato) {
      contatoHtml = `<span class="trans-contato-name">${escapeHtml(contato.nome)}</span>`;
    } else if (t.banco_desc) {
      contatoHtml = `<span class="trans-contato-banco" title="Não vinculado — edite para selecionar um contato">${escapeHtml(t.banco_desc)}</span>`;
    } else if (t.estabelecimento) {
      contatoHtml = `<span class="trans-contato-legacy" title="Texto legado — edite a transação para vincular um contato">${escapeHtml(t.estabelecimento)}</span>`;
    } else {
      contatoHtml = '<span class="trans-contato-empty">—</span>';
    }

    // Indicador de parcial: pagamento marcado como Parcial, ou compromisso criado de parcial
    const isParcialPag  = t.pagamento?.status === 'Parcial';
    const isParcialComp = sub?.is_parcial === true;
    const parcialTitle  = isParcialComp ? 'Transação do restante de pagamento parcial' : 'Pagamento parcial';
    const parcialIcon   = (isParcialPag || isParcialComp)
      ? `<span class="parcial-indicator trans-parcial-icon" title="${parcialTitle}">½</span>`
      : '';

    // Data planejada: vem do pagamento vinculado (join feito no loadAll).
    // Quando a transação não tem pagamento_id, fica vazia.
    const planejadaIso = t.pagamento?.data_vencimento || null;
    let planejadaHtml;
    if (planejadaIso) {
      const diffDias = diasEntreISO(planejadaIso, t.data);
      // Cor do desvio: verde se ≤ 0 (em dia ou adiantado), âmbar se 1-7 dias atraso, vermelho se >7
      let cls = 'trans-planejada-ok';
      let badge = '';
      if (diffDias > 0 && diffDias <= 7) { cls = 'trans-planejada-late'; badge = ` <span class="trans-planejada-diff">+${diffDias}d</span>`; }
      else if (diffDias > 7)             { cls = 'trans-planejada-overdue'; badge = ` <span class="trans-planejada-diff">+${diffDias}d</span>`; }
      planejadaHtml = `<span class="${cls} tabular">${formatDateBR(planejadaIso)}</span>${badge}`;
    } else if (t.banco_desc) {
      planejadaHtml = '<span class="trans-planejada-extrato">Extrato</span>';
    } else {
      planejadaHtml = '<span class="trans-planejada-empty">—</span>';
    }

    const saldoVal = runningBalances.get(t.id) ?? 0;
    const saldoColor = saldoVal < 0 ? 'color: var(--color-danger)' : '';
    const saldoSinal = saldoVal >= 0 ? '+' : '−';

    const reconStatus = t.reconciliacao_status || 'manual';
    const isImportado  = reconStatus === 'importado';
    const isReconciliado = reconStatus === 'reconciliado';
    const reconBadge = isImportado
      ? `<span class="trans-recon-badge">Importado</span>`
      : isReconciliado
        ? `<span class="trans-recon-badge trans-recon-badge--ok">Reconciliado</span>`
        : '';
    const reconBtn = isImportado
      ? `<button class="btn-icon trans-recon-confirm" data-confirm-recon="${t.id}" title="Confirmar reconciliação">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
         </button>`
      : '';

    return `
      <tr class="trans-row trans-row-${t.tipo === 'Receita' ? 'receita' : 'despesa'}${isImportado ? ' trans-row--importado' : ''}" data-id="${t.id}">
        <td class="trans-td-data tabular">${formatDateBR(t.data)}</td>
        <td class="trans-td-planejada" data-col="planejada">${planejadaHtml}</td>
        <td class="trans-td-id" data-col="id">${bancoIdHtml}</td>
        <td class="trans-td-banco" data-col="banco">${bancoDescHtml}</td>
        <td class="trans-td-contato" data-col="contato">${contatoHtml}</td>
        <td class="trans-td-bloco" data-col="bloco">${blocoHtml}</td>
        <td class="trans-td-categoria" data-col="categoria">${catHtml}</td>
        <td class="trans-td-subcategoria" data-col="subcategoria">${subHtml}</td>
        <td class="trans-td-conta" data-col="conta">
          <div class="trans-conta-cell">
            <span>${escapeHtml(conta ? (conta.apelido || conta.nome) : '—')}</span>
            ${reconBadge}${parcialIcon}
          </div>
        </td>
        <td class="trans-td-valor tabular ${tipoCls}" data-col="valor">${sinal} ${formatCurrency(Number(t.valor || 0), t.moeda)}</td>
        <td class="trans-td-saldo tabular" data-col="saldo" style="${saldoColor}">${saldoSinal} ${formatCurrency(Math.abs(saldoVal))}</td>
        <td class="trans-td-actions">
          <div class="trans-actions-col">
            <input type="checkbox" class="trans-row-check" data-id="${t.id}"
              ${selectedIds.has(t.id) ? 'checked' : ''} title="Selecionar">
            ${reconBtn}
            <button class="btn-icon" data-edit="${t.id}" title="Editar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');

  // Footer: totais do período filtrado
  const totalReceitas = items.filter((t) => t.tipo === 'Receita').reduce((s, t) => s + Number(t.valor || 0), 0);
  const totalDespesas = items.filter((t) => t.tipo === 'Despesa').reduce((s, t) => s + Number(t.valor || 0), 0);
  const saldoMes = totalReceitas - totalDespesas;
  const saldoMesColor = saldoMes < 0 ? 'color: var(--color-danger)' : '';
  const saldoMesSinal = saldoMes >= 0 ? '+' : '−';

  const footer = `
    <tr class="trans-footer-row">
      <td colspan="10" class="trans-footer-label">
        ${items.length} transaç${items.length === 1 ? 'ão' : 'ões'}
        &nbsp;·&nbsp;
        <span class="trans-tipo-receita">+ ${formatCurrency(totalReceitas)}</span>
        &nbsp;
        <span class="trans-tipo-despesa">− ${formatCurrency(totalDespesas)}</span>
      </td>
      <td class="trans-td-saldo tabular trans-footer-saldo" data-col="saldo" style="${saldoMesColor}">${saldoMesSinal} ${formatCurrency(Math.abs(saldoMes))}</td>
      <td></td>
    </tr>`;

  return rows + footer;
}

// Diferença em dias entre data real e data planejada (positivo = pago em atraso)
function diasEntreISO(planejadaIso, realIso) {
  if (!planejadaIso || !realIso) return 0;
  const a = new Date(planejadaIso + 'T00:00:00');
  const b = new Date(realIso + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

// -----------------------------
// Event bindings
// -----------------------------
function bindEvents() {
  document.getElementById('btn-nova-transacao').addEventListener('click', () => openTransacaoModal());
  document.querySelector('[data-trigger-nova]')?.addEventListener('click', () => openTransacaoModal());

  // Filtros — modo de período
  document.getElementById('trans-mode-pills').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    filterMode = btn.dataset.mode;
    document.querySelectorAll('#trans-mode-pills [data-mode]').forEach((b) =>
      b.classList.toggle('active', b === btn)
    );
    updateFilterInputVisibility();
    applyPeriodAndRender();
  });
  document.getElementById('filter-mes-month').addEventListener('change', applyPeriodAndRender);
  document.getElementById('filter-mes-year').addEventListener('change', applyPeriodAndRender);
  document.getElementById('filter-ano').addEventListener('change', applyPeriodAndRender);
  document.getElementById('btn-trans-aplicar').addEventListener('click', applyPeriodAndRender);

  document.getElementById('filter-conta').addEventListener('change', (e) => {
    filterConta = e.target.value;
    render();
  });
  document.getElementById('filter-tipo').addEventListener('change', (e) => {
    filterTipo = e.target.value;
    render();
  });
  document.getElementById('filter-busca').addEventListener('input', (e) => {
    filterBusca = e.target.value;
    render();
  });

  document.getElementById('filter-pendentes').addEventListener('click', () => {
    filterReconciliacao = filterReconciliacao ? '' : 'importado';
    document.getElementById('filter-pendentes').classList.toggle('is-active', !!filterReconciliacao);
    render();
  });

  // Modal close handlers (genérico — usa data-close-modal)
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  // Form submit
  document.getElementById('form-transacao').addEventListener('submit', (e) => {
    e.preventDefault();
    saveTransacao();
  });

  // Botão excluir dentro do modal
  document.getElementById('btn-deletar-transacao').addEventListener('click', () => {
    if (!editingId) return;
    pendingDeleteId = editingId;
    closeModal('modal-transacao');
    openModal('modal-confirmar');
  });

  // Confirmar exclusão
  document.getElementById('btn-confirmar-excluir').addEventListener('click', () => {
    if (pendingDeleteId) execDelete(pendingDeleteId);
  });

  // Modal de sync (Fase 2)
  document.getElementById('btn-sync-confirm').addEventListener('click', onSyncConfirm);
  document.getElementById('btn-sync-skip').addEventListener('click', onSyncSkip);

  // Modal de criar regra (Fase 3)
  document.getElementById('btn-regra-confirm').addEventListener('click', onCreateRuleConfirm);
  document.getElementById('btn-regra-skip').addEventListener('click', onCreateRuleSkip);

  // Excluir selecionadas
  document.getElementById('btn-bulk-delete').addEventListener('click', execBulkDelete);

  // Cancelar seleção
  document.getElementById('btn-selection-clear').addEventListener('click', () => {
    selectedIds.clear();
    document.querySelectorAll('.trans-row-check').forEach((cb) => { cb.checked = false; });
    const allCb = document.getElementById('trans-select-all');
    if (allCb) allCb.checked = false;
    updateSelectionBar();
  });

  // Modal: select de contato com "+ Novo contato" + auto-reconciliação
  document.getElementById('trans-contato').addEventListener('change', async (e) => {
    if (e.target.value === '__new__') {
      e.target.value = '';
      const nome = window.prompt('Nome do novo contato (cliente/fornecedor):');
      if (!nome || !nome.trim()) return;
      const novo = await criarContatoInline(nome.trim());
      if (novo) {
        populateContatoSelectModal();
        e.target.value = novo.id;
      }
      return;
    }

    // Auto-reconciliação no modal: aplica regra/sugestão se subcategoria estiver vazia
    if (e.target.value) {
      const subEl = document.getElementById('trans-subcategoria');
      if (subEl && !subEl.value) {
        const rule = findRule(cachedRules, e.target.value);
        const subId = rule
          ? rule.subcategoria_id
          : suggestSubcategoriaFromHistory(cachedTransacoes, e.target.value);
        if (subId && Array.from(subEl.options).some((o) => o.value === subId)) {
          subEl.value = subId;
          // Dispara o handler de subcategoria pra preencher descrição
          subEl.dispatchEvent(new Event('change'));
        }
      }
    }
  });

  // Cascade bloco → categoria → subcategoria
  document.getElementById('trans-bloco').addEventListener('change', (e) => {
    populateCategoriaForModal(e.target.value, '');
    filterSubForModal('', '');
  });

  document.getElementById('trans-categoria').addEventListener('change', (e) => {
    filterSubForModal(e.target.value, '');
  });

  // Modal: ao escolher subcategoria, auto-preencher descrição/contato (se vazios)
  document.getElementById('trans-subcategoria').addEventListener('change', () => {
    const subId = document.getElementById('trans-subcategoria').value;
    if (!subId) return;
    const sub = cachedSubcategorias.find((s) => s.id === subId);
    if (!sub) return;
    const descEl = document.getElementById('trans-descricao');
    if (descEl && !descEl.value.trim()) {
      descEl.value = sub.descricao || sub.apelido || sub.nome || '';
    }
    const contatoEl = document.getElementById('trans-contato');
    if (sub.contato_id && contatoEl && !contatoEl.value) {
      contatoEl.value = sub.contato_id;
    }
  });
}

function bindRowEvents() {
  document.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.edit;
      openTransacaoModal(id);
    });
  });

  document.querySelectorAll('[data-confirm-recon]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.confirmRecon;
      execConfirmRecon(id);
    });
  });

  // Select-all checkbox (re-rendered with the shell)
  document.getElementById('trans-select-all')?.addEventListener('change', (e) => {
    const all = [...document.querySelectorAll('.trans-row-check')];
    all.forEach((cb) => {
      cb.checked = e.target.checked;
      if (e.target.checked) selectedIds.add(cb.dataset.id);
      else                   selectedIds.delete(cb.dataset.id);
    });
    updateSelectionBar();
  });

  // Row checkboxes
  document.querySelectorAll('.trans-row-check').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      if (e.target.checked) selectedIds.add(e.target.dataset.id);
      else                   selectedIds.delete(e.target.dataset.id);
      updateSelectionBar();
    });
  });
}

async function execConfirmRecon(id) {
  const { error } = await supabase
    .from('transacoes')
    .update({ reconciliacao_status: 'reconciliado' })
    .eq('id', id);

  if (error) {
    let msg = error.message;
    if (/column.*reconciliacao_status/i.test(msg)) {
      msg = 'Execute a migration 0028_reconciliacao_status.sql no Supabase primeiro.';
    }
    showToast('Erro ao reconciliar: ' + msg, 'error', 8000);
    return;
  }

  const t = cachedTransacoes.find((x) => x.id === id);
  if (t) {
    t.reconciliacao_status = 'reconciliado';
    // Aprende a associação banco_desc→contato para futuras importações
    if (t.banco_desc && t.contato_id) {
      upsertContatoBancoDesc(t.contato_id, t.banco_desc, t.subcategoria_id).catch(() => {});
    }
  }

  showToast('Transação reconciliada', 'success');
  render();
}

// Salva/atualiza o mapeamento banco_desc → contato no histórico de reconhecimento.
async function upsertContatoBancoDesc(contatoId, bancoDesc, subcategoriaId = null) {
  const user = await getCurrentUser();
  if (!user || !contatoId || !bancoDesc) return;
  await supabase
    .from('contato_banco_descs')
    .upsert(
      { user_id: user.id, contato_id: contatoId, banco_desc: bancoDesc, last_subcategoria_id: subcategoriaId || null },
      { onConflict: 'user_id,contato_id,banco_desc' },
    )
    .then(({ error }) => { if (error && !/relation.*contato_banco_descs/i.test(error.message)) console.warn('[upsertCDB]', error); });
}

// -----------------------------
// Modal: open / save
// -----------------------------
function openTransacaoModal(id = null) {
  editingId = id;
  const t = id ? cachedTransacoes.find((x) => x.id === id) : null;

  // Garante que o select de contatos do modal está populado e atualizado
  populateContatoSelectModal();

  document.getElementById('modal-transacao-title').textContent = t ? 'Editar transação' : 'Nova transação';
  document.getElementById('trans-data').value      = t?.data       || todayInput();
  document.getElementById('trans-tipo').value      = t?.tipo       || 'Despesa';
  document.getElementById('trans-valor').value     = t?.valor != null ? Number(t.valor) : '';
  document.getElementById('trans-moeda').value     = t?.moeda      || 'BRL';
  document.getElementById('trans-conta').value     = t?.conta_id   || '';
  document.getElementById('trans-contato').value   = t?.contato_id || '';
  document.getElementById('trans-descricao').value = t?.descricao  || '';

  // Cascade: sub → categoria → bloco
  const sub    = t?.subcategoria_id ? cachedSubcategorias.find((s) => s.id === t.subcategoria_id) : null;
  const cat    = sub ? cachedCategorias.find((c) => c.id === sub.categoria_id) : null;
  const blocoId = cat
    ? (Object.entries(BLOCO_GRUPOS).find(([, grupos]) => grupos.includes(cat.grupo))?.[0] || '')
    : '';
  document.getElementById('trans-bloco').value = blocoId;
  populateCategoriaForModal(blocoId, cat?.id || '');
  filterSubForModal(cat?.id || '', t?.subcategoria_id || '');

  document.getElementById('btn-deletar-transacao').classList.toggle('hidden', !id);

  // Reconciliação — só mostra ao editar
  const reconGroup = document.getElementById('trans-recon-group');
  const reconCheck = document.getElementById('trans-recon-check');
  if (reconGroup && reconCheck) {
    reconGroup.classList.toggle('hidden', !t);
    reconCheck.checked = t?.reconciliacao_status === 'reconciliado';
  }

  openModal('modal-transacao');
  document.getElementById('trans-data').focus();
}

async function saveTransacao() {
  const data            = document.getElementById('trans-data').value;
  const tipo            = document.getElementById('trans-tipo').value;
  const valorRaw        = document.getElementById('trans-valor').value;
  const moeda           = document.getElementById('trans-moeda').value;
  const conta_id        = document.getElementById('trans-conta').value || null;
  const subcategoria_id = document.getElementById('trans-subcategoria').value || null;
  const contatoRaw      = document.getElementById('trans-contato').value;
  const contato_id      = (contatoRaw && contatoRaw !== '__new__') ? contatoRaw : null;
  const descricao       = document.getElementById('trans-descricao').value.trim() || null;

  if (!data) { showToast('Informe a data', 'error'); return; }
  if (!valorRaw || isNaN(Number(valorRaw)) || Number(valorRaw) <= 0) {
    showToast('Informe um valor válido', 'error'); return;
  }
  if (!conta_id) { showToast('Selecione uma conta', 'error'); return; }

  const btn = document.getElementById('btn-salvar-transacao');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    const markRecon = editingId && (document.getElementById('trans-recon-check')?.checked ?? false);

    const payload = {
      data,
      tipo,
      valor: Number(valorRaw),
      moeda,
      conta_id,
      subcategoria_id,
      contato_id,
      descricao,
      // estabelecimento intencionalmente NÃO mexido aqui — preserva texto legado
      // se a transação foi criada antes da feature de contatos
      ...(markRecon ? { reconciliacao_status: 'reconciliado' } : {}),
    };

    let response;
    if (editingId) {
      response = await supabase.from('transacoes').update(payload).eq('id', editingId).select().single();
    } else {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sessão expirada. Faça login novamente.');
      response = await supabase.from('transacoes').insert({ ...payload, user_id: user.id }).select().single();
    }

    if (response.error) throw response.error;

    const savedTr = response.data;

    // Sync com fatura de cartão (Fase 4)
    // Se a conta antiga era cartão e mudou, recalcula a fatura antiga também
    const wasCartaoFatura = savedTr.fatura_cartao_id; // antes do save
    const novaConta = cachedContas.find((c) => c.id === savedTr.conta_id);
    if (isContaCartao(novaConta)) {
      await syncTransacaoFatura(savedTr, novaConta).catch((e) => console.warn('[syncTransacaoFatura]', e));
    } else if (wasCartaoFatura) {
      // saiu de cartão pra conta normal — desvincula e recalcula a fatura órfã
      await supabase.from('transacoes').update({ fatura_cartao_id: null }).eq('id', savedTr.id);
      await recalcFaturaTotal(wasCartaoFatura).catch((e) => console.warn('[recalc]', e));
    }

    // Aprende associação banco_desc→contato para futuras importações
    if (contato_id && savedTr.banco_desc) {
      upsertContatoBancoDesc(contato_id, savedTr.banco_desc, subcategoria_id).catch(() => {});
    }

    showToast(editingId ? 'Transação atualizada' : 'Transação criada', 'success');
    closeModal('modal-transacao');
    editingId = null;
    await loadAll();
    render();

    // Sync com pagamento (não bloqueia o fluxo)
    checkAndPromptSync(savedTr).catch((e) => console.warn('[checkAndPromptSync]', e));
    // Prompt para criar regra de auto-reconciliação (Fase 3)
    maybePromptCreateRule(savedTr);
  } catch (err) {
    console.error('[saveTransacao]', err);
    let msg = err?.message || err?.hint || err?.details || JSON.stringify(err);
    if (/relation.*transacoes/i.test(msg) || /column.*transacoes/i.test(msg)) {
      msg = 'Schema desatualizado — rode a migration 0021_transacoes.sql no Supabase.';
    }
    showToast('Erro ao salvar: ' + msg, 'error', 12000);
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

async function execDelete(id) {
  closeModal('modal-confirmar');
  pendingDeleteId = null;

  // Lembra fatura_cartao_id antes de excluir, pra recalcular o total depois
  const tr = cachedTransacoes.find((x) => x.id === id);
  const faturaIdAfetada = tr?.fatura_cartao_id || null;

  const { error } = await supabase.from('transacoes').delete().eq('id', id);
  if (error) {
    showToast('Erro ao excluir: ' + error.message, 'error', 8000);
    return;
  }

  // Recalcula total da fatura afetada (Fase 4)
  if (faturaIdAfetada) {
    await recalcFaturaTotal(faturaIdAfetada).catch((e) => console.warn('[recalc após delete]', e));
  }

  showToast('Transação excluída', 'success');
  editingId = null;
  await loadAll();
  render();
}

// -----------------------------
// Regras de auto-reconciliação (Fase 3) — prompt pós-save
// -----------------------------

/**
 * Após salvar uma transação, se ela tem contato_id + subcategoria_id e
 * ainda NÃO existe regra para esse contato, oferece criar uma.
 * Não pede confirmação se a transação veio de uma regra que já existia.
 */
function maybePromptCreateRule(transacao) {
  if (!transacao || !transacao.contato_id || !transacao.subcategoria_id) return;
  const existing = findRule(cachedRules, transacao.contato_id);
  if (existing && existing.subcategoria_id === transacao.subcategoria_id) return;

  const contato = cachedContatos.find((c) => c.id === transacao.contato_id);
  const sub     = cachedSubcategorias.find((s) => s.id === transacao.subcategoria_id);
  if (!contato || !sub) return;

  pendingRuleState = {
    contato_id:      transacao.contato_id,
    subcategoria_id: transacao.subcategoria_id,
    contatoNome:     contato.nome,
    subNome:         sub.apelido || sub.nome,
    isUpdate:        !!existing, // se já existia regra com outra sub, é "atualizar"
  };

  const msg = pendingRuleState.isUpdate
    ? `Você já tinha uma regra para <strong>${escapeHtml(contato.nome)}</strong> com outra subcategoria. Quer atualizá-la para <strong>${escapeHtml(sub.apelido || sub.nome)}</strong>?`
    : `Quer que toda nova transação com <strong>${escapeHtml(contato.nome)}</strong> seja automaticamente vinculada a <strong>${escapeHtml(sub.apelido || sub.nome)}</strong>?`;

  document.getElementById('regra-message').innerHTML = msg;
  openModal('modal-criar-regra');
}

async function onCreateRuleConfirm() {
  if (!pendingRuleState) return;
  const { contato_id, subcategoria_id } = pendingRuleState;
  closeModal('modal-criar-regra');
  const result = await upsertRule(contato_id, subcategoria_id);
  if (result.ok) {
    cachedRules = await loadRules();
    showToast('Regra criada', 'success', 3000);
  } else {
    let msg = result.error || 'erro';
    if (/relation.*regras_reconciliacao|column.*regras/i.test(msg)) {
      msg = 'Tabela regras_reconciliacao não existe — rode a migration 0024 no Supabase.';
    }
    showToast('Erro ao criar regra: ' + msg, 'error', 8000);
  }
  pendingRuleState = null;
}

function onCreateRuleSkip() {
  closeModal('modal-criar-regra');
  pendingRuleState = null;
}

// -----------------------------
// Sync com Pagamentos (Fase 2)
// -----------------------------

/**
 * Após salvar uma transação, verifica se existe um pagamento agendado
 * ou já pago que case (mesma subcategoria + mesmo mês). Se sim, abre o
 * modal de confirmação com a ação apropriada.
 */
async function checkAndPromptSync(transacao) {
  if (!transacao || !transacao.subcategoria_id) return;
  if (transacao.pagamento_id) return; // já vinculada

  const pagamento = await findMatchingPagamento({
    subcategoria_id: transacao.subcategoria_id,
    data:            transacao.data,
  });
  if (!pagamento) return;

  const linkedTr = await findTransacaoLinkedToPagamento(pagamento.id);

  // 3 cenários:
  //   A: pagamento agendado → marcar pago + vincular
  //   B: pagamento pago + outra transação já vinculada → mesclar (manter a já vinculada)
  //   C: pagamento pago sem transação vinculada → vincular essa
  let scenario;
  if (!isPaidStatus(pagamento.status)) {
    scenario = 'A';
  } else if (linkedTr && linkedTr.id !== transacao.id) {
    scenario = 'B';
  } else if (!linkedTr) {
    scenario = 'C';
  } else {
    return; // já é a transação vinculada — nada a fazer
  }

  showSyncPromptModal({ scenario, transacao, pagamento, linkedTr });
}

function showSyncPromptModal({ scenario, transacao, pagamento, linkedTr }) {
  syncModalState = { scenario, transacao, pagamento, linkedTr };

  const sub      = cachedSubcategorias.find((s) => s.id === transacao.subcategoria_id);
  const subName  = sub ? (sub.apelido || sub.nome) : 'compromisso';
  const mes      = monthLabelBR(transacao.data);
  const valorPag = formatCurrency(Number(pagamento.valor_real ?? pagamento.valor_previsto ?? 0));
  const valorTr  = formatCurrency(Number(transacao.valor || 0), transacao.moeda);

  const titleEl   = document.getElementById('sync-title');
  const msgEl     = document.getElementById('sync-message');
  const detailsEl = document.getElementById('sync-details');
  const confirmBtn = document.getElementById('btn-sync-confirm');
  const skipBtn    = document.getElementById('btn-sync-skip');

  if (scenario === 'A') {
    titleEl.textContent  = 'Pagamento agendado encontrado';
    msgEl.innerHTML      = `Existe um pagamento agendado para <strong>${escapeHtml(subName)}</strong> em <strong>${mes}</strong>. Quer marcar como pago e vincular esta transação?`;
    confirmBtn.textContent = 'Marcar como pago e vincular';
    skipBtn.textContent    = 'Manter independente';
  } else if (scenario === 'B') {
    titleEl.textContent  = 'Possível transação duplicada';
    msgEl.innerHTML      = `Já existe uma transação vinculada ao pagamento de <strong>${escapeHtml(subName)}</strong> em <strong>${mes}</strong>. Mesclar — manter a já vinculada e descartar esta nova?`;
    confirmBtn.textContent = 'Mesclar (descartar esta)';
    skipBtn.textContent    = 'Manter as duas';
  } else {
    titleEl.textContent  = 'Pagamento sem transação vinculada';
    msgEl.innerHTML      = `O pagamento de <strong>${escapeHtml(subName)}</strong> em <strong>${mes}</strong> já está marcado como <strong>${escapeHtml(pagamento.status)}</strong> mas sem transação vinculada. Vincular esta?`;
    confirmBtn.textContent = 'Vincular';
    skipBtn.textContent    = 'Manter independente';
  }

  // Detalhes lado a lado: o pagamento e a transação atual
  detailsEl.innerHTML = `
    <div class="sync-detail-card">
      <div class="sync-detail-label">Pagamento</div>
      <div class="sync-detail-value">${valorPag}</div>
      <div class="sync-detail-sub">Status: ${escapeHtml(pagamento.status)}</div>
    </div>
    <div class="sync-detail-card">
      <div class="sync-detail-label">Esta transação</div>
      <div class="sync-detail-value">${valorTr}</div>
      <div class="sync-detail-sub">${formatDateBR(transacao.data)}</div>
    </div>`;

  openModal('modal-sync-pagamento');
}

async function onSyncConfirm() {
  if (!syncModalState) return;
  const { scenario, transacao, pagamento, linkedTr } = syncModalState;

  let result;
  if (scenario === 'A') {
    // Marca pagamento Pago + vincula a transação
    // Usa o valor da transação como valor_real do pagamento
    result = await markPagamentoPagoAndLink(pagamento.id, transacao.id, Number(transacao.valor));
  } else if (scenario === 'B') {
    // Descarta a nova transação, mantém a já vinculada
    result = await mergeTransacaoIntoExisting(transacao.id, linkedTr.id);
  } else {
    // Vincula apenas
    result = await linkTransacaoToPagamento(pagamento.id, transacao.id);
  }

  closeModal('modal-sync-pagamento');
  syncModalState = null;

  if (!result.ok) {
    showToast('Erro no sync: ' + (result.error || 'desconhecido'), 'error', 8000);
  } else {
    const msgs = { A: 'Pagamento marcado como pago', B: 'Transações mescladas', C: 'Transação vinculada' };
    showToast(msgs[scenario], 'success');
  }

  await loadAll();
  render();
}

function onSyncSkip() {
  closeModal('modal-sync-pagamento');
  syncModalState = null;
}

// -----------------------------
// Utilities
// -----------------------------
function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonthInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthLabelBR(iso) {
  if (!iso) return '—';
  const [y, m] = iso.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${meses[Number(m) - 1]}/${y}`;
}

