// =============================================================
// FinFlow — Registro de versões
// Adicione entradas novas no INÍCIO do array.
// id deve ser único — é usado para rastrear o que o usuário já leu.
// type: 'new' | 'fix' | 'improvement'
// =============================================================

export const CHANGELOG = [
  {
    id: '2026-05-05-tabela-plana',
    version: '0.1.7',
    date: '05/05/2026',
    title: 'Tabela plana — Categoria, Subcategoria e filtro Sem compromisso',
    items: [
      { type: 'new',         text: 'Tabela de Compromissos agora exibe tudo em lista plana com colunas Categoria e Subcategoria — sem headings de grupo' },
      { type: 'new',         text: 'Filtro "Sem compromisso": mostra categorias e subcategorias criadas em Configurações que ainda não têm valor definido' },
      { type: 'improvement', text: 'Categorias folha (sem subcategorias) aparecem automaticamente na tabela — basta criar a categoria em Configurações' },
    ],
  },
  {
    id: '2026-05-05-cat-modal-toggle',
    version: '0.1.6',
    date: '05/05/2026',
    title: 'Compromisso direto em categoria — via modal',
    items: [
      { type: 'new',         text: 'Toggle "Nova subcategoria / Categoria existente" no modal de Novo Compromisso — selecione uma categoria já existente (ex: Jhow Silva) e defina valor, tipo, dívida e conta direto, sem criar subcategorias' },
      { type: 'improvement', text: 'Categoria com compromisso direto aparece como linha normal na tabela, sem badge especial' },
      { type: 'improvement', text: 'Clicar na linha abre o modal de edição no modo correto para alterar os dados' },
    ],
  },
  {
    id: '2026-05-05-cat-valor-direto',
    version: '0.1.5',
    date: '05/05/2026',
    title: 'Compromissos diretos em categorias',
    items: [
      { type: 'new',         text: 'Categorias agora podem ter um valor de compromisso direto, sem precisar criar subcategorias — ideal para pagamentos únicos como salários e serviços por pessoa' },
    ],
  },
  {
    id: '2026-05-05-btn-salvar',
    version: '0.1.4',
    date: '05/05/2026',
    title: 'Correção — botão Salvar desabilitado após primeiro cadastro',
    items: [
      { type: 'fix', text: 'Botão Salvar ficava desabilitado após o primeiro cadastro bem-sucedido em Contas, Investimentos, Transações e Compromissos — era necessário recarregar a página para cadastrar novamente' },
    ],
  },
  {
    id: '2026-05-05-compromissos-blocos',
    version: '0.1.3',
    date: '05/05/2026',
    title: 'Organização por blocos — Compromissos',
    items: [
      { type: 'improvement', text: 'Compromissos agora exibe os lançamentos organizados nos 3 blocos principais: Contribuição, Sonhos e Custo de vida — igual às demais páginas' },
    ],
  },
  {
    id: '2026-05-04-novidades',
    version: '0.1.2',
    date: '04/05/2026',
    title: 'Página Novidades com badge numérico',
    items: [
      { type: 'new',         text: 'Página dedicada "Novidades" no menu lateral com registro de todas as versões publicadas' },
      { type: 'new',         text: 'Badge numérico vermelho no ícone de Novidades indicando quantas versões não foram lidas' },
      { type: 'improvement', text: 'Badge some automaticamente ao visitar a página de Novidades' },
    ],
  },
  {
    id: '2026-05-04-b2fab70',
    version: '0.1.1',
    date: '04/05/2026',
    title: 'Correção de layout — Investimentos',
    items: [
      { type: 'fix', text: 'Botão Salvar e rodapé do modal de Novo Projeto em Investimentos estavam ocultos em telas com altura reduzida' },
    ],
  },
  {
    id: '2026-05-03-fbcc0c4',
    version: '0.1.0',
    date: '03/05/2026',
    title: 'Auditoria de código — 38 melhorias',
    items: [
      { type: 'new',         text: 'Toggle de mostrar/ocultar senha no formulário de cadastro' },
      { type: 'new',         text: 'Exportação de Excel agora gera arquivo .xlsx real via SheetJS' },
      { type: 'improvement', text: 'Utilitários centralizados — formatação de datas, escape HTML e outros agora consistentes em todo o sistema' },
      { type: 'improvement', text: 'Visibilidade de colunas em Transações migrada para o sistema compartilhado' },
      { type: 'improvement', text: 'Caixas de confirmação substituídas por diálogo visual (em vez de popup nativo do navegador)' },
      { type: 'improvement', text: 'Links de navegação corrigidos para caminhos absolutos' },
      { type: 'improvement', text: 'Acessibilidade aprimorada em Contas (navegação por teclado) e Orçamento (labels para leitores de tela)' },
      { type: 'fix',         text: 'Listeners de eventos duplicados removidos em menu de usuário e visibilidade de colunas' },
      { type: 'fix',         text: 'Tela de login sempre visível mesmo quando ocorre erro de autenticação' },
    ],
  },
];
