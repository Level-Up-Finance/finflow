# Visual Identity Guidelines — FinFlow

> Versão deste documento: 1.0
> Data: 21/05/2026
> Fonte primária: `src/css/variables.css`, `src/css/global.css`, `src/css/layout.css`
> Alinhado com: `docs/BRAND.md` (identidade verbal) e v1.0.5 do produto.
> **Sem logo ainda** — esse capítulo entra na Fase 3.5 quando o nome for definido.

---

## Índice

1. Princípios visuais
2. Sistema de cores
3. Tipografia
4. Espaçamento
5. Border radius e curvas
6. Sombras e profundidade
7. Tema claro vs. escuro
8. Status de pagamento (sistema especializado)
9. Gradientes
10. Estados de interação (focus, hover, disabled)
11. Iconografia
12. Tom visual / mood
13. Acessibilidade
14. Tokens — como usar
15. Aplicação ao multi-perfil (futuro)

---

## 1. Princípios visuais

Cinco princípios que orientam toda decisão visual. Derivados da personalidade aprovada em `BRAND.md` (Amigável + Inteligente + Opinativo) e do que já existe no código.

### 1.1. Moderno premium (não bancário-formal, não infantil)

O FinFlow está no território **Notion + Mercury + Linear** — premium tech, não fintech tradicional. Visual sóbrio com toques de personalidade.

Tradução prática:
- Cores: roxo profundo + azul vivo, neutros generosos. **Sem** dourado (vira premium velho), **sem** verde-floresta (vira app de eco), **sem** vermelho-Coca (vira corporate).
- Tipografia: sans-serif geometric (Manrope + Inter), pesos médio-bold pra hierarquia, sem serifa antiquada.
- Curvas: medias a generosas (12px–28px). Nada de 2px ou 4px (severo demais) nem 50%+ (infantil).

### 1.2. Densidade alta, mas respirável

Finanças têm muitos números, muitas tabelas. Não dá pra escapar de densidade. O truque é **respiro estratégico**: margens generosas entre seções, mas dentro da seção pode ser denso.

### 1.3. Cores funcionais > cores decorativas

Toda cor tem trabalho. Roxo = ação primária. Verde = sucesso/recebido. Vermelho = erro/atrasado. Amarelo = atenção/agendado. Nenhuma cor é "só pra ficar bonito".

### 1.4. Números são primeiro-cidadãos

Números monetários e datas merecem tratamento tipográfico especial. Tabular-nums (largura consistente), peso semibold pra valores importantes, alinhamento à direita em colunas.

### 1.5. Dark mode é first-class, não afterthought

O app foi desenhado pra funcionar em ambos os temas com qualidade equivalente. Não é "dark mode adaptado" — é "dark mode pensado".

---

## 2. Sistema de cores

### 2.1. Primárias (a cor da marca)

| Token | Hex | Uso |
|-------|-----|-----|
| `--color-primary` | `#6D5EF5` | **Roxo principal**. Botões primários, links de destaque, ações importantes, focus ring |
| `--color-primary-dark` | `#4B3FD6` | Hover de botão primário, gradient escuro |
| `--color-primary-light` | `#8B7FF7` | Estados ativos sutis, badges premium |
| `--color-primary-50` | `#F1EFFE` | Background de seleção, hover muito sutil |
| `--color-primary-100` | `#E5E1FD` | Background de elemento "selecionado" |

**Quando usar primário:**
- ✅ CTA principal da tela ("Marcar como pago", "Salvar")
- ✅ Link mais importante (logo, menu ativo)
- ✅ Focus ring (acessibilidade)
- ✅ Gradient de hero/destaque
- ❌ Estados de erro (use danger)
- ❌ Mais que 1 CTA primário por tela

### 2.2. Secundárias (ação secundária)

| Token | Hex | Uso |
|-------|-----|-----|
| `--color-secondary` | `#3B82F6` | **Azul**. Links inline, botões secundários, navegação |
| `--color-secondary-dark` | `#2563EB` | Hover de links, ações azuis |
| `--color-secondary-light` | `#93C5FD` | Estados sutis |
| `--color-secondary-50` | `#EFF6FF` | Background de informação |

### 2.3. Neutros (texto e superfícies)

| Token | Hex (light) | Uso |
|-------|------------|-----|
| `--color-text-main` | `#1F2937` | Texto principal, títulos |
| `--color-text-secondary` | `#6B7280` | Texto secundário, labels |
| `--color-text-muted` | `#9CA3AF` | Hints, placeholders, info menor |
| `--color-border` | `#E5E7EB` | Bordas padrão (cards, inputs) |
| `--color-border-strong` | `#D1D5DB` | Bordas com mais contraste |
| `--color-background` | `#F8FAFC` | Fundo da página (off-white) |
| `--color-surface` | `#FFFFFF` | Cards, modais, áreas elevadas |
| `--color-surface-alt` | `#F9FAFB` | Áreas sutilmente diferenciadas |

### 2.4. Sidebar (sempre escuro)

A sidebar **mantém tema escuro mesmo no light mode** — decisão deliberada que dá personalidade ao app.

| Token | Hex (light) | Hex (dark) |
|-------|-------------|------------|
| `--color-sidebar-bg` | `#1F2937` | `#0B1220` |
| `--color-sidebar-text` | `#D1D5DB` | `#94A3B8` |
| `--color-sidebar-text-active` | `#FFFFFF` | `#F1F5F9` |
| `--color-sidebar-border` | `#374151` | `#1E293B` |

### 2.5. Semânticas (sucesso, erro, atenção, info)

| Conceito | Token text | Hex | Token bg | Hex |
|----------|-----------|-----|----------|-----|
| **Sucesso** (pago, recebido, OK) | `--color-success` | `#10B981` | `--color-success-bg` | `#D1FAE5` |
| **Atenção** (agendado, atrasado leve) | `--color-warning` | `#F59E0B` | `--color-warning-bg` | `#FEF3C7` |
| **Erro** (falha, atrasado crítico, excluir) | `--color-danger` | `#EF4444` | `--color-danger-bg` | `#FEE2E2` |
| **Info** (neutro, dica, link) | `--color-info` | `#3B82F6` | `--color-info-bg` | `#DBEAFE` |

**Regra anti-confusão**:
- Verde = saída boa (recebimento, pagamento concluído, tarefa fechada).
- Vermelho = saída ruim (erro do sistema, exclusão destrutiva, dado faltando).
- **Nunca use** vermelho pra "despesa" só por ser saída. Despesa pode ser bem-sucedida.

### 2.6. Paleta visualizada

```
🟣 #6D5EF5  Primary (roxo)
🟪 #4B3FD6  Primary dark
🔵 #3B82F6  Secondary (azul)
🔷 #2563EB  Secondary dark
⚫ #1F2937  Text main / Sidebar bg
⚪ #FFFFFF  Surface
🟢 #10B981  Success
🟡 #F59E0B  Warning
🔴 #EF4444  Danger
```

---

## 3. Tipografia

### 3.1. Famílias

| Token | Família | Uso |
|-------|---------|-----|
| `--font-display` | **Manrope**, system fallback | Títulos (h1–h6), elementos de hierarquia, números grandes em destaque |
| `--font-body` | **Inter**, system fallback | Tudo mais — body, labels, inputs, tabelas |

**Por que duas fontes?**

- **Manrope** é geometric/humanist — boa pra títulos, números grandes (KPIs do dashboard) e display. Tem personalidade discreta sem chamar atenção.
- **Inter** é otimizada pra UI — corpo de texto, tabelas, formulários. Excelente leitura em qualquer tamanho.

Ambas são Google Fonts gratuitas. Carregadas no `<head>` do HTML.

### 3.2. Escala de tamanhos

| Token | Valor | px | Uso |
|-------|-------|----|----|
| `--fs-xs` | 0.75rem | 12 | Badges, labels minúsculos, hints |
| `--fs-sm` | 0.875rem | 14 | Texto secundário, dados de tabela |
| `--fs-base` | 1rem | 16 | **Body padrão** (nunca menor) |
| `--fs-md` | 1.125rem | 18 | Texto destacado em cards |
| `--fs-lg` | 1.25rem | 20 | h4 |
| `--fs-xl` | 1.5rem | 24 | h3 |
| `--fs-2xl` | 1.875rem | 30 | h2, KPI principal |
| `--fs-3xl` | 2.25rem | 36 | h1, hero de landing |

**Regra**: nunca abaixo de 12px. Mobile precisa 16px+ no body pra evitar zoom automático no iOS.

### 3.3. Pesos

| Token | Valor | Uso |
|-------|-------|-----|
| `--fw-normal` | 400 | Body padrão |
| `--fw-medium` | 500 | Botões, labels |
| `--fw-semibold` | 600 | Valores monetários importantes, dados destacados |
| `--fw-bold` | 700 | **Títulos (h1–h6)**, alertas críticos |
| `--fw-extrabold` | 800 | Display gigante, números do dashboard |

### 3.4. Tabular nums — feature crítica pra finanças

Use a classe `.tabular` (ou `font-variant-numeric: tabular-nums`) em **toda coluna de valores monetários**:

```css
.tabular { font-variant-numeric: tabular-nums; }
```

Sem isso, "1.234,56" e "9.999,99" não alinham na vertical (porque 1 é mais estreito que 9). Com tabular-nums, todos os dígitos ocupam a mesma largura. **Essencial pra tabelas financeiras.**

### 3.5. Hierarquia padrão

| Elemento | Tag | Font-size | Weight | Cor |
|----------|-----|-----------|--------|-----|
| Hero principal | h1 | 36px | 700 | text-main |
| Página | h2 | 30px | 700 | text-main |
| Seção | h3 | 24px | 700 | text-main |
| Sub-seção | h4 | 20px | 700 | text-main |
| Card title | h5 | 18px | 700 | text-main |
| Label form | — | 14px | 500 | text-secondary |
| Body | p | 16px | 400 | text-main |
| Tabela cell | td | 14px | 400 | text-main |
| Valor monetário | — | 16px | 600 | text-main + tabular |
| Hint/help | small | 12px | 400 | text-muted |

### 3.6. Line height

- Headings: 1.2 (apertado, dramático)
- Body: 1.5 (padrão browser, confortável)
- Parágrafos longos: 1.6 (respiro extra)

---

## 4. Espaçamento

Grid de **4px** (escala 0.25rem base).

| Token | Valor | px | Uso típico |
|-------|-------|----|------------|
| `--space-1` | 0.25rem | 4 | Padding super-apertado, gap mínimo |
| `--space-2` | 0.5rem | 8 | Padding de badge, gap pequeno |
| `--space-3` | 0.75rem | 12 | Padding de botão, item de lista |
| `--space-4` | 1rem | 16 | **Padding padrão**, margem entre elementos |
| `--space-5` | 1.25rem | 20 | Padding de card médio |
| `--space-6` | 1.5rem | 24 | Margem entre seções |
| `--space-8` | 2rem | 32 | Margem entre grupos |
| `--space-10` | 2.5rem | 40 | Margem grande |
| `--space-12` | 3rem | 48 | Topo/base de hero |
| `--space-16` | 4rem | 64 | Hero generoso |

**Regra**: prefira a escala. Não invente `padding: 17px`. Se 16px é apertado, use 20px. Manter os tokens evita drift visual ao longo do tempo.

---

## 5. Border radius e curvas

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-sm` | 6px | Inputs, badges, ícones pequenos |
| `--radius-md` | 12px | **Botões, cards padrão** (curva preferida) |
| `--radius-lg` | 20px | Cards grandes (KPI, hero) |
| `--radius-xl` | 28px | Hero, modal de destaque |
| `--radius-full` | 9999px | Avatares, pílulas, scrollbar thumb |

**Princípio**: curvas são **médias a generosas**. Nunca quadrado (severo demais), nunca radius enorme em elementos não circulares (infantil).

---

## 6. Sombras e profundidade

Sistema de elevação em 6 níveis.

| Token | Quando usar |
|-------|------------|
| `--shadow-sm` | Bordas sutis (não usa muito) |
| `--shadow-card` | **Cards padrão** — sombra com toque roxo (assinatura visual) |
| `--shadow-md` | Cards em hover |
| `--shadow-lg` | Dropdowns, popovers |
| `--shadow-xl` | Elementos flutuantes (drawer, sidebar overlay) |
| `--shadow-modal` | Modais grandes |

### Detalhe importante: shadow-card tem cor

```css
--shadow-card: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(109,94,245,0.06);
```

A segunda camada de sombra usa **roxo translúcido**, não cinza. Isso dá uma assinatura sutil — cards ganham aura roxa muito leve, conectando com a cor primária. **Não usar shadow-md em cards** — só em hover.

---

## 7. Tema claro vs. escuro

### 7.1. Filosofia

Os dois temas são tratados como **first-class** — não é "dark mode bolt-on". Ambos têm:
- Hierarquia visual equivalente
- Contraste WCAG AA
- Cores semânticas adaptadas (success-bg verde-claro vs verde-escuro)
- Sombras ajustadas pra cada tema

### 7.2. Como ativar

```js
document.documentElement.setAttribute('data-theme', 'dark');
// ou 'light'
```

Persistido em `localStorage` via `lib/theme.js`. Detecta preferência do sistema na primeira visita.

### 7.3. Sidebar

A sidebar mantém escura em ambos os modos. Isso dá personalidade ao app e cria **enquadramento visual** consistente. No dark mode ela fica ainda mais escura (`#0B1220` vs `#1F2937`).

### 7.4. Pares de cores

Sempre que define cor, considere os dois temas. Ex:
- `--color-success-bg`: verde claro (light) vs verde escuro (dark)
- `--color-text-main`: cinza-quase-preto (light) vs cinza-quase-branco (dark)

Veja `variables.css` linhas 138–195 pro pacote dark completo.

---

## 8. Status de pagamento (sistema especializado)

O FinFlow tem **7 status de pagamento**, cada um com par bg+text dedicado. Sistema único do domínio.

| Status | bg light | text light | bg dark | text dark | Quando |
|--------|---------|-----------|---------|-----------|--------|
| **Pago** | `#D1FAE5` | `#065F46` | `#064E3B` | `#6EE7B7` | Pagamento concluído |
| **Transferido** | `#DBEAFE` | `#1E40AF` | `#1E3A8A` | `#93C5FD` | Transferência entre contas |
| **Agendado** | `#FEF3C7` | `#92400E` | `#78350F` | `#FCD34D` | Pagamento agendado no banco |
| **Cancelado** | `#F3F4F6` | `#4B5563` | `#1F2937` | `#9CA3AF` | Pagamento cancelado |
| **A Transferir** | `#E0F2FE` | `#0369A1` | `#0C4A6E` | `#7DD3FC` | Transferência pendente |
| **Cartão** | `#EDE9FE` | `#5B21B6` | `#4C1D95` | `#C4B5FD` | Pago via cartão de crédito |
| **Parcial** | `#FFEDD5` | `#9A3412` | `#7C2D12` | `#FDBA74` | Pagamento parcial |

**Princípio**: cada status tem uma "vibe" cromática:
- 🟢 Pago = verde (sucesso, concluído)
- 🔵 Transferido = azul (movimento, fluxo)
- 🟡 Agendado = amarelo (atenção, em espera)
- ⚪ Cancelado = cinza (neutralizado)
- 🟪 Cartão = roxo (premium, virtual)
- 🟠 Parcial = laranja (atenção média)

A consistência dessas associações é o que faz o usuário **ler a tabela de pagamentos rapidamente** sem precisar interpretar texto.

---

## 9. Gradientes

Três gradientes oficiais.

```css
--gradient-primary: linear-gradient(135deg, #6D5EF5 0%, #3B82F6 100%);
--gradient-primary-soft: linear-gradient(135deg, rgba(109,94,245,0.08) 0%, rgba(59,130,246,0.08) 100%);
--gradient-hero: linear-gradient(135deg, #6D5EF5 0%, #4B3FD6 50%, #3B82F6 100%);
```

**Quando usar:**
- `--gradient-primary`: botões hero, CTAs muito grandes, ilustrações de destaque. **Não usar em texto** (perde legibilidade).
- `--gradient-primary-soft`: backgrounds sutis de card de destaque. Ex: card de KPI mais importante.
- `--gradient-hero`: landing pages, telas de boas-vindas, splash screens.

**Não inventar gradientes novos.** Manter consistência.

---

## 10. Estados de interação

### 10.1. Focus (acessibilidade-crítico)

```css
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

**Importante**: usa `:focus-visible` (não `:focus`). Isso mostra o ring **apenas quando o usuário navega por teclado**, não quando clica com mouse. Comportamento moderno padrão.

### 10.2. Hover

- Botões: escurecem o fundo levemente
- Cards: ganham `shadow-md` (sutil aumento de elevação)
- Links: mudam pra `secondary-dark`
- Linhas de tabela: ganham `surface-alt`
- Transição: `--transition-fast` (150ms)

### 10.3. Disabled

```css
button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
```

Padrão: opacity 0.6 + cursor `not-allowed`. **Não esconda** disabled (precisa ser visível mas não interativo).

### 10.4. Active (durante clique)

Botões: dim mais 5%, sem movimento (não usar `transform: scale`).

---

## 11. Iconografia

### 11.1. Direção atual

O app usa **emojis funcionais** em headers de docs e badges contextuais no UI:

| Emoji | Significado | Onde aparece |
|-------|------------|--------------|
| 🔐 | Autenticação | Header de doc, página de login |
| 📒 | Cadastros | Header de doc |
| 📅 | Planejamento | Header de doc |
| ⚡ | Execução | Header de doc |
| 📊 | Análise | Header de doc |
| ↔️ | Conta efetiva ≠ config | Badge em /pagamentos |
| ⏩ | Adiantamento de receita | Badge em pagamento |
| 🔄 | Realocar de outra conta | Badge na importação |
| ✓ | Match automático | Importação |
| 🏦 | Banco/saldo | KPIs (legado) |

### 11.2. Princípios pra iconografia futura

Quando for adotar biblioteca de ícones (Lucide, Phosphor, Heroicons), seguir:

1. **Stroke 1.5px–2px** (não preenchidos por padrão).
2. **24×24px** como tamanho base, escala 16/20/24/32.
3. **Cor herdada** do contexto (`currentColor`) — ícone branco em botão primário, ícone cinza em botão ghost.
4. **Consistência de família** — escolher UMA biblioteca, não misturar 3.

**Recomendação**: **Lucide** (sucessor do Feather Icons). Free, MIT, 1300+ ícones, estética moderna que combina com Manrope/Inter.

### 11.3. Quando emoji vs ícone

- **Emoji** — comunicação rápida com personalidade (changelog, headers, badges contextuais raros). Não escala bem entre platforms.
- **Ícone vetorial** — UI de botões, navegação, ações repetidas. Renderiza igual em todo lugar.

Regra prática: se aparece **mais de 3 vezes na tela**, vira ícone vetorial. Se é "tempero", pode ser emoji.

---

## 12. Tom visual / mood

### 12.1. Referências visuais (mood board mental)

**Inspirações diretas:**
- **Notion** — generoso, sereno, escala tipográfica forte
- **Linear** — denso mas respirável, dark mode impecável
- **Mercury** — premium-tech-finance sem ser corporate
- **Wise** — multimoeda, ilustração leve, didático

**Anti-inspirações (NÃO ser):**
- Bancos brasileiros legados (Itaú, Bradesco) — sério demais, intimidante
- Mint (RIP) / MoneyLover — colorido demais, infantilizante
- Robinhood — agressivo, masculino, especulativo
- YNAB — austero, preachy

### 12.2. Princípios de mood

- **Calmo, não animado.** Sem confetti, micro-animações de comemoração, mascotes.
- **Sério com dinheiro, leve com a pessoa.** Cards densos de dados, mas linguagem solta nos toasts e onboarding.
- **Profundidade > brilho.** Sombras suaves e gradientes sutis batem chrome berrante.
- **Branco > textura.** Espaço em branco é o melhor visual asset.

### 12.3. Quando precisar de ilustração

(Não há sistema de ilustração ainda — esse é gap pra futuro.)

Diretrizes pra quando contratar/criar:
- Estilo **geometric soft** (formas com cantos arredondados, traços precisos)
- Paleta **limitada à marca** (roxo + azul + 1 neutro + 1 accent)
- Sem rosto humano fotorrealista (caro, datado)
- Funcional, não decorativo (cada ilustração explica algo)

Referências: ilustrações do Stripe, Notion, Mercury.

---

## 13. Acessibilidade

### 13.1. Contraste WCAG AA

Cores escolhidas já atingem AA em light mode:
- `text-main` (#1F2937) sobre `surface` (#FFF): contrast 14.6:1 ✅
- `text-secondary` (#6B7280) sobre `surface`: 5.2:1 ✅
- `primary` (#6D5EF5) sobre `surface`: 4.6:1 ✅ (limítrofe — não usar em texto pequeno)

Em dark mode:
- `text-main` (#F1F5F9) sobre `background` (#0F172A): 14.8:1 ✅
- `primary` (#6D5EF5) sobre `background`: 6.1:1 ✅

### 13.2. Focus ring

`:focus-visible` com 2px solid + 2px offset garante visibilidade em qualquer fundo.

### 13.3. Tamanho mínimo

- Botão: 36px height mínimo (44px em touch — `@media (pointer: coarse)`)
- Tap target: 44×44px área clicável mínima em mobile
- Fonte: 12px mínimo absoluto, 16px no body

### 13.4. Reduced motion

(Não implementado ainda — gap pra futuro.)

Adicionar:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 14. Tokens — como usar

### 14.1. Princípio: sempre token, nunca hex

✅ Bom:
```css
.my-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  box-shadow: var(--shadow-card);
}
```

❌ Ruim:
```css
.my-card {
  background: #FFFFFF;  /* hardcoded */
  border-radius: 12px;  /* hardcoded */
}
```

Hardcode é o que causa drift visual ao longo do tempo. Tokens centralizam decisões.

### 14.2. Onde editar

Tudo está em `src/css/variables.css`. Mudou um token → mudou no app inteiro.

### 14.3. Quando adicionar token novo

Adicione token novo se:
- Vai ser usado em **3+ lugares**
- Não cabe em token existente
- Você consegue dar **nome semântico** (não `--cor-bonita`)

Ex de nome bom: `--color-status-pago-bg`. Ex de nome ruim: `--gray-87`.

---

## 15. Aplicação ao multi-perfil (futuro)

Quando a feature de múltiplos perfis na mesma conta sair, o sistema visual precisará:

### 15.1. Cor por perfil

Cada perfil ganha **uma cor de accent**. Não pra trocar a marca inteira, mas pra:
- Avatar do perfil
- Badge ao lado do nome em pagamentos compartilhados
- Filtro visual em /transacoes

**Recomendação**: paleta de 8 cores acessíveis pra perfis:

```css
--profile-1: #6D5EF5;  /* roxo (default/primary) */
--profile-2: #EC4899;  /* rosa */
--profile-3: #10B981;  /* verde */
--profile-4: #F59E0B;  /* amarelo */
--profile-5: #3B82F6;  /* azul */
--profile-6: #EF4444;  /* vermelho */
--profile-7: #8B5CF6;  /* violeta */
--profile-8: #14B8A6;  /* teal */
```

Cada cor com par bg suave (Tailwind 100) pra fundos sutis.

### 15.2. Avatar

Padrão: círculo com inicial(is) + cor do perfil. Tamanho 32px na lista, 24px em badges.

Tipografia da inicial: Manrope semibold, branca.

### 15.3. Indicação de quem fez o quê

Pequeno avatar inline ao lado de ação na timeline. Ex:

> 👤 Arnaldo marcou Aluguel como Pago • há 2h
> 👤 Maria registrou adiantamento de R$ 1.500 • há 5h

Avatar 16px, nome em negrito, ação em peso normal.

---

## 16. Confidence scores

| Seção | Confiança | Observação |
|-------|-----------|------------|
| 2. Cores | 🟢 Alta | Sistema completo em `variables.css` |
| 3. Tipografia | 🟢 Alta | Manrope + Inter já no app |
| 4. Espaçamento | 🟢 Alta | Tokens em escala 4px |
| 5. Border radius | 🟢 Alta | 5 níveis claros |
| 6. Sombras | 🟢 Alta | 6 níveis + assinatura roxa |
| 7. Tema | 🟢 Alta | Dark mode completo |
| 8. Status pagamento | 🟢 Alta | 7 status mapeados ambos temas |
| 9. Gradientes | 🟢 Alta | 3 gradientes oficiais |
| 10. Estados | 🟢 Alta | Focus, hover, disabled definidos |
| 11. Iconografia | 🟡 Média | Direção dada, biblioteca a escolher |
| 12. Mood | 🟡 Média | Referências mapeadas, sem ilustração |
| 13. Acessibilidade | 🟡 Média | Cores OK, falta reduced motion |
| 15. Multi-perfil | 🟠 Baixa | Antecipa, não implementado |

---

## 17. Open Questions

### Alta prioridade

1. **Adotar biblioteca de ícones agora ou depois?**
   - Recomendação: **Lucide** quando for adicionar primeiro ícone vetorial. Não tem urgência.
   - Decisão necessária: confirma Lucide ou outra?

2. **Sistema de ilustração?**
   - Atualmente: sem ilustrações. Empty states usam só texto + ícone emoji.
   - Recomendação: **adiar pra Fase 4 (aplicação)**. Quando tiver landing page e onboarding, aí faz sentido investir.

3. **Mascot? Avatar de marca?**
   - Não tem. Decisão estética.
   - Recomendação: **não.** Mascotes em fintech costumam infantilizar. Mercury, Notion, Linear não têm — funcionam muito bem sem.

### Média prioridade

4. **Reduced motion.** Acessibilidade obriga (WCAG). Implementar como gap a fechar.
5. **High contrast mode.** Acessibilidade plus. Adiar até ter feedback de usuários necessidade real.
6. **Cor por categoria de despesa?** Ex: Moradia em azul, Lazer em rosa. Existe parcialmente. Vale documentar quando estabilizar.

---

## 18. Como usar este documento

- **Designers**: §1–13, especialmente §1 (princípios) antes de qualquer mockup.
- **Devs frontend**: §14 (tokens) + `variables.css` direto. Não usar hex hardcoded.
- **Product**: §1, §8 (status), §11 (icons), §12 (mood) pra alinhar features novas.
- **Marketing futuro**: §1, §9 (gradientes), §12 (mood) pra landing e materiais.

Para o **design system completo em código**, ver `src/css/variables.css` e `src/css/components.css`.

Para **identidade verbal**, ver `docs/BRAND.md`.

---

## 19. Histórico

- **21/05/2026 — v1.0**: Versão inicial, codificando o sistema visual já implementado (alinhado com FinFlow v1.0.5). Sem logo definido (Fase 3.5 quando nome for fechado).
