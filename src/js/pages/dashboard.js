// =============================================================
// FinFlow — Página: Dashboard (Fase 7.A)
//
// Visão geral do mês corrente — leitura agregada do que já existe.
// • Saudação dinâmica (Bom dia/tarde/noite + nome)
// • 4 KPI cards (saldo do mês, oportunidade, % pago, compromissos ativos)
// • Próximos 7 dias (lista de pagamentos a vencer)
// • Barras horizontais por super-bloco (Contribuição/Sonhos/Custo de vida)
// • Atalhos rápidos pra outras telas
// =============================================================
import { guardSession, getCurrentUser } from '../lib/auth.js';
import { initSidebar } from '../components/sidebar.js';
import { supabase } from '../lib/supabase.js';
import { fetchExchangeRate } from '../lib/currency.js';
import { formatCurrency } from '../lib/compromissos-config.js';

const MONTH_LABELS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const SUPER_BLOCOS = [
  { id: 'contribuicao', label: 'Contribuição', grupos: ['receitas', 'dividas'],   accent: 'var(--color-success)' },
  { id: 'sonhos',       label: 'Sonhos',       grupos: ['investimentos'],         accent: 'var(--color-primary)' },
  { id: 'custo_vida',   label: 'Custo de vida', grupos: ['custo_vida'],           accent: 'var(--color-secondary)' },
];

const today = new Date();
const viewYear = today.getFullYear();
const viewMonth = today.getMonth();
const ratesMap = new Map();

let cachedProfile = null;
let cachedCategorias = [];
let cachedOrcamento = [];
let cachedPagamentos = [];

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  await initSidebar('dashboard');

  await loadAll();
  renderGreeting();
  renderKPIs();
  renderBlocosBars();
  renderProximosVencimentos();
});

// -----------------------------
// Loaders
// -----------------------------
async function loadAll() {
  const user = await getCurrentUser();
  if (!user) return;

  const mesAno = isoMonth(viewYear, viewMonth);

  const [profile, categorias, orcamento, pagamentos] = await Promise.all([
    supabase.from('profiles').select('nome, apelido').eq('id', user.id).maybeSingle(),
    supabase.from('categorias').select('*').eq('ativo', true),
    supabase.from('orcamento_geral').select('*, subcategorias(*, categorias(*))').eq('mes_ano', mesAno),
    supabase.from('pagamentos')
      .select('*, subcategorias(*, categorias(*))')
      .eq('mes_ano', mesAno)
      .order('data_vencimento'),
  ]);

  cachedProfile  = profile.data || {};
  cachedCategorias = categorias.data || [];
  cachedOrcamento  = (orcamento.data  || []).filter((e) => e.subcategorias?.status === 'ativa');
  cachedPagamentos = (pagamentos.data || []).filter((p) => p.subcategorias?.status === 'ativa');

  await refreshRates();
}

async function refreshRates() {
  const used = [...new Set([
    ...cachedOrcamento.map((e) => e.moeda).filter((m) => m && m !== 'BRL'),
    ...cachedPagamentos.map((p) => p.moeda).filter((m) => m && m !== 'BRL'),
  ])];
  await Promise.all(used.map(async (c) => {
    try {
      const rate = await fetchExchangeRate(c, 'BRL');
      ratesMap.set(c, rate);
    } catch (err) {
      console.warn('[dashboard] cotação falhou:', c, err);
    }
  }));
}

function convertToBRL(value, currency, entry) {
  if (!currency || currency === 'BRL') return Number(value) || 0;
  // Usa cambio_travado se disponível na entry (orcamento)
  if (entry?.cambio_travado) return (Number(value) || 0) * Number(entry.cambio_travado);
  const rate = ratesMap.get(currency);
  if (!rate) return null;
  return (Number(value) || 0) * rate;
}

// -----------------------------
// Greeting
// -----------------------------
function renderGreeting() {
  const hora = today.getHours();
  let saudacao = 'Olá';
  if (hora < 12) saudacao = 'Bom dia';
  else if (hora < 18) saudacao = 'Boa tarde';
  else saudacao = 'Boa noite';

  const nome = cachedProfile?.apelido?.trim() || cachedProfile?.nome?.trim() || '';
  const greetingEl = document.getElementById('dash-greeting');
  greetingEl.textContent = nome ? `${saudacao}, ${nome}` : saudacao;

  const eyebrow = document.getElementById('dash-eyebrow');
  eyebrow.textContent = 'Visão geral';

  const monthEl = document.getElementById('dash-month-label');
  monthEl.textContent = `Aqui está o resumo de ${MONTH_LABELS[viewMonth]} ${viewYear}.`;
}

// -----------------------------
// KPI cards
// -----------------------------
function renderKPIs() {
  // 1. Saldo do mês = Receitas - Despesas (signed) do orçamento
  let receitasBRL = 0, despesasBRL = 0;
  for (const e of cachedOrcamento) {
    const v = Number(e.valor_previsto) || 0;
    const vBRL = convertToBRL(v, e.moeda, e);
    if (vBRL === null) continue;
    if (e.subcategorias?.tipo === 'Receita') receitasBRL += vBRL;
    else despesasBRL += vBRL;
  }
  const saldo = receitasBRL - despesasBRL;
  const saldoCls = saldo > 0 ? 'dre-positive' : (saldo < 0 ? 'dre-negative' : 'dre-zero');
  const saldoSign = saldo > 0 ? '+' : (saldo < 0 ? '-' : '');

  // 2. Oportunidade de investimento = signed total do super-bloco Contribuição
  let oportunidade = 0;
  const contribGrupos = ['receitas', 'dividas'];
  for (const e of cachedOrcamento) {
    const cat = e.subcategorias?.categorias;
    if (!cat || !contribGrupos.includes(cat.grupo)) continue;
    const v = Number(e.valor_previsto) || 0;
    const vBRL = convertToBRL(v, e.moeda, e);
    if (vBRL === null) continue;
    oportunidade += (e.subcategorias?.tipo === 'Receita') ? vBRL : -vBRL;
  }
  const oportCls = oportunidade > 0 ? 'dre-positive' : (oportunidade < 0 ? 'dre-negative' : 'dre-zero');
  const oportSign = oportunidade > 0 ? '+' : (oportunidade < 0 ? '-' : '');

  // 3. % pago — apenas DESPESAS, status Pago/Cartão sobre o total previsto (não-cancelado)
  let pagoBRL = 0, totalPrevistoBRL = 0;
  let countPagos = 0, countTotal = 0;
  for (const p of cachedPagamentos) {
    if (p.status === 'Cancelado') continue;
    if (p.subcategorias?.tipo !== 'Despesa') continue;
    const v = Number(p.valor_previsto) || 0;
    const vBRL = convertToBRL(v, p.moeda, p);
    if (vBRL === null) continue;
    totalPrevistoBRL += vBRL;
    countTotal++;
    if (['Pago', 'Cartão'].includes(p.status)) {
      pagoBRL += vBRL;
      countPagos++;
    }
  }
  const pctPago = totalPrevistoBRL > 0 ? Math.min(100, (pagoBRL / totalPrevistoBRL) * 100) : 0;

  // 4. Compromissos ativos
  // Pega das pagamentos do mês — quantas subcategorias distintas
  const subsAtivas = new Set();
  cachedPagamentos.forEach((p) => {
    if (p.subcategorias?.status === 'ativa') subsAtivas.add(p.subcategoria_id);
  });
  const ativosCount = subsAtivas.size;

  const container = document.getElementById('dash-kpis');
  container.innerHTML = `
    <div class="dash-kpi" style="--kpi-accent: var(--color-primary);">
      <div class="dash-kpi-label">Saldo do mês</div>
      <div class="dash-kpi-value ${saldoCls}">${saldoSign}${formatCurrency(Math.abs(saldo), 'BRL')}</div>
      <div class="dash-kpi-sub">
        <span class="dre-positive">+${formatCurrency(receitasBRL, 'BRL')}</span>
        <span class="text-muted"> · </span>
        <span class="dre-negative">-${formatCurrency(despesasBRL, 'BRL')}</span>
      </div>
    </div>

    <div class="dash-kpi" style="--kpi-accent: var(--color-success);">
      <div class="dash-kpi-label">Oportunidade de investimento</div>
      <div class="dash-kpi-value ${oportCls}">${oportSign}${formatCurrency(Math.abs(oportunidade), 'BRL')}</div>
      <div class="dash-kpi-sub">Sobra do bloco Contribuição</div>
    </div>

    <div class="dash-kpi" style="--kpi-accent: var(--color-warning);">
      <div class="dash-kpi-label">Pagamentos do mês</div>
      <div class="dash-kpi-value">${pctPago.toFixed(0)}%</div>
      <div class="dash-kpi-progress">
        <div class="dash-kpi-progress-fill" style="width: ${pctPago}%; background: var(--color-success);"></div>
      </div>
      <div class="dash-kpi-sub">${countPagos} de ${countTotal} efetivados</div>
    </div>

    <div class="dash-kpi" style="--kpi-accent: var(--color-secondary);">
      <div class="dash-kpi-label">Compromissos ativos</div>
      <div class="dash-kpi-value">${ativosCount}</div>
      <div class="dash-kpi-sub">com pagamento neste mês</div>
    </div>
  `;
}

// -----------------------------
// Barras por super-bloco
// -----------------------------
function renderBlocosBars() {
  // Calcula total signed (Receita +, Despesa -) por super-bloco
  // Pra exibição como "saída prevista", usamos magnitude:
  //   - Contribuição: mostra o valor positivo (entradas - saídas) ou alerta se negativo
  //   - Sonhos / Custo de vida: mostra valor absoluto das despesas previstas
  const totalsByBloco = {};
  for (const bloco of SUPER_BLOCOS) {
    totalsByBloco[bloco.id] = { signed: 0, absDespesa: 0 };
  }

  for (const e of cachedOrcamento) {
    const cat = e.subcategorias?.categorias;
    if (!cat) continue;
    const grupo = cat.grupo || 'custo_vida';
    const bloco = SUPER_BLOCOS.find((b) => b.grupos.includes(grupo));
    if (!bloco) continue;

    const v = Number(e.valor_previsto) || 0;
    const vBRL = convertToBRL(v, e.moeda, e);
    if (vBRL === null) continue;

    const t = totalsByBloco[bloco.id];
    t.signed += (e.subcategorias?.tipo === 'Receita') ? vBRL : -vBRL;
    if (e.subcategorias?.tipo === 'Despesa') t.absDespesa += vBRL;
  }

  // Pra escala das barras, normaliza pelo maior valor (positivo) entre os 3
  const maxValue = Math.max(
    Math.abs(totalsByBloco.contribuicao.signed),
    totalsByBloco.sonhos.absDespesa,
    totalsByBloco.custo_vida.absDespesa,
    1 // evita div por zero
  );

  const container = document.getElementById('dash-blocos-bars');
  const rows = SUPER_BLOCOS.map((bloco) => {
    const t = totalsByBloco[bloco.id];
    const value = bloco.id === 'contribuicao' ? t.signed : t.absDespesa;
    const display = bloco.id === 'contribuicao'
      ? `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatCurrency(Math.abs(value), 'BRL')}`
      : formatCurrency(Math.abs(value), 'BRL');
    const pct = (Math.abs(value) / maxValue) * 100;
    const valueCls = bloco.id === 'contribuicao'
      ? (value > 0 ? 'dre-positive' : value < 0 ? 'dre-negative' : '')
      : '';

    return `
      <div class="dash-bloco-bar" style="--bloco-accent: ${bloco.accent};">
        <div class="dash-bloco-bar-label">
          <span class="dash-bloco-bar-name">${bloco.label}</span>
          <span class="dash-bloco-bar-value ${valueCls}">${display}</span>
        </div>
        <div class="dash-bloco-bar-track">
          <div class="dash-bloco-bar-fill" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;
  }).join('');

  if (cachedOrcamento.length === 0) {
    container.innerHTML = '<div class="dash-empty">Nenhum dado de orçamento neste mês.</div>';
    return;
  }
  container.innerHTML = rows;
}

// -----------------------------
// Próximos vencimentos (7 dias)
// -----------------------------
function renderProximosVencimentos() {
  const hoje = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + 7);

  const upcoming = cachedPagamentos
    .filter((p) => p.status === 'Agendado')
    .filter((p) => {
      if (!p.data_vencimento) return false;
      const d = new Date(p.data_vencimento + 'T00:00:00');
      return d >= hoje && d <= limite;
    })
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    .slice(0, 8);

  const container = document.getElementById('dash-vencimentos');
  if (upcoming.length === 0) {
    container.innerHTML = '<div class="dash-empty">Sem vencimentos nos próximos 7 dias 🎉</div>';
    return;
  }

  container.innerHTML = upcoming.map((p) => {
    const sub = p.subcategorias;
    const display = sub?.apelido?.trim() || sub?.nome || '—';
    const v = Number(p.valor_previsto) || 0;
    const vBRL = convertToBRL(v, p.moeda, p);
    const valor = vBRL !== null ? formatCurrency(vBRL, 'BRL') : formatCurrency(v, p.moeda);
    const cat = sub?.categorias;
    const catColor = cat?.cor || '#9CA3AF';
    const tipo = sub?.tipo;
    const sign = tipo === 'Receita' ? '+' : '-';
    const cls = tipo === 'Receita' ? 'dre-positive' : 'dre-negative';
    const d = new Date(p.data_vencimento + 'T00:00:00');
    const diaSem = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');

    return `
      <a href="/pagamentos.html" class="dash-venc-row">
        <div class="dash-venc-date">
          <span class="dash-venc-day">${dia}/${mes}</span>
          <span class="dash-venc-weekday">${diaSem}</span>
        </div>
        <div class="dash-venc-info">
          <span class="dash-venc-name">
            <span class="dash-venc-dot" style="background: ${catColor};"></span>
            ${escapeHtml(display)}
          </span>
          ${cat ? `<span class="dash-venc-cat">${escapeHtml(cat.nome)}</span>` : ''}
        </div>
        <div class="dash-venc-value ${cls}">${sign}${valor}</div>
      </a>
    `;
  }).join('');
}

// -----------------------------
// Utils
// -----------------------------
function isoMonth(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
