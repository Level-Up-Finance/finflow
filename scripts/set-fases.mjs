// scripts/set-fases.mjs
// Aplica a fase (A..I) em cada ticket conforme o agrupamento lógico sugerido.
// Uso: node scripts/set-fases.mjs

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

// Mapeamento codigo → fase
const MAP = {
  // ── Fase A — Fundações de infraestrutura ──
  'sg.app.000037': 'A', // Staging
  'sg.app.000038': 'A', // GitHub
  'sg.app.000041': 'A', // Super Admin/Usuário
  'sg.app.000039': 'A', // Papéis (Admin/Colaborador/Usuário)
  'sg.app.000062': 'A', // Versão master + planos
  'sg.app.000063': 'A', // Impersonate

  // ── Fase B — Marca e UX ──
  'sg.app.000035': 'B', // Identidade visual
  'sg.app.000036': 'B', // UX review
  'sg.app.000034': 'B', // Auditoria
  'sg.app.000032': 'B', // Feedback plataformas
  'sg.app.000033': 'B', // Jader

  // ── Fase C — Quality of life UX ──
  'sg.app.000049': 'C', // Revisão geral filtros
  'sg.app.000045': 'C', // Auditar filtros Compromissos
  'sg.app.000046': 'C', // View padrão por página
  'sg.app.000047': 'C', // Reorganizar colunas
  'sg.app.000048': 'C', // Reorganizar widgets
  'sg.app.000044': 'C', // Animações
  'sg.app.000064': 'C', // Ordem menu lateral
  'sg.app.000025': 'C', // Sticky header Orçamento

  // ── Fase D — Onboarding, ajuda e academia ──
  'sg.app.000019': 'D', // Onboarding com progresso
  'sg.app.000028': 'D', // Reescrever tutoriais
  'sg.app.000029': 'D', // Gráficos relação módulos
  'sg.app.000030': 'D', // i18n tutoriais
  'sg.app.000031': 'D', // Tutorial pré-populada
  'sg.app.000059': 'D', // Academia link contextual
  'sg.app.000061': 'D', // Modo Ajuda + captação

  // ── Fase E — Funcionalidades nativas ──
  'sg.app.000054': 'E', // Impacto cambial
  'sg.app.000055': 'E', // Contas no exterior
  'sg.app.000067': 'E', // Patrimônio FIPE
  'sg.app.000022': 'E', // Card conta + gráfico
  'sg.app.000023': 'E', // Cheque especial
  'sg.app.000024': 'E', // Limite cartão histórico
  'sg.app.000027': 'E', // Relatórios busca global
  'sg.app.000014': 'E', // Sobre a FinFlow (perfil)
  'sg.app.000016': 'E', // Perfil usuário no gerenciador
  'sg.app.000017': 'E', // Meu perfil visualização
  'sg.app.000018': 'E', // Perfil na comunidade (cross-link com Fase I)
  'sg.app.000020': 'E', // Botão Regenerar Blocos
  'sg.app.000021': 'E', // Fluxo baixa fatura
  'sg.app.000026': 'E', // Integração Orçamento/Compromissos/Pagamentos
  'sg.app.000042': 'E', // Busca endereço internacional
  'sg.app.000043': 'E', // Dados Usuario Gerenciador

  // ── Fase F — Integrações externas ──
  'sg.app.000057': 'F', // Importar contatos do dispositivo
  'sg.app.000056': 'F', // Sync calendar/Notion/Reminders
  'sg.app.000058': 'F', // Importação extrato PDF
  'sg.app.000065': 'F', // Lembretes Email/SMS/WhatsApp

  // ── Fase G — Integrações financeiras ──
  'sg.app.000053': 'G', // Open Finance
  'sg.app.000066': 'G', // Agendar pagamentos via API
  'sg.app.000060': 'G', // Credit score SERASA

  // ── Fase H — AI ──
  'sg.app.000051': 'H', // AI sugere economias
  'sg.app.000052': 'H', // AI WhatsApp

  // ── Fase I — Comunidade e educação ──
  'sg.app.000050': 'I', // Desafios + redes sociais
  'sg.app.000068': 'I', // Comunidade de desafios
  'sg.app.000069': 'I', // Educação financeira

  // ── Sem fase atribuída (deixar NULL) ──
  // 'sg.app.000015' — Popup Compromisso glitchy (bug de UX, pode ir em C ou ser standalone)
  // 'sg.app.000040' — Endereços Internacionais (status=feito, ignorar)
}

let okCount = 0
let errCount = 0
for (const [codigo, fase] of Object.entries(MAP)) {
  const { error } = await supabase.from('feedback').update({ fase }).eq('codigo', codigo)
  if (error) { console.error(`❌ ${codigo}:`, error.message); errCount++ }
  else { okCount++ }
}

// Caso especial: o bug de UX 000015 ainda não tem fase canônica — colocar em C
const { error: uxBugErr } = await supabase.from('feedback').update({ fase: 'C' }).eq('codigo', 'sg.app.000015')
if (uxBugErr) { console.error('❌ 000015:', uxBugErr.message); errCount++ } else { okCount++ }

console.error(`\n=== ${okCount} atualizados, ${errCount} erros ===`)
