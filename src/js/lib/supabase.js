// =============================================================
// FinFlow — Cliente Supabase (singleton)
// =============================================================
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[FinFlow] Supabase ainda não configurado.\n' +
    'Edite src/js/lib/config.js com sua SUPABASE_URL e SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export const isSupabaseConfigured = () =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
