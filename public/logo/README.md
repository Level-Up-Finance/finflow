# FinFlow — Logo assets

Twin Track · Roxo Tech + Lime · v1.0 · Mai 2026

## O que tem aqui

```
logo/
├── symbol/                 só o símbolo Twin Track (sem wordmark)
│   ├── symbol-color.svg              roxo + lime — para fundos brancos/claros
│   ├── symbol-mono-dark.svg          ink #0F172A — em qualquer fundo claro
│   ├── symbol-mono-light.svg         branco — em fundos escuros
│   └── symbol-reverso.svg            branco + lime — sobre roxo (brand bg)
│
├── wordmark/               só o tipo "FinFlow" (sem símbolo)
│   ├── wordmark-color.svg            ink "Fin" + roxo "Flow"
│   ├── wordmark-mono-dark.svg        tudo em ink
│   └── wordmark-mono-light.svg       tudo em branco
│
├── lockup-horizontal/      símbolo + wordmark lado a lado (uso primário)
│   ├── lockup-h-color.svg
│   ├── lockup-h-mono-dark.svg
│   ├── lockup-h-mono-light.svg
│   └── lockup-h-reverso.svg          sobre fundo roxo
│
├── lockup-stacked/         símbolo em cima + wordmark embaixo
│   ├── lockup-stacked-color.svg
│   ├── lockup-stacked-mono-dark.svg
│   └── lockup-stacked-mono-light.svg
│
├── app-icon/               quadrado com cantos arredondados (iOS/Android)
│   ├── app-icon-dark-bg.svg          fundo ink + símbolo branco/lime — PADRÃO
│   ├── app-icon-roxo-bg.svg          fundo roxo + símbolo branco/lime
│   └── app-icon-light-bg.svg         fundo creme + símbolo roxo/lime escuro
│
├── favicon/
│   ├── favicon.svg                   versão única, light/dark já no SVG
│   └── favicon-auto-theme.svg        responde a prefers-color-scheme
│
└── README.md               este arquivo
```

## Quando usar o quê

| Contexto | Arquivo |
|---|---|
| Site, deck, doc interno | `lockup-horizontal/lockup-h-color.svg` |
| Email header | `lockup-horizontal/lockup-h-color.svg` |
| Avatar quadrado (perfis sociais) | `app-icon/app-icon-dark-bg.svg` |
| App icon iOS/Android | `app-icon/app-icon-dark-bg.svg` (exportar PNG) |
| Favicon do site | `favicon/favicon-auto-theme.svg` |
| Fundo roxo (hero, splash) | `lockup-horizontal/lockup-h-reverso.svg` |
| Estampa / merchandise | `symbol/symbol-color.svg` |
| Carimbo, fax, B&W print | `symbol/symbol-mono-dark.svg` |

## Cores oficiais

- **Roxo Tech** `#6D5EF5` — primária, planejamento
- **Lime** `#C2F542` — acento, execução
- **Ink** `#0F172A` — texto em fundo claro
- **Creme** `#FAFAF7` — fundo principal

## Tipografia do wordmark

**Manrope ExtraBold (800)** — letter-spacing −0.045em.

⚠️ Os SVGs do wordmark referenciam Manrope via Google Fonts (`@import` no `<style>`). Isso funciona em browsers modernos. Para **impressão**, **import em Figma/Illustrator**, ou **embed em PDF**, **outline o texto** primeiro:

- **Figma**: selecionar texto → `⌘⇧O` (Outline stroke / Flatten)
- **Illustrator**: Type → Create Outlines (`⌘⇧O`)

## Construção do símbolo

- Canvas 100 × 100, símbolo entre x=14 e x=78
- Duas linhas paralelas, espessura 10 (1x), cap round
- Linha superior em y=38, linha inferior em y=62
- A linha inferior tem um pico no centro (variação) — sobe pra y=50 entre x=44 e x=56
- Em sizes reduzidos (favicon 16px), espessura aumenta pra 12 pra manter peso visual

## Tamanho mínimo

- Símbolo isolado: **16 × 16 px** digital, **8 mm** impresso
- Wordmark / lockup: **72 px** altura digital, **24 mm** impresso

## Clear space

Mínimo **1x** (espessura da linha) de espaço livre em todos os lados. No lockup, **1.5x** entre símbolo e wordmark.

## Como exportar para PNG/ICO

Estes SVGs são vetoriais e podem ser convertidos em qualquer raster:

```bash
# usando ImageMagick / Inkscape
inkscape symbol-color.svg --export-type=png --export-width=512 --export-filename=symbol-512.png

# usando rsvg-convert
rsvg-convert -w 512 symbol-color.svg -o symbol-512.png
```

Tamanhos PNG recomendados para app icons:
- **iOS App Store**: 1024 × 1024
- **iOS app icon**: 180 × 180
- **Android adaptive icon**: 512 × 512 (foreground em 432 × 432 safe zone)
- **PWA**: 192 × 192 + 512 × 512
- **Favicon**: 16 × 16, 32 × 32, 48 × 48 (combinar em `favicon.ico`)

---

**Não fazer:** rotacionar, esticar, trocar cores, adicionar sombra, usar gradiente que não seja o oficial. Detalhes em `FinFlow Brand Book - Roxo Lime.html` (slide 07).
