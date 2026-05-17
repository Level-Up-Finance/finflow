// scripts/check-cats.mjs — diagnóstico das categorias/subcategorias por user
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(readFileSync(resolve(__dirname,'../.env.local'),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}))
const s = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: profiles, error: pErr } = await s.from('profiles').select('id').order('created_at')
console.log('PROFILES:', pErr?.message || `${profiles?.length || 0} rows`)
for (const p of (profiles || [])) console.log(`  ${p.id}`)

console.log('\nCATEGORIAS:')
const { data: cats } = await s.from('categorias').select('id, user_id, nome, grupo, is_default, cor').order('user_id').order('nome')
for (const c of cats) console.log(`  [${c.user_id.slice(0,8)}] ${c.grupo || '?'} :: ${c.nome}${c.is_default ? ' (default)' : ''}`)

console.log('\nSUBCATEGORIAS por user (count):')
const { data: subs } = await s.from('subcategorias').select('user_id, categoria_id, nome')
const byUser = {}
for (const s2 of subs) { byUser[s2.user_id] = (byUser[s2.user_id]||0) + 1 }
for (const [u, n] of Object.entries(byUser)) console.log(`  ${u.slice(0,8)}: ${n} subs`)
