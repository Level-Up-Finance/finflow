-- =============================================================
-- 0127_subcategorias_fatura_oculta.sql
--
-- Marca subcategorias do tipo "fatura_cartao" como oculta=true.
--
-- Razão conceitual:
--   Fatura X NÃO é uma subcategoria do ponto de vista do user.
--   Os lançamentos no cartão pertencem às suas categorias reais
--   (Mercado, Gasolina, Restaurante...). A "Fatura X" é apenas um
--   PLACEHOLDER OPERACIONAL — aparece em Pagamentos como linha
--   agregadora "quanto pagar nesta fatura", mas invisível em:
--     - Configurações (lista de subs)
--     - Compromissos
--     - Orçamentos (Mensal/Anual/Histórico)
--     - Relatórios
--
-- Mesmo tratamento dado a "Gastos diversos" (oculta=true, migration 0126).
-- =============================================================

UPDATE public.subcategorias
   SET oculta = true
 WHERE auto_tipo = 'fatura_cartao';
