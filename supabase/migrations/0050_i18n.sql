-- ============================================================
-- 0050_i18n.sql
--
-- Tabelas para gerenciamento de strings e traduções do sistema.
-- i18n_strings  : todas as strings traduzíveis com seus status por idioma.
-- i18n_historico: log de cada alteração (antes/depois/motivo/quando).
-- Seed inicial com ~90 strings das áreas mais importantes.
-- ============================================================

-- ── Tabela principal ─────────────────────────────────────────
create table if not exists public.i18n_strings (
  id           uuid primary key default gen_random_uuid(),
  chave        text not null unique,
  pagina       text not null default 'global',
  categoria    text not null default 'ui',
  visibilidade text not null default 'usuario',
  descricao    text,
  pt_br        text not null,
  en           text,
  es           text,
  fr           text,
  status_en    text not null default 'pendente',
  status_es    text not null default 'pendente',
  status_fr    text not null default 'pendente',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Histórico de alterações ───────────────────────────────────
create table if not exists public.i18n_historico (
  id           uuid primary key default gen_random_uuid(),
  string_id    uuid not null references public.i18n_strings(id) on delete cascade,
  campo        text not null,
  valor_antes  text,
  valor_depois text,
  motivo       text,
  created_at   timestamptz not null default now()
);

create index if not exists i18n_historico_string_id_idx on public.i18n_historico(string_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.i18n_strings  enable row level security;
alter table public.i18n_historico enable row level security;

-- TODO: restringir ao usuário admin quando o sistema de roles estiver pronto.
create policy "authenticated read strings"    on public.i18n_strings  for select using (auth.role() = 'authenticated');
create policy "authenticated insert strings"  on public.i18n_strings  for insert with check (auth.role() = 'authenticated');
create policy "authenticated update strings"  on public.i18n_strings  for update using (auth.role() = 'authenticated');
create policy "authenticated delete strings"  on public.i18n_strings  for delete using (auth.role() = 'authenticated');
create policy "authenticated read historico"  on public.i18n_historico for select using (auth.role() = 'authenticated');
create policy "authenticated insert historico" on public.i18n_historico for insert with check (auth.role() = 'authenticated');

-- ── Seed: strings globais (botões, labels) ────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('global.btn.salvar',         'global', 'ui',    'usuario',      'Botão principal de salvar formulários',         'Salvar'),
  ('global.btn.cancelar',       'global', 'ui',    'usuario',      'Botão de cancelar e descartar alterações',      'Cancelar'),
  ('global.btn.excluir',        'global', 'ui',    'usuario',      'Botão de excluir item',                         'Excluir'),
  ('global.btn.editar',         'global', 'ui',    'usuario',      'Botão de abrir modal de edição',                'Editar'),
  ('global.btn.fechar',         'global', 'ui',    'usuario',      'Botão de fechar modal ou painel',               'Fechar'),
  ('global.btn.confirmar',      'global', 'ui',    'usuario',      'Botão de confirmar ação destrutiva',            'Confirmar'),
  ('global.btn.arquivar',       'global', 'ui',    'usuario',      'Botão de arquivar item',                        'Arquivar'),
  ('global.btn.reativar',       'global', 'ui',    'usuario',      'Botão de reativar item arquivado',              'Reativar'),
  ('global.btn.novo',           'global', 'ui',    'usuario',      'Botão genérico de criar novo item',             'Novo'),
  ('global.btn.voltar',         'global', 'ui',    'usuario',      'Botão de voltar à lista anterior',              'Voltar'),
  ('global.btn.exportar',       'global', 'ui',    'usuario',      'Botão de exportar dados',                       'Exportar'),
  ('global.btn.importar',       'global', 'ui',    'usuario',      'Botão de importar dados de arquivo',            'Importar'),
  ('global.btn.aplicar',        'global', 'ui',    'usuario',      'Botão de aplicar filtros ou configurações',     'Aplicar'),
  ('global.label.carregando',   'global', 'ui',    'usuario',      'Texto exibido enquanto dados carregam',         'Carregando…'),
  ('global.label.sem_dados',    'global', 'ui',    'usuario',      'Mensagem quando lista está vazia ou sem filtro','Nenhum resultado encontrado.'),
  ('global.label.todos',        'global', 'ui',    'usuario',      'Opção "Todos" em filtros e seletores',          'Todos'),
  ('global.label.obrigatorio',  'global', 'ui',    'usuario',      'Indicador de campo obrigatório no formulário',  '*'),
  ('global.label.opcional',     'global', 'ui',    'usuario',      'Indicador de campo opcional no formulário',     '(opcional)')
on conflict (chave) do nothing;

-- ── Seed: toasts (notificações) ───────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('global.toast.salvo',            'global', 'toast', 'notificacao', 'Toast genérico de sucesso ao salvar',             'Salvo com sucesso.'),
  ('global.toast.criado',           'global', 'toast', 'notificacao', 'Toast genérico de item criado',                   'Criado com sucesso.'),
  ('global.toast.atualizado',       'global', 'toast', 'notificacao', 'Toast genérico de item atualizado',               'Atualizado com sucesso.'),
  ('global.toast.excluido',         'global', 'toast', 'notificacao', 'Toast genérico de item excluído',                 'Excluído com sucesso.'),
  ('global.toast.arquivado',        'global', 'toast', 'notificacao', 'Toast genérico de item arquivado',                'Arquivado.'),
  ('global.toast.reativado',        'global', 'toast', 'notificacao', 'Toast genérico de item reativado',                'Reativado.'),
  ('global.toast.copiado',          'global', 'toast', 'notificacao', 'Toast ao copiar algo para área de transferência', 'Copiado.'),
  ('global.toast.erro_generico',    'global', 'toast', 'notificacao', 'Toast de erro inesperado',                        'Ocorreu um erro inesperado. Tente novamente.'),
  ('global.toast.erro_salvar',      'global', 'toast', 'notificacao', 'Toast de erro ao salvar formulário',              'Erro ao salvar. Tente novamente.'),
  ('global.toast.erro_carregar',    'global', 'toast', 'notificacao', 'Toast de erro ao buscar dados do servidor',       'Erro ao carregar os dados.'),
  ('global.toast.erro_excluir',     'global', 'toast', 'notificacao', 'Toast de erro ao excluir item',                   'Erro ao excluir.'),
  ('global.toast.campo_obrigatorio','global', 'toast', 'notificacao', 'Toast quando campo obrigatório está vazio',        'Preencha todos os campos obrigatórios.')
on conflict (chave) do nothing;

-- ── Seed: modais globais ──────────────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('global.modal.excluir_titulo',  'global', 'modal', 'usuario', 'Título do modal de confirmação de exclusão', 'Excluir?'),
  ('global.modal.excluir_desc',    'global', 'modal', 'usuario', 'Descrição no modal de exclusão',             'Esta ação não pode ser desfeita.'),
  ('global.modal.arquivar_titulo', 'global', 'modal', 'usuario', 'Título do modal de arquivamento',            'Arquivar item?')
on conflict (chave) do nothing;

-- ── Seed: sistema / erros ─────────────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('global.sistema.nao_encontrado', 'global', 'sistema', 'usuario',      'Mensagem de página não encontrada (404)',        'Página não encontrada.'),
  ('global.sistema.sem_permissao',  'global', 'sistema', 'usuario',      'Mensagem quando usuário não tem acesso',          'Você não tem permissão para acessar esta área.'),
  ('global.sistema.sessao_expirada','global', 'sistema', 'notificacao',  'Mensagem quando a sessão do usuário expirou',     'Sua sessão expirou. Faça login novamente.')
on conflict (chave) do nothing;

-- ── Seed: navegação ───────────────────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('nav.dashboard',    'global', 'nav', 'usuario', 'Item de navegação: Dashboard',           'Dashboard'),
  ('nav.pagamentos',   'global', 'nav', 'usuario', 'Item de navegação: Pagamentos',          'Pagamentos'),
  ('nav.transacoes',   'global', 'nav', 'usuario', 'Item de navegação: Transações',          'Transações'),
  ('nav.contas',       'global', 'nav', 'usuario', 'Item de navegação: Contas',              'Contas'),
  ('nav.compromissos', 'global', 'nav', 'usuario', 'Item de navegação: Compromissos',        'Compromissos'),
  ('nav.orcamento',    'global', 'nav', 'usuario', 'Item de navegação: Orçamento',           'Orçamento'),
  ('nav.dividas',      'global', 'nav', 'usuario', 'Item de navegação: Dívidas',             'Dívidas'),
  ('nav.investimentos','global', 'nav', 'usuario', 'Item de navegação: Investimentos',       'Investimentos'),
  ('nav.relatorios',   'global', 'nav', 'usuario', 'Item de navegação: Relatórios',          'Relatórios'),
  ('nav.contatos',     'global', 'nav', 'usuario', 'Item de navegação: Contatos',            'Contatos'),
  ('nav.importar',     'global', 'nav', 'usuario', 'Item de navegação: Importar extrato',    'Importar extrato'),
  ('nav.configuracoes','global', 'nav', 'usuario', 'Item de navegação: Configurações',       'Configurações'),
  ('nav.novidades',    'global', 'nav', 'usuario', 'Item de navegação: Novidades',           'Novidades'),
  ('nav.feedback',     'global', 'nav', 'usuario', 'Item de navegação: Feedback',            'Feedback'),
  ('nav.academia',     'global', 'nav', 'usuario', 'Item de navegação: Academia',            'Academia')
on conflict (chave) do nothing;

-- ── Seed: autenticação ────────────────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('auth.login.titulo',        'auth', 'sistema', 'usuario',     'Título da tela de login',                    'Entrar na sua conta'),
  ('auth.login.subtitulo',     'auth', 'sistema', 'usuario',     'Subtítulo/descrição da tela de login',       'Bem-vindo de volta ao FinFlow'),
  ('auth.login.email',         'auth', 'ui',      'usuario',     'Label do campo de e-mail no login',          'E-mail'),
  ('auth.login.senha',         'auth', 'ui',      'usuario',     'Label do campo de senha no login',           'Senha'),
  ('auth.login.btn',           'auth', 'ui',      'usuario',     'Botão de entrar no login',                   'Entrar'),
  ('auth.login.esqueci_senha', 'auth', 'ui',      'usuario',     'Link de esqueci minha senha',                'Esqueci minha senha'),
  ('auth.login.erro',          'auth', 'erro',    'notificacao', 'Mensagem de erro de credenciais inválidas',  'E-mail ou senha incorretos.'),
  ('auth.cadastro.titulo',     'auth', 'sistema', 'usuario',     'Título da tela de cadastro',                 'Crie sua conta'),
  ('auth.cadastro.btn',        'auth', 'ui',      'usuario',     'Botão de criar conta no cadastro',           'Criar conta'),
  ('auth.sair.confirmacao',    'auth', 'modal',   'usuario',     'Pergunta do modal de confirmação de logout', 'Tem certeza que deseja sair?')
on conflict (chave) do nothing;

-- ── Seed: contatos ────────────────────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('contatos.titulo',           'contatos', 'sistema',     'usuario',     'Título da página de contatos',                   'Contatos'),
  ('contatos.descricao',        'contatos', 'sistema',     'usuario',     'Descrição da página de contatos',                'Clientes e fornecedores. Histórico de reconhecimento automático por extrato bancário.'),
  ('contatos.btn_novo',         'contatos', 'ui',          'usuario',     'Botão de criar novo contato',                    'Novo contato'),
  ('contatos.buscar',           'contatos', 'ui',          'usuario',     'Placeholder do campo de busca de contatos',      'Buscar…'),
  ('contatos.filtro.todos',     'contatos', 'ui',          'usuario',     'Pill de filtro: todos os contatos',              'Todos'),
  ('contatos.filtro.clientes',  'contatos', 'ui',          'usuario',     'Pill de filtro: somente clientes',               'Clientes'),
  ('contatos.filtro.fornecedores','contatos','ui',          'usuario',     'Pill de filtro: somente fornecedores',           'Fornecedores'),
  ('contatos.filtro.arquivados','contatos', 'ui',          'usuario',     'Pill de filtro: contatos arquivados',            'Arquivados'),
  ('contatos.filtro.pessoas',   'contatos', 'ui',          'usuario',     'Pill de filtro: pessoas físicas',                'Pessoas'),
  ('contatos.filtro.empresas',  'contatos', 'ui',          'usuario',     'Pill de filtro: pessoas jurídicas / empresas',   'Empresas'),
  ('contatos.tab.dados',        'contatos', 'ui',          'usuario',     'Aba "Dados" no detalhe do contato',              'Dados'),
  ('contatos.tab.vinculos',     'contatos', 'ui',          'usuario',     'Aba "Vínculos" no detalhe do contato',           'Vínculos'),
  ('contatos.tab.reconhecimento','contatos','ui',          'usuario',     'Aba "Reconhecimento" no detalhe do contato',     'Reconhecimento'),
  ('contatos.tab.transacoes',   'contatos', 'ui',          'usuario',     'Aba "Transações" no detalhe do contato',         'Transações'),
  ('contatos.modal.novo',       'contatos', 'modal',       'usuario',     'Título do modal de novo contato',                'Novo contato'),
  ('contatos.modal.editar',     'contatos', 'modal',       'usuario',     'Título do modal de editar contato',              'Editar contato'),
  ('contatos.toast.criado',     'contatos', 'toast',       'notificacao', 'Toast ao criar contato com sucesso',             'Contato criado.'),
  ('contatos.toast.atualizado', 'contatos', 'toast',       'notificacao', 'Toast ao atualizar contato',                     'Contato atualizado.'),
  ('contatos.toast.excluido',   'contatos', 'toast',       'notificacao', 'Toast ao excluir contato',                       'Contato excluído.'),
  ('contatos.toast.arquivado',  'contatos', 'toast',       'notificacao', 'Toast ao arquivar contato',                      'Contato arquivado.'),
  ('contatos.toast.reativado',  'contatos', 'toast',       'notificacao', 'Toast ao reativar contato arquivado',            'Contato reativado.')
on conflict (chave) do nothing;

-- ── Seed: transações ──────────────────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('transacoes.titulo',          'transacoes', 'sistema', 'usuario',     'Título da página de transações',          'Transações'),
  ('transacoes.btn_nova',        'transacoes', 'ui',      'usuario',     'Botão de nova transação',                 'Nova transação'),
  ('transacoes.toast.criada',    'transacoes', 'toast',   'notificacao', 'Toast ao criar transação',                'Transação criada.'),
  ('transacoes.toast.atualizada','transacoes', 'toast',   'notificacao', 'Toast ao atualizar transação',            'Transação atualizada.'),
  ('transacoes.toast.excluida',  'transacoes', 'toast',   'notificacao', 'Toast ao excluir transação',              'Transação excluída.')
on conflict (chave) do nothing;

-- ── Seed: compromissos ────────────────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('compromissos.titulo',         'compromissos', 'sistema', 'usuario',     'Título da página de compromissos',    'Compromissos'),
  ('compromissos.toast.criado',   'compromissos', 'toast',   'notificacao', 'Toast ao criar compromisso',          'Compromisso criado.'),
  ('compromissos.toast.atualizado','compromissos','toast',   'notificacao', 'Toast ao atualizar compromisso',       'Compromisso atualizado.'),
  ('compromissos.toast.excluido', 'compromissos', 'toast',   'notificacao', 'Toast ao excluir compromisso',        'Compromisso excluído.')
on conflict (chave) do nothing;

-- ── Seed: contas ──────────────────────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('contas.titulo',          'contas', 'sistema', 'usuario',     'Título da página de contas',    'Contas'),
  ('contas.btn_nova',        'contas', 'ui',      'usuario',     'Botão de nova conta',           'Nova conta'),
  ('contas.toast.criada',    'contas', 'toast',   'notificacao', 'Toast ao criar conta',          'Conta criada.'),
  ('contas.toast.atualizada','contas', 'toast',   'notificacao', 'Toast ao atualizar conta',      'Conta atualizada.'),
  ('contas.toast.excluida',  'contas', 'toast',   'notificacao', 'Toast ao excluir conta',        'Conta excluída.')
on conflict (chave) do nothing;

-- ── Seed: dívidas ─────────────────────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('dividas.titulo',          'dividas', 'sistema', 'usuario',     'Título da página de dívidas',   'Dívidas'),
  ('dividas.btn_nova',        'dividas', 'ui',      'usuario',     'Botão de nova dívida',          'Nova dívida'),
  ('dividas.toast.criada',    'dividas', 'toast',   'notificacao', 'Toast ao criar dívida',         'Dívida criada.'),
  ('dividas.toast.atualizada','dividas', 'toast',   'notificacao', 'Toast ao atualizar dívida',     'Dívida atualizada.'),
  ('dividas.toast.excluida',  'dividas', 'toast',   'notificacao', 'Toast ao excluir dívida',       'Dívida excluída.')
on conflict (chave) do nothing;

-- ── Seed: investimentos ───────────────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('investimentos.titulo',      'investimentos', 'sistema', 'usuario',     'Título da página de investimentos',   'Investimentos'),
  ('investimentos.btn_novo',    'investimentos', 'ui',      'usuario',     'Botão de novo projeto',               'Novo projeto'),
  ('investimentos.toast.criado','investimentos', 'toast',   'notificacao', 'Toast ao criar projeto',              'Projeto criado.'),
  ('investimentos.toast.atualizado','investimentos','toast','notificacao', 'Toast ao atualizar projeto',          'Projeto atualizado.')
on conflict (chave) do nothing;

-- ── Seed: perfil ──────────────────────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('perfil.titulo',               'perfil', 'sistema', 'usuario',     'Título da página de perfil',             'Meu perfil'),
  ('perfil.toast.salvo',          'perfil', 'toast',   'notificacao', 'Toast ao salvar alterações do perfil',   'Perfil atualizado.'),
  ('perfil.toast.foto_atualizada','perfil', 'toast',   'notificacao', 'Toast ao fazer upload da foto',          'Foto atualizada.'),
  ('perfil.toast.foto_removida',  'perfil', 'toast',   'notificacao', 'Toast ao remover a foto do perfil',      'Foto removida.')
on conflict (chave) do nothing;

-- ── Seed: configurações ───────────────────────────────────────
insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values
  ('configuracoes.titulo', 'configuracoes', 'sistema', 'usuario', 'Título da página de configurações', 'Configurações')
on conflict (chave) do nothing;
