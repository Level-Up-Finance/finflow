// =============================================================
// Modal de registro de adiantamento de receita (Situação 3)
// =============================================================
import { openModal, closeModal } from '../../components/modal.js';
import { showToast } from '../../components/toast.js';
import { parseUserNumber } from '../../lib/utils.js';
import { formatCurrency } from '../../lib/compromissos-config.js';
import { registrarAdiantamento } from '../../lib/adiantamentos.js';
import { supabase } from '../../lib/supabase.js';

let _boundOnce = false;
let _currentSub = null;
let _deps = null;

export function openAdiantamentoModal(sub, deps) {
  _currentSub = sub;
  _deps = deps;
  bindOnce();

  // Reset
  document.getElementById('adiant-sub-id').value = sub.id;
  document.getElementById('adiant-sub-nome').textContent = deps.displayName ? deps.displayName(sub) : (sub.apelido?.trim() || sub.nome);

  // Pre-fill data hoje
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  document.getElementById('adiant-data').value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  // Default mês início desconto = mês seguinte
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  document.getElementById('adiant-inicio').value = `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;

  // Reset valores
  document.getElementById('adiant-valor').value = '';
  document.getElementById('adiant-taxa').value = '0';
  document.getElementById('adiant-parcelas').value = '3';
  document.getElementById('adiant-obs').value = '';

  // Popula select de contas
  populateContaSelect(sub);

  updateResumo();
  openModal('modal-adiantamento');
}

async function populateContaSelect(sub) {
  const select = document.getElementById('adiant-conta');
  // Carrega contas ativas (não-cartão)
  const { data: contas } = await supabase
    .from('contas')
    .select('id, nome, apelido, tipo')
    .eq('status', 'ativa')
    .neq('tipo', 'Cartão de Crédito')
    .order('nome');
  const opts = (contas || []).map((c) => {
    const label = c.apelido?.trim() || c.nome;
    return `<option value="${c.id}">${escapeHtml(label)}</option>`;
  });
  select.innerHTML = opts.join('');
  // Pré-seleciona a conta padrão da sub
  if (sub.conta_id && Array.from(select.options).some((o) => o.value === sub.conta_id)) {
    select.value = sub.conta_id;
  }
}

function bindOnce() {
  if (_boundOnce) return;
  _boundOnce = true;

  ['adiant-valor', 'adiant-taxa', 'adiant-parcelas', 'adiant-inicio'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateResumo);
    document.getElementById(id).addEventListener('change', updateResumo);
  });

  document.getElementById('form-adiantamento').addEventListener('submit', salvar);
}

function updateResumo() {
  const valor = parseUserNumber(document.getElementById('adiant-valor').value) || 0;
  const taxa = parseUserNumber(document.getElementById('adiant-taxa').value) || 0;
  const liquido = Math.max(0, valor - taxa);
  const n = Number(document.getElementById('adiant-parcelas').value) || 3;
  const inicio = document.getElementById('adiant-inicio').value; // YYYY-MM
  const parcela = valor > 0 ? valor / n : 0;
  const valorBase = Number(_currentSub?.valor_base || 0);

  document.getElementById('adiant-liquido').textContent = formatCurrency(liquido, 'BRL');

  const body = document.getElementById('adiant-resumo-body');
  if (!valor || !inicio) {
    body.innerHTML = 'Preencha os campos pra ver o resumo do efeito.';
    return;
  }

  const [y, m] = inicio.split('-').map(Number);
  const meses = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(y, m - 1 + i, 1);
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const novoValor = Math.max(0, valorBase - parcela);
    meses.push({ label, novoValor });
  }

  const taxaPct = valor > 0 ? (taxa / valor * 100) : 0;
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
      <span>Hoje (entrada na conta):</span>
      <strong style="color:var(--color-success)">+${formatCurrency(liquido, 'BRL')}</strong>
    </div>
    ${meses.map((mes) => `
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="text-transform:capitalize;">${mes.label}:</span>
        <span style="color:var(--color-text-muted);">${formatCurrency(valorBase, 'BRL')} → <strong>${formatCurrency(mes.novoValor, 'BRL')}</strong></span>
      </div>
    `).join('')}
    <div style="margin-top:var(--space-2);padding-top:var(--space-2);border-top:1px dashed var(--color-border);font-size:11px;color:var(--color-text-muted);">
      Custo financeiro: ${formatCurrency(taxa, 'BRL')} (${taxaPct.toFixed(2)}%)
    </div>
  `;
}

async function salvar(e) {
  e.preventDefault();
  const subId = document.getElementById('adiant-sub-id').value;
  const valor = parseUserNumber(document.getElementById('adiant-valor').value) || 0;
  const taxa = parseUserNumber(document.getElementById('adiant-taxa').value) || 0;
  const contaId = document.getElementById('adiant-conta').value;
  const data = document.getElementById('adiant-data').value;
  const n = Number(document.getElementById('adiant-parcelas').value);
  const inicioMonth = document.getElementById('adiant-inicio').value; // YYYY-MM
  const obs = document.getElementById('adiant-obs').value.trim() || null;

  if (valor <= 0) { showToast('Informe um valor válido', 'error'); return; }
  if (!contaId) { showToast('Selecione a conta destino', 'error'); return; }
  if (!data) { showToast('Informe a data do recebimento', 'error'); return; }
  if (!inicioMonth) { showToast('Informe o mês de início do desconto', 'error'); return; }

  const mesInicioIso = `${inicioMonth}-01`;

  const btn = document.getElementById('btn-salvar-adiantamento');
  btn.disabled = true;
  btn.textContent = 'Salvando…';

  const result = await registrarAdiantamento({
    subcategoria_id: subId,
    conta_credito_id: contaId,
    data_recebimento: data,
    valor_solicitado: valor,
    taxa,
    n_parcelas: n,
    mes_inicio_desconto: mesInicioIso,
    observacao: obs,
  });

  btn.disabled = false;
  btn.textContent = 'Confirmar adiantamento';

  if (!result.ok) {
    showToast('Erro: ' + result.error, 'error', 8000);
    return;
  }

  closeModal('modal-adiantamento');
  showToast(`Adiantamento registrado · ${formatCurrency(valor - taxa, 'BRL')} creditado · desconto em ${n} ${n === 1 ? 'mês' : 'meses'}`, 'success', 7000);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
