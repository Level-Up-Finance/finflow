// =============================================================
// FinFlow — Adiantamentos de receita
//
// Modelo:
//   User pede adiantamento de uma receita futura. Recebe valor_liquido
//   na conta_credito_id hoje. Em troca, a receita dos próximos N meses
//   é descontada de parcela_mensal = valor_solicitado / N.
//
// Ao registrar um adiantamento:
//   1. Insere linha em adiantamentos_receita
//   2. Cria 1 transação Receita com valor_liquido na conta destino
//   3. Pra cada um dos N meses: faz upsert em orcamento_geral com
//      valor reduzido (valor_base * occurrences - parcela_mensal)
//
// Ao deletar/cancelar:
//   - Reverte o orcamento_geral pros valores originais
//   - Deleta a transação de entrada (se ainda for 'manual')
//   - Marca como cancelado
// =============================================================
import { supabase } from './supabase.js';
import { STORAGE_KEYS } from './storage-keys.js';

/**
 * Lista adiantamentos do usuário, opcionalmente filtrado por sub.
 */
export async function loadAdiantamentos({ subcategoria_id = null, status = null } = {}) {
  let query = supabase.from('adiantamentos_receita').select('*').order('created_at', { ascending: false });
  if (subcategoria_id) query = query.eq('subcategoria_id', subcategoria_id);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) {
    if (/relation.*adiantamentos_receita/i.test(error.message)) {
      console.warn('[loadAdiantamentos] tabela ausente — rode migration 0108');
    } else {
      console.warn('[loadAdiantamentos]', error);
    }
    return [];
  }
  return data || [];
}

/**
 * Carrega TODOS adiantamentos ativos e retorna mapa: sub_id+mes_ano → parcela_mensal.
 * Usado pra aplicar descontos em batch em pagamentos/orçamento sem N queries.
 */
export async function loadDescontosAtivos() {
  const ativos = await loadAdiantamentos({ status: 'ativo' });
  const map = new Map();
  for (const a of ativos) {
    const parcela = Number(a.valor_solicitado) / a.n_parcelas;
    const startD = new Date(a.mes_inicio_desconto + 'T00:00:00');
    for (let i = 0; i < a.n_parcelas; i++) {
      const m = new Date(startD.getFullYear(), startD.getMonth() + i, 1);
      const mesAno = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
      const key = `${a.subcategoria_id}__${mesAno}`;
      const cur = map.get(key) || { total: 0, parcelas: [], indice: 0 };
      cur.total += parcela;
      cur.parcelas.push({ id: a.id, parcela, indice: i + 1, n_parcelas: a.n_parcelas });
      map.set(key, cur);
    }
  }
  return map;
}

/**
 * Registra um novo adiantamento (transação completa: insert + create transação + override orcamento).
 * @param {object} input
 * @param {string} input.subcategoria_id
 * @param {string|null} input.conta_credito_id
 * @param {string} input.data_recebimento  - YYYY-MM-DD
 * @param {number} input.valor_solicitado
 * @param {number} input.taxa              - taxa em valor absoluto (R$)
 * @param {number} input.n_parcelas
 * @param {string} input.mes_inicio_desconto - YYYY-MM-01
 * @param {string|null} input.observacao
 */
export async function registrarAdiantamento(input) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'no_user' };

  const valor_liquido = Number(input.valor_solicitado) - Number(input.taxa || 0);
  if (valor_liquido < 0) return { ok: false, error: 'taxa maior que valor solicitado' };

  const taxa_percentual = input.valor_solicitado > 0
    ? Number(((input.taxa || 0) / input.valor_solicitado * 100).toFixed(4))
    : 0;

  // Carrega dados da sub pra criar a transação corretamente
  const { data: sub, error: subErr } = await supabase
    .from('subcategorias')
    .select('id, nome, apelido, tipo, conta_id, moeda, valor_base')
    .eq('id', input.subcategoria_id)
    .single();
  if (subErr || !sub) return { ok: false, error: 'subcategoria inválida' };
  if (sub.tipo !== 'Receita') return { ok: false, error: 'adiantamento só funciona em subs de Receita' };

  const contaCredito = input.conta_credito_id || sub.conta_id;
  const moeda = sub.moeda || 'BRL';
  const nomeExib = sub.apelido?.trim() || sub.nome;

  // Monta resumo detalhado pra colocar na descrição da transação (usa buildDescricaoAdiantamento)
  const parcelaValor = Number(input.valor_solicitado) / input.n_parcelas;
  const startD = new Date(input.mes_inicio_desconto + 'T00:00:00');
  const descricaoCompleta = buildDescricaoAdiantamento({
    nomeSub: nomeExib,
    valor_solicitado: input.valor_solicitado,
    valor_liquido,
    taxa: input.taxa || 0,
    n_parcelas: input.n_parcelas,
    mes_inicio_desconto: input.mes_inicio_desconto,
    observacao: input.observacao,
  });

  // 1. Cria a transação de entrada (a Receita do adiantamento)
  const { data: tr, error: trErr } = await supabase
    .from('transacoes')
    .insert({
      user_id:         user.id,
      data:            input.data_recebimento,
      tipo:            'Receita',
      valor:           valor_liquido,
      moeda,
      conta_id:        contaCredito,
      subcategoria_id: input.subcategoria_id,
      descricao:       descricaoCompleta,
      reconciliacao_status: 'manual',
    })
    .select()
    .single();
  if (trErr) return { ok: false, error: 'transação: ' + trErr.message };

  // 2. Insere o registro do adiantamento
  const { data: adiant, error: adErr } = await supabase
    .from('adiantamentos_receita')
    .insert({
      user_id:              user.id,
      subcategoria_id:      input.subcategoria_id,
      conta_credito_id:     contaCredito,
      data_recebimento:     input.data_recebimento,
      valor_solicitado:     input.valor_solicitado,
      valor_liquido,
      taxa:                 input.taxa || 0,
      taxa_percentual,
      n_parcelas:           input.n_parcelas,
      mes_inicio_desconto:  input.mes_inicio_desconto,
      observacao:           input.observacao || null,
      transacao_credito_id: tr.id,
    })
    .select()
    .single();
  if (adErr) {
    // Rollback parcial: deleta a transação que foi criada
    await supabase.from('transacoes').delete().eq('id', tr.id);
    return { ok: false, error: 'adiantamento: ' + adErr.message };
  }

  // 3. Override em orcamento_geral pra cada um dos N meses (reaproveita startD/parcelaValor já calculados)
  for (let i = 0; i < input.n_parcelas; i++) {
    const m = new Date(startD.getFullYear(), startD.getMonth() + i, 1);
    const mesAno = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
    await applyDescontoAoOrcamento(input.subcategoria_id, mesAno, parcelaValor, user.id, moeda);
  }

  return { ok: true, adiantamento: adiant, transacao: tr };
}

/**
 * Aplica o desconto ao orcamento_geral de uma sub/mês.
 * Se já existe entrada, decrementa valor_previsto. Senão cria baseado em valor_base.
 */
async function applyDescontoAoOrcamento(subId, mesAno, parcela, userId, moeda) {
  const { data: existente } = await supabase
    .from('orcamento_geral')
    .select('id, valor_previsto')
    .eq('subcategoria_id', subId)
    .eq('mes_ano', mesAno)
    .maybeSingle();

  if (existente) {
    const novo = Math.max(0, Number(existente.valor_previsto) - parcela);
    await supabase.from('orcamento_geral').update({ valor_previsto: novo }).eq('id', existente.id);
  } else {
    // Sub não tinha entrada ainda — busca valor_base e gera com desconto aplicado
    const { data: sub } = await supabase
      .from('subcategorias')
      .select('valor_base')
      .eq('id', subId)
      .single();
    const base = Number(sub?.valor_base || 0);
    const valor = Math.max(0, base - parcela);
    await supabase.from('orcamento_geral').insert({
      user_id:          userId,
      subcategoria_id:  subId,
      mes_ano:          mesAno,
      valor_previsto:   valor,
      moeda,
    });
  }
}

/**
 * Constrói a string de descrição completa pra uma transação de adiantamento.
 * Usada tanto no registro inicial quanto no regenerador retroativo.
 */
export function buildDescricaoAdiantamento({ nomeSub, valor_solicitado, valor_liquido, taxa, n_parcelas, mes_inicio_desconto, observacao }) {
  const parcela = Number(valor_solicitado) / n_parcelas;
  const startD = new Date(mes_inicio_desconto + 'T00:00:00');
  const fmtMes = (d) => d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
  const fmtBRL = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const datas = [];
  for (let i = 0; i < n_parcelas; i++) {
    const m = new Date(startD.getFullYear(), startD.getMonth() + i, 1);
    datas.push(fmtMes(m));
  }
  const linhaTaxa = Number(taxa) > 0 ? `\nTaxa/desconto: ${fmtBRL(taxa)} (líquido recebido: ${fmtBRL(valor_liquido)})` : '';
  return `Adiantamento — ${nomeSub}
Valor adiantado: ${fmtBRL(valor_solicitado)}${linhaTaxa}
Parcelas de desconto: ${n_parcelas}× ${fmtBRL(parcela)}
Datas das parcelas: ${datas.join(' · ')}${observacao ? `\nObs: ${observacao}` : ''}`;
}

/**
 * Regenera retroativamente a descrição de TODAS as transações de adiantamento
 * que ainda estão no formato antigo (1 linha). Roda uma vez por sessão
 * (cache em localStorage).
 */
export async function regenerarDescricoesAntigas() {
  const CACHE_KEY = STORAGE_KEYS.ADIANT_DESC_REGEN;
  if (localStorage.getItem(CACHE_KEY) === '1') return { skipped: true };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { skipped: true };

  const { data: ativos } = await supabase
    .from('adiantamentos_receita')
    .select('id, subcategoria_id, valor_solicitado, valor_liquido, taxa, n_parcelas, mes_inicio_desconto, observacao, transacao_credito_id, subcategorias(nome, apelido)')
    .eq('user_id', user.id)
    .not('transacao_credito_id', 'is', null);
  if (!ativos || ativos.length === 0) {
    localStorage.setItem(CACHE_KEY, '1');
    return { atualizadas: 0 };
  }

  let atualizadas = 0;
  for (const a of ativos) {
    const nomeSub = a.subcategorias?.apelido?.trim() || a.subcategorias?.nome || 'Receita';
    const nova = buildDescricaoAdiantamento({
      nomeSub,
      valor_solicitado: a.valor_solicitado,
      valor_liquido: a.valor_liquido,
      taxa: a.taxa,
      n_parcelas: a.n_parcelas,
      mes_inicio_desconto: a.mes_inicio_desconto,
      observacao: a.observacao,
    });
    // Atualiza só se a descrição atual NÃO tem o novo formato (sem newlines)
    const { data: tr } = await supabase
      .from('transacoes')
      .select('descricao')
      .eq('id', a.transacao_credito_id)
      .maybeSingle();
    if (tr && !tr.descricao?.includes('\n')) {
      await supabase.from('transacoes').update({ descricao: nova }).eq('id', a.transacao_credito_id);
      atualizadas++;
    }
  }
  localStorage.setItem(CACHE_KEY, '1');
  return { atualizadas };
}

/**
 * Cancela um adiantamento. Reverte o desconto no orcamento_geral e deleta a
 * transação de entrada (se ainda for 'manual'). Mantém o registro com status='cancelado'.
 */
export async function cancelarAdiantamento(adiantamentoId) {
  const { data: a, error: loadErr } = await supabase
    .from('adiantamentos_receita')
    .select('*')
    .eq('id', adiantamentoId)
    .single();
  if (loadErr || !a) return { ok: false, error: 'adiantamento não encontrado' };
  if (a.status === 'cancelado') return { ok: true, noop: true };

  // Reverte o desconto: adiciona parcela de volta ao orcamento_geral
  const parcela = Number(a.valor_solicitado) / a.n_parcelas;
  const startD = new Date(a.mes_inicio_desconto + 'T00:00:00');
  for (let i = 0; i < a.n_parcelas; i++) {
    const m = new Date(startD.getFullYear(), startD.getMonth() + i, 1);
    const mesAno = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
    const { data: orc } = await supabase
      .from('orcamento_geral')
      .select('id, valor_previsto')
      .eq('subcategoria_id', a.subcategoria_id)
      .eq('mes_ano', mesAno)
      .maybeSingle();
    if (orc) {
      await supabase
        .from('orcamento_geral')
        .update({ valor_previsto: Number(orc.valor_previsto) + parcela })
        .eq('id', orc.id);
    }
  }

  // Deleta a transação de entrada se ainda for 'manual' (não veio do banco)
  if (a.transacao_credito_id) {
    const { data: tr } = await supabase
      .from('transacoes')
      .select('id, reconciliacao_status')
      .eq('id', a.transacao_credito_id)
      .maybeSingle();
    if (tr && (tr.reconciliacao_status || 'manual') === 'manual') {
      await supabase.from('transacoes').delete().eq('id', tr.id);
    }
  }

  // Marca como cancelado
  await supabase
    .from('adiantamentos_receita')
    .update({ status: 'cancelado' })
    .eq('id', adiantamentoId);

  return { ok: true };
}
