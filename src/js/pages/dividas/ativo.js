// =============================================================
// FinFlow — Dívidas: gerenciamento do ativo subjacente (modal)
// =============================================================
// Controla a seção "Incluir no patrimônio" + sub-formulário de
// ativo (veículo FIPE ou imóvel manual) dentro do modal de dívida.
//
// Estado é mantido no DOM — não há cache JS de marca/modelo/ano,
// apenas localStorage do lib/fipe.js (TTL 24h).
//
// Uso (em dividas.js):
//   import * as ativoUI from './dividas/ativo.js';
//   ativoUI.bindAtivoEvents();                  // 1x no init
//   await ativoUI.populateAtivo(ativo);          // ao abrir modal de edição
//   ativoUI.reset();                             // ao abrir modal de criação
//   const data = ativoUI.readAtivoFromForm();    // ao salvar
// =============================================================
import * as fipe from '../../lib/fipe.js';

let _marcasLoaded = false;

// =============================================================
// Bind eventos do modal — chamar 1× no init
// =============================================================
export function bindAtivoEvents() {
  // Toggle "Incluir no patrimônio" → mostra/esconde seção
  document.getElementById('div-inclui-patrimonio')?.addEventListener('change', async (e) => {
    const section = document.getElementById('div-ativo-section');
    if (!section) return;
    section.classList.toggle('hidden', !e.target.checked);
    if (e.target.checked) {
      // Lazy load: só carrega marcas FIPE na 1ª vez que abre a seção
      await loadMarcasIfNeeded();
    }
  });

  // Toggle Veículo / Imóvel
  document.getElementById('div-ativo-tipo-toggle')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-ativo-tipo]');
    if (!btn) return;
    document.querySelectorAll('#div-ativo-tipo-toggle [data-ativo-tipo]').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    const tipo = btn.dataset.ativoTipo;
    document.getElementById('div-ativo-veiculo').classList.toggle('hidden', tipo !== 'veiculo');
    document.getElementById('div-ativo-imovel').classList.toggle('hidden', tipo !== 'imovel');
    if (tipo === 'veiculo') await loadMarcasIfNeeded();
  });

  // Cascata FIPE: marca → modelo
  document.getElementById('div-fipe-marca')?.addEventListener('change', async (e) => {
    const codigoMarca = e.target.value;
    const modeloSel = document.getElementById('div-fipe-modelo');
    const anoSel    = document.getElementById('div-fipe-ano');
    resetSelect(modeloSel, 'Carregando…');
    resetSelect(anoSel,    'Selecione o modelo');
    modeloSel.disabled = true;
    anoSel.disabled    = true;
    document.getElementById('div-fipe-valor-info').textContent = 'Valor FIPE será exibido aqui após selecionar o ano.';
    if (!codigoMarca) {
      resetSelect(modeloSel, 'Selecione a marca');
      return;
    }
    try {
      const { modelos } = await fipe.listModelos(codigoMarca);
      modeloSel.innerHTML = '<option value="">— Selecione —</option>' +
        modelos.map((m) => `<option value="${m.codigo}">${escapeHtmlSafe(m.nome)}</option>`).join('');
      modeloSel.disabled = false;
    } catch (err) {
      resetSelect(modeloSel, 'Erro ao carregar');
      console.warn('[ativo] listModelos', err);
    }
  });

  // Cascata FIPE: modelo → ano
  document.getElementById('div-fipe-modelo')?.addEventListener('change', async (e) => {
    const codigoMarca  = document.getElementById('div-fipe-marca').value;
    const codigoModelo = e.target.value;
    const anoSel = document.getElementById('div-fipe-ano');
    resetSelect(anoSel, 'Carregando…');
    anoSel.disabled = true;
    document.getElementById('div-fipe-valor-info').textContent = 'Valor FIPE será exibido aqui após selecionar o ano.';
    if (!codigoMarca || !codigoModelo) {
      resetSelect(anoSel, 'Selecione o modelo');
      return;
    }
    try {
      const anos = await fipe.listAnos(codigoMarca, codigoModelo);
      anoSel.innerHTML = '<option value="">— Selecione —</option>' +
        anos.map((a) => `<option value="${a.codigo}">${escapeHtmlSafe(a.nome)}</option>`).join('');
      anoSel.disabled = false;
    } catch (err) {
      resetSelect(anoSel, 'Erro ao carregar');
      console.warn('[ativo] listAnos', err);
    }
  });

  // Cascata FIPE: ano → busca valor
  document.getElementById('div-fipe-ano')?.addEventListener('change', async (e) => {
    const codigoMarca  = document.getElementById('div-fipe-marca').value;
    const codigoModelo = document.getElementById('div-fipe-modelo').value;
    const codigoAno    = e.target.value;
    const info = document.getElementById('div-fipe-valor-info');
    if (!codigoMarca || !codigoModelo || !codigoAno) {
      info.textContent = 'Valor FIPE será exibido aqui após selecionar o ano.';
      return;
    }
    info.textContent = 'Buscando valor FIPE…';
    try {
      const dados = await fipe.getValor(codigoMarca, codigoModelo, codigoAno);
      info.innerHTML = `Valor FIPE: <strong>${escapeHtmlSafe(dados.Valor)}</strong> · Ref: ${escapeHtmlSafe(dados.MesReferencia || '—')}`;
      // Guarda o valor parseado num data attribute pra leitura no save
      info.dataset.valorParsed = String(fipe.parseFipeValor(dados.Valor) ?? '');
      info.dataset.codigoFipe  = dados.CodigoFipe || '';
      info.dataset.combustivel = dados.Combustivel || '';
    } catch (err) {
      info.textContent = 'Erro ao buscar valor FIPE.';
      console.warn('[ativo] getValor', err);
    }
  });
}

// =============================================================
// Reset (modo criação)
// =============================================================
export function reset() {
  const checkbox = document.getElementById('div-inclui-patrimonio');
  if (checkbox) checkbox.checked = false;
  document.getElementById('div-ativo-section')?.classList.add('hidden');

  // Default tipo: veículo
  document.querySelectorAll('#div-ativo-tipo-toggle [data-ativo-tipo]').forEach((b) => {
    b.classList.toggle('active', b.dataset.ativoTipo === 'veiculo');
  });
  document.getElementById('div-ativo-veiculo')?.classList.remove('hidden');
  document.getElementById('div-ativo-imovel')?.classList.add('hidden');

  // Reset campos veículo
  const marcaSel = document.getElementById('div-fipe-marca');
  if (marcaSel) marcaSel.value = '';
  resetSelect(document.getElementById('div-fipe-modelo'), 'Selecione a marca');
  resetSelect(document.getElementById('div-fipe-ano'),    'Selecione o modelo');
  document.getElementById('div-fipe-modelo').disabled = true;
  document.getElementById('div-fipe-ano').disabled    = true;
  const placa = document.getElementById('div-ativo-placa'); if (placa) placa.value = '';
  const info = document.getElementById('div-fipe-valor-info');
  info.textContent = 'Valor FIPE será exibido aqui após selecionar o ano.';
  delete info.dataset.valorParsed;
  delete info.dataset.codigoFipe;
  delete info.dataset.combustivel;

  // Reset campos imóvel
  const ends = ['div-ativo-endereco', 'div-ativo-area', 'div-ativo-valor-imovel'];
  ends.forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
}

// =============================================================
// Popula formulário com ativo existente (modo edição)
// =============================================================
export async function populateAtivo(divida, ativo) {
  reset();
  const checkbox = document.getElementById('div-inclui-patrimonio');
  checkbox.checked = Boolean(divida?.inclui_no_patrimonio);
  document.getElementById('div-ativo-section').classList.toggle('hidden', !checkbox.checked);
  if (!checkbox.checked || !ativo) return;

  // Set tipo toggle
  document.querySelectorAll('#div-ativo-tipo-toggle [data-ativo-tipo]').forEach((b) => {
    b.classList.toggle('active', b.dataset.ativoTipo === ativo.tipo);
  });
  document.getElementById('div-ativo-veiculo').classList.toggle('hidden', ativo.tipo !== 'veiculo');
  document.getElementById('div-ativo-imovel').classList.toggle('hidden', ativo.tipo !== 'imovel');

  if (ativo.tipo === 'veiculo') {
    await loadMarcasIfNeeded();
    // Tenta restaurar marca → modelo → ano via cascata (busca FIPE)
    // Nota: usamos os nomes (marca/modelo/ano salvos) pra reapresentar
    // — não re-buscamos o codigo FIPE, apenas mostramos textualmente.
    const info = document.getElementById('div-fipe-valor-info');
    info.innerHTML = `Veículo salvo: <strong>${escapeHtmlSafe(ativo.fipe_marca || '—')} ${escapeHtmlSafe(ativo.fipe_modelo || '')} (${escapeHtmlSafe(ativo.fipe_ano_modelo || '—')})</strong> · Valor: <strong>${formatBRL(ativo.valor_atual)}</strong>`;
    info.dataset.valorParsed = String(ativo.valor_atual ?? '');
    info.dataset.codigoFipe  = ativo.fipe_codigo || '';
    info.dataset.combustivel = ativo.fipe_combustivel || '';
    const placa = document.getElementById('div-ativo-placa');
    if (placa) placa.value = ativo.placa || '';
  } else if (ativo.tipo === 'imovel') {
    document.getElementById('div-ativo-endereco').value      = ativo.endereco || '';
    document.getElementById('div-ativo-area').value          = ativo.area_m2 != null ? String(ativo.area_m2).replace('.', ',') : '';
    document.getElementById('div-ativo-valor-imovel').value  = ativo.valor_atual != null ? formatDecimalBR(ativo.valor_atual) : '';
  }
}

// =============================================================
// Lê dados do form. Retorna null se "Incluir" desmarcado.
// Lança Error com mensagem amigável se "Incluir" marcado mas dados inválidos.
// =============================================================
export function readAtivoFromForm() {
  const checkbox = document.getElementById('div-inclui-patrimonio');
  if (!checkbox.checked) return null;

  const activeBtn = document.querySelector('#div-ativo-tipo-toggle .active');
  const tipo = activeBtn?.dataset.ativoTipo || 'veiculo';

  if (tipo === 'veiculo') {
    const marcaSel  = document.getElementById('div-fipe-marca');
    const modeloSel = document.getElementById('div-fipe-modelo');
    const anoSel    = document.getElementById('div-fipe-ano');
    const info      = document.getElementById('div-fipe-valor-info');
    const valorParsed = parseFloat(info.dataset.valorParsed || '');

    if (!marcaSel.value || !modeloSel.value || !anoSel.value || isNaN(valorParsed)) {
      throw new Error('Selecione marca, modelo e ano do veículo (e aguarde o valor FIPE carregar).');
    }

    return {
      tipo: 'veiculo',
      fipe_codigo:      info.dataset.codigoFipe || null,
      fipe_marca:       marcaSel.options[marcaSel.selectedIndex]?.text || null,
      fipe_modelo:      modeloSel.options[modeloSel.selectedIndex]?.text || null,
      fipe_ano_modelo:  anoSel.options[anoSel.selectedIndex]?.text || null,
      fipe_combustivel: info.dataset.combustivel || null,
      placa:            document.getElementById('div-ativo-placa').value.trim() || null,
      endereco:         null,
      area_m2:          null,
      valor_atual:      valorParsed,
      valor_atualizado_em: new Date().toISOString(),
    };
  }

  // Imóvel
  const valorStr = document.getElementById('div-ativo-valor-imovel').value;
  const valor = parseDecimalBR(valorStr);
  if (valor == null || valor <= 0) {
    throw new Error('Informe o valor de mercado do imóvel.');
  }
  const areaStr = document.getElementById('div-ativo-area').value;
  const area = areaStr ? parseDecimalBR(areaStr) : null;

  return {
    tipo: 'imovel',
    fipe_codigo:      null,
    fipe_marca:       null,
    fipe_modelo:      null,
    fipe_ano_modelo:  null,
    fipe_combustivel: null,
    placa:            null,
    endereco:         document.getElementById('div-ativo-endereco').value.trim() || null,
    area_m2:          area,
    valor_atual:      valor,
    valor_atualizado_em: new Date().toISOString(),
  };
}

// =============================================================
// Helpers internos
// =============================================================
async function loadMarcasIfNeeded() {
  if (_marcasLoaded) return;
  const sel = document.getElementById('div-fipe-marca');
  if (!sel) return;
  try {
    const marcas = await fipe.listMarcas();
    sel.innerHTML = '<option value="">— Selecione —</option>' +
      marcas.map((m) => `<option value="${m.codigo}">${escapeHtmlSafe(m.nome)}</option>`).join('');
    _marcasLoaded = true;
  } catch (err) {
    sel.innerHTML = '<option value="">Erro ao carregar marcas</option>';
    console.warn('[ativo] listMarcas', err);
  }
}

function resetSelect(el, placeholderText) {
  if (!el) return;
  el.innerHTML = `<option value="">${escapeHtmlSafe(placeholderText)}</option>`;
}

function escapeHtmlSafe(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function parseDecimalBR(str) {
  if (!str) return null;
  const s = String(str).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function formatDecimalBR(n, decimals = 2) {
  if (n == null || isNaN(n)) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(n));
}

function formatBRL(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n));
}
