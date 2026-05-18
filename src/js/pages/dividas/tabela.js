// =============================================================
// FinFlow — Dívidas: builders de tabela de amortização
// =============================================================
// Funções puras (sem efeito colateral) extraídas de dividas.js
// para reduzir tamanho do arquivo principal e facilitar testes.
//
// Dependências externas: amortizacao + indicadores (libs).
// Estado externo (cachedDividaHistorico) é injetado via parâmetro
// — nada é lido de variáveis globais.
// =============================================================
import { gerarTabela, aplicarCorrecao } from '../../lib/amortizacao.js';
import { getCachedIndicadores, anualToMensal } from '../../lib/indicadores.js';

/** @typedef {import('../../lib/shapes.js').Divida} Divida */
/** @typedef {import('../../lib/shapes.js').TabelaParcela} TabelaParcela */
/** @typedef {import('../../lib/shapes.js').PagamentoDividaHistorico} PagamentoDividaHistorico */

/**
 * Constrói a tabela de amortização para exibição.
 *
 * - Para taxa fixa OU sem pagamentos registrados: usa gerarTabela puro
 *   + aplicarCorrecao se houver correção monetária.
 * - Para taxa variável COM pagamentos: monta híbrido:
 *   • paidRows: reconstrói a partir dos pagamentos reais (histórico)
 *   • futureRows: gerarTabela sobre saldo atual + nRestantes
 *
 * @param {Divida} d
 * @param {PagamentoDividaHistorico[]} historico  todas as entradas do histórico (será filtrado por divida_id)
 * @returns {TabelaParcela[]}
 */
export function buildTabelaDisplay(d, historico) {
  const principal = Number(d.valor_total);
  const taxa      = Number(d.juros_percentual || 0) / 100;
  const n         = d.n_parcelas;
  const pagas     = d.parcelas_pagas || 0;
  const fases     = d.fases || null;

  // Correção monetária: aplicada apenas nos rows futuros (passados são reais)
  const corrMensal = corrMensalDecimal(d);

  // "Variável" agora deriva de juros_tipo (manual_variavel ou indexado)
  const isVar = d.juros_tipo === 'manual_variavel' ||
                (d.juros_tipo && d.juros_tipo !== 'manual_fixo' && d.juros_tipo !== 'manual');
  if (!isVar || pagas === 0) {
    const base = gerarTabela(d.regime, principal, taxa, n, fases);
    return corrMensal ? aplicarCorrecao(base, corrMensal) : base;
  }

  const pagamentos = (historico || [])
    .filter((h) => h.divida_id === d.id && h.n_parcela != null)
    .sort((a, b) => a.n_parcela - b.n_parcela);

  const saldoAtual = Math.max(0, principal - Number(d.valor_pago));
  const nRestantes = n - pagas;

  let paidRows;
  if (pagamentos.length >= pagas) {
    let saldo = principal;
    paidRows = pagamentos.slice(0, pagas).map((h) => {
      const amort    = Number(h.valor_amortizacao || 0);
      const juros    = Number(h.valor_juros || 0);
      const corr     = Number(h.valor_correcao || 0);
      const desconto = Number(h.desconto_antecipacao || 0);
      const row = {
        n: h.n_parcela, saldo_inicial: saldo,
        amortizacao: amort, juros,
        parcela: amort + juros + corr - desconto,
        saldo_final: Math.max(0, saldo - amort),
      };
      saldo = row.saldo_final;
      return row;
    });
  } else {
    const base = gerarTabela(d.regime, principal, taxa, n, fases);
    paidRows = (corrMensal ? aplicarCorrecao(base, corrMensal) : base).slice(0, pagas);
  }

  // Para fases: ajusta as fases pelo offset de parcelas pagas
  const fasesFuturas = fases ? fases
    .filter((f) => f.ate > pagas)
    .map((f) => ({ de: Math.max(1, f.de - pagas), ate: f.ate - pagas, valor: f.valor })) : null;

  let futureRows = gerarTabela(d.regime, saldoAtual, taxa, nRestantes, fasesFuturas);
  if (corrMensal) futureRows = aplicarCorrecao(futureRows, corrMensal).map((r) => ({ ...r, n: r.n }));
  futureRows = futureRows.map((r) => ({ ...r, n: pagas + r.n }));

  return [...paidRows, ...futureRows];
}

/**
 * Retorna o índice da próxima parcela baseado no calendário (mês atual desde data_inicio),
 * nunca menor que parcelas_pagas (caso pago adiantado) nem maior que n_parcelas-1.
 * Garante que o valor mostrado no card coincida com o que pagamentos mostra para o mês atual.
 *
 * @param {Divida} d
 * @returns {number}  índice 0-based na tabela
 */
export function calendarParcelaIdx(d) {
  const pagas = d.parcelas_pagas || 0;
  const n = d.n_parcelas || 1;
  if (!d.data_inicio) return Math.min(pagas, n - 1);
  const hoje = new Date();
  const inicio = new Date(d.data_inicio + 'T12:00:00');
  const monthsElapsed = (hoje.getFullYear() - inicio.getFullYear()) * 12 + (hoje.getMonth() - inicio.getMonth());
  return Math.min(Math.max(pagas, monthsElapsed), n - 1);
}

/**
 * Converte indice_correcao + correcao_taxa em taxa mensal decimal.
 *
 * - 'nenhum': 0
 * - 'fixo':   correcao_taxa% / 100
 * - 'IPCA':   usa IPCA real do BrasilAPI via cache; fallback 0.4% a.m.
 * - 'IGPM':   BrasilAPI não expõe — fallback estimado 0.4% a.m.
 * - 'TR':     BrasilAPI não expõe — fallback ~0.05% a.m.
 *
 * O cache é aquecido em loadAll() via `await fetchIndicadores()`.
 *
 * @param {Divida} d
 * @returns {number}  taxa mensal em decimal (ex: 0.004 = 0.4%)
 */
export function corrMensalDecimal(d) {
  const idx = d.indice_correcao || 'nenhum';
  if (idx === 'nenhum') return 0;
  if (idx === 'fixo')   return Number(d.correcao_taxa || 0) / 100;
  if (idx === 'TR')     return 0.0005; // BrasilAPI não tem TR — fallback conservador

  if (idx === 'IPCA') {
    const ind = getCachedIndicadores();
    if (ind?.ipca != null) {
      // anualToMensal retorna % a.m. → divide por 100 pra decimal
      return anualToMensal(ind.ipca) / 100;
    }
    return 0.004; // fallback se cache ainda não aquecido
  }
  if (idx === 'IGPM') return 0.004; // BrasilAPI não tem IGPM — fallback
  return 0;
}
