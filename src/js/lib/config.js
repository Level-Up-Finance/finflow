// =============================================================
// FinFlow — Configuração do Supabase
// =============================================================
//
// Valores vêm de .env.local (frontend) — variáveis prefixadas com
// VITE_ são expostas via import.meta.env pelo Vite no build.
//
// Configurar em produção (Vercel):
//   Settings → Environment Variables → adicione:
//     VITE_SUPABASE_URL
//     VITE_SUPABASE_ANON_KEY
//     VITE_GOOGLE_PLACES_KEY (opcional, busca CNPJ)
//
// IMPORTANTE: A anon key É pública (frontend). A segurança vem
// do RLS no Supabase. Nunca exponha a service_role key aqui —
// ela só roda em scripts Node ou Edge Functions.
// =============================================================

export const SUPABASE_URL      = import.meta.env?.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

// Refresh de cotações (Frankfurter) — 5 min
export const CURRENCY_REFRESH_MS = 5 * 60 * 1000;
