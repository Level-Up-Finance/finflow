// =============================================================
// FinFlow — Contatos
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar }                  from '../components/sidebar.js';
import { initTutorial } from '../lib/tutorial.js';
import { supabase }                     from '../lib/supabase.js';
import { showToast }                    from '../components/toast.js';
import { formatCurrency }               from '../lib/compromissos-config.js';
import { escapeHtml, formatDateBR } from '../lib/utils.js';
import { fetchCnpjData, isValidCnpj, formatCnpj, digitsOnly, googleCnpjSearchUrl, inferLogoUrl, checkImageExists } from '../lib/cnpj-lookup.js';
import { t, loadStrings, applyTranslationsToDom } from '../lib/textos.js';

// ── State ─────────────────────────────────────────────────────
let cachedContatos      = [];
let cachedSubcategorias = [];
let cachedCategorias    = [];
let cachedContas        = [];
let cachedDividas       = [];
let cachedProjetos      = [];
let selectedId          = null;
let editingId           = null;
let pendingDeleteId     = null;
let filterTipo          = 'all';   // 'all' | 'cliente' | 'fornecedor' | 'arquivados'
let filterPessoa        = new Set(); // subset de {'fisica', 'juridica'} (vazio = todos)
let searchQuery         = '';
let activeTab           = 'dados';

const TIPO_LABELS = { cliente: 'Cliente', fornecedor: 'Fornecedor', ambos: 'Cliente / Fornecedor' };
const TIPO_COLORS = { cliente: '#3b82f6', fornecedor: '#8b5cf6', ambos: '#64748b' };

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('contatos');
  initTutorial('contatos');
  await loadStrings();
  applyTranslationsToDom();
  await loadData();
  bindEvents();
  renderList();
});

async function loadData() {
  const [contatosRes, subRes, catRes, contasRes, divRes, projRes] = await Promise.all([
    supabase.from('contatos').select('*').order('nome'),
    supabase.from('subcategorias').select('id, nome, apelido, categoria_id').neq('status', 'arquivada').order('nome'),
    supabase.from('categorias').select('id, nome').order('nome'),
    supabase.from('contas').select('id, nome, apelido').order('nome'),
    supabase.from('dividas').select('id, nome, valor_total, status, data_inicio, data_vencimento, contato_id, conta_id').order('nome'),
    supabase.from('projetos_investimento').select('id, nome, status, cor, meta_valor, data_alvo, contato_id').order('nome'),
  ]);
  cachedContatos      = contatosRes.data || [];
  cachedSubcategorias = subRes.data      || [];
  cachedCategorias    = catRes.data      || [];
  cachedContas        = contasRes.data   || [];
  cachedDividas       = divRes.data      || [];
  cachedProjetos      = projRes.data     || [];
}

async function reloadContatos() {
  const { data } = await supabase.from('contatos').select('*').order('nome');
  cachedContatos = data || [];
}

// ── List ──────────────────────────────────────────────────────
function filteredContatos() {
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = norm(searchQuery);
  const isArchivedView = filterTipo === 'arquivados';

  return cachedContatos.filter((c) => {
    const isArchived = c.status === 'arquivado';

    // Tipo: arquivados-view só mostra arquivados; outras views excluem arquivados
    if (isArchivedView) {
      if (!isArchived) return false;
    } else {
      if (isArchived) return false;
      if (filterTipo !== 'all' && c.tipo !== filterTipo) return false;
    }

    // Pessoa/Empresa: vazio = mostra tudo; senão precisa estar no set
    if (filterPessoa.size > 0 && !filterPessoa.has(c.pessoa_tipo)) return false;

    if (!q) return true;
    return norm(c.nome).includes(q) || norm(c.nome_extrato || '').includes(q) || norm(c.email || '').includes(q);
  });
}

function getInitial(nome) {
  const c = (nome || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}

function renderList() {
  const list = document.getElementById('ct-list');
  const countEl = document.getElementById('ct-list-count');
  const contatos = filteredContatos();
  const isArchivedView = filterTipo === 'arquivados';
  // Total da view atual: arquivados quando filter='arquivados', ativos caso contrário
  const total = cachedContatos.filter((c) =>
    isArchivedView ? c.status === 'arquivado' : c.status !== 'arquivado',
  ).length;

  // Atualiza contagem
  if (countEl) {
    const noun = isArchivedView ? 'arquivado' : 'contato';
    const nounPlural = isArchivedView ? 'arquivados' : 'contatos';
    if (total === 0) {
      countEl.textContent = isArchivedView ? 'Nenhum arquivado' : '';
    } else if (contatos.length === total) {
      countEl.textContent = `${total} ${total === 1 ? noun : nounPlural}`;
    } else {
      countEl.textContent = `${contatos.length} de ${total}`;
    }
  }

  if (contatos.length === 0) {
    list.innerHTML = `<div class="ctp-list-empty">Nenhum contato encontrado.</div>`;
    return;
  }

  // Agrupa por inicial e renderiza com headers sticky
  let html = '';
  let lastInitial = null;
  for (const c of contatos) {
    const initial = getInitial(c.nome);
    if (initial !== lastInitial) {
      html += `<div class="ctp-list-letter">${initial}</div>`;
      lastInitial = initial;
    }
    const initials = avatarInitials(c.nome);
    const color    = TIPO_COLORS[c.tipo] || '#64748b';
    const isArq    = c.status === 'arquivado';
    const showC = c.tipo === 'cliente'    || c.tipo === 'ambos';
    const showF = c.tipo === 'fornecedor' || c.tipo === 'ambos';
    const letters = `
      ${showC ? '<span class="ctp-tipo-letter cliente" title="Cliente">C</span>' : ''}
      ${showF ? '<span class="ctp-tipo-letter fornecedor" title="Fornecedor">F</span>' : ''}
    `;
    const avatarInner = c.logo_url
      ? `<span class="ctp-avatar-initials">${initials}</span><img src="${escapeHtml(c.logo_url)}" alt="" onerror="this.remove()">`
      : initials;
    const meta = [TIPO_LABELS[c.tipo] || c.tipo, isArq ? 'Arquivado' : null].filter(Boolean).join(' · ');
    html += `<div class="ctp-list-item ${c.id === selectedId ? 'is-selected' : ''} ${isArq ? 'is-archived' : ''}"
                  data-id="${c.id}" role="button" tabindex="0">
      <div class="ctp-list-tipos">${letters}</div>
      <div class="ctp-list-avatar" style="background:${color}">${avatarInner}</div>
      <div class="ctp-list-info">
        <div class="ctp-list-name">${escapeHtml(c.nome)}</div>
        <div class="ctp-list-meta">${escapeHtml(meta)}</div>
      </div>
    </div>`;
  }
  list.innerHTML = html;

  list.querySelectorAll('.ctp-list-item').forEach((el) => {
    el.addEventListener('click', () => selectContact(el.dataset.id));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectContact(el.dataset.id); });
  });
}

// ── Detail ────────────────────────────────────────────────────
async function selectContact(id) {
  selectedId = id;
  renderList();

  const c = cachedContatos.find((x) => x.id === id);
  if (!c) return;

  document.getElementById('ct-detail-empty').classList.add('hidden');
  document.getElementById('ct-detail-content').classList.remove('hidden');

  renderDetailHeader(c);
  switchTab('dados');

  // Mobile: rola pra mostrar o painel de detalhe
  if (window.matchMedia('(max-width: 900px)').matches) {
    setTimeout(() => {
      document.querySelector('.ctp-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }
  renderDadosTab(c);
  renderVinculosTab(id);
  loadBancoTab(id);
  loadTransacoesTab(id);
}

function renderDetailHeader(c) {
  const initials = avatarInitials(c.nome);
  const color    = TIPO_COLORS[c.tipo] || '#64748b';
  const isArq    = c.status === 'arquivado';

  const avatarEl = document.getElementById('ct-detail-avatar');
  avatarEl.style.background = color;
  if (c.logo_url) {
    avatarEl.innerHTML = `<span class="ctp-avatar-initials">${initials}</span><img src="${escapeHtml(c.logo_url)}" alt="" onerror="this.remove()">`;
  } else {
    avatarEl.textContent = initials;
  }

  document.getElementById('ct-detail-name').textContent  = c.nome;
  document.getElementById('ct-detail-tipo').textContent  = TIPO_LABELS[c.tipo] || c.tipo;

  const statusBadge = document.getElementById('ct-detail-status-badge');
  statusBadge.classList.toggle('hidden', !isArq);

  const archBtn = document.getElementById('btn-arquivar-contato');
  archBtn.textContent  = isArq ? 'Reativar' : 'Arquivar';
  archBtn.dataset.id   = c.id;

  document.getElementById('btn-editar-contato').dataset.id = c.id;
  document.getElementById('btn-deletar-contato').dataset.id = c.id;
}

const PESSOA_LABELS = { fisica: 'Pessoa Física', juridica: 'Pessoa Jurídica' };

// Helpers para links clicáveis
function ensureUrl(s) {
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
function instagramHandle(s) { return (s || '').replace(/^@/, '').trim(); }
function linkedinUrl(s) {
  const t = (s || '').trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://www.linkedin.com/in/${t.replace(/^\/+/, '')}`;
}
function aniversarioDM(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

function renderDadosTab(c) {
  const docLabel = c.pessoa_tipo === 'fisica' ? 'CPF'
                 : c.pessoa_tipo === 'juridica' ? 'CNPJ'
                 : 'Documento';

  // Cada item: { label, value, hint?, full?, html? (HTML em vez de texto puro) }
  const fields = [
    { label: 'Pessoa / Empresa', value: PESSOA_LABELS[c.pessoa_tipo] || '' },
    { label: 'Tipo',             value: TIPO_LABELS[c.tipo] || c.tipo },
    { label: 'Nome',             value: c.nome },
    { label: docLabel,           value: c.documento },
    {
      label: 'Nome no extrato', value: c.nome_extrato,
      hint: 'Usado para reconhecimento por texto',
    },
    {
      label: 'E-mail', value: c.email,
      html: c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : null,
    },
    {
      label: 'Website', value: c.website,
      html: c.website ? `<a href="${escapeHtml(ensureUrl(c.website))}" target="_blank" rel="noopener">${escapeHtml(c.website)}</a>` : null,
    },
    { label: 'Telefone', value: c.telefone },
    {
      label: 'WhatsApp', value: c.whatsapp,
      html: c.whatsapp ? `<a href="https://wa.me/${escapeHtml(digitsOnly(c.whatsapp))}" target="_blank" rel="noopener">${escapeHtml(c.whatsapp)}</a>` : null,
    },
    {
      label: 'LinkedIn', value: c.linkedin,
      html: c.linkedin ? `<a href="${escapeHtml(linkedinUrl(c.linkedin))}" target="_blank" rel="noopener">${escapeHtml(c.linkedin)}</a>` : null,
    },
    {
      label: 'Instagram', value: c.instagram,
      html: c.instagram ? `<a href="https://instagram.com/${escapeHtml(instagramHandle(c.instagram))}" target="_blank" rel="noopener">@${escapeHtml(instagramHandle(c.instagram))}</a>` : null,
    },
    ...(c.pessoa_tipo === 'fisica' ? [
      { label: 'Empresa', value: c.empresa },
      { label: 'Cargo',   value: c.cargo },
    ] : []),
    { label: 'Aniversário', value: aniversarioDM(c.aniversario) },
    { label: 'Endereço',    value: c.endereco, full: true },
    { label: 'Observação',  value: c.observacao, full: true },
  ];

  document.getElementById('ct-dados-content').innerHTML = fields.map((f) => `
    <div class="ctp-field${f.full ? ' ctp-field--full' : ''}">
      <div class="ctp-field-label">${f.label}</div>
      <div class="${f.value ? 'ctp-field-value' : 'ctp-field-empty'}">${f.value ? (f.html || escapeHtml(f.value)) : '—'}</div>
      ${f.hint && f.value ? `<div class="ctp-field-hint">${f.hint}</div>` : ''}
    </div>`).join('');
}

const DIVIDA_STATUS_LABELS = {
  Ativa: 'Ativa',
  Negociando: 'Negociando',
  Atrasada: 'Atrasada',
  Quitada: 'Quitada',
};
const PROJETO_STATUS_LABELS = {
  ativo: 'Ativo',
  concluido: 'Concluído',
  pausado: 'Pausado',
  arquivado: 'Arquivado',
};

function renderVinculosTab(contatoId) {
  const panel = document.getElementById('ct-vinculos-content');
  const dividas  = cachedDividas.filter((d) => d.contato_id === contatoId);
  const projetos = cachedProjetos.filter((p) => p.contato_id === contatoId);

  const divHtml = dividas.length === 0
    ? `<div class="ctp-empty-state">Nenhuma dívida vinculada.</div>`
    : `<div class="ctp-vinc-list">` + dividas.map((d) => `
        <a class="ctp-vinc-item" href="dividas.html#div-${d.id}">
          <div class="ctp-vinc-info">
            <div class="ctp-vinc-name">${escapeHtml(d.nome)}</div>
            <div class="ctp-vinc-meta">
              <span class="ctp-vinc-status status-${(d.status || 'Ativa').toLowerCase()}">${escapeHtml(DIVIDA_STATUS_LABELS[d.status] || d.status || 'Ativa')}</span>
              ${d.data_vencimento ? `<span>· vence ${formatDateBR(d.data_vencimento)}</span>` : ''}
            </div>
          </div>
          <div class="ctp-vinc-value">${formatCurrency(d.valor_total || 0, 'BRL')}</div>
        </a>
      `).join('') + `</div>`;

  const projHtml = projetos.length === 0
    ? `<div class="ctp-empty-state">Nenhum projeto de investimento vinculado.</div>`
    : `<div class="ctp-vinc-list">` + projetos.map((p) => `
        <a class="ctp-vinc-item" href="investimentos.html#proj-${p.id}" style="--proj-cor: ${p.cor || '#6D5EF5'};">
          <div class="ctp-vinc-dot" style="background: ${p.cor || '#6D5EF5'};"></div>
          <div class="ctp-vinc-info">
            <div class="ctp-vinc-name">${escapeHtml(p.nome)}</div>
            <div class="ctp-vinc-meta">
              <span class="ctp-vinc-status status-${(p.status || 'ativo')}">${escapeHtml(PROJETO_STATUS_LABELS[p.status] || p.status || 'Ativo')}</span>
              ${p.data_alvo ? `<span>· alvo ${formatDateBR(p.data_alvo)}</span>` : ''}
            </div>
          </div>
          <div class="ctp-vinc-value">${p.meta_valor ? formatCurrency(p.meta_valor, 'BRL') : '—'}</div>
        </a>
      `).join('') + `</div>`;

  panel.innerHTML = `
    <section class="ctp-vinc-section">
      <h3 class="ctp-vinc-section-title">Dívidas <span class="ctp-vinc-count">${dividas.length}</span></h3>
      ${divHtml}
    </section>
    <section class="ctp-vinc-section">
      <h3 class="ctp-vinc-section-title">Projetos de investimento <span class="ctp-vinc-count">${projetos.length}</span></h3>
      ${projHtml}
    </section>
  `;
}

async function loadBancoTab(contatoId) {
  const panel = document.getElementById('ct-banco-content');
  panel.innerHTML = '<div class="ctp-loading">Carregando…</div>';

  const { data, error } = await supabase
    .from('contato_banco_descs')
    .select('id, banco_desc, last_subcategoria_id, created_at')
    .eq('contato_id', contatoId)
    .order('created_at', { ascending: false });

  if (error && /relation.*contato_banco_descs/i.test(error.message)) {
    panel.innerHTML = `<div class="ctp-empty-state">Tabela não encontrada. Execute a migration 0030_contato_banco_descs.sql no Supabase.</div>`;
    return;
  }

  if (!data || data.length === 0) {
    panel.innerHTML = `<div class="ctp-empty-state">
      <p>Nenhum padrão aprendido ainda.</p>
      <p style="font-size:var(--fs-xs); color:var(--color-text-muted); margin-top:var(--space-2);">Padrões são registrados automaticamente ao salvar uma transação importada vinculada a este contato.</p>
    </div>`;
    return;
  }

  const subById = new Map(cachedSubcategorias.map((s) => [s.id, s]));
  const catById = new Map(cachedCategorias.map((c) => [c.id, c]));

  panel.innerHTML = `<div class="ctp-banco-list">` + data.map((row) => {
    const sub      = row.last_subcategoria_id ? subById.get(row.last_subcategoria_id) : null;
    const cat      = sub ? catById.get(sub.categoria_id) : null;
    const subLabel = sub
      ? `${cat ? escapeHtml(cat.nome) + ' · ' : ''}${escapeHtml(sub.apelido || sub.nome)}`
      : '<span style="color:var(--color-text-muted)">—</span>';
    const date = new Date(row.created_at).toLocaleDateString('pt-BR');
    return `<div class="ctp-banco-item">
      <div class="ctp-banco-desc" title="${escapeHtml(row.banco_desc)}">${escapeHtml(row.banco_desc)}</div>
      <div class="ctp-banco-sub">${subLabel}</div>
      <div class="ctp-banco-date">${date}</div>
      <button class="btn-icon" data-delete-bd="${row.id}" title="Remover mapeamento">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>`;
  }).join('') + `</div>`;

  panel.querySelectorAll('[data-delete-bd]').forEach((btn) => {
    btn.addEventListener('click', () => deleteBancoDesc(btn.dataset.deleteBd, contatoId));
  });
}

async function deleteBancoDesc(id, contatoId) {
  const { error } = await supabase.from('contato_banco_descs').delete().eq('id', id);
  if (error) { showToast('Erro ao remover: ' + error.message, 'error'); return; }
  showToast('Mapeamento removido.', 'success');
  loadBancoTab(contatoId);
}

async function loadTransacoesTab(contatoId) {
  const panel = document.getElementById('ct-trans-content');
  panel.innerHTML = '<div class="ctp-loading">Carregando…</div>';

  const { data, error } = await supabase
    .from('transacoes')
    .select('id, data, descricao, banco_desc, tipo, valor, reconciliacao_status, subcategoria_id, conta_id')
    .eq('contato_id', contatoId)
    .order('data', { ascending: false })
    .limit(50);

  if (error) {
    panel.innerHTML = `<div class="ctp-empty-state">Erro ao carregar transações.</div>`;
    return;
  }

  if (!data || data.length === 0) {
    panel.innerHTML = `<div class="ctp-empty-state">Nenhuma transação vinculada a este contato.</div>`;
    return;
  }

  const subById   = new Map(cachedSubcategorias.map((s) => [s.id, s]));
  const contaById = new Map(cachedContas.map((c) => [c.id, c]));

  panel.innerHTML = `<div class="ctp-trans-header">
    <span>Data</span><span>Descrição</span><span>Subcategoria</span><span class="text-right">Valor</span><span class="text-right">Status</span>
  </div>
  <div class="ctp-trans-list">` + data.map((t) => {
    const desc    = t.descricao || t.banco_desc || '—';
    const sub     = t.subcategoria_id ? subById.get(t.subcategoria_id) : null;
    const conta   = t.conta_id ? contaById.get(t.conta_id) : null;
    const meta    = sub ? (sub.apelido || sub.nome) : (conta ? (conta.apelido || conta.nome) : '—');
    const tipoCls = t.tipo === 'Receita' ? 'is-receita' : 'is-despesa';
    const sign    = t.tipo === 'Receita' ? '+' : '−';
    const statusIcon = t.reconciliacao_status === 'reconciliado'
      ? `<span class="ctp-recon-done" title="Reconciliado">✓</span>`
      : t.reconciliacao_status === 'importado'
      ? `<span class="ctp-recon-pending" title="Importado — pendente">•</span>`
      : '';
    return `<div class="ctp-trans-item">
      <div class="ctp-trans-date">${t.data}</div>
      <div class="ctp-trans-desc" title="${escapeHtml(desc)}">${escapeHtml(desc.length > 45 ? desc.slice(0, 45) + '…' : desc)}</div>
      <div class="ctp-trans-meta">${escapeHtml(meta)}</div>
      <div class="ctp-trans-value ${tipoCls}">${sign} ${formatCurrency(t.valor, 'BRL')}</div>
      <div class="ctp-trans-status">${statusIcon}</div>
    </div>`;
  }).join('') + `</div>`;
}

// ── Tabs ──────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.ctp-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
  document.querySelectorAll('.ctp-tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.tab !== tab));
}

// ── Events ────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('ct-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderList();
  });

  document.getElementById('ct-pessoa-tipo').addEventListener('change', applyPessoaTipoUI);

  // Busca por CNPJ (Brasil API)
  document.getElementById('ct-documento').addEventListener('input', updateCnpjActions);
  document.getElementById('ct-nome').addEventListener('input', updateCnpjActions);
  document.getElementById('btn-buscar-cnpj').addEventListener('click', handleBuscarCnpj);

  // Atalho "/" foca a busca (ignora se já estiver digitando em input/textarea/modal aberto)
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/') return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    const modalOpen = document.querySelector('.modal-backdrop:not(.hidden)');
    if (modalOpen) return;
    e.preventDefault();
    document.getElementById('ct-search').focus();
  });

  document.querySelectorAll('[data-tipo-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterTipo = btn.dataset.tipoFilter;
      document.querySelectorAll('[data-tipo-filter]').forEach((b) => b.classList.toggle('active', b === btn));
      renderList();
    });
  });

  document.querySelectorAll('[data-pessoa-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.pessoaFilter;
      if (filterPessoa.has(v)) filterPessoa.delete(v);
      else filterPessoa.add(v);
      btn.classList.toggle('active', filterPessoa.has(v));
      renderList();
    });
  });

  document.getElementById('btn-novo-contato').addEventListener('click', () => openModal(null));

  document.querySelectorAll('.ctp-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('btn-editar-contato').addEventListener('click', (e) => {
    openModal(e.currentTarget.dataset.id);
  });

  document.getElementById('btn-arquivar-contato').addEventListener('click', async (e) => {
    const id = e.currentTarget.dataset.id;
    const c  = cachedContatos.find((x) => x.id === id);
    if (!c) return;
    const newStatus = c.status === 'arquivado' ? 'ativo' : 'arquivado';
    const { error } = await supabase.from('contatos').update({ status: newStatus }).eq('id', id);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    showToast(newStatus === 'arquivado'
      ? t('contatos.toast.arquivado', 'Contato arquivado.')
      : t('contatos.toast.reativado', 'Contato reativado.'),
      'success');
    await reloadContatos();
    renderList();
    const updated = cachedContatos.find((x) => x.id === id);
    if (updated) renderDetailHeader(updated);
  });

  // Modal
  document.getElementById('btn-close-modal-contato').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-contato').addEventListener('click', closeModal);
  document.getElementById('modal-contato').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-contato')) closeModal();
  });
  document.getElementById('form-contato').addEventListener('submit', (e) => {
    e.preventDefault();
    saveContato();
  });

  // Delete
  document.getElementById('btn-deletar-contato').addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    const c  = cachedContatos.find((x) => x.id === id);
    if (!c) return;
    pendingDeleteId = id;
    document.getElementById('modal-confirmar-msg').innerHTML =
      `Excluir <strong>${escapeHtml(c.nome)}</strong>? O contato será removido das transações e compromissos vinculados (os registros são preservados).`;
    document.getElementById('modal-confirmar').classList.remove('hidden');
  });

  document.getElementById('btn-close-confirmar').addEventListener('click', closeConfirmar);
  document.getElementById('btn-cancel-confirmar').addEventListener('click', closeConfirmar);
  document.getElementById('modal-confirmar').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-confirmar')) closeConfirmar();
  });
  document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const { error } = await supabase.from('contatos').delete().eq('id', pendingDeleteId);
    if (error) { showToast('Erro ao excluir: ' + error.message, 'error'); return; }
    showToast('Contato excluído.', 'success');
    closeConfirmar();
    closeModal();
    if (selectedId === pendingDeleteId) {
      selectedId = null;
      document.getElementById('ct-detail-empty').classList.remove('hidden');
      document.getElementById('ct-detail-content').classList.add('hidden');
    }
    pendingDeleteId = null;
    await reloadContatos();
    renderList();
  });
}

function closeConfirmar() {
  document.getElementById('modal-confirmar').classList.add('hidden');
  pendingDeleteId = null;
}

// ── Modal CRUD ────────────────────────────────────────────────
const MODAL_FIELDS = [
  'nome', 'nome_extrato', 'tipo', 'pessoa_tipo',
  'email', 'telefone', 'whatsapp', 'website',
  'linkedin', 'instagram',
  'documento', 'empresa', 'cargo',
  'endereco', 'aniversario', 'observacao',
];
// logo_url é gerenciado fora do form (auto-preenchido pela busca CNPJ)
let modalLogoUrl = null;

async function handleBuscarCnpj() {
  const cnpjEl = document.getElementById('ct-documento');
  const cnpj = cnpjEl.value;
  if (!isValidCnpj(cnpj)) {
    showToast('CNPJ precisa ter 14 dígitos.', 'error');
    return;
  }

  const btn = document.getElementById('btn-buscar-cnpj');
  const origLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Buscando…';

  try {
    const data = await fetchCnpjData(cnpj);
    // Tenta inferir logo do email
    const logoCandidate = inferLogoUrl(data.email);
    const validLogo = logoCandidate ? await checkImageExists(logoCandidate) : null;
    showCnpjPreviewModal(data, validLogo);
  } catch (err) {
    showToast(err.message || 'Erro ao buscar CNPJ.', 'error', 6000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origLabel;
  }
}

function showCnpjPreviewModal(data, logoUrl) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const enderecoLines = (data.endereco || '').split('\n').map((l) => escapeHtml(l)).join('<br>');

    backdrop.innerHTML = `
      <div class="modal modal-md">
        <div class="modal-header"><h3 class="modal-title">Confirmar dados encontrados</h3></div>
        <div class="modal-body">
          <div class="cnpj-preview">
            ${logoUrl ? `<img class="cnpj-preview-logo" src="${escapeHtml(logoUrl)}" alt="Logo">` : ''}
            <div class="cnpj-preview-info">
              <div class="cnpj-preview-name">${escapeHtml(data.nome || data.razao_social)}</div>
              ${data.razao_social && data.nome_fantasia && data.razao_social !== data.nome_fantasia
                ? `<div class="cnpj-preview-meta">Razão social: ${escapeHtml(data.razao_social)}</div>` : ''}
              <div class="cnpj-preview-meta">CNPJ: ${escapeHtml(data.cnpj)}</div>
              ${data.situacao ? `<div class="cnpj-preview-meta">Situação: <strong>${escapeHtml(data.situacao)}</strong></div>` : ''}
            </div>
          </div>
          <dl class="cnpj-preview-fields">
            ${enderecoLines ? `<dt>Endereço</dt><dd>${enderecoLines}</dd>` : ''}
            ${data.telefone ? `<dt>Telefone</dt><dd>${escapeHtml(data.telefone)}</dd>` : ''}
            ${data.email    ? `<dt>E-mail</dt><dd>${escapeHtml(data.email)}</dd>` : ''}
            ${data.cnae     ? `<dt>Atividade</dt><dd>${escapeHtml(data.cnae)}</dd>` : ''}
          </dl>
          <p class="field-hint">Os dados serão preenchidos no formulário. Você ainda pode editar antes de salvar.</p>
        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="button" class="btn btn-primary" data-apply>Aplicar dados</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    function cleanup(applied) {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(applied);
    }
    function onKey(e) { if (e.key === 'Escape') cleanup(false); }

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) return cleanup(false);
      if (e.target.closest('[data-cancel]')) return cleanup(false);
      if (e.target.closest('[data-apply]')) {
        applyCnpjDataToForm(data, logoUrl);
        cleanup(true);
      }
    });
    document.addEventListener('keydown', onKey);
  });
}

function applyCnpjDataToForm(data, logoUrl) {
  // Só preenche campos vazios pra não sobrescrever edições do usuário
  const setIfEmpty = (id, value) => {
    if (!value) return;
    const el = document.getElementById(id);
    if (el && !el.value.trim()) el.value = value;
  };
  // Nome: usa fantasia primeiro, depois razão social
  const nomeEl = document.getElementById('ct-nome');
  if (!nomeEl.value.trim()) nomeEl.value = data.nome || data.razao_social || '';

  setIfEmpty('ct-email', data.email);
  setIfEmpty('ct-telefone', data.telefone);
  setIfEmpty('ct-endereco', data.endereco);
  // CNPJ formatado
  document.getElementById('ct-documento').value = data.cnpj;

  if (logoUrl) modalLogoUrl = logoUrl;

  showToast('Dados preenchidos. Revise e salve.', 'success');
}

function applyPessoaTipoUI() {
  const pessoaTipo = document.getElementById('ct-pessoa-tipo').value;
  // Profissional só faz sentido pra PF
  document.getElementById('ct-profissional-section').classList.toggle('hidden', pessoaTipo !== 'fisica');
  // Label do documento muda conforme PF/PJ
  const labelEl = document.getElementById('ct-documento-label');
  if (pessoaTipo === 'fisica')      labelEl.textContent = 'CPF';
  else if (pessoaTipo === 'juridica') labelEl.textContent = 'CNPJ';
  else                                 labelEl.textContent = 'Documento (CPF/CNPJ)';
  // Ações de busca CNPJ só pra PJ
  document.getElementById('ct-cnpj-actions').classList.toggle('hidden', pessoaTipo !== 'juridica');
  updateCnpjActions();
}

function updateCnpjActions() {
  const cnpj = document.getElementById('ct-documento').value;
  const btn = document.getElementById('btn-buscar-cnpj');
  btn.disabled = !isValidCnpj(cnpj);
  // Atualiza o link do Google com o nome atual (se já preenchido)
  const nome = document.getElementById('ct-nome').value.trim();
  document.getElementById('link-buscar-google').href = googleCnpjSearchUrl(nome || 'empresa');
}

function openModal(id) {
  editingId = id;
  const c = id ? cachedContatos.find((x) => x.id === id) : null;

  document.getElementById('modal-contato-title').textContent = c ? 'Editar contato' : 'Novo contato';
  for (const key of MODAL_FIELDS) {
    const el = document.getElementById(`ct-${key.replace(/_/g, '-')}`);
    if (!el) continue;
    el.value = c?.[key] ?? (key === 'tipo' ? 'ambos' : '');
  }
  modalLogoUrl = c?.logo_url || null;
  applyPessoaTipoUI();

  const delBtn = document.getElementById('btn-deletar-contato');
  delBtn.classList.toggle('hidden', !id);
  if (id) delBtn.dataset.id = id;

  document.getElementById('modal-contato').classList.remove('hidden');
  document.getElementById('ct-nome').focus();
}

function closeModal() {
  document.getElementById('modal-contato').classList.add('hidden');
  editingId = null;
}

async function saveContato() {
  const payload = {};
  for (const key of MODAL_FIELDS) {
    const el = document.getElementById(`ct-${key.replace(/_/g, '-')}`);
    if (!el) continue;
    const v = (el.value || '').trim();
    payload[key] = v === '' ? null : v;
  }

  if (!payload.nome) { showToast('Informe o nome do contato.', 'error'); return; }
  if (!payload.tipo) payload.tipo = 'ambos';
  payload.logo_url = modalLogoUrl;

  const btn = document.getElementById('btn-save-contato');
  btn.disabled = true;

  const user = await getCurrentUser();
  let error, newId;

  if (editingId) {
    ({ error } = await supabase.from('contatos').update(payload).eq('id', editingId));
    newId = editingId;
  } else {
    const res = await supabase.from('contatos')
      .insert({ ...payload, user_id: user.id })
      .select('id').single();
    error = res.error;
    newId = res.data?.id;
  }

  btn.disabled = false;

  if (error) { showToast('Erro: ' + error.message, 'error'); return; }

  showToast(editingId ? 'Contato atualizado.' : 'Contato criado.', 'success');
  closeModal();
  await reloadContatos();
  renderList();
  if (newId) selectContact(newId);
}

// ── Utils ─────────────────────────────────────────────────────
function avatarInitials(nome) {
  return (nome || '').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

