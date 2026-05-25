// =============================================================
// FinFlow — Compromissos: lógica de save/status/encerrar
// =============================================================
// Funções extraídas que escrevem no banco. Recebem dependências
// via deps (getters/setters de state, lookups, loaders, helpers).
// =============================================================
import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../components/toast.js';
import { openModal, closeModal } from '../../components/modal.js';
import { getCurrentUser } from '../../lib/auth.js';
import { requireWorkspaceId } from '../../lib/workspace.js';
import { escapeHtml, todayISO, parseUserNumber } from '../../lib/utils.js';
import { t } from '../../lib/textos.js';
import { collectValoresMensais, saveValoresMensaisToOrcamento } from './valores-mensais.js';
import { showInfoPopup } from './popovers.js';
import { markAllAsStale } from '../../lib/month-cache.js';

// State local ao módulo de encerrar (transitório entre openEncerrarModal e confirmarEncerrar)
let encerrandoId = null;

/** Atualização rápida do valor base (modal modal-quick-valor). */
export async function saveQuickValor(event, deps) {
  event.preventDefault();
  const button = document.getElementById('btn-salvar-quick-valor');

  const novoValorRaw = document.getElementById('quick-valor-input').value;
  const motivo = document.getElementById('quick-motivo-input').value.trim() || null;

  const novoValor = parseUserNumber(novoValorRaw);
  if (novoValorRaw === '' || isNaN(novoValor)) {
    showToast(t('compromissos.validacao.valor_invalido', 'Informe um valor válido'), 'error');
    return;
  }
  const detailsCompromisso = deps.getDetailsCompromisso();
  if (!detailsCompromisso) return;

  if (novoValor === Number(detailsCompromisso.valor_base)) {
    showToast(t('compromissos.toast.valor_inalterado', 'O valor não mudou'), 'info');
    return;
  }

  const original = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    const { data, error } = await supabase
      .from('subcategorias')
      .update({ valor_base: novoValor })
      .eq('id', detailsCompromisso.id)
      .select()
      .single();
    if (error) throw error;

    await deps.logHistoryEntries(detailsCompromisso.id, detailsCompromisso, data, motivo);

    showToast(t('compromissos.toast.valor_atualizado', 'Valor atualizado'), 'success');
    closeModal('modal-quick-valor');
    await deps.loadCompromissos();
  } catch (err) {
    console.error('[saveQuickValor]', err);
    showToast('Erro ao atualizar: ' + (err.message || err), 'error', 8000);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

/**
 * Salva compromisso direto na categoria (modo "categoria existente",
 * sem subcategoria). Atualiza categorias.* com os campos de compromisso.
 */
export async function saveCatDirectCompromisso(deps) {
  const editingCatId = deps.getEditingCatId();
  const catId = editingCatId || document.getElementById('comp-cat-existente').value;
  if (!catId) { showToast(t('compromissos.validacao.categoria_obrigatoria', 'Escolha uma categoria'), 'error'); return; }

  const tipo          = document.getElementById('comp-tipo').value;
  const conta_id      = document.getElementById('comp-conta').value || null;
  const tipo_pagamento = document.getElementById('comp-tipo-pagamento').value || null;
  const periodo       = document.getElementById('comp-periodo').value;
  const vencimentoRaw = document.getElementById('comp-vencimento-dia').value;
  const diaSemanaRaw  = document.getElementById('comp-dia-semana').value;
  const intervaloSemanasRawCat = document.getElementById('comp-intervalo-semanas')?.value;
  const valorVariavel = document.getElementById('comp-valor-variavel').checked;
  const valorBaseRaw  = document.getElementById('comp-valor-base').value;
  const moedaFixaVal  = document.getElementById('comp-moeda').value;
  const moedaVarVal   = document.getElementById('comp-moeda-var')?.value || moedaFixaVal;
  const moeda         = valorVariavel ? moedaVarVal : moedaFixaVal;
  const iniciado_em   = document.getElementById('comp-iniciado-em').value || null;
  const terminado_em  = document.getElementById('comp-terminado-em').value || null;
  const descricao     = document.getElementById('comp-descricao').value.trim() || null;
  const status        = document.getElementById('comp-status').value;
  const contato_id    = deps.getContatoPickerValue();

  const cachedCategorias = deps.getCachedCategorias();
  const cat = cachedCategorias.find((c) => c.id === catId);
  const isDividasCat = cat?.grupo === 'dividas' || /dívida|divida/i.test(cat?.nome || '');
  const dividaRaw = isDividasCat ? (document.getElementById('comp-divida')?.value || '') : '';

  if (!tipo) { showToast(t('compromissos.validacao.tipo_obrigatorio', 'Escolha o tipo'), 'error'); return; }
  if (!iniciado_em) { showToast(t('compromissos.validacao.data_inicio', 'Informe a data de início'), 'error'); return; }
  if (isDividasCat && !dividaRaw) { showToast('Vincule uma dívida existente ou crie uma nova', 'error'); return; }
  const valorBaseParsed = parseUserNumber(valorBaseRaw);
  if (!valorVariavel && (valorBaseRaw === '' || isNaN(valorBaseParsed) || valorBaseParsed <= 0)) {
    showToast(t('compromissos.validacao.valor_maior_zero', 'Informe um valor maior que zero'), 'error'); return;
  }

  const usaDiaSemana = periodo === 'Semanal' || periodo === 'Quinzenal';
  const ehUnico = periodo === 'Único';
  const ehAnual = periodo === 'Anual';
  let anualDia = null;
  let anualIso = null;
  if (ehAnual) {
    const a = deps.readAnualDateInput();
    if (!a.dia) { showToast('Escolha a data de vencimento anual', 'error'); return; }
    anualDia = a.dia;
    anualIso = a.iso;
  } else if (usaDiaSemana) {
    if (diaSemanaRaw === '') { showToast('Selecione o dia da semana', 'error'); return; }
  } else if (!ehUnico) {
    if (!vencimentoRaw || vencimentoRaw < 1 || vencimentoRaw > 31) {
      showToast('Dia de vencimento deve ser entre 1 e 31', 'error'); return;
    }
  }

  const intervalo_semanas_cat = (periodo === 'Semanal' && intervaloSemanasRawCat)
    ? Math.max(1, Number(intervaloSemanasRawCat) || 1)
    : 1;

  const payload = {
    tipo,
    conta_id,
    tipo_pagamento,
    periodo,
    vencimento_dia:  ehAnual ? anualDia : ((usaDiaSemana || ehUnico) ? null : Number(vencimentoRaw)),
    dia_semana:      usaDiaSemana ? Number(diaSemanaRaw) : null,
    intervalo_semanas: intervalo_semanas_cat,
    valor_base:      valorVariavel ? 0 : valorBaseParsed,
    valor_variavel:  valorVariavel,
    moeda,
    iniciado_em:     ehAnual ? anualIso : iniciado_em,
    terminado_em,
    descricao,
    status,
    contato_id,
  };

  const button = document.getElementById('btn-salvar-compromisso');
  const originalLabel = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    let resolvedDividaId = (isDividasCat && dividaRaw && dividaRaw !== '__new__') ? dividaRaw : null;
    if (isDividasCat && dividaRaw === '__new__') {
      const user = await getCurrentUser();
      const { data: novaDivida, error: divErr } = await supabase.from('dividas').insert({
        user_id:         user.id,
        workspace_id:    requireWorkspaceId(),
        created_by:      user.id,
        nome:            cat.nome,
        valor_total:     valorBaseParsed || 0,
        valor_pago:      0,
        data_inicio:     iniciado_em,
        data_vencimento: terminado_em || null,
        conta_id:        conta_id || null,
        status:          'Ativa',
      }).select('id').single();
      if (divErr) {
        showToast('Categoria salva, mas erro ao criar dívida: ' + divErr.message, 'warning', 8000);
      } else {
        resolvedDividaId = novaDivida.id;
        deps.getCachedDividas().push({ id: novaDivida.id, nome: cat.nome, status: 'Ativa' });
      }
    }
    if (resolvedDividaId) payload.divida_id = resolvedDividaId;

    const { data: saved, error } = await supabase
      .from('categorias').update(payload).eq('id', catId).select('valor_base, valor_variavel').single();
    if (error) throw error;

    if (!payload.valor_variavel && Number(saved?.valor_base) !== Number(payload.valor_base)) {
      showToast('Atenção: migrations 0037/0038/0039 não aplicadas no banco — execute-as no Supabase SQL Editor', 'warning', 12000);
      return;
    }

    if (valorVariavel) {
      const items = collectValoresMensais();
      await saveValoresMensaisToOrcamento(null, moeda, items, catId);
    }

    showToast(t('compromissos.toast.salvo', 'Compromisso salvo'), 'success');
    closeModal('modal-compromisso');
    deps.setEditingCatId(null);
    await deps.loadCategorias();
    await deps.loadCompromissos();
  } catch (err) {
    console.error('[saveCatDirectCompromisso]', err);
    showToast('Erro ao salvar: ' + (err.message || JSON.stringify(err)), 'error', 12000);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

/** Salva o compromisso (subcategoria) — fluxo completo do form-compromisso. */
export async function saveCompromisso(event, deps) {
  event.preventDefault();

  if (document.getElementById('comp-nivel').value === 'categoria') {
    await saveCatDirectCompromisso(deps);
    return;
  }

  const button = document.getElementById('btn-salvar-compromisso');

  const nome           = document.getElementById('comp-nome').value.trim();
  const apelidoRaw     = document.getElementById('comp-apelido').value.trim();
  const apelido        = apelidoRaw || null;
  const tipo           = document.getElementById('comp-tipo').value;
  const categoria_id   = document.getElementById('comp-categoria').value || null;
  const cachedCategorias = deps.getCachedCategorias();
  const cat            = cachedCategorias.find((c) => c.id === categoria_id);
  const projetoRaw     = document.getElementById('comp-projeto')?.value || '';
  const vinculoRaw     = document.getElementById('comp-vinculo-investimento')?.value || '';
  const projeto_id     = (cat?.grupo === 'investimentos' && projetoRaw && projetoRaw !== '__new__') ? projetoRaw
    : (cat?.grupo === 'custo_vida' ? (vinculoRaw || null) : null);
  const isDividasCat   = cat?.grupo === 'dividas' || /dívida|divida/i.test(cat?.nome || '');
  const dividaRaw      = isDividasCat ? (document.getElementById('comp-divida')?.value || '') : '';
  const contato_id     = deps.getContatoPickerValue();
  const conta_id          = document.getElementById('comp-conta').value || null;
  const conta_destino_id  = document.getElementById('comp-conta-destino')?.value || null;
  const tipo_pagamento = document.getElementById('comp-tipo-pagamento').value || null;
  const periodo        = document.getElementById('comp-periodo').value;
  const vencimentoRaw  = document.getElementById('comp-vencimento-dia').value;
  const diaSemanaRaw   = document.getElementById('comp-dia-semana').value;
  const intervaloSemanasRaw = document.getElementById('comp-intervalo-semanas')?.value;
  const valorBaseRaw   = document.getElementById('comp-valor-base').value;
  const valorVariavel  = document.getElementById('comp-valor-variavel').checked;
  const ehRendaPrincipal = document.getElementById('comp-renda-principal').checked && tipo === 'Receita';
  const moedaFixa      = document.getElementById('comp-moeda').value;
  const moedaVar       = document.getElementById('comp-moeda-var')?.value || moedaFixa;
  const moeda          = valorVariavel ? moedaVar : moedaFixa;
  const iniciado_em    = document.getElementById('comp-iniciado-em').value || null;
  const terminado_em   = document.getElementById('comp-terminado-em').value || null;
  const descricao      = document.getElementById('comp-descricao').value.trim() || null;
  const status         = document.getElementById('comp-status').value;

  if (!nome) { showToast(t('compromissos.validacao.nome_obrigatorio', 'Informe o nome do compromisso'), 'error'); return; }
  if (!categoria_id) { showToast(t('compromissos.validacao.cat_obrigatoria', 'Escolha uma categoria'), 'error'); return; }
  if (!iniciado_em) { showToast('Informe a data de início', 'error'); return; }
  if (isDividasCat && !dividaRaw) { showToast('Vincule uma dívida existente ou crie uma nova', 'error'); return; }
  if (tipo === 'Transferência' && !conta_id) {
    showToast('Transferências precisam de uma conta de origem (De).', 'error'); return;
  }
  if (tipo === 'Transferência' && !conta_destino_id) {
    showToast('Transferências precisam de uma conta destino (Para).', 'error'); return;
  }
  if (tipo === 'Caixinha' && !conta_id) {
    showToast('Caixinhas precisam de um Banco / Cartão de origem.', 'error'); return;
  }
  if (tipo === 'Caixinha' && !conta_destino_id) {
    showToast('Caixinhas precisam de uma Conta Reserva.', 'error'); return;
  }
  const valorBaseParsedSub = parseUserNumber(valorBaseRaw);
  if (!valorVariavel && (valorBaseRaw === '' || isNaN(valorBaseParsedSub))) {
    showToast(t('compromissos.validacao.valor_invalido', 'Informe um valor válido'), 'error'); return;
  }

  const usaDiaSemana = periodo === 'Semanal' || periodo === 'Quinzenal';
  const ehUnico = periodo === 'Único';
  const ehAnual = periodo === 'Anual';
  let anualDia = null;
  let anualIso = null;
  if (ehAnual) {
    const a = deps.readAnualDateInput();
    if (!a.dia) { showToast('Escolha a data de vencimento anual', 'error'); return; }
    anualDia = a.dia;
    anualIso = a.iso;
  } else if (usaDiaSemana) {
    if (diaSemanaRaw === '') { showToast('Selecione o dia da semana', 'error'); return; }
  } else if (!ehUnico) {
    if (!vencimentoRaw || vencimentoRaw < 1 || vencimentoRaw > 31) {
      showToast('Dia de vencimento deve ser entre 1 e 31', 'error'); return;
    }
  }

  const intervalo_semanas = (periodo === 'Semanal' && intervaloSemanasRaw)
    ? Math.max(1, Number(intervaloSemanasRaw) || 1)
    : 1;

  const payload = {
    nome,
    apelido,
    tipo,
    categoria_id,
    conta_id,
    conta_destino_id: (tipo === 'Transferência' || tipo === 'Caixinha') ? conta_destino_id : null,
    tipo_pagamento,
    periodo,
    vencimento_dia: ehAnual ? anualDia : ((usaDiaSemana || ehUnico) ? null : Number(vencimentoRaw)),
    dia_semana:     usaDiaSemana ? Number(diaSemanaRaw) : null,
    intervalo_semanas,
    valor_base: valorVariavel ? 0 : valorBaseParsedSub,
    moeda,
    iniciado_em: ehAnual ? anualIso : iniciado_em,
    terminado_em,
    descricao,
    status,
    valor_variavel: valorVariavel,
    eh_renda_principal: ehRendaPrincipal,
    projeto_id,
    divida_id: null, // preenchido após resolver __new__ abaixo
    contato_id,
  };

  const originalLabel = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Salvando…';

  const editingId = deps.getEditingId();
  const cachedCompromissos = deps.getCachedCompromissos();

  try {
    let response;
    let subcategoriaMsg = null;
    if (editingId) {
      const oldData = cachedCompromissos.find((c) => c.id === editingId);
      const tipoChanged = oldData && oldData.tipo !== tipo;
      response = await supabase.from('subcategorias').update(payload).eq('id', editingId).select().single();
      if (tipoChanged && tipo === 'Caixinha') {
        subcategoriaMsg = 'Este compromisso foi convertido em caixinha.';
      }
    } else {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sessão expirada. Faça login novamente.');

      // Verifica se já existe subcategoria com mesmo nome na mesma categoria
      const nomeNorm = (payload.nome || '').trim().toLowerCase();
      const existing = cachedCompromissos.find(
        (c) => (c.nome || '').trim().toLowerCase() === nomeNorm && c.categoria_id === payload.categoria_id
      );

      const isCaixinha = tipo === 'Caixinha';
      const entidade   = isCaixinha ? 'caixinha' : 'subcategoria';
      if (existing) {
        const isFull = Number(existing.valor_base) > 0 || existing.valor_variavel === true;
        if (!isFull) {
          response = await supabase.from('subcategorias').update({ ...payload }).eq('id', existing.id).select().single();
          subcategoriaMsg = `Esta ${entidade} já existia em Configurações. O compromisso foi vinculado a ela.`;
        } else {
          response = await supabase.from('subcategorias').insert({ ...payload, user_id: user.id, workspace_id: requireWorkspaceId(), created_by: user.id }).select().single();
          subcategoriaMsg = `Já existe um compromisso com esse nome nessa categoria. Um novo foi criado mesmo assim.`;
        }
      } else {
        response = await supabase.from('subcategorias').insert({ ...payload, user_id: user.id, workspace_id: requireWorkspaceId(), created_by: user.id }).select().single();
        subcategoriaMsg = isCaixinha
          ? 'Uma nova caixinha foi criada.'
          : 'Uma nova subcategoria foi criada junto com este compromisso.';
      }
    }
    if (response.error) throw response.error;

    if (editingId) {
      const oldData = cachedCompromissos.find((c) => c.id === editingId);
      const motivo = document.getElementById('comp-motivo').value.trim() || null;
      if (oldData) await deps.logHistoryEntries(editingId, oldData, response.data, motivo);
    }

    if (valorVariavel && response.data?.id) {
      const items = collectValoresMensais();
      await saveValoresMensaisToOrcamento(response.data.id, moeda, items);
    }

    let resolvedDividaId = (isDividasCat && dividaRaw && dividaRaw !== '__new__') ? dividaRaw : null;
    if (isDividasCat && dividaRaw === '__new__') {
      const user = await getCurrentUser();
      const { data: novaDivida, error: divErr } = await supabase.from('dividas').insert({
        user_id:      user.id,
        workspace_id: requireWorkspaceId(),
        created_by:   user.id,
        nome:         payload.apelido || payload.nome,
        valor_total:  0,  // sem configuração — usuário define em Dívidas
        valor_pago:   0,
        data_inicio:  payload.iniciado_em,
        data_vencimento: payload.terminado_em || null,
        conta_id:     payload.conta_id || null,
        status:       'Ativa',
      }).select('id').single();
      if (divErr) {
        showToast('Compromisso salvo, mas erro ao criar dívida: ' + divErr.message, 'warning', 8000);
      } else {
        resolvedDividaId = novaDivida.id;
        deps.getCachedDividas().push({ id: novaDivida.id, nome: payload.apelido || payload.nome, status: 'Ativa' });
      }
    }

    if (resolvedDividaId && response.data?.id) {
      await supabase.from('subcategorias').update({ divida_id: resolvedDividaId }).eq('id', response.data.id);
    }

    // Auto-criar projeto de investimento quando selecionado "__new__"
    const isInvestCat = cat?.grupo === 'investimentos';
    let resolvedProjetoId = (!isInvestCat || !projetoRaw || projetoRaw === '__new__') ? null : projetoRaw;
    if (isInvestCat && projetoRaw === '__new__') {
      const user = await getCurrentUser();
      const { data: novoProjeto, error: projErr } = await supabase.from('projetos_investimento').insert({
        user_id:      user.id,
        workspace_id: requireWorkspaceId(),
        created_by:   user.id,
        nome:         payload.apelido || payload.nome,
        meta_valor:   null,  // sem configuração — usuário define em Investimentos
        status:       'ativo',
        cor:          '#6D5EF5',
      }).select('id').single();
      if (projErr) {
        showToast('Compromisso salvo, mas erro ao criar projeto: ' + projErr.message, 'warning', 8000);
      } else {
        resolvedProjetoId = novoProjeto.id;
      }
    }

    if (resolvedProjetoId && response.data?.id) {
      await supabase.from('subcategorias').update({ projeto_id: resolvedProjetoId }).eq('id', response.data.id);
    }

    showToast(editingId ? t('compromissos.toast.atualizado', 'Compromisso atualizado') : t('compromissos.toast.criado', 'Compromisso criado'), 'success');
    if (subcategoriaMsg) showInfoPopup(tipo === 'Caixinha' ? 'Caixinha' : 'Subcategoria', subcategoriaMsg);

    // Signal embedded mode that a save occurred before modal closes
    window._embeddedCompSaved = true;
    closeModal('modal-compromisso');
    deps.setEditingId(null);
    // Perf-A2: invalida cache de meses preparados — sub criada/editada
    // afeta orcamento_geral e pagamentos em N meses futuros.
    markAllAsStale();
    await deps.loadCompromissos();
  } catch (err) {
    console.error('[saveCompromisso]', err);
    let msg = err?.message || err?.hint || err?.details || JSON.stringify(err);
    if (/column.*(dia_semana|categoria_id|tipo)/i.test(msg) || /relation.*subcategorias/i.test(msg)) {
      msg = 'Schema desatualizado — rode a migration 0006_compromissos_rebrand.sql no Supabase.';
    }
    showToast('Erro ao salvar: ' + msg, 'error', 12000);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

export async function changeStatus(id, newStatus, deps) {
  const update = { status: newStatus };
  if (newStatus === 'arquivada') update.fechada_em = todayISO();
  const { error } = await supabase.from('subcategorias').update(update).eq('id', id);
  if (error) {
    showToast('Erro: ' + error.message, 'error', 8000);
    return;
  }
  showToast(`Compromisso ${newStatus === 'arquivada' ? 'arquivado' : 'atualizado'}`, 'success');
  markAllAsStale();
  await deps.loadCompromissos();
}

export async function deleteCompromisso(id, deps) {
  const c   = deps.getCachedCompromissos().find((x) => x.id === id);
  const cat = deps.getCachedCategorias().find((cc) => cc.id === c?.categoria_id);

  let error;
  if (c?.divida_id && cat?.grupo === 'dividas') {
    const { count } = await supabase
      .from('pagamentos_divida_historico')
      .select('id', { count: 'exact', head: true })
      .eq('divida_id', c.divida_id);
    // Defense in depth: cada DELETE filtra por workspace_id explícito
    const _wsId = requireWorkspaceId();
    if ((count || 0) > 0) {
      await supabase.from('dividas').update({ status: 'Arquivada' }).eq('id', c.divida_id);
      ({ error } = await supabase.from('subcategorias').delete().eq('id', id).eq('workspace_id', _wsId));
    } else {
      ({ error } = await supabase.from('dividas').delete().eq('id', c.divida_id).eq('workspace_id', _wsId));
    }
  } else if (c?.projeto_id && cat?.grupo === 'investimentos') {
    const _wsId = requireWorkspaceId();
    const { count } = await supabase
      .from('aportes_projeto')
      .select('id', { count: 'exact', head: true })
      .eq('projeto_id', c.projeto_id);
    ({ error } = await supabase.from('subcategorias').delete().eq('id', id).eq('workspace_id', _wsId));
    if (!error) {
      if ((count || 0) > 0) {
        await supabase.from('projetos_investimento').update({
          status:            'arquivado',
          comp_valor_base:   c.valor_base,
          comp_periodo:      c.periodo,
          comp_categoria_id: c.categoria_id,
          comp_data_inicio:  c.iniciado_em,
        }).eq('id', c.projeto_id);
      } else {
        await supabase.from('projetos_investimento').delete().eq('id', c.projeto_id).eq('workspace_id', _wsId);
      }
    }
  } else {
    ({ error } = await supabase.from('subcategorias').delete().eq('id', id).eq('workspace_id', requireWorkspaceId()));
  }

  if (error) {
    showToast('Erro ao deletar: ' + error.message, 'error', 8000);
    return;
  }
  showToast(t('compromissos.toast.deletado', 'Compromisso deletado permanentemente'), 'success');
  markAllAsStale();
  await deps.loadCompromissos();
}

// =============================================================
// Encerrar compromisso
// =============================================================
export function openEncerrarModal(c, deps) {
  encerrandoId = c.id;
  const nome = escapeHtml(deps.displayName(c));
  document.getElementById('encerrar-msg').innerHTML =
    `Encerrar <strong>${nome}</strong>?<br><br>` +
    `Isso vai:<ul style="margin:var(--space-2) 0 0 var(--space-4);line-height:1.8;">` +
    `<li>Definir <em>Termina em</em> = hoje</li>` +
    `<li>Remover todos os pagamentos futuros com status A Pagar</li>` +
    `<li>Remover entradas de orçamento dos meses futuros</li>` +
    `</ul>`;

  const extras = document.getElementById('encerrar-extras');
  extras.innerHTML = '';

  if (c.divida_id) {
    const div = deps.getDivida(c.divida_id);
    extras.innerHTML += `
      <label class="checkbox-item" style="margin-bottom:var(--space-2);">
        <input type="checkbox" id="encerrar-divida" checked>
        <span>Marcar dívida <strong>${escapeHtml(div?.nome || '—')}</strong> como encerrada</span>
      </label>`;
  }
  if (c.projeto_id) {
    const proj = deps.getProjeto(c.projeto_id);
    extras.innerHTML += `
      <label class="checkbox-item">
        <input type="checkbox" id="encerrar-projeto" checked>
        <span>Marcar projeto <strong>${escapeHtml(proj?.nome || '—')}</strong> como encerrado</span>
      </label>`;
  }

  openModal('modal-encerrar');
}

export async function confirmarEncerrar(deps) {
  if (!encerrandoId) return;
  const cachedCompromissos = deps.getCachedCompromissos();
  const c = cachedCompromissos.find((x) => x.id === encerrandoId);
  if (!c) return;

  const encerrarDivida  = document.getElementById('encerrar-divida')?.checked ?? false;
  const encerrarProjeto = document.getElementById('encerrar-projeto')?.checked ?? false;

  closeModal('modal-encerrar');
  closeModal('modal-details');

  const today = todayISO();
  const currentMesAno = today.slice(0, 7) + '-01';

  // 1. Encerra a subcategoria
  const { error: subErr } = await supabase
    .from('subcategorias')
    .update({ terminado_em: today, status: 'inativa' })
    .eq('id', encerrandoId);
  if (subErr) { showToast('Erro ao encerrar: ' + subErr.message, 'error', 8000); return; }

  // 2. Remove pagamentos pendentes (A Pagar) futuros
  await supabase
    .from('pagamentos')
    .delete()
    .eq('subcategoria_id', encerrandoId)
    .eq('status', 'A Pagar')
    .gte('data_vencimento', today);

  // 3. Remove orcamentos de meses futuros
  await supabase
    .from('orcamento_geral')
    .delete()
    .eq('subcategoria_id', encerrandoId)
    .gt('mes_ano', currentMesAno);

  // 4. Dívida vinculada
  if (encerrarDivida && c.divida_id) {
    await supabase.from('dividas').update({ status: 'Quitada' }).eq('id', c.divida_id);
  }

  // 5. Projeto vinculado
  if (encerrarProjeto && c.projeto_id) {
    await supabase.from('projetos_investimento').update({ status: 'concluido' }).eq('id', c.projeto_id);
  }

  showToast(`${deps.displayName(c)} encerrado`, 'success');
  encerrandoId = null;
  await deps.loadCompromissos();
}
