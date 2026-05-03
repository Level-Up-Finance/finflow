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

const TIPO_CARTAO = 'Cartão de Crédito';
const NOME_CATEGORIA_CARTOES = 'Cartões';

export function isContaCartao(conta) {
  return conta?.tipo === TIPO_CARTAO;
}

// -----------------------------
// Helpers de data
// -----------------------------

function pad2(n) { return String(n).padStart(2, '0'); }

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

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
    .eq('user_id', user.id)
    .eq('nome', NOME_CATEGORIA_CARTOES)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: nova, error } = await supabase
    .from('categorias')
    .insert({
      user_id:    user.id,
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
    .eq('user_id', user.id)
    .eq('categoria_id', categoriaId)
    .eq('nome', nome)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: nova, error } = await supabase
    .from('subcategorias')
    .insert({
      user_id:        user.id,
      categoria_id:   categoriaId,
      nome,
      tipo:           'Despesa',
      periodo:        'Mensal',
      vencimento_dia: Number(conta.vencimento) || 1,
      valor_base:     0,
      valor_variavel: true,
      iniciado_em:    todayISO(),
      moeda:          'BRL',
      status:         'ativa',
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
 */
async function upsertFatura(conta, mesReferencia) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from('faturas_cartao')
    .select('id')
    .eq('user_id', user.id)
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
    .eq('user_id', user.id)
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
