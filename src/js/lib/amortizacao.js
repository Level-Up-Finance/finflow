// =============================================================
// FinFlow — Tabela de amortização (SAC / Price / Customizado)
// =============================================================

/** @typedef {import('./shapes.js').DividaFase} DividaFase */
/** @typedef {import('./shapes.js').TabelaParcela} TabelaParcela */

/**
 * Gera a tabela de amortização completa.
 * @param {'SAC'|'Price'|'Customizado'} regime
 * @param {number} principal  - valor financiado
 * @param {number} taxa       - taxa mensal decimal (ex: 0.01 = 1%)
 * @param {number} n          - número de parcelas
 * @param {DividaFase[]} [fases]  - obrigatório para Customizado
 * @returns {TabelaParcela[]}
 */
export function gerarTabela(regime, principal, taxa, n, fases) {
  if (!regime || !principal || !n || n <= 0) return [];
  const i = taxa || 0;
  if (regime === 'SAC')         return _sac(principal, i, n);
  if (regime === 'Price')       return _price(principal, i, n);
  if (regime === 'Customizado') return _customizado(principal, i, n, fases || []);
  return [];
}

function _sac(P, i, n) {
  const A = P / n;
  const rows = [];
  let S = P;
  for (let k = 1; k <= n; k++) {
    const J  = S * i;
    const Sf = Math.max(0, S - A);
    rows.push({ n: k, saldo_inicial: S, amortizacao: A, juros: J, parcela: A + J, saldo_final: Sf });
    S = Sf;
  }
  return rows;
}

function _price(P, i, n) {
  const rows = [];
  let S = P;
  const pmt = i === 0
    ? P / n
    : P * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);

  for (let k = 1; k <= n; k++) {
    const J  = S * i;
    const A  = pmt - J;
    const Sf = Math.max(0, S - A);
    rows.push({ n: k, saldo_inicial: S, amortizacao: A, juros: J, parcela: pmt, saldo_final: Sf });
    S = Sf;
  }
  return rows;
}

/**
 * Customizado: parcelas seguem fases pré-definidas.
 * Cada fase é { de, ate, valor }. Juros é calculado da taxa × saldo,
 * amortização = parcela − juros (mas nunca negativa).
 *
 * Fase com { auto: true } calcula a parcela como saldo residual + juros
 * (útil para a última parcela de quitação total do saldo devedor).
 */
function _customizado(P, i, n, fases) {
  const rows = [];
  let S = P;
  const getFase  = (k) => fases.find((f) => k >= f.de && k <= f.ate);
  for (let k = 1; k <= n; k++) {
    const f   = getFase(k);
    const J   = S * i;
    // Se a fase é "auto", a parcela quita exatamente o saldo restante + juros deste mês
    const pmt = f?.auto ? S + J : (Number(f?.valor) || 0);
    const A   = Math.max(0, pmt - J);  // carência só de juros → amortização zerada
    const Sf  = Math.max(0, S - A);
    rows.push({ n: k, saldo_inicial: S, amortizacao: A, juros: J, parcela: pmt, saldo_final: Sf });
    S = Sf;
  }
  return rows;
}

/**
 * Aplica correção monetária mensal cumulativa sobre uma tabela.
 * Cada parcela do mês k é multiplicada por (1 + corrMensal)^(k-1).
 * @param {Array} tabela
 * @param {number} corrMensal - taxa mensal decimal (ex: 0.005 = 0.5%/mês)
 * @returns {Array} tabela ajustada
 */
export function aplicarCorrecao(tabela, corrMensal) {
  if (!corrMensal || corrMensal === 0) return tabela;
  return tabela.map((r) => {
    const fator = Math.pow(1 + corrMensal, r.n - 1);
    return {
      ...r,
      saldo_inicial: r.saldo_inicial * fator,
      amortizacao:   r.amortizacao   * fator,
      juros:         r.juros         * fator,
      parcela:       r.parcela       * fator,
      saldo_final:   r.saldo_final   * fator,
    };
  });
}

/**
 * Valida fases — todas as parcelas devem estar cobertas, sem gaps ou overlaps.
 * @returns {string|null}  - mensagem de erro ou null se válido
 */
export function validarFases(fases, nTotal) {
  if (!Array.isArray(fases) || fases.length === 0) return 'Defina ao menos uma fase';
  const sorted = [...fases].sort((a, b) => a.de - b.de);
  if (sorted[0].de !== 1) return 'A primeira fase deve começar na parcela 1';
  if (sorted[sorted.length - 1].ate !== nTotal) return `A última fase deve terminar na parcela ${nTotal}`;
  for (let k = 0; k < sorted.length; k++) {
    const f = sorted[k];
    if (f.de > f.ate) return `Fase inválida: ${f.de}–${f.ate}`;
    // Fases com auto:true não precisam de valor fixo
    if (!f.auto && !(Number(f.valor) > 0)) return `Fase ${f.de}–${f.ate}: valor deve ser positivo`;
    if (k > 0 && sorted[k].de !== sorted[k - 1].ate + 1) {
      return `Gap entre fases ${sorted[k - 1].ate} e ${sorted[k].de}`;
    }
  }
  return null;
}
