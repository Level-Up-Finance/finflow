# Brand Voice Guidelines · FinFlow

> Versão deste documento: **1.2**
> Data: 22/05/2026
> Fonte primária: `docs/MANUAL.md` (alinhado com v1.0.5 do produto)
> Identidade visual: `docs/VISUAL.md` v2.0 (Roxo Tech + Lime, logo Twin Track)
> Público-alvo: pessoa física + casal/família brasileira, futuro internacional
> Personalidade aprovada: **Amigável + Inteligente + Opinativo**

---

## Índice

1. Quem somos e quem não somos
2. Voz constante (não muda)
3. Tom flexível (muda por contexto)
4. Regras de escrita
5. Padrões de copy por componente UI
6. Exemplos lado a lado
7. Multi-perfil (futuro)
8. Taglines oficiais
9. Filtros de naming
10. Confidence scores
11. Decisões fechadas
12. Open questions
13. Como usar este documento
14. Histórico de versões

---

## 1. Quem somos e quem não somos

A âncora da marca. Toda decisão de copy, naming, design e tom de voz deriva dessa tabela.

| We Are | We Are Not |
|---|---|
| **Próximos**. Falamos "você", "vocês", usamos contrações ("pra", "dá pra"), explicamos sem condescender | **Íntimos demais**. Não somos "amigão de boteco" nem usamos gírias datadas ("mano", "tipo") |
| **Inteligentes**. Temos profundidade real (4 moedas, conciliação OFX, 23 relatórios, SAC/Price) | **Pedantes**. Não exibimos complexidade pra impressionar. Explicamos sempre o "porquê" |
| **Opinativos**. Defendemos uma filosofia ("comprometido vs. executado"), guiamos o usuário ativamente | **Mandões**. Não damos bronca, não envergonhamos quem gastou demais, sem coach moralista |
| **Detalhistas**. Rastreamos coisas que outros apps ignoram (conta efetiva, caixinhas, cross-conta) | **Burocráticos**. Não enchemos o usuário de campos opcionais nem checklist infinita |
| **Realistas**. Assumimos que a vida financeira é bagunçada (pagou de outra conta, esqueceu de marcar) | **Cínicos**. Não tratamos o usuário como descuidado. Oferecemos correção, não julgamento |
| **Brasileiros sem provincianismo**. pt-BR como base, mas multimoeda e termos técnicos em EN onde fazem sentido (OFX, ledger) | **Anglo-aspiracionais**. Sem inglês de enfeite ("AI-powered", "dashboard insights"). Só quando é mais preciso |
| **Calmos**. Finança é tema sensível, sem urgência fabricada ("Última chance!", "Faltam 2 dias!") | **Indiferentes**. Também não somos passivos. Avisamos atrasos, criamos tarefas, sugerimos ações |

---

## 2. Voz constante (não muda)

### 2.1. Princípios

1. **Trate o usuário como adulto inteligente.** Explique conceitos novos uma vez, com clareza, e depois confie que ele entendeu.
2. **Tenha opinião.** Defenda escolhas de design ("foi assim que pensamos") em vez de relativizar tudo.
3. **Mostre o trabalho.** Quando o app fizer algo automaticamente (gerar pagamentos, sincronizar, realocar conta), explique o que aconteceu.
4. **Fale plural quando fizer sentido.** "Vocês" e "a gente" pra casais/famílias. "Você" pra individual. Nunca "o usuário", "a conta", "o cliente".
5. **Português de verdade, não traduzido.** "Compromisso" e "Caixinha" porque são mais precisos que "transação recorrente" e "envelope". Mas aceitamos OFX, ledger, cashflow quando são o termo certo.
6. **Sem travessões (—) em texto visível.** Use vírgula, dois pontos, parênteses ou ponto final. Travessão fica só em comentários de código.

### 2.2. Vocabulário canônico

Termos do produto têm tradução fixa.

| Conceito | Termo correto | Não usar |
|---|---|---|
| Promessa de receita/despesa recorrente | **Compromisso** | "Despesa fixa", "lançamento recorrente" |
| Ocorrência mensal de um compromisso | **Pagamento** | "Conta", "boleto", "lançamento" |
| Registro real do dinheiro saindo/entrando | **Transação** | "Movimentação", "operação" |
| Sub-saldo dentro de uma conta | **Caixinha** | "Envelope", "Pote", "Meta" |
| Saldo livre, não alocado em caixinhas | **Caixa Livre** | "Saldo disponível", "Livre" |
| Conta de onde o dinheiro saiu de fato | **Conta efetiva** | "Conta real", "Origem real" |
| Bater pagamentos com extrato | **Conciliação** ou **Reconciliação** | "Match", "verificação" |
| Receita recebida antes do previsto | **Adiantamento de receita** | "Antecipação", "pagamento antecipado" |
| Ativos menos passivos | **Patrimônio** | "Net worth" em português, "fortuna" |
| Promessa de aporte com meta + prazo | **Projeto de investimento** | "Objetivo", "goal" |
| Snapshot de saldo do banco via OFX | **Saldo do banco** | "Saldo real" (ambíguo), "snapshot" |

### 2.3. Vocabulário banido

- ❌ "Investidor" para pessoa comum. Use "você".
- ❌ "Cliente". Somos um app, eles são usuários ou simplesmente "você".
- ❌ "Robô", "IA", "inteligência artificial". Somos um app determinístico bem projetado.
- ❌ "Plataforma" quando dá pra dizer "app" ou "FinFlow".
- ❌ "Solução". É vendedor demais. Diga o que faz.
- ❌ "Empoderar". Palavra desgastada de marketing.
- ❌ Anglicismos desnecessários: "insights", "dashboard" (em UI tudo bem, em copy de marketing não), "tracking", "report".

---

## 3. Tom flexível (muda por contexto)

| Contexto | Formalidade | Energia | Densidade técnica | Exemplo |
|---|---|---|---|---|
| Microcopy (botão, label) | Baixa | Baixa | Baixa | "Marcar como pago", "Saiu de qual conta?" |
| Toast de sucesso | Baixa | Média | Baixa | "Pagamento marcado. Saldo atualizado." |
| Toast de erro | Média | Baixa | Média | "Câmbio USD indisponível agora, tenta de novo em alguns minutos." |
| Dialog de confirmação | Baixa | Baixa | Baixa | "Você mudou esse pagamento para a conta Nubank. Quer que os próximos saiam dessa conta?" |
| Empty state | Baixa | Média | Baixa | "Nenhum compromisso ainda. Comece cadastrando seu salário ou aluguel, o resto a gente preenche." |
| Onboarding | Baixa | Média | Média | "FinFlow funciona assim, você cadastra **compromissos** e a gente gera os **pagamentos** futuros sozinho." |
| Email transacional | Média | Baixa | Baixa | "Pra trocar sua senha, clica aqui. O link vale por 1 hora." |
| Email marketing / changelog | Baixa | Média | Média | "Saiu a v1.0.5, agora dá pra marcar transferência por outra conta sem bagunçar o histórico." |
| Landing page (hero) | Média | Média | Baixa | "Organize compromissos, não tickets de extrato." |
| Documentação técnica | Média | Baixa | Alta | "`conta_id_efetiva` rastreia a conta real quando difere da configurada." |
| Suporte (resposta a bug) | Média | Baixa | Média | "Boa, reproduzi aqui. O problema é X, corrigimos na v1.0.6. Te aviso quando subir." |

---

## 4. Regras de escrita

### 4.1. Estrutura de frase

- **Frases curtas.** Idealmente até 15 palavras. Se passar de 25, quebre.
- **Voz ativa.** "O FinFlow gera os pagamentos" > "Os pagamentos são gerados pelo FinFlow".
- **Sujeito explícito.** "Você marca como pago" > "Ao marcar como pago".
- **Verbo de ação no início de botões.** "Marcar como pago", "Importar extrato", não "Pagamento" ou "Importação".

### 4.2. Pontuação e tipografia

- **Sem travessão (—) em texto visível.** Use vírgula, dois pontos, parênteses ou ponto. Travessão só em comentários de código.
- **Aspas duplas** (" ") pra citações curtas; **aspas simples** (' ') pra termos técnicos.
- **Negrito** só pra termos canônicos ou ações primárias. Nunca pra ênfase emocional.
- **Itálico**, evitar em copy de produto.
- **Sem ALL CAPS.** Use bold ou exclamação (com parcimônia).
- **Sem emoji excessivo.** Aceitável em headers de docs e badges funcionais. Não em copy de marketing nem em CTAs.

### 4.3. Números, moeda, data

- **Valores monetários** sempre com símbolo (R$ 1.500,00), não "1500 reais" em UI.
- **Datas** dd/mm/aaaa (formato BR), ISO em logs.
- **Porcentagem** "15%", não "15 por cento".
- **Grandes números** separador de milhar com ponto, decimal com vírgula. Em textos abreviar (100k, 1,5M) é OK.
- **Câmbio** mostrar par e direção ("1 BRL = 0,18 USD" e "1 USD = R$ 5,52").

### 4.4. Inclusão e linguagem neutra

- **"Você"** é gênero-neutro.
- **"A gente"** vale como "nós" coloquial, sem soar masculino nem feminino.
- **Evite assumir estrutura familiar.** "Seu parceiro/parceira" > "seu marido"/"sua esposa".
- **Não assumir relação com dinheiro.** Não diga "investidor experiente", "iniciante", "endividado". Trate cada usuário como capaz de aprender.

---

## 5. Padrões de copy por componente UI

### 5.1. Botões (CTAs)

| Tipo | Padrão | Exemplos |
|---|---|---|
| Ação primária | Verbo + objeto curto | "Marcar como pago", "Salvar alterações" |
| Ação secundária | Verbo ou substantivo neutro | "Cancelar", "Fechar", "Voltar" |
| Confirmação positiva | "Sim, [verbo]" ou só "Sim" | "Sim, atualizar", "Sim" |
| Confirmação negativa | "Não" ou "Não, [contexto]" | "Não", "Não, só este pagamento" |
| Destrutiva | Verbo direto, sem eufemismo | "Excluir conta", "Cancelar compromisso" |

### 5.2. Empty states

Estrutura em 2 linhas:
1. **O que está vazio + por quê**
2. **O que fazer agora + botão**

Exemplo: "Nenhum compromisso ainda. Comece cadastrando seu salário ou aluguel, o resto a gente preenche." + botão "Novo compromisso".

Evitar:
- Frases motivacionais ("Vamos lá, sua jornada começa aqui!")
- Apenas "Sem dados"

### 5.3. Toasts

- **Sucesso**, confirma + estado novo. "Transferência registrada. Saldos atualizados em /contas."
- **Erro**, causa + próximo passo. "Câmbio USD indisponível agora. Tenta de novo em alguns minutos."
- **Aviso**, alerta + ação opcional. "Importação tem 3 transações sem categoria. Reconciliar agora?"
- **Info**, estado novo apenas. "Compromisso arquivado."

Duração: 3 a 5s pra sucesso, 6 a 8s pra erro/aviso.

### 5.4. Modais de confirmação

Estrutura em 4 partes:
1. **Pergunta clara** no título ("Aplicar à recorrência?", "Excluir esta dívida?")
2. **Contexto visual** (avatar do banco, ícone do tipo, valor)
3. **Consequência explícita** ("Os próximos 24 pagamentos serão excluídos.")
4. **Dois botões com verbo**, ação positiva primeiro (verde), negativa segundo (vermelho/ghost)

---

## 6. Exemplos lado a lado

### 6.1. Erros e problemas

| ❌ Não escrever | ✅ Escrever |
|---|---|
| "Ops! Algo deu errado." | "Câmbio USD indisponível agora, tenta de novo em alguns minutos." |
| "Erro de validação no campo." | "Conta de origem e destino precisam ser diferentes." |
| "Operação não autorizada." | "Esse pagamento tá vinculado a uma transação importada do banco. Desvincule em Transações antes de mudar o status." |
| "Sucesso!" | "Pagamento marcado como Pago. Transação criada no Itaú." |

### 6.2. Pedindo decisão

| ❌ Não escrever | ✅ Escrever |
|---|---|
| "Tem certeza?" | "Excluir esse compromisso vai cancelar os 12 pagamentos futuros que ainda não rolaram. OK?" |
| "Deseja prosseguir?" | "Aplicar essa mudança aos próximos pagamentos também?" |
| "Selecione uma opção:" | "Saiu de qual conta?" |

### 6.3. Onboarding e ensinando

| ❌ Não escrever | ✅ Escrever |
|---|---|
| "Bem-vindo ao FinFlow! Sua jornada financeira começa aqui!" | "Beleza, pra começar cadastra seu salário e seus gastos fixos. A gente gera os pagamentos do ano inteiro automaticamente." |
| "Categorias permitem organizar suas despesas." | "Categorias agrupam compromissos parecidos: Custo de Vida, Lazer, Investimentos. Já vem com as principais, não precisa criar agora." |

### 6.4. Marketing e landing

| ❌ Não escrever | ✅ Escrever |
|---|---|
| "A plataforma definitiva de gestão financeira." | "Pare de cadastrar transação por transação. Cadastre compromissos." |
| "Empoderamos sua vida financeira." | "Você sabe quanto pode sobrar em dezembro. Antes de dezembro chegar." |
| "AI-powered insights." | "23 relatórios que mostram pra onde seu dinheiro foi, e pra onde vai." |

---

## 7. Multi-perfil (futuro)

Quando a funcionalidade de múltiplos perfis sair, a voz precisa acomodar:

- **Padrão singular continua** quando a ação é individual ("Você cadastrou um compromisso.")
- **Plural automático** quando afeta o grupo ("Vocês têm 3 compromissos compartilhados em outubro.")
- **Nomes próprios** quando há ambiguidade ("Arnaldo marcou o aluguel como pago.")
- **Evitar "usuário X" ou "membro Y"**, sempre o nome ou o pronome

Exemplos:
- ✅ "Vocês economizaram R$ 2.400 esse mês comparado ao mês passado."
- ✅ "Maria atualizou a conta do aluguel."
- ❌ "O usuário principal alterou as configurações."
- ❌ "Membro adicional realizou um pagamento."

---

## 8. Taglines oficiais

Decididas em 22/05/2026. **Sistema de 3 taglines** com papéis diferentes:

### 8.1. Tagline principal · positioning

> **"Organize compromissos, não tickets de extrato."**

Usar em: homepage hero, materiais formais, footer, cartão de visita, embalagens, deck institucional.

**O que faz**: posiciona contra apps que cadastram transação a transação. Explica diferença em uma linha.

### 8.2. Hook de campanha · curiosidade

> **"Você sabe quanto pode sobrar em dezembro. Antes de dezembro chegar."**

Versão curta para ads e billboards: **"Antes de dezembro chegar."**

Usar em: ads, billboards, social posts de campanha, hero da seção de projeção, email marketing.

**O que faz**: promete antecipação. Gancho que pede o "como?". Sticky.

### 8.3. Explicação do modelo · filosofia técnica

> **"Comprometido vs. executado."**

Usar em: página "Sobre", seção "Como funciona", onboarding, docs internas, conceito do logo.

**O que faz**: sintetiza o modelo mental do app. Carrega a filosofia que dá nome ao símbolo Twin Track.

### 8.4. Distribuição visual no logo Twin Track

A linha de cima do símbolo representa o **comprometido** (planejado, roxo). A linha de baixo representa o **executado** (real, lime, com pico de variação). O logo é a tagline 8.3 desenhada.

---

## 9. Filtros de naming (Fase 2)

Quando for buscar nome alternativo ao FinFlow, esses filtros guiam:

| Filtro | Critério |
|---|---|
| **Tom** | Amigável-inteligente. Não corporativo, não fofo |
| **Pronúncia** | Funciona em PT-BR e EN sem ajustar |
| **Comprimento** | 1 a 3 sílabas (Linear, Notion, Stripe) |
| **Domínio** | .com disponível ou comprável (até R$ 5k razoável) |
| **Tradução de "Flow"** | Manter sensação de movimento/leveza, não cair em "gestão", "controle", "planner" |
| **Substantivo concreto > abstração genérica** | "Notion" e "Stripe" funcionam, "FinanceManager" não |

Categorias a explorar:
1. **Metáforas de fluxo** (Stream, Tide, Current, Drift)
2. **Termos contábeis poéticos** (Ledger, Tally, Ream, Quill)
3. **Palavras inventadas curtas** (Klop, Vena, Mire, Joon)
4. **Palavras brasileiras universais** (Ipê, Voto, Mira, Lume)
5. **Composições híbridas** (Penny+verbo, verbo+Money)

---

## 10. Confidence scores

| Seção | Confiança |
|---|---|
| 1. We Are / We Are Not | 🟢 Alta |
| 2. Voz constante | 🟢 Alta |
| 2.2 Vocabulário canônico | 🟢 Alta |
| 2.3 Vocabulário banido | 🟢 Alta |
| 3. Tom por contexto | 🟢 Alta |
| 4. Regras de escrita | 🟢 Alta |
| 5. Padrões UI | 🟢 Alta |
| 6. Exemplos lado a lado | 🟢 Alta |
| 7. Multi-perfil | 🟠 Baixa (feature não existe) |
| 8. Taglines | 🟢 Alta (decididas e aplicadas) |
| 9. Filtros de naming | 🟢 Alta |

---

## 11. Decisões fechadas

### 11.1. Plural genérico ("vocês"/"a gente") em marketing
✅ **Usar plural genérico em marketing desde já** (landing, social, email). UI do app mantém "você" até multi-perfil existir.

### 11.2. Tagline
✅ **Decidida em 22/05/2026.** Sistema de 3 taglines, ver seção 8.

### 11.3. Emojis em comunicação externa
✅ **Sutil e contextual, nunca abundante.** Hero da landing, comunicado oficial, página institucional, ZERO. Email transacional, até 1. Email marketing, até 2 com função. UI, badges funcionais.

### 11.4. Travessão (—) em texto
✅ **Banido em texto visível.** Substituir por vírgula, dois pontos, parênteses ou ponto. Mantido em comentários de código (CSS, HTML, JS).

### 11.5. Status de pagamento
✅ **5 status** apenas, decidido em 22/05/2026: Pago, Transferido, A Transferir, Cancelado, A Pagar (default). Cartão, Parcial e Agendado foram removidos.

---

## 12. Open questions

### Média prioridade

1. **Tutela de termos PT vs. EN.** "Cashflow" ou "Fluxo de caixa"? "Budget" ou "Orçamento"? Hoje o MANUAL usa PT. Manter assim em toda a marca?
2. **Linguagem em estados de erro graves.** Quando o usuário perde dados / sincronização falha grave / dívida calcula errado, sobe o nível de seriedade?

---

## 13. Como usar este documento

- **Designers de UI**, seções 4 (regras), 5 (padrões UI), 6 (exemplos lado a lado)
- **Copy de marketing**, seções 3 (tom) e 6.4, e taglines da seção 8
- **Suporte**, seções 3 (linha "Suporte") e 6.1
- **Engenharia**, seção 2.2 (vocabulário canônico)
- **Naming**, seção 9

Para a **identidade visual**, ver `docs/VISUAL.md` v2.0.

---

## 14. Histórico de versões

- **1.2 · 22/05/2026**, decidida hierarquia de 3 taglines (seção 8). Banido travessão (—) em texto visível (seção 11.4). Status reduzidos a 5 (seção 11.5). Aplicado em landing, deck, email mockups. Sincronizado com VISUAL.md v2.0.
- **1.1 · 21/05/2026**, fechadas 3 open questions: plural genérico em marketing desde já, tagline a definir agora, emojis sutil/contextual.
- **1.0 · 20/05/2026**, versão inicial extraída de MANUAL.md (v1.0.5). Personalidade: Amigável + Inteligente + Opinativo. Público: PF + Casal/Família PT-BR.
