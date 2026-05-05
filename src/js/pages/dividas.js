// =============================================================
// FinFlow — Página: Dívidas
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatCurrency } from '../lib/compromissos-config.js';
import { initColVisibility } from '../lib/col-visibility.js';
import { escapeHtml } from '../lib/utils.js';

// -----------------------------
// Status config
// -----------------------------
const STATUS_CONFIG = {
  'Ativa':      { label: 'Ativa',      color: 'var(--color-primary)', bg: 'var(--color-primary-50)' },
  'Atrasada':   { label: 'Atrasada',   color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)' },
  'Negociando': { label: 'Negociando', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  'Quitada':    { label: 'Quitada',    color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
};

const BLOCOS = [
  {
    id: 'em_progresso',
    label: 'Em progresso',
    filter: (d) => d.status !== 'Quitada' && Number(d.valor_pago) > 0,
    emptyMsg: 'Nenhuma dívida em andamento.',
  },
  {
    id: 'por_comecar',
    label: 'Por começar',
    filter: (d) => d.status !== 'Quitada' && Number(d.valor_pago) === 0,
    emptyMsg: 'Nenhuma dívida aguardando início.',
  },
  {
    id: 'terminado',
    label: 'Terminado',
    filter: (d) => d.status === 'Quitada',
    emptyMsg: 'Nenhuma dívida quitada ainda.',
  },
];

// -----------------------------
// State
// -----------------------------
let cachedDividas          = [];
let cachedContas           = [];
let cachedContatos         = [];
let cachedDividaHistorico  = []; // pagamentos_divida_historico
let editingId              = null;
let historicoDividaId      = null;
let pendingDeleteId        = null;
let viewMode               = 'cards'; // 'cards' | 'table' | 'gantt'
let ganttZoom              = '1ano';  // '1ano' | '3anos' | '5anos'
let colVisEl               = null;

const today = new Date();
today.setHours(0, 0, 0, 0);

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('dividas');
  initTutorial('dividas');
  bindEvents();

  colVisEl = initColVisibility({
    storageKey: 'dividas',
    tableClass:  'divida-tabela',
    columns: [
      { key: 'credor',     label: 'Credor',      defaultVisible: true  },
      { key: 'status',     label: 'Status',       defaultVisible: true  },
      { key: 'total',      label: 'Total',        defaultVisible: true  },
      { key: 'pago',       label: 'Pago',         defaultVisible: true  },
      { key: 'restante',   label: 'Restante',     defaultVisible: true  },
      { key: 'pct',          label: '% Pago',       defaultVisible: true  },
      { key: 'pct-restante', label: '% Restante',  defaultVisible: true  },
      { key: 'vencimento',   label: 'Vencimento',  defaultVisible: true  },
      { key: 'inicio',     label: 'Início',       defaultVisible: false },
      { key: 'juros',      label: 'Juros',        defaultVisible: false },
      { key: 'conta',      label: 'Conta',        defaultVisible: false },
    ],
    toolbarEl: document.querySelector('.toolbar'),
  });

  await loadAll();
});

// -----------------------------
// Load
// -----------------------------
async function loadAll() {
  const [divRes, contRes, contatosRes, histRes] = await Promise.all([
    supabase.from('dividas').select('*').order('created_at', { ascending: false }),
    supabase.from('contas').select('id, nome, apelido').order('nome'),
    supabase.from('contatos').select('id, nome, tipo, status').neq('status', 'arquivado').order('nome'),
    supabase.from('pagamentos_divida_historico').select('*').order('data'),
  ]);

  if (divRes.error) {
    showToast('Erro ao carregar dívidas: ' + divRes.error.message, 'error', 8000);
    return;
  }

  if (contatosRes.error) {
    if (!/relation.*contatos|column.*contatos/i.test(contatosRes.error.message)) {
      console.warn('[loadContatos]', contatosRes.error);
    }
    cachedContatos = [];
  } else {
    cachedContatos = contatosRes.data || [];
  }

  if (histRes.error) {
    if (!/relation.*pagamentos_divida_historico/i.test(histRes.error.message)) {
      console.warn('[loadDividaHistorico]', histRes.error);
    }
    cachedDividaHistorico = [];
  } else {
    cachedDividaHistorico = histRes.data || [];
  }

  cachedDividas = divRes.data || [];
  cachedContas  = contRes.data || [];

  populateContaSelect('div-conta');
  populateContatoSelect();
  renderWidgets();
  render();
}

function populateContatoSelect() {
  const sel = document.getElementById('div-contato');
  if (!sel) return;
  const opts = ['<option value="">— Sem contato —</option>'];
  for (const c of cachedContatos) {
    opts.push(`<option value="${c.id}">${escapeHtml(c.nome)}</option>`);
  }
  opts.push('<option value="__new__">+ Criar novo contato…</option>');
  sel.innerHTML = opts.join('');
}

async function criarContatoInline(nome) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('contatos')
    .insert({ user_id: user.id, nome, tipo: 'fornecedor' })
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


// -----------------------------
// KPI widgets
// -----------------------------
function renderWidgets() {
  const totalGeral    = cachedDividas.reduce((s, d) => s + Number(d.valor_total), 0);
  const totalPago     = cachedDividas.reduce((s, d) => s + Number(d.valor_pago),  0);
  const totalRestante = Math.max(0, totalGeral - totalPago);

  const pctPago     = totalGeral > 0 ? Math.min(100, (totalPago     / totalGeral) * 100) : 0;
  const pctRestante = totalGeral > 0 ? Math.min(100, (totalRestante / totalGeral) * 100) : 0;

  // Widget 1 — quanto falta pagar
  document.getElementById('kpi-aberto-value').textContent = formatCurrency(totalRestante);
  document.getElementById('kpi-aberto-sub').textContent   = `${fmtPct(pctRestante)} do total ainda em aberto`;
  document.getElementById('kpi-aberto-chart').innerHTML   = renderDonutSVG(pctRestante, 'var(--color-danger)', 'lg');

  // Widget 2 — quanto já foi pago
  document.getElementById('kpi-pago-value').textContent = formatCurrency(totalPago);
  document.getElementById('kpi-pago-sub').textContent   = `${fmtPct(pctPago)} do total já pago`;
  document.getElementById('kpi-pago-chart').innerHTML   = renderDonutSVG(pctPago, 'var(--color-success)', 'lg');
}

// -----------------------------
// Render (roteador de views)
// -----------------------------
function render() {
  if (colVisEl) colVisEl.classList.toggle('hidden', viewMode !== 'table');

  const container  = document.getElementById('div-container');
  const emptyState = document.getElementById('empty-state');

  if (cachedDividas.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    document.getElementById('empty-title').textContent = 'Nenhuma dívida cadastrada';
    document.getElementById('empty-message').textContent = 'Cadastre sua primeira dívida para acompanhar o progresso de pagamento.';
    return;
  }
  emptyState.classList.add('hidden');

  let html = '';
  for (const bloco of BLOCOS) {
    const items = cachedDividas.filter(bloco.filter);
    let content;
    if (items.length === 0) {
      content = `<p class="bloco-empty">${bloco.emptyMsg}</p>`;
    } else if (viewMode === 'table') {
      content = renderTable(items);
    } else if (viewMode === 'gantt') {
      content = renderGantt(items);
    } else {
      content = `<div class="div-cards">${items.map(renderCard).join('')}</div>`;
    }
    html += `
      <div class="bloco-section">
        <div class="bloco-section-header">
          <span class="bloco-section-label">${bloco.label}</span>
          <span class="bloco-section-count">${items.length}</span>
        </div>
        ${content}
      </div>`;
  }

  container.innerHTML = html;
  bindRowClicks();
}

// Bind click nos rows de tabela/gantt para abrir modal de edição
function bindRowClicks() {
  document.querySelectorAll('.divida-tabela-row').forEach((el) => {
    el.addEventListener('click', () => openModalDivida(el.dataset.id));
  });
  document.querySelectorAll('.gantt-row[data-id]').forEach((el) => {
    el.addEventListener('click', () => openModalDivida(el.dataset.id));
  });
}

function renderCard(d) {
  const st      = STATUS_CONFIG[d.status] || STATUS_CONFIG['Ativa'];
  const total   = Number(d.valor_total);
  const pago    = Number(d.valor_pago);
  const restante = Math.max(0, total - pago);
  const pct     = total > 0 ? Math.min(100, (pago / total) * 100) : 0;
  const quitada = d.status === 'Quitada';

  const conta   = cachedContas.find((c) => c.id === d.conta_id);
  const contaNome = conta ? (conta.apelido || conta.nome) : null;

  const fmtDate = (iso) => {
    if (!iso) return null;
    const [y, m, day] = iso.split('-');
    return `${day}/${m}/${y}`;
  };

  const vencimento = fmtDate(d.data_vencimento);
  const inicio     = fmtDate(d.data_inicio);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let vencInfo = '';
  if (d.data_vencimento && !quitada) {
    const vencDate = new Date(d.data_vencimento + 'T00:00:00');
    const diff = Math.round((vencDate - hoje) / 86400000);
    if (diff < 0)       vencInfo = `<span class="div-card-venc-alert">Venceu há ${Math.abs(diff)} dia${Math.abs(diff) !== 1 ? 's' : ''}</span>`;
    else if (diff === 0) vencInfo = `<span class="div-card-venc-alert">Vence hoje</span>`;
    else if (diff <= 30) vencInfo = `<span class="div-card-venc-warn">Vence em ${diff} dia${diff !== 1 ? 's' : ''}</span>`;
    else                 vencInfo = `<span class="div-card-venc-ok">Vence em ${vencimento}</span>`;
  }

  return `
    <div class="div-card" data-id="${d.id}">
      <div class="div-card-header">
        <div class="div-card-title-row">
          <span class="div-card-nome">${d.nome}</span>
          <span class="div-card-badge" style="color:${st.color}; background:${st.bg};">${st.label}</span>
          ${quitada && pago < total ? `<span class="tag-parcial" title="Encerrada antes de quitar o valor total">Parcial</span>` : ''}
        </div>
        ${d.credor ? `<span class="div-card-credor">${d.credor}</span>` : ''}
      </div>

      <div class="div-card-charts">
        <div class="div-card-chart-item">
          ${renderDonutSVG(pct, 'var(--color-success)', 'sm')}
          <span class="div-card-chart-label">Pago</span>
        </div>
        <div class="div-card-chart-item">
          ${renderDonutSVG(Math.max(0, 100 - pct), quitada ? 'var(--color-success)' : 'var(--color-danger)', 'sm')}
          <span class="div-card-chart-label">Restante</span>
        </div>
      </div>

      <div class="div-card-values">
        <div class="div-card-value-item">
          <span class="div-card-value-label">Total</span>
          <span class="div-card-value-num">${formatCurrency(total)}</span>
        </div>
        <div class="div-card-value-item">
          <span class="div-card-value-label">Pago</span>
          <span class="div-card-value-num div-card-value-num--success">${formatCurrency(pago)}</span>
        </div>
        <div class="div-card-value-item">
          <span class="div-card-value-label">Restante</span>
          <span class="div-card-value-num ${quitada ? '' : 'div-card-value-num--danger'}">${formatCurrency(restante)}</span>
        </div>
      </div>

      <div class="div-card-meta">
        ${inicio ? `<span class="div-card-meta-item">Início: ${inicio}</span>` : ''}
        ${vencInfo || (vencimento ? `<span class="div-card-meta-item">Venc.: ${vencimento}</span>` : '')}
        ${d.juros_percentual ? `<span class="div-card-meta-item">${Number(d.juros_percentual).toFixed(2)}% a.m.</span>` : ''}
        ${contaNome ? `<span class="div-card-meta-item">${contaNome}</span>` : ''}
      </div>

      ${d.observacao ? `<p class="div-card-obs">${d.observacao}</p>` : ''}

      <div class="div-card-actions">
        <button class="btn btn-sm btn-ghost div-btn-pagar" data-id="${d.id}" type="button" title="Registrar pagamento">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
          Pagamento
        </button>
        <button class="btn btn-sm btn-ghost div-btn-historico" data-id="${d.id}" type="button" title="Ver histórico de pagamentos">
          Histórico
        </button>
        <button class="btn btn-sm btn-ghost div-btn-editar" data-id="${d.id}" type="button" title="Editar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          Editar
        </button>
      </div>
    </div>
  `;
}

// -----------------------------
// Bind events
// -----------------------------
function bindEvents() {
  // Nova dívida
  document.getElementById('btn-nova-divida').addEventListener('click', () => openModalDivida(null));
  document.querySelector('[data-trigger-nova]')?.addEventListener('click', () => openModalDivida(null));

  // Salvar dívida
  document.getElementById('form-divida').addEventListener('submit', saveDivida);

  // Excluir
  document.getElementById('btn-deletar-divida').addEventListener('click', () => {
    if (!editingId) return;
    pendingDeleteId = editingId;
    closeModal('modal-divida');
    openModal('modal-confirmar');
  });
  document.getElementById('btn-confirmar-excluir').addEventListener('click', confirmarExcluir);

  // View toggle
  document.getElementById('view-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    document.querySelectorAll('#view-toggle .view-toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    viewMode = btn.dataset.view;
    render();
  });

  // Delegação: botões pagar/editar/histórico nos cards
  document.getElementById('div-container').addEventListener('click', (e) => {
    const btnPagar     = e.target.closest('.div-btn-pagar');
    const btnEditar    = e.target.closest('.div-btn-editar');
    const btnHistorico = e.target.closest('.div-btn-historico');
    if (btnPagar)     openHistoricoDividaModal(btnPagar.dataset.id);   // registro (2 modos)
    if (btnEditar)    openModalDivida(btnEditar.dataset.id);
    if (btnHistorico) openHistoricoViewDivida(btnHistorico.dataset.id); // visualização
  });

  document.getElementById('btn-salvar-hist-divida').addEventListener('click', saveHistoricoDivida);

  document.getElementById('hist-divida-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    const mode = btn.dataset.histSeg;
    document.querySelectorAll('#hist-divida-seg .view-toggle-btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.histSeg === mode));
    document.getElementById('hist-divida-total-panel').classList.toggle('hidden', mode !== 'total');
    document.getElementById('hist-divida-extrato-panel').classList.toggle('hidden', mode !== 'extrato');
  });

  document.getElementById('btn-hist-divida-add-row').addEventListener('click', () => {
    let listEl = document.querySelector('#hist-divida-extrato-list .hist-extrato-list');
    if (!listEl) {
      listEl = document.createElement('div');
      listEl.className = 'hist-extrato-list';
      document.getElementById('hist-divida-extrato-list').appendChild(listEl);
    }
    const row = makeHistRow();
    listEl.appendChild(row);
    row.querySelector('.hist-row-data')?.focus();
  });

  // Select de contato: "__new__" abre prompt pra criar inline
  document.getElementById('div-contato')?.addEventListener('change', async (e) => {
    if (e.target.value !== '__new__') return;
    e.target.value = '';
    const nome = window.prompt('Nome do novo contato (cliente/fornecedor):');
    if (!nome || !nome.trim()) return;
    const novo = await criarContatoInline(nome.trim());
    if (novo) {
      populateContatoSelect();
      e.target.value = novo.id;
    }
  });

  // Zoom do Gantt — delegado em document (sobrevive a re-renders)
  document.addEventListener('click', (e) => {
    const zoomBtn = e.target.closest('[data-gantt-zoom]');
    if (zoomBtn) { ganttZoom = zoomBtn.dataset.ganttZoom; if (viewMode === 'gantt') render(); }

    const closeBtn = e.target.closest('[data-close-modal]');
    if (closeBtn) closeModal(closeBtn.dataset.closeModal);
  });
}

// -----------------------------
// Modal: nova / editar dívida
// -----------------------------
function openModalDivida(id) {
  editingId = id || null;
  const d   = id ? cachedDividas.find((x) => x.id === id) : null;

  document.getElementById('modal-divida-title').textContent = d ? 'Editar dívida' : 'Nova dívida';
  document.getElementById('btn-deletar-divida').classList.toggle('hidden', !d);

  // Preenche campos
  document.getElementById('div-nome').value            = d?.nome             ?? '';
  document.getElementById('div-credor').value          = d?.credor           ?? '';
  document.getElementById('div-valor-total').value     = d?.valor_total      ?? '';
  document.getElementById('div-juros').value           = d?.juros_percentual ?? '';
  document.getElementById('div-data-inicio').value     = d?.data_inicio      ?? new Date().toISOString().slice(0, 10);
  document.getElementById('div-data-vencimento').value = d?.data_vencimento  ?? '';
  document.getElementById('div-status').value          = d?.status           ?? 'Ativa';
  document.getElementById('div-conta').value           = d?.conta_id         ?? '';
  document.getElementById('div-contato').value         = d?.contato_id       ?? '';
  document.getElementById('div-observacao').value      = d?.observacao       ?? '';

  openModal('modal-divida');
}

// -----------------------------
// Salvar dívida
// -----------------------------
async function saveDivida(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-salvar-divida');

  const nome            = document.getElementById('div-nome').value.trim();
  const credor          = document.getElementById('div-credor').value.trim() || null;
  const valor_total     = parseFloat(document.getElementById('div-valor-total').value);
  const juros_raw       = document.getElementById('div-juros').value;
  const juros_percentual = juros_raw ? parseFloat(juros_raw) : null;
  const data_inicio     = document.getElementById('div-data-inicio').value;
  const data_vencimento = document.getElementById('div-data-vencimento').value || null;
  const status          = document.getElementById('div-status').value;
  const conta_id        = document.getElementById('div-conta').value || null;
  const contatoRaw      = document.getElementById('div-contato')?.value || '';
  const contato_id      = (contatoRaw && contatoRaw !== '__new__') ? contatoRaw : null;
  const observacao      = document.getElementById('div-observacao').value.trim() || null;

  if (!nome)              { showToast('Informe o nome da dívida', 'error'); return; }
  if (!valor_total || isNaN(valor_total) || valor_total <= 0) {
    showToast('Informe um valor total válido', 'error'); return;
  }
  if (!data_inicio)       { showToast('Informe a data de início', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Salvando…';

  const user = await getCurrentUser();
  const payload = { nome, credor, valor_total, juros_percentual, data_inicio, data_vencimento, status, conta_id, contato_id, observacao, user_id: user.id };

  let error;
  if (editingId) {
    ({ error } = await supabase.from('dividas').update(payload).eq('id', editingId));
  } else {
    ({ error } = await supabase.from('dividas').insert({ ...payload, valor_pago: 0 }));
  }

  btn.disabled = false;
  btn.textContent = 'Salvar';

  if (error) { showToast('Erro ao salvar: ' + error.message, 'error', 8000); return; }

  showToast(editingId ? 'Dívida atualizada' : 'Dívida cadastrada', 'success');
  closeModal('modal-divida');
  await loadAll();
}

// -----------------------------
// Modal: visualizar histórico (read-only)
// -----------------------------
function openHistoricoViewDivida(id) {
  const d = cachedDividas.find((x) => x.id === id);
  if (!d) return;

  document.getElementById('hist-view-divida-title').textContent = `Histórico — ${d.nome}`;

  const entradas = cachedDividaHistorico
    .filter((h) => h.divida_id === id)
    .sort((a, b) => b.data.localeCompare(a.data));

  const content = document.getElementById('hist-view-divida-content');
  if (entradas.length === 0) {
    content.innerHTML = `
      <div style="text-align:center; padding: var(--space-6); color: var(--color-text-muted); font-size: var(--fs-sm);">
        Nenhum pagamento registrado no extrato ainda.<br>
        Use o botão <strong>Pagamento</strong> para registrar.
      </div>`;
  } else {
    const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
    const rows = entradas.map((h) => `
      <div class="proj-hist-row">
        <span class="proj-hist-date">${fmtDate(h.data)}</span>
        <span class="proj-hist-name">${escapeHtml(h.descricao || 'Pagamento')}</span>
        <span class="proj-hist-value">${formatCurrency(Number(h.valor))}</span>
      </div>`).join('');
    const total = entradas.reduce((s, h) => s + Number(h.valor), 0);
    content.innerHTML = `
      <div class="proj-hist-list">${rows}</div>
      <div style="display:flex; justify-content:flex-end; padding: var(--space-3) var(--space-4); font-weight: var(--fw-bold); font-size: var(--fs-sm); border-top: 1px solid var(--color-border); margin-top: var(--space-1);">
        Total: ${formatCurrency(total)}
      </div>`;
  }

  openModal('modal-historico-view-divida');
}

// -----------------------------
// Excluir
// -----------------------------
async function confirmarExcluir() {
  if (!pendingDeleteId) return;

  const { error } = await supabase.from('dividas').delete().eq('id', pendingDeleteId);

  if (error) { showToast('Erro ao excluir: ' + error.message, 'error', 8000); return; }

  showToast('Dívida excluída', 'success');
  closeModal('modal-confirmar');
  pendingDeleteId = null;
  await loadAll();
}

// -----------------------------
// Helpers
// -----------------------------
function populateContaSelect(selectId) {
  const sel = document.getElementById(selectId);
  const current = sel.value;
  sel.innerHTML = '<option value="">Nenhuma</option>' +
    cachedContas.map((c) => `<option value="${c.id}">${c.apelido || c.nome}</option>`).join('');
  if (current) sel.value = current;
}

// =============================================================
// View: Tabela
// =============================================================
function renderTable(dividas) {
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const rows = dividas.map((d) => {
    const st      = STATUS_CONFIG[d.status] || STATUS_CONFIG['Ativa'];
    const total   = Number(d.valor_total);
    const pago    = Number(d.valor_pago);
    const restante = Math.max(0, total - pago);
    const pct     = total > 0 ? Math.min(100, (pago / total) * 100) : 0;
    const quitada = d.status === 'Quitada';
    const cor     = st.color;
    const conta   = cachedContas.find((c) => c.id === d.conta_id);

    const vencInfo = (() => {
      if (!d.data_vencimento || quitada) return fmtDate(d.data_vencimento);
      const vencDate = new Date(d.data_vencimento + 'T00:00:00');
      const diff = Math.round((vencDate - today) / 86400000);
      if (diff < 0)       return `<span style="color:var(--color-danger);font-weight:600;">Vencida há ${Math.abs(diff)}d</span>`;
      if (diff === 0)     return `<span style="color:var(--color-danger);font-weight:600;">Vence hoje</span>`;
      if (diff <= 30)     return `<span style="color:var(--color-warning);font-weight:600;">Em ${diff}d</span>`;
      return fmtDate(d.data_vencimento);
    })();

    const pctCell = `
      <span class="divida-tabela-pct" style="--divida-cor:${cor};">
        <span class="divida-tabela-pct-bar"><span class="divida-tabela-pct-fill" style="width:${pct.toFixed(1)}%;"></span></span>
        <span class="divida-tabela-pct-text">${pct.toFixed(0)}%</span>
      </span>`;

    const pctRestanteCell = `
      <span class="divida-tabela-pct" style="--divida-cor:${quitada ? 'var(--color-success)' : 'var(--color-danger)'};">
        <span class="divida-tabela-pct-bar"><span class="divida-tabela-pct-fill" style="width:${Math.max(0, 100 - pct).toFixed(1)}%;"></span></span>
        <span class="divida-tabela-pct-text">${Math.max(0, 100 - pct).toFixed(0)}%</span>
      </span>`;

    return `
      <tr class="divida-tabela-row" data-id="${d.id}">
        <td>
          <span class="divida-tabela-nome">
            <span class="divida-tabela-dot" style="background:${cor};"></span>
            ${escapeHtml(d.nome)}
          </span>
        </td>
        <td data-col="credor" class="text-muted-if-empty">${d.credor ? escapeHtml(d.credor) : '<span class="text-muted">—</span>'}</td>
        <td data-col="status">
          <span class="div-card-badge" style="color:${st.color};background:${st.bg};">${st.label}</span>
          ${quitada && pago < total ? `<span class="tag-parcial" title="Encerrada antes de quitar o valor total">Parcial</span>` : ''}
        </td>
        <td data-col="total"   class="text-right tabular">${formatCurrency(total)}</td>
        <td data-col="pago"    class="text-right tabular" style="color:var(--color-success);">${formatCurrency(pago)}</td>
        <td data-col="restante" class="text-right tabular${quitada ? '' : ' text-bold'}" style="${quitada ? '' : 'color:var(--color-danger);'}">${formatCurrency(restante)}</td>
        <td data-col="pct">${pctCell}</td>
        <td data-col="pct-restante">${pctRestanteCell}</td>
        <td data-col="vencimento" class="tabular">${vencInfo}</td>
        <td data-col="inicio"   class="tabular">${fmtDate(d.data_inicio)}</td>
        <td data-col="juros"    class="tabular">${d.juros_percentual ? `${Number(d.juros_percentual).toFixed(2)}% a.m.` : '<span class="text-muted">—</span>'}</td>
        <td data-col="conta">${conta ? escapeHtml(conta.apelido || conta.nome) : '<span class="text-muted">—</span>'}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="divida-tabela-wrapper">
      <table class="divida-tabela">
        <thead>
          <tr>
            <th>Nome</th>
            <th data-col="credor">Credor</th>
            <th data-col="status">Status</th>
            <th data-col="total"    class="text-right">Total</th>
            <th data-col="pago"     class="text-right">Pago</th>
            <th data-col="restante" class="text-right">Restante</th>
            <th data-col="pct">% Pago</th>
            <th data-col="pct-restante">% Restante</th>
            <th data-col="vencimento">Vencimento</th>
            <th data-col="inicio">Início</th>
            <th data-col="juros">Juros</th>
            <th data-col="conta">Conta</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// =============================================================
// View: Gantt
// =============================================================
function getGanttRange(zoom) {
  const now = new Date(today);
  const MES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  if (zoom === '1ano') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 12, 0);
    const cols  = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return { label: MES[d.getMonth()], sublabel: String(d.getFullYear()).slice(2), isCurrent: i === 0 };
    });
    return { start, end, cols };
  }

  if (zoom === '3anos') {
    // quarterly (12 quarters)
    const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const end   = new Date(start.getFullYear() + 3, start.getMonth(), 0);
    const cols  = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth() + i * 3, 1);
      const q = Math.floor(d.getMonth() / 3) + 1;
      const isCurrentQ = d.getFullYear() === now.getFullYear() && q === Math.floor(now.getMonth() / 3) + 1;
      return { label: `Q${q}`, sublabel: String(d.getFullYear()).slice(2), isCurrent: isCurrentQ };
    });
    return { start, end, cols };
  }

  // 5anos
  const start = new Date(now.getFullYear(), 0, 1);
  const end   = new Date(now.getFullYear() + 5, 0, 0);
  const cols  = Array.from({ length: 5 }, (_, i) => ({
    label: String(now.getFullYear() + i),
    isCurrent: i === 0,
  }));
  return { start, end, cols };
}

function renderGantt(dividas) {
  const { start: rangeStart, end: rangeEnd, cols } = getGanttRange(ganttZoom);
  const rangeMs = rangeEnd - rangeStart;

  const zoomBtns = [
    { id: '1ano',  label: '1 ano'  },
    { id: '3anos', label: '3 anos' },
    { id: '5anos', label: '5 anos' },
  ].map((z) =>
    `<button class="timeline-zoom-btn ${ganttZoom === z.id ? 'active' : ''}" data-gantt-zoom="${z.id}" type="button">${z.label}</button>`
  ).join('');

  const colHeaders = cols.map((c) =>
    `<div class="timeline-month ${c.isCurrent ? 'timeline-month-current' : ''}">${c.label}${c.sublabel ? `<span class="timeline-month-year">${c.sublabel}</span>` : ''}</div>`
  ).join('');

  const todayPct = Math.min(100, Math.max(0, ((today - rangeStart) / rangeMs) * 100));
  const todayLine = (today >= rangeStart && today <= rangeEnd)
    ? `<div class="timeline-today" style="left:calc(220px + (100% - 220px) * ${todayPct / 100});" title="Hoje"></div>`
    : '';

  const bars = dividas.map((d) => {
    const st     = STATUS_CONFIG[d.status] || STATUS_CONFIG['Ativa'];
    const cor    = st.color;
    const dStart = d.data_inicio  ? new Date(d.data_inicio  + 'T00:00:00') : rangeStart;
    const dEnd   = d.data_vencimento ? new Date(d.data_vencimento + 'T23:59:59') : rangeEnd;

    const barStart  = dStart < rangeStart ? rangeStart : dStart;
    const barEnd    = dEnd   > rangeEnd   ? rangeEnd   : dEnd;

    const total   = Number(d.valor_total);
    const pago    = Number(d.valor_pago);
    const fillPct = total > 0 ? Math.min(100, (pago / total) * 100) : 0;

    if (barStart > rangeEnd || barEnd < rangeStart) {
      return `
        <div class="gantt-row timeline-row" data-id="${d.id}">
          <div class="timeline-row-label">
            <span class="timeline-row-dot" style="background:${cor};"></span>
            <span class="timeline-row-name">${escapeHtml(d.nome)}</span>
          </div>
          <div class="timeline-row-track">
            <span class="timeline-row-empty">Fora do período visível</span>
          </div>
        </div>`;
    }

    const leftPct  = Math.max(0, ((barStart - rangeStart) / rangeMs) * 100);
    const widthPct = Math.max(1.5, ((barEnd - barStart) / rangeMs) * 100);

    const fillBar = `<span class="timeline-bar-fill" style="width:${fillPct}%;background:${cor};"></span>`;
    const pctLeft = Math.min(fillPct, 82).toFixed(1);
    const tooltip = `${d.nome} · ${formatCurrency(pago)} pago de ${formatCurrency(total)} (${fillPct.toFixed(0)}%)`;

    return `
      <div class="gantt-row timeline-row" data-id="${d.id}">
        <div class="timeline-row-label">
          <span class="timeline-row-dot" style="background:${cor};"></span>
          <span class="timeline-row-name">${escapeHtml(d.nome)}</span>
        </div>
        <div class="timeline-row-track">
          <div class="timeline-bar" style="left:${leftPct}%;width:${widthPct}%;--projeto-cor:${cor};" title="${escapeHtml(tooltip)}">
            ${fillBar}
            <span class="timeline-bar-pct" style="left:${pctLeft}%;">${fillPct.toFixed(0)}%</span>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="timeline-toolbar">
      <span class="timeline-toolbar-label">Escala:</span>
      <div class="timeline-zoom-group">${zoomBtns}</div>
    </div>
    <div class="timeline-wrapper" style="--timeline-cols:${cols.length};">
      <div class="timeline-header">
        <div class="timeline-row-label timeline-row-label-header">Dívida</div>
        <div class="timeline-months">${colHeaders}</div>
      </div>
      <div class="timeline-body">
        ${bars || '<div class="empty-state"><p class="empty-state-message">Nenhuma dívida no período visível.</p></div>'}
        ${todayLine}
      </div>
    </div>
  `;
}

// =============================================================
// Donut SVG (idêntico ao de investimentos)
// =============================================================
function renderDonutSVG(pct, color = 'var(--color-primary)', size = 'md') {
  const radius = 36;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  return `
    <div class="invest-donut-wrapper invest-donut-${size}">
      <svg viewBox="0 0 100 100" class="invest-donut" aria-hidden="true">
        <circle cx="50" cy="50" r="${radius}" fill="none" stroke="var(--color-surface-alt)" stroke-width="${stroke}"/>
        <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke}"
          stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}"
          stroke-linecap="round"
          transform="rotate(-90 50 50)"/>
      </svg>
      <div class="invest-donut-center">
        <span class="invest-donut-pct${pct > 100 ? ' invest-donut-pct--over' : ''}">${fmtPct(pct)}</span>
      </div>
    </div>
  `;
}

// Formata porcentagem: 1 decimal exceto quando exato 100%
function fmtPct(pct) {
  return pct.toFixed(1) === '100.0' ? '100%' : `${pct.toFixed(1)}%`;
}

// =============================================================
// Histórico passado — Dívidas
// =============================================================
function makeHistRow(entry = null) {
  const div = document.createElement('div');
  div.className = 'hist-row';
  div.innerHTML = `
    <input type="date" class="input hist-row-data" value="${entry?.data || ''}">
    <input type="number" class="input hist-row-valor" value="${entry?.valor ?? ''}" step="0.01" min="0.01" placeholder="Valor (R$)">
    <input type="text" class="input hist-row-desc" value="${escapeHtml(entry?.descricao || '')}" placeholder="Descrição (opcional)" maxlength="100">
    <button type="button" class="hist-row-del" title="Remover">×</button>
  `;
  div.querySelector('.hist-row-del').addEventListener('click', () => div.remove());
  return div;
}

function openHistoricoDividaModal(id) {
  const d = cachedDividas.find((x) => x.id === id);
  if (!d) return;
  historicoDividaId = id;

  document.getElementById('hist-divida-title').textContent = `Histórico — ${d.nome}`;

  // Reset to total mode
  document.querySelectorAll('#hist-divida-seg .view-toggle-btn')
    .forEach((b) => b.classList.toggle('active', b.dataset.histSeg === 'total'));
  document.getElementById('hist-divida-total-panel').classList.remove('hidden');
  document.getElementById('hist-divida-extrato-panel').classList.add('hidden');

  // Pre-fill valor pago
  document.getElementById('hist-divida-total-valor').value = Number(d.valor_pago) > 0 ? d.valor_pago : '';

  // Render extrato rows from cached historico
  const entradas = cachedDividaHistorico.filter((h) => h.divida_id === id);
  const container = document.getElementById('hist-divida-extrato-list');
  container.innerHTML = '';
  if (entradas.length > 0) {
    const listEl = document.createElement('div');
    listEl.className = 'hist-extrato-list';
    for (const h of entradas) listEl.appendChild(makeHistRow(h));
    container.appendChild(listEl);
  }

  openModal('modal-historico-divida');
}

async function saveHistoricoDivida() {
  const btn = document.getElementById('btn-salvar-hist-divida');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';
  const mode = document.querySelector('#hist-divida-seg .view-toggle-btn.active')?.dataset.histSeg || 'total';
  const d = cachedDividas.find((x) => x.id === historicoDividaId);
  if (!d) { btn.disabled = false; btn.textContent = 'Salvar'; return; }

  try {
    if (mode === 'total') {
      const valor = parseFloat(document.getElementById('hist-divida-total-valor').value) || 0;
      const novoStatus = valor >= Number(d.valor_total) ? 'Quitada'
        : (d.status === 'Quitada' ? 'Ativa' : d.status);
      const { error } = await supabase
        .from('dividas')
        .update({ valor_pago: valor, status: novoStatus })
        .eq('id', historicoDividaId);
      if (error) throw error;
      showToast('Valor pago atualizado', 'success');
    } else {
      // Collect rows from DOM
      const rows = [];
      document.querySelectorAll('#hist-divida-extrato-list .hist-row').forEach((rowEl) => {
        const data = rowEl.querySelector('.hist-row-data').value;
        const valor = parseFloat(rowEl.querySelector('.hist-row-valor').value);
        const descricao = rowEl.querySelector('.hist-row-desc').value.trim() || null;
        if (data && valor && valor > 0) rows.push({ data, valor, descricao });
      });

      const user = await getCurrentUser();
      if (!user) throw new Error('Sessão expirada');

      // Full replace historico
      const { error: delErr } = await supabase
        .from('pagamentos_divida_historico')
        .delete()
        .eq('divida_id', historicoDividaId);
      if (delErr) throw delErr;

      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from('pagamentos_divida_historico')
          .insert(rows.map((r) => ({ ...r, divida_id: historicoDividaId, user_id: user.id })));
        if (insErr) throw insErr;
      }

      // Recalculate valor_pago from sum of extrato entries
      const totalPago = rows.reduce((s, r) => s + Number(r.valor), 0);
      const novoStatus = totalPago >= Number(d.valor_total) ? 'Quitada'
        : (d.status === 'Quitada' && totalPago < Number(d.valor_total) ? 'Ativa' : d.status);
      const { error: updErr } = await supabase
        .from('dividas')
        .update({ valor_pago: totalPago, status: novoStatus })
        .eq('id', historicoDividaId);
      if (updErr) throw updErr;

      showToast(`${rows.length} entrada${rows.length !== 1 ? 's' : ''} salva${rows.length !== 1 ? 's' : ''}`, 'success');
    }

    closeModal('modal-historico-divida');
    await loadAll();
  } catch (err) {
    showToast('Erro ao salvar: ' + (err?.message || String(err)), 'error', 8000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}

