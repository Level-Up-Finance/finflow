// =============================================================
// FinFlow — Simulações de juros compostos (anuidade mensal)
// =============================================================
// Modelo: aporte mensal PMT no fim de cada mês, taxa mensal i,
// durante n meses, com saldo inicial PV. Saldo final FV:
//
//   FV = PV·(1+i)^n + PMT·[(1+i)^n − 1] / i      (i ≠ 0)
//   FV = PV + PMT·n                              (i = 0)
//
// Os 3 cenários do simulador são derivações dessa equação:
//
//  A) Saldo final  FV  ← (PV, PMT, i, n)
//  B) Tempo        n   ← (PV, PMT, i, FV)
//  C) Aporte       PMT ← (PV, FV, i, n)

/**
 * Saldo final dado aporte mensal e período.
 * @param {number} pv  - saldo inicial
 * @param {number} pmt - aporte mensal
 * @param {number} i   - taxa mensal decimal (0.01 = 1%)
 * @param {number} n   - meses
 * @returns {number}
 */
export function saldoFinal(pv, pmt, i, n) {
  pv = Number(pv) || 0;
  pmt = Number(pmt) || 0;
  i = Number(i) || 0;
  n = Number(n) || 0;
  if (n <= 0) return pv;
  if (i === 0) return pv + pmt * n;
  const fator = Math.pow(1 + i, n);
  return pv * fator + pmt * (fator - 1) / i;
}

/**
 * Quantos meses para alcançar a meta (FV).
 * @returns {number|null}  meses (decimal); null se impossível
 */
export function tempoNecessario(pv, pmt, i, fv) {
  pv = Number(pv) || 0;
  pmt = Number(pmt) || 0;
  i = Number(i) || 0;
  fv = Number(fv) || 0;
  if (fv <= pv) return 0;
  if (i === 0) {
    if (pmt <= 0) return null;
    return (fv - pv) / pmt;
  }
  const num = fv * i + pmt;
  const den = pv * i + pmt;
  if (den <= 0) return null;
  const ratio = num / den;
  if (ratio <= 0) return null;
  const n = Math.log(ratio) / Math.log(1 + i);
  return n > 0 ? n : null;
}

/**
 * Aporte mensal necessário para alcançar FV em n meses.
 * @returns {number|null}  R$/mês; null se impossível (FV ≤ projeção do PV)
 */
export function aporteNecessario(pv, i, n, fv) {
  pv = Number(pv) || 0;
  i = Number(i) || 0;
  n = Number(n) || 0;
  fv = Number(fv) || 0;
  if (n <= 0) return null;
  if (i === 0) {
    return (fv - pv) / n;
  }
  const fator = Math.pow(1 + i, n);
  const proj  = pv * fator;
  if (fv <= proj) return 0; // o saldo inicial já chega lá só com juros
  return (fv - proj) * i / (fator - 1);
}

/**
 * Gera projeção mês-a-mês para gráfico/tabela.
 * Retorna array de { n, saldo, aportes_acum, juros_acum }.
 */
export function projecaoMensal(pv, pmt, i, n) {
  pv = Number(pv) || 0;
  pmt = Number(pmt) || 0;
  i = Number(i) || 0;
  n = Number(n) || 0;
  const rows = [];
  let saldo = pv;
  let aportes = 0;
  let juros = 0;
  rows.push({ n: 0, saldo, aportes_acum: 0, juros_acum: 0 });
  for (let k = 1; k <= n; k++) {
    const j = saldo * i;
    juros += j;
    saldo = saldo + j + pmt;
    aportes += pmt;
    rows.push({ n: k, saldo, aportes_acum: aportes, juros_acum: juros });
  }
  return rows;
}
