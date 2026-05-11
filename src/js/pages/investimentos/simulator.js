// =============================================================
// FinFlow — Investimentos: Simulador de juros compostos
// =============================================================
import { showToast } from '../../components/toast.js';
import { openModal, closeModal } from '../../components/modal.js';
import { saldoFinal, tempoNecessario, aporteNecessario } from '../../lib/simulacao.js';
import { fetchIndicadores, anualToMensal } from '../../lib/indicadores.js';
import { parseDecimal, formatDecimal } from '../../lib/number-format.js';
import { formatCurrency, formatCurrencyHTML } from '../../lib/compromissos-config.js';

let simModo = 'saldo';
let lastSimulacao = null; // { meta_valor, aporte_mensal, anos, pv } — pra "+ Criar projeto"

const SIM_HINTS = {
  saldo:  'Quanto vou ter ao final do período investindo X por mês?',
  tempo:  'Quanto tempo vou demorar para alcançar a meta investindo X por mês?',
  aporte: 'Quanto preciso investir por mês para alcançar a meta no período definido?',
};

/**
 * Inicializa o simulador.
 * @param {object} opts
 * @param {(prefill: object) => void} opts.onCreateProject - callback que abre o modal de novo projeto pré-preenchido
 */
export function bindSimulador({ onCreateProject } = {}) {
  const btnLauncher = document.getElementById('btn-simular-invest');
  if (!btnLauncher) return;

  btnLauncher.addEventListener('click', () => {
    setSimModo('saldo');
    document.getElementById('sim-resultado').classList.add('hidden');
    lastSimulacao = null;
    openModal('modal-simular');
    setSimJurosTipo('manual');
  });

  document.getElementById('sim-modo-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (btn) setSimModo(btn.dataset.modo);
  });

  document.getElementById('sim-juros-tipo').addEventListener('change', (e) => setSimJurosTipo(e.target.value));
  document.getElementById('btn-simular-calcular').addEventListener('click', calcularSimulacao);

  document.getElementById('btn-sim-criar-projeto').addEventListener('click', () => {
    if (!lastSimulacao) {
      showToast('Calcule a simulação antes de criar o projeto', 'error');
      return;
    }
    const prefill = {
      meta_valor:    lastSimulacao.meta_valor || null,
      saldo_inicial: lastSimulacao.pv || 0,
      data_alvo:     dataAlvoFromMeses(lastSimulacao.meses),
      aporte_mensal: lastSimulacao.aporte_mensal || null,
    };
    closeModal('modal-simular');
    onCreateProject?.(prefill);
  });

  // Atalho Enter pra calcular
  document.getElementById('modal-simular').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      calcularSimulacao();
    }
  });
}

// Calcula data alvo somando N meses à data atual.
function dataAlvoFromMeses(meses) {
  const m = Math.round(Number(meses) || 0);
  if (m <= 0) return null;
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function setSimModo(modo) {
  simModo = modo || 'saldo';
  document.querySelectorAll('#sim-modo-seg .view-toggle-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.modo === simModo);
  });
  document.getElementById('sim-fields-saldo').classList.toggle('hidden',  simModo !== 'saldo');
  document.getElementById('sim-fields-tempo').classList.toggle('hidden',  simModo !== 'tempo');
  document.getElementById('sim-fields-aporte').classList.toggle('hidden', simModo !== 'aporte');
  document.getElementById('sim-modo-hint').textContent = SIM_HINTS[simModo] || '';
  document.getElementById('sim-resultado').classList.add('hidden');
}

async function setSimJurosTipo(tipo) {
  const taxaInput = document.getElementById('sim-taxa');
  const hintEl    = document.getElementById('sim-taxa-hint');
  if (tipo === 'selic') {
    taxaInput.readOnly = true;
    taxaInput.classList.add('input--readonly');
    const ind = await fetchIndicadores();
    if (ind.selic == null) {
      hintEl.classList.remove('hidden');
      hintEl.textContent = 'Indicador indisponível — informe taxa manual.';
      taxaInput.readOnly = false;
      taxaInput.classList.remove('input--readonly');
      return;
    }
    const baseMensal = anualToMensal(ind.selic);
    taxaInput.value = formatDecimal(baseMensal, 4);
    hintEl.classList.remove('hidden');
    hintEl.textContent = `SELIC anual: ${formatDecimal(ind.selic, 2)}% → ${formatDecimal(baseMensal, 4)}% a.m.`;
  } else {
    taxaInput.readOnly = false;
    taxaInput.classList.remove('input--readonly');
    hintEl.classList.add('hidden');
  }
}

function calcularSimulacao() {
  const i = (parseDecimal(document.getElementById('sim-taxa').value) || 0) / 100;
  const pv = parseDecimal(document.getElementById('sim-pv').value) || 0;

  const resultadoEl = document.getElementById('sim-resultado');
  const labelEl     = document.getElementById('sim-resultado-label');
  const valorEl     = document.getElementById('sim-resultado-valor');
  const detalhesEl  = document.getElementById('sim-resultado-detalhes');

  if (simModo === 'saldo') {
    const pmt  = parseDecimal(document.getElementById('sim-pmt').value) || 0;
    const anos = parseDecimal(document.getElementById('sim-anos').value);
    if (!anos || anos <= 0) { showToast('Informe o período em anos', 'error'); return; }
    if (pmt < 0)            { showToast('Aporte não pode ser negativo', 'error'); return; }
    const n = Math.round(anos * 12);
    const fv = saldoFinal(pv, pmt, i, n);
    const aportesTotais = pv + pmt * n;
    const jurosTotais   = fv - aportesTotais;

    labelEl.textContent = 'Saldo final estimado';
    valorEl.textContent = formatBRL(fv);
    detalhesEl.innerHTML = `
      <div><span>Período</span><strong>${formatDecimal(anos, 1)} anos (${n} meses)</strong></div>
      <div><span>Taxa mensal</span><strong>${formatDecimal(i * 100, 4)}% a.m.</strong></div>
      <div><span>Aportes totais</span><strong>${formatCurrencyHTML(aportesTotais, 'BRL')}</strong></div>
      <div><span>Juros acumulados</span><strong>${formatCurrencyHTML(jurosTotais, 'BRL')}</strong></div>
    `;
    lastSimulacao = { modo: 'saldo', meta_valor: fv, aporte_mensal: pmt, meses: n, pv };
  } else if (simModo === 'tempo') {
    const pmt  = parseDecimal(document.getElementById('sim-pmt-tempo').value) || 0;
    const meta = parseDecimal(document.getElementById('sim-meta-tempo').value);
    if (!meta || meta <= 0) { showToast('Informe a meta', 'error'); return; }
    if (pmt < 0)            { showToast('Aporte não pode ser negativo', 'error'); return; }
    if (meta <= pv)         { showToast('A meta já é menor ou igual ao saldo inicial', 'error'); return; }
    const meses = tempoNecessario(pv, pmt, i, meta);
    if (meses == null) {
      showToast('Impossível alcançar essa meta com aporte/taxa informados', 'error');
      return;
    }
    const anos = meses / 12;
    const aportesTotais = pv + pmt * meses;
    const jurosTotais   = meta - aportesTotais;

    labelEl.textContent = 'Tempo necessário';
    valorEl.textContent = `${formatDecimal(anos, 1)} anos`;
    detalhesEl.innerHTML = `
      <div><span>Em meses</span><strong>${formatDecimal(meses, 1)} meses</strong></div>
      <div><span>Taxa mensal</span><strong>${formatDecimal(i * 100, 4)}% a.m.</strong></div>
      <div><span>Aportes totais</span><strong>${formatCurrencyHTML(aportesTotais, 'BRL')}</strong></div>
      <div><span>Juros acumulados</span><strong>${formatCurrencyHTML(Math.max(0, jurosTotais), 'BRL')}</strong></div>
    `;
    lastSimulacao = { modo: 'tempo', meta_valor: meta, aporte_mensal: pmt, meses, pv };
  } else if (simModo === 'aporte') {
    const meta = parseDecimal(document.getElementById('sim-meta-aporte').value);
    const anos = parseDecimal(document.getElementById('sim-anos-aporte').value);
    if (!meta || meta <= 0) { showToast('Informe a meta', 'error'); return; }
    if (!anos || anos <= 0) { showToast('Informe o período', 'error'); return; }
    const n   = Math.round(anos * 12);
    const pmt = aporteNecessario(pv, i, n, meta);
    if (pmt == null) { showToast('Não foi possível calcular o aporte', 'error'); return; }
    const aportesTotais = pv + pmt * n;
    const jurosTotais   = meta - aportesTotais;

    labelEl.textContent = pmt === 0
      ? 'Não precisa aportar — saldo inicial atinge a meta'
      : 'Aporte mensal necessário';
    valorEl.textContent = formatBRL(pmt);
    detalhesEl.innerHTML = `
      <div><span>Período</span><strong>${formatDecimal(anos, 1)} anos (${n} meses)</strong></div>
      <div><span>Taxa mensal</span><strong>${formatDecimal(i * 100, 4)}% a.m.</strong></div>
      <div><span>Aportes totais</span><strong>${formatCurrencyHTML(aportesTotais, 'BRL')}</strong></div>
      <div><span>Juros acumulados</span><strong>${formatCurrencyHTML(Math.max(0, jurosTotais), 'BRL')}</strong></div>
    `;
    lastSimulacao = { modo: 'aporte', meta_valor: meta, aporte_mensal: pmt, meses: n, pv };
  }

  resultadoEl.classList.remove('hidden');
}

function formatBRL(n) {
  return formatCurrency(n, 'BRL');
}
