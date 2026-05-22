# FinFlow · Handoff para Claude Code

> Como aplicar este design system no app existente sem reescrever nada que já funciona.
> Última atualização: 22/05/2026 · alinhado com v1.0.5 do app.

---

## Princípios (leia primeiro)

1. **O design system aplica TOKENS em código existente, não reescreve a UI.** Os mockups (`FinFlow App Screens.html`, `FinFlow Landing.html`, etc.) são **referência visual**, não especificação. A ordem das seções, hierarquia de componentes e arquitetura do código permanece como está.

2. **Single source of truth: `src/css/variables.css` v2.0.** Toda decisão visual (cor, tipo, espaço, sombra) vive lá. Se algo no app não bate com a marca, é porque ele tem hex hardcoded ou usa um token antigo, não porque a arquitetura está errada.

3. **Backwards compatibility já está incluída.** O variables.css v2.0 mantém aliases pros nomes antigos (`--color-primary`, `--color-secondary`, etc.) então código legado continua funcionando enquanto a migração acontece.

4. **Não tente recriar os mockups.** Eles foram desenhados em HTML/JSX standalone pra prototipar a aparência. O app de verdade tem state, routing, hooks, etc., que ele NÃO tem.

---

## Ordem de aplicação (sugerida)

### Fase 1 — Swap dos tokens (1 hora)

1. Substituir `src/css/variables.css` antigo pelo novo (v2.0)
2. Carregar fontes novas no `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```
3. Adicionar `data-theme="light"` no `<html>` e implementar toggle de dark mode (ver `FinFlow Landing.html` linhas finais, JS de tema, 12 linhas)
4. **Sanity check**: rodar o app, ver se ele funciona. As cores devem mudar globalmente (Indigo+Salmão → Roxo+Lime) porque tudo que usa `var(--color-primary)` já aponta pro novo roxo.

### Fase 2 — Substituir logo (30 min)

1. Copiar pasta `logo/` para `src/assets/logo/`
2. Substituir referências ao logo antigo:
   - **Sidebar**: usar `logo/lockup-horizontal/lockup-h-color.svg` (versão branca pro fundo dark)
   - **Favicon**: usar `logo/favicon/favicon-auto-theme.svg` (alterna light/dark sozinho)
   - **App icon iOS/Android**: usar `logo/app-icon/app-icon-dark-bg.svg` como base, exportar PNG nos tamanhos necessários
   - **Login splash**: usar `logo/lockup-stacked/lockup-stacked-color.svg`

### Fase 3 — Auditar hex hardcoded (2 a 4 horas)

Procurar e substituir hex hardcoded por tokens:

```bash
# Encontra arquivos com hex hardcoded
grep -r "#[0-9A-Fa-f]\{6\}" src/css/ --include="*.css"
```

**Mapeamento essencial:**
| Hex antigo (v1) | Token novo |
|---|---|
| `#6D5EF5` | `var(--color-primary-500)` |
| `#FF8B6B` (salmão antigo) | `var(--color-accent-400)` se for acento, `var(--color-warning)` se for atenção |
| `#3B82F6` | era secondary, agora `var(--color-info)` |
| `#1F2937` | `var(--color-ink-900)` ou `var(--color-sidebar-bg)` |
| `#FAFAF7` | `var(--color-canvas)` |
| `#FFFFFF` | `var(--color-paper)` ou `var(--fixed-white)` (se for em fundo dark sempre) |
| Verdes (sucesso) | `var(--color-success)`, `var(--color-success-bg)`, `var(--color-success-text)` |
| Vermelhos (erro) | `var(--color-danger)`, `var(--color-danger-bg)`, `var(--color-danger-text)` |

### Fase 4 — Status de pagamento (1 hora)

**Importante**: 3 status foram removidos: **Cartão**, **Parcial**, **Agendado**. Antes de aplicar os novos estilos, precisa:

1. Verificar no banco se ainda existem pagamentos com status `cartao`, `parcial`, `agendado`
2. Migration sugerida:
   - `cartao` → `pago` (cartão de crédito gera transação, na prática é pago)
   - `parcial` → `pago` (com nota no histórico)
   - `agendado` → `apagar` (volta pra default, usuário marca de novo quando rolar)
3. Atualizar enum/constants no código
4. Aplicar os novos pares bg/text via `var(--color-status-{nome}-{bg,text})`

Status oficiais agora: **pago, transferido, transferir, cancelado, apagar** (default).

### Fase 5 — Componentes base (4 a 8 horas)

Por componente, garantir que:

- **Botões** — usam `var(--color-primary-500)` no primário, `var(--color-accent-400)` em CTAs fortes, `var(--color-ink-900) / var(--color-paper)` em ghost. Border-radius `var(--radius-md)` (12px).
- **Inputs** — bordas em `var(--color-border)`, focus ring `var(--focus-ring)`, padding `var(--space-3)`.
- **Cards** — bg `var(--color-paper)`, border `var(--color-border)`, radius `var(--radius-md)`, sombra `var(--shadow-card)` (com a assinatura roxa sutil).
- **Sidebar** — bg `var(--color-sidebar-bg)` (sempre dark nos dois modos), itens ativos em `var(--color-sidebar-bg-active)` (roxo).
- **Tabelas de valores** — sempre `font-family: var(--font-mono)` com `font-variant-numeric: tabular-nums` na coluna de valores.

### Fase 6 — Page-by-page polish (incremental)

Conforme tocar em cada página pra outra feature, alinhar visualmente com os mockups:
- Compromissos → ver `app-screens.jsx` → `ScreenCompromissos`
- Contas → `ScreenContas`
- Relatórios → `ScreenRelatorios` (abas Fluxo e Saúde Financeira)

**Não polir todas as 26 páginas de uma vez.** Faz junto com features ou correções normais.

---

## Tom de voz e copy

Pra qualquer texto novo (toast, label, botão, erro, microcopy), seguir `docs/BRAND.md` v1.2:

- **Sem travessões** (—) em texto visível
- **Vocabulário canônico**: compromisso, pagamento, transação, caixinha, etc. (ver §2.2 do BRAND.md)
- **"você" / "vocês"** em vez de "usuário"
- **Frases curtas, voz ativa, verbo no início de botões**
- **Sem clichês**: nada de "plataforma definitiva", "AI-powered", "ops, algo deu errado"

Quando estiver em dúvida sobre uma frase, consulte os exemplos lado a lado em `docs/BRAND.md` §6.

---

## Arquivos de referência (ordem de prioridade)

1. **`src/css/variables.css`** ← source of truth dos tokens. Importar primeiro.
2. **`docs/VISUAL.md`** v2.0 ← guia em markdown do sistema visual completo
3. **`docs/BRAND.md`** v1.2 ← identidade verbal, voz, tom, vocabulário
4. **`FinFlow Brand Guide.html`** ← guia visual interativo (light + dark, exportável em PDF)
5. **`Tokens Inspector.html`** ← visualizador de tokens ao vivo, útil em design review
6. **`Logo Contact Sheet.html`** + **`logo/`** ← assets de logo + instruções de uso
7. **`FinFlow App Screens.html`** ← REFERÊNCIA VISUAL apenas. Não recriar.
8. **`FinFlow Landing.html`** ← landing page completa com a marca aplicada. Boa pra ver padrões em ação.

---

## O que NÃO fazer

❌ **Não reescreva componentes que já funcionam.** Aplique tokens em vez disso.

❌ **Não copie HTML/JSX dos mockups direto.** Eles são standalone, não têm hooks, state, routing, traduções.

❌ **Não invente cores novas.** Se uma cor não existe em variables.css, ou tem um token equivalente, ou precisa ser proposta antes (e adicionada ao variables.css primeiro).

❌ **Não pule a etapa de migração de status** (Fase 4). Pode quebrar dados existentes.

❌ **Não use hex hardcoded.** Sempre `var(--token)`. Se está copiando código antigo, troca os hex no mesmo PR.

---

## Quando perguntar antes de mexer

Se Claude Code se deparar com:
- Necessidade de criar um novo token (não há equivalente no variables.css)
- Comportamento de status que não está documentado
- Cor ou ícone que parece um caso novo de design
- Conflito entre o que o mockup mostra e o que o código atual faz

→ **Pare e pergunte ao usuário antes de seguir.** Não decida sozinho.

---

## Checklist final de QA visual

Depois de aplicar o design system, verificar:

- [ ] Light mode funciona em todas as páginas principais
- [ ] Dark mode funciona em todas as páginas principais (toggle no header ou settings)
- [ ] Logo aparece corretamente no light e dark
- [ ] Sidebar fica dark nos dois modos
- [ ] Botões primários usam roxo (#6D5EF5)
- [ ] CTAs de destaque (landing, splash) usam lime (#C2F542)
- [ ] Status pills usam as 5 cores corretas (verde, azul, rose, cinza, âmbar)
- [ ] Valores monetários usam Geist Mono + tabular-nums
- [ ] Headings usam Manrope
- [ ] Body usa Inter
- [ ] Sem hex hardcoded em CSS (só em `:root[data-theme]` blocks)
- [ ] Focus ring visível em todos os botões/inputs
- [ ] Contraste WCAG AA em texto (cores semânticas usam pares bg+text consistentes)
- [ ] `prefers-reduced-motion` desativa transições (já vem no variables.css v2.0)
- [ ] Favicon aparece correto (alterna automático light/dark)

---

## Histórico

- **22/05/2026 · v1.0** — primeira versão. Cobre Fase 1 (tokens), Fase 2 (logo), Fase 3 (audit), Fase 4 (status), Fase 5 (componentes), Fase 6 (page polish).
