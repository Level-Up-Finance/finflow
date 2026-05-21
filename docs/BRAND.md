q# Brand Voice Guidelines — FinFlow

> Versão deste documento: 1.0
> Data: 20/05/2026
> Fonte primária: `docs/MANUAL.md` (alinhado com v1.0.5 do produto)
> Público-alvo: pessoa física + casal/família brasileira; futuro internacional
> Personalidade aprovada: **Amigável + Inteligente + Opinativo**

---

## 1. Quem somos (e quem não somos)

A âncora da marca. Toda decisão de copy, naming, design e tom de voz deriva dessa tabela.

| We Are | We Are Not |
|--------|------------|
| **Próximos** — falamos "você"/"vocês", usamos contrações ("pra", "dá pra"), explicamos sem condescender | **Íntimos demais** — não somos "amigão de boteco" nem usamos gírias datadas ("mano", "tipo") |
| **Inteligentes** — temos profundidade real (4 moedas, conciliação OFX, 23 relatórios, matemática de SAC/Price) | **Pedantes** — não exibimos complexidade pra impressionar; explicamos sempre o "porquê" |
| **Opinativos** — defendemos uma filosofia ("comprometido vs. executado"), guiamos o usuário ativamente | **Mandões** — não damos bronca, não envergonhamos quem gastou demais, não somos coach moralista |
| **Detalhistas** — rastreamos coisas que outros apps ignoram (`conta_id_efetiva`, caixinhas, cross-conta) | **Burocráticos** — não enchemos o usuário de campos opcionais nem checklist infinita |
| **Realistas** — assumimos que a vida financeira é bagunçada (pagou da outra conta, esqueceu de marcar, adiantou receita) | **Cínicos** — não tratamos o usuário como descuidado; oferecemos ferramenta de correção, não julgamento |
| **Brasileiros sem provincianismo** — pt-BR como base, mas multimoeda e termos técnicos em inglês onde fazem sentido (OFX, ledger) | **Anglo-aspiracionais** — não usamos inglês de enfeite ("dashboard insights", "AI-powered"); só quando é mais preciso |
| **Calmos** — finança é tema sensível, então não usamos urgência fabricada ("Última chance!", "Faltam 2 dias!") | **Indiferentes** — também não somos passivos: avisamos atrasos, criamos tarefas, sugerimos ações |

**Confiança nessa tabela:** 🟢 **Alta** — 7 atributos derivados de padrões consistentes em 14 regras transversais + escolhas de naming de telas + microcopy presente no MANUAL.md.

---

## 2. Voz constante (não muda)

A **voz** é a personalidade. Não flexa por contexto.

### 2.1. Princípios de voz

1. **Trate o usuário como adulto inteligente.** Explique conceitos novos uma vez, com clareza, e depois confie que ele entendeu.
2. **Tenha opinião.** Defenda escolhas de design ("foi assim que pensamos") em vez de relativizar tudo.
3. **Mostre o trabalho.** Quando o app fizer algo automaticamente (gerar pagamentos, sincronizar transações, realocar conta), explique o que aconteceu.
4. **Fale plural quando fizer sentido.** "Vocês" e "a gente" pra casais/famílias; "você" pra individual. Nunca "o usuário", "a conta", "o cliente".
5. **Português de verdade, não traduzido.** Usamos "compromisso" e "caixinha" porque são mais precisos que "transação recorrente" e "envelope". Mas aceitamos OFX, ledger, cashflow quando são o termo certo.

### 2.2. Vocabulário canônico (use sempre)

Termos do produto têm tradução fixa. Não invente sinônimos:

| Conceito | Termo correto | Não usar |
|---|---|---|
| Promessa de receita/despesa recorrente | **Compromisso** | "Despesa fixa", "lançamento recorrente" |
| Ocorrência mensal de um compromisso | **Pagamento** | "Conta", "boleto", "lançamento" |
| Registro real do dinheiro saindo/entrando | **Transação** | "Movimentação", "lançamento", "operação" |
| Sub-saldo dentro de uma conta | **Caixinha** | "Envelope", "Pote", "Meta" |
| Saldo livre, não alocado em caixinhas | **Caixa Livre** | "Saldo disponível", "Livre" |
| Conta de onde o dinheiro saiu de fato | **Conta efetiva** | "Conta real", "Origem real" |
| Bater pagamentos com extrato do banco | **Conciliação** ou **reconciliação** | "Match", "verificação" |
| Receita recebida antes do previsto | **Adiantamento de receita** | "Antecipação", "pagamento antecipado" |
| Ativos (contas+investimentos+bens) − passivos (dívidas) | **Patrimônio** | "Net worth" (em português), "fortuna" |
| Promessa de aporte com meta + prazo | **Projeto de investimento** | "Objetivo", "goal" |
| Snapshot de saldo do banco via OFX | **Saldo do banco** | "Saldo real" (ambíguo), "snapshot" (técnico) |

### 2.3. Vocabulário banido (nunca use)

- ❌ **"Investidor"** quando se trata de pessoa comum gerenciando finanças. Use "você".
- ❌ **"Cliente"** — somos um app, eles são usuários ou simplesmente "você".
- ❌ **"Robô" / "IA" / "inteligência artificial"** — não somos isso. Somos um app determinístico bem projetado.
- ❌ **"Plataforma"** quando dá pra dizer "app" ou "FinFlow".
- ❌ **"Solução"** — é vendedor demais. Diga o que faz.
- ❌ **"Empoderar"** — palavra desgastada de marketing.
- ❌ **Anglicismos desnecessários**: "insights", "dashboard" (em UI tudo bem, em copy de marketing não), "tracking", "report".

**Confiança vocabulário:** 🟢 **Alta** — extraído diretamente do glossário do MANUAL.md (seção 7) e nomenclatura consistente em todas as páginas.

---

## 3. Tom flexível (muda por contexto)

O **tom** flexa formalidade, energia e profundidade técnica conforme onde a mensagem aparece.

| Contexto | Formalidade | Energia | Densidade técnica | Exemplo (escrever assim) | Anti-padrão (não escrever) |
|---|---|---|---|---|---|
| **Microcopy no app (botão, label)** | Baixa | Baixa | Baixa | "Marcar como pago", "Quando foi pago?", "Saiu de qual conta?" | "Confirmar Status do Pagamento", "Inserir Dados de Quitação" |
| **Toast/notificação de sucesso** | Baixa | Média | Baixa | "Pagamento marcado. Saldo atualizado.", "Compromisso atualizado: próximos pagamentos sairão de Nubank." | "Operação realizada com sucesso!" |
| **Toast/notificação de erro** | Média | Baixa | Média | "Conta de origem e destino não podem ser a mesma.", "Câmbio USD indisponível agora — tenta de novo em alguns minutos." | "Erro 500: Internal Server Error", "Ops! Algo deu errado" |
| **Dialog de confirmação** | Baixa | Baixa | Baixa | "Você mudou esse pagamento para a conta: [Banco]. Quer que os próximos pagamentos desse compromisso também saiam dessa conta?" | "Tem certeza? Esta ação não pode ser desfeita." |
| **Vazio (empty state)** | Baixa | Média | Baixa | "Nenhum compromisso ainda. Comece cadastrando seu salário ou aluguel — o resto a gente preenche." | "Lista vazia" |
| **Onboarding** | Baixa | Média | Média | "FinFlow funciona assim: você cadastra **compromissos** (aluguel, salário) e a gente gera os **pagamentos** futuros sozinho. No fim do mês, você só confirma o que rolou." | "Bem-vindo! Vamos começar sua jornada financeira!" |
| **Email transacional (reset senha, etc.)** | Média | Baixa | Baixa | "Pra trocar sua senha, clica aqui. O link vale por 1 hora." | "Prezado usuário, segue link para redefinição de credenciais." |
| **Email marketing / changelog** | Baixa | Média | Média | "Saiu a v1.0.5: agora você consegue marcar transferência por uma conta diferente sem bagunçar o histórico. Detalhes nas novidades." | "🚀 BIG UPDATE! Confira as novidades INCRÍVEIS!" |
| **Landing page (hero)** | Média | Média | Baixa | "Organize compromissos, não tickets de extrato." | "A melhor plataforma de gestão financeira pessoal do Brasil" |
| **Documentação técnica (developer-facing)** | Média | Baixa | Alta | "`conta_id_efetiva` rastreia a conta real quando difere da configurada no compromisso. NULL = usa o default da subcategoria." | "Esta coluna armazena dados sobre a conta efetiva." |
| **Suporte ao usuário (resposta a bug)** | Média | Baixa | Média | "Boa! Reproduzi aqui. O problema é X, corrigimos na v1.0.6. Te aviso quando subir." | "Lamentamos o ocorrido. Estamos investigando." |

**Confiança tom:** 🟡 **Média** — derivado parcialmente de copy existente no app (toasts, popovers) e parcialmente extrapolado pra contextos novos (landing, email marketing) que ainda não existem.

---

## 4. Regras de escrita

### 4.1. Estrutura de frase

- **Frases curtas.** Idealmente até 15 palavras. Se passar de 25, quebre.
- **Voz ativa.** "O FinFlow gera os pagamentos" > "Os pagamentos são gerados pelo FinFlow".
- **Sujeito explícito.** "Você marca como pago" > "Ao marcar como pago".
- **Verbo de ação no início de botões.** "Marcar como pago", "Importar extrato", "Registrar adiantamento" — não "Pagamento" ou "Importação".

### 4.2. Pontuação e tipografia

- **Travessão (—) sim, hífen (-) não pra interrupções.** "FinFlow funciona assim — você cadastra…" (não usar `--` nem `-`).
- **Aspas duplas** ("") pra citações curtas; aspas simples ('') pra termos técnicos quando precisar destacar.
- **Negrito** só pra termos canônicos ou ações primárias. Nunca pra ênfase emocional.
- **Itálico** evitar em copy de produto; aceitável em documentação pra metadados.
- **Sem ALL CAPS** pra ênfase. Use bold ou exclamação (com parcimônia).
- **Sem emoji excessivo.** Aceitável em headers de docs/changelog (🔐 📒 ✨) e em badges funcionais (↔️, ⏩) onde transmite info. Não em copy de marketing nem em CTAs.

### 4.3. Números, moeda, data

- **Valores monetários**: sempre com símbolo (R$ 1.500,00) — não "1500 reais" em UI.
- **Datas**: dd/mm/aaaa (formato BR) pra brasileiro; ISO (aaaa-mm-dd) em logs e documentação técnica.
- **Porcentagem**: "15%", não "15 por cento".
- **Grandes números**: separador de milhar com ponto, decimal com vírgula (R$ 100.000,00). Pra textos longos, abreviar é OK ("100k", "1,5M").
- **Câmbio**: mostrar sempre par e direção ("1 BRL = 0,18 USD" e "1 USD = R$ 5,52").

### 4.4. Inclusão e linguagem neutra

- **"Você"** é gênero-neutro. Use livremente.
- **"A gente"** vale como "nós" coloquial — não soa nem masculino nem feminino.
- **Evite assumir estrutura familiar.** "Seu parceiro/parceira" é melhor que "seu marido"/"sua esposa". "Sua família" é melhor que "seus filhos" quando não sabemos.
- **Não assumir relação com dinheiro.** Não diga "investidor experiente", "iniciante", "endividado". Trate cada usuário como capaz de aprender o necessário.

---

## 5. Padrões de copy por componente UI

### 5.1. Botões (CTAs)

| Tipo | Padrão | Exemplos |
|---|---|---|
| Ação primária | Verbo + objeto curto | "Marcar como pago", "Salvar alterações", "Importar extrato" |
| Ação secundária | Verbo ou substantivo neutro | "Cancelar", "Fechar", "Voltar" |
| Confirmação positiva | "Sim, [verbo]" ou só "Sim" | "Sim, atualizar", "Sim" |
| Confirmação negativa | "Não" ou "Não, [contexto]" | "Não", "Não, só este pagamento" |
| Destrutiva | Verbo direto, sem eufemismo | "Excluir conta", "Cancelar compromisso", "Resetar dados" |

### 5.2. Empty states (estado vazio)

Estrutura sugerida em 2 linhas:
1. **O que está vazio + por quê** ("Nenhum compromisso ainda. Você precisa de pelo menos um pra começar.")
2. **O que fazer agora + botão** ("Cadastre seu salário ou aluguel.") + botão "Novo compromisso"

Evitar:
- Frases motivacionais ("Vamos lá, sua jornada começa aqui!")
- Apenas "Sem dados"

### 5.3. Toasts

- **Sucesso**: confirma + estado novo. "Transferência registrada. Saldos atualizados em /contas."
- **Erro**: causa + próximo passo. "Câmbio USD indisponível agora. Tenta de novo em alguns minutos."
- **Aviso**: alerta + ação opcional. "Importação tem 3 transações sem categoria. Reconciliar agora?"
- **Info**: estado novo apenas. "Compromisso arquivado."

Duração: 3–5s pra sucesso, 6–8s pra erro/aviso (precisa ler).

### 5.4. Modais de confirmação

Estrutura em 4 partes:
1. **Pergunta clara** no título ("Aplicar à recorrência?", "Excluir esta dívida?")
2. **Contexto visual** (avatar do banco, ícone do tipo, valor)
3. **Consequência explícita** ("Os próximos 24 pagamentos serão excluídos.")
4. **Dois botões com verbo**: ação positiva primeiro (verde), negativa segundo (vermelho/ghost)

---

## 6. O que dizer / O que evitar — exemplos lado a lado

### 6.1. Erros e problemas

| ❌ Não escrever | ✅ Escrever |
|---|---|
| "Ops! Algo deu errado." | "Câmbio USD indisponível agora — tenta de novo em alguns minutos." |
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
| "Bem-vindo ao FinFlow! Sua jornada financeira começa aqui!" | "Beleza — pra começar, cadastra seu salário e seus gastos fixos. A gente gera os pagamentos do ano inteiro automaticamente." |
| "Categorias permitem organizar suas despesas." | "Categorias agrupam compromissos parecidos — Custo de Vida, Lazer, Investimentos. Você não precisa criar agora; já vem com as principais." |

### 6.4. Marketing e landing

| ❌ Não escrever | ✅ Escrever |
|---|---|
| "A plataforma definitiva de gestão financeira." | "Pare de cadastrar transação por transação. Cadastre compromissos." |
| "Empoderamos sua vida financeira." | "Você sabe quanto vai sobrar em outubro. Antes de outubro chegar." |
| "AI-powered insights." | "23 relatórios que mostram pra onde seu dinheiro foi — e pra onde vai." |

---

## 7. Personalidade aplicada ao multi-perfil (futuro)

Quando a funcionalidade de múltiplos perfis na mesma conta sair, a voz precisa acomodar:

- **Padrão singular continua** quando a ação é individual ("Você cadastrou um compromisso.").
- **Plural automático** quando a ação afeta o grupo ("Vocês têm 3 compromissos compartilhados em outubro.").
- **Nomes próprios** quando há ambiguidade ("Arnaldo marcou o aluguel como pago.", "Maria registrou um adiantamento.").
- **Evitar "usuário X" ou "membro Y"** — sempre o nome ou o pronome.

Exemplos de copy multi-perfil:
- ✅ "Vocês economizaram R$ 2.400 esse mês comparado ao mês passado."
- ✅ "Maria atualizou a conta do aluguel."
- ❌ "O usuário principal alterou as configurações."
- ❌ "Membro adicional realizou um pagamento."

---

## 8. Aplicação ao naming (Fase 2)

Quando a gente for buscar nome alternativo ao FinFlow, esses filtros vão guiar:

| Filtro | Critério |
|---|---|
| **Tom** | Deve soar amigável-inteligente. Não corporativo (Bradesco, Itaú), não fofo (Mobills, MoneyLover) |
| **Pronúncia** | Funciona em PT-BR e EN sem ajustar |
| **Comprimento** | 1–3 sílabas (Linear, Notion, Stripe) |
| **Domínio** | .com disponível ou comprável (até R$ 5k razoável) |
| **Tradução de "Flow"** | Manter sensação de movimento/leveza/continuidade — não cair em "gestão", "controle", "planner" |
| **Substantivo concreto > abstração genérica** | "Notion" e "Stripe" funcionam; "FinanceManager" não |

Categorias de naming a explorar na Fase 2:
1. **Metáforas de fluxo** (Stream, Tide, Current, Drift)
2. **Termos contábeis poéticos** (Ledger, Tally, Ream, Quill)
3. **Palavras inventadas curtas** (Klop, Vena, Mire, Joon)
4. **Palavras brasileiras universais** (Ipê, Voto, Mira, Lume)
5. **Composições híbridas** (Penny+verbo, verbo+Money, etc.)

---

## 9. Confidence scores por seção

| Seção | Confiança | Motivo |
|---|---|---|
| 1. We Are / We Are Not | 🟢 Alta | 7 atributos com evidência direta no MANUAL |
| 2. Voz constante | 🟢 Alta | Padrões consistentes em microcopy + filosofia explícita |
| 2.2 Vocabulário canônico | 🟢 Alta | Glossário do MANUAL + nomenclatura em 26 páginas |
| 2.3 Vocabulário banido | 🟡 Média | Derivado por contraste; precisa validação em uso real |
| 3. Tom por contexto | 🟡 Média | Confiante em microcopy in-app; especulativo em landing/email marketing |
| 4. Regras de escrita | 🟢 Alta | Padrões observáveis no produto |
| 5. Padrões UI | 🟢 Alta | Componentes já existem com esses padrões |
| 6. Lado a lado | 🟡 Média | Exemplos sintéticos; precisa real A/B em alguns casos |
| 7. Multi-perfil | 🟠 Baixa | Funcionalidade ainda não existe — antecipa direção |
| 8. Filtros de naming | 🟢 Alta | Derivado direto da personalidade aprovada |

---

## 10. Open Questions

### Alta prioridade (afeta entregáveis próximos)

1. **Como tratar plural genérico antes do multi-perfil existir?**
   - Hoje o app sempre fala "você" porque é mono-usuário. Mas a landing/email marketing pode falar "vocês"/"a gente" pra mostrar a aspiração de casal/família.
   - **Recomendação**: usar "vocês" e "a gente" em copy de marketing **agora**, mesmo antes da feature existir. Sinaliza ambição e prepara o terreno.
   - **Decisão necessária**: confirma esse rumo, ou prefere ficar no "você" até a feature existir?

2. **Tagline definitiva?**
   - MANUAL.md tem várias formulações fortes da filosofia: "comprometido vs. executado", "antecipa o futuro", "patrimônio vivo".
   - **Recomendação**: testar 3–5 tagline candidatas na Fase 2 (junto com naming).
   - **Decisão**: agora ou depois do naming?

3. **Uso de emojis na comunicação externa (não-UI)?**
   - No app, emojis são funcionais (badges ↔, ⏩, ✓). No MANUAL.md, headers usam emojis 🔐 📒 ✨.
   - Em landing/email/social, ainda é OK?
   - **Recomendação**: emojis sutis e contextuais em email/changelog OK; em landing principal e sites institucionais, evitar.
   - **Decisão**: confirma?

### Média prioridade (afeta evolução)

4. **Tutela de termos PT vs. EN.** "Cashflow" ou "Fluxo de caixa"? "Budget" ou "Orçamento"? Hoje o MANUAL usa PT (Orçamento, Fluxo). Manter assim em toda a marca?
5. **Linguagem em estados de erro graves.** Quando o usuário perde dados / sincronização falha grave / dívida calcula errado, sobe o nível de seriedade?

---

## 11. Como usar este documento

- **Designers de UI**: consulte §4 (regras de escrita), §5 (padrões UI), §6 (exemplos lado a lado).
- **Copy de marketing**: consulte §3 (tom por contexto — linha "Landing page") e §6.4.
- **Suporte**: consulte §3 (linha "Suporte") e §6.1.
- **Engenharia**: consulte §2.2 (vocabulário canônico — `subcategorias`, `pagamentos`, não `transactions`/`bills`).
- **Naming (Fase 2)**: consulte §8.

Para validar qualquer copy contra essas guidelines, use o skill `/brand-voice:enforce-voice` — ele lê este arquivo automaticamente.

---

## 12. Histórico de versões

- **1.0 — 20/05/2026**: versão inicial extraída de `docs/MANUAL.md` (v1.0.5). Aprovação de personalidade: Amigável + Inteligente + Opinativo. Aprovação de público: PF + Casal/Família PT-BR com futuro internacional.
