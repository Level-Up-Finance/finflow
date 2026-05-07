-- =============================================================
-- Auto-gerado por scripts/sync-strings.js em 2026-05-06T19:45:00.880Z
-- 31 strings extraídas
-- =============================================================

-- Insere strings novas e atualiza pt_br das existentes (canônico = código).
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('dividas.btn_nova', 'dividas', 'ui', 'usuario', 'Auto-extraído de dividas.html', 'Nova dívida'),
  ('dividas.descricao', 'dividas', 'ui', 'usuario', 'Auto-extraído de dividas.html', 'Acompanhe dívidas ativas, em negociação e quitadas com barras de progresso.'),
  ('dividas.eyebrow', 'dividas', 'ui', 'usuario', 'Auto-extraído de dividas.html', 'Controle'),
  ('dividas.modal.label.credor', 'dividas', 'modal', 'usuario', 'Auto-extraído de dividas.html', 'Credor'),
  ('dividas.modal.label.nome', 'dividas', 'modal', 'usuario', 'Auto-extraído de dividas.html', 'Nome da dívida *'),
  ('dividas.modal.placeholder.credor', 'dividas', 'modal', 'usuario', 'Auto-extraído de dividas.html', 'Buscar contato ou digitar novo nome…'),
  ('dividas.modal.placeholder.nome', 'dividas', 'modal', 'usuario', 'Auto-extraído de dividas.html', 'Ex: Financiamento carro'),
  ('dividas.titulo', 'dividas', 'sistema', 'usuario', 'Auto-extraído de dividas.html', 'Dívidas'),
  ('dividas.toast.arquivada', 'dividas', 'toast', 'notificacao', 'Auto-extraído de src/js/pages/dividas.js', 'Dívida arquivada (movida para Terminado)'),
  ('dividas.toast.atualizada', 'dividas', 'toast', 'notificacao', 'Auto-extraído de src/js/pages/dividas.js', 'Dívida atualizada'),
  ('dividas.toast.categoria_nao_encontrada', 'dividas', 'toast', 'notificacao', 'Auto-extraído de src/js/pages/dividas.js', 'Categoria "Dívidas" não encontrada — vá em Configurações para criá-la antes.'),
  ('dividas.toast.criada', 'dividas', 'toast', 'notificacao', 'Auto-extraído de src/js/lib/i18n.js, src/js/pages/dividas.js', 'Dívida cadastrada'),
  ('dividas.toast.erro_arquivar', 'dividas', 'toast', 'notificacao', 'Auto-extraído de src/js/pages/dividas.js', 'Erro ao arquivar'),
  ('dividas.toast.erro_carregar', 'dividas', 'toast', 'notificacao', 'Auto-extraído de src/js/pages/dividas.js', 'Erro ao carregar dívidas'),
  ('dividas.toast.erro_excluir', 'dividas', 'toast', 'notificacao', 'Auto-extraído de src/js/pages/dividas.js', 'Erro ao excluir'),
  ('dividas.toast.erro_restaurar', 'dividas', 'toast', 'notificacao', 'Auto-extraído de src/js/pages/dividas.js', 'Erro ao restaurar'),
  ('dividas.toast.erro_salvar', 'dividas', 'toast', 'notificacao', 'Auto-extraído de src/js/pages/dividas.js', 'Erro ao salvar'),
  ('dividas.toast.excluida', 'dividas', 'toast', 'notificacao', 'Auto-extraído de src/js/pages/dividas.js', 'Dívida excluída'),
  ('dividas.toast.taxa_atualizada', 'dividas', 'toast', 'notificacao', 'Auto-extraído de src/js/pages/dividas.js', 'Taxa atualizada'),
  ('dividas.toast.todas_parcelas_pagas', 'dividas', 'toast', 'notificacao', 'Auto-extraído de src/js/pages/dividas.js', 'Todas as parcelas já foram pagas'),
  ('dividas.validacao.conta_obrigatoria', 'dividas', 'ui', 'usuario', 'Auto-extraído de src/js/pages/dividas.js', 'Selecione a conta debitada — pagamento sempre é registrado em Transações.'),
  ('dividas.validacao.data_inicio', 'dividas', 'ui', 'usuario', 'Auto-extraído de src/js/pages/dividas.js', 'Informe a data de início'),
  ('dividas.validacao.data_pagamento', 'dividas', 'ui', 'usuario', 'Auto-extraído de src/js/pages/dividas.js', 'Informe a data de pagamento'),
  ('dividas.validacao.desconto_excede', 'dividas', 'ui', 'usuario', 'Auto-extraído de src/js/pages/dividas.js', 'Desconto não pode exceder o total de juros'),
  ('dividas.validacao.nome_obrigatorio', 'dividas', 'ui', 'usuario', 'Auto-extraído de src/js/pages/dividas.js', 'Informe o nome da dívida'),
  ('dividas.validacao.nova_taxa', 'dividas', 'ui', 'usuario', 'Auto-extraído de src/js/pages/dividas.js', 'Informe a nova taxa'),
  ('dividas.validacao.parcelas_obrigatorias', 'dividas', 'ui', 'usuario', 'Auto-extraído de src/js/pages/dividas.js', 'Informe o número de parcelas'),
  ('dividas.validacao.regime_sem_parcelas', 'dividas', 'ui', 'usuario', 'Auto-extraído de src/js/pages/dividas.js', 'Regime selecionado — informe o número de parcelas.'),
  ('dividas.validacao.valor_total', 'dividas', 'ui', 'usuario', 'Auto-extraído de src/js/pages/dividas.js', 'Informe um valor total válido'),
  ('dividas.validacao.vigencia', 'dividas', 'ui', 'usuario', 'Auto-extraído de src/js/pages/dividas.js', 'Informe a data de vigência'),
  ('nav.dividas', 'nav', 'ui', 'usuario', 'Auto-extraído de dividas.html', 'Dívidas')
on conflict (chave) do update
  set pt_br      = excluded.pt_br,
      pagina     = excluded.pagina,
      categoria  = excluded.categoria,
      updated_at = now();
