// =============================================================
// FinFlow — Caixa Livre alocável + carry-forward entre blocos
//
// "Caixa Livre" = Σ(Receitas) - Σ(Despesas) do bloco + carry-forward do anterior.
//
// Alocações distribuem o caixa livre em destinos:
//   - investimento (subcategoria de investimento)
//   - divida (sub vinculada a uma dívida)
//   - caixinha (sub tipo Caixinha)
//   - rollover (carry-forward pro próximo bloco)
//   - avulsa (sem destino específico)
//
// Carry-forward: sobra de um bloco vira entrada virtual do próximo
// (registrado como alocação destino_tipo='rollover').
// =============================================================
import { supabase } from './supabase.js';
import { requireWorkspaceId } from './workspace.js';

/**
 * Carrega alocações dos blocos do mês (todas, agrupadas por bloco_indice).
 */
export async function loadAlocacoesMes(mesAno) {
  const { data, error } = await supabase
    .from('alocacoes_caixa_livre')
    .select('*')
    .eq('mes_ano', mesAno)
    .order('created_at');
  if (error) {
    if (/relation.*alocacoes_caixa_livre/i.test(error.message)) {
      console.warn('[loadAlocacoesMes] tabela ausente — rode migration 0105');
    } else {
      console.warn('[loadAlocacoesMes]', error);
    }
    return [];
  }
  return data || [];
}

/**
 * Cria uma alocação nova.
 */
export async function criarAlocacao({
  mes_ano,
  bloco_indice,
  destino_tipo,
  destino_id,
  valor,
  moeda = 'BRL',
  descricao,
  status = 'planejada',
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'no_user' };

  const payload = {
    user_id: user.id,
    workspace_id: requireWorkspaceId(),
    mes_ano,
    bloco_indice,
    destino_tipo,
    destino_id: destino_id || null,
    valor,
    moeda,
    descricao: descricao || null,
    status,
  };
  const { data, error } = await supabase
    .from('alocacoes_caixa_livre')
    .insert(payload)
    .select()
    .single();
  return error ? { ok: false, error: error.message } : { ok: true, alocacao: data };
}

/**
 * Atualiza uma alocação existente.
 */
export async function atualizarAlocacao(id, updates) {
  const { error } = await supabase
    .from('alocacoes_caixa_livre')
    .update(updates)
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Cancela (delete) uma alocação.
 */
export async function deletarAlocacao(id) {
  const { error } = await supabase
    .from('alocacoes_caixa_livre')
    .delete()
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Soma das alocações de um bloco (excluindo canceladas).
 */
export function totalAlocado(alocacoes, blocoIndice) {
  return (alocacoes || [])
    .filter((a) => a.bloco_indice === blocoIndice && a.status !== 'cancelada')
    .reduce((sum, a) => sum + Number(a.valor || 0), 0);
}

/**
 * Carry-forward: soma das alocações destino_tipo='rollover' originadas no bloco anterior.
 *
 * Quando bloco N "encerra", o "Caixa Livre - alocações" é registrado como
 * uma alocação tipo 'rollover' no bloco N+1 (entrada virtual).
 *
 * @param {number} blocoIndice - bloco atual
 * @param {Array} alocacoes - todas alocações do mês
 * @returns {number} - saldo trazido do bloco anterior
 */
export function carryForward(blocoIndice, alocacoes) {
  if (blocoIndice <= 1) return 0;
  return (alocacoes || [])
    .filter((a) => a.bloco_indice === blocoIndice && a.destino_tipo === 'rollover' && a.status !== 'cancelada')
    .reduce((sum, a) => sum + Number(a.valor || 0), 0);
}

/**
 * Calcula o Caixa Livre líquido de um bloco:
 *   = saldo bruto do bloco (receitas - despesas) + carry-forward do anterior - alocações já feitas
 *
 * @param {number} saldoBloco
 * @param {number} blocoIndice
 * @param {Array} alocacoes
 * @returns {{ bruto, carry, alocado, livre }}
 */
export function calcularCaixaLivre(saldoBloco, blocoIndice, alocacoes) {
  const bruto = Number(saldoBloco) || 0;
  const carry = carryForward(blocoIndice, alocacoes);
  // Total alocado excluindo o próprio rollover (que é o que sai, não o que está alocado)
  const alocado = (alocacoes || [])
    .filter((a) => a.bloco_indice === blocoIndice && a.status !== 'cancelada' && a.destino_tipo !== 'rollover')
    .reduce((sum, a) => sum + Number(a.valor || 0), 0);
  const livre = bruto + carry - alocado;
  return { bruto, carry, alocado, livre };
}

/**
 * Label amigável para destino_tipo.
 */
export function labelDestinoTipo(tipo) {
  const labels = {
    investimento: 'Investimento',
    divida:       'Quitar dívida',
    caixinha:     'Caixinha',
    rollover:     'Levar pro próximo bloco',
    avulsa:       'Despesa avulsa',
  };
  return labels[tipo] || tipo;
}

/**
 * Ícone (emoji) por destino_tipo.
 */
export function iconeDestinoTipo(tipo) {
  const icones = {
    investimento: '🌱',
    divida:       '💳',
    caixinha:     '🐷',
    rollover:     '➡️',
    avulsa:       '💸',
  };
  return icones[tipo] || '•';
}
