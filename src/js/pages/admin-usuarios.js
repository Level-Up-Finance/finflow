// =============================================================
// FinFlow — Admin: Usuários
// =============================================================
import { guardAdmin }              from '../lib/auth.js';
import { initSidebar }             from '../components/sidebar.js';
import { supabase }                from '../lib/supabase.js';
import { showToast }               from '../components/toast.js';
import { escapeHtml, formatDateBR, getInitials } from '../lib/utils.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';

// ── Estado ────────────────────────────────────────────────────
let cachedUsers  = [];
let searchQuery  = '';
let filterPlano  = 'todos';
let openUserId   = null;

const PLANO_LABELS = { free: 'Free', pro: 'Pro', premium: 'Premium' };
const TEMA_LABELS  = { claro: 'Claro', escuro: 'Escuro', auto: 'Automático' };
const IDIOMA_LABELS = { 'pt-BR': 'Português (BR)', en: 'English' };

// ── Init ──────────────────────────────────────────────────────
export async function init() {
  await loadData();
  bindEvents();
  renderTable();
}

// Standalone (admin-usuarios.html acessado diretamente)
document.addEventListener('DOMContentLoaded', async () => {
  await guardAdmin();
  await initSidebar('admin');
  await loadStrings();
  applyTranslationsToDom();
  await init();
});

// ── Dados ─────────────────────────────────────────────────────
async function loadData() {
  const { data, error } = await supabase.rpc('get_admin_users');
  if (error) {
    showToast('Erro ao carregar usuários: ' + error.message, 'error');
    document.getElementById('usr-tbody').innerHTML =
      `<tr><td colspan="5" class="table-empty">Erro ao carregar usuários.</td></tr>`;
    return;
  }
  cachedUsers = data || [];
  updateCount();
}

function updateCount() {
  const el = document.getElementById('usr-count');
  el.textContent = cachedUsers.length;
  el.classList.remove('hidden');
}

function filteredUsers() {
  const q = searchQuery.toLowerCase();
  return cachedUsers.filter((u) => {
    if (filterPlano !== 'todos' && u.plano !== filterPlano) return false;
    if (!q) return true;
    return (
      (u.nome    || '').toLowerCase().includes(q) ||
      (u.apelido || '').toLowerCase().includes(q) ||
      (u.email   || '').toLowerCase().includes(q)
    );
  });
}

// ── Tabela ────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('usr-tbody');
  const users = filteredUsers();

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Nenhum usuário encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map((u) => {
    const nome     = u.nome || u.apelido || u.email?.split('@')[0] || '—';
    const initials = getInitials(u.nome || u.apelido, u.email);
    const plano    = u.plano || 'free';
    const avatar   = u.foto_url
      ? `<img src="${escapeHtml(u.foto_url)}" alt="" class="adm-usr-avatar-img">`
      : escapeHtml(initials);
    const suspensoBadge = u.suspenso
      ? `<span class="plano-badge" style="background:var(--color-danger-bg);color:var(--color-danger-text);margin-left:4px;">Suspenso</span>`
      : '';
    return `
      <tr class="adm-usr-row${u.suspenso ? ' adm-usr-row--suspenso' : ''}" data-id="${u.id}" tabindex="0" role="button">
        <td>
          <div class="adm-usr-cell-user">
            <div class="adm-usr-avatar">${avatar}</div>
            <div>
              <div class="adm-usr-name">${escapeHtml(nome)}${suspensoBadge}</div>
              ${u.apelido && u.nome ? `<div class="adm-usr-sub">${escapeHtml(u.apelido)}</div>` : ''}
            </div>
          </div>
        </td>
        <td class="adm-usr-email">${escapeHtml(u.email || '—')}</td>
        <td><span class="plano-badge plano-${plano}">${escapeHtml(PLANO_LABELS[plano] || plano)}</span></td>
        <td>${formatDateBR(u.data_cadastro) || '—'}</td>
        <td>${relativeDate(u.ultimo_acesso)}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.adm-usr-row').forEach((row) => {
    row.addEventListener('click',   () => openModal(row.dataset.id));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') openModal(row.dataset.id); });
  });
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(userId) {
  const u = cachedUsers.find((x) => x.id === userId);
  if (!u) return;
  openUserId = userId;

  const nome     = u.nome || u.apelido || u.email?.split('@')[0] || '—';
  const initials = getInitials(u.nome || u.apelido, u.email);
  const plano    = u.plano || 'free';

  const avatarEl = document.getElementById('modal-usr-avatar');
  avatarEl.style.background = 'var(--color-primary)';
  avatarEl.innerHTML = u.foto_url
    ? `<img src="${escapeHtml(u.foto_url)}" alt="" class="adm-usr-avatar-img" onerror="this.parentElement.textContent='${escapeHtml(initials)}';">`
    : escapeHtml(initials);

  document.getElementById('modal-usr-name').textContent  = nome;
  document.getElementById('modal-usr-meta').innerHTML    =
    `<span class="plano-badge plano-${plano}">${PLANO_LABELS[plano] || plano}</span>`;
  document.getElementById('modal-usr-plano-select').value = plano;
  document.getElementById('modal-usr-body').innerHTML    = renderModalBody(u);

  const btnSuspend = document.getElementById('btn-toggle-suspend');
  btnSuspend.textContent = u.suspenso ? 'Reativar conta' : 'Suspender';
  btnSuspend.classList.toggle('btn-warning', !u.suspenso);
  btnSuspend.classList.toggle('btn-success', u.suspenso);

  document.getElementById('modal-usuario').classList.remove('hidden');
}

function renderModalBody(u) {
  const field = (label, content) => content
    ? `<div class="ctp-field"><div class="ctp-field-label">${label}</div><div class="ctp-field-value">${content}</div></div>`
    : '';
  const fieldFull = (label, content) => content
    ? `<div class="ctp-field ctp-field--full"><div class="ctp-field-label">${label}</div><div class="ctp-field-value">${content}</div></div>`
    : '';

  const conf = u.email_confirmado
    ? `<span style="color:var(--color-success);font-size:var(--fs-xs);margin-left:4px;">✓ verificado</span>`
    : `<span style="color:var(--color-warning);font-size:var(--fs-xs);margin-left:4px;">pendente</span>`;
  const emailHtml = u.email
    ? `<a href="mailto:${escapeHtml(u.email)}">${escapeHtml(u.email)}</a>${conf}`
    : null;

  const link = (url, label) =>
    url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label || url)}</a>` : null;

  return `<div class="ctp-dados-grid">
    ${fieldFull('E-mail', emailHtml)}
    ${field('Telefone',      u.telefone ? escapeHtml(u.telefone) : null)}
    ${field('Membro desde',  formatDateBR(u.data_cadastro) || null)}
    ${field('Último acesso', relativeDate(u.ultimo_acesso))}
    ${fieldFull('Bio', u.bio ? escapeHtml(u.bio) : null)}
    ${field('Instagram', link(u.instagram, u.instagram))}
    ${field('Twitter/X',  link(u.twitter, u.twitter))}
    ${field('LinkedIn',   link(u.linkedin, u.linkedin))}
    ${field('Tema',          TEMA_LABELS[u.tema]   || null)}
    ${field('Idioma',        IDIOMA_LABELS[u.idioma] || null)}
    ${field('Moeda padrão',  u.moeda_padrao || null)}
  </div>`;
}

function closeModal() {
  document.getElementById('modal-usuario').classList.add('hidden');
  openUserId = null;
}

async function toggleSuspend() {
  if (!openUserId) return;
  const u = cachedUsers.find((x) => x.id === openUserId);
  if (!u) return;
  const suspender = !u.suspenso;
  const btn = document.getElementById('btn-toggle-suspend');
  btn.disabled = true;

  const { error } = await supabase.rpc('admin_suspend_user', {
    target_user_id: openUserId,
    suspender,
  });

  btn.disabled = false;
  if (error) { showToast('Erro: ' + error.message, 'error'); return; }

  u.suspenso = suspender;
  btn.textContent = suspender ? 'Reativar conta' : 'Suspender';
  btn.classList.toggle('btn-warning', !suspender);
  btn.classList.toggle('btn-success', suspender);
  showToast(suspender ? 'Usuário suspenso.' : 'Conta reativada.', 'success');
  renderTable();
}

async function deleteUser() {
  if (!openUserId) return;
  const u = cachedUsers.find((x) => x.id === openUserId);
  if (!u) return;
  const nome = u.nome || u.email || 'este usuário';
  if (!window.confirm(`Excluir permanentemente a conta de ${nome}? Esta ação não pode ser desfeita.`)) return;

  const btn = document.getElementById('btn-delete-user');
  btn.disabled = true;

  const { error } = await supabase.rpc('admin_delete_user', {
    target_user_id: openUserId,
  });

  btn.disabled = false;
  if (error) { showToast('Erro: ' + error.message, 'error'); return; }

  cachedUsers = cachedUsers.filter((x) => x.id !== openUserId);
  closeModal();
  updateCount();
  renderTable();
  showToast('Conta excluída.', 'success');
}

async function savePlano() {
  if (!openUserId) return;
  const plano = document.getElementById('modal-usr-plano-select').value;
  const btn   = document.getElementById('btn-save-plano');
  btn.disabled = true;

  const { error } = await supabase.rpc('admin_set_plano', {
    target_user_id: openUserId,
    new_plano:      plano,
  });

  btn.disabled = false;
  if (error) { showToast('Erro: ' + error.message, 'error'); return; }

  const u = cachedUsers.find((x) => x.id === openUserId);
  if (u) {
    u.plano = plano;
    document.getElementById('modal-usr-meta').innerHTML =
      `<span class="plano-badge plano-${plano}">${PLANO_LABELS[plano]}</span>`;
  }
  showToast(t('admin.usuarios.toast.plano_atualizado', 'Plano atualizado.'), 'success');
  renderTable();
}

// ── Eventos ───────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('usr-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderTable();
  });

  document.querySelectorAll('[data-plano]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterPlano = btn.dataset.plano;
      document.querySelectorAll('[data-plano]').forEach((b) =>
        b.classList.toggle('active', b === btn));
      renderTable();
    });
  });

  document.getElementById('btn-close-modal-usr').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-modal-usr').addEventListener('click', closeModal);
  document.getElementById('modal-usuario').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-usuario')) closeModal();
  });
  document.getElementById('btn-save-plano').addEventListener('click', savePlano);
  document.getElementById('btn-toggle-suspend').addEventListener('click', toggleSuspend);
  document.getElementById('btn-delete-user').addEventListener('click', deleteUser);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// ── Utils ─────────────────────────────────────────────────────
function relativeDate(iso) {
  if (!iso) return '—';
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins  <  2)  return 'Agora pouco';
  if (mins  < 60)  return `Há ${mins} min`;
  const hours = Math.floor(mins  / 60);
  if (hours < 24)  return `Há ${hours}h`;
  const days  = Math.floor(hours / 24);
  if (days  ===  1) return 'Ontem';
  if (days  <   7)  return `Há ${days} dias`;
  if (days  <  30)  return `Há ${Math.floor(days / 7)} sem`;
  if (days  < 365)  return `Há ${Math.floor(days / 30)} meses`;
  return `Há ${Math.floor(days / 365)} anos`;
}
