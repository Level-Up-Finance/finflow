-- Marca compromissos criados automaticamente a partir de um pagamento parcial.
-- is_parcial = true → este compromisso representa o "restante" de um pag. parcial.
-- Usado para exibir o ícone "½" na página Pagamentos, Compromissos e Transações.

alter table public.subcategorias
  add column if not exists is_parcial boolean not null default false;
