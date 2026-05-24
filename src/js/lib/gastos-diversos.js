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
 *
 * Robustez: se a migration 0124 não rodou (ou rodou parcial),
 * cria a categoria + sub on-demand via JS. Garante que a feature
 * funcione mesmo em ambientes onde a migration ainda não foi aplicada.
 */
let _cachedSubId = null;
let _cachedWsId = null;
export async function getGastosDiversosSubId() {
  const wsId = requireWorkspaceId();
  if (_cachedSubId && _cachedWsId === wsId) return _cachedSubId;

  // 1. Tenta achar
  const { data: existing } = await supabase
    .from('subcategorias')
    .select('id')
    .eq('workspace_id', wsId)
    .eq('auto_tipo', 'gastos_diversos')
    .maybeSingle();
  if (existing) {
    _cachedSubId = existing.id;
    _cachedWsId = wsId;
    return existing.id;
  }

  // 2. Não existe — cria categoria "Diversos" + sub em fallback JS
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // 2a. Categoria "Diversos" (se já existir por outro motivo, reusa)
  let catId = null;
  const { data: catExisting } = await supabase
    .from('categorias')
    .select('id')
    .eq('workspace_id', wsId)
    .eq('nome', 'Diversos')
    .maybeSingle();
  if (catExisting) {
    catId = catExisting.id;
  } else {
    const { data: novaCat, error: catErr } = await supabase
      .from('categorias')
      .insert({
        user_id:    user.id,
        workspace_id: wsId,
        nome:       'Diversos',
        grupo:      'custo_vida',
        cor:        '#94A3B8',
        ordem:      998,
        is_default: false,
      })
      .select('id').single();
    if (catErr) {
      console.warn('[getGastosDiversosSubId] falha criar categoria Diversos', catErr);
      return null;
    }
    catId = novaCat.id;
  }

  // 2b. Sub "Gastos diversos" (auto_gerado bloqueia edição pelo trigger 0122)
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { data: novaSub, error: subErr } = await supabase
    .from('subcategorias')
    .insert({
      user_id:        user.id,
      workspace_id:   wsId,
      created_by:     user.id,
      categoria_id:   catId,
      nome:           'Gastos diversos',
      tipo:           'Despesa',
      periodo:        'Mensal',
      vencimento_dia: 1,
      valor_base:     0,
      valor_variavel: true,
      iniciado_em:    todayIso,
      moeda:          'BRL',
      status:         'ativa',
      auto_gerado:    true,
      auto_tipo:      'gastos_diversos',
    })
    .select('id').single();
  if (subErr) {
    console.warn('[getGastosDiversosSubId] falha criar sub Gastos diversos', subErr);
    return null;
  }

  _cachedSubId = novaSub.id;
  _cachedWsId = wsId;
  return novaSub.id;
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

  // Schema de pagamentos exige orcamento_id NOT NULL.
  // Garante entry em orcamento_geral pra (sub, mes_ano) antes de criar
  // o pagamento — idempotente via maybeSingle + INSERT condicional.
  let orcamentoId = null;
  const { data: orcExisting } = await supabase
    .from('orcamento_geral')
    .select('id')
    .eq('subcategoria_id', subId)
    .eq('mes_ano', mesAno)
    .maybeSingle();
  if (orcExisting) {
    orcamentoId = orcExisting.id;
  } else {
    const { data: orcNovo, error: orcErr } = await supabase
      .from('orcamento_geral')
      .insert({
        user_id:         user.id,
        workspace_id:    requireWorkspaceId(),
        subcategoria_id: subId,
        mes_ano:         mesAno,
        valor_previsto:  0,
        moeda:           'BRL',
      })
      .select('id').single();
    if (orcErr) {
      console.warn('[ensurePagamentoGastosDiversos] orc insert', orcErr);
      return null;
    }
    orcamentoId = orcNovo.id;
  }

  const { data: novo, error } = await supabase
    .from('pagamentos')
    .insert({
      user_id:         user.id,
      workspace_id:    requireWorkspaceId(),
      created_by:      user.id,
      orcamento_id:    orcamentoId,
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
  // LEGADO: kept for compatibility. New code should call
  // ensureGastosDiversosForBlocos(blocos) directly.
  const mesAno = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  await recalcGastosDiversosBloco(mesAno, 1);
  await recalcGastosDiversosBloco(mesAno, 2);
}

/**
 * Helper: deleta pagamentos legados de Gastos diversos com valor_real=0,
 * status='A Pagar' e sem transação vinculada. Roda no início do
 * ensureGastosDiversosForBlocos pra limpar entries da regra antiga
 * (bloco_quinzenal civil 1/2 ou dia 1) antes de criar pelas regras novas.
 */
async function cleanupGastosDiversosLegados(subId) {
  if (!subId) return;
  // Busca todos pagamentos órfãos potenciais
  const { data: pags } = await supabase
    .from('pagamentos')
    .select('id, valor_real, status')
    .eq('subcategoria_id', subId);
  if (!pags || pags.length === 0) return;

  const candidatos = pags.filter(
    (p) => p.status === 'A Pagar' && (p.valor_real === null || Number(p.valor_real) === 0)
  );
  if (candidatos.length === 0) return;

  // Filtra os que NÃO têm transação vinculada
  const ids = candidatos.map((p) => p.id);
  const { data: txs } = await supabase
    .from('transacoes')
    .select('pagamento_id')
    .in('pagamento_id', ids);
  const idsComTx = new Set((txs || []).map((t) => t.pagamento_id));
  const idsParaDeletar = ids.filter((id) => !idsComTx.has(id));

  if (idsParaDeletar.length === 0) return;
  await supabase
    .from('pagamentos')
    .delete()
    .in('id', idsParaDeletar)
    .eq('workspace_id', requireWorkspaceId());
}

/**
 * Helper: garante orcamento_geral entry pra (sub, mes_ano).
 * Retorna o id ou null em erro.
 */
async function ensureOrcamentoEntry(subId, mesAno, userId, wsId) {
  const { data: existing } = await supabase
    .from('orcamento_geral')
    .select('id')
    .eq('subcategoria_id', subId)
    .eq('mes_ano', mesAno)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: novo, error } = await supabase
    .from('orcamento_geral')
    .insert({
      user_id:         userId,
      workspace_id:    wsId,
      subcategoria_id: subId,
      mes_ano:         mesAno,
      valor_previsto:  0,
      moeda:           'BRL',
    })
    .select('id').single();
  if (error) { console.warn('[ensureOrcamentoEntry]', error); return null; }
  return novo.id;
}

/**
 * Helper: soma de transações no range [startIso, endIso] em contas
 * NÃO-cartão, com pagamento_id NULL e tipo='Despesa'.
 */
async function somaTransacoesSoltasNoRange(startIso, endIso) {
  const wsId = requireWorkspaceId();
  const { data: contasNaoCartao } = await supabase
    .from('contas')
    .select('id')
    .eq('workspace_id', wsId)
    .neq('tipo', 'Cartão de Crédito');
  const contaIds = (contasNaoCartao || []).map((c) => c.id);
  if (contaIds.length === 0) return 0;

  const { data: txs } = await supabase
    .from('transacoes')
    .select('valor')
    .gte('data', startIso)
    .lte('data', endIso)
    .in('conta_id', contaIds)
    .is('pagamento_id', null)
    .eq('tipo', 'Despesa');
  return (txs || []).reduce((s, t) => s + (Number(t.valor) || 0), 0);
}

/**
 * NOVO MODELO (definido pelo user): 1 pagamento "Gastos diversos"
 * POR BLOCO REAL da renda principal (não 2 fixos por mês civil).
 *
 * Bloco real = ciclo de 14 dias entre ocorrências da renda principal.
 * Bloco crossover (indice 0) = último bloco do mês anterior espelhando
 * no atual — NÃO gera pagamento adicional (mesmo bloco visto em 2 meses).
 *
 * Identificação única: (sub_id, data_vencimento). Como o bloco crossover
 * tem o mesmo startDate/endDate quando visto de qualquer mês, o pagamento
 * é o mesmo (idempotente).
 *
 * @param {Array} blocos — output de getBlocosForMonth (cada item tem
 *                         startDate, endDate, indice, crossover?)
 */
export async function ensureGastosDiversosForBlocos(blocos) {
  if (!blocos || blocos.length === 0) return;
  const subId = await getGastosDiversosSubId();
  if (!subId) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const wsId = requireWorkspaceId();

  // Cleanup de entries legados antes de criar os novos
  await cleanupGastosDiversosLegados(subId);

  for (const bloco of blocos) {
    const startDate = bloco.startDate;
    const endDate = bloco.endDate;
    // data_vencimento = endDate do bloco. Identifica unicamente
    // o bloco (mesmo crossover visto de 2 meses tem mesma endDate).
    const dataVencimento = isoDateLocal(endDate);
    // mes_ano = primeiro dia do mês de origem do bloco (= startDate).
    // Crossover (vindo do mês anterior) → mes_ano = mês anterior.
    const mesAno = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`;
    // bloco_quinzenal: 1 se startDate dia ≤ 15, senão 2 (legado de
    // filtragem civil — mantido pra compat com queries que dependem dele).
    const blocoQuinzenal = startDate.getDate() <= 15 ? 1 : 2;

    // Recalcula valor do range exato do bloco
    const startIso = isoDateLocal(startDate);
    const endIso = isoDateLocal(endDate);
    const total = await somaTransacoesSoltasNoRange(startIso, endIso);

    // Garante pagamento existe (idempotente)
    const { data: pagExisting } = await supabase
      .from('pagamentos')
      .select('id')
      .eq('subcategoria_id', subId)
      .eq('data_vencimento', dataVencimento)
      .maybeSingle();

    if (pagExisting) {
      // Já existe — só atualiza valor_real
      await supabase
        .from('pagamentos')
        .update({ valor_real: total, valor_previsto: total })
        .eq('id', pagExisting.id);
      continue;
    }

    // Cria do zero
    const orcId = await ensureOrcamentoEntry(subId, mesAno, user.id, wsId);
    if (!orcId) continue;

    await supabase.from('pagamentos').insert({
      user_id:         user.id,
      workspace_id:    wsId,
      created_by:      user.id,
      orcamento_id:    orcId,
      subcategoria_id: subId,
      mes_ano:         mesAno,
      bloco_quinzenal: blocoQuinzenal,
      valor_previsto:  total,
      valor_real:      total,
      moeda:           'BRL',
      status:          'A Pagar',
      data_vencimento: dataVencimento,
    });
  }
}

/**
 * Helper local: data → 'YYYY-MM-DD' (timezone local do user).
 */
function isoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
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
