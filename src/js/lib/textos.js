// =============================================================
// FinFlow — i18n runtime
// =============================================================
// Padrão: cada string tem uma chave + fallback pt-BR no código.
// Exemplo (ASCII):  t( "minha.chave" , "Texto pt-BR" )
//
// O fallback é o que aparece no código (legível) e também é o
// valor canônico em pt-BR. A chave é usada para indexar e traduzir.
//
// Strings estáticas em HTML usam atributos:
//   <button data-i18n-key="dividas.btn.salvar">Salvar</button>
//   <input  data-i18n-placeholder="dividas.placeholder.valor" placeholder="0,00">
//
// O script `scripts/extract-strings.js` faz parse das duas formas
// e gera migrations SQL para popular `i18n_strings`.
// =============================================================

import { supabase } from './supabase.js';

const cache = new Map();
let initialized = false;
let initPromise = null;

/**
 * Carrega o catálogo do banco para o cache em memória.
 * Idempotente — pode ser chamado várias vezes; só executa uma fetch.
 * Falhas (sem rede, sem permissão) são silenciosas e o app cai
 * para os fallbacks pt-BR.
 *
 * @param {string} [lang='pt_br']  - coluna do idioma a usar
 */
export async function loadStrings(lang = 'pt_br') {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('i18n_strings')
        .select(`chave, ${lang}`);
      if (error) throw error;
      for (const row of data || []) {
        if (row[lang]) cache.set(row.chave, row[lang]);
      }
    } catch (err) {
      console.warn('[i18n] load falhou — usando fallbacks pt-BR', err);
    } finally {
      initialized = true;
    }
  })();
  return initPromise;
}

/**
 * Traduz uma chave. Se não houver tradução, retorna o fallback.
 *
 * @param {string} chave
 * @param {string} [fallback]  - texto pt-BR canônico (também extraído pelo script)
 * @returns {string}
 */
export function t(chave, fallback) {
  return cache.get(chave) ?? fallback ?? chave;
}

/**
 * Aplica traduções aos elementos do DOM marcados com:
 *   data-i18n-key="..."           → textContent
 *   data-i18n-placeholder="..."    → placeholder
 *   data-i18n-title="..."          → title
 *   data-i18n-aria-label="..."     → aria-label
 *
 * Usa o textContent/placeholder atual como fallback. Chame após
 * `loadStrings()` resolver. Não altera nodes que já tenham filhos
 * (para preservar HTML interno tipo SVG).
 */
export function applyTranslationsToDom(scope = document) {
  scope.querySelectorAll('[data-i18n-key]').forEach((el) => {
    const key = el.dataset.i18nKey;
    if (!key) return;
    const fallback = el.textContent;
    // Só altera se o elemento for "folha" de texto (sem filhos elemento)
    if (el.children.length === 0) el.textContent = t(key, fallback);
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (!key) return;
    el.setAttribute('placeholder', t(key, el.getAttribute('placeholder') || ''));
  });
  scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (!key) return;
    el.setAttribute('title', t(key, el.getAttribute('title') || ''));
  });
  scope.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.dataset.i18nAriaLabel;
    if (!key) return;
    el.setAttribute('aria-label', t(key, el.getAttribute('aria-label') || ''));
  });
}
