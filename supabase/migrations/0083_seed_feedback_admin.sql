-- Seed: 21 tickets de planejamento criados pelo Admin
-- Origem: 'admin' → visíveis apenas no Gerenciador de Sugestões
-- Execute no SQL Editor do Supabase

insert into public.feedback
  (user_id, type, title, description, status, origem, modulo, impacto, complexidade)
values
  (
    (select id from auth.users limit 1),
    'feature',
    'Onboarding com progresso e histórico no perfil',
    'Treinamento com barra de progresso e histórico de onboarding no perfil',
    'novo', 'admin', 'perfil', 'Alto', 'Alta'
  ),
  (
    (select id from auth.users limit 1),
    'pergunta',
    'Documentar função do botão Regenerar Blocos',
    'Documentar / revisar função do botão "Regenerar Blocos"',
    'novo', 'admin', 'pagamentos', 'Médio', 'Muito Baixa'
  ),
  (
    (select id from auth.users limit 1),
    'pergunta',
    'Verificar fluxo de baixa de fatura via compromisso',
    'Verificar fluxo: compromisso de pagamento de fatura e dar baixa',
    'novo', 'admin', 'transacoes', 'Alto', 'Média'
  ),
  (
    (select id from auth.users limit 1),
    'feature',
    'Card de conta com saldo e gráfico de fluxo de caixa',
    'Card de conta: saldo atual e gráfico de fluxo de caixa do mês',
    'novo', 'admin', 'contas', 'Alto', 'Média'
  ),
  (
    (select id from auth.users limit 1),
    'feature',
    'Campo de cheque especial no cadastro de conta',
    'Cadastro de conta: campo de cheque especial',
    'novo', 'admin', 'contas', 'Médio', 'Baixa'
  ),
  (
    (select id from auth.users limit 1),
    'feature',
    'Histórico de alterações de limite do cartão',
    'Cartão de crédito: registrar alterações de limite com histórico',
    'novo', 'admin', 'contas', 'Médio', 'Média'
  ),
  (
    (select id from auth.users limit 1),
    'sugestao',
    'Cabeçalho fixo (sticky) no Orçamento',
    'Orçamento: cabeçalho fixo (sticky) nas 2 visualizações',
    'novo', 'admin', 'orcamento', 'Médio', 'Baixa'
  ),
  (
    (select id from auth.users limit 1),
    'pergunta',
    'Integração entre Orçamento, Compromissos e Pagamentos',
    'Mapear integração entre Orçamento, Compromissos e Pagamentos',
    'novo', 'admin', 'orcamento', 'Alto', 'Alta'
  ),
  (
    (select id from auth.users limit 1),
    'feature',
    'Busca global para relatórios customizados',
    'Relatórios: busca global para geração de relatórios customizados',
    'novo', 'admin', 'relatorios', 'Alto', 'Alta'
  ),
  (
    (select id from auth.users limit 1),
    'sugestao',
    'Reescrever tutoriais com linguagem moderna e humor',
    'Reescrever tutoriais com linguagem moderna, humor e "superpoderes"',
    'novo', 'admin', 'outros', 'Alto', 'Alta'
  ),
  (
    (select id from auth.users limit 1),
    'feature',
    'Gráficos de relacionamento entre módulos nos tutoriais',
    'Tutoriais: gráficos de relacionamento entre módulos',
    'novo', 'admin', 'outros', 'Alto', 'Alta'
  ),
  (
    (select id from auth.users limit 1),
    'pergunta',
    'Textos de tutorial gerenciados via strings/i18n?',
    'Confirmar se textos de tutorial estão gerenciados nas strings/i18n',
    'novo', 'admin', 'admin', 'Baixo', 'Muito Baixa'
  ),
  (
    (select id from auth.users limit 1),
    'sugestao',
    'Tutorial de Compromissos: mencionar página pré-populada',
    'Tutorial de Compromissos: mencionar que a página vem pré-populada',
    'novo', 'admin', 'compromissos', 'Médio', 'Muito Baixa'
  ),
  (
    (select id from auth.users limit 1),
    'sugestao',
    'Revisão de feedback das plataformas benchmarkadas',
    'Benchmarking: revisar feedback de plataformas testadas',
    'novo', 'admin', 'outros', 'Alto', 'Baixa'
  ),
  (
    (select id from auth.users limit 1),
    'sugestao',
    'Analisar plataforma de benchmarking do Jader',
    'Benchmarking: analisar plataforma indicada pelo Jader',
    'novo', 'admin', 'outros', 'Médio', 'Baixa'
  ),
  (
    (select id from auth.users limit 1),
    'sugestao',
    'Auditoria completa de código e UX',
    'Auditoria completa de código e UX',
    'novo', 'admin', 'outros', 'Alto', 'Alta'
  ),
  (
    (select id from auth.users limit 1),
    'sugestao',
    'Identidade visual e posicionamento de produto',
    'Criar conceito de marca, identidade visual e posicionamento de produto',
    'novo', 'admin', 'outros', 'Alto', 'Alta'
  ),
  (
    (select id from auth.users limit 1),
    'sugestao',
    'Revisão completa de UX',
    'Revisão completa de UX como especialista',
    'novo', 'admin', 'outros', 'Alto', 'Alta'
  ),
  (
    (select id from auth.users limit 1),
    'sugestao',
    'Ambiente de staging compartilhável para devs',
    'Criar ambiente de staging online compartilhável para devs',
    'novo', 'admin', 'admin', 'Alto', 'Média'
  ),
  (
    (select id from auth.users limit 1),
    'sugestao',
    'Fluxo GitHub com branch, revisão e deploy no Vercel',
    'Fluxo GitHub: branch → revisão → deploy seletivo no Vercel',
    'novo', 'admin', 'admin', 'Alto', 'Média'
  ),
  (
    (select id from auth.users limit 1),
    'feature',
    'Papéis de acesso: Admin, Colaborador e Usuário',
    'Papéis de acesso: Admin, Colaborador e Usuário com tags visuais',
    'novo', 'admin', 'admin', 'Alto', 'Alta'
  );
