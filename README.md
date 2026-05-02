# FinFlow

App de gestão financeira pessoal — controle de contas, categorias, orçamento, pagamentos, dívidas, investimentos e relatórios.

## Stack

- **Frontend**: HTML5 + Vanilla JavaScript (ES Modules) + CSS3 com custom properties
- **Backend**: Supabase (PostgreSQL + Auth + RLS + Edge Functions)
- **Deploy**: Vercel
- **Câmbio**: Frankfurter API (https://api.frankfurter.app)
- **Fontes**: Manrope (títulos) + Inter (corpo) via Google Fonts

## Estrutura

```
leveluponline-finance/
├── index.html              # login (entry point)
├── dashboard.html
├── contas.html
├── categorias.html
├── orcamento.html
├── pagamentos.html
├── dividas.html
├── investimentos.html
├── relatorios.html
├── src/
│   ├── css/
│   │   ├── variables.css   # design tokens
│   │   ├── global.css      # reset + base
│   │   ├── components.css  # botões, cards, modais, toasts
│   │   └── layout.css      # sidebar, header, grid
│   └── js/
│       ├── lib/
│       │   ├── config.js   # SUPABASE_URL e SUPABASE_ANON_KEY
│       │   ├── supabase.js # cliente Supabase
│       │   ├── auth.js     # sessão, logout
│       │   └── currency.js # câmbio
│       ├── components/
│       │   ├── sidebar.js
│       │   ├── modal.js
│       │   └── toast.js
│       └── pages/          # JS específico de cada tela (adicionado por fase)
├── supabase/
│   └── migrations/         # SQL: schema + RLS
├── vercel.json
├── README.md
└── .gitignore
```

## Setup local

1. Configure `src/js/lib/config.js` com sua `SUPABASE_URL` e `SUPABASE_ANON_KEY` (ver passo a passo abaixo).
2. Rode um servidor HTTP estático na raiz do projeto:

```bash
python3 -m http.server 8000
```

3. Abra `http://localhost:8000/` no navegador.

> **Importante**: ES Modules não funcionam via `file://`. Sempre use um servidor HTTP local.

## Setup Supabase

1. Crie conta em [supabase.com](https://supabase.com) (login com GitHub funciona).
2. **New project** → escolha nome (ex: `finflow`), região South America (São Paulo), gere senha forte do banco.
3. Aguarde provisionamento (~2 min).
4. **SQL Editor** → cole e rode `supabase/migrations/0001_schema.sql`.
5. Cole e rode `supabase/migrations/0002_rls_policies.sql`.
6. **Project settings → API** → copie `Project URL` e `anon public` key.
7. Edite `src/js/lib/config.js` com os valores.

## Setup Vercel

A ser configurado quando a primeira tela estiver funcionando.

## Documentação

- [Planejamento Completo](../FinFlow%20-%20Planejamento.docx)
- [Funções por Tela](../FinFlow%20%20-%20Funções.docx)
