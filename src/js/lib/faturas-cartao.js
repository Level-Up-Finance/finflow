// =============================================================
// FinFlow — Faturas de Cartão de Crédito (Fase 4)
//
// Cada transação numa conta de cartão é agrupada numa fatura
// (faturas_cartao). A fatura tem um mes_referencia ('YYYY-MM'),
// data_fechamento e data_vencimento computados a partir do
// fec_fatura e vencimento da conta.
//
// Regra de mes_referencia:
//   transação.dia <= fec_fatura → fatura do MÊS atual
//   transação.dia >  fec_fatura → fatura do PRÓXIMO mês
//
// Se vencimento < fec_fatura, a data_vencimento cai no mês
// seguinte ao data_fechamento (caso comum: fec=25, venc=10).
//
// On-demand: ao abrir Transações ou Cartões, o sistema verifica
// faturas abertas que já passaram do data_fechamento e as fecha:
//   - status passa pra 'fechada'
//   - escreve em orcamento_geral pro mês de vencimento
//   - a página Pagamentos vai gerar um pagamento automático
// =============================================================
import { supabase } from './supabase.js';
import { todayISO } from './utils.js';
import { requireWorkspaceId } from './workspace.js';
import { occursOn } from './recurrence.js';

const TIPO_CARTAO = 'Cartão de Crédito';
const NOME_CATEGORIA_CARTOES = 'Cartões';

export function isContaCartao(conta) {
  return conta?.tipo === TIPO_CARTAO;
}

// -----------------------------
// Helpers de data
// -----------------------------

function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * Computa o mes_referencia ('YYYY-MM') da fatura para uma data
 * de transação, dado o dia de fechamento da conta.
 */
export function computeMesReferencia(dataIso, fecFatura) {
  if (!dataIso || !fecFatura) return null;
  const [y, m, d] = dataIso.split('-').map(Number);
  let year = y;
  let month = m;
  if (d > Number(fecFatura)) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return `${year}-${pad2(month)}`;
}

/**
 * Computa data_fechamento e data_vencimento para uma fatura,
 * dado o mes_referencia e os dias de fechamento/vencimento da conta.
 *
 * Convenção: se vencimento < fec_fatura, vencimento é no mês seguinte
 * (cartão fecha 25, vence 10 do mês seguinte).
 */
export function computeFaturaDates(mesReferencia, fecFatura, vencimento) {
  const [y, m] = mesReferencia.split('-').map(Number);
  const fechamentoStr = `${y}-${pad2(m)}-${pad2(clampDay(y, m, fecFatura))}`;

  let vencY = y, vencM = m;
  if (Number(vencimento) < Number(fecFatura)) {
    vencM += 1;
    if (vencM > 12) { vencM = 1; vencY += 1; }
  }
  const vencimentoStr = `${vencY}-${pad2(vencM)}-${pad2(clampDay(vencY, vencM, vencimento))}`;
  return { dataFechamento: fechamentoStr, dataVencimento: vencimentoStr };
}

// Trunca dia caso o mês não tenha (ex: 31 em fevereiro vira 28/29)
function clampDay(y, m, day) {
  const lastDay = new Date(y, m, 0).getDate();
  return Math.min(Number(day), lastDay);
}

// -----------------------------
// Categoria + Subcategoria-espelho do cartão
// -----------------------------

/**
 * Garante a categoria "Cartões" (cria se não existir).
 * Retorna o id.
 */
export async function ensureCategoriaCartoes() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from('categorias')
    .select('id')
    .eq('nome', NOME_CATEGORIA_CARTOES)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: nova, error } = await supabase
    .from('categorias')
    .insert({
      user_id:    user.id,
      workspace_id: requireWorkspaceId(),
      nome:       NOME_CATEGORIA_CARTOES,
      grupo:      'custo_vida',
      cor:        '#7E57C2',
      ordem:      999,
      is_default: false,
    })
    .select('id').single();
  if (error) { console.warn('[ensureCategoriaCartoes]', error); return null; }
  return nova.id;
}

/**
 * Garante uma subcategoria "Fatura <Card>" para o cartão.
 * Mensal + valor_variavel (cada fatura escreve seu valor no orcamento_geral).
 * Retorna o id da subcategoria.
 */
export async function ensureSubcategoriaFatura(conta) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const categoriaId = await ensureCategoriaCartoes();
  if (!categoriaId) return null;

  const nome = `Fatura ${conta.apelido || conta.nome}`;

  const { data: existing } = await supabase
    .from('subcategorias')
    .select('id')
    .eq('categoria_id', categoriaId)
    .eq('nome', nome)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: nova, error } = await supabase
    .from('subcategorias')
    .insert({
      user_id:        user.id,
      workspace_id:   requireWorkspaceId(),
      created_by:     user.id,
      categoria_id:   categoriaId,
      nome,
      tipo:           'Despesa',
      periodo:        'Mensal',
      vencimento_dia: Number(conta.vencimento) || 1,
      valor_base:     0,
      valor_variavel: true,
      // iniciado_em = primeiro dia do mês corrente.
      // Se setar todayISO(), e o user criar o cartão depois do dia
      // de vencimento (ex: hoje dia 24, venc dia 5 ou 20), o sistema
      // calcula 0 ocorrências no mês — orcamento/pagamento nem
      // nascem. Setar dia 1 garante que a sub "começa em 01/MM" e
      // captura vencimentos posteriores ao dia de criação.
      iniciado_em:    (() => { const t = todayISO(); return t.slice(0, 8) + '01'; })(),
      moeda:          'BRL',
      status:         'ativa',
      // Blindagem: sub gerenciada pelo sistema (lib/faturas-cartao.js).
      // Trigger no banco (migration 0122) bloqueia DELETE e UPDATE
      // de campos críticos. Flag `oculta` (migration 0126) esconde
      // dos UIs de sub — fatura aparece SÓ em Pagamentos.
      auto_gerado:    true,
      auto_tipo:      'fatura_cartao',
      oculta:         true,
    })
    .select('id').single();
  if (error) { console.warn('[ensureSubcategoriaFatura]', error); return null; }
  return nova.id;
}

// -----------------------------
// Sync de transação → fatura
// -----------------------------

/**
 * Garante que existe uma fatura aberta/fechada para (conta, mes_referencia).
 * Cria se não existir. Retorna o id.
 *
 * Exportado pra permitir ensureSubcategoriasFaturas criar a fatura aberta
 * inicial R$ 0 — sem ela, o card de cartão fica vazio e o pagamento
 * mensal não é gerado (HF-8).
 */
export async function upsertFatura(conta, mesReferencia) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from('faturas_cartao')
    .select('id')
    .eq('conta_id', conta.id)
    .eq('mes_referencia', mesReferencia)
    .maybeSingle();
  if (existing) return existing.id;

  const { dataFechamento, dataVencimento } = computeFaturaDates(
    mesReferencia, conta.fec_fatura, conta.vencimento
  );

  const { data: nova, error } = await supabase
    .from('faturas_cartao')
    .insert({
      user_id:         user.id,
      workspace_id:    requireWorkspaceId(),
      conta_id:        conta.id,
      mes_referencia:  mesReferencia,
      data_fechamento: dataFechamento,
      data_vencimento: dataVencimento,
      valor_total:     0,
      status:          'aberta',
    })
    .select('id').single();
  if (error) { console.warn('[upsertFatura]', error); return null; }
  return nova.id;
}

/**
 * Recalcula o valor_total de uma fatura somando todas as transações
 * vinculadas. Idempotente — é a fonte da verdade pro valor da fatura.
 */
export async function recalcFaturaTotal(faturaId) {
  const { data: txs, error } = await supabase
    .from('transacoes')
    .select('valor, tipo')
    .eq('fatura_cartao_id', faturaId);
  if (error) return { ok: false, error: error.message };

  // Despesas somam +; receitas (estornos) subtraem
  const total = (txs || []).reduce((s, t) => {
    const v = Number(t.valor || 0);
    return s + (t.tipo === 'Receita' ? -v : v);
  }, 0);

  const { error: updErr } = await supabase
    .from('faturas_cartao')
    .update({ valor_total: total })
    .eq('id', faturaId);
  return updErr ? { ok: false, error: updErr.message } : { ok: true, total };
}

/**
 * Para uma transação numa conta de cartão, garante que ela esteja
 * vinculada à fatura correta (cria se necessário) e recalcula o total.
 *
 * Retorna o id da fatura, ou null se a conta não é cartão.
 */
export async function syncTransacaoFatura(transacao, conta) {
  if (!conta || !isContaCartao(conta)) return null;
  if (!conta.fec_fatura || !conta.vencimento) {
    console.warn('[syncTransacaoFatura] cartão sem fec_fatura/vencimento configurados', conta.id);
    return null;
  }

  const mesRef = computeMesReferencia(transacao.data, conta.fec_fatura);
  if (!mesRef) return null;

  const faturaId = await upsertFatura(conta, mesRef);
  if (!faturaId) return null;

  // Vincula a transação à fatura (se ainda não estiver)
  if (transacao.fatura_cartao_id !== faturaId) {
    await supabase.from('transacoes').update({ fatura_cartao_id: faturaId }).eq('id', transacao.id);
  }

  await recalcFaturaTotal(faturaId);
  return faturaId;
}

// -----------------------------
// Sweep: garante sub "Fatura {X}" pra cada cartão existente
// -----------------------------

/**
 * Pra cada conta tipo 'Cartão de Crédito' ativa, garante que existe
 * a subcategoria espelho "Fatura {Cartão}". Idempotente.
 *
 * Chame ao carregar Contas e Pagamentos — cobre cartões que nunca
 * tiveram fatura fechada (e portanto não passaram por checkAndCloseFaturas).
 *
 * @param {Array} contas — opcional. Se não passar, busca do banco.
 * @returns {Promise<number>} quantas subs foram criadas/garantidas
 */
export async function ensureSubcategoriasFaturas(contas = null) {
  let cartoes = contas;
  if (!cartoes) {
    const { data } = await supabase
      .from('contas')
      .select('id, nome, apelido, tipo, vencimento, status')
      .eq('tipo', TIPO_CARTAO)
      .eq('status', 'ativa');
    cartoes = data || [];
  } else {
    cartoes = cartoes.filter((c) => isContaCartao(c) && c.status === 'ativa');
  }

  let count = 0;
  const hoje = todayISO();
  // Garante faturas pros próximos N meses (incluindo o atual). Cobre
  // navegação do user entre meses e gera pagamentos antecipados em
  // Pagamentos sem precisar esperar a fatura fechar.
  const MONTHS_AHEAD = 4;
  for (const cartao of cartoes) {
    if (!cartao.vencimento || !cartao.fec_fatura) continue; // sem config completa
    const subId = await ensureSubcategoriaFatura(cartao);
    if (subId) count++;

    // Garante faturas dos próximos N meses_referencia
    const [hy, hm, hd] = hoje.split('-').map(Number);
    const monthsToEnsure = new Set();
    for (let i = 0; i < MONTHS_AHEAD; i++) {
      const refMonth = hm + i; // Pode passar de 12 — Date normaliza
      const refDate = `${hy + Math.floor((refMonth - 1) / 12)}-${String(((refMonth - 1) % 12) + 1).padStart(2, '0')}-15`;
      const mesRef = computeMesReferencia(refDate, cartao.fec_fatura);
      if (mesRef) monthsToEnsure.add(mesRef);
    }
    for (const mesRef of monthsToEnsure) {
      await upsertFatura(cartao, mesRef);
    }
  }
  return count;
}

// -----------------------------
// Geração de pagamentos das faturas pro mês visível
// -----------------------------

/**
 * Garante pagamento + orcamento_geral pra cada fatura_cartao cujo
 * data_vencimento cai nos meses cobertos.
 *
 * Usa faturas_cartao como SOURCE OF TRUTH — a tabela já tem data_vencimento
 * correto via computeFaturaDates (trata caso venc<fec → vence no mês seguinte).
 *
 * Idempotente: pula se já existe pagamento pra (sub, data_vencimento).
 */
export async function ensurePagamentosFaturaForMonths(mesAnos) {
  if (!mesAnos || mesAnos.length === 0) return 0;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const wsId = requireWorkspaceId();

  // Range de datas: do primeiro dia do menor mesAno ao último dia do maior
  const sorted = [...mesAnos].sort();
  const minMesAno = sorted[0];
  const maxMesAno = sorted[sorted.length - 1];
  const [maxY, maxM] = maxMesAno.split('-').map(Number);
  const lastDayMaxMes = new Date(maxY, maxM, 0).getDate();
  const maxDate = `${maxY}-${String(maxM).padStart(2, '0')}-${String(lastDayMaxMes).padStart(2, '0')}`;

  // Busca faturas cujo data_vencimento cai no range, com sub espelho
  const { data: faturas, error } = await supabase
    .from('faturas_cartao')
    .select('id, conta_id, data_vencimento, valor_total, subcategoria_id, status, contas(id, nome, apelido, vencimento, fec_fatura, status)')
    .eq('workspace_id', wsId)
    .gte('data_vencimento', minMesAno)
    .lte('data_vencimento', maxDate);
  if (error || !faturas) {
    if (error) console.warn('[ensurePagamentosFatura]', error);
    return 0;
  }

  let created = 0;
  for (const fat of faturas) {
    // Garante sub espelho (se ainda não está vinculada)
    let subId = fat.subcategoria_id;
    if (!subId && fat.contas) {
      subId = await ensureSubcategoriaFatura(fat.contas);
      if (subId) {
        await supabase.from('faturas_cartao').update({ subcategoria_id: subId }).eq('id', fat.id);
      }
    }
    if (!subId) continue;

    const dataVencimento = fat.data_vencimento;
    const [vy, vm, vd] = dataVencimento.split('-').map(Number);
    const mesAno = `${vy}-${String(vm).padStart(2, '0')}-01`;
    const blocoQuinzenal = vd <= 15 ? 1 : 2;
    const valorPrevisto = Number(fat.valor_total) || 0;

    // 1. Garante orcamento_geral entry
    let orcId;
    const { data: orcExisting } = await supabase
      .from('orcamento_geral')
      .select('id')
      .eq('subcategoria_id', subId)
      .eq('mes_ano', mesAno)
      .maybeSingle();
    if (orcExisting) {
      orcId = orcExisting.id;
    } else {
      const { data: orcNovo, error: orcErr } = await supabase
        .from('orcamento_geral')
        .insert({
          user_id:         user.id,
          workspace_id:    wsId,
          subcategoria_id: subId,
          mes_ano:         mesAno,
          valor_previsto:  valorPrevisto,
          moeda:           'BRL',
        })
        .select('id').single();
      if (orcErr) { console.warn('[ensurePagamentosFatura] orc', orcErr); continue; }
      orcId = orcNovo.id;
    }

    // 2. Garante pagamento (idempotente)
    const { data: pagExisting } = await supabase
      .from('pagamentos')
      .select('id')
      .eq('subcategoria_id', subId)
      .eq('data_vencimento', dataVencimento)
      .maybeSingle();
    if (pagExisting) continue;

    const { error: pagErr } = await supabase
      .from('pagamentos')
      .insert({
        user_id:         user.id,
        workspace_id:    wsId,
        created_by:      user.id,
        orcamento_id:    orcId,
        subcategoria_id: subId,
        mes_ano:         mesAno,
        bloco_quinzenal: blocoQuinzenal,
        valor_previsto:  valorPrevisto,
        valor_real:      valorPrevisto,
        moeda:           'BRL',
        status:          'A Pagar',
        data_vencimento: dataVencimento,
      });
    if (pagErr) { console.warn('[ensurePagamentosFatura] pag', pagErr); continue; }
    created++;
  }
  return created;
}

// -----------------------------
// Listagem unificada de faturas (passadas + atual + futuras projetadas)
// -----------------------------

/**
 * Retorna todas as faturas conhecidas pra um cartão:
 *  - 'fechada' — gravadas em faturas_cartao com status='fechada'
 *  - 'aberta'  — gravada em faturas_cartao com status='aberta' (atual)
 *  - 'projetada' — computada a partir de subcategorias recorrentes
 *                   com conta_id = cartaoId (Netflix, Spotify, etc.)
 *
 * Ordenadas por mes_referencia descendente (mais recente primeiro).
 *
 * @param {string} contaId       — id do cartão
 * @param {object} [opts]
 * @param {number} [opts.mesesFuturo=6] — quantos meses à frente projetar
 * @returns {Promise<{ok: boolean, faturas?: Array, error?: string}>}
 */
export async function listFaturasConhecidas(contaId, opts = {}) {
  const { mesesFuturo = 6 } = opts;

  // 1. Busca a conta (fec_fatura + vencimento são necessários)
  const { data: conta, error: contaErr } = await supabase
    .from('contas')
    .select('id, nome, apelido, tipo, fec_fatura, vencimento')
    .eq('id', contaId)
    .maybeSingle();
  if (contaErr || !conta) return { ok: false, error: contaErr?.message || 'Conta não encontrada' };
  if (!isContaCartao(conta)) return { ok: false, error: 'Conta não é cartão de crédito' };
  if (!conta.fec_fatura || !conta.vencimento) {
    return { ok: false, error: 'Cartão sem dia de fechamento/vencimento configurado' };
  }

  // 2. Busca faturas reais (passadas + aberta)
  const { data: reais, error: faturasErr } = await supabase
    .from('faturas_cartao')
    .select('id, mes_referencia, data_fechamento, data_vencimento, valor_total, status')
    .eq('conta_id', contaId)
    .order('mes_referencia', { ascending: false });
  if (faturasErr) return { ok: false, error: faturasErr.message };

  const faturas = (reais || []).map((f) => ({
    mesReferencia:   f.mes_referencia,
    dataFechamento:  f.data_fechamento,
    dataVencimento:  f.data_vencimento,
    valor:           Number(f.valor_total) || 0,
    status:          f.status, // 'aberta' | 'fechada'
    origem:          'real',
    faturaId:        f.id,
  }));

  // 3. Projeta faturas futuras: pra cada mês à frente, computa data_fechamento
  //    e soma ocorrências de subs recorrentes com conta_id = cartao
  const { data: subsRec, error: subsErr } = await supabase
    .from('subcategorias')
    .select('id, nome, tipo, valor_base, valor_variavel, periodo, vencimento_dia, dia_semana, intervalo_semanas, iniciado_em, terminado_em, conta_id, auto_gerado, auto_tipo')
    .eq('conta_id', contaId)
    .eq('status', 'ativa')
    .neq('auto_tipo', 'fatura_cartao'); // exclui a própria sub espelho
  if (subsErr) return { ok: false, error: subsErr.message };

  const hoje = new Date();
  const yearAtual = hoje.getFullYear();
  const monthAtual = hoje.getMonth() + 1; // 1-12

  // Mes_referencia da fatura atual (baseado em hoje vs fec_fatura)
  const todayIso = todayISO();
  const mesRefAtual = computeMesReferencia(todayIso, conta.fec_fatura);

  // Já temos faturas reais cobrindo este mesRefAtual? Se não, projeta.
  const mesesProjetar = [];
  let [py, pm] = mesRefAtual.split('-').map(Number);
  for (let i = 0; i < mesesFuturo; i++) {
    const mesRef = `${py}-${pad2(pm)}`;
    if (!faturas.some((f) => f.mesReferencia === mesRef)) {
      mesesProjetar.push(mesRef);
    }
    pm += 1;
    if (pm > 12) { pm = 1; py += 1; }
  }

  for (const mesRef of mesesProjetar) {
    const { dataFechamento, dataVencimento } = computeFaturaDates(
      mesRef, conta.fec_fatura, conta.vencimento
    );

    // Range de datas que caem nessa fatura: do dia seguinte ao fechamento
    // do mês anterior até o dia de fechamento deste mês.
    // Pra simplificar, iteramos por todos os dias do range e perguntamos pra
    // cada sub se occursOn(sub, dia).
    const [my, mm] = mesRef.split('-').map(Number);
    let inicioY = my, inicioM = mm - 1;
    if (inicioM < 1) { inicioM = 12; inicioY -= 1; }
    const fecAnterior = clampDay(inicioY, inicioM, conta.fec_fatura);
    const inicio = new Date(inicioY, inicioM - 1, fecAnterior + 1);
    const fim = new Date(dataFechamento + 'T00:00:00');

    let totalProj = 0;
    const tx = [];
    for (const sub of (subsRec || [])) {
      if (sub.terminado_em && sub.terminado_em < dataFechamento) continue;
      if (sub.iniciado_em && sub.iniciado_em > dataVencimento)  continue;
      const cur = new Date(inicio);
      while (cur <= fim) {
        if (occursOn(sub, cur)) {
          const v = Number(sub.valor_base) || 0;
          totalProj += sub.tipo === 'Receita' ? -v : v;
          tx.push({ nome: sub.nome, valor: v, data: cur.toISOString().slice(0, 10), tipo: sub.tipo });
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    faturas.push({
      mesReferencia:  mesRef,
      dataFechamento,
      dataVencimento,
      valor:          totalProj,
      status:         'projetada',
      origem:         'projetada',
      transacoes:     tx, // detalhe expandível na UI
    });
  }

  // 4. Ordena: aberta primeiro, depois projetadas (asc), depois fechadas (desc)
  faturas.sort((a, b) => {
    const rank = (f) => f.status === 'aberta' ? 0 : f.status === 'projetada' ? 1 : 2;
    const rA = rank(a), rB = rank(b);
    if (rA !== rB) return rA - rB;
    return rA === 2
      ? b.mesReferencia.localeCompare(a.mesReferencia)  // fechadas: desc
      : a.mesReferencia.localeCompare(b.mesReferencia); // projetadas: asc
  });

  return { ok: true, faturas, conta };
}

// -----------------------------
// Fechamento on-demand
// -----------------------------

/**
 * Verifica todas as faturas abertas do usuário que já passaram do
 * data_fechamento e as fecha:
 *   1. status → 'fechada'
 *   2. cria/garante a subcategoria espelho do cartão
 *   3. escreve em orcamento_geral (mes_ano = mês de vencimento, valor_previsto = valor_total)
 *
 * Idempotente — pode rodar a cada page load. Retorna número de faturas fechadas.
 */
export async function checkAndCloseFaturas() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const today = todayISO();
  const { data: abertas, error } = await supabase
    .from('faturas_cartao')
    .select('*, contas(id, nome, apelido, tipo, fec_fatura, vencimento)')
    .eq('status', 'aberta')
    .lt('data_fechamento', today);
  if (error) {
    if (/relation.*faturas_cartao|column.*faturas/i.test(error.message)) {
      // migration 0025 não rodou — silencioso
      return 0;
    }
    console.warn('[checkAndCloseFaturas]', error);
    return 0;
  }
  if (!abertas || abertas.length === 0) return 0;

  let fechadas = 0;
  for (const fat of abertas) {
    if (!fat.contas) continue;

    // Garante subcategoria espelho do cartão
    const subId = await ensureSubcategoriaFatura(fat.contas);
    if (!subId) continue;

    // Mês de vencimento (mes_ano em orcamento_geral é primeiro dia do mês)
    const [vy, vm] = fat.data_vencimento.split('-');
    const mesAno = `${vy}-${vm}-01`;

    // Upsert em orcamento_geral
    const { error: orcErr } = await supabase
      .from('orcamento_geral')
      .upsert(
        {
          user_id:        user.id,
          workspace_id:   requireWorkspaceId(),
          subcategoria_id: subId,
          mes_ano:        mesAno,
          valor_previsto: Number(fat.valor_total) || 0,
          moeda:          'BRL',
        },
        { onConflict: 'user_id,subcategoria_id,mes_ano' }
      );
    if (orcErr) { console.warn('[checkAndCloseFaturas] upsert orcamento', orcErr); continue; }

    // Marca fatura fechada + linka subcategoria
    const { error: updErr } = await supabase
      .from('faturas_cartao')
      .update({ status: 'fechada', subcategoria_id: subId })
      .eq('id', fat.id);
    if (updErr) { console.warn('[checkAndCloseFaturas] update fatura', updErr); continue; }

    fechadas++;
  }
  return fechadas;
}
