// =============================================================
// FinFlow — Contatos
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar }                  from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase }                     from '../lib/supabase.js';
import { showToast }                    from '../components/toast.js';
import { formatCurrency }               from '../lib/compromissos-config.js';
import { escapeHtml } from '../lib/utils.js';

// ── State ─────────────────────────────────────────────────────
let cachedContatos      = [];
let cachedSubcategorias = [];
let cachedCategorias    = [];
let cachedContas        = [];
let selectedId          = null;
let editingId           = null;
let pendingDeleteId     = null;
let filterTipo          = 'all';
let searchQuery         = '';
let activeTab           = 'dados';

const TIPO_LABELS = { cliente: 'Cliente', fornecedor: 'Fornecedor', ambos: 'Cliente / Fornecedor' };
const TIPO_COLORS = { cliente: '#3b82f6', fornecedor: '#8b5cf6', ambos: '#64748b' };

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('contatos');
  initTutorial('contatos');
  await loadData();
  bindEvents();
  renderList();
});

async function loadData() {
  const [contatosRes, subRes, catRes, contasRes] = await Promise.all([
    supabase.from('contatos').select('*').order('nome'),
    supabase.from('subcategorias').select('id, nome, apelido, categoria_id').neq('status', 'arquivada').order('nome'),
    supabase.from('categorias').select('id, nome').order('nome'),
    supabase.from('contas').select('id, nome, apelido').order('nome'),
  ]);
  cachedContatos      = contatosRes.data || [];
  cachedSubcategorias = subRes.data      || [];
  cachedCategorias    = catRes.data      || [];
  cachedContas        = contasRes.data   || [];
}

async function reloadContatos() {
  const { data } = await supabase.from('contatos').select('*').order('nome');
  cachedContatos = data || [];
}

// ── List ──────────────────────────────────────────────────────
function filteredContatos() {
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = norm(searchQuery);
  return cachedContatos.filter((c) => {
    if (filterTipo !== 'all' && c.tipo !== filterTipo) return false;
    if (!q) return true;
    return norm(c.nome).includes(q) || norm(c.nome_extrato || '').includes(q) || norm(c.email || '').includes(q);
  });
}

function renderList() {
  const list = document.getElementById('ct-list');
  const contatos = filteredContatos();

  if (contatos.length === 0) {
    list.innerHTML = `<div class="ctp-list-empty">Nenhum contato encontrado.</div>`;
    return;
  }

  list.innerHTML = contatos.map((c) => {
    const initials = avatarInitials(c.nome);
    const color    = TIPO_COLORS[c.tipo] || '#64748b';
    const isArq    = c.status === 'arquivado';
    const meta     = [TIPO_LABELS[c.tipo] || c.tipo, isArq ? 'Arquivado' : null].filter(Boolean).join(' · ');
    return `<div class="ctp-list-item ${c.id === selectedId ? 'is-selected' : ''} ${isArq ? 'is-archived' : ''}"
                 data-id="${c.id}" role="button" tabindex="0">
      <div class="ctp-list-avatar" style="background:${color}">${initials}</div>
      <div class="ctp-list-info">
        <div class="ctp-list-name">${escapeHtml(c.nome)}</div>
        <div class="ctp-list-meta">${escapeHtml(meta)}</div>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.ctp-list-item').forEach((el) => {
    el.addEventListener('click', () => selectContact(el.dataset.id));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectContact(el.dataset.id); });
  });
}

// ── Detail ────────────────────────────────────────────────────
async function selectContact(id) {
  selectedId = id;
  renderList();

  const c = cachedContatos.find((x) => x.id === id);
  if (!c) return;

  document.getElementById('ct-detail-empty').classList.add('hidden');
  document.getElementById('ct-detail-content').classList.remove('hidden');

  renderDetailHeader(c);
  switchTab('dados');
  renderDadosTab(c);
  loadBancoTab(id);
  loadTransacoesTab(id);
}

function renderDetailHeader(c) {
  const initials = avatarInitials(c.nome);
  const color    = TIPO_COLORS[c.tipo] || '#64748b';
  const isArq    = c.status === 'arquivado';

  const avatarEl = document.getElementById('ct-detail-avatar');
  avatarEl.style.background  = color;
  avatarEl.textContent        = initials;

  document.getElementById('ct-detail-name').textContent  = c.nome;
  document.getElementById('ct-detail-tipo').textContent  = TIPO_LABELS[c.tipo] || c.tipo;

  const statusBadge = document.getElementById('ct-detail-status-badge');
  statusBadge.classList.toggle('hidden', !isArq);

  const archBtn = document.getElementById('btn-arquivar-contato');
  archBtn.textContent  = isArq ? 'Reativar' : 'Arquivar';
  archBtn.dataset.id   = c.id;

  document.getElementById('btn-editar-contato').dataset.id = c.id;
  document.getElementById('btn-deletar-contato').dataset.id = c.id;
}

function renderDadosTab(c) {
  const fields = [
    { label: 'Nome',           value: c.nome },
    { label: 'Tipo',           value: TIPO_LABELS[c.tipo] || c.tipo },
    { label: 'Nome no extrato', value: c.nome_extrato, hint: 'Usado para reconhecimento por texto' },
    { label: 'E-mail',         value: c.email },
    { label: 'Telefone',       value: c.telefone },
    { label: 'Documento',      value: c.documento },
    { label: 'Observação',     value: c.observacao, full: true },
  ];

  document.getElementById('ct-dados-content').innerHTML = fields.map((f) => `
    <div class="ctp-field${f.full ? ' ctp-field--full' : ''}">
      <div class="ctp-field-label">${f.label}</div>
      <div class="${f.value ? 'ctp-field-value' : 'ctp-field-empty'}">${f.value ? escapeHtml(f.value) : '—'}</div>
      ${f.hint && f.value ? `<div class="ctp-field-hint">${f.hint}</div>` : ''}
    </div>`).join('');
}

async function loadBancoTab(contatoId) {
  const panel = document.getElementById('ct-banco-content');
  panel.innerHTML = '<div class="ctp-loading">Carregando…</div>';

  const { data, error } = await supabase
    .from('contato_banco_descs')
    .select('id, banco_desc, last_subcategoria_id, created_at')
    .eq('contato_id', contatoId)
    .order('created_at', { ascending: false });

  if (error && /relation.*contato_banco_descs/i.test(error.message)) {
    panel.innerHTML = `<div class="ctp-empty-state">Tabela não encontrada. Execute a migration 0030_contato_banco_descs.sql no Supabase.</div>`;
    return;
  }

  if (!data || data.length === 0) {
    panel.innerHTML = `<div class="ctp-empty-state">
      <p>Nenhum padrão aprendido ainda.</p>
      <p style="font-size:var(--fs-xs); color:var(--color-text-muted); margin-top:var(--space-2);">Padrões são registrados automaticamente ao salvar uma transação importada vinculada a este contato.</p>
    </div>`;
    return;
  }

  const subById = new Map(cachedSubcategorias.map((s) => [s.id, s]));
  const catById = new Map(cachedCategorias.map((c) => [c.id, c]));

  panel.innerHTML = `<div class="ctp-banco-list">` + data.map((row) => {
    const sub      = row.last_subcategoria_id ? subById.get(row.last_subcategoria_id) : null;
    const cat      = sub ? catById.get(sub.categoria_id) : null;
    const subLabel = sub
      ? `${cat ? escapeHtml(cat.nome) + ' · ' : ''}${escapeHtml(sub.apelido || sub.nome)}`
      : '<span style="color:var(--color-text-muted)">—</span>';
    const date = new Date(row.created_at).toLocaleDateString('pt-BR');
    return `<div class="ctp-banco-item">
      <div class="ctp-banco-desc" title="${escapeHtml(row.banco_desc)}">${escapeHtml(row.banco_desc)}</div>
      <div class="ctp-banco-sub">${subLabel}</div>
      <div class="ctp-banco-date">${date}</div>
      <button class="btn-icon" data-delete-bd="${row.id}" title="Remover mapeamento">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>`;
  }).join('') + `</div>`;

  panel.querySelectorAll('[data-delete-bd]').forEach((btn) => {
    btn.addEventListener('click', () => deleteBancoDesc(btn.dataset.deleteBd, contatoId));
  });
}

async function deleteBancoDesc(id, contatoId) {
  const { error } = await supabase.from('contato_banco_descs').delete().eq('id', id);
  if (error) { showToast('Erro ao remover: ' + error.message, 'error'); return; }
  showToast('Mapeamento removido.', 'success');
  loadBancoTab(contatoId);
}

async function loadTransacoesTab(contatoId) {
  const panel = document.getElementById('ct-trans-content');
  panel.innerHTML = '<div class="ctp-loading">Carregando…</div>';

  const { data, error } = await supabase
    .from('transacoes')
    .select('id, data, descricao, banco_desc, tipo, valor, reconciliacao_status, subcategoria_id, conta_id')
    .eq('contato_id', contatoId)
    .order('data', { ascending: false })
    .limit(50);

  if (error) {
    panel.innerHTML = `<div class="ctp-empty-state">Erro ao carregar transações.</div>`;
    return;
  }

  if (!data || data.length === 0) {
    panel.innerHTML = `<div class="ctp-empty-state">Nenhuma transação vinculada a este contato.</div>`;
    return;
  }

  const subById   = new Map(cachedSubcategorias.map((s) => [s.id, s]));
  const contaById = new Map(cachedContas.map((c) => [c.id, c]));

  panel.innerHTML = `<div class="ctp-trans-header">
    <span>Data</span><span>Descrição</span><span>Subcategoria</span><span class="text-right">Valor</span><span class="text-right">Status</span>
  </div>
  <div class="ctp-trans-list">` + data.map((t) => {
    const desc    = t.descricao || t.banco_desc || '—';
    const sub     = t.subcategoria_id ? subById.get(t.subcategoria_id) : null;
    const conta   = t.conta_id ? contaById.get(t.conta_id) : null;
    const meta    = sub ? (sub.apelido || sub.nome) : (conta ? (conta.apelido || conta.nome) : '—');
    const tipoCls = t.tipo === 'Receita' ? 'is-receita' : 'is-despesa';
    const sign    = t.tipo === 'Receita' ? '+' : '−';
    const statusIcon = t.reconciliacao_status === 'reconciliado'
      ? `<span class="ctp-recon-done" title="Reconciliado">✓</span>`
      : t.reconciliacao_status === 'importado'
      ? `<span class="ctp-recon-pending" title="Importado — pendente">•</span>`
      : '';
    return `<div class="ctp-trans-item">
      <div class="ctp-trans-date">${t.data}</div>
      <div class="ctp-trans-desc" title="${escapeHtml(desc)}">${escapeHtml(desc.length > 45 ? desc.slice(0, 45) + '…' : desc)}</div>
      <div class="ctp-trans-meta">${escapeHtml(meta)}</div>
      <div class="ctp-trans-value ${tipoCls}">${sign} ${formatCurrency(t.valor, 'BRL')}</div>
      <div class="ctp-trans-status">${statusIcon}</div>
    </div>`;
  }).join('') + `</div>`;
}

// ── Tabs ──────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.ctp-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
  document.querySelectorAll('.ctp-tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.tab !== tab));
}

// ── Events ────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('ct-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderList();
  });

  document.querySelectorAll('[data-tipo-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterTipo = btn.dataset.tipoFilter;
      document.querySelectorAll('[data-tipo-filter]').forEach((b) => b.classList.toggle('active', b === btn));
      renderList();
    });
  });

  document.getElementById('btn-novo-contato').addEventListener('click', () => openModal(null));

  document.querySelectorAll('.ctp-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('btn-editar-contato').addEventListener('click', (e) => {
    openModal(e.currentTarget.dataset.id);
  });

  document.getElementById('btn-arquivar-contato').addEventListener('click', async (e) => {
    const id = e.currentTarget.dataset.id;
    const c  = cachedContatos.find((x) => x.id === id);
    if (!c) return;
    const newStatus = c.status === 'arquivado' ? 'ativo' : 'arquivado';
    const { error } = await supabase.from('contatos').update({ status: newStatus }).eq('id', id);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    showToast(newStatus === 'arquivado' ? 'Contato arquivado.' : 'Contato reativado.', 'success');
    await reloadContatos();
    renderList();
    const updated = cachedContatos.find((x) => x.id === id);
    if (updated) renderDetailHeader(updated);
  });

  // Modal
  document.getElementById('btn-close-modal-contato').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-contato').addEventListener('click', closeModal);
  document.getElementById('modal-contato').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-contato')) closeModal();
  });
  document.getElementById('form-contato').addEventListener('submit', (e) => {
    e.preventDefault();
    saveContato();
  });

  // Delete
  document.getElementById('btn-deletar-contato').addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    const c  = cachedContatos.find((x) => x.id === id);
    if (!c) return;
    pendingDeleteId = id;
    document.getElementById('modal-confirmar-msg').innerHTML =
      `Excluir <strong>${escapeHtml(c.nome)}</strong>? O contato será removido das transações e compromissos vinculados (os registros são preservados).`;
    document.getElementById('modal-confirmar').classList.remove('hidden');
  });

  document.getElementById('btn-close-confirmar').addEventListener('click', closeConfirmar);
  document.getElementById('btn-cancel-confirmar').addEventListener('click', closeConfirmar);
  document.getElementById('modal-confirmar').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-confirmar')) closeConfirmar();
  });
  document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const { error } = await supabase.from('contatos').delete().eq('id', pendingDeleteId);
    if (error) { showToast('Erro ao excluir: ' + error.message, 'error'); return; }
    showToast('Contato excluído.', 'success');
    closeConfirmar();
    closeModal();
    if (selectedId === pendingDeleteId) {
      selectedId = null;
      document.getElementById('ct-detail-empty').classList.remove('hidden');
      document.getElementById('ct-detail-content').classList.add('hidden');
    }
    pendingDeleteId = null;
    await reloadContatos();
    renderList();
  });
}

function closeConfirmar() {
  document.getElementById('modal-confirmar').classList.add('hidden');
  pendingDeleteId = null;
}

// ── Modal CRUD ────────────────────────────────────────────────
function openModal(id) {
  editingId = id;
  const c = id ? cachedContatos.find((x) => x.id === id) : null;

  document.getElementById('modal-contato-title').textContent = c ? 'Editar contato' : 'Novo contato';
  document.getElementById('ct-nome').value         = c?.nome         || '';
  document.getElementById('ct-nome-extrato').value = c?.nome_extrato || '';
  document.getElementById('ct-tipo').value         = c?.tipo         || 'ambos';
  document.getElementById('ct-email').value        = c?.email        || '';
  document.getElementById('ct-telefone').value     = c?.telefone     || '';
  document.getElementById('ct-documento').value    = c?.documento    || '';
  document.getElementById('ct-observacao').value   = c?.observacao   || '';

  const delBtn = document.getElementById('btn-deletar-contato');
  delBtn.classList.toggle('hidden', !id);
  if (id) delBtn.dataset.id = id;

  document.getElementById('modal-contato').classList.remove('hidden');
  document.getElementById('ct-nome').focus();
}

function closeModal() {
  document.getElementById('modal-contato').classList.add('hidden');
  editingId = null;
}

async function saveContato() {
  const nome         = document.getElementById('ct-nome').value.trim();
  const nome_extrato = document.getElementById('ct-nome-extrato').value.trim() || null;
  const tipo         = document.getElementById('ct-tipo').value;
  const email        = document.getElementById('ct-email').value.trim() || null;
  const telefone     = document.getElementById('ct-telefone').value.trim() || null;
  const documento    = document.getElementById('ct-documento').value.trim() || null;
  const observacao   = document.getElementById('ct-observacao').value.trim() || null;

  if (!nome) { showToast('Informe o nome do contato.', 'error'); return; }

  const btn = document.getElementById('btn-save-contato');
  btn.disabled = true;

  const user = await getCurrentUser();
  let error, newId;

  if (editingId) {
    ({ error } = await supabase.from('contatos')
      .update({ nome, nome_extrato, tipo, email, telefone, documento, observacao })
      .eq('id', editingId));
    newId = editingId;
  } else {
    const res = await supabase.from('contatos')
      .insert({ user_id: user.id, nome, nome_extrato, tipo, email, telefone, documento, observacao })
      .select('id').single();
    error = res.error;
    newId = res.data?.id;
  }

  btn.disabled = false;

  if (error) { showToast('Erro: ' + error.message, 'error'); return; }

  showToast(editingId ? 'Contato atualizado.' : 'Contato criado.', 'success');
  closeModal();
  await reloadContatos();
  renderList();
  if (newId) selectContact(newId);
}

// ── Utils ─────────────────────────────────────────────────────
function avatarInitials(nome) {
  return (nome || '').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

