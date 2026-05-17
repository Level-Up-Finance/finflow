// scripts/list-tickets.mjs
// Lista todos os tickets (origem='admin' e/ou 'usuario') com campos resumidos.
// Uso: node scripts/list-tickets.mjs [origem]
//   origem: 'admin' | 'usuario' | 'todos' (default: todos)

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

const origem = process.argv[2] || 'todos'

let query = supabase
  .from('feedback')
  .select('codigo, titulo:title, type, status, impacto, complexidade, modulo, origem, description, created_at')
  .order('created_at', { ascending: true })

if (origem !== 'todos') query = query.eq('origem', origem)

const { data, error } = await query

if (error) {
  console.error('Erro:', error.message)
  process.exit(1)
}

console.log(JSON.stringify(data, null, 2))
console.error(`\nTotal: ${data.length} tickets`)
