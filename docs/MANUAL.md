# FinFlow — Manual completo

> Versão deste documento: alinhada com v1.0.5 do app.
> Última atualização: 20/05/2026.

---

## Índice

1. [Sobre o FinFlow](#1-sobre-o-finflow)
2. [Como começar — setup inicial](#2-como-começar--setup-inicial)
3. [Mapa do app](#3-mapa-do-app)
4. [Páginas do app, uma por uma](#4-páginas-do-app-uma-por-uma)
5. [Regras transversais do sistema](#5-regras-transversais-do-sistema)
6. [Como tudo se conecta — fluxos completos](#6-como-tudo-se-conecta--fluxos-completos)
7. [Glossário](#7-glossário)

---

## 1. Sobre o FinFlow

O FinFlow é um app de gestão financeira pessoal multimoeda que organiza dinheiro em três camadas:

1. **Planejamento** — o que você se comprometeu a pagar/receber, mês a mês.
2. **Execução** — o que de fato aconteceu (transações, pagamentos marcados, extrato importado).
3. **Análise** — como os dois bateram, e o que isso diz sobre sua saúde financeira.

A filosofia é "**comprometido vs. executado**". Em vez de cadastrar cada transação solta, você cadastra **compromissos** (aluguel, salário, parcela do carro) e o app gera os **pagamentos** futuros automaticamente. Depois você marca cada pagamento como feito, ou importa o extrato do banco e o app concilia tudo sozinho.

### Por que essa abordagem?

- **Antecipa o futuro**: você vê os próximos 12 meses de saídas e entradas antes deles acontecerem.
- **Orçamento real**: como cada compromisso tem valor e periodicidade, dá pra dizer "cabe no orçamento ou não?".
- **Reconciliação automática**: o extrato do banco bate com seus pagamentos sem trabalho manual.
- **Patrimônio vivo**: contas + investimentos + ativos físicos − dívidas, calculado todo dia com câmbio do dia.

### Stack técnica (resumo)

- **Frontend**: Vanilla JS + Vite (sem framework). Multi-page app: 26 HTMLs, cada um com seu JS em `src/js/pages/`.
- **Backend**: Supabase (PostgreSQL + Auth + Storage).
- **Câmbio**: Frankfurter API (BRL, USD, EUR, GBP), atualizada a cada 5 minutos.
- **Deploy**: Vercel, deploy automático a cada push na `main`.

---

## 2. Como começar — setup inicial

A ordem recomendada para configurar o app do zero:

1. **Criar conta e fazer login** (`/index.html` → `/dashboard`).
2. **Completar o perfil** (`/perfil`) — nome, foto, telefone, endereço.
3. **Configurar o sistema** (`/configuracoes`) — moedas que você usa, tema, frequência de importação default.
4. **Cadastrar contatos** (`/contatos`) — pessoas e empresas com quem você tem relação financeira.
5. **Cadastrar contas bancárias** (`/contas`) — corrente, poupança, cartão de crédito, cofrinho, investimento.
6. **Cadastrar compromissos** (`/compromissos`) — entrada (salário, freelas), saída (aluguel, mercado), transferências, investimentos.
7. **Conferir orçamento** (`/orcamento`) — entrar antes vs. sair antes, mês a mês.
8. **Começar a marcar pagamentos** (`/pagamentos`) ou **importar extrato** (`/transacoes` → aba Importar).

Depois disso é rotina: marcar status, importar extratos, conferir relatórios.

---

## 3. Mapa do app

O FinFlow tem **26 páginas** organizadas em 6 grupos:

### 🔐 Autenticação e perfil
- `index.html` — Login
- `perfil.html` — Dados pessoais
- `configuracoes.html` — Preferências do sistema

### 📒 Cadastros
- `contatos.html` — Pessoas e empresas
- `contas.html` — Contas bancárias e cofrinhos
- `compromissos.html` — Receitas, despesas, transferências recorrentes

### 📅 Planejamento
- `orcamento.html` — Orçamento mensal e 12 meses
- `dividas.html` — Empréstimos a pagar e a receber
- `investimentos.html` — Carteira + projetos de investimento

### ⚡ Execução
- `pagamentos.html` — Marcar pagamentos como feitos
- `transacoes.html` — Histórico real de transações + aba Importar extrato
- `importar.html` — (legado, mesma rota agora vive como aba dentro de transacoes)
- `tarefas.html` — To-dos auto-criados + manuais

### 📊 Análise
- `dashboard.html` — Visão geral do dia
- `relatorios.html` — 23 relatórios (Fluxo, Categorias, Patrimônio etc.)
- `novidades.html` — Changelog visual com badge numérico

### 🛠️ Suporte e admin
- `academia.html` — Documentação interna por tela
- `feedback.html` — Enviar sugestão/bug
- `feedback-publico.html` — Roadmap visível pra todos
- `admin.html` — Painel admin (só admins)
- `admin-usuarios.html` — Gerenciar usuários
- `admin-feedback.html` — Triagem de feedbacks
- `admin-i18n.html` — Tradução de strings
- `desenvolvimento.html` — Tracker interno de tickets

### 📜 Legal
- `termos.html` — Termos de uso
- `privacidade.html` — Política de privacidade

---

## 4. Páginas do app, uma por uma

### 🔐 `/` — Login (`index.html`)

Tela de entrada. Email + senha via Supabase Auth. Tem "esqueci a senha" e link pra criar conta. Após login, redireciona pro `/dashboard`.

**Detalhes**: rodapé customizado com versão do app puxada do `package.json`. Suporta passwordless (magic link) por email.

---

### 👤 `/perfil` — Perfil

Dados pessoais do usuário:
- **Foto** com crop circular (Cropper.js).
- **Nome, sobrenome, apelido**.
- **Telefone** com seletor de país (DDI + bandeira).
- **Endereço estruturado** (CEP → preenche cidade/estado via API de CEP).
- **Email** (read-only, vem do Auth).

Tudo gravado em `profiles` no Supabase. Aceita troca de senha aqui também.

---

### ⚙️ `/configuracoes` — Configurações

Painel de preferências dividido em abas:

- **Aparência** — tema claro/escuro/sistema.
- **Idioma** — pt-BR / en-US.
- **Sistema** — moedas suportadas (BRL, USD, EUR, GBP). Cada moeda estrangeira aparece como card com cotações ao vivo: "1 BRL = X" e "1 X = R$ Y" (Frankfurter API, refresh a cada 5 min).
- **Frequência de importação** — quantos dias entre importações (default: 7). Usado pra criar tarefas automáticas em `/tarefas`.
- **Categorias** — gerenciar a árvore Categoria → Subcategoria (cada subcategoria vira potencial compromisso).
- **Dados** — exportar JSON completo, importar de backup, resetar dados sensíveis.

---

### 🤝 `/contatos` — Contatos

Cadastro de pessoas e empresas. Cada contato tem:
- Tipo: Pessoa Física ou Jurídica.
- Nome / Razão social.
- CPF/CNPJ.
- Telefone, email.
- Endereço estruturado.
- **Vínculos**: lista todos os compromissos, dívidas, projetos e transações onde esse contato aparece.

Usado em compromissos (de quem você recebe, pra quem você paga), em dívidas (credor/devedor) e em projetos.

---

### 🏦 `/contas` — Contas bancárias

Tela mais visual do app. Cards de cada conta com:
- **Avatar do banco** (logo via Brandfetch ou cor + iniciais como fallback).
- **Badge do tipo**: Corrente, Poupança, Cartão de Crédito, Cofrinho, Investimento.
- **Saldo calculado** pelo FinFlow (soma das transações).
- **Saldo do banco** (último snapshot do OFX importado).
- **Indicador de bate/não bate**: verde "✓ Tudo bate" ou amarelo "Diferença: ±R$ X".
- **Indicador de importação atrasada**: se passou da frequência configurada, aparece tarefa "Importar extrato de X".
- **Caixinhas** (sub-saldos): metas dentro da conta, com barra de progresso. Suporta resgate parcial/total.

**Operações na conta**: editar, arquivar, ver histórico de saldos, configurar frequência de importação.

---

### 📋 `/compromissos` — Compromissos

Coração do FinFlow. Lista todos os compromissos agrupados por categoria. Cada compromisso tem:

- **Categoria + Subcategoria** (ex: Custo de Vida → Aluguel).
- **Tipo**: Receita, Despesa, Transferência, Caixinha.
- **Valor + Moeda**.
- **Periodicidade**: única, mensal, trimestral, semestral, anual, customizada.
- **Data de início e fim** (fim = NULL significa "infinito").
- **Conta de origem** (subcategorias.conta_id).
- **Conta de destino** (só para Transferência; outra conta sua).
- **Contato** (opcional).
- **Vínculo** com Dívida, Projeto ou Investimento (auto-vinculação bidirecional).

**Ao criar/editar um compromisso**, o sistema regera os pagamentos futuros automaticamente em `/pagamentos`.

**Status do compromisso**: Ativo ou Arquivado. Arquivado some das listas mas mantém histórico.

---

### 💰 `/orcamento` — Orçamento

Mostra entradas vs. saídas previstas, com 3 abas:

1. **Mensal** — entradas - saídas do mês atual, com indicador "Cabe no orçamento? ✓/✗".
2. **12 meses** — projeção dos próximos 12 meses, em grid.
3. **Meses passados** — execução real dos meses anteriores (previsto vs. realizado).

Cada linha é uma subcategoria. Somatórias automáticas por categoria e total.

---

### 💸 `/dividas` — Dívidas

Cadastro de empréstimos. Cada dívida tem:
- **Tipo**: a pagar (você deve) ou a receber (te devem).
- **Credor/Devedor** (contato).
- **Valor original + saldo atual**.
- **Taxa de juros** (com modo SAC, Price ou Customizado).
- **Parcelas**: quantidade, valor, primeira data, última data (auto-calculada).
- **Histórico de pagamentos** — card grande com timeline.
- **Simulador**: o que acontece se aumentar a parcela, antecipar, refinanciar.
- **Exportar PDF** com cronograma completo.

Ao criar uma dívida, o app **automaticamente cria um compromisso vinculado** com a parcela mensal. O compromisso aparece em `/pagamentos` e em `/orcamento`.

**KPIs em cima**: total a pagar, total a receber, taxa efetiva média. Tudo com câmbio do dia se houver dívidas em moeda estrangeira.

---

### 📈 `/investimentos` — Investimentos

Duas seções:

1. **Carteira** — lista de investimentos ativos (CDB, ações, cripto, FIIs, fundos). Cada um tem valor aplicado, saldo atual, rentabilidade.
2. **Projetos** — projetos de investimento futuros (ex: "comprar apartamento até 2028"). Cada projeto tem meta, prazo, aporte mensal e compromisso vinculado em `/compromissos`.

**Simulador**:
- Modo "Saldo final": dado aporte + tempo + taxa, quanto você terá no final.
- Modo "Aporte mensal": dada meta + tempo + taxa, quanto precisa aportar por mês.
- Modo "Tempo necessário": dada meta + aporte + taxa, em quantos meses chega.
- Campo "ou data alvo" reverte o cálculo (descobre a taxa necessária).

---

### ✅ `/pagamentos` — Pagamentos

Onde a execução acontece. Lista os pagamentos do mês com:

- **Status** (dropdown): A Pagar, Agendado, Pago, Cartão, Transferido, Cancelado.
- **Conta** (com avatar + nome). Se a conta efetiva ≠ conta do compromisso, aparece ícone ↔.
- **Data de vencimento + dias até** ("15d atr.", "3d falta").
- **Valor previsto + valor real** (campos editáveis).
- **Indicador de adiantamento** (badge ⏩ para receitas com adiantamento ativo).

**Dois modos de visualização**:
- **Blocos** — agrupado por categoria, mês atual.
- **Próximos** (lista plana) — todos os próximos pagamentos em ordem cronológica.

**Quando você muda o status pra Pago/Cartão/Transferido**:
1. Aparece popover "Quando foi pago?" com data + seletor "Saiu de qual conta?".
2. Se trocou a conta, sistema pergunta "aplicar à recorrência?" com avatar do banco + Sim verde / Não vermelho.
3. Se Sim, atualiza `subcategorias.conta_id` (próximos pagamentos saem dessa conta por padrão).
4. Cria/atualiza a transação correspondente em `/transacoes`.

**Quando você reverte** (Pago → A Pagar): a transação correspondente é deletada e `conta_id_efetiva` é limpa.

---

### 📜 `/transacoes` — Transações

Histórico real de transações, com duas abas:

1. **Lista** — todas as transações: data, descrição, conta, categoria, valor, status de reconciliação (importado/manual/reconciliado).
2. **Importar** — upload de extrato (CSV, OFX). Mostra preview com badges:
   - "✓ Match automático" — já bate com pagamento existente.
   - "🔄 Realocar de [Conta X]" — pagamento já marcado em outra conta, vai realocar.
   - "Nova transação" — não bate, vai criar do zero.
   
   Você marca os checkboxes do que quer importar e confirma. O sistema:
   - Cria as transações.
   - Marca pagamentos como Pago/Cartão.
   - Salva snapshot do saldo final (`LEDGERBAL` do OFX).
   - Realoca pagamentos cross-conta (seta `conta_id_efetiva` + deleta fantasma).

**KPI no topo da lista**: saldo total, total de entradas/saídas do período. Filtros: período, conta, categoria, status, valor.

---

### 📝 `/tarefas` — Tarefas

To-do list do FinFlow. Tarefas vêm de duas fontes:

1. **Auto-criadas pelo sistema**:
   - "Importar extrato de [Conta X]" — quando passou da frequência configurada.
   - "Reconciliar transações importadas" — quando há importações pendentes.
   - "Atualizar saldo de [Conta]" — quando o snapshot tá muito velho.
2. **Manuais** — você adiciona qualquer tarefa avulsa.

Cada tarefa tem: título, descrição opcional, conta vinculada opcional, status (aberta/concluída).

**Auto-complete**: quando você executa a ação relacionada (importar, reconciliar), a tarefa fecha sozinha.

Tem um **drawer flutuante** acessível de qualquer página com a lista resumida + contador.

---

### 🏠 `/dashboard` — Dashboard

Visão geral do dia:

- **Saldo total** (todas as contas, na moeda base) + variação no mês.
- **Próximos pagamentos** (5 mais próximos).
- **Tarefas pendentes** (top 3).
- **Snapshot do patrimônio**: ativos − passivos.
- **Mini-gráfico** de fluxo dos últimos 30 dias.

É a tela inicial após login.

---

### 📊 `/relatorios` — Relatórios

23 relatórios organizados em 10 abas:

1. **Fluxo** — entradas vs. saídas por período.
2. **Previsto vs. Real** — variância entre compromisso e execução.
3. **Categorias** — gastos por categoria, treemap, top 10.
4. **Compromissos** (5 sub-abas) — análise por compromisso, recorrência, atrasados, próximos, arquivados.
5. **Contas & Saldos** (3) — evolução de saldo, comparativo, reconciliação.
6. **Dívidas** (4) — total a pagar/receber, evolução, taxa efetiva, projeção.
7. **Investimentos** (3) — carteira, rentabilidade, alocação.
8. **Saúde Financeira** (3) — taxa de poupança, emergência (X meses cobertos), endividamento.
9. **Patrimônio** (3) — visão geral (ativos vs. passivos), composição (donut), evolução (line chart calculado on-the-fly).
10. **Fiscal** — base pra declaração de IR (em construção).

Todos exportáveis em PDF com layout consistente.

---

### 📰 `/novidades` — Novidades

Changelog visual. Cada release vira um card com título, data, lista de mudanças coloridas por tipo (✨ novo, 🔧 fix, 📈 melhoria). Badge numérico na sidebar mostra quantos updates você ainda não viu (rastreado por ID em localStorage).

---

### 🎓 `/academia` — Academia FinFlow

Documentação interna do app, organizada por tela. Base para tutoriais em vídeo.

---

### 💬 `/feedback` e `/feedback-publico` — Feedback

- `/feedback` — formulário pra enviar bug ou sugestão. Categoria, descrição, screenshot opcional.
- `/feedback-publico` — roadmap visível: lista de feedbacks aprovados, com fase (Backlog, Em análise, Em desenvolvimento, Lançado).

---

### 👮 `/admin*` e `/desenvolvimento` — Admin (só admins)

- `admin.html` — hub admin.
- `admin-usuarios.html` — listagem + ban/unban + reset de senha.
- `admin-feedback.html` — triagem dos feedbacks recebidos.
- `admin-i18n.html` — edição de strings de tradução in-app.
- `desenvolvimento.html` — tracker interno de tickets do projeto (com fases e label).

---

### 📜 `/termos` e `/privacidade` — Legal

Páginas estáticas com termos de uso e política de privacidade.

---

## 5. Regras transversais do sistema

Estas são as regras que valem em várias páginas ao mesmo tempo. Entender essas regras é a chave pra entender o FinFlow.

### 5.1. Compromisso → Pagamento (regra de ouro)

Quando você cria um **compromisso recorrente**, o sistema gera automaticamente os **pagamentos futuros** correspondentes em `/pagamentos`. Regras:

- Cada pagamento vai herdar conta, valor, contato e moeda do compromisso.
- Se você editar o compromisso (mudar valor, mudar conta, mudar data), os pagamentos **futuros não-pagos** são regerados.
- Pagamentos **já marcados como Pago/Cartão/Transferido** ficam intocados (audit trail).
- Cancelar um compromisso arquiva ele e cancela os pagamentos futuros não-pagos.

### 5.2. Status unificado dos pagamentos

Todo pagamento tem um dos 6 status:

| Status | Significado | Cor |
|---|---|---|
| **A Pagar** | Padrão. Ainda não chegou a hora ou não foi marcado. | Cinza |
| **Agendado** | Marcado pra pagar automaticamente no banco. | Azul |
| **Pago** | Já saiu do caixa. Gera transação. | Verde |
| **Cartão** | Pago via cartão de crédito (ainda não saiu do caixa, mas vai na fatura). | Roxo |
| **Transferido** | É uma transferência entre contas suas. Gera par de transações. | Amarelo |
| **Cancelado** | Não vai acontecer. | Vermelho |

**Pago, Cartão e Transferido** são considerados "status efetivados" — qualquer um deles dispara a criação de transações.

### 5.3. Conta efetiva ≠ conta configurada (`conta_id_efetiva`)

Cenário: você cadastrou o compromisso "Aluguel" pra sair do Itaú, mas no dia pagou pelo Nubank.

- O FinFlow guarda `pagamentos.conta_id_efetiva = nubank_id` (NULL = usa o default da subcategoria).
- A transação gerada usa a conta efetiva, não a configurada.
- Aparece ícone ↔ em `/pagamentos` indicando o desvio.
- Sistema oferece atualizar o compromisso ("próximos pagamentos saem do Nubank?").
- Se reverter o status (Pago → A Pagar), `conta_id_efetiva` é limpa.

### 5.4. Sincronização Pagamento ↔ Transação

Toda vez que um pagamento vai pra status "efetivado", uma transação é criada em `/transacoes`. Vice-versa:

- Pagamento → transação: criada com tipo Receita/Despesa/Transferência, ligada via `transacoes.pagamento_id`.
- Reverter status: transação é deletada (cuidado: se for transferência, deleta o par).
- Importação de extrato pode **vincular** uma transação importada a um pagamento existente (faz o match).
- Se um pagamento tá vinculado a uma transação importada do banco, o status fica **travado** (não dá pra mudar pela página de Pagamentos — precisa desvincular em Transações primeiro).

### 5.5. Adiantamento de Receita

Cenário: você vai receber salário dia 5, mas o cliente já adiantou dia 28 do mês anterior.

- Em `/compromissos`, no compromisso de Receita, tem botão "Registrar adiantamento".
- Abre modal: valor, data, conta de destino.
- Sistema cria o lançamento na tabela `adiantamentos_receita` e aparece badge ⏩ no pagamento futuro.
- Quando o pagamento real chegar, o sistema deduz o adiantamento.

### 5.6. Reconciliação bancária (snapshots OFX)

Quando você importa um extrato OFX, o app captura o `LEDGERBAL` (saldo final informado pelo banco) e salva em `saldos_bancarios`. Isso vira:

- **Cards de saldo em `/contas`**: comparam saldo calculado (soma de transações) vs. saldo informado pelo banco. Diferença vira alerta.
- **Frequência de importação**: se passou X dias desde o último OFX, vira tarefa em `/tarefas`.

### 5.7. Match cross-conta na importação

Cenário avançado: você marcou um pagamento como "Pago" pela conta Itaú (por engano), mas na real ele saiu do Nubank. Aí você importa o OFX do Nubank.

- O sistema detecta: existe pagamento já marcado em OUTRA conta com valor exato + data ±3 dias.
- Mostra badge "🔄 Realocar de Itaú" no preview da importação.
- Se você confirmar:
  1. Vincula a transação importada ao pagamento.
  2. Seta `conta_id_efetiva = nubank_id`.
  3. **Deleta** a transação fantasma que estava no Itaú.

### 5.8. Caixa Livre alocável

Receita não-comprometida (renda extra, freela inesperado, sobra) entra no **Caixa Livre** da conta. Aparece em `/contas` como linha separada no card.

- Pode ser alocada manualmente: "mover R$ 500 do Caixa Livre pra Caixinha de Emergência".
- Faz **carry-forward**: sobra do mês passa pro mês seguinte automaticamente.

### 5.9. Caixinhas (sub-saldos)

Dentro de uma conta, você cria caixinhas (sub-objetivos):

- Cada caixinha tem nome, meta, saldo atual, cor.
- Soma das caixinhas + Caixa Livre = saldo total da conta.
- Aportes mensais via compromisso do tipo "Caixinha".
- Resgate: total (zera + arquiva) ou parcial (devolve ao Caixa Livre).

### 5.10. Tarefas automáticas

O sistema gera tarefas sozinho em alguns gatilhos:

| Gatilho | Tarefa criada |
|---|---|
| Frequência de importação vencida | "Importar extrato de [Conta]" |
| Transação importada não-reconciliada > 3 dias | "Reconciliar X transações" |
| Snapshot de saldo vencido | "Atualizar saldo de [Conta]" |

Quando a ação correspondente é executada, a tarefa **auto-completa**.

### 5.11. Câmbio multimoeda

- 4 moedas suportadas: BRL, USD, EUR, GBP.
- Cotação ao vivo via Frankfurter, refresh a cada 5 min, cache em localStorage.
- Cada compromisso/transação/investimento tem `moeda` própria.
- Conversões: feitas no momento da exibição (KPIs, somatórias) usando câmbio do dia.
- Em relatórios, cotação histórica do dia da transação (não a atual).

### 5.12. Dívidas e Projetos como fonte da verdade

Dívidas e Projetos de Investimento **criam e gerenciam compromissos automaticamente**:

- Criar uma dívida cria 1 compromisso (parcela mensal).
- Editar a dívida (mudar valor, taxa, parcelas) **regera** o compromisso.
- Arquivar a dívida arquiva o compromisso.
- Compromissos vinculados a dívidas/projetos não podem ser editados diretamente (têm que ir pela origem).

### 5.13. Auto-vinculação bidirecional

Quando você liga um compromisso a uma dívida (ou projeto), o vínculo é bidirecional:

- O compromisso mostra "Vinculado à dívida X" + botão pra abrir.
- A dívida mostra "Compromisso Y" nos vínculos.
- Excluir um lado oferece desfazer o vínculo do outro.

### 5.14. Patrimônio

Cálculo:

```
Patrimônio = Σ(saldo das contas)
           + Σ(saldo dos investimentos)
           + Σ(ativos físicos cadastrados em ativos_patrimonio)
           − Σ(saldo das dívidas a pagar)
           + Σ(saldo das dívidas a receber)
```

Tudo convertido pra moeda base (BRL por default) com câmbio do dia. Aparece em `/dashboard` (snapshot) e `/relatorios` aba Patrimônio (evolução histórica).

---

## 6. Como tudo se conecta — fluxos completos

### 6.1. Fluxo "Receber salário"

1. **Cadastro** (uma vez): em `/compromissos` cria um compromisso do tipo Receita, subcategoria "Salário", recorrência mensal, dia 5, valor R$ X, conta destino Itaú Corrente.
2. **Aparece** em `/orcamento` (entradas de cada mês) e em `/pagamentos` (próximos pagamentos).
3. **No dia 5**, você marca como Pago em `/pagamentos`. Popover confirma data. Se foi pra outra conta, seleciona.
4. **Sistema cria** uma transação tipo Receita em `/transacoes`, vinculada ao pagamento.
5. **Saldo do Itaú aumenta** em `/contas`.
6. **Se houve adiantamento** (botão "Registrar adiantamento" antes), sistema deduz e mostra valor líquido.
7. **Em `/relatorios`** entra na aba Fluxo (entrada do mês) e Saúde Financeira (taxa de poupança).

### 6.2. Fluxo "Pagar conta de luz"

1. **Cadastro**: compromisso de Despesa, subcategoria "Energia", recorrência mensal, dia 15, valor R$ Y, conta Nubank.
2. **No dia 15**, marca como Pago. Popover confirma. Se pagou pelo Itaú em vez do Nubank, seleciona Itaú. Sistema pergunta "atualizar recorrência?".
3. **Se sim**: `subcategorias.conta_id = itau_id`. Próximos vão sair do Itaú.
4. **Se não**: só esse pagamento fica com `conta_id_efetiva = itau_id`, badge ↔ aparece. Próximos voltam pro Nubank.
5. **Transação criada** em `/transacoes`, débito no Itaú.

### 6.3. Fluxo "Importar OFX do banco"

1. Em `/transacoes` → aba Importar, upload do arquivo.
2. Sistema parseia, mostra preview de cada linha com badge:
   - ✓ Match automático com pagamento existente.
   - 🔄 Realocar de outra conta.
   - Nova transação (sem match).
3. Você confirma marcando checkboxes.
4. Sistema:
   - Cria transações com `reconciliacao_status = importado` ou `reconciliado`.
   - Vincula a pagamentos (`pagamento_id`).
   - Marca pagamentos como Pago.
   - Salva `LEDGERBAL` em `saldos_bancarios`.
   - Realoca cross-conta (deleta fantasmas).
   - Fecha tarefa "Importar extrato" se existia.
5. **Em `/contas`**: card da conta atualiza com novo saldo e indicador de "bate/não bate".
6. **Em `/tarefas`**: se há transações não-reconciliadas (sem match nenhum), pode criar tarefa "Reconciliar X transações".

### 6.4. Fluxo "Cadastrar uma dívida nova"

1. Em `/dividas`, botão "Nova dívida". Modal pede credor (contato), valor, taxa, número de parcelas, primeira data.
2. Sistema calcula cronograma (SAC/Price) e cria a dívida.
3. **Cria automaticamente um compromisso** de Despesa em `/compromissos`, subcategoria "Empréstimos", periodicidade mensal, com valor da parcela.
4. Compromisso gera pagamentos futuros em `/pagamentos`.
5. Cada parcela marcada como Paga atualiza o saldo da dívida.
6. `/dividas` mostra a dívida com card "Histórico de pagamentos" e barra de progresso.

### 6.5. Fluxo "Configurar projeto de investimento"

1. Em `/investimentos` → aba Projetos → Novo. Define meta (ex: R$ 100k), prazo (ex: 3 anos), taxa esperada.
2. Simulador calcula aporte mensal necessário.
3. Sistema cria compromisso do tipo Investimento, periodicidade mensal, conta de destino = a conta de investimento.
4. Conforme você marca os aportes mensais como Pagos, transação é criada (transferência da conta corrente pra conta de investimento).
5. `/relatorios` aba Investimentos rastreia o progresso.

### 6.6. Fluxo "Conferir saúde financeira"

1. `/dashboard` mostra snapshot do dia (patrimônio + próximos + tarefas).
2. `/relatorios` → aba Saúde Financeira:
   - Taxa de poupança = (Receita − Despesa) / Receita.
   - Reserva de emergência = saldo livre / despesa média mensal.
   - Endividamento = total a pagar / patrimônio.
3. Aba Patrimônio mostra evolução histórica.
4. Tudo exportável em PDF.

---

## 7. Glossário

- **Compromisso** — promessa de receita/despesa/transferência recorrente. Gera pagamentos automaticamente.
- **Pagamento** — ocorrência específica de um compromisso (ex: aluguel de maio/2026). Tem status, data, valor.
- **Transação** — registro real do dinheiro entrando/saindo de uma conta. Vinculada a um pagamento ou avulsa.
- **Subcategoria** — folha da árvore de categorias. Cada compromisso pertence a uma subcategoria.
- **Caixinha** — sub-saldo dentro de uma conta, com meta. Equivale a "envelope" em outros apps.
- **Caixa Livre** — saldo não-alocado em caixinhas. Pode ser movido manualmente.
- **Snapshot de saldo** — saldo final informado pelo banco no OFX (`LEDGERBAL`). Usado pra conciliar.
- **Conta efetiva** — conta de onde o pagamento de fato saiu, quando difere da configurada no compromisso.
- **Match cross-conta** — quando o sistema detecta na importação que um pagamento marcado em uma conta na verdade saiu de outra.
- **Frequência de importação** — quantos dias o usuário se compromete a importar o extrato. Default 7.
- **Adiantamento de receita** — receita recebida antes do previsto, registrada separadamente.
- **Reconciliação** — processo de bater transações importadas com pagamentos planejados.
- **Patrimônio líquido** — soma de ativos (contas + investimentos + bens) menos passivos (dívidas).
- **Status efetivado** — status que dispara criação de transação: Pago, Cartão, Transferido.

---

## Como manter este documento atualizado

Toda vez que uma nova feature é lançada, atualize:

1. A seção da **página afetada** (se mudou comportamento).
2. A **regra transversal** correspondente (se mudou regra de negócio).
3. O **fluxo** correspondente (se mudou jornada).
4. O **glossário** (se introduziu termo novo).

Releases grandes (muda regra de negócio) merecem update aqui. Releases pequenas (fix, cleanup) só no changelog.
