-- ============================================================
-- 0047_contato_extra_fields.sql
--
-- Adiciona campos extras na tabela contatos para perfil mais completo:
--   • pessoa_tipo  — 'fisica' | 'juridica' (afeta label do documento)
--   • website      — URL
--   • whatsapp     — telefone separado pra link wa.me/<num>
--   • linkedin     — URL ou handle
--   • instagram    — handle (sem @)
--   • aniversario  — data (útil pra clientes-chave)
--   • empresa      — onde a pessoa trabalha (PF)
--   • cargo        — cargo/função (PF)
-- ============================================================

alter table public.contatos
  add column if not exists pessoa_tipo text
    check (pessoa_tipo is null or pessoa_tipo in ('fisica', 'juridica')),
  add column if not exists website     text,
  add column if not exists whatsapp    text,
  add column if not exists linkedin    text,
  add column if not exists instagram   text,
  add column if not exists aniversario date,
  add column if not exists empresa     text,
  add column if not exists cargo       text;
