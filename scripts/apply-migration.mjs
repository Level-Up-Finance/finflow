// scripts/apply-migration.mjs
// Aplica um arquivo SQL via service role.
// Uso: node scripts/apply-migration.mjs <arquivo.sql>

// Nota: usamos `fetch` direto pro endpoint REST do Supabase (linha ~37),
// não o cliente JS — porque o cliente não expõe RAW SQL.
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
const file = process.argv[2]
if (!file) { console.error('Uso: node scripts/apply-migration.mjs <arquivo.sql>'); process.exit(1) }

const sql = readFileSync(resolve(__dirname, '..', file), 'utf8')

// Supabase JS não expõe RAW SQL diretamente; usar Postgres REST via fetch ao endpoint /rest/v1/rpc/exec_sql
// (precisa de função SQL `exec_sql(query text)` ou similar). Como alternativa simples,
// usamos o endpoint /rest/v1/sql que algumas instalações expõem. Se falhar, instrui o usuário
// a colar no SQL Editor.
const url = env.SUPABASE_URL + '/rest/v1/sql'
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
})

if (!res.ok) {
  console.error(`❌ Status ${res.status}:`, await res.text())
  console.error('\nDica: cole o conteúdo do arquivo no Supabase Dashboard → SQL Editor manualmente:')
  console.error('Arquivo:', file)
  process.exit(1)
}

console.error('✓ Migração aplicada com sucesso')
