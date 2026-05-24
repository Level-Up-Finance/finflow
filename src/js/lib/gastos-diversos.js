// =============================================================
// FinFlow — Gastos Diversos
//
// Subcategoria sistêmica que agrega transações de despesa "soltas"
// (sem pagamento_id vinculado) de contas não-cartão. Aparece como
// um item de pagamento "Acompanhamento" no bloco quinzenal — não
// requer marcação manual de pago.
//
// Schema:
//   - Categoria "Diversos" + sub "Gastos diversos" criadas via
//     migration 0124 (1 por workspace, auto_gerado=true).
//   - Pagamentos da sub são criados aqui (sob demanda) e seu
//     valor_real é recomputado a cada save/delete de transação.
//
// Bloco quinzenal:
//   - V1 usa fallback simples: bloco 1 = dias 1-15, bloco 2 = 16-fim.
//   - Não acompanha renda principal (igual ao fallback de pagamentos.js
//     quando não há renda configurada).
// =============================================================
import { supabase } from './supabase.js';
import { requireWorkspaceId } from './workspace.js';

/**
 * Computa bloco quinzenal simples a partir de uma data ISO.
 * @param {string} dataIso 'YYYY-MM-DD'
 * @returns {1 | 2}
 */
export function computeBlocoSimples(dataIso) {
  if (!dataIso) return 1;
  const dia = Number(dataIso.split('-')[2]);
  return dia <= 15 ? 1 : 2;
}

/**
 * Retorna a sub sistêmica "Gastos diversos" do workspace atual.
 * Idempotente (cache em memória após primeira chamada).
 */
let _cachedSubId = null;
let _cachedWsId = null;
export async function getGastosDiversosSubId() {
  const wsId = requireWorkspaceId();
  if (_cachedSubId && _cachedWsId === wsId) return _cachedSubId;

  const { data, error } = await supabase
    .from('subcategorias')
    .select('id')
    .eq('workspace_id', wsId)
    .eq('auto_tipo', 'gastos_diversos')
    .maybeSingle();
  if (error || !data) {
    console.warn('[getGastosDiversosSubId] sub não encontrada', error);
    return null;
  }
  _cachedSubId = data.id;
  _cachedWsId = wsId;
  return data.id;
}

/**
 * Garante que existe um pagamento "Gastos diversos" pro bloco
 * (mes_ano + bloco_quinzenal). Idempotente.
 *
 * Retorna o id do pagamento (existente ou novo), ou null em erro.
 */
async function ensurePagamentoGastosDiversos(mesAno, blocoQuinzenal) {
  const subId = await getGastosDiversosSubId();
  if (!subId) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Tenta encontrar existente
  const { data: existente } = await supabase
    .from('pagamentos')
    .select('id')
    .eq('subcategoria_id', subId)
    .eq('mes_ano', mesAno)
    .eq('bloco_quinzenal', blocoQuinzenal)
    .maybeSingle();
  if (existente) return existente.id;

  // Cria novo — valor_real começa em 0, vai ser recalculado
  // data_vencimento: último dia do bloco (15 ou fim do mês)
  const [y, m] = mesAno.split('-').map(Number);
  const lastDayOfMonth = new Date(y, m, 0).getDate();
  const venDia = blocoQuinzenal === 1 ? 15 : lastDayOfMonth;
  const dataVencimento = `${y}-${String(m).padStart(2, '0')}-${String(venDia).padStart(2, '0')}`;

  const { data: novo, error } = await supabase
    .from('pagamentos')
    .insert({
      user_id:         user.id,
      workspace_id:    requireWorkspaceId(),
      created_by:      user.id,
      subcategoria_id: subId,
      mes_ano:         mesAno,
      bloco_quinzenal: blocoQuinzenal,
      valor_previsto:  0,
      valor_real:      0,
      moeda:           'BRL',
      status:          'A Pagar',
      data_vencimento: dataVencimento,
    })
    .select('id').single();
  if (error) {
    console.warn('[ensurePagamentoGastosDiversos]', error);
    return null;
  }
  return novo.id;
}

/**
 * Recalcula o valor_real do pagamento "Gastos diversos" pra um
 * bloco específico, somando transações de despesa daquele período
 * em contas não-cartão sem pagamento_id vinculado.
 *
 * Operação em 2 passos:
 *   1. Soma transações elegíveis (despesas soltas)
 *   2. UPDATE pagamento (cria primeiro se não existe)
 *
 * Idempotente. Safe to call multiple times.
 */
export async function recalcGastosDiversosBloco(mesAno, blocoQuinzenal) {
  const subId = await getGastosDiversosSubId();
  if (!subId) return { ok: false, error: 'sub não encontrada' };

  // Range de datas do bloco
  const [y, m] = mesAno.split('-').map(Number);
  const lastDayOfMonth = new Date(y, m, 0).getDate();
  const startDay = blocoQuinzenal === 1 ? 1 : 16;
  const endDay   = blocoQuinzenal === 1 ? 15 : lastDayOfMonth;
  const startIso = `${y}-${String(m).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const endIso   = `${y}-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

  // Busca contas não-cartão do workspace
  const wsId = requireWorkspaceId();
  const { data: contasNaoCartao } = await supabase
    .from('contas')
    .select('id')
    .eq('workspace_id', wsId)
    .neq('tipo', 'Cartão de Crédito');
  const contaIds = (contasNaoCartao || []).map((c) => c.id);
  if (contaIds.length === 0) return { ok: true, total: 0 };

  // Soma transações de despesa soltas (sem pagamento_id) no range
  const { data: txs, error } = await supabase
    .from('transacoes')
    .select('valor, tipo')
    .gte('data', startIso)
    .lte('data', endIso)
    .in('conta_id', contaIds)
    .is('pagamento_id', null)
    .eq('tipo', 'Despesa');
  if (error) return { ok: false, error: error.message };

  const total = (txs || []).reduce((s, t) => s + (Number(t.valor) || 0), 0);

  // Garante pagamento existe + atualiza valor_real
  const pagId = await ensurePagamentoGastosDiversos(mesAno, blocoQuinzenal);
  if (!pagId) return { ok: false, error: 'falha ao garantir pagamento' };

  const { error: updErr } = await supabase
    .from('pagamentos')
    .update({ valor_real: total, valor_previsto: total })
    .eq('id', pagId);
  if (updErr) return { ok: false, error: updErr.message };

  return { ok: true, total };
}

/**
 * Recalc com debounce — chamado a cada save/delete de transação manual.
 * Evita N recalcs em sequência se user adiciona várias transações rápido.
 */
const _pending = new Map(); // key=`${mesAno}|${bloco}` → timeoutId
export function recalcGastosDiversosBlocoDebounced(mesAno, blocoQuinzenal, delay = 400) {
  const key = `${mesAno}|${blocoQuinzenal}`;
  if (_pending.has(key)) clearTimeout(_pending.get(key));
  const tid = setTimeout(() => {
    _pending.delete(key);
    recalcGastosDiversosBloco(mesAno, blocoQuinzenal).catch((e) =>
      console.warn('[recalcGastosDiversosDebounced]', e)
    );
  }, delay);
  _pending.set(key, tid);
}

/**
 * Garante que existem pagamentos "Gastos diversos" pros 2 blocos do mês
 * e que cada um tem valor_real atualizado (recalcula).
 * Chamada ao carregar a página de Pagamentos.
 */
export async function ensureGastosDiversosForMonth(year, month) {
  const mesAno = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  // Recalc força ensurePagamento + UPDATE — idempotente
  await recalcGastosDiversosBloco(mesAno, 1);
  await recalcGastosDiversosBloco(mesAno, 2);
}

/**
 * Helper: dado uma data ISO, retorna o (mesAno, blocoQuinzenal)
 * pra usar em recalc.
 */
export function blocoFromDate(dataIso) {
  if (!dataIso) return null;
  const [y, m] = dataIso.split('-');
  return {
    mesAno:         `${y}-${m}-01`,
    blocoQuinzenal: computeBlocoSimples(dataIso),
  };
}
