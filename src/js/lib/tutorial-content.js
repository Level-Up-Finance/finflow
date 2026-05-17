// =============================================================
// FinFlow — Tutorial Content (PT-BR)
// Usado pela Academia e pelo popup de onboarding de cada tela.
// =============================================================
import { t } from './textos.js';

export const TUTORIALS = {

  // ─────────────────────────────────────────────────────────────
  dashboard: {
    id: 'dashboard',
    title: t('tutorial.dashboard.title', 'Dashboard'),
    category: 'visao-geral',
    categoryLabel: t('tutorial.dashboard.category_label', 'Visão Geral'),
    tagline: t('tutorial.dashboard.tagline', 'Sua central de controle financeiro em tempo real.'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
    color: '#6D5EF5',
    sections: [
      {
        title: t('tutorial.dashboard.section.0.title', 'O que é o Dashboard?'),
        body: t('tutorial.dashboard.section.0.body', `O Dashboard é a primeira tela que você vê ao entrar no FinFlow. Ele reúne os dados mais importantes das suas finanças em um só lugar, sem precisar navegar por outras telas.

Pense nele como o painel de instrumentos do seu carro — você não precisa abrir o capô para saber a velocidade e o nível de combustível.`),
      },
      {
        title: t('tutorial.dashboard.section.1.title', 'KPIs do mês'),
        body: t('tutorial.dashboard.section.1.body', `Na parte superior, você encontra os indicadores-chave do mês atual:

• <strong>Saldo realizado</strong> — Receitas menos despesas pagas neste mês.
• <strong>Oportunidade de investimento</strong> — O que sobra depois de pagar tudo.
• <strong>% despesas pagas</strong> — Quanto dos compromissos de despesa já foi executado.
• <strong>Compromissos ativos</strong> — Total de receitas e despesas recorrentes configuradas.

Se houver pagamentos atrasados, um alerta vermelho aparece logo abaixo dos KPIs.`),
      },
      {
        title: t('tutorial.dashboard.section.2.title', 'Widgets disponíveis'),
        body: t('tutorial.dashboard.section.2.body', `O Dashboard é montado com widgets que você pode reorganizar e ocultar. Os widgets disponíveis são:

• <strong>Distribuição por bloco</strong> — Gráfico de pizza mostrando Contribuição, Sonhos e Custo de Vida.
• <strong>Próximos 7 dias</strong> — Pagamentos com vencimento nos próximos 7 dias.
• <strong>Top despesas por categoria</strong> — As categorias que mais consumiram seu orçamento.
• <strong>Transações recentes</strong> — Últimas movimentações registradas.
• <strong>Indicadores BCB</strong> — Selic, IPCA e poupança, atualizados via Banco Central.
• <strong>Cotações</strong> — Câmbio USD, EUR, GBP e outras moedas em tempo real.
• <strong>Atalhos rápidos</strong> — Botões de acesso direto às telas mais usadas.`),
      },
      {
        title: t('tutorial.dashboard.section.3.title', 'Como personalizar o Dashboard'),
        body: t('tutorial.dashboard.section.3.body', `Clique no botão <strong>"Personalizar"</strong> no canto superior direito para entrar no modo de edição.

No modo de edição você pode:
• <strong>Reordenar</strong> — Arraste um widget pelo ícone de alça (⠿) para mudar sua posição.
• <strong>Redimensionar</strong> — Use as pílulas "½" e "■" para definir se o widget ocupa metade ou toda a largura.
• <strong>Ocultar</strong> — Clique no "X" para remover um widget da tela. Ele fica disponível na barra de edição para ser adicionado de volta.

Suas preferências são salvas automaticamente.`),
      },
      {
        title: t('tutorial.dashboard.section.4.title', 'Como o Dashboard se conecta com outras telas'),
        body: t('tutorial.dashboard.section.4.body', `O Dashboard é somente leitura — ele consome dados, mas não cria nada. Suas conexões:

• Os <strong>KPIs</strong> vêm dos Pagamentos (valores pagos no mês) e dos Compromissos (valores planejados).
• O widget de <strong>Próximos 7 dias</strong> linka diretamente para a tela de Pagamentos.
• As <strong>Transações recentes</strong> refletem o que foi registrado em Transações.
• Os atalhos rápidos levam para Pagamentos, Orçamento, Compromissos e Relatórios.`),
      },
    ],
    tips: [
      t('tutorial.dashboard.tip.0', 'Deixe os widgets que você mais usa no topo — os indicadores BCB e câmbio são ótimos para quem tem investimentos no exterior.'),
      t('tutorial.dashboard.tip.1', 'O saldo realizado só inclui o que foi <strong>pago/recebido</strong>. Para ver o planejado, acesse Pagamentos.'),
      t('tutorial.dashboard.tip.2', 'Use os atalhos rápidos como ponto de partida do seu dia financeiro.'),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  contas: {
    id: 'contas',
    title: t('tutorial.contas.title', 'Contas'),
    category: 'cadastros',
    categoryLabel: t('tutorial.contas.category_label', 'Cadastros'),
    tagline: t('tutorial.contas.tagline', 'Bancos, cartões e carteiras — a base de tudo no FinFlow.'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`,
    color: '#3B82F6',
    sections: [
      {
        title: t('tutorial.contas.section.0.title', 'Por que começar pelas Contas?'),
        body: t('tutorial.contas.section.0.body', `Contas é o cadastro fundamental do FinFlow. Antes de lançar qualquer compromisso, pagamento ou transação, você precisa cadastrar os bancos, cartões e carteiras que usa.

Tudo no sistema é vinculado a uma conta: de onde o dinheiro sai, para onde vai, qual cartão foi usado.`),
      },
      {
        title: t('tutorial.contas.section.1.title', 'Criando uma conta'),
        body: t('tutorial.contas.section.1.body', `Clique em <strong>"+ Nova conta"</strong> para abrir o formulário. Preencha:

• <strong>Banco / Cartão (oficial)</strong> — Comece a digitar e o sistema sugere bancos da lista oficial do Banco Central. Se o seu banco não aparecer, pode digitar livremente.
• <strong>Apelido</strong> — Nome personalizado que aparece nas listagens. Ex: "Itaú Principal", "Nubank Pessoal".
• <strong>Tipo</strong> — Corrente, Poupança, Caixinha, Investimento ou Cartão de Crédito.
• <strong>Cor do avatar</strong> — Auto-preenchida com a cor oficial do banco. Você pode trocar.
• <strong>Moeda</strong> — BRL por padrão. Contas em moeda estrangeira são suportadas.
• <strong>Desde</strong> — Data de abertura da conta (obrigatório).`),
      },
      {
        title: t('tutorial.contas.section.2.title', 'Configurações exclusivas de Cartão de Crédito'),
        body: t('tutorial.contas.section.2.body', `Ao selecionar o tipo <strong>Cartão de Crédito</strong>, dois campos extras aparecem:

• <strong>Fechamento</strong> — Dia do mês em que a fatura fecha (ex: dia 10).
• <strong>Vencimento</strong> — Dia do mês em que a fatura vence (ex: dia 20).
• <strong>Limite total</strong> — Limite de crédito disponível. Quando preenchido, o sistema mostra quanto do limite está comprometido com compromissos recorrentes.

Esses dados alimentam a seção de Faturas e os indicadores de comprometimento.`),
      },
      {
        title: t('tutorial.contas.section.3.title', 'Visualizações: cards e tabela'),
        body: t('tutorial.contas.section.3.body', `Use os botões de toggle no canto superior para alternar entre:

• <strong>Cards</strong> — Visão visual com avatar do banco, status, datas e badge de fatura aberta ou limite comprometido.
• <strong>Tabela</strong> — Visão compacta com colunas configuráveis. Use o seletor de colunas para mostrar/ocultar campos como Descrição, Fechamento de fatura etc.

Os <strong>filtros de status</strong> (Todas / Ativas / Inativas / Arquivadas) e os <strong>filtros de tipo</strong> ficam acima das listas.`),
      },
      {
        title: t('tutorial.contas.section.4.title', 'Detalhes e ações em uma conta'),
        body: t('tutorial.contas.section.4.body', `Clique em qualquer conta para abrir o modal de detalhes. Lá você encontra:

• Todas as informações cadastradas.
• Para cartões de crédito: barra de comprometimento do limite (quanto está comprometido com compromissos ativos) e histórico de faturas.
• Botões de ação: <strong>Editar</strong>, <strong>Arquivar</strong> (antes de deletar) e <strong>Deletar permanentemente</strong>.

Uma conta arquivada não aparece nos seletores das outras telas, mas o histórico é preservado.`),
      },
      {
        title: t('tutorial.contas.section.5.title', 'Como Contas se conecta com outras telas'),
        body: t('tutorial.contas.section.5.body', `Contas é referenciada em praticamente todas as outras telas:

• <strong>Compromissos</strong> — Ao criar um compromisso, você vincula a conta de origem (ou origem/destino em transferências).
• <strong>Transações</strong> — Toda transação pertence a uma conta.
• <strong>Pagamentos</strong> — Exibe o banco/cartão do compromisso associado.
• <strong>Dívidas</strong> e <strong>Investimentos</strong> — Podem ser vinculados a uma conta opcionalmente.
• <strong>Importar extrato</strong> — Você seleciona a conta destino dos lançamentos.`),
      },
    ],
    tips: [
      t('tutorial.contas.tip.0', 'Cadastre <strong>todas</strong> as suas contas antes de começar a usar o sistema — isso evita retrabalho.'),
      t('tutorial.contas.tip.1', 'Use apelidos descritivos: "Bradesco Salário", "C6 Viagens", "Caixa Fundo Emergência".'),
      t('tutorial.contas.tip.2', 'Ao encerrar uma conta bancária, use <strong>Arquivar</strong> em vez de deletar — isso preserva o histórico.'),
      t('tutorial.contas.tip.3', 'O badge de comprometimento no card aparece automaticamente quando você cadastra o limite e tem compromissos ativos no cartão.'),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  compromissos: {
    id: 'compromissos',
    title: t('tutorial.compromissos.title', 'Compromissos'),
    category: 'cadastros',
    categoryLabel: t('tutorial.compromissos.category_label', 'Cadastros'),
    tagline: t('tutorial.compromissos.tagline', 'O coração do planejamento: suas receitas e despesas recorrentes.'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>`,
    color: '#10B981',
    sections: [
      {
        title: t('tutorial.compromissos.section.0.title', 'O que são Compromissos?'),
        body: t('tutorial.compromissos.section.0.body', `Compromissos são a espinha dorsal do FinFlow. Eles representam tudo que entra ou sai do seu bolso de forma recorrente: salário, aluguel, assinaturas, parcelas, transferências automáticas.

Pense nos Compromissos como o seu orçamento mensal escrito. A tela de Pagamentos transforma esse orçamento em tarefas do dia a dia.`),
      },
      {
        title: t('tutorial.compromissos.section.1.title', 'Tipos de compromisso'),
        body: t('tutorial.compromissos.section.1.body', `Existem três tipos:

• <strong>Receita</strong> — Dinheiro que entra. Ex: salário, aluguel recebido, dividendos.
• <strong>Despesa</strong> — Dinheiro que sai. Ex: aluguel pago, Netflix, plano de saúde.
• <strong>Transferência</strong> — Movimentação entre suas próprias contas. Você define a conta de origem e a conta de destino.`),
      },
      {
        title: t('tutorial.compromissos.section.2.title', 'Criando um compromisso'),
        body: t('tutorial.compromissos.section.2.body', `Clique em <strong>"+ Novo compromisso"</strong>. Os campos principais são:

• <strong>Nome</strong> — Identificação do compromisso.
• <strong>Tipo</strong> — Receita, Despesa ou Transferência.
• <strong>Categoria</strong> — Agrupamento (configure em Configurações → Categorias).
• <strong>Banco / Cartão</strong> — Conta vinculada (opcional para receitas, recomendado para despesas).
• <strong>Forma de pagamento</strong> — PIX, Boleto, Crédito, Débito, etc.
• <strong>Periodicidade</strong> — Mensal, Quinzenal, Semanal, Anual ou Único.
• <strong>Dia de vencimento</strong> — Dia do mês (ou dia da semana para periodicidade semanal).
• <strong>Valor base</strong> — Valor padrão do compromisso.
• <strong>Início / Término</strong> — Período de vigência.`),
      },
      {
        title: t('tutorial.compromissos.section.3.title', 'Valor variável'),
        body: t('tutorial.compromissos.section.3.body', `Se um compromisso não tem valor fixo (ex: conta de luz), marque a opção <strong>"Valor variável"</strong>.

Isso abre uma grade mensal onde você define o valor específico de cada mês. Meses sem valor preenchido herdam o valor base.

Essa configuração é ideal para contas sazonais que variam ao longo do ano.`),
      },
      {
        title: t('tutorial.compromissos.section.4.title', 'Indicador de limite comprometido'),
        body: t('tutorial.compromissos.section.4.body', `Quando você vincula um compromisso a um <strong>Cartão de Crédito</strong> que tem limite cadastrado, o sistema exibe automaticamente:

• O total já comprometido com outros compromissos naquele cartão.
• A porcentagem de uso do limite.
• Uma barra visual (verde / amarelo / vermelho conforme a ocupação).

Isso ajuda a evitar comprometer demais o limite do cartão com despesas fixas.`),
      },
      {
        title: t('tutorial.compromissos.section.5.title', 'Duplicar um compromisso'),
        body: t('tutorial.compromissos.section.5.body', `No modal de detalhes, clique em <strong>"Duplicar"</strong> para criar uma cópia pré-preenchida do compromisso.

O formulário abre como "Duplicar compromisso" — todos os dados estão preenchidos, prontos para ajuste. Salvar cria um novo registro sem alterar o original.

Útil para criar variações de um compromisso existente (ex: versão em outra moeda, outro banco).`),
      },
      {
        title: t('tutorial.compromissos.section.6.title', 'Transferências'),
        body: t('tutorial.compromissos.section.6.body', `Ao selecionar o tipo <strong>Transferência</strong>, dois campos de conta aparecem:

• <strong>De (origem)</strong> — Conta que envia o dinheiro.
• <strong>Para (destino)</strong> — Conta que recebe.

Use para registrar aportes automáticos em poupança, transferência entre bancos, ou qualquer movimentação interna.`),
      },
      {
        title: t('tutorial.compromissos.section.7.title', 'Como Compromissos se conecta com outras telas'),
        body: t('tutorial.compromissos.section.7.body', `Compromissos é o módulo mais central do FinFlow:

• <strong>→ Pagamentos</strong> — Cada compromisso ativo gera automaticamente entradas mensais na tela de Pagamentos.
• <strong>← Contas</strong> — A conta vinculada vem do cadastro de Contas.
• <strong>← Contatos</strong> — O campo Cliente/Fornecedor puxa da lista de Contatos.
• <strong>→ Dívidas</strong> — Compromissos de despesa podem ser vinculados a uma dívida, para rastrear pagamentos mensais.
• <strong>→ Investimentos</strong> — Compromissos de investimento podem ser vinculados a um projeto, para rastrear aportes.
• <strong>← Configurações</strong> — As categorias disponíveis vêm de Configurações → Categorias.`),
      },
    ],
    tips: [
      t('tutorial.compromissos.tip.0', 'Configure seus compromissos com precisão — eles são o planejamento, e Pagamentos é a execução.'),
      t('tutorial.compromissos.tip.1', 'Use a <strong>Periodicidade "Único"</strong> para lançamentos pontuais que ainda não viraram transações.'),
      t('tutorial.compromissos.tip.2', 'Vincule compromissos de dívida a uma <strong>Dívida</strong> para ver o progresso de quitação automaticamente.'),
      t('tutorial.compromissos.tip.3', 'O campo <strong>Apelido</strong> aparece no lugar do nome nas listagens — use para nomes mais curtos e claros.'),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  pagamentos: {
    id: 'pagamentos',
    title: t('tutorial.pagamentos.title', 'Pagamentos'),
    category: 'operacional',
    categoryLabel: t('tutorial.pagamentos.category_label', 'Operacional'),
    tagline: t('tutorial.pagamentos.tagline', 'A execução mensal do seu orçamento — marque, controle, acompanhe.'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
    color: '#F59E0B',
    sections: [
      {
        title: t('tutorial.pagamentos.section.0.title', 'O que é a tela de Pagamentos?'),
        body: t('tutorial.pagamentos.section.0.body', `Pagamentos é onde você opera o dia a dia financeiro. Se Compromissos é o seu orçamento planejado, Pagamentos é a lista de tarefas de cada mês.

O sistema gera automaticamente uma entrada para cada compromisso ativo, organizada por blocos quinzenais.`),
      },
      {
        title: t('tutorial.pagamentos.section.1.title', 'Navegação por mês'),
        body: t('tutorial.pagamentos.section.1.body', `Use as setas <strong>◀ ▶</strong> para navegar entre meses, ou clique em <strong>"Hoje"</strong> para voltar ao mês atual.

O mês exibido no topo é o período de referência de todas as entradas da lista.`),
      },
      {
        title: t('tutorial.pagamentos.section.2.title', 'Blocos quinzenais'),
        body: t('tutorial.pagamentos.section.2.body', `Os pagamentos são organizados em dois blocos:

• <strong>Bloco 1 — Dias 1 a 15</strong> — Pagamentos com vencimento na primeira quinzena.
• <strong>Bloco 2 — Dias 16 ao fim do mês</strong> — Pagamentos com vencimento na segunda quinzena.

Cada bloco exibe um resumo de Receitas, Despesas e Saldo. Use o botão <strong>"Regenerar blocos"</strong> se mudou sua renda principal e precisa recalcular.`),
      },
      {
        title: t('tutorial.pagamentos.section.3.title', 'Status de pagamento'),
        body: t('tutorial.pagamentos.section.3.body', `Cada entrada pode ter um dos seguintes status:

• <strong>Agendado</strong> — Ainda não executado (padrão ao abrir o mês).
• <strong>Pago / Transferido / Cartão</strong> — Executado com sucesso.
• <strong>Parcial</strong> — Parte do valor foi pago — o sistema pergunta se deseja criar um novo compromisso para o restante.
• <strong>Cancelado</strong> — Não será realizado este mês.

Clique no status atual de qualquer entrada para alterá-lo diretamente na lista.`),
      },
      {
        title: t('tutorial.pagamentos.section.4.title', 'Registrar valor real pago'),
        body: t('tutorial.pagamentos.section.4.body', `Quando um pagamento tem valor diferente do planejado, abra os detalhes da entrada e informe o <strong>valor real pago</strong>.

O sistema usa esse valor nos relatórios de Previsto vs. Real, permitindo análises precisas de desvio orçamentário.`),
      },
      {
        title: t('tutorial.pagamentos.section.5.title', 'Pagamento parcial'),
        body: t('tutorial.pagamentos.section.5.body', `Ao marcar um pagamento como <strong>Parcial</strong>:

1. Informe o valor que foi efetivamente pago.
2. O sistema pergunta se deseja criar um novo compromisso para o valor restante.
3. Se confirmar, um novo compromisso é criado automaticamente com todos os dados do original e o valor remanescente.

Ideal para parcelamentos informais ou pagamentos em aberto.`),
      },
      {
        title: t('tutorial.pagamentos.section.6.title', 'Filtros de status'),
        body: t('tutorial.pagamentos.section.6.body', `Use os filtros no topo para ver apenas o que precisa de atenção:

• <strong>Todos</strong> — Lista completa do mês.
• <strong>Pendentes</strong> — O que ainda precisa ser pago.
• <strong>Atrasados</strong> — Vencidos e não pagos.
• <strong>Pagos</strong> — Confirmados como pagos/transferidos/cartão.
• <strong>Cancelados</strong> — Entradas descartadas.`),
      },
      {
        title: t('tutorial.pagamentos.section.7.title', 'Como Pagamentos se conecta com outras telas'),
        body: t('tutorial.pagamentos.section.7.body', `• <strong>← Compromissos</strong> — Os lançamentos são gerados a partir dos compromissos ativos.
• <strong>← Contas</strong> — A conta do compromisso é exibida em cada entrada.
• <strong>→ Investimentos</strong> — Pagamentos marcados como Pago/Cartão alimentam o saldo realizado dos projetos de investimento.
• <strong>← Categorias</strong> — Os blocos são organizados pelas categorias de Configurações.`),
      },
    ],
    tips: [
      t('tutorial.pagamentos.tip.0', 'Crie o hábito de abrir Pagamentos uma vez por semana e marcar o que foi executado.'),
      t('tutorial.pagamentos.tip.1', 'Use o filtro <strong>"Atrasados"</strong> para nunca deixar passar uma conta vencida.'),
      t('tutorial.pagamentos.tip.2', 'O campo <strong>Observação</strong> em cada entrada é útil para anotar número de protocolo, comprovante ou nota.'),
      t('tutorial.pagamentos.tip.3', 'Navegue para meses futuros para ter uma prévia do que está programado.'),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  transacoes: {
    id: 'transacoes',
    title: t('tutorial.transacoes.title', 'Transações'),
    category: 'operacional',
    categoryLabel: t('tutorial.transacoes.category_label', 'Operacional'),
    tagline: t('tutorial.transacoes.tagline', 'Registre movimentações reais e mantenha seu extrato reconciliado.'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
    color: '#6366F1',
    sections: [
      {
        title: t('tutorial.transacoes.section.0.title', 'Transações vs. Pagamentos — qual a diferença?'),
        body: t('tutorial.transacoes.section.0.body', `<strong>Compromissos → Pagamentos</strong> é o fluxo de <em>planejamento</em>: você define o que precisa pagar/receber e marca quando executa.

<strong>Transações</strong> é o registro de <em>fatos reais</em>: entradas e saídas que aconteceram, com data, valor e conta específicos. É o seu extrato bancário dentro do FinFlow.

Para um controle completo, os dois se complementam: Pagamentos mostra o que foi planejado; Transações comprova o que ocorreu.`),
      },
      {
        title: t('tutorial.transacoes.section.1.title', 'KPIs de período'),
        body: t('tutorial.transacoes.section.1.body', `No topo da tela, quatro indicadores mostram o total do período selecionado:

• <strong>Receitas</strong> — Total de entradas registradas.
• <strong>Despesas</strong> — Total de saídas registradas.
• <strong>Saldo</strong> — Diferença entre receitas e despesas.
• <strong>Quantidade</strong> — Número total de transações.

O período é controlado pelos filtros de data (Mês, Ano, Período livre ou Todos).`),
      },
      {
        title: t('tutorial.transacoes.section.2.title', 'Registrando uma transação'),
        body: t('tutorial.transacoes.section.2.body', `Clique em <strong>"+ Nova transação"</strong>. Campos principais:

• <strong>Data</strong> — Data em que ocorreu.
• <strong>Tipo</strong> — Receita ou Despesa.
• <strong>Valor</strong> e <strong>Moeda</strong>.
• <strong>Conta</strong> — Obrigatório — de qual banco/carteira saiu ou entrou.
• <strong>Bloco</strong> — Contribuição, Sonhos ou Custo de Vida.
• <strong>Categoria / Subcategoria</strong> — Para organizar e aparecer nos Relatórios.
• <strong>Cliente / Fornecedor</strong> — Contato vinculado (opcional).
• <strong>Descrição</strong> — Anotação livre.`),
      },
      {
        title: t('tutorial.transacoes.section.3.title', 'Filtros e busca'),
        body: t('tutorial.transacoes.section.3.body', `Acima da lista, vários filtros ajudam a encontrar transações específicas:

• <strong>Período</strong> — Mês, ano, intervalo personalizado ou tudo.
• <strong>Conta</strong> — Filtra por um banco/cartão específico.
• <strong>Tipo</strong> — Receitas, Despesas ou Todos.
• <strong>Busca</strong> — Texto livre na descrição.
• <strong>Pendentes</strong> — Mostra apenas transações não reconciliadas.

As colunas visíveis podem ser ajustadas pelo seletor no canto da tabela.`),
      },
      {
        title: t('tutorial.transacoes.section.4.title', 'Reconciliação'),
        body: t('tutorial.transacoes.section.4.body', `Reconciliar significa confirmar que a transação registrada no FinFlow bate com o extrato real do banco.

Ao editar uma transação, marque a opção <strong>"Reconciliada"</strong> quando confirmar no extrato bancário. Transações reconciliadas ficam visualmente diferentes na lista.

Use o filtro <strong>"Pendentes"</strong> para ver só o que ainda não foi conferido.`),
      },
      {
        title: t('tutorial.transacoes.section.5.title', 'Ações em lote'),
        body: t('tutorial.transacoes.section.5.body', `Marque múltiplas transações usando os checkboxes da primeira coluna. Com itens selecionados, uma barra de ações aparece para <strong>deletar em lote</strong>.

Útil para limpar importações erradas ou apagar transações duplicadas.`),
      },
      {
        title: t('tutorial.transacoes.section.6.title', 'Como Transações se conecta com outras telas'),
        body: t('tutorial.transacoes.section.6.body', `• <strong>← Contas</strong> — Toda transação é vinculada a uma conta.
• <strong>← Compromissos</strong> — O campo Subcategoria puxa os compromissos cadastrados, vinculando a transação real ao planejamento.
• <strong>← Contatos</strong> — O campo Cliente/Fornecedor puxa da lista de Contatos.
• <strong>→ Relatórios</strong> — Transações alimentam o Fluxo de Caixa e o relatório de Categorias.
• <strong>← Importar</strong> — A importação de extrato cria transações em lote nesta tela.`),
      },
    ],
    tips: [
      t('tutorial.transacoes.tip.0', 'Vincule a Subcategoria sempre que possível — isso enriquece os relatórios de Previsto vs. Real.'),
      t('tutorial.transacoes.tip.1', 'Para quem usa importação de extrato, o trabalho em Transações é principalmente revisar e categorizar os lançamentos importados.'),
      t('tutorial.transacoes.tip.2', 'Reconcilie semanalmente para manter o controle em dia.'),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  contatos: {
    id: 'contatos',
    title: t('tutorial.contatos.title', 'Contatos'),
    category: 'cadastros',
    categoryLabel: t('tutorial.contatos.category_label', 'Cadastros'),
    tagline: t('tutorial.contatos.tagline', 'Clientes, fornecedores e o motor de reconhecimento automático de extrato.'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    color: '#EC4899',
    sections: [
      {
        title: t('tutorial.contatos.section.0.title', 'O que são Contatos?'),
        body: t('tutorial.contatos.section.0.body', `Contatos é o cadastro de pessoas e empresas com quem você tem relacionamento financeiro: patrões, locadores, lojas, assinaturas, fornecedores de serviços.

Além de organizar quem é quem, os contatos têm um superpoder: o <strong>reconhecimento automático de extrato</strong>.`),
      },
      {
        title: t('tutorial.contatos.section.1.title', 'Layout em dois painéis'),
        body: t('tutorial.contatos.section.1.body', `A tela usa um layout dividido:

• <strong>Painel esquerdo</strong> — Lista de contatos com busca e filtros (Todos / Clientes / Fornecedores).
• <strong>Painel direito</strong> — Detalhes do contato selecionado, com três abas: Dados, Reconhecimento, Transações.

Clique em qualquer contato na lista para ver seus detalhes no painel direito.`),
      },
      {
        title: t('tutorial.contatos.section.2.title', 'Criando um contato'),
        body: t('tutorial.contatos.section.2.body', `Clique em <strong>"+ Novo contato"</strong>. Campos:

• <strong>Nome</strong> — Obrigatório. Ex: "Spotify", "João Silva Locações".
• <strong>Tipo</strong> — Cliente, Fornecedor ou Ambos.
• <strong>Nome no extrato</strong> — Texto exato como aparece no extrato bancário. Ex: "SPOTIFY AB RECORRENTE". Usado pelo reconhecimento automático.
• <strong>E-mail, Telefone, Documento</strong> — Dados de contato opcionais.
• <strong>Observação</strong> — Anotação livre.`),
      },
      {
        title: t('tutorial.contatos.section.3.title', 'Reconhecimento automático de extrato'),
        body: t('tutorial.contatos.section.3.body', `A aba <strong>"Reconhecimento"</strong> mostra os padrões de texto do extrato aprendidos para este contato.

Quando você importa um extrato, o sistema compara a descrição de cada lançamento com os padrões conhecidos. Se houver correspondência, o contato e a subcategoria são preenchidos automaticamente, economizando tempo na categorização.

O campo <strong>"Nome no extrato"</strong> é o principal gatilho: coloque o trecho de texto que aparece no seu extrato bancário para aquele fornecedor.`),
      },
      {
        title: t('tutorial.contatos.section.4.title', 'Histórico de transações'),
        body: t('tutorial.contatos.section.4.body', `A aba <strong>"Transações"</strong> mostra todas as movimentações registradas vinculadas a este contato.

Útil para ver o histórico completo de pagamentos para um fornecedor ou recebimentos de um cliente.`),
      },
      {
        title: t('tutorial.contatos.section.5.title', 'Proteção contra exclusão'),
        body: t('tutorial.contatos.section.5.body', `Um contato <strong>não pode ser excluído</strong> se estiver vinculado a compromissos ou transações.

O sistema exibe uma mensagem informando quantos registros estão vinculados. Para remover o contato, primeiro desvincule-o de todos os registros, ou use <strong>Arquivar</strong> para desativá-lo sem perder o histórico.`),
      },
      {
        title: t('tutorial.contatos.section.6.title', 'Como Contatos se conecta com outras telas'),
        body: t('tutorial.contatos.section.6.body', `• <strong>← Compromissos</strong> — Campo "Cliente / Fornecedor" no formulário de compromisso.
• <strong>← Transações</strong> — Campo "Cliente / Fornecedor" no formulário de transação.
• <strong>← Dívidas</strong> — Campo de credor na dívida.
• <strong>← Investimentos</strong> — Campo de contato no projeto.
• <strong>← Importar</strong> — O reconhecimento automático sugere o contato ao importar o extrato.`),
      },
    ],
    tips: [
      t('tutorial.contatos.tip.0', 'Preencha o <strong>Nome no extrato</strong> com o texto exato do seu banco — copie e cole do extrato para evitar erros.'),
      t('tutorial.contatos.tip.1', 'Cadastre fornecedores recorrentes antes de importar extratos para aproveitar o reconhecimento automático.'),
      t('tutorial.contatos.tip.2', 'Use o tipo <strong>"Ambos"</strong> para contatos que às vezes pagam e às vezes recebem.'),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  dividas: {
    id: 'dividas',
    title: t('tutorial.dividas.title', 'Dívidas'),
    category: 'cadastros',
    categoryLabel: t('tutorial.dividas.category_label', 'Cadastros'),
    tagline: t('tutorial.dividas.tagline', 'Acompanhe o progresso de cada dívida em direção à quitação.'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    color: '#EF4444',
    sections: [
      {
        title: t('tutorial.dividas.section.0.title', 'O que é a tela de Dívidas?'),
        body: t('tutorial.dividas.section.0.body', `Dívidas centraliza o controle de empréstimos, financiamentos e qualquer obrigação financeira de médio ou longo prazo.

Você registra o total da dívida, os pagamentos mensais e acompanha visualmente o progresso até a quitação.`),
      },
      {
        title: t('tutorial.dividas.section.1.title', 'KPIs de dívidas'),
        body: t('tutorial.dividas.section.1.body', `No topo da tela, dois indicadores resumem sua situação:

• <strong>Total em aberto</strong> — Soma do saldo devedor de todas as dívidas ativas.
• <strong>Total pago</strong> — Soma de todos os pagamentos registrados.`),
      },
      {
        title: t('tutorial.dividas.section.2.title', 'Criando uma dívida'),
        body: t('tutorial.dividas.section.2.body', `Clique em <strong>"+ Nova dívida"</strong>:

• <strong>Nome</strong> — Ex: "Financiamento carro", "Empréstimo pessoal Banco X".
• <strong>Credor</strong> — Quem você deve.
• <strong>Valor total</strong> — Montante total da dívida.
• <strong>Juros ao mês (%)</strong> — Taxa de juros (opcional, informativo).
• <strong>Data de início e vencimento</strong>.
• <strong>Status</strong> — Ativa, Negociando, Atrasada ou Quitada.
• <strong>Conta vinculada</strong> — Conta bancária usada para os pagamentos.
• <strong>Contato</strong> — Credor cadastrado em Contatos.`),
      },
      {
        title: t('tutorial.dividas.section.3.title', 'Registrando um pagamento'),
        body: t('tutorial.dividas.section.3.body', `Nos detalhes de uma dívida, use o botão <strong>"Registrar pagamento"</strong> para adicionar um abatimento.

O sistema mostra o valor total, o já pago e o saldo restante. Cada registro atualiza a barra de progresso.`),
      },
      {
        title: t('tutorial.dividas.section.4.title', 'Visualizações disponíveis'),
        body: t('tutorial.dividas.section.4.body', `• <strong>Cards</strong> — Cada dívida como um card com barra de progresso visual.
• <strong>Tabela</strong> — Visão compacta com todas as dívidas em lista.
• <strong>Gantt</strong> — Linha do tempo mostrando o período de cada dívida, útil para visualizar sobreposições.

As dívidas são agrupadas em: <strong>Em progresso</strong>, <strong>Por começar</strong> e <strong>Terminado</strong>.`),
      },
      {
        title: t('tutorial.dividas.section.5.title', 'Como Dívidas se conecta com outras telas'),
        body: t('tutorial.dividas.section.5.body', `• <strong>← Compromissos</strong> — Ao criar um compromisso de despesa para pagar uma dívida mensalmente, você pode vincular o campo "Dívida vinculada". Isso registra automaticamente os pagamentos mensais no progresso da dívida.
• <strong>← Contas</strong> — A conta vinculada vem do cadastro de Contas.
• <strong>← Contatos</strong> — O campo credor puxa de Contatos.
• <strong>→ Configurações</strong> — Dívidas aparecem como vínculo em Configurações → Categorias.`),
      },
    ],
    tips: [
      t('tutorial.dividas.tip.0', 'Crie um <strong>Compromisso de despesa</strong> para cada parcela mensal e vincule-o à dívida correspondente — o progresso será atualizado automaticamente.'),
      t('tutorial.dividas.tip.1', 'Use o status <strong>"Negociando"</strong> para dívidas em processo de renegociação.'),
      t('tutorial.dividas.tip.2', 'A visualização <strong>Gantt</strong> ajuda a planejar quitações quando você tem múltiplas dívidas simultâneas.'),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  investimentos: {
    id: 'investimentos',
    title: t('tutorial.investimentos.title', 'Investimentos'),
    category: 'cadastros',
    categoryLabel: t('tutorial.investimentos.category_label', 'Cadastros'),
    tagline: t('tutorial.investimentos.tagline', 'Defina seus projetos e acompanhe o progresso rumo às suas metas.'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    color: '#14B8A6',
    sections: [
      {
        title: t('tutorial.investimentos.section.0.title', 'O que são Projetos de Investimento?'),
        body: t('tutorial.investimentos.section.0.body', `Investimentos no FinFlow são metas financeiras — projetos concretos que você quer realizar: viagem, aposentadoria, reserva de emergência, compra de imóvel, fundo de estudo.

Você define um valor alvo e uma data, e o sistema acompanha automaticamente quanto já foi aportado.`),
      },
      {
        title: t('tutorial.investimentos.section.1.title', 'KPIs de investimentos'),
        body: t('tutorial.investimentos.section.1.body', `No topo da tela:

• <strong>Total investido</strong> — Soma de todos os aportes confirmados (saldo inicial + pagamentos executados).
• <strong>Projetos com meta</strong> — Quantidade de projetos que têm um valor-alvo definido.`),
      },
      {
        title: t('tutorial.investimentos.section.2.title', 'Criando um projeto'),
        body: t('tutorial.investimentos.section.2.body', `Clique em <strong>"+ Novo projeto"</strong>:

• <strong>Nome</strong> — Ex: "Fundo de Emergência", "Viagem Europa 2026", "Aposentadoria".
• <strong>Descrição</strong> — Detalhes opcionais do projeto.
• <strong>Cor</strong> — Para identificação visual.
• <strong>Status</strong> — Ativo, Concluído, Pausado ou Arquivado.
• <strong>Meta de valor</strong> — Quanto você quer acumular.
• <strong>Data alvo</strong> — Quando quer atingir a meta.
• <strong>Saldo inicial</strong> — Se você já tem algo investido antes de começar a usar o FinFlow.`),
      },
      {
        title: t('tutorial.investimentos.section.3.title', 'Como o progresso é calculado'),
        body: t('tutorial.investimentos.section.3.body', `O progresso de um projeto é calculado automaticamente:

<strong>Realizado = Saldo inicial + Σ(valor real dos pagamentos pagos/cartão vinculados ao projeto)</strong>

Para que os pagamentos sejam contabilizados, você precisa:
1. Criar um <strong>Compromisso</strong> de investimento e vincular o <strong>Projeto</strong>.
2. Marcar o pagamento mensal como <strong>Pago</strong> na tela de Pagamentos.

Assim, cada aporte confirmado avança automaticamente a barra de progresso.`),
      },
      {
        title: t('tutorial.investimentos.section.4.title', 'Visualizações disponíveis'),
        body: t('tutorial.investimentos.section.4.body', `• <strong>Cards</strong> — Cada projeto com barra de progresso, percentual alcançado e valor realizado vs. meta.
• <strong>Tabela</strong> — Visão compacta em lista.
• <strong>Timeline</strong> — Linha do tempo mostrando os projetos com datas de início e alvo.

Agrupamento: <strong>Em progresso</strong>, <strong>Por começar</strong>, <strong>Terminado</strong>.`),
      },
      {
        title: t('tutorial.investimentos.section.5.title', 'Como Investimentos se conecta com outras telas'),
        body: t('tutorial.investimentos.section.5.body', `• <strong>← Compromissos</strong> — O campo "Projeto de investimento" em um compromisso vincula os aportes mensais ao projeto.
• <strong>← Pagamentos</strong> — Pagamentos executados alimentam o saldo realizado.
• <strong>← Contatos</strong> — Campo opcional de contato (ex: gestor, corretora).
• <strong>→ Configurações</strong> — Projetos aparecem como vínculo em Configurações → Categorias.`),
      },
    ],
    tips: [
      t('tutorial.investimentos.tip.0', 'Crie um compromisso de aporte mensal para cada projeto e vincule-o ao projeto — o progresso atualiza sozinho ao marcar como pago.'),
      t('tutorial.investimentos.tip.1', 'Use o <strong>Saldo inicial</strong> para registrar o que você já tem investido antes de começar no FinFlow.'),
      t('tutorial.investimentos.tip.2', 'Projetos <strong>Concluídos</strong> ainda aparecem no histórico — você pode ver quanto levou para atingir a meta.'),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  relatorios: {
    id: 'relatorios',
    title: t('tutorial.relatorios.title', 'Relatórios'),
    category: 'analise',
    categoryLabel: t('tutorial.relatorios.category_label', 'Análise'),
    tagline: t('tutorial.relatorios.tagline', 'Analise seu histórico financeiro com gráficos e exportações.'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`,
    color: '#F97316',
    sections: [
      {
        title: t('tutorial.relatorios.section.0.title', 'O que você encontra em Relatórios?'),
        body: t('tutorial.relatorios.section.0.body', `Relatórios é o módulo de análise do FinFlow. Ele consolida dados de Transações e Pagamentos em gráficos e tabelas, com opção de exportação.

Três relatórios estão disponíveis, cada um respondendo a uma pergunta diferente sobre suas finanças.`),
      },
      {
        title: t('tutorial.relatorios.section.1.title', 'Filtro de período'),
        body: t('tutorial.relatorios.section.1.body', `No topo, selecione o período de análise:

• <strong>Mês</strong> — Selecione mês e ano específicos.
• <strong>Ano</strong> — Visão do ano completo.
• <strong>Período</strong> — Intervalo personalizado com data de início e fim.
• <strong>Todos</strong> — Todos os dados registrados.

O filtro se aplica a todos os três relatórios simultaneamente.`),
      },
      {
        title: t('tutorial.relatorios.section.2.title', 'Relatório 1: Fluxo de Caixa'),
        body: t('tutorial.relatorios.section.2.body', `Responde à pergunta: <em>"Quanto entrou e quanto saiu ao longo do tempo?"</em>

• <strong>KPIs</strong> — Total de receitas, total de despesas e saldo do período.
• <strong>Gráfico de linhas</strong> — Evolução de receitas e despesas ao longo do tempo.
• <strong>Tabela</strong> — Por período: Receitas, Despesas, Saldo do período e Saldo acumulado.

Útil para ver tendências de meses ou anos anteriores.`),
      },
      {
        title: t('tutorial.relatorios.section.3.title', 'Relatório 2: Previsto vs. Real'),
        body: t('tutorial.relatorios.section.3.body', `Responde à pergunta: <em>"O que eu planejei gastar vs. o que realmente gastei?"</em>

• <strong>KPIs</strong> — Total previsto, total realizado e desvio (diferença).
• <strong>Gráfico de barras</strong> — Previsto vs. realizado por categoria.
• <strong>Tabela</strong> — Por categoria: Previsto, Realizado, Desvio e % de execução.

O "previsto" vem dos Compromissos; o "realizado" vem dos Pagamentos marcados como pagos.`),
      },
      {
        title: t('tutorial.relatorios.section.4.title', 'Relatório 3: Categorias'),
        body: t('tutorial.relatorios.section.4.body', `Responde à pergunta: <em>"Onde estou gastando mais?"</em>

• <strong>KPIs</strong> — Total gasto e distribuição percentual.
• <strong>Gráfico de rosca</strong> — Distribuição por categoria.
• <strong>Barras horizontais</strong> — Top 10 subcategorias.
• <strong>Tabela</strong> — Por categoria/subcategoria: Total, % do total e quantidade de transações.

Essencial para identificar onde está indo o seu dinheiro.`),
      },
      {
        title: t('tutorial.relatorios.section.5.title', 'Exportação'),
        body: t('tutorial.relatorios.section.5.body', `Cada relatório pode ser exportado em três formatos:

• <strong>CSV</strong> — Dados brutos para Excel ou Google Sheets.
• <strong>Excel (.xlsx)</strong> — Planilha formatada pronta para uso.
• <strong>PDF</strong> — Versão impressa do relatório.

Os botões de exportação ficam no canto superior direito de cada relatório.`),
      },
      {
        title: t('tutorial.relatorios.section.6.title', 'Como Relatórios se conecta com outras telas'),
        body: t('tutorial.relatorios.section.6.body', `Relatórios é uma tela de leitura pura — ela não cria nem edita dados. Consome:

• <strong>Transações</strong> — Para Fluxo de Caixa e Categorias.
• <strong>Pagamentos</strong> — Para Previsto vs. Real (valores pagos).
• <strong>Compromissos / Categorias</strong> — Para o previsto e o agrupamento por categoria.

Para que os relatórios sejam precisos, mantenha Transações e Pagamentos atualizados.`),
      },
    ],
    tips: [
      t('tutorial.relatorios.tip.0', 'Use <strong>Previsto vs. Real</strong> mensalmente para ver se seu orçamento está sendo respeitado.'),
      t('tutorial.relatorios.tip.1', 'O relatório <strong>Categorias</strong> com período "Ano" revela padrões anuais de gastos que não aparecem na visão mensal.'),
      t('tutorial.relatorios.tip.2', 'Exporte para <strong>Excel</strong> para fazer análises personalizadas fora do FinFlow.'),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  configuracoes: {
    id: 'configuracoes',
    title: t('tutorial.configuracoes.title', 'Configurações'),
    category: 'configuracao',
    categoryLabel: t('tutorial.configuracoes.category_label', 'Configuração'),
    tagline: t('tutorial.configuracoes.tagline', 'Categorias, aparência, moedas — personalize o FinFlow para você.'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    color: '#6B7280',
    sections: [
      {
        title: t('tutorial.configuracoes.section.0.title', 'Por que acessar Configurações primeiro?'),
        body: t('tutorial.configuracoes.section.0.body', `Antes de lançar compromissos e transações, configure suas <strong>categorias</strong>. As categorias são a estrutura de classificação do FinFlow — sem elas, os relatórios de Previsto vs. Real e de Categorias ficam genéricos.

O sistema cria algumas categorias padrão (Receitas, Dívidas, Investimentos), mas você pode personalizar à vontade.`),
      },
      {
        title: t('tutorial.configuracoes.section.1.title', 'Aba Categorias'),
        body: t('tutorial.configuracoes.section.1.body', `Aqui você gerencia a hierarquia de categorias:

• <strong>Categoria pai</strong> — Agrupamento maior. Ex: "Moradia", "Transporte", "Saúde".
• <strong>Subcategorias</strong> — Especificações dentro da categoria. Ex: dentro de "Moradia": "Aluguel", "Condomínio", "IPTU".

Para criar: clique em <strong>"+ Nova categoria"</strong> ou no botão de adicionar subcategoria dentro de uma categoria existente.

Cada categoria tem um <strong>bloco</strong> (Contribuição, Sonhos, Custo de Vida) e uma cor para identificação visual nos gráficos.`),
      },
      {
        title: t('tutorial.configuracoes.section.2.title', 'Vínculos de categorias'),
        body: t('tutorial.configuracoes.section.2.body', `A coluna <strong>"Vínculo"</strong> na tabela de categorias mostra se uma subcategoria está ligada a um projeto de Investimento ou a uma Dívida.

Esses vínculos são criados automaticamente quando você relaciona um compromisso a um projeto ou dívida. Clique no badge de vínculo para ir direto ao projeto ou dívida correspondente.`),
      },
      {
        title: t('tutorial.configuracoes.section.3.title', 'Aba Contatos'),
        body: t('tutorial.configuracoes.section.3.body', `A aba Contatos em Configurações oferece o mesmo gerenciamento que a tela dedicada de Contatos — você pode criar, editar e gerenciar contatos sem sair das Configurações.`),
      },
      {
        title: t('tutorial.configuracoes.section.4.title', 'Aba Aparência'),
        body: t('tutorial.configuracoes.section.4.body', `Escolha o tema visual do FinFlow:

• <strong>Claro</strong> — Interface em tons claros.
• <strong>Escuro</strong> — Interface em tons escuros, ideal para uso noturno.
• <strong>Automático</strong> — Segue a preferência de tema do seu sistema operacional.

Também é possível configurar o <strong>idioma</strong> da interface (Automático, Português, English, Español).`),
      },
      {
        title: t('tutorial.configuracoes.section.5.title', 'Aba Moedas'),
        body: t('tutorial.configuracoes.section.5.body', `Configure as moedas que você usa:

• <strong>Moeda principal</strong> — Padrão ao criar novas contas e transações (geralmente BRL).
• <strong>Moedas utilizadas</strong> — Ative as moedas que você usa (USD, EUR, GBP, etc.).

Apenas as moedas ativadas aparecem nos seletores de moeda pelo sistema.`),
      },
      {
        title: t('tutorial.configuracoes.section.6.title', 'Como Configurações se conecta com outras telas'),
        body: t('tutorial.configuracoes.section.6.body', `Configurações alimenta todo o restante do sistema:

• <strong>→ Compromissos</strong> — As categorias disponíveis nos compromissos vêm daqui.
• <strong>→ Transações</strong> — O bloco e as categorias nas transações vêm daqui.
• <strong>→ Relatórios</strong> — Os agrupamentos e cores dos gráficos vêm das categorias.
• <strong>→ Moedas</strong> — As moedas disponíveis em todo o sistema são controladas aqui.
• <strong>→ Aparência</strong> — Tema e idioma aplicam-se globalmente.`),
      },
    ],
    tips: [
      t('tutorial.configuracoes.tip.0', 'Configure as categorias <strong>antes</strong> de começar a lançar compromissos — reorganizar depois é trabalhoso.'),
      t('tutorial.configuracoes.tip.1', 'Use cores diferentes para categorias principais — elas aparecem nos gráficos de Relatórios e ficam mais fáceis de identificar.'),
      t('tutorial.configuracoes.tip.2', 'A opção de tema <strong>"Automático"</strong> é a mais conveniente para quem usa o FinFlow em múltiplos dispositivos.'),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  importar: {
    id: 'importar',
    title: t('tutorial.importar.title', 'Importar Extrato'),
    category: 'operacional',
    categoryLabel: t('tutorial.importar.category_label', 'Operacional'),
    tagline: t('tutorial.importar.tagline', 'Importe seu extrato bancário e categorize em segundos.'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
    color: '#8B5CF6',
    sections: [
      {
        title: t('tutorial.importar.section.0.title', 'O que é a importação de extrato?'),
        body: t('tutorial.importar.section.0.body', `Em vez de lançar cada transação manualmente, você exporta o extrato do seu banco (em CSV, TXT, Excel ou OFX) e importa diretamente no FinFlow.

O assistente de importação tem 3 etapas: seleção do arquivo e conta, mapeamento de colunas, e revisão antes de importar.`),
      },
      {
        title: t('tutorial.importar.section.1.title', 'Etapa 1 — Arquivo e conta'),
        body: t('tutorial.importar.section.1.body', `• <strong>Selecione o arquivo</strong> — Arraste para a área indicada ou clique para buscar. Formatos aceitos: CSV, TXT, XLSX, XLS, ODS.
• <strong>Selecione a conta</strong> — Para qual banco/carteira esses lançamentos pertencem.

Após selecionar, o sistema exibe o nome do arquivo e o número de linhas detectadas.`),
      },
      {
        title: t('tutorial.importar.section.2.title', 'Etapa 2 — Mapeamento de colunas'),
        body: t('tutorial.importar.section.2.body', `O sistema exibe uma prévia das primeiras linhas do arquivo. Configure:

• <strong>Pular linhas</strong> — Quantas linhas de cabeçalho do banco devem ser ignoradas.
• <strong>Coluna de data</strong> — Qual coluna contém a data.
• <strong>Coluna de descrição</strong> — Descrição / histórico da transação.
• <strong>Coluna de identificador</strong> — ID único (evita duplicatas).
• <strong>Modo de valor</strong>:
  - <em>Uma coluna</em>: positivo = Receita, negativo = Despesa.
  - <em>Duas colunas</em>: colunas separadas para Débito e Crédito.
• <strong>Formato de data</strong> — DD/MM/AAAA, MM/DD/AAAA ou AAAA-MM-DD (auto-detectado).`),
      },
      {
        title: t('tutorial.importar.section.3.title', 'Etapa 3 — Revisão e importação'),
        body: t('tutorial.importar.section.3.body', `A prévia mostra todas as transações parseadas com colunas:

• <strong>Data, Descrição, Tipo, Valor</strong> — Dados do arquivo.
• <strong>Contato</strong> — Preenchido automaticamente se houver reconhecimento cadastrado.
• <strong>Subcategoria</strong> — Sugerida pelas regras de reconhecimento automático.

Revise, ajuste linhas individuais se necessário, selecione quais importar (ou use "Selecionar tudo") e clique em <strong>"Importar"</strong>.

As transações importadas aparecem imediatamente em Transações com status "importado".`),
      },
      {
        title: t('tutorial.importar.section.4.title', 'Reconhecimento automático na importação'),
        body: t('tutorial.importar.section.4.body', `Se você tem <strong>Contatos</strong> cadastrados com "Nome no extrato" preenchido, o sistema compara cada descrição importada e sugere automaticamente:

• O contato correspondente.
• A subcategoria (compromisso) mais usada com aquele contato.

Quanto mais você usa o sistema e mantém os contatos atualizados, mais preciso fica o reconhecimento.`),
      },
      {
        title: t('tutorial.importar.section.5.title', 'Como Importar se conecta com outras telas'),
        body: t('tutorial.importar.section.5.body', `• <strong>← Contas</strong> — Você seleciona a conta destino dos lançamentos.
• <strong>← Contatos</strong> — O reconhecimento automático usa os padrões de texto dos contatos.
• <strong>← Compromissos</strong> — Subcategorias sugeridas vêm dos compromissos cadastrados.
• <strong>→ Transações</strong> — Lançamentos importados aparecem na tela de Transações.`),
      },
    ],
    tips: [
      t('tutorial.importar.tip.0', 'A maioria dos bancos brasileiros oferece exportação em CSV no aplicativo ou site — procure por "Exportar extrato" ou "Baixar histórico".'),
      t('tutorial.importar.tip.1', 'Importe por períodos curtos (1 mês) para facilitar a revisão antes de importar.'),
      t('tutorial.importar.tip.2', 'Após importar, vá para Transações e categorize os lançamentos sem subcategoria — isso melhora os relatórios.'),
    ],
  },

};

// ─────────────────────────────────────────────────────────────
// Ordered list for Academy display
// ─────────────────────────────────────────────────────────────
export const TUTORIAL_ORDER = [
  'dashboard',
  'contas',
  'compromissos',
  'pagamentos',
  'transacoes',
  'contatos',
  'dividas',
  'investimentos',
  'relatorios',
  'configuracoes',
  'importar',
];

export const CATEGORIES = {
  'visao-geral':  { label: t('tutorial.cat.visao-geral', 'Visão Geral'),  color: '#6D5EF5' },
  'cadastros':  { label: t('tutorial.cat.cadastros', 'Cadastros'),  color: '#3B82F6' },
  'operacional':  { label: t('tutorial.cat.operacional', 'Operacional'),  color: '#F59E0B' },
  'analise':  { label: t('tutorial.cat.analise', 'Análise'),  color: '#F97316' },
  'configuracao':  { label: t('tutorial.cat.configuracao', 'Configuração'),  color: '#6B7280' },
};
