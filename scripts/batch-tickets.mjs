// scripts/batch-tickets.mjs
// Insere e/ou atualiza tickets em lote no Supabase.
// Uso: node scripts/batch-tickets.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const envPath = resolve(__dirname, '../.env.local')
  const lines = readFileSync(envPath, 'utf8').split('\n')
  const env = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
  return env
}

const env = loadEnv()
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// ── 1) UPDATES de tickets existentes ───────────────────────────────────────
const updates = [
  {
    codigo: 'sg.app.000039',
    description: `Papéis de acesso multi-usuário dentro de uma única conta de assinante:

• **Admin** — o titular da assinatura. Tem acesso total e gerencia quem pode entrar.
• **Colaborador** — pessoa convidada pelo Admin (ex: esposa(o), filhos, sócios, amigos que tem projetos compartilhados). Acessa só o que o Admin permitir.
• **Usuário (leitura)** — convidado apenas para visualizar (ex: contador, mentor financeiro).

Cada papel exibe tag visual nos cards/listas.

Necessário também:
• Página de Configurações para o Admin escolher exatamente o que cada Colaborador/Usuário pode acessar: projetos compartilhados, contas, categorias específicas, etc.
• Fluxo de convite por email + aceite pelo convidado.
• Cada usuário continua tendo seu próprio login, mas vê os dados compartilhados da conta do Admin.`,
  },
  {
    codigo: 'sg.app.000041',
    description: `Estrutura de versões/acessos da plataforma:

• **Super Admin (interno FinFlow)** — dono da plataforma que gerencia assinantes, gerenciador de sugestões/tickets, dashboards globais, suporte, etc. Versão "master" do sistema.
• **Admin (assinante pagante)** — usuário final que assina o plano e pode convidar outras pessoas (esposa/filhos/sócios) para ajudar a gerenciar a conta. Ver também sg.app.000039.
• **Usuário (convidado)** — pessoa convidada pelo Admin, com permissões delimitadas.

Cada nível tem páginas/funcionalidades diferentes. Necessário:
• Versão master do sistema para a FinFlow administrar tudo (assinaturas, sugestões, planos, comunicação).
• Versão do usuário com planos e pacotes diferentes (gratuito, pro, família, etc).
• Mecanismos para o Super Admin entrar no perfil de um usuário e fazer testes/ajudas (ver impersonate em ticket separado).`,
  },
]

// ── 2) NOVOS tickets ───────────────────────────────────────────────────────
const newTickets = [
  // ── DESIGN ────────────────────────────────────────────────────────────────
  {
    title: 'Animações de UI em transições e estados',
    description: 'Adicionar microanimações nos cards, modais, botões, tabs e transições de estado onde fizer sentido — sem prejudicar performance. Princípio: animação serve pra dar feedback de ação, não pra decoração.',
    type: 'sugestao',
    modulo: 'outros',
    impacto: 'Médio',
    complexidade: 'Média',
  },
  {
    title: 'Verificar/auditar filtros da tela de Compromissos',
    description: 'Verificar comportamento dos filtros na aba Configurações de Orçamento (antiga Compromissos). Garantir consistência entre Exibição/Status/Categoria, contagens corretas, persistência ao trocar de view, combinações que não voltam estado vazio sem mensagem útil.',
    type: 'bug',
    modulo: 'compromissos',
    impacto: 'Médio',
    complexidade: 'Baixa',
  },
  {
    title: 'View padrão por página + permitir o usuário redefinir',
    description: 'Cada página tem uma view padrão (ex: Compromissos = tabela; Investimentos = cards; Pagamentos = mensal). O usuário deve poder marcar a view que ele preferir como padrão e o sistema lembrar isso (por usuário, persistido em profile ou localStorage).',
    type: 'feature',
    modulo: 'outros',
    impacto: 'Médio',
    complexidade: 'Média',
  },
  {
    title: 'Reorganizar ordem das colunas nas tabelas (drag & drop)',
    description: 'Em todas as visualizações de tabela do app (Compromissos, Pagamentos, Transações, Contas, etc.) permitir que o usuário reorganize a ordem das colunas via drag & drop. Persistir a preferência por usuário.',
    type: 'feature',
    modulo: 'outros',
    impacto: 'Médio',
    complexidade: 'Média',
  },
  {
    title: 'Reorganizar widgets do dashboard manualmente',
    description: 'Permitir que o usuário reorganize os widgets do dashboard (e potencialmente das páginas com múltiplos cards/seções) via drag & drop. Persistir a preferência por usuário.',
    type: 'feature',
    modulo: 'dashboard',
    impacto: 'Médio',
    complexidade: 'Média',
  },
  {
    title: 'Revisão geral dos filtros em todas as telas',
    description: 'Padronizar e melhorar o design e UX dos filtros em todas as telas (Pagamentos, Transações, Contas, Contatos, Dívidas, Investimentos, Orçamento). Considerar componente unificado de filtros, com mesmo padrão visual e comportamento.',
    type: 'sugestao',
    modulo: 'outros',
    impacto: 'Alto',
    complexidade: 'Média',
  },

  // ── IDEIAS — FEATURES DE PRODUTO ──────────────────────────────────────────
  {
    title: 'Desafios financeiros + compartilhar em redes sociais',
    description: 'Sistema de desafios (ex: "30 dias sem comer fora", "economizar X em Y meses", "quitar dívida do cartão", etc.) com progresso, badges e opção de compartilhar conquistas em redes sociais (Instagram, X, etc.). Base para a comunidade de desafios.',
    type: 'feature',
    modulo: 'outros',
    impacto: 'Alto',
    complexidade: 'Alta',
  },
  {
    title: 'AI para sugerir economias / insights financeiros',
    description: 'Integrar IA (OpenAI ou similar) para analisar o histórico financeiro do usuário e sugerir oportunidades de economia, alertar sobre padrões de gasto anormais, recomendar ajustes no orçamento, etc.',
    type: 'feature',
    modulo: 'outros',
    impacto: 'Alto',
    complexidade: 'Alta',
  },
  {
    title: 'Assistente AI via WhatsApp',
    description: 'Permitir que o usuário interaja com o FinFlow via WhatsApp: lançar uma despesa, perguntar saldo, receber lembretes de vencimento, perguntar "quanto gastei com restaurantes esse mês?", etc. Stack típico: Twilio/WhatsApp Cloud API + AI (function calling).',
    type: 'feature',
    modulo: 'outros',
    impacto: 'Alto',
    complexidade: 'Alta',
  },
  {
    title: 'Open Finance (Brasil) — conexão bancária real',
    description: 'Integrar com Open Finance para puxar saldos e transações dos bancos automaticamente (em vez de importação manual de extratos). Investigar Pluggy, Belvo, ou direto via APIs reguladas. Importante: regulamentação BCB.',
    type: 'feature',
    modulo: 'outros',
    impacto: 'Alto',
    complexidade: 'Alta',
  },
  {
    title: 'Mostrar impacto cambial em receitas e despesas',
    description: 'Funcionalidade para mostrar a diferença de receita ou despesa em moeda principal por causa da variação cambial entre o momento do orçamento/configuração e o momento do pagamento real. Útil para quem tem receita ou compromissos em moeda estrangeira.',
    type: 'feature',
    modulo: 'relatorios',
    impacto: 'Médio',
    complexidade: 'Média',
  },
  {
    title: 'Contas e transações no exterior em moeda original',
    description: 'Permitir cadastrar contas bancárias no exterior com saldo e transações mantidos na moeda do exterior (USD, EUR, GBP, etc.). Projetos de investimento alimentados por essas contas também permanecem na moeda original. Opção de mostrar saldo total consolidado na moeda principal do sistema.',
    type: 'feature',
    modulo: 'contas',
    impacto: 'Alto',
    complexidade: 'Alta',
  },
  {
    title: 'Sincronizar compromissos com Calendar / Notion / Reminders',
    description: 'Permitir que compromissos com vencimento (e potencialmente metas de investimentos) sejam sincronizados com o calendário do usuário (Google Calendar, Apple Calendar), Notion (database), Reminders, etc. Two-way sync seria ideal mas one-way (FinFlow → externo) é o mínimo viável.',
    type: 'feature',
    modulo: 'compromissos',
    impacto: 'Médio',
    complexidade: 'Alta',
  },
  {
    title: 'Importar contatos da agenda do dispositivo',
    description: 'Oferecer importação de contatos da agenda do dispositivo do usuário (Apple Contacts, Google Contacts, Android, etc.) — independente de OS. Importar dados básicos: nome, foto de perfil, pessoa ou empresa, data de aniversário, endereço, números de telefone. Stack típico: Contact Picker API (web) ou OAuth com Google People API / Apple iCloud.',
    type: 'feature',
    modulo: 'contatos',
    impacto: 'Médio',
    complexidade: 'Alta',
  },
  {
    title: 'Importação de extrato de cartão de crédito em PDF',
    description: 'Hoje o sistema já importa extratos de conta. Adicionar importação de PDF de fatura de cartão de crédito — categorizando transações e detectando parcelamentos automaticamente. Possível uso de OCR + parser específico por bandeira/banco.',
    type: 'feature',
    modulo: 'importar',
    impacto: 'Alto',
    complexidade: 'Alta',
  },
  {
    title: 'Academia: link contextual em cada página → seção exata',
    description: 'Em cada página do app, mostrar um ícone/botão "Academia" que leva o usuário direto para a seção dos tutoriais sobre AQUELA página (não para o índice geral). Espera-se redução de tempo até a primeira ação útil em cada feature.',
    type: 'feature',
    modulo: 'outros',
    impacto: 'Médio',
    complexidade: 'Baixa',
  },
  {
    title: 'Puxar credit score do SERASA (e/ou Boa Vista, SPC)',
    description: 'Mostrar credit score do usuário direto no app via integração com SERASA (ou bureaus equivalentes). Verificar APIs disponíveis (algumas exigem parceria comercial), custos e termos.',
    type: 'feature',
    modulo: 'dashboard',
    impacto: 'Médio',
    complexidade: 'Alta',
  },
  {
    title: 'Modo Ajuda + captação de contato para retornar sobre sugestão',
    description: 'Criar páginas dedicadas de Ajuda e Sugestões no app (versão usuário, com permissões adequadas). No fluxo de envio de sugestão, captar email e/ou WhatsApp do usuário e notificá-lo quando: (1) a sugestão for considerada para desenvolvimento, (2) for entregue. Aumenta engajamento.',
    type: 'feature',
    modulo: 'outros',
    impacto: 'Alto',
    complexidade: 'Média',
  },
  {
    title: 'Versão master da FinFlow (operação) + planos do usuário',
    description: 'Criar versão "master" do sistema para a equipe FinFlow administrar tudo: assinantes, planos, sugestões, comunicações, métricas. Para o usuário final, estrutura de planos e pacotes diferentes (gratuito, pro, família, etc.) com features condicionais por plano. Ver também sg.app.000041.',
    type: 'feature',
    modulo: 'admin',
    impacto: 'Alto',
    complexidade: 'Alta',
  },
  {
    title: 'Modo dev: impersonate de usuário para suporte',
    description: 'Mecanismo para devs/suporte (Super Admin) entrarem no perfil de um usuário e fazer testes/ajudas sem precisar da senha dele. Auditável (registra cada sessão impersonada com motivo). Usuário recebe notificação.',
    type: 'feature',
    modulo: 'admin',
    impacto: 'Alto',
    complexidade: 'Média',
  },
  {
    title: 'Revisar ordem dos itens no menu lateral',
    description: 'Revisitar a ordem dos itens na sidebar agora que Orçamento absorveu Compromissos e que novas seções podem surgir (Comunidade, Academia, etc.). Possível agrupamento por seções: Financeiro / Ferramentas / Comunidade já existe — refinar.',
    type: 'sugestao',
    modulo: 'outros',
    impacto: 'Baixo',
    complexidade: 'Muito Baixa',
  },
  {
    title: 'Lembretes via Email / SMS / WhatsApp',
    description: 'Sistema de notificações externas: vencimento de conta próximo, fatura disponível, muito tempo sem acessar o app, meta de investimento atingida, etc. Canais: email (Resend), SMS e WhatsApp (Twilio/WhatsApp Cloud API). Preferências de canal e tipo de evento configuráveis pelo usuário.',
    type: 'feature',
    modulo: 'outros',
    impacto: 'Alto',
    complexidade: 'Alta',
  },
  {
    title: 'Pesquisar tecnologia para agendar pagamentos direto pelo app',
    description: 'Investigar se existe alguma tecnologia/API que permita o app se comunicar com o banco e agendar pagamentos diretamente (sem o usuário precisar entrar no app do banco). Open Finance Brasil permite iniciação de pagamento (PIX) — investigar caminho regulatório e técnico.',
    type: 'pergunta',
    modulo: 'outros',
    impacto: 'Alto',
    complexidade: 'Alta',
  },
  {
    title: 'Cálculo de patrimônio com FIPE/ativos ao vivo',
    description: 'Estrutura para calcular o patrimônio do usuário considerando ativos físicos: ex. um carro financiado entra como patrimônio = (% pago da dívida × valor atual FIPE). Tanto o % pago quanto o valor FIPE são atualizados ao vivo. Aplicável a outros ativos (imóveis com valor de mercado, etc.).',
    type: 'feature',
    modulo: 'dividas',
    impacto: 'Alto',
    complexidade: 'Alta',
  },
  {
    title: 'Comunidade de desafios financeiros',
    description: 'Infraestrutura para a comunidade de desafios: rankings, feeds, comentários, possibilidade de criar desafios em grupo (família, amigos), badges públicas, etc. Depende dos desafios em si (ver ticket separado).',
    type: 'feature',
    modulo: 'outros',
    impacto: 'Alto',
    complexidade: 'Alta',
  },
  {
    title: 'Educação financeira: conteúdo + comunidade + parcerias',
    description: 'Canal forte de educação financeira para adultos e crianças. Cursos, tutoriais, artigos, vídeos próprios e curados. Parcerias com criadores de conteúdo e profissionais (planejadores financeiros certificados). Comunidade ativa para perguntas/respostas e troca de aprendizados. Foco em crianças/jovens é diferencial vs. concorrentes.',
    type: 'feature',
    modulo: 'outros',
    impacto: 'Alto',
    complexidade: 'Alta',
  },
]

// ── Execução ───────────────────────────────────────────────────────────────
async function run() {
  console.error(`\n=== UPDATES (${updates.length}) ===`)
  for (const u of updates) {
    const { error } = await supabase
      .from('feedback')
      .update({ description: u.description })
      .eq('codigo', u.codigo)
    if (error) console.error(`❌ ${u.codigo}:`, error.message)
    else console.error(`✓ atualizado ${u.codigo}`)
  }

  console.error(`\n=== INSERTS (${newTickets.length}) ===`)
  const rows = newTickets.map((t) => ({
    title: t.title,
    description: t.description,
    type: t.type,
    status: 'novo',
    origem: 'admin',
    impacto: t.impacto,
    complexidade: t.complexidade,
    modulo: t.modulo,
  }))
  const { data, error } = await supabase
    .from('feedback')
    .insert(rows)
    .select('codigo, title')
  if (error) {
    console.error('❌ batch insert:', error.message)
    process.exit(1)
  }
  for (const r of data) console.error(`✓ criado ${r.codigo} — ${r.title}`)

  console.error(`\n=== DONE — ${updates.length} updates, ${data.length} inserts ===`)
}

await run()
