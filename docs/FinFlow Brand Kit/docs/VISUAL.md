# Visual Identity Guidelines · FinFlow

> Versão deste documento: **2.0**
> Data: 22/05/2026
> Substitui: VISUAL.md v1.0 (Indigo + Salmão).
> Fonte primária dos tokens: `src/css/variables.css`.
> Alinhado com: `docs/BRAND.md` v1.2 (identidade verbal) e v1.0.5 do produto.
> **Logo definido nesta versão**: Twin Track (símbolo + wordmark).
> **Paleta atualizada**: Roxo Tech (#6D5EF5) + Lime (#C2F542).

---

## Índice

1. Princípios visuais
2. Logo · Twin Track
3. Sistema de cores
4. Tipografia
5. Espaçamento
6. Border radius
7. Sombras e profundidade
8. Tema claro vs. escuro
9. Status de pagamento
10. Gradientes
11. Estados de interação
12. Iconografia
13. Pattern gráfico
14. Sistema de ilustração
15. Tom visual e mood
16. Acessibilidade
17. Tokens, como usar
18. Aplicação ao multi-perfil
19. Confidence scores
20. Histórico de versões

---

## 1. Princípios visuais

Cinco princípios que orientam toda decisão visual.

### 1.1. Moderno premium

Território **Notion + Mercury + Linear**. Visual sóbrio com personalidade. Sem fintech tradicional, sem app infantilizado.

### 1.2. Densidade alta, respiração estratégica

Finanças têm muitos números. Não tem como escapar de densidade. O truque é respiro estratégico: margens generosas entre seções, mas dentro da seção pode ser denso.

### 1.3. Cores funcionais > decorativas

Toda cor tem trabalho. Roxo = ação primária. Lime = acento e statement. Verde = sucesso. Âmbar = pendente. Nenhuma cor "só pra ficar bonito".

### 1.4. Números são primeiro-cidadãos

Valores monetários e datas merecem tratamento tipográfico especial. **Geist Mono** com **tabular-nums** (largura consistente), peso semibold, alinhamento à direita em colunas.

### 1.5. Dark mode first-class

O app foi desenhado pra funcionar nos dois temas com qualidade equivalente. Não é "dark mode adaptado". Os tokens invertem automaticamente via `data-theme="dark"`.

---

## 2. Logo · Twin Track

**Conceito**: duas trilhas paralelas representam a filosofia "comprometido vs. executado". A linha de cima (roxa) é o planejado. A de baixo (lime, com um pico de variação no centro) é o real.

### 2.1. Variações canônicas (20 arquivos em `logo/`)

- **Símbolo** isolado, color · mono dark · mono light · reverso
- **Wordmark** (Manrope ExtraBold), color · mono dark · mono light
- **Lockup horizontal**, color · mono dark · mono light · reverso · **primário**
- **Lockup empilhado**, color · mono dark · mono light · secundário
- **App icon**, dark bg · roxo bg · light bg
- **Favicon**, padrão · auto-theme

### 2.2. Construção canônica

```
stroke-width      = W
extensão horiz    = 6W  (linha de x até x+6W)
espaçamento ↕     = 3W  (centro a centro entre as duas linhas)
visual width      = 7W
visual height     = 4W
bump tip          = midpoint entre linhas
```

Aplicar em qualquer tamanho mantém as proporções. A variação "stacked" usa W menor pra equilibrar com o wordmark.

### 2.3. Tamanho mínimo

- Símbolo isolado: **16 × 16 px** digital, **8 mm** impresso
- Wordmark / lockup: **72 px** de altura digital, **24 mm** impresso

### 2.4. Clear space

Mínimo **1x** (espessura da linha) de espaço livre em todos os lados. No lockup com wordmark, **1.5x** entre símbolo e tipo.

### 2.5. O que não fazer

- Não rotacionar
- Não esticar (sempre escalar uniforme)
- Não trocar cores fora das aprovadas
- Não aplicar sombras decorativas ou outlines extras
- Não usar gradientes inventados
- Não trocar a fonte do wordmark (sempre Manrope ExtraBold)

Detalhes visuais em `FinFlow Brand Book - Roxo Lime.html` slide 07.

### 2.6. Wordmark

Tipo "FinFlow" em **Manrope ExtraBold** com letter-spacing **-0.045em**. Para export em PDF, Figma ou Illustrator, **outline o texto** antes (Type → Create Outlines) porque os SVGs referenciam Manrope via Google Fonts `@import`.

---

## 3. Sistema de cores

### 3.1. Primária · Roxo Tech

| Token | Hex | Uso |
|---|---|---|
| `--color-primary-500` | `#6D5EF5` | ★ Roxo principal. CTAs, links, focus ring |
| `--color-primary-600` | `#5B4FE0` | Hover de botões |
| `--color-primary-700` | `#4B3FD6` | Texto sobre claro |
| `--color-primary-50` | `#F1EFFE` | Background sutil, badge "A Pagar" |
| `--color-primary-900` | `#2A2384` | Texto sobre primary-50 |

Rampa completa 50, 100, 200, 300, 400, 500, 600, 700, 800, 900 em `variables.css`.

### 3.2. Acento · Lime

| Token | Hex | Uso |
|---|---|---|
| `--color-accent-400` | `#C2F542` | ★ Lime principal, statement, CTAs finais |
| `--color-accent-500` | `#A3D331` | Hover de botões lime |
| `--color-accent-600` | `#84B121` | Texto sobre fundo claro (mais escuro pra contraste) |

⚠️ Em **fundo claro**, lime não tem contraste suficiente para texto. Use `accent-600` ou `accent-700`. Em fundo escuro o `accent-400` brilha.

### 3.3. Neutros · Ink

11 níveis de ink (50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950).

| Token | Hex (light) | Hex (dark) | Uso |
|---|---|---|---|
| `--color-ink-900` | `#0F172A` | `#F8FAFC` | Texto principal |
| `--color-ink-500` | `#64748B` | `#94A3B8` | Texto secundário |
| `--color-ink-200` | `#E2E8F0` | `#2A2F39` | Bordas |
| `--color-ink-950` | `#08090C` | `#08090C` | Always-dark (não inverte) |

### 3.4. Surfaces

| Token | Hex (light) | Hex (dark) |
|---|---|---|
| `--color-paper` | `#FFFFFF` | `#15181F` |
| `--color-canvas` | `#FAFAF7` | `#0B0D12` |
| `--color-surface-alt` | `#F9FAFB` | `#1A1D24` |

### 3.5. Sidebar · sempre dark

Decisão de marca: a sidebar fica escura nos dois modos. Dá personalidade ao app e enquadramento visual consistente.

| Token | Hex (light) | Hex (dark) |
|---|---|---|
| `--color-sidebar-bg` | `#0F172A` | `#14172A` |
| `--color-sidebar-bg-active` | `#5B4FE0` | `#5B4FE0` |
| `--color-sidebar-text` | `#CBD5E1` | `#94A3B8` |
| `--color-sidebar-text-active` | `#FFFFFF` | `#FFFFFF` |

No dark mode a sidebar ganha leve tom roxo para diferenciar do canvas escuro.

### 3.6. Semânticas

| Conceito | bg (light) | text (light) | bg (dark) | text (dark) |
|---|---|---|---|---|
| **Sucesso** | `#D1FAE5` | `#065F46` | `#064E3B` | `#6EE7B7` |
| **Atenção** | `#FEF3C7` | `#92400E` | `#78350F` | `#FCD34D` |
| **Erro** | `#FEE2E2` | `#991B1B` | `#7F1D1D` | `#FCA5A5` |
| **Info** | `#DBEAFE` | `#1E40AF` | `#1E3A8A` | `#93C5FD` |

### 3.7. Fixed tokens

Não invertem no dark mode. Usar quando o fundo está travado em uma cor de marca (hero ink-950, final CTA lime, sidebar).

| Token | Hex (fixo) | Uso |
|---|---|---|
| `--fixed-white` | `#FFFFFF` | Texto sobre fundos escuros sempre |
| `--fixed-dark` | `#0F172A` | Texto sobre lime sempre |
| `--fixed-ink-soft` | `rgba(255,255,255,0.75)` | Body soft sobre dark |
| `--fixed-ink-muted` | `rgba(255,255,255,0.55)` | Labels sobre dark |
| `--fixed-ink-faint` | `rgba(255,255,255,0.40)` | Hints sobre dark |

---

## 4. Tipografia

### 4.1. Famílias

| Token | Família | Uso |
|---|---|---|
| `--font-display` | **Manrope** | h1 a h5, KPIs, headlines, wordmark |
| `--font-body` | **Inter** | Body, labels, inputs, tabelas |
| `--font-mono` | **Geist Mono** | Números monetários, datas, código |

### 4.2. Escala (12px a 60px)

| Token | px | Uso |
|---|---|---|
| `--fs-xs` | 12 | Badges, hints |
| `--fs-sm` | 14 | Tabela, secundário |
| `--fs-base` | 16 | ★ Body padrão (mínimo) |
| `--fs-md` | 18 | Card titles |
| `--fs-lg` | 20 | h4 |
| `--fs-xl` | 24 | h3 |
| `--fs-2xl` | 30 | h2, KPI |
| `--fs-3xl` | 36 | h1 |
| `--fs-4xl` | 48 | Hero secundário |
| `--fs-5xl` | 60 | Hero principal |

### 4.3. Pesos

400 normal, 500 medium, 600 semibold, 700 bold, **800 extrabold** (display).

### 4.4. Tabular nums (crítico)

```css
.tabular { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
```

Use em **toda coluna de valores monetários e datas**. Sem isso "1.234,56" e "9.999,99" não alinham na vertical.

---

## 5. Espaçamento

Grid de 4px. Tokens `--space-0` a `--space-24` (de 0 até 96px).

Regra: prefira a escala. Não invente `padding: 17px`. Se 16 está apertado, use 20. Tokens evitam drift visual.

---

## 6. Border radius

| Token | px | Uso |
|---|---|---|
| `--radius-sm` | 6 | Inputs, badges, ícones pequenos |
| `--radius-md` | 12 | ★ Botões, cards padrão |
| `--radius-lg` | 20 | Cards grandes (KPI, hero) |
| `--radius-xl` | 28 | Hero, modal de destaque |
| `--radius-full` | 9999 | Avatares, pílulas |

---

## 7. Sombras e profundidade

Seis níveis. **Assinatura visual**: a segunda camada de `--shadow-card` usa roxo translúcido em vez de cinza, criando uma "aura" sutil que conecta com a cor primária.

```css
--shadow-card: 0 1px 3px rgba(15,23,42,0.06),
               0 6px 24px rgba(109,94,245,0.07);
```

No dark mode as sombras reduzem opacidade (o fundo já tem contraste alto sem precisar).

---

## 8. Tema claro vs. escuro

### 8.1. Filosofia

Ambos os modos são first-class. Sem afterthought.

### 8.2. Como ativar

```js
document.documentElement.setAttribute('data-theme', 'dark');
// ou 'light'
```

Persistir em `localStorage`. Detectar `prefers-color-scheme` na primeira visita.

### 8.3. Que invertem

- Surfaces (paper, canvas)
- Ink ramp inteira (50 a 900)
- Bgs sutis de marca (primary-50, primary-100, accent-50)
- Semânticas (bg + text invertem juntos)
- Status de pagamento (bg + text invertem juntos)

### 8.4. Que não invertem

- Sidebar (sempre dark, com tom diferente em cada modo)
- Hero / sections always-dark (mantêm ink-950)
- Final CTA em lime (sempre lime)
- Footer (sempre dark)
- Fixed tokens (`--fixed-white`, `--fixed-dark`)
- Logo principal (lime continua lime, roxo continua roxo)

---

## 9. Status de pagamento

O FinFlow tem **5 status**: 4 estados + default. Sistema único do domínio.

| Status | bg (light) | text (light) | bg (dark) | text (dark) | Quando |
|---|---|---|---|---|---|
| **Pago** | `#D1FAE5` | `#065F46` | `#064E3B` | `#6EE7B7` | Pagamento concluído |
| **Transferido** | `#DBEAFE` | `#1E40AF` | `#1E3A8A` | `#93C5FD` | Transferência executada |
| **A Transferir** | `#FCE7F3` | `#9D174D` | `#831843` | `#FBCFE8` | Pendente, vai executar |
| **Cancelado** | `#F3F4F6` | `#4B5563` | `#1F2937` | `#9CA3AF` | Não vai acontecer |
| **A Pagar** | `#FEF3C7` | `#92400E` | `#78350F` | `#FCD34D` | Default, precisa ação |

### Vibe cromática

- 🟢 Pago, verde, sucesso
- 🔵 Transferido, azul, fluxo
- 🌸 A Transferir, rose, distinto de azul
- ⚫ Cancelado, cinza, neutralizado
- 🟡 A Pagar, âmbar, atenção, default

Cada status ocupa uma família cromática diferente, o usuário lê a tabela sem ler.

### Removidos na v2.0

Cartão, Parcial e Agendado foram removidos do sistema. Não usar mais.

---

## 10. Gradientes

Quatro gradientes oficiais.

```css
--gradient-primary:      linear-gradient(135deg, #6D5EF5 0%, #4B3FD6 100%);
--gradient-primary-soft: linear-gradient(135deg,
                            rgba(109,94,245,0.08) 0%,
                            rgba(194,245,66,0.08) 100%);
--gradient-hero:         linear-gradient(135deg,
                            #6D5EF5 0%, #4B3FD6 50%, #C2F542 100%);
--gradient-night:        linear-gradient(135deg,
                            #0F172A 0%, #1E1B45 50%, #0F172A 100%);
```

**Quando usar:**
- `gradient-primary`, botões hero, CTAs muito grandes
- `gradient-primary-soft`, backgrounds sutis de cards de destaque
- `gradient-hero`, landing pages, splash screens, finalizações
- `gradient-night`, seções dramáticas em dark, hero do app

**Não inventar gradientes novos.** Manter consistência.

---

## 11. Estados de interação

### 11.1. Focus

```css
:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

No dark mode, focus usa lime em vez de roxo (contraste com fundos roxos).

### 11.2. Hover

- Botões, escurecem o fundo levemente
- Cards, ganham `shadow-md` (sutil aumento de elevação)
- Links, mudam para `secondary-dark`
- Linhas de tabela, ganham `surface-alt`
- Transição, `--transition-fast` (150ms)

### 11.3. Disabled

```css
button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
```

Não esconda, mantenha visível mas não interativo.

### 11.4. Active

Botões, dim mais 5%, sem `transform: scale`.

---

## 12. Iconografia

### 12.1. Biblioteca aprovada

**Lucide** (sucessor do Feather Icons). Free, MIT, 1300+ ícones. Combina com Manrope + Inter.

### 12.2. Princípios

1. **Stroke 1.8px** (não preenchidos por padrão)
2. **Escala**: 16, 20, 24, 32 px
3. **Cor herdada** (`currentColor`), nunca cor fixa
4. **Uma única biblioteca**, não misturar

### 12.3. Quando emoji vs. ícone

- Emoji, comunicação rápida com personalidade. Changelog, headers internos
- Ícone vetorial, UI de botões, navegação, ações repetidas

Regra prática: se aparece mais de 3 vezes na tela, vira ícone vetorial.

---

## 13. Pattern gráfico

**Twin Tracks Pattern**: o símbolo se repete em grid 120 × 80px formando trilhas paralelas que correm horizontalmente.

**Onde usar**:
- Hero sections de landing
- Headers de email
- Embalagem de mídia (slides, exportação PDF)
- Cover de social media
- **Não usar** em interface ativa (distrai)

**Variantes oficiais**:
- Roxo + lime sobre ink-950 (default)
- Lime sutil + roxo sobre lime-50 (variant claro)

---

## 14. Sistema de ilustração

### 14.1. Estilo

**Geometric soft**, formas com cantos arredondados, traços precisos, paleta restrita à marca.

### 14.2. Diretrizes

- Paleta limitada a roxo + lime + 1 neutro
- Sem rosto humano fotorrealista
- Funcional, não decorativo. Cada ilustração explica algo
- Stroke consistente com iconografia (1.8 a 2.4)

### 14.3. Casos canônicos

1. **Pagamento marcado**, calendário com moeda caindo na data
2. **Previsto vs. real**, duas linhas paralelas formando gráfico
3. **Contas conectadas**, stack de cards com moedas convergindo

Referências: ilustrações do Stripe, Notion, Mercury.

---

## 15. Tom visual e mood

### 15.1. Inspirações

- **Notion**, generoso, sereno, escala tipográfica forte
- **Linear**, denso mas respirável, dark mode impecável
- **Mercury**, premium-tech-finance sem ser corporate
- **Wise**, multimoeda, didático

### 15.2. Anti-inspirações

- Bancos brasileiros (Itaú, Bradesco), sério demais
- Mint, MoneyLover, colorido demais
- Robinhood, agressivo, especulativo
- YNAB, austero, preachy

### 15.3. Princípios de mood

- **Calmo, não animado.** Sem confetti, sem mascotes
- **Sério com dinheiro, leve com a pessoa.** Cards densos, linguagem solta
- **Profundidade > brilho.** Sombras suaves, gradientes sutis batem chrome berrante
- **Branco > textura.** Espaço em branco é o melhor visual asset

---

## 16. Acessibilidade

### 16.1. Contraste WCAG AA

Cores escolhidas atingem AA em ambos os modos.

- `ink-900` sobre `paper` (light), 14.6:1 ✅
- `primary-500` sobre `paper`, 4.6:1 ✅ (limítrofe, não usar em texto pequeno; use `primary-700`)
- Lime sobre paper, **insuficiente para texto**. Use `accent-600` ou `accent-700`

### 16.2. Focus ring

`:focus-visible` com 2px solid + 2px offset garante visibilidade em qualquer fundo.

### 16.3. Tamanho mínimo

- Botão, 36px height (44px em touch)
- Tap target, 44 × 44px área mínima em mobile
- Fonte, 12px mínimo absoluto, 16px no body

### 16.4. Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  --transition-fast:   0.01ms;
  --transition-normal: 0.01ms;
  --transition-slow:   0.01ms;
}
```

Já incluído em `variables.css` v2.0.

---

## 17. Tokens, como usar

### 17.1. Princípio

Sempre `var(--token)`, nunca hex hardcoded.

✅ Bom:
```css
.my-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  box-shadow: var(--shadow-card);
}
```

❌ Ruim:
```css
.my-card {
  background: #FFFFFF;
  border-radius: 12px;
}
```

Hex hardcode causa drift visual ao longo do tempo. Tokens centralizam decisões.

### 17.2. Onde editar

Tudo em `src/css/variables.css`. Muda um token, muda no app inteiro.

### 17.3. Quando criar token novo

Adicione token novo se:
- Vai ser usado em **3 ou mais lugares**
- Não cabe em token existente
- Você consegue dar nome semântico (não `--cor-bonita`)

Exemplo bom: `--color-status-pago-bg`. Exemplo ruim: `--gray-87`.

### 17.4. Backwards compatibility

`variables.css` v2.0 mantém aliases para os nomes antigos (v1 Indigo+Salmão) na seção final. Permite código legado continuar funcionando enquanto a migração acontece.

---

## 18. Aplicação ao multi-perfil

Quando a feature de múltiplos perfis sair, o sistema visual precisará:

### 18.1. Cor por perfil

Cada perfil ganha uma cor de accent. Paleta de 8 cores acessíveis:

```css
--profile-1: #6D5EF5;  /* roxo, default */
--profile-2: #EC4899;  /* rosa */
--profile-3: #10B981;  /* verde */
--profile-4: #F59E0B;  /* âmbar */
--profile-5: #3B82F6;  /* azul */
--profile-6: #EF4444;  /* vermelho */
--profile-7: #8B5CF6;  /* violeta */
--profile-8: #14B8A6;  /* teal */
```

### 18.2. Avatar

Círculo com inicial em Manrope semibold branca. 32px na lista, 24px em badges.

### 18.3. Quem fez o quê

Avatar 16px inline ao lado da ação na timeline.

---

## 19. Confidence scores

| Seção | Confiança | Observação |
|---|---|---|
| 1. Princípios | 🟢 Alta | Decisões fechadas |
| 2. Logo | 🟢 Alta | Twin Track aprovado, 20 SVGs canônicos |
| 3. Cores | 🟢 Alta | Sistema completo em `variables.css` v2.0 |
| 4. Tipografia | 🟢 Alta | Manrope + Inter + Geist Mono no app |
| 5. Espaçamento | 🟢 Alta | Tokens em escala 4px |
| 6. Border radius | 🟢 Alta | 5 níveis claros |
| 7. Sombras | 🟢 Alta | 6 níveis com assinatura roxa |
| 8. Tema | 🟢 Alta | Dark mode completo e testado na landing |
| 9. Status | 🟢 Alta | 5 status com famílias cromáticas distintas |
| 10. Gradientes | 🟢 Alta | 4 gradientes oficiais |
| 11. Estados | 🟢 Alta | Focus, hover, disabled definidos |
| 12. Iconografia | 🟢 Alta | Lucide aprovado |
| 13. Pattern | 🟢 Alta | Twin Tracks Pattern definido |
| 14. Ilustração | 🟡 Média | Estilo definido, 3 exemplos canônicos |
| 16. Acessibilidade | 🟢 Alta | Cores AA, reduced motion incluído |
| 18. Multi-perfil | 🟠 Baixa | Antecipa, não implementado |

---

## 20. Histórico de versões

- **2.0 · 22/05/2026**, refatoração completa com Roxo + Lime, logo Twin Track definido, dark mode polido, status reduzidos a 5, sem Cartão/Parcial/Agendado, gradientes atualizados, fixed tokens para always-dark e lime, sidebar com tom dark dual-mode. Substitui v1.0 (Indigo + Salmão).
- **1.0 · 21/05/2026**, versão inicial codificando o sistema visual implementado em FinFlow v1.0.5 (Indigo + Salmão). Sem logo definido (Fase 3.5).

---

## Como usar este documento

- **Designers**, seções 1 a 16, especialmente 1 (princípios) antes de qualquer mockup
- **Devs frontend**, seção 17 (tokens) + `variables.css` direto. Não usar hex hardcoded
- **Product**, seções 1, 9 (status), 12 (icons), 15 (mood) pra alinhar features novas
- **Marketing**, seções 1, 10 (gradientes), 15 (mood) pra landing e materiais

Para o **design system completo em código**, ver `src/css/variables.css`.

Para **identidade verbal**, ver `docs/BRAND.md` v1.2.

Para **assets do logo**, ver `logo/README.md`.
