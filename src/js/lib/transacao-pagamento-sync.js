// =============================================================
// FinFlow — Sync bidirecional Transação ↔ Pagamento (Fase 2)
//
// Critério de match (decisão (a)): mesma subcategoria_id + mesmo mês.
// Não considera valor nem data exata — assume que ter 2 pagamentos
// distintos da mesma subcategoria no mesmo mês é raro.
// =============================================================
import { supabase } from './supabase.js';

const PAID_STATUSES = ['Pago', 'Cartão', 'Transferido'];

export function isPaidStatus(status) {
  return PAID_STATUSES.includes(status);
}

// 'YYYY-MM-DD' → 'YYYY-MM-01' (chave usada em pagamentos.mes_ano)
export function monthOfDate(dateString) {
  return (dateString || '').slice(0, 7) + '-01';
}

// -----------------------------
// LOOKUPS
// -----------------------------

/**
 * Busca um pagamento que case com a transação.
 * Match: mesma subcategoria_id + mesmo mês.
 * Se houver múltiplos blocos quinzenais no mês, retorna o primeiro
 * (Fase 2 não distingue blocos — ajuste se virar problema).
 */
export async function findMatchingPagamento({ subcategoria_id, data }) {
  if (!subcategoria_id || !data) return null;
  const mes = monthOfDate(data);
  const { data: rows, error } = await supabase
    .from('pagamentos')
    .select('id, subcategoria_id, mes_ano, status, valor_previsto, valor_real, bloco_quinzenal, data_vencimento, moeda')
    .eq('subcategoria_id', subcategoria_id)
    .eq('mes_ano', mes)
    .order('bloco_quinzenal');
  if (error || !rows || rows.length === 0) return null;
  return rows[0];
}

/**
 * Busca a transação atualmente vinculada a um pagamento (se houver).
 */
export async function findTransacaoLinkedToPagamento(pagamentoId) {
  if (!pagamentoId) return null;
  const { data, error } = await supabase
    .from('transacoes')
    .select('*')
    .eq('pagamento_id', pagamentoId)
    .maybeSingle();
  if (error) return null;
  return data;
}

// -----------------------------
// SYNC: pagamento → transação (chamado de pagamentos.js)
// -----------------------------

/**
 * Quando o status de um pagamento muda, garante que exista (ou não)
 * uma transação vinculada refletindo a realidade.
 *
 * Regras:
 *  - status virou pago → cria/atualiza transação vinculada
 *  - status virou não-pago (Agendado/Cancelado) → desvincula transação
 *    existente (NÃO deleta — preserva o registro do usuário)
 *  - valor_real ≤ 0 e sem valor_previsto → não cria nada
 */
export async function syncPagamentoToTransacao(pagamento, subcategoria) {
  const existing = await findTransacaoLinkedToPagamento(pagamento.id);

  // Status virou não-pago: desvincula a transação existente (se houver)
  if (!isPaidStatus(pagamento.status)) {
    if (existing) {
      await supabase.from('transacoes').update({ pagamento_id: null }).eq('id', existing.id);
      return { action: 'unlinked' };
    }
    return { action: 'noop' };
  }

  const valor = Number(pagamento.valor_real ?? pagamento.valor_previsto ?? 0);
  if (valor <= 0) return { action: 'skipped', reason: 'no_value' };

  const tipo     = subcategoria?.tipo === 'Receita' ? 'Receita' : 'Despesa';
  const data     = pagamento.data_vencimento || todayISO();
  const conta_id = subcategoria?.conta_id || null;
  const moeda    = subcategoria?.moeda || pagamento.moeda || 'BRL';

  const payload = {
    data,
    valor,
    tipo,
    conta_id,
    subcategoria_id: pagamento.subcategoria_id,
    pagamento_id:    pagamento.id,
    moeda,
    descricao:       `Auto-criada do pagamento (${pagamento.status})`,
  };

  if (existing) {
    const { error } = await supabase.from('transacoes').update(payload).eq('id', existing.id);
    return error ? { action: 'error', reason: error.message } : { action: 'updated' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { action: 'error', reason: 'no_user' };

  const { error } = await supabase
    .from('transacoes')
    .insert({ ...payload, user_id: user.id });
  return error ? { action: 'error', reason: error.message } : { action: 'created' };
}

// -----------------------------
// SYNC: transação → pagamento (chamado de transacoes.js)
// -----------------------------

/**
 * Marca um pagamento como pago e vincula uma transação a ele.
 * Usado quando o usuário cria uma transação manual e o sistema
 * detecta um pagamento agendado correspondente.
 */
export async function markPagamentoPagoAndLink(pagamentoId, transacaoId, valorReal) {
  const updatePag = { status: 'Pago' };
  if (valorReal != null) updatePag.valor_real = valorReal;

  const { error: pagErr } = await supabase
    .from('pagamentos')
    .update(updatePag)
    .eq('id', pagamentoId);
  if (pagErr) return { ok: false, error: pagErr.message };

  const { error: trErr } = await supabase
    .from('transacoes')
    .update({ pagamento_id: pagamentoId })
    .eq('id', transacaoId);
  if (trErr) return { ok: false, error: trErr.message };

  return { ok: true };
}

/**
 * Vincula uma transação a um pagamento já marcado como pago
 * (sem alterar status do pagamento).
 */
export async function linkTransacaoToPagamento(pagamentoId, transacaoId) {
  const { error } = await supabase
    .from('transacoes')
    .update({ pagamento_id: pagamentoId })
    .eq('id', transacaoId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Mescla: descarta a nova transação e mantém a existente vinculada
 * ao pagamento. Opcionalmente atualiza a existente com campos da nova
 * (ex: estabelecimento, descricao, valor diferente).
 */
export async function mergeTransacaoIntoExisting(newTransacaoId, existingTransacaoId, fieldsToUpdate = null) {
  if (fieldsToUpdate && Object.keys(fieldsToUpdate).length > 0) {
    const { error: updErr } = await supabase
      .from('transacoes')
      .update(fieldsToUpdate)
      .eq('id', existingTransacaoId);
    if (updErr) return { ok: false, error: updErr.message };
  }
  const { error: delErr } = await supabase
    .from('transacoes')
    .delete()
    .eq('id', newTransacaoId);
  return delErr ? { ok: false, error: delErr.message } : { ok: true };
}

// -----------------------------
// Util
// -----------------------------
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
