// scripts/query.mjs
// Uso: node scripts/query.mjs <codigo>
// Ex:  node scripts/query.mjs sg.app.00004

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Lê .env.local manualmente (sem dependência extra)
function loadEnv() {
  const envPath = resolve(__dirname, '../.env.local')
  const lines = readFileSync(envPath, 'utf8').split('\n')
  const env = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
  return env
}

const env = loadEnv()
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const codigo = process.argv[2]
if (!codigo) {
  console.error('Uso: node scripts/query.mjs <codigo>\nEx:  node scripts/query.mjs sg.app.00004')
  process.exit(1)
}

const { data, error } = await supabase
  .from('feedback')
  .select('*')
  .eq('codigo', codigo)
  .single()

if (error) {
  console.error('Erro:', error.message)
  process.exit(1)
}

console.log(JSON.stringify(data, null, 2))
