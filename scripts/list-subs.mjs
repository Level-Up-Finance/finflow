// scripts/list-subs.mjs — lista subcategorias de um user com a categoria pai
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(readFileSync(resolve(__dirname,'../.env.local'),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}))
const s = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const userId = process.argv[2]
if (!userId) { console.error('Uso: node scripts/list-subs.mjs <user_id>'); process.exit(1) }

const { data: cats } = await s.from('categorias').select('id, nome, grupo').eq('user_id', userId).order('nome')
const catById = new Map(cats.map(c => [c.id, c]))

const { data: subs } = await s.from('subcategorias').select('id, nome, categoria_id, tipo, status, valor_base').eq('user_id', userId).order('nome')

console.log(`CATEGORIAS (${cats.length}):`)
for (const c of cats) console.log(`  [${c.grupo}] ${c.nome}`)

console.log(`\nSUBCATEGORIAS (${subs.length}):`)
for (const s2 of subs) {
  const cat = catById.get(s2.categoria_id)
  console.log(`  [${cat?.nome || '?'}] ${s2.nome} (${s2.tipo}, ${s2.status}, R$${s2.valor_base || 0})`)
}
