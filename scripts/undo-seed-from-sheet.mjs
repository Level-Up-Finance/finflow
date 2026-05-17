// scripts/undo-seed-from-sheet.mjs
// Desfaz o que scripts/seed-from-sheet.mjs criou:
//   • apaga as 56 subcategorias que foram inseridas (por nome + user)
//   • apaga as 5 categorias novas (Variáveis, Transporte, Cartões,
//     Tecnologia, Outros) — só se ficarem sem subs
//
// Não toca em nada que já existia antes do seed.
//
// Uso: node scripts/undo-seed-from-sheet.mjs <user_id>

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(readFileSync(resolve(__dirname,'../.env.local'),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}))
const s = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const userId = process.argv[2]
if (!userId) { console.error('Uso: node scripts/undo-seed-from-sheet.mjs <user_id>'); process.exit(1) }

// Mesmas listas do seed (para identificar com precisão o que apagar)
const SUBS_TO_DELETE = [
  // Receita
  'True North', 'Renda Casa 01SP', 'Debito Jonatas',
  'Level Up Agency', 'SoftMagic', 'Leftover',
  // Dívidas
  '31.344 - Dívida DAS', '31.344 - INSS', 'DAS LCE',
  // Investimentos
  'Fundo de Emergência', 'Invest + Mesada Oliver', 'Invest Zach',
  // Casa
  'Aluguel / Tarifa Boleto', 'IPTU', 'Condominio / Água / Esgoto',
  'Internet (NeoLink)', 'Gás', 'Água de Beber', 'Construção Civil',
  // Educação e Saúde
  'Escola Oliver', 'Jiu-Jitsu Oliver', 'Curso ADIN',
  'Academia - Arnaldo', 'Academia - Luciana',
  'Clinica Experts Adicionais', 'Clinica Experts Assinatura',
  'Seguro de Vida - Allianz', 'Barbearia',
  'Material, Uniforme, Rematricula', 'SulAmerica',
  // Doações
  'Doação - Tia Lúcia', 'Doação - Custos Mãe',
  // Variáveis
  'Lazer & Restaurantes', 'Supermercado', 'Combustível', 'Faxineira',
  // Transporte
  'Carro - Prestação Heloisa', 'Carro - Prestação Herique',
  'IPVA', 'Seguro Carro', 'Veloe - Est. & Pedágios', 'Limpeza Carro',
  // Cartões
  'Cartão - NuCard', 'Cartão - LATAM', 'Cartão - C6', 'Cartão - Inter',
  'Assinaturas Pagas no Cartão',
  // Tecnologia
  'NuCel Oliver', 'Celular - Vivo', 'YouTube',
  // Outros
  'Project: LCE', 'Project: NXLevel', 'Project: Corevia',
  'Sam Neves', 'Jhow Silva', 'Loteria',
]

const CATEGORIAS_NOVAS = ['Variáveis', 'Transporte', 'Cartões', 'Tecnologia', 'Outros']

// ── 1) Apaga subcategorias ──────────────────────────────────────────────────
const { data: subsBefore } = await s.from('subcategorias')
  .select('id, nome')
  .eq('user_id', userId)
  .in('nome', SUBS_TO_DELETE)

console.error(`\n=== SUBCATEGORIAS — ${subsBefore.length} a apagar ===`)
const { error: subDelErr } = await s.from('subcategorias')
  .delete()
  .eq('user_id', userId)
  .in('nome', SUBS_TO_DELETE)
if (subDelErr) { console.error('❌ erro ao apagar subs:', subDelErr.message); process.exit(1) }
for (const sub of subsBefore) console.error(`- removida: ${sub.nome}`)

// ── 2) Apaga categorias novas (só se ficaram sem subs) ──────────────────────
const { data: catsBefore } = await s.from('categorias')
  .select('id, nome, is_default')
  .eq('user_id', userId)
  .in('nome', CATEGORIAS_NOVAS)
  .eq('is_default', false)

console.error(`\n=== CATEGORIAS — ${catsBefore.length} candidatas a apagar ===`)
for (const cat of catsBefore) {
  const { count } = await s.from('subcategorias')
    .select('id', { count: 'exact', head: true })
    .eq('categoria_id', cat.id)
  if (count > 0) {
    console.error(`⚠ Mantendo "${cat.nome}" — ainda tem ${count} sub(s)`)
    continue
  }
  const { error } = await s.from('categorias').delete().eq('id', cat.id)
  if (error) console.error(`❌ ${cat.nome}:`, error.message)
  else console.error(`- removida: ${cat.nome}`)
}

console.error(`\n=== DONE ===`)
