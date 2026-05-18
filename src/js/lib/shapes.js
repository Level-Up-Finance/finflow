// =============================================================
// FinFlow — Shapes (JSDoc @typedef central)
// =============================================================
// Definições de tipos das entidades principais do app, em JSDoc
// puro. Beneficia autocomplete + checagem leve no editor (VSCode,
// JetBrains) sem precisar migrar pra TypeScript.
//
// Uso em outros arquivos:
//   /** @typedef {import('./shapes.js').Divida} Divida */
//   /** @param {Divida} d */
//   function renderCard(d) { ... }
//
// Convenções:
//  - Campos opcionais marcados com `?` no @property (ex: `juros_percentual?`)
//  - Tipos restritos via union (ex: `'Ativa'|'Quitada'|'Negociando'|'Arquivada'`)
//  - Numéricos sempre `number` (Supabase retorna numeric como number)
//  - Datas sempre `string` no formato 'YYYY-MM-DD' (DB date) ou ISO completo
//  - UUIDs sempre `string`
// =============================================================

// ── Profile ──────────────────────────────────────────────────
/**
 * Linha da tabela `profiles`.
 * @typedef {Object} Profile
 * @property {string}  id            UUID do auth.users
 * @property {string}  [nome]
 * @property {string}  [apelido]
 * @property {string}  [bio]
 * @property {string}  [foto_url]
 * @property {string}  [telefone]
 * @property {'free'|'pro'|'premium'} [plano]
 * @property {string}  [tema]
 * @property {string}  [idioma]
 * @property {string}  [moeda_padrao]
 * @property {boolean} [suspenso]
 * @property {boolean} [is_admin]
 */

// ── Conta ────────────────────────────────────────────────────
/**
 * Linha da tabela `contas` (banco / cartão de crédito / cofrinho / etc.).
 * @typedef {Object} Conta
 * @property {string}  id
 * @property {string}  user_id
 * @property {string}  nome
 * @property {string}  [apelido]
 * @property {'Corrente'|'Poupança'|'Cofrinho'|'Investimento'|'Cartão de Crédito'} tipo
 * @property {string}  [moeda]          'BRL', 'USD', 'EUR', 'GBP'
 * @property {string}  [icone_cor]
 * @property {number}  [fec_fatura]     dia do fechamento (1–31), só para cartão
 * @property {number}  [vencimento]     dia do vencimento (1–31), só para cartão
 * @property {'ativa'|'arquivada'} status
 * @property {number}  [saldo_inicial]
 * @property {string}  [desde]          'YYYY-MM-DD'
 * @property {string}  [fechada_em]     'YYYY-MM-DD'
 */

// ── Categoria ────────────────────────────────────────────────
/**
 * Linha da tabela `categorias`.
 * @typedef {Object} Categoria
 * @property {string}  id
 * @property {string}  user_id
 * @property {string}  nome
 * @property {'receitas'|'dividas'|'investimentos'|'custo_vida'} grupo
 * @property {string}  cor              hex
 * @property {number}  ordem
 * @property {boolean} is_default
 * @property {string}  [descricao]
 */

// ── Subcategoria (Compromisso) ───────────────────────────────
/**
 * Linha da tabela `subcategorias`. Modela um "compromisso" recorrente
 * (despesa, receita, transferência, caixinha) com período e valor.
 * @typedef {Object} Subcategoria
 * @property {string}  id
 * @property {string}  user_id
 * @property {string}  categoria_id
 * @property {string}  nome
 * @property {string}  [apelido]
 * @property {'Receita'|'Despesa'|'Transferência'|'Caixinha'} tipo
 * @property {'Mensal'|'Quinzenal'|'Semanal'|'Anual'|'Único'} periodo
 * @property {number}  [valor_base]
 * @property {boolean} [valor_variavel]
 * @property {string}  [moeda]
 * @property {string}  [conta_id]
 * @property {string}  [contato_id]
 * @property {string}  [divida_id]
 * @property {string}  [projeto_id]
 * @property {string}  [iniciado_em]     'YYYY-MM-DD'
 * @property {string}  [terminado_em]    'YYYY-MM-DD'
 * @property {number}  [dia_semana]      0–6 (0=Domingo) para Semanal/Quinzenal
 * @property {number}  [vencimento_dia]  1–31 para Mensal/Anual
 * @property {number}  [intervalo_semanas] >=1 para Semanal
 * @property {'ativa'|'arquivada'} status
 */

// ── Divida (Financiamento) ───────────────────────────────────
/**
 * Linha da tabela `dividas`. Modela empréstimo / financiamento / dívida
 * com cronograma de amortização opcional (regime).
 * @typedef {Object} Divida
 * @property {string}  id
 * @property {string}  user_id
 * @property {string}  nome
 * @property {string}  [credor]
 * @property {string}  [contato_id]
 * @property {'a_pagar'|'a_receber'} [tipo]
 * @property {number}  valor_total
 * @property {number}  valor_pago
 * @property {number}  [juros_percentual]   taxa mensal em %
 * @property {'manual_fixo'|'manual_variavel'|'selic'|'selic_plus'|'cdi'|'cdi_plus'|'ipca'|'ipca_plus'} [juros_tipo]
 * @property {number}  [juros_spread]       % adicional p/ juros_tipo *_plus
 * @property {'SAC'|'Price'|'Customizado'|null} [regime]
 * @property {number}  [n_parcelas]
 * @property {number}  [parcelas_pagas]
 * @property {DividaFase[]} [fases]         só para regime Customizado
 * @property {'nenhum'|'TR'|'IPCA'|'IGPM'|'fixo'} [indice_correcao]
 * @property {number}  [correcao_taxa]      % mensal quando indice_correcao='fixo'
 * @property {string}  [data_inicio]        'YYYY-MM-DD'
 * @property {string}  [data_vencimento]    'YYYY-MM-DD'
 * @property {'Ativa'|'Quitada'|'Negociando'|'Arquivada'} status
 * @property {string}  [conta_id]
 * @property {string}  [moeda]
 * @property {string}  [observacao]
 */

/**
 * Fase de regime Customizado. Define faixa de parcelas com valor fixo
 * (carência, escalonamento) ou `auto: true` para quitar saldo residual.
 * @typedef {Object} DividaFase
 * @property {number}  de              parcela inicial (1-based)
 * @property {number}  ate             parcela final (inclusive)
 * @property {number}  [valor]         valor da parcela (obrigatório se !auto)
 * @property {boolean} [auto]          se true, calcula saldo residual + juros
 */

// ── Pagamento ────────────────────────────────────────────────
/**
 * Linha da tabela `pagamentos`. Representa a expectativa/realização
 * de uma subcategoria em um mês específico (orçamento mensal real).
 * @typedef {Object} Pagamento
 * @property {string}  id
 * @property {string}  user_id
 * @property {string}  subcategoria_id
 * @property {string}  mes_ano               'YYYY-MM-01' (sempre dia 01)
 * @property {string}  [data_vencimento]     'YYYY-MM-DD'
 * @property {number}  [valor_previsto]
 * @property {number}  [valor_real]
 * @property {string}  [moeda]
 * @property {string}  [conta_debitada_id]
 * @property {string}  [bloco_quinzenal]     '1a'|'2a' (quinzena)
 * @property {'Agendado'|'A Transferir'|'Pago'|'Cartão'|'Transferido'|'Cancelado'} status
 */

// ── Transação ────────────────────────────────────────────────
/**
 * Linha da tabela `transacoes`. Registro real de débito/crédito/transferência.
 * @typedef {Object} Transacao
 * @property {string}  id
 * @property {string}  user_id
 * @property {string}  data              'YYYY-MM-DD'
 * @property {'Receita'|'Despesa'|'Transferência'} tipo
 * @property {number}  valor
 * @property {string}  [moeda]
 * @property {string}  conta_id
 * @property {string}  [conta_destino_id]      transferências
 * @property {string}  [subcategoria_id]
 * @property {string}  [contato_id]
 * @property {string}  [divida_id]
 * @property {string}  [pagamento_id]          vínculo com pagamento agendado
 * @property {string}  [transferencia_par_id]  outra perna da transferência
 * @property {string}  [fatura_cartao_id]
 * @property {string}  [descricao]
 * @property {string}  [banco_desc]            descrição original do extrato
 * @property {string[]} [tags]
 * @property {number}  [taxa_cambio_oficial]
 * @property {number}  [taxa_cambio_efetiva]
 * @property {number}  [valor_destino]         valor na moeda de destino (transferência)
 * @property {'manual'|'importado'|'reconciliado'} [reconciliacao_status]
 */

// ── PagamentoDividaHistorico ─────────────────────────────────
/**
 * Linha da tabela `pagamentos_divida_historico`. Cada pagamento de
 * parcela de uma dívida gera um row aqui com o breakdown de
 * amortização, juros, correção e desconto.
 * @typedef {Object} PagamentoDividaHistorico
 * @property {string}  id
 * @property {string}  user_id
 * @property {string}  divida_id
 * @property {string}  data                  'YYYY-MM-DD'
 * @property {number}  valor                 total pago efetivo
 * @property {number}  [n_parcela]
 * @property {number}  [valor_amortizacao]
 * @property {number}  [valor_juros]
 * @property {number}  [valor_correcao]      pode ser negativo (paid less than calc)
 * @property {number}  [desconto_antecipacao]
 * @property {boolean} [valor_real_override]
 * @property {string}  [descricao]
 */

// ── Tabela de amortização (geração) ──────────────────────────
/**
 * Row da tabela de amortização gerada por `gerarTabela()`.
 * @typedef {Object} TabelaParcela
 * @property {number} n                número da parcela (1-based)
 * @property {number} saldo_inicial
 * @property {number} amortizacao
 * @property {number} juros
 * @property {number} parcela          amortizacao + juros
 * @property {number} saldo_final
 */

// Export vazio — JSDoc-only file. Importações usam syntax especial:
//   /** @typedef {import('./shapes.js').Divida} Divida */
export {};
