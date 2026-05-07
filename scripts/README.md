# Scripts — i18n string extraction

Ferramentas para manter o catálogo `i18n_strings` (Supabase) em sincronia
com as strings escritas no código.

## Padrões de marcação no código

### JS / módulos

```js
import { t } from '../lib/textos.js';

showToast(t('dividas.toast.criada', 'Dívida cadastrada'), 'success');
```

- O **primeiro argumento** é a chave (única no catálogo).
- O **segundo argumento** é o fallback pt-BR — também é o valor canônico salvo no banco.
- O extrator pega ambos.

### HTML estático

```html
<button data-i18n-key="dividas.btn_nova">Nova dívida</button>
<input  data-i18n-placeholder="dividas.placeholder.nome" placeholder="Ex: Carro">
<a      data-i18n-title="dividas.tooltip.editar" title="Editar">…</a>
<button data-i18n-aria-label="dividas.aria.fechar" aria-label="Fechar">…</button>
```

- O `textContent` / `placeholder` / `title` / `aria-label` atual é o fallback pt-BR.
- O `applyTranslationsToDom()` em `textos.js` substitui esses valores no boot.

## Fluxo

```
┌────────────────────┐     1) extract     ┌────────────────────────┐
│ código (JS / HTML) │  ────────────────▶ │ extracted-strings.json │
└────────────────────┘                    └─────────────┬──────────┘
                                                        │
                                                        │ 2) sync
                                                        ▼
                                          ┌────────────────────────┐
                                          │ supabase/migrations/   │
                                          │   auto_i18n_sync_*.sql │
                                          └─────────────┬──────────┘
                                                        │
                                                        │ 3) aplica no Supabase
                                                        ▼
                                          ┌────────────────────────┐
                                          │ tabela i18n_strings    │
                                          │ (catálogo)             │
                                          └────────────────────────┘
```

## Comandos

### 1. Extrair strings do código

```bash
node scripts/extract-strings.js
```

Saída:
- `extracted-strings.json` na raiz com todas as strings únicas (chave, pt_br, fontes).
- Aviso no terminal se houver chaves duplicadas com valores diferentes.

### 2. Gerar SQL para o Supabase

```bash
# Saída padrão (timestamp no nome)
node scripts/sync-strings.js

# Ou com nome específico
node scripts/sync-strings.js supabase/migrations/0066_i18n_atualizacao.sql
```

O SQL gerado é **idempotente**:
- Insere strings novas
- Atualiza `pt_br` das existentes (o código é fonte da verdade pt-BR)
- Não toca em traduções de outros idiomas (`en`, `es`, `fr`)

### 3. Aplicar no Supabase

Cole o conteúdo do arquivo `.sql` gerado no SQL Editor do Supabase e execute.
Ou, se usar a CLI: `supabase db push`.

## Boas práticas para chaves

Use formato hierárquico `pagina.area.contexto`:

| Tipo | Exemplo |
|------|---------|
| Toast de sucesso | `dividas.toast.criada` |
| Toast de erro    | `dividas.toast.erro_salvar` |
| Validação        | `dividas.validacao.nome_obrigatorio` |
| Label de campo   | `dividas.modal.label.valor_total` |
| Placeholder      | `dividas.modal.placeholder.juros` |
| Título de modal  | `dividas.modal.titulo.nova` |
| Botão            | `dividas.btn.salvar` |
| Status / badge   | `dividas.status.arquivada` |

Para strings reutilizadas em várias páginas (botões padrão tipo Cancelar),
use prefixo `global.`:

```js
t('global.btn.cancelar', 'Cancelar')
t('global.btn.salvar',   'Salvar')
```

## Quando NÃO usar `t()`

- Strings dinâmicas geradas a partir de dados do banco (nomes de contato, etc.)
- Mensagens de erro retornadas pela API (`error.message`)
- Concatenações com variáveis: prefira interpolação pt-BR + `t()` apenas no texto fixo:

```js
// ❌
t(`Erro: ${err.message}`, ...)

// ✅
`${t('dividas.toast.erro_carregar', 'Erro ao carregar')}: ${err.message}`
```

## Limitações conhecidas

- O extrator usa regex (não AST), então **não detecta** `t()` chamado via variável (`const fn = t; fn(...)`).
- O extrator **detecta** strings em comentários se o padrão for ASCII (`t('chave', 'texto')`). Use exemplos com aspas duplas em comentários para evitar (`t( "chave" , "texto" )` é ignorado).
- Strings em template literals com `${...}` (interpolação) **não são extraídas** — quebre em `t('chave', 'parte fixa')` + interpolação.
