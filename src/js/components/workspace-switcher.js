// =============================================================
// FinFlow — Workspace Switcher (Multi-perfil Fase 2)
// =============================================================
// Chip no header com nome do workspace ativo. Click abre dropdown
// com lista de workspaces do user, criar novo, convidar pessoa.
//
// Modais são construídos via createElement (sem innerHTML em strings
// concatenadas com input de user) — defensive vs XSS por construção.
// =============================================================
import { supabase } from '../lib/supabase.js';
import {
  listMyWorkspaces, getCurrentWorkspaceId, setCurrentWorkspaceId,
  refreshWorkspaceList,
} from '../lib/workspace.js';
import { getCurrentUser } from '../lib/auth.js';
import { showToast } from './toast.js';

let dropdownOpen = false;
let docListenersAttached = false;

const TIPO_LABEL = {
  pessoal: 'Pessoal', casal: 'Casal', familia: 'Família', outro: 'Outro',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(pathsHtml, size = 14) {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '2');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  // pathsHtml é hardcoded (constantes em ICON_*); seguro
  el.innerHTML = pathsHtml; // eslint-disable-line
  return el;
}

const ICON_CHEVRON = '<polyline points="6 9 12 15 18 9"/>';
const ICON_CHECK = '<polyline points="20 6 9 17 4 12"/>';
const ICON_PLUS = '<line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/>';
const ICON_INVITE = '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" x2="20" y1="8" y2="14"/><line x1="23" x2="17" y1="11" y2="11"/>';

// ─── MOUNT ────────────────────────────────────────────────────
export async function mountWorkspaceSwitcher() {
  const header = document.querySelector('.app-header.header');
  if (!header) return;

  let right = header.querySelector('.header-right');
  if (!right) {
    right = document.createElement('div');
    right.className = 'header-right';
    header.appendChild(right);
  }

  let host = right.querySelector('#workspace-switcher');
  if (!host) {
    host = document.createElement('div');
    host.id = 'workspace-switcher';
    const userMenu = right.querySelector('#header-user-menu');
    if (userMenu) right.insertBefore(host, userMenu);
    else right.appendChild(host);
  }

  await renderSwitcher(host);
}

async function renderSwitcher(host) {
  const list = await listMyWorkspaces();
  const currentId = getCurrentWorkspaceId();
  const current = list.find((w) => w.id === currentId);

  // Limpa
  while (host.firstChild) host.removeChild(host.firstChild);

  if (!current) return;

  // Trigger
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ws-switch-trigger';
  trigger.id = 'ws-trigger';
  trigger.setAttribute('aria-label', 'Trocar de workspace');
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');

  const triggerDot = document.createElement('span');
  triggerDot.className = 'ws-switch-dot';
  triggerDot.style.background = current.cor || '#6D5EF5';
  trigger.appendChild(triggerDot);

  const triggerName = document.createElement('span');
  triggerName.className = 'ws-switch-name';
  triggerName.textContent = current.nome;
  trigger.appendChild(triggerName);

  trigger.appendChild(svg(ICON_CHEVRON));

  host.appendChild(trigger);

  // Dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'ws-switch-dropdown hidden';
  dropdown.id = 'ws-dropdown';
  dropdown.setAttribute('role', 'menu');

  const sectionLabel = document.createElement('div');
  sectionLabel.className = 'ws-switch-section-label';
  sectionLabel.textContent = 'Seus workspaces';
  dropdown.appendChild(sectionLabel);

  for (const w of list) {
    const isActive = w.id === currentId;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ws-switch-item' + (isActive ? ' active' : '');
    item.dataset.wsId = w.id;
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(isActive));

    const dot = document.createElement('span');
    dot.className = 'ws-switch-dot';
    dot.style.background = w.cor || '#6D5EF5';
    item.appendChild(dot);

    const txt = document.createElement('span');
    txt.className = 'ws-switch-item-text';
    const nm = document.createElement('span');
    nm.className = 'ws-switch-item-name';
    nm.textContent = w.nome;
    const rl = document.createElement('span');
    rl.className = 'ws-switch-item-role';
    rl.textContent = w.role + (isActive && TIPO_LABEL[w.tipo] ? ' · ' + TIPO_LABEL[w.tipo] : '');
    txt.appendChild(nm);
    txt.appendChild(rl);
    item.appendChild(txt);

    if (isActive) item.appendChild(svg(ICON_CHECK));

    dropdown.appendChild(item);
  }

  const divider = document.createElement('hr');
  divider.className = 'ws-switch-divider';
  dropdown.appendChild(divider);

  if (current.role === 'owner') {
    const inviteBtn = document.createElement('button');
    inviteBtn.type = 'button';
    inviteBtn.className = 'ws-switch-action';
    inviteBtn.id = 'ws-action-invite';
    inviteBtn.setAttribute('role', 'menuitem');
    inviteBtn.appendChild(svg(ICON_INVITE, 16));
    const inviteLabel = document.createElement('span');
    inviteLabel.textContent = 'Convidar pessoa';
    inviteBtn.appendChild(inviteLabel);
    dropdown.appendChild(inviteBtn);
  }

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'ws-switch-action';
  createBtn.id = 'ws-action-create';
  createBtn.setAttribute('role', 'menuitem');
  createBtn.appendChild(svg(ICON_PLUS, 16));
  const createLabel = document.createElement('span');
  createLabel.textContent = 'Criar workspace';
  createBtn.appendChild(createLabel);
  dropdown.appendChild(createBtn);

  host.appendChild(dropdown);

  bindEvents(host);
}

function bindEvents(host) {
  const trigger = host.querySelector('#ws-trigger');
  const dropdown = host.querySelector('#ws-dropdown');

  trigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownOpen = !dropdownOpen;
    dropdown.classList.toggle('hidden', !dropdownOpen);
    trigger.setAttribute('aria-expanded', String(dropdownOpen));
  });

  host.querySelectorAll('.ws-switch-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const newId = btn.dataset.wsId;
      if (newId && newId !== getCurrentWorkspaceId()) {
        setCurrentWorkspaceId(newId);
        window.location.reload();
      } else {
        closeDropdown();
      }
    });
  });

  host.querySelector('#ws-action-invite')?.addEventListener('click', () => {
    closeDropdown();
    openInviteModal();
  });
  host.querySelector('#ws-action-create')?.addEventListener('click', () => {
    closeDropdown();
    openCreateModal();
  });

  if (!docListenersAttached) {
    docListenersAttached = true;
    document.addEventListener('click', (e) => {
      if (!dropdownOpen) return;
      const h = document.getElementById('workspace-switcher');
      if (h?.contains(e.target)) return;
      closeDropdown();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dropdownOpen) closeDropdown();
    });
  }
}

function closeDropdown() {
  dropdownOpen = false;
  const h = document.getElementById('workspace-switcher');
  h?.querySelector('#ws-dropdown')?.classList.add('hidden');
  h?.querySelector('#ws-trigger')?.setAttribute('aria-expanded', 'false');
}

// ─── CREATE WORKSPACE MODAL ────────────────────────────────────
function openCreateModal() {
  const modal = buildModalShell('ws-create-modal', 'Criar novo workspace');
  const form = document.createElement('form');
  form.id = 'ws-create-form';
  form.style.cssText = 'display: flex; flex-direction: column; gap: var(--space-3)';

  const nomeLabel = document.createElement('label');
  nomeLabel.textContent = 'Nome';
  const nomeInput = document.createElement('input');
  nomeInput.type = 'text';
  nomeInput.name = 'nome';
  nomeInput.required = true;
  nomeInput.maxLength = 60;
  nomeInput.placeholder = 'Ex: Casa, Família Silva, Negócio…';
  nomeInput.autocomplete = 'off';
  nomeLabel.appendChild(nomeInput);
  form.appendChild(nomeLabel);

  const tipoLabel = document.createElement('label');
  tipoLabel.textContent = 'Tipo';
  const tipoSelect = document.createElement('select');
  tipoSelect.name = 'tipo';
  for (const [val, lbl] of Object.entries(TIPO_LABEL)) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = lbl;
    if (val === 'casal') opt.selected = true;
    tipoSelect.appendChild(opt);
  }
  tipoLabel.appendChild(tipoSelect);
  form.appendChild(tipoLabel);

  const hint = document.createElement('p');
  hint.className = 'text-muted';
  hint.style.cssText = 'font-size: var(--font-size-sm); margin: 0';
  hint.textContent = 'Você será owner do novo workspace e poderá convidar outras pessoas depois.';
  form.appendChild(hint);

  form.appendChild(buildFooter('Criar'));

  modal.querySelector('.modal-body').appendChild(form);
  document.body.appendChild(modal);
  attachModalCloseHandlers(modal);
  setTimeout(() => nomeInput.focus(), 0);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Criando…';
    const nome = nomeInput.value.trim();
    const tipo = tipoSelect.value;
    if (!nome) { btn.disabled = false; btn.textContent = 'Criar'; return; }

    const user = await getCurrentUser();
    const { data: ws, error: wsErr } = await supabase
      .from('workspaces')
      .insert({ nome, tipo, created_by: user.id })
      .select('id').single();
    if (wsErr) {
      showToast('Erro ao criar workspace: ' + wsErr.message, 'error', 8000);
      btn.disabled = false; btn.textContent = 'Criar'; return;
    }

    const { error: memErr } = await supabase
      .from('workspace_members')
      .insert({ workspace_id: ws.id, profile_id: user.id, role: 'owner', cor: '#6D5EF5' });
    if (memErr) {
      showToast('Workspace criado, mas erro ao virar owner: ' + memErr.message, 'error', 8000);
      btn.disabled = false; btn.textContent = 'Criar'; return;
    }

    refreshWorkspaceList();
    setCurrentWorkspaceId(ws.id);
    showToast(`Workspace "${nome}" criado`, 'success');
    closeInjectedModal('ws-create-modal');
    window.location.reload();
  });
}

// ─── INVITE MODAL ─────────────────────────────────────────────
function openInviteModal() {
  const modal = buildModalShell('ws-invite-modal', 'Convidar pessoa');
  const form = document.createElement('form');
  form.id = 'ws-invite-form';
  form.style.cssText = 'display: flex; flex-direction: column; gap: var(--space-3)';

  const emailLabel = document.createElement('label');
  emailLabel.textContent = 'Email';
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.name = 'email';
  emailInput.required = true;
  emailInput.placeholder = 'pessoa@exemplo.com';
  emailInput.autocomplete = 'email';
  emailLabel.appendChild(emailInput);
  form.appendChild(emailLabel);

  const roleLabel = document.createElement('label');
  roleLabel.textContent = 'Permissão';
  const roleSelect = document.createElement('select');
  roleSelect.name = 'role';
  for (const [val, lbl] of [
    ['editor', 'Editor (lê e edita)'],
    ['viewer', 'Viewer (só lê)'],
    ['owner',  'Owner (controle total)'],
  ]) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = lbl;
    if (val === 'editor') opt.selected = true;
    roleSelect.appendChild(opt);
  }
  roleLabel.appendChild(roleSelect);
  form.appendChild(roleLabel);

  const hint = document.createElement('p');
  hint.className = 'text-muted';
  hint.style.cssText = 'font-size: var(--font-size-sm); margin: 0';
  hint.textContent = 'A pessoa precisa ter conta FinFlow com esse email. Após criar o convite, copie e envie o link manualmente.';
  form.appendChild(hint);

  form.appendChild(buildFooter('Enviar convite'));

  modal.querySelector('.modal-body').appendChild(form);
  document.body.appendChild(modal);
  attachModalCloseHandlers(modal);
  setTimeout(() => emailInput.focus(), 0);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Criando…';
    const email = emailInput.value.trim().toLowerCase();
    const role = roleSelect.value;
    const currentId = getCurrentWorkspaceId();
    const user = await getCurrentUser();
    if (!email) { btn.disabled = false; btn.textContent = 'Enviar convite'; return; }

    const token = crypto.randomUUID();
    const { error } = await supabase
      .from('workspace_invites')
      .insert({
        workspace_id: currentId,
        email,
        role,
        invited_by: user.id,
        token,
      });
    if (error) {
      showToast('Erro ao criar convite: ' + error.message, 'error', 8000);
      btn.disabled = false; btn.textContent = 'Enviar convite'; return;
    }

    const link = `${window.location.origin}/aceitar-convite.html?token=${token}`;
    showToast(`Convite criado para ${email}`, 'success', 6000);

    // Mostra link in-modal pra copiar
    const result = document.createElement('div');
    result.style.cssText = 'margin-top: var(--space-3); padding: var(--space-3); background: var(--color-bg-subtle, #f5f5f5); border-radius: var(--border-radius, 8px); font-size: var(--font-size-sm)';
    const resultLabel = document.createElement('strong');
    resultLabel.textContent = 'Link do convite:';
    resultLabel.style.cssText = 'display: block; margin-bottom: var(--space-1)';
    result.appendChild(resultLabel);
    const resultInput = document.createElement('input');
    resultInput.type = 'text';
    resultInput.readOnly = true;
    resultInput.value = link;
    resultInput.style.cssText = 'width: 100%; font-family: monospace; font-size: 12px';
    resultInput.addEventListener('click', () => resultInput.select());
    result.appendChild(resultInput);
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-secondary';
    copyBtn.style.cssText = 'margin-top: var(--space-2); width: 100%';
    copyBtn.textContent = 'Copiar link';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
        showToast('Link copiado', 'success');
      } catch {
        resultInput.select();
        showToast('Não foi possível copiar — selecione manualmente (já está marcado)', 'warning');
      }
    });
    result.appendChild(copyBtn);
    form.appendChild(result);

    btn.disabled = true; btn.textContent = 'Convite criado';
  });
}

// ─── Modal helpers ─────────────────────────────────────────────
function buildModalShell(modalId, titleText) {
  document.getElementById(modalId)?.remove();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = modalId;

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '460px';

  const header = document.createElement('header');
  header.className = 'modal-header';
  const title = document.createElement('h2');
  title.textContent = titleText;
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.dataset.close = '1';
  closeBtn.setAttribute('aria-label', 'Fechar');
  closeBtn.textContent = '×';
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'modal-body';

  modal.appendChild(header);
  modal.appendChild(body);
  backdrop.appendChild(modal);

  return backdrop;
}

function buildFooter(submitLabel) {
  const footer = document.createElement('footer');
  footer.style.cssText = 'display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-2)';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn-secondary';
  cancel.dataset.close = '1';
  cancel.textContent = 'Cancelar';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary';
  submit.textContent = submitLabel;

  footer.appendChild(cancel);
  footer.appendChild(submit);
  return footer;
}

function attachModalCloseHandlers(backdrop) {
  const modalId = backdrop.id;
  backdrop.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeInjectedModal(modalId));
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeInjectedModal(modalId);
  });
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeInjectedModal(modalId);
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function closeInjectedModal(modalId) {
  document.getElementById(modalId)?.remove();
}
