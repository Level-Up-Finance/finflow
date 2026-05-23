// =============================================================================
// FinFlow — Edge Function: send-password-reset
// =============================================================================
// Recebe POST { email, redirectTo? } e envia email branded de reset de senha.
//
// Fluxo:
//   1. Valida email
//   2. Gera recovery link via supabase.auth.admin.generateLink (admin/service_role)
//   3. Renderiza template HTML com brand FinFlow (Roxo Tech + Lime)
//   4. Envia via Resend API
//
// Secrets necessários (configurar no Supabase Dashboard → Functions → Secrets):
//   - SUPABASE_URL                 (auto-injetado)
//   - SUPABASE_SERVICE_ROLE_KEY    (auto-injetado)
//   - RESEND_API_KEY               (você precisa adicionar)
//
// Deploy:
//   supabase functions deploy send-password-reset
//
// Test local:
//   supabase functions serve send-password-reset
//   curl -X POST http://localhost:54321/functions/v1/send-password-reset \
//     -H "Authorization: Bearer ANON_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{"email": "seu@email.com"}'
//
// Segurança:
//   - Resposta sempre 200 com {ok: true}, mesmo se email não existir no banco.
//     Evita enumeração de emails (não vaza se conta existe ou não).
//   - Erros internos são logados via console.error mas não aparecem na resposta.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { renderTemplate } from "./template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// `Deno.serve` é a forma idiomática nas Edge Functions do Supabase (Deno 1.36+).
Deno.serve(async (req: Request) => {
  // CORS preflight
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

    // ── 1. Gera recovery link via admin API ────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[send-password-reset] secrets SUPABASE_* faltando");
      // Não vaza no front
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
      // Pode ser "user not found" — não vaza no front
      console.error("[send-password-reset] generateLink:", linkError.message);
      return jsonResponse({ ok: true });
    }

    const recoveryLink = linkData?.properties?.action_link;
    if (!recoveryLink) {
      console.error("[send-password-reset] sem action_link na resposta");
      return jsonResponse({ ok: true });
    }

    // ── 2. Envia email via Resend ──────────────────────────────────────────
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error(
        "[send-password-reset] RESEND_API_KEY não configurada — configurar em Supabase Dashboard → Functions → Secrets",
      );
      // Em desenvolvimento, expõe o link nos logs pra debug
      console.log("[send-password-reset] DEV recovery link:", recoveryLink);
      return jsonResponse({ ok: true });
    }

    // `from` usa o sandbox da Resend até verificar domínio próprio.
    // Após verificar (resend.com → Domains), trocar pra noreply@seudominio.com
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
      // Não vaza no front
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

Esse link vale por 1 hora. Se não foi você que pediu, pode ignorar este email — sua senha continua a mesma.

— Time FinFlow
`;
}
