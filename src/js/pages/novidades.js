// =============================================================
// FinFlow — Página: Novidades
// Layout: últimas 3 versões em destaque + histórico compacto
//         + bloco "Em desenvolvimento" (feedback aprovado)
// =============================================================
import { guardSession } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { CHANGELOG } from '../lib/changelog.js';
import { supabase } from '../lib/supabase.js';
import { escapeHtml } from '../lib/utils.js';
import { loadStrings, applyTranslationsToDom } from '../lib/textos.js';

const LS_KEY = 'finflow:changelog:seen';

const TYPE_LABELS = {
  new:         'Novidade',
  fix:         'Correção',
  improvement: 'Melhoria',
};

const FB_TYPE_LABELS = {
  bug:      'Bug',
  sugestao: 'Sugestão',
  feature:  'Funcionalidade',
  pergunta: 'Pergunta',
  elogio:   'Elogio',
  parceria: 'Parceria',
};

const MODULOS = {
  dashboard:    'Dashboard',
  transacoes:   'Transações',
  pagamentos:   'Pagamentos',
  contas:       'Contas',
  compromissos: 'Compromissos',
  orcamento:    'Orçamento',
  dividas:      'Dívidas',
  investimentos:'Investimentos',
  relatorios:   'Relatórios',
  contatos:     'Contatos',
  importar:     'Importar extrato',
  perfil:       'Perfil & Configurações',
  admin:        'Admin',
  outros:       'Outros',
};

function markSeen() {
  if (CHANGELOG.length > 0) localStorage.setItem(LS_KEY, CHANGELOG[0].id);
}

async function loadAprovadas() {
  const { data, error } = await supabase
    .from('feedback')
    .select('id, type, title, modulo')
    .eq('status', 'aprovada')
    .order('updated_at', { ascending: false });

  if (error) {
    console.debug('[novidades] aprovadas load failed:', error.message);
    return [];
  }
  return data || [];
}

// ── Featured changelog (last 3) ───────────────────────────────

function renderFeatured() {
  const container = document.getElementById('nov-featured');
  if (!container) return;

  const featured = CHANGELOG.slice(0, 3);

  if (!featured.length) {
    container.innerHTML = '<p class="field-hint">Nenhuma versão registrada ainda.</p>';
    return;
  }

  container.innerHTML = featured.map((entry) => `
    <article class="nov-featured-card">
      <div class="nov-featured-header">
        <div class="nov-featured-meta">
          ${entry.version ? `<span class="nov-version-badge">v${escapeHtml(entry.version)}</span>` : ''}
          <span class="nov-featured-title">${escapeHtml(entry.title)}</span>
        </div>
        <span class="nov-featured-date">${escapeHtml(entry.date)}</span>
      </div>
      <ul class="nov-featured-items">
        ${entry.items.map((item) => `
          <li class="nov-featured-item">
            <span class="cfg-changelog-type cfg-changelog-type--${item.type}">${TYPE_LABELS[item.type] || item.type}</span>
            <span>${escapeHtml(item.text)}</span>
          </li>
        `).join('')}
      </ul>
    </article>
  `).join('');
}

// ── Compact history (entries 4+) ──────────────────────────────

function renderHistory() {
  const section    = document.getElementById('nov-history-section');
  const container  = document.getElementById('nov-history-list');
  if (!section || !container) return;

  const older = CHANGELOG.slice(3);
  if (!older.length) return;

  section.classList.remove('hidden');

  container.innerHTML = older.map((entry) => `
    <div class="nov-history-row">
      ${entry.version ? `<span class="nov-history-version">v${escapeHtml(entry.version)}</span>` : ''}
      <span class="nov-history-title">${escapeHtml(entry.title)}</span>
      <span class="nov-history-date">${escapeHtml(entry.date)}</span>
    </div>
  `).join('');
}

// ── Aprovadas para desenvolvimento ────────────────────────────

function renderAprovadas(aprovadas) {
  const section   = document.getElementById('nov-aprovadas-section');
  const container = document.getElementById('nov-aprovadas-list');
  const topGrid   = document.getElementById('nov-top-grid');
  if (!section || !container) return;

  if (!aprovadas.length) return;

  section.classList.remove('hidden');
  topGrid?.classList.add('has-aprovadas');

  container.innerHTML = aprovadas.map((fb) => `
    <div class="nov-aprovada-card">
      <span class="feedback-type-pill feedback-type-pill--${escapeHtml(fb.type)}">${escapeHtml(FB_TYPE_LABELS[fb.type] || fb.type)}</span>
      <span class="nov-aprovada-title">${escapeHtml(fb.title)}</span>
      ${fb.modulo && fb.modulo !== 'outros' ? `<span class="nov-aprovada-modulo">${escapeHtml(MODULOS[fb.modulo] || fb.modulo)}</span>` : ''}
    </div>
  `).join('');
}

// ── Main ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  markSeen();
  await initSidebar('novidades');
  await loadStrings();
  applyTranslationsToDom();

  renderFeatured();
  renderHistory();

  const aprovadas = await loadAprovadas();
  renderAprovadas(aprovadas);
});
