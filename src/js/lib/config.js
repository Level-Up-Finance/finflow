// =============================================================
// FinFlow — Configuração do Supabase
// =============================================================
//
// PREENCHA estes valores depois de criar seu projeto no Supabase.
// Onde encontrar:
//   1. Acesse https://supabase.com → seu projeto
//   2. Project Settings → API
//   3. Copie "Project URL" e "anon public" key
//
// IMPORTANTE: Esses valores são PÚBLICOS (frontend). Nunca coloque
// aqui a "service_role" key — ela só pode ser usada em servidores
// (Edge Functions). A segurança real vem do RLS no Supabase.
// =============================================================

export const SUPABASE_URL = 'https://meapbdsthewyuugbavzl.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lYXBiZHN0aGV3eXV1Z2JhdnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1ODc2NjgsImV4cCI6MjA5MzE2MzY2OH0.7CnTn1Zxd9W1d6fLeKLJEGbriPlzKO6dnKwBYSiUpS8';

// Defaults que podem ser sobrescritos depois ----------------
export const DEFAULT_CURRENCY = 'BRL';
export const DEFAULT_WIDGET_CURRENCIES = ['USD', 'EUR', 'GBP'];
export const CURRENCY_REFRESH_MS = 5 * 60 * 1000; // 5 min
