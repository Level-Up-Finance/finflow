// =============================================================
// FinFlow — Chaves de localStorage centralizadas
// =============================================================
// Toda chave usada em localStorage deve estar listada aqui.
// Padrão de nomenclatura: prefixo "finflow." (com ponto).
// Sub-chaves dinâmicas (por ex. visibilidade de coluna por página)
// usam função helper que devolve a chave montada.
// =============================================================

export const STORAGE_KEYS = {
  // Preferências de moeda do usuário (Sistema → Configurações)
  MOEDAS_WIDGET:    'finflow.moedas_widget',
  /** @deprecated v1.0.1 — não usar mais. BRL é default fixo. */
  MOEDA_PADRAO:     'finflow.moeda_padrao',

  // Idioma da UI (pt-BR, en, etc.)
  IDIOMA:           'finflow.idioma',

  // Tema da UI (light/dark/system)
  TEMA:             'finflow.tema',

  // Dívidas: modo do formulário (basico/avancado)
  DIV_FORM_MODE:    'finflow.div_form_mode',

  // Tarefas: timestamps de geração/reconciliação
  TAREFAS_GENERATED_AT: 'finflow.tarefas.generated_at',
  TAREFAS_RECON_AT:     'finflow.tarefas.recon_at',

  // Adiantamentos: flag de descrição já regenerada (1x por sessão)
  ADIANT_DESC_REGEN:    'finflow.adiant.desc_regen',

  // Novidades: última versão de changelog vista (string semver)
  CHANGELOG_SEEN:   'finflow.changelog.seen',
};

// -------------------------------------------------------
// CHAVES LEGADAS (não padronizadas) — não tocar sem migração
// -------------------------------------------------------
// Padronizar essas chaves invalida o estado salvo dos usuários atuais
// (tutorial visto, blocos collapsed, modo de formulário). Manter como
// estão até planejar migração silenciosa (ler antiga + setar nova).
//
//   'finflow:cols:<page>'           → col-visibility.js
//   'finflow_tutorial_seen_<page>'  → tutorial.js
//   'finflow_div_form_mode'         → dividas.js
//   'finflow_div_bloco_collapsed'   → dividas.js
//   'finflow_inv_bloco_collapsed'   → investimentos.js
//   'finflow:changelog:seen'        → sidebar.js (badge), novidades.js
//
// TODO (débito-storage-keys): migrar todas pro padrão "finflow.*" com
// função de migração silenciosa que copia o valor antigo na primeira
// leitura. Tracker: registrar como item de débito no relatório global.

/** Visibilidade de colunas por página. Ex: colVisibilityKey('transacoes') → 'finflow.cols.transacoes' */
export function colVisibilityKey(page) {
  return `finflow.cols.${page}`;
}

/** Tutorial visto por página. Ex: tutorialSeenKey('contas') → 'finflow.tutorial.contas' */
export function tutorialSeenKey(page) {
  return `finflow.tutorial.${page}`;
}

/** Estado collapsed de blocos por feature. Ex: blocoCollapsedKey('dividas') → 'finflow.bloco.dividas' */
export function blocoCollapsedKey(feature) {
  return `finflow.bloco.${feature}`;
}
