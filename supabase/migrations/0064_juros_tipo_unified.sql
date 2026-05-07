-- =============================================================
-- FinFlow — Unifica juros_tipo + taxa_tipo em uma única coluna
-- =============================================================
-- Antes:
--   juros_tipo: manual / selic / selic_plus / cdi / cdi_plus / ipca / ipca_plus
--   taxa_tipo:  fixa / variavel  (redundante para indexados)
--
-- Agora:
--   juros_tipo: manual_fixo / manual_variavel / selic / selic_plus / cdi / cdi_plus / ipca / ipca_plus
--   taxa_tipo: derivado automaticamente (mantido por retrocompatibilidade)
--
-- ORDEM IMPORTANTE: drop constraint ANTES do backfill — senão a UPDATE
-- viola o constraint antigo que só aceita 'manual'.

-- 1) Drop do constraint antigo PRIMEIRO
alter table public.dividas drop constraint if exists dividas_juros_tipo_check;

-- 2) Backfill: 'manual' → 'manual_fixo' ou 'manual_variavel'
update public.dividas
   set juros_tipo = case
     when taxa_tipo = 'fixa' then 'manual_fixo'
     else 'manual_variavel'
   end
 where juros_tipo = 'manual';

-- 3) Adiciona o novo constraint (todos os valores agora são válidos)
alter table public.dividas add constraint dividas_juros_tipo_check
  check (juros_tipo in (
    'manual_fixo', 'manual_variavel',
    'selic', 'selic_plus',
    'cdi',   'cdi_plus',
    'ipca',  'ipca_plus'
  ));

-- 4) Atualiza default
alter table public.dividas alter column juros_tipo set default 'manual_fixo';

-- 5) Sincroniza taxa_tipo (mantido pra retrocompat). Para indexados sempre 'variavel'.
update public.dividas
   set taxa_tipo = case
     when juros_tipo = 'manual_fixo' then 'fixa'
     else 'variavel'
   end;
