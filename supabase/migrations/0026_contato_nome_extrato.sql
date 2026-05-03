-- Adiciona o nome como aparece no extrato bancário ao cadastro de contatos.
-- O campo nome continua sendo o nome personalizado (exibido na UI).
-- nome_extrato guarda o texto bruto do extrato para futura identificação automática.

alter table public.contatos
  add column if not exists nome_extrato text;
