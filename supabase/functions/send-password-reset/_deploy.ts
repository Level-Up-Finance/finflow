// =============================================================================
// FinFlow — Edge Function: send-password-reset (versão consolidada pra deploy)
// =============================================================================
// Esta é a versão SINGLE-FILE pra colar direto no Dashboard do Supabase.
// O código fonte real está em index.ts + template.ts (2 arquivos).
// Esta versão foi gerada concatenando os dois, pra evitar precisar de
// "Add file" no Dashboard.
//
// Setup:
//   1. Cria função no Dashboard: nome=send-password-reset, verify-jwt=OFF
//   2. Cola ESTE arquivo inteiro como index.ts
//   3. Adiciona secret RESEND_API_KEY em Edge Function Secrets
//   4. Deploy
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email || "").toString().trim().toLowerCase();
    const redirectTo = (body.redirectTo || "").toString().trim();

    if (!isValidEmail(email)) {
      return jsonResponse({ error: "Email inválido" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[send-password-reset] secrets SUPABASE_* faltando");
      return jsonResponse({ ok: true });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin
      .generateLink({
        type: "recovery",
        email,
        options: redirectTo ? { redirectTo } : undefined,
      });

    if (linkError) {
      console.error("[send-password-reset] generateLink:", linkError.message);
      return jsonResponse({ ok: true });
    }

    const recoveryLink = linkData?.properties?.action_link;
    if (!recoveryLink) {
      console.error("[send-password-reset] sem action_link na resposta");
      return jsonResponse({ ok: true });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error(
        "[send-password-reset] RESEND_API_KEY não configurada — configurar em Dashboard → Functions → Secrets",
      );
      console.log("[send-password-reset] DEV recovery link:", recoveryLink);
      return jsonResponse({ ok: true });
    }

    const fromAddress = "FinFlow <onboarding@resend.dev>";
    const userName = email.split("@")[0];
    const html = renderTemplate({ recoveryLink, userName, email });
    const text = renderPlainText({ recoveryLink, userName });

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: email,
        subject: "Redefina sua senha · FinFlow",
        html,
        text,
      }),
    });

    if (!resendResponse.ok) {
      const errBody = await resendResponse.text();
      console.error(
        "[send-password-reset] resend status",
        resendResponse.status,
        errBody,
      );
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[send-password-reset] erro inesperado:", err);
    return jsonResponse({ ok: true });
  }
});

// =============================================================================
// Helpers
// =============================================================================

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function renderPlainText(
  { recoveryLink, userName }: { recoveryLink: string; userName: string },
): string {
  return `Oi, ${userName}!

Recebemos uma solicitação pra redefinir sua senha no FinFlow.

Pra criar uma senha nova, abre este link:
${recoveryLink}

Esse link vale por 1 hora. Se não foi você que pediu, pode ignorar este email, sua senha continua a mesma.

Time FinFlow
`;
}

// =============================================================================
// Template HTML (consolidado de template.ts)
// =============================================================================

interface TemplateData {
  recoveryLink: string;
  userName: string;
  email: string;
}

function renderTemplate(data: TemplateData): string {
  const { recoveryLink, userName, email } = data;
  const escapedName = escapeHtml(userName);
  const escapedEmail = escapeHtml(email);
  const escapedLink = escapeHtml(recoveryLink);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redefina sua senha · FinFlow</title>
</head>
<body style="margin:0; padding:0; background:#FAFAF7; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#0F172A; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
    Use o link abaixo para criar uma nova senha. Vale por 1 hora.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFAF7;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" valign="middle">
                    <svg width="40" height="40" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                      <line x1="14" y1="32" x2="86" y2="32" stroke="#6D5EF5" stroke-width="12" stroke-linecap="round"/>
                      <path d="M14 68 L38 68 L44 50 L56 50 L62 68 L86 68" stroke="#C2F542" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </td>
                  <td style="padding-left:12px; font-size:22px; font-weight:700; color:#0F172A; letter-spacing:-0.02em;">
                    FinFlow
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background:#FFFFFF; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,0.06), 0 6px 24px rgba(109,94,245,0.07);">
          <tr>
            <td style="padding:40px 40px 32px 40px;">
              <h1 style="margin:0 0 8px 0; font-size:24px; font-weight:700; color:#0F172A; letter-spacing:-0.01em; line-height:1.2;">Redefina sua senha</h1>
              <p style="margin:0 0 24px 0; font-size:14px; color:#64748B; line-height:1.5;">Oi, ${escapedName}. Recebemos um pedido pra trocar a senha da sua conta.</p>
              <p style="margin:0 0 24px 0; font-size:16px; color:#0F172A; line-height:1.6;">Clica no botão abaixo pra criar uma nova senha. O link vale por 1 hora.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="background:#6D5EF5; border-radius:12px;">
                    <a href="${escapedLink}" style="display:inline-block; padding:14px 32px; font-size:16px; font-weight:600; color:#FFFFFF; text-decoration:none; border-radius:12px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">Criar nova senha</a>
                  </td>
                </tr>
              </table>
              <p style="margin:32px 0 0 0; font-size:13px; color:#64748B; line-height:1.6;">Se o botão não funcionar, copia e cola este link no navegador:</p>
              <p style="margin:8px 0 0 0; font-size:13px; color:#6D5EF5; line-height:1.6; word-break:break-all;">
                <a href="${escapedLink}" style="color:#6D5EF5; text-decoration:underline;">${escapedLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px;">
              <div style="border-top:1px solid #E2E8F0;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 40px 40px;">
              <p style="margin:0; font-size:13px; color:#64748B; line-height:1.6;">
                <strong style="color:#0F172A;">Não foi você?</strong> Pode ignorar este email, sua senha continua a mesma. Mas se isso aconteceu sem você pedir, considera trocar a senha quando entrar de novo.
              </p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; margin-top:32px;">
          <tr>
            <td align="center" style="padding:16px 40px; font-size:12px; color:#94A3B8; line-height:1.6;">
              <p style="margin:0 0 4px 0;">Este email foi enviado pra <strong style="color:#64748B;">${escapedEmail}</strong></p>
              <p style="margin:0;">FinFlow · Organize compromissos, não tickets de extrato.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
