// =============================================================
// FinFlow — Sistema de tarefas (lista reutilizável)
//
// Tipos atuais: 'import_extrato'
// Expansível pra outros tipos no futuro (revisar_pagamento, etc.)
//
// Geração automática roda quando init é chamado (uma vez por sessão).
// =============================================================
import { supabase } from './supabase.js';
import { STORAGE_KEYS } from './storage-keys.js';
import { requireWorkspaceId } from './workspace.js';

const SESSION_CACHE_KEY       = STORAGE_KEYS.TAREFAS_GENERATED_AT;
const SESSION_CACHE_KEY_RECON = STORAGE_KEYS.TAREFAS_RECON_AT;
const SESSION_CACHE_MS  = 5 * 60 * 1000;  // 5 minutos

/**
 * Carrega tarefas pendentes do usuário (ordenadas por created_at desc).
 * Exclui tarefas com dispensada_ate no futuro.
 */
export async function loadTarefasPendentes() {
  const hojeIso = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('tarefas_usuario')
    .select('*')
    .eq('status', 'pendente')
    .or(`dispensada_ate.is.null,dispensada_ate.lte.${hojeIso}`)
    .order('prioridade', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    if (/relation.*tarefas_usuario/i.test(error.message)) {
      console.warn('[loadTarefasPendentes] tabela ausente — rode migration 0105');
    } else {
      console.warn('[loadTarefasPendentes]', error);
    }
    return [];
  }
  return data || [];
}

/**
 * Gera tarefas de "importar extrato" pras contas que estão fora da frequência.
 * Idempotente: não cria duplicatas se já existe tarefa pendente pra mesma conta.
 *
 * Roda no máx 1x a cada 5 minutos por sessão (cache em localStorage).
 */
export async function gerarTarefasImportExtrato({ force = false } = {}) {
  if (!force) {
    const last = Number(localStorage.getItem(SESSION_CACHE_KEY) || 0);
    if (Date.now() - last < SESSION_CACHE_MS) return { skipped: true };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { skipped: true };

  // Carrega contas ativas. Frequência:
  //   null → default mensal (30 dias)
  //   0    → usuário desabilitou (skip)
  //   N    → a cada N dias
  const { data: contasRaw } = await supabase
    .from('contas')
    .select('id, nome, apelido, frequencia_importacao_dias, status')
    .eq('status', 'ativa');
  const contas = (contasRaw || [])
    .map((c) => ({ ...c, _freq: c.frequencia_importacao_dias == null ? 30 : c.frequencia_importacao_dias }))
    .filter((c) => c._freq > 0);
  if (contas.length === 0) {
    localStorage.setItem(SESSION_CACHE_KEY, String(Date.now()));
    return { criadas: 0 };
  }

  const contaIds = contas.map((c) => c.id);

  // Última importação por conta (max importada_em em transacoes)
  const { data: ultimasImps } = await supabase
    .from('transacoes')
    .select('conta_id, importada_em')
    .in('conta_id', contaIds)
    .not('importada_em', 'is', null);
  const ultimaPorConta = new Map();
  for (const tr of ultimasImps || []) {
    const cur = ultimaPorConta.get(tr.conta_id);
    if (!cur || tr.importada_em > cur) ultimaPorConta.set(tr.conta_id, tr.importada_em);
  }

  // Tarefas pendentes existentes pra essas contas (pra não duplicar)
  const { data: existentes } = await supabase
    .from('tarefas_usuario')
    .select('id, conta_id, dispensada_ate')
    .eq('tipo', 'import_extrato')
    .eq('status', 'pendente')
    .in('conta_id', contaIds);
  const tarefasPorConta = new Map();
  for (const t of existentes || []) tarefasPorConta.set(t.conta_id, t);

  const hojeIso = new Date().toISOString().slice(0, 10);
  const novas = [];
  for (const conta of contas) {
    // Se já tem tarefa pendente e ela não está dispensada ainda → skip
    const exist = tarefasPorConta.get(conta.id);
    if (exist && (!exist.dispensada_ate || exist.dispensada_ate > hojeIso)) continue;

    const ultima = ultimaPorConta.get(conta.id);
    let diasDesde;
    if (ultima) {
      const d = new Date(ultima);
      diasDesde = Math.round((Date.now() - d.getTime()) / 86400000);
    } else {
      diasDesde = 999;  // nunca importou
    }
    if (diasDesde < conta._freq) continue;

    const nomeExib = conta.apelido?.trim() || conta.nome;
    const descricao = ultima
      ? `Sua última importação dessa conta foi há ${diasDesde} dias.`
      : `Você ainda não importou extrato dessa conta.`;
    novas.push({
      user_id: user.id,
      workspace_id: requireWorkspaceId(),
      tipo: 'import_extrato',
      titulo: `Importar extrato — ${nomeExib}`,
      descricao,
      prioridade: diasDesde > conta._freq * 2 ? 'alta' : 'normal',
      status: 'pendente',
      conta_id: conta.id,
      acao_url: '/importar.html',
      acao_label: 'Importar agora',
    });
  }

  if (novas.length > 0) {
    // Antes de inserir, deleta as antigas pra essa conta (caso tenha sido dispensada e expirou)
    const contasParaLimpar = novas.map((n) => n.conta_id);
    await supabase
      .from('tarefas_usuario')
      .delete()
      .eq('tipo', 'import_extrato')
      .eq('status', 'pendente')
      .in('conta_id', contasParaLimpar);
    // Adiciona auto_completa_quando pra que importação cancele a tarefa
    for (const n of novas) {
      n.auto_completa_quando = { tipo: 'import_extrato', conta_id: n.conta_id };
    }
    await supabase.from('tarefas_usuario').insert(novas);
  }

  localStorage.setItem(SESSION_CACHE_KEY, String(Date.now()));
  return { criadas: novas.length };
}

/**
 * Gera tarefas de "reconciliação pendente" para contas com transações em
 * status='importado' (esperando confirmação do user). Idempotente.
 */
export async function gerarTarefasReconciliacaoPendente({ force = false } = {}) {
  if (!force) {
    const last = Number(localStorage.getItem(SESSION_CACHE_KEY_RECON) || 0);
    if (Date.now() - last < SESSION_CACHE_MS) return { skipped: true };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { skipped: true };

  // Conta transações importadas pendentes por conta
  const { data: pendentes } = await supabase
    .from('transacoes')
    .select('conta_id')
    .eq('reconciliacao_status', 'importado');
  const countByConta = new Map();
  for (const t of pendentes || []) {
    if (!t.conta_id) continue;
    countByConta.set(t.conta_id, (countByConta.get(t.conta_id) || 0) + 1);
  }

  if (countByConta.size === 0) {
    // Sem pendentes — conclui qualquer tarefa de reconciliação que esteja aberta
    await supabase
      .from('tarefas_usuario')
      .update({ status: 'concluida', completed_at: new Date().toISOString() })
      .eq('tipo', 'reconciliacao_pendente')
      .eq('status', 'pendente');
    localStorage.setItem(SESSION_CACHE_KEY_RECON, String(Date.now()));
    return { criadas: 0 };
  }

  const contaIds = [...countByConta.keys()];
  // Busca nomes das contas
  const { data: contas } = await supabase
    .from('contas')
    .select('id, nome, apelido')
    .in('id', contaIds);
  const contasMap = new Map((contas || []).map((c) => [c.id, c]));

  // Tarefas existentes
  const { data: existentes } = await supabase
    .from('tarefas_usuario')
    .select('id, conta_id')
    .eq('tipo', 'reconciliacao_pendente')
    .eq('status', 'pendente')
    .in('conta_id', contaIds);
  const existentesPorConta = new Map((existentes || []).map((t) => [t.conta_id, t]));

  const novas = [];
  for (const [contaId, count] of countByConta) {
    if (existentesPorConta.has(contaId)) continue;
    const conta = contasMap.get(contaId);
    const nomeExib = conta?.apelido?.trim() || conta?.nome || 'Conta';
    novas.push({
      user_id: user.id,
      workspace_id: requireWorkspaceId(),
      tipo: 'reconciliacao_pendente',
      titulo: `Reconciliar transações — ${nomeExib}`,
      descricao: `Você tem ${count} transação${count > 1 ? 'ões' : ''} importada${count > 1 ? 's' : ''} esperando confirmação.`,
      prioridade: count > 10 ? 'alta' : 'normal',
      status: 'pendente',
      conta_id: contaId,
      acao_url: '/transacoes.html',
      acao_label: 'Reconciliar agora',
      auto_completa_quando: { tipo: 'reconciliacao_pendente', conta_id: contaId },
    });
  }

  if (novas.length > 0) {
    await supabase.from('tarefas_usuario').insert(novas);
  }

  // Limpa tarefas de contas que não têm mais pendentes
  const contasSemPendentes = (await supabase
    .from('tarefas_usuario')
    .select('id, conta_id')
    .eq('tipo', 'reconciliacao_pendente')
    .eq('status', 'pendente')).data || [];
  const idsParaConcluir = contasSemPendentes
    .filter((t) => !countByConta.has(t.conta_id))
    .map((t) => t.id);
  if (idsParaConcluir.length > 0) {
    await supabase
      .from('tarefas_usuario')
      .update({ status: 'concluida', completed_at: new Date().toISOString() })
      .in('id', idsParaConcluir);
  }

  localStorage.setItem(SESSION_CACHE_KEY_RECON, String(Date.now()));
  return { criadas: novas.length };
}

/**
 * Auto-conclui tarefas pendentes cuja condição auto_completa_quando bate
 * com o evento informado. Usado depois de importar um extrato ou reconciliar
 * transações.
 *
 * @param {object} evento - ex: { tipo: 'import_extrato', conta_id: 'uuid' }
 */
export async function autoConcluirTarefas(evento) {
  if (!evento || !evento.tipo) return 0;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  // Busca tarefas pendentes desse tipo, dessa conta (se aplicável)
  let query = supabase
    .from('tarefas_usuario')
    .select('id, auto_completa_quando')
    .eq('status', 'pendente')
    .not('auto_completa_quando', 'is', null);
  const { data: tarefas } = await query;
  if (!tarefas || tarefas.length === 0) return 0;

  const matches = tarefas.filter((t) => {
    const cond = t.auto_completa_quando || {};
    if (cond.tipo !== evento.tipo) return false;
    if (cond.conta_id && evento.conta_id && cond.conta_id !== evento.conta_id) return false;
    return true;
  });
  if (matches.length === 0) return 0;

  const ids = matches.map((t) => t.id);
  await supabase
    .from('tarefas_usuario')
    .update({ status: 'concluida', completed_at: new Date().toISOString() })
    .in('id', ids);
  return ids.length;
}

/**
 * Marca uma tarefa como concluída.
 */
export async function concluirTarefa(id) {
  const { error } = await supabase
    .from('tarefas_usuario')
    .update({ status: 'concluida', completed_at: new Date().toISOString() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Dispensa (snooze) uma tarefa por N dias.
 */
export async function dispensarTarefa(id, dias = 3) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const dispensada_ate = d.toISOString().slice(0, 10);
  const { error } = await supabase
    .from('tarefas_usuario')
    .update({ dispensada_ate })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Desativa o lembrete da conta (zera frequencia_importacao_dias)
 * e marca a tarefa como dispensada permanentemente.
 */
export async function nuncaLembrarMais(tarefaId, contaId) {
  if (contaId) {
    // freq=0 significa "usuário desabilitou" (≠ null que vira default 30)
    await supabase
      .from('contas')
      .update({ frequencia_importacao_dias: 0 })
      .eq('id', contaId);
  }
  const { error } = await supabase
    .from('tarefas_usuario')
    .update({ status: 'dispensada', completed_at: new Date().toISOString() })
    .eq('id', tarefaId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
