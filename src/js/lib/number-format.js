// =============================================================
// FinFlow — Helpers de formato numérico BR
// =============================================================
// Padrão brasileiro: vírgula como separador decimal, ponto como
// separador de milhares. Aplicado em todos os inputs de valor.
//
// Uso típico:
//   import { parseDecimal, formatDecimal, attachDecimalInput } from '...';
//   const v = parseDecimal('1.234,56');     // → 1234.56
//   const s = formatDecimal(1234.56, 2);    // → '1.234,56'
//   attachDecimalInput(inputEl);            // hook de formatação on focus/blur

/**
 * Converte string em número aceitando ambos separadores.
 * - "1.234,56" → 1234.56  (BR)
 * - "1234,56"  → 1234.56  (BR simples)
 * - "1,234.56" → 1234.56  (US — fallback)
 * - "1234.56"  → 1234.56  (puro)
 * - "" / null / NaN       → null
 */
export function parseDecimal(input) {
  if (input == null) return null;
  if (typeof input === 'number') return isFinite(input) ? input : null;
  let s = String(input).trim();
  if (!s) return null;

  // Heurística: se tem vírgula E ponto, o último é o decimal
  const hasComma = s.includes(',');
  const hasDot   = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // BR: 1.234,56 — remove pontos (milhares), troca vírgula por ponto
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US: 1,234.56 — remove vírgulas (milhares)
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Só vírgula → assume decimal BR
    s = s.replace(/\./g, '').replace(',', '.');
  }
  // Só ponto ou nenhum: deixa como está
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Formata número como decimal BR sem símbolo monetário.
 * @param {number} n
 * @param {number} decimals - default 2
 * @returns {string}  ex: '1.234,56'
 */
export function formatDecimal(n, decimals = 2) {
  if (n == null || isNaN(n)) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(n));
}

/**
 * Conecta um input para formatar como decimal BR.
 * - Aceita apenas dígitos, vírgula e ponto durante digitação
 * - Ao sair (blur): se válido, reformatar com 2 casas
 * - Ao focar: mantém valor cru pra facilitar edição
 *
 * Use `<input type="text" inputmode="decimal">` para teclado numérico no mobile.
 *
 * @param {HTMLInputElement} el
 * @param {object} [opts]
 * @param {number} [opts.decimals=2]
 */
export function attachDecimalInput(el, { decimals = 2 } = {}) {
  if (!el || el._decimalAttached) return;
  el._decimalAttached = true;

  // Garante atributos corretos
  if (el.type !== 'text') el.type = 'text';
  if (!el.getAttribute('inputmode')) el.setAttribute('inputmode', 'decimal');

  el.addEventListener('input', () => {
    // Permite apenas dígitos, vírgula, ponto e UM sinal de menos no início.
    // Implementação correta (a versão anterior com /-(?!^)/g removia
    // TODOS os hífens — o lookahead (?!^) é sempre verdadeiro após o '-').
    const negative = el.value.trimStart().startsWith('-');
    const cleaned = (negative ? '-' : '') + el.value.replace(/[^0-9.,]/g, '');
    if (cleaned !== el.value) el.value = cleaned;
  });

  // UX: clicar num campo que está mostrando 0 (ex: "0,00") limpa o valor
  // pra o usuário poder digitar direto sem precisar selecionar/deletar.
  // Se o valor for não-zero, faz select-all como fallback (padrão de
  // formulário em campo numérico).
  el.addEventListener('focus', () => {
    const n = parseDecimal(el.value);
    if (n == null || n === 0) {
      el.value = '';
    } else {
      // Defer pro fim do tick: garante que .select() não compita com
      // o foco padrão do navegador (Safari especialmente).
      setTimeout(() => el.select(), 0);
    }
  });

  el.addEventListener('blur', () => {
    const n = parseDecimal(el.value);
    el.value = n == null ? '' : formatDecimal(n, decimals);
  });

  // Se já tem valor inicial, formata
  if (el.value) {
    const n = parseDecimal(el.value);
    if (n != null) el.value = formatDecimal(n, decimals);
  }
}

/**
 * Aplica `attachDecimalInput` a todos os inputs com a classe `.input-decimal`
 * dentro do escopo dado (default: document).
 */
export function autoAttachDecimalInputs(scope = document) {
  scope.querySelectorAll('input.input-decimal').forEach((el) => {
    const decimals = parseInt(el.dataset.decimals || '2', 10);
    attachDecimalInput(el, { decimals });
  });
}
