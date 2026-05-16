-- =============================================================
-- RESET TOTAL DE DADOS DE PRODUÇÃO
-- =============================================================
-- ⚠ DESTRUTIVO ⚠
-- Apaga todos os dados financeiros/operacionais, mantendo apenas:
--   • profiles            (usuários cadastrados)
--   • contas              (contas bancárias / cartões cadastrados)
--   • i18n_strings        (strings de tradução do app)
--   • i18n_historico      (histórico de tradução)
--   • banco_*             (catálogo de bancos / descrições)
--
-- Use no Supabase Dashboard → SQL Editor.
-- Recomendado: faça um backup antes (Database → Backups → Restore point).
-- =============================================================

BEGIN;

-- Operacional financeiro
TRUNCATE TABLE
  public.transacao_splits,
  public.transacoes,
  public.pagamentos,
  public.pagamentos_divida_historico,
  public.orcamento_geral,
  public.aportes_projeto,
  public.faturas_cartao
RESTART IDENTITY CASCADE;

-- Estruturas (dívidas, projetos, compromissos, categorias)
TRUNCATE TABLE
  public.divida_taxa_historico,
  public.dividas,
  public.investimentos,
  public.projetos_investimento,
  public.subcategoria_history,
  public.subcategorias,
  public.categorias
RESTART IDENTITY CASCADE;

-- Auxiliares
TRUNCATE TABLE
  public.regras_reconciliacao,
  public.contato_banco_descs,
  public.contatos,
  public.feedback,
  public.feedback_historico
RESTART IDENTITY CASCADE;

COMMIT;

-- =============================================================
-- Pós-reset:
--  • profiles e contas permanecem intactos.
--  • O usuário precisará recriar categorias / dívidas / projetos.
--  • Se o app tem seed automático de categorias padrão (Receita,
--    Dívidas, Investimentos), elas serão recriadas no próximo login
--    via Onboarding. Caso contrário, rode o seed manualmente.
-- =============================================================
