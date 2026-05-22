# FinFlow Brand Kit

Tudo que você precisa pra aplicar a identidade FinFlow.

## 🚀 Onde começar

| Eu sou... | Comece aqui |
|---|---|
| **Designer** | `FinFlow Brand Guide.html` (abra no browser) |
| **Dev** | `docs/HANDOFF.md` + `src/css/variables.css` |
| **Marketing** | `docs/BRAND.md` (taglines, voz, vocabulário) |
| **Quero ver tudo** | `FinFlow Brand Guide (standalone).html` (HTML único, abre offline) |

## 📁 Estrutura

```
FinFlow Brand Kit/
├── docs/
│   ├── BRAND.md           Identidade verbal (voz, tom, taglines, vocabulário)
│   ├── VISUAL.md          Sistema visual completo em markdown
│   └── HANDOFF.md         Como aplicar tudo isso no app existente
│
├── src/css/
│   └── variables.css      ★ Source of truth dos design tokens
│
├── logo/                  20 SVGs (símbolo, wordmark, lockups, app icon, favicon)
│   └── README.md          Quando usar cada variante + instruções de export
│
├── FinFlow Brand Guide.html          ★ Guia visual interativo (PDF-ready)
├── FinFlow Brand Guide (standalone).html  ★ Versão única standalone (envia por email)
├── FinFlow Brand Book.html           Apresentação formal de 22 slides
├── FinFlow Landing.html              Landing page completa com marca aplicada
├── FinFlow App Screens.html          Mockups de Compromissos, Contas, Relatórios
├── Tokens Inspector.html             Visualizador de todos os tokens ao vivo
├── Logo Contact Sheet.html           Folha de contato com todas as variações de logo
│
└── (arquivos de suporte JSX/CSS/JS)
```

## ⚡ Quick start

### Aplicar no app existente

```bash
# 1. Substituir variables.css
cp "src/css/variables.css" path/to/seu-app/src/css/variables.css

# 2. Copiar pasta logo
cp -r logo path/to/seu-app/src/assets/

# 3. Ler HANDOFF.md
open docs/HANDOFF.md
```

### Exportar guia como PDF

Abrir `FinFlow Brand Guide.html` no browser → Cmd+P (Mac) ou Ctrl+P (Windows) → Salvar como PDF. O CSS já está com page-breaks corretos.

### Enviar a marca por Slack/email

Envie `FinFlow Brand Guide (standalone).html`. É um arquivo único auto-contido (~600 KB) com tudo inline. Funciona offline.

## 🎨 Sistema, em uma frase

**Roxo Tech (#6D5EF5)** + **Lime (#C2F542)** · Manrope + Inter + Geist Mono · Light + Dark · Logo "Twin Track" (comprometido vs. executado).

## 📊 Versões

| Arquivo | Versão | Data |
|---|---|---|
| variables.css | 2.0 | 22/05/2026 |
| VISUAL.md | 2.0 | 22/05/2026 |
| BRAND.md | 1.2 | 22/05/2026 |
| HANDOFF.md | 1.0 | 22/05/2026 |
| Logo | 1.0 (Twin Track) | Mai 2026 |

---

Brand kit gerado em 22 Mai 2026.
