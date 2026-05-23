# Edge Function: send-password-reset

Envia email branded de reset de senha via Resend, substituindo o template default
do Supabase Auth.

## Arquitetura

```
Frontend (login.js)
  ↓ supabase.functions.invoke('send-password-reset', { email, redirectTo })
Edge Function (Deno, esta pasta)
  ↓ admin.generateLink({ type: 'recovery', email })
  ↓ Resend API (https://api.resend.com/emails)
Email no inbox do usuário
```

## Setup

### 1. Configurar secrets no Supabase

```bash
# Via Supabase CLI:
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx

# Ou via Dashboard:
# https://supabase.com/dashboard/project/meapbdsthewyuugbavzl/settings/functions
# → Add new secret: nome=RESEND_API_KEY, valor=re_xxxxx
```

**Importante**: as secrets `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são
injetadas automaticamente pelo Supabase em qualquer Edge Function — não precisa
configurar manualmente.

### 2. Deploy

```bash
# Primeira vez, linka o projeto local com o remoto:
supabase link --project-ref meapbdsthewyuugbavzl

# Deploy:
supabase functions deploy send-password-reset

# Ou deploy SEM JWT verification (necessário porque o usuário não está logado
# quando clica em "Esqueci minha senha"):
supabase functions deploy send-password-reset --no-verify-jwt
```

⚠️ **Atenção JWT**: a função precisa rodar **sem auth obrigatório** porque o
usuário que pede reset de senha está deslogado. Use `--no-verify-jwt` no deploy.

### 3. Configurar `from` no Resend

#### Dev/sandbox (atual)

```ts
const fromAddress = "FinFlow <onboarding@resend.dev>";
```

`onboarding@resend.dev` é o domínio sandbox do Resend. **Só envia pro email
cadastrado na sua conta Resend** — outros emails são silently descartados.
Bom pra testar com sua própria conta, mas inútil em produção.

#### Produção

1. Resend Dashboard → Domains → Add Domain (ex: `finflow.app`)
2. Adiciona os DNS records (DKIM, SPF, return-path) no seu provedor de DNS
3. Aguarda verificação (~5 min)
4. Troca `onboarding@resend.dev` por `noreply@finflow.app` em `index.ts`
5. Redeploy

## Test local

```bash
# Inicia ambiente local:
supabase start
supabase functions serve send-password-reset --no-verify-jwt

# Em outro terminal:
curl -X POST http://localhost:54321/functions/v1/send-password-reset \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "seu@email.com"}'

# Resposta esperada: {"ok":true}
# Logs aparecem no terminal do `serve`.
# Se RESEND_API_KEY não estiver setada, o link de recovery é printado no log.
```

## Segurança

- **Não vaza enumeração de emails**: a resposta sempre é `{ok: true}` (200),
  mesmo se o email não existir no banco. Sem isso, atacante poderia
  testar emails pra descobrir quais estão cadastrados.
- **Service role só no servidor**: a Edge Function usa
  `SUPABASE_SERVICE_ROLE_KEY` que tem acesso total ao banco — mas ela
  só roda no servidor do Supabase, nunca expõe pro browser.
- **Rate limit**: o Supabase Edge Functions aplica rate limit automático
  por IP (~30 req/min no free tier). Em produção pode adicionar Cloudflare
  Turnstile ou similar pra prevenir abuso.

## Customização do template

O HTML do email vive em `template.ts`. Editar lá. Brand reference:
- `docs/BRAND.md` v1.2 — voz, tom, vocabulário
- `docs/VISUAL.md` v2.0 — cores, Twin Track, tipografia
- Tokens hardcoded no template (não usa CSS vars porque clientes de email
  não suportam custom properties)

## Próximos emails (TODOs)

- `send-account-deleted` — confirma exclusão de conta
- `send-welcome` — boas-vindas no signup
- `send-login-alert` — alerta de novo device (requer tracking)

Cada um vira uma Edge Function nova nesta pasta.
