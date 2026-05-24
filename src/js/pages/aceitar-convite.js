// =============================================================
// FinFlow — Aceitar Convite de Workspace
// =============================================================
// Fluxo:
//   1. Lê ?token=xxx da URL
//   2. Valida sessão. Se não logado → /index.html?redirect=...
//   3. Busca convite via token (RLS: invites_select_member_or_invitee
//      permite invitee ver seu próprio convite via auth.email() match)
//   4. Se válido: mostra info, user clica Aceitar/Recusar
//   5. Aceitar: cria workspace_members + marca accepted_at no invite
//   6. Recusar: marca invite com accepted_at NULL mas... vamos manter
//      simples: só não fazemos nada e voltamos.
// =============================================================

import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { setCurrentWorkspaceId, refreshWorkspaceList } from '../lib/workspace.js';

const ROLE_LABEL = {
  owner: 'Owner', editor: 'Editor', viewer: 'Viewer',
};

document.addEventListener('DOMContentLoaded', main);

async function main() {
  document.body.classList.remove('body-loading');

  if (!isSupabaseConfigured()) {
    showErro('Supabase não configurado.');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) {
    showErro('Token de convite ausente na URL.');
    return;
  }

  // Sessão?
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    // Volta pro login mantendo o token. Após login, redireciona pra cá.
    const redirectUrl = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/index.html?redirect=${redirectUrl}`;
    return;
  }

  // Busca convite
  const { data: invite, error } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, email, role, expires_at, accepted_at, invited_by, workspace:workspaces(nome, tipo)')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    showErro('Erro ao buscar convite: ' + error.message);
    return;
  }
  if (!invite) {
    showErro('Convite não encontrado. O link pode ter sido revogado.');
    return;
  }
  if (invite.accepted_at) {
    showErro('Este convite já foi aceito.');
    return;
  }
  if (new Date(invite.expires_at) < new Date()) {
    showErro('Este convite expirou. Peça um novo link.');
    return;
  }
  if (invite.email !== session.user.email?.toLowerCase()) {
    showErro(`Este convite é para ${invite.email}. Faça login com esse email.`);
    return;
  }

  // Busca quem convidou (display)
  let inviterName = 'Alguém';
  const { data: inviter } = await supabase
    .from('profiles')
    .select('nome, apelido')
    .eq('id', invite.invited_by)
    .maybeSingle();
  if (inviter) inviterName = inviter.apelido || inviter.nome || 'Alguém';

  showInfo({
    inviterName,
    workspaceName: invite.workspace?.nome || 'workspace',
    role: ROLE_LABEL[invite.role] || invite.role,
    inviteId: invite.id,
    workspaceId: invite.workspace_id,
    role_raw: invite.role,
    userId: session.user.id,
  });
}

function showLoading(visible) {
  document.getElementById('convite-loading')?.classList.toggle('hidden', !visible);
}

function showInfo({ inviterName, workspaceName, role, inviteId, workspaceId, role_raw, userId }) {
  showLoading(false);
  const info = document.getElementById('convite-info');
  info.classList.remove('hidden');

  document.getElementById('convite-invited-by').textContent = inviterName;
  document.getElementById('convite-workspace-name').textContent = workspaceName;
  document.getElementById('convite-role').textContent = role;

  document.getElementById('btn-aceitar').addEventListener('click', () => aceitar({ inviteId, workspaceId, role_raw, userId }));
  document.getElementById('btn-recusar').addEventListener('click', recusar);
}

function showErro(msg) {
  showLoading(false);
  document.getElementById('convite-info')?.classList.add('hidden');
  document.getElementById('convite-erro')?.classList.remove('hidden');
  const el = document.getElementById('convite-erro-msg');
  if (el) el.textContent = msg;
}

function showSucesso() {
  showLoading(false);
  document.getElementById('convite-info')?.classList.add('hidden');
  document.getElementById('convite-sucesso')?.classList.remove('hidden');
}

async function aceitar({ inviteId, workspaceId, role_raw, userId }) {
  const btn = document.getElementById('btn-aceitar');
  btn.disabled = true;
  btn.textContent = 'Entrando…';

  // 1. Insere member
  const { error: memErr } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspaceId,
      profile_id: userId,
      role: role_raw,
      cor: '#C2F542', // lime — distinguir do owner (roxo)
    });

  if (memErr) {
    // Se já é membro (unique key collision), trata gracefully
    if (/duplicate|unique/i.test(memErr.message)) {
      // Já é membro — marca invite aceito e segue
    } else {
      showErro('Erro ao entrar no workspace: ' + memErr.message);
      btn.disabled = false;
      btn.textContent = 'Aceitar e entrar';
      return;
    }
  }

  // 2. Marca invite como aceito
  const { error: updErr } = await supabase
    .from('workspace_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq('id', inviteId);

  if (updErr) {
    console.warn('[aceitar-convite] falha ao marcar accepted_at:', updErr.message);
    // Não-fatal — member já foi criado, segue
  }

  // 3. Switcha pro novo workspace + redirect
  refreshWorkspaceList();
  setCurrentWorkspaceId(workspaceId);
  showSucesso();
  setTimeout(() => { window.location.href = '/dashboard.html'; }, 1200);
}

function recusar() {
  // Hoje: apenas redireciona. Não marca rejected_at — o convite expira sozinho.
  // Futuro: marcar accepted_at = null + rejected_at se quiser audit.
  window.location.href = '/dashboard.html';
}
