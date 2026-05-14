-- Adiciona coluna 'origem' à tabela feedback para distinguir
-- tickets criados pelo usuário (aparecem em Sugestões & Bugs)
-- dos criados diretamente pelo admin no Gerenciador.
--
-- 'usuario' → criado pelo usuário via Sugestões & Bugs → aparece no perfil
-- 'admin'   → criado pelo admin via Gerenciador → só visível no Gerenciador

alter table public.feedback
  add column if not exists origem text not null default 'usuario'
  check (origem in ('usuario', 'admin'));
