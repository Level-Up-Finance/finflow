// =============================================================
// FinFlow — Saldos bancários (snapshots + diferença)
//
// Carrega o snapshot mais recente de cada conta + calcula a diferença
// entre saldo do banco (do OFX LEDGERBAL) e saldo calculado no FinFlow.
//
// Padrão Xero: sempre exibe a diferença (qualquer valor), não apenas
// quando passa de threshold.
// =============================================================
import { supabase } from './supabase.js';

/**
 * Busca o snapshot mais recente de cada conta da lista informada.
 * @param {string[]} contaIds
 * @returns {Promise<Map<string, {data, saldo, moeda, fonte}>>}
 */
export async function loadLatestSnapshots(contaIds) {
  const out = new Map();
  if (!contaIds || contaIds.length === 0) return out;

  // Busca ordenado por data desc; usa o primeiro de cada conta
  const { data, error } = await supabase
    .from('saldos_bancarios_snapshots')
    .select('conta_id, data, saldo, moeda, fonte')
    .in('conta_id', contaIds)
    .order('data', { ascending: false });

  if (error) {
    console.warn('[loadLatestSnapshots]', error);
    return out;
  }

  for (const snap of data || []) {
    if (!out.has(snap.conta_id)) {
      out.set(snap.conta_id, snap);
    }
  }
  return out;
}

/**
 * Compara saldo do banco com saldo calculado e devolve estrutura pronta pra UI.
 * @param {number} saldoBanco       - do snapshot
 * @param {number} saldoCalculado   - do FinFlow (Σ transações reconciliadas)
 * @returns {{ diff: number, bate: boolean, sinal: 'positivo'|'negativo'|'zero' }}
 */
export function compararSaldos(saldoBanco, saldoCalculado) {
  if (saldoBanco == null || saldoCalculado == null) {
    return { diff: null, bate: null, sinal: null };
  }
  const diff = Number(saldoCalculado) - Number(saldoBanco);
  // "Bate" quando diff é exatamente 0 (ou próximo de zero por arredondamento)
  const bate = Math.abs(diff) < 0.005;
  let sinal = 'zero';
  if (diff > 0.005) sinal = 'positivo';
  else if (diff < -0.005) sinal = 'negativo';
  return { diff, bate, sinal };
}

/**
 * Formata a data do snapshot pra exibição (DD/MM).
 */
export function formatSnapshotDate(iso) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/**
 * Calcula quantos dias se passaram desde a última importação de uma conta.
 * @param {string} ultimaImportacaoIso  - YYYY-MM-DD
 * @returns {number|null}
 */
export function diasDesde(ultimaImportacaoIso) {
  if (!ultimaImportacaoIso) return null;
  const d = new Date(ultimaImportacaoIso + 'T00:00:00');
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((hoje - d) / 86400000);
}
