// scripts/seed-from-sheet.mjs
// Cria categorias e subcategorias do user com base na planilha
// "Cópia de Orçamento" (Google Sheets). Idempotente: não duplica
// nada que já exista.
//
// Uso: node scripts/seed-from-sheet.mjs <user_id>

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(readFileSync(resolve(__dirname,'../.env.local'),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}))
const s = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const userId = process.argv[2]
if (!userId) { console.error('Uso: node scripts/seed-from-sheet.mjs <user_id>'); process.exit(1) }

// ── Estrutura derivada da planilha ─────────────────────────────────────────
// { nomeCategoria, grupo, subs: [nome, ...] }
// Categorias com is_default já existem; só criamos novas com is_default=false.
const STRUCTURE = [
  // Existentes
  { nome: 'Receita',             grupo: 'receitas',      tipo: 'Receita', subs: [
    'True North', 'Renda Casa 01SP', 'Debito Jonatas',
    'Level Up Agency', 'SoftMagic', 'Leftover',
  ]},
  { nome: 'Dívidas',             grupo: 'dividas',       tipo: 'Despesa', subs: [
    '31.344 - Dívida DAS', '31.344 - INSS', 'DAS LCE',
  ]},
  { nome: 'Investimentos',       grupo: 'investimentos', tipo: 'Despesa', subs: [
    'Fundo de Emergência', 'Invest + Mesada Oliver', 'Invest Zach',
  ]},
  { nome: 'Casa',                grupo: 'custo_vida',    tipo: 'Despesa', subs: [
    'Aluguel / Tarifa Boleto', 'IPTU', 'Condominio / Água / Esgoto',
    'Internet (NeoLink)', 'Gás', 'Água de Beber', 'Construção Civil',
  ]},
  { nome: 'Educação e Saúde',    grupo: 'custo_vida',    tipo: 'Despesa', subs: [
    'Escola Oliver', 'Jiu-Jitsu Oliver', 'Curso ADIN',
    'Academia - Arnaldo', 'Academia - Luciana',
    'Clinica Experts Adicionais', 'Clinica Experts Assinatura',
    'Seguro de Vida - Allianz', 'Barbearia',
    'Material, Uniforme, Rematricula', 'SulAmerica',
  ]},
  { nome: 'Doações e Presentes', grupo: 'custo_vida',    tipo: 'Despesa', subs: [
    'Doação - Tia Lúcia', 'Doação - Custos Mãe',
  ]},

  // Novas categorias
  { nome: 'Variáveis',  grupo: 'custo_vida', tipo: 'Despesa', subs: [
    'Lazer & Restaurantes', 'Supermercado', 'Combustível', 'Faxineira',
  ]},
  { nome: 'Transporte', grupo: 'custo_vida', tipo: 'Despesa', subs: [
    'Carro - Prestação Heloisa', 'Carro - Prestação Herique',
    'IPVA', 'Seguro Carro', 'Veloe - Est. & Pedágios', 'Limpeza Carro',
  ]},
  { nome: 'Cartões',    grupo: 'custo_vida', tipo: 'Despesa', subs: [
    'Cartão - NuCard', 'Cartão - LATAM', 'Cartão - C6', 'Cartão - Inter',
    'Assinaturas Pagas no Cartão',
  ]},
  { nome: 'Tecnologia', grupo: 'custo_vida', tipo: 'Despesa', subs: [
    'NuCel Oliver', 'Celular - Vivo', 'YouTube',
  ]},
  { nome: 'Outros',     grupo: 'custo_vida', tipo: 'Despesa', subs: [
    'Project: LCE', 'Project: NXLevel', 'Project: Corevia',
    'Sam Neves', 'Jhow Silva', 'Loteria',
  ]},
]

// Cores sugeridas pra novas categorias (paleta consistente do app)
const CORES_NOVAS = {
  'Variáveis':  '#F59E0B',
  'Transporte': '#06B6D4',
  'Cartões':    '#8B5CF6',
  'Tecnologia': '#0EA5E9',
  'Outros':     '#94A3B8',
}

// ── 1) Lê estado atual ─────────────────────────────────────────────────────
const { data: existingCats } = await s.from('categorias').select('id, nome, grupo').eq('user_id', userId)
const { data: existingSubs } = await s.from('subcategorias').select('id, nome, categoria_id').eq('user_id', userId)

const catByNome = new Map()
for (const c of existingCats) {
  // normaliza pra comparação case-insensitive
  catByNome.set(c.nome.toLowerCase().trim(), c)
}

const subByCatNome = new Map() // key: `${catId}|${subNomeLower}` → sub
for (const sub of existingSubs) {
  subByCatNome.set(`${sub.categoria_id}|${sub.nome.toLowerCase().trim()}`, sub)
}

// ── 2) Cria categorias faltantes ───────────────────────────────────────────
console.error('\n=== CATEGORIAS ===')
const catRowsToInsert = []
for (const item of STRUCTURE) {
  if (catByNome.has(item.nome.toLowerCase().trim())) {
    console.error(`✓ Já existe: ${item.nome}`)
  } else {
    catRowsToInsert.push({
      user_id: userId,
      nome:    item.nome,
      grupo:   item.grupo,
      cor:     CORES_NOVAS[item.nome] || '#94A3B8',
      ativo:   true,
      is_default: false,
    })
  }
}
if (catRowsToInsert.length > 0) {
  const { data: inserted, error } = await s.from('categorias').insert(catRowsToInsert).select('id, nome, grupo')
  if (error) { console.error('❌ erro ao inserir categorias:', error.message); process.exit(1) }
  for (const c of inserted) {
    console.error(`+ Criada: ${c.nome} (${c.grupo})`)
    catByNome.set(c.nome.toLowerCase().trim(), c)
  }
}

// ── 3) Cria subcategorias faltantes ────────────────────────────────────────
console.error('\n=== SUBCATEGORIAS ===')
const subRowsToInsert = []
for (const item of STRUCTURE) {
  const cat = catByNome.get(item.nome.toLowerCase().trim())
  if (!cat) { console.error(`⚠ Sem categoria pra: ${item.nome}`); continue }

  for (const subNome of item.subs) {
    const key = `${cat.id}|${subNome.toLowerCase().trim()}`
    if (subByCatNome.has(key)) {
      console.error(`✓ Já existe: [${item.nome}] ${subNome}`)
    } else {
      subRowsToInsert.push({
        user_id:     userId,
        categoria_id: cat.id,
        nome:        subNome,
        tipo:        item.tipo,
        periodo:     'Mensal',
        valor_base:  0,
        status:      'ativa',
        moeda:       'BRL',
      })
    }
  }
}

if (subRowsToInsert.length > 0) {
  // Insere em lotes pra evitar payload grande
  const { data: insertedSubs, error } = await s.from('subcategorias').insert(subRowsToInsert).select('nome, categoria_id')
  if (error) { console.error('❌ erro ao inserir subs:', error.message); process.exit(1) }
  for (const sub of insertedSubs) {
    const cat = existingCats.find(c => c.id === sub.categoria_id) || [...catByNome.values()].find(c => c.id === sub.categoria_id)
    console.error(`+ Criada: [${cat?.nome || '?'}] ${sub.nome}`)
  }
}

console.error(`\n=== RESUMO ===`)
console.error(`Categorias criadas: ${catRowsToInsert.length}`)
console.error(`Subcategorias criadas: ${subRowsToInsert.length}`)
