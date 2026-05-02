// =============================================================
// FinFlow — Página: Dívidas
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatCurrency } from '../lib/compromissos-config.js';

// -----------------------------
// Status config
// -----------------------------
const STATUS_CONFIG = {
  'Ativa':      { label: 'Ativa',      color: 'var(--color-primary)', bg: 'var(--color-primary-50)' },
  'Atrasada':   { label: 'Atrasada',   color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)' },
  'Negociando': { label: 'Negociando', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  'Quitada':    { label: 'Quitada',    color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
};

// -----------------------------
// State
// -----------------------------
let cachedDividas = [];
let cachedContas  = [];
let editingId     = null;
let pagandoId     = null;
let pendingDeleteId = null;
let filterStatus  = 'todas';

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('dividas');
  bindEvents();
  await loadAll();
});

// -----------------------------
// Load
// -----------------------------
async function loadAll() {
  const [divRes, contRes] = await Promise.all([
    supabase.from('dividas').select('*').order('created_at', { ascending: false }),
    supabase.from('contas').select('id, nome, apelido').order('nome'),
  ]);

  if (divRes.error) {
    showToast('Erro ao carregar dívidas: ' + divRes.error.message, 'error', 8000);
    return;
  }

  cachedDividas = divRes.data || [];
  cachedContas  = contRes.data || [];

  populateContaSelect('div-conta');
  renderKPIs();
  renderDividas();
}

// -----------------------------
// KPIs
// -----------------------------
function renderKPIs() {
  const ativas = cachedDividas.filter((d) => d.status !== 'Quitada');

  const totalDivida  = ativas.reduce((s, d) => s + Number(d.valor_total), 0);
  const totalPago    = cachedDividas.reduce((s, d) => s + Number(d.valor_pago), 0);
  const totalRestante = ativas.reduce((s, d) => s + Math.max(0, Number(d.valor_total) - Number(d.valor_pago)), 0);

  const container = document.getElementById('div-kpis');
  container.innerHTML = `
    <div class="div-kpi">
      <span class="div-kpi-label">Total em dívidas ativas</span>
      <span class="div-kpi-value">${formatCurrency(totalDivida)}</span>
      <span class="div-kpi-hint">${ativas.length} dívida${ativas.length !== 1 ? 's' : ''} ativa${ativas.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="div-kpi">
      <span class="div-kpi-label">Total pago</span>
      <span class="div-kpi-value div-kpi-value--success">${formatCurrency(totalPago)}</span>
      <span class="div-kpi-hint">Em todas as dívidas</span>
    </div>
    <div class="div-kpi">
      <span class="div-kpi-label">Total restante</span>
      <span class="div-kpi-value div-kpi-value--danger">${formatCurrency(totalRestante)}</span>
      <span class="div-kpi-hint">Nas dívidas ativas</span>
    </div>
  `;
}

// -----------------------------
// Cards
// -----------------------------
function renderDividas() {
  const container  = document.getElementById('div-cards');
  const emptyState = document.getElementById('empty-state');

  const filtered = filterStatus === 'todas'
    ? cachedDividas
    : cachedDividas.filter((d) => d.status === filterStatus);

  // Update filter pills count
  document.querySelectorAll('#status-filters .filter-pill').forEach((btn) => {
    const s = btn.dataset.status;
    const count = s === 'todas'
      ? cachedDividas.length
      : cachedDividas.filter((d) => d.status === s).length;
    btn.textContent = s === 'todas' ? `Todas (${count})` : `${STATUS_CONFIG[s]?.label ?? s} (${count})`;
  });

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    const title = document.getElementById('empty-title');
    const msg   = document.getElementById('empty-message');
    if (filterStatus === 'todas') {
      title.textContent = 'Nenhuma dívida cadastrada';
      msg.textContent   = 'Cadastre sua primeira dívida para acompanhar o progresso de pagamento.';
    } else {
      title.textContent = `Nenhuma dívida com status "${STATUS_CONFIG[filterStatus]?.label ?? filterStatus}"`;
      msg.textContent   = 'Tente outro filtro ou cadastre uma nova dívida.';
    }
    return;
  }

  emptyState.classList.add('hidden');
  container.innerHTML = filtered.map(renderCard).join('');
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
        </div>
        ${d.credor ? `<span class="div-card-credor">${d.credor}</span>` : ''}
      </div>

      <div class="div-card-progress-wrap">
        <div class="div-card-progress-bar">
          <div class="div-card-progress-fill ${quitada ? 'div-card-progress-fill--quitada' : ''}" style="width: ${pct.toFixed(1)}%;"></div>
        </div>
        <span class="div-card-progress-pct">${pct.toFixed(0)}%</span>
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
        ${!quitada ? `
        <button class="btn btn-sm btn-ghost div-btn-pagar" data-id="${d.id}" type="button" title="Registrar pagamento">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
          Pagamento
        </button>` : ''}
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

  // Pagamento
  document.getElementById('form-pagamento').addEventListener('submit', registrarPagamento);

  // Filtros
  document.getElementById('status-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    document.querySelectorAll('#status-filters .filter-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    filterStatus = btn.dataset.status;
    renderDividas();
  });

  // Cards: delegação de eventos
  document.getElementById('div-cards').addEventListener('click', (e) => {
    const btnPagar  = e.target.closest('.div-btn-pagar');
    const btnEditar = e.target.closest('.div-btn-editar');
    if (btnPagar)  openModalPagamento(btnPagar.dataset.id);
    if (btnEditar) openModalDivida(btnEditar.dataset.id);
  });

  // data-close-modal buttons (header X e cancelar)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-close-modal]');
    if (btn) closeModal(btn.dataset.closeModal);
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
  const observacao      = document.getElementById('div-observacao').value.trim() || null;

  if (!nome)              { showToast('Informe o nome da dívida', 'error'); return; }
  if (!valor_total || isNaN(valor_total) || valor_total <= 0) {
    showToast('Informe um valor total válido', 'error'); return;
  }
  if (!data_inicio)       { showToast('Informe a data de início', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Salvando…';

  const user = await getCurrentUser();
  const payload = { nome, credor, valor_total, juros_percentual, data_inicio, data_vencimento, status, conta_id, observacao, user_id: user.id };

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
// Modal: registrar pagamento
// -----------------------------
function openModalPagamento(id) {
  const d = cachedDividas.find((x) => x.id === id);
  if (!d) return;
  pagandoId = id;

  const pago     = Number(d.valor_pago);
  const restante = Math.max(0, Number(d.valor_total) - pago);

  document.getElementById('pag-divida-nome').textContent    = d.nome;
  document.getElementById('pag-valor-pago-atual').textContent = formatCurrency(pago);
  document.getElementById('pag-valor-restante').textContent  = formatCurrency(restante);
  document.getElementById('pag-valor').value = '';

  openModal('modal-pagamento');
}

async function registrarPagamento(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-salvar-pagamento');

  const valorNovo = parseFloat(document.getElementById('pag-valor').value);
  if (!valorNovo || isNaN(valorNovo) || valorNovo <= 0) {
    showToast('Informe um valor válido', 'error'); return;
  }

  const d = cachedDividas.find((x) => x.id === pagandoId);
  if (!d) return;

  const novoTotal = Number(d.valor_pago) + valorNovo;
  const novoStatus = novoTotal >= Number(d.valor_total) ? 'Quitada' : d.status;

  btn.disabled = true;
  btn.textContent = 'Confirmando…';

  const { error } = await supabase
    .from('dividas')
    .update({ valor_pago: novoTotal, status: novoStatus })
    .eq('id', pagandoId);

  btn.disabled = false;
  btn.textContent = 'Confirmar';

  if (error) { showToast('Erro ao registrar pagamento: ' + error.message, 'error', 8000); return; }

  const msg = novoStatus === 'Quitada' ? '🎉 Dívida quitada!' : 'Pagamento registrado';
  showToast(msg, 'success');
  closeModal('modal-pagamento');
  await loadAll();
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
