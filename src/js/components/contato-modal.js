// =============================================================
// FinFlow — Modal de cadastro/edição de contato (compartilhado)
// =============================================================
// Reutilizável em qualquer página: contatos.html (CRUD), e qualquer
// picker que precise abrir o mesmo formulário completo.
//
// Uso:
//   import { openContatoModal } from '../components/contato-modal.js';
//   const novo = await openContatoModal({ initialData: { nome: 'X' }, modo: 'create' });
//   if (novo) { /* contato criado/atualizado */ }
//
// Retorna o contato criado/atualizado ou null se cancelar.
// =============================================================

import { supabase } from '../lib/supabase.js';
import { getCurrentUser } from '../lib/auth.js';
import { requireWorkspaceId } from '../lib/workspace.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../lib/utils.js';
import {
  isValidCnpj, formatCnpj,
} from '../lib/cnpj-lookup.js';
import { PhonePicker } from './phone-picker.js';
import { AddressPicker, renderAddressFieldsHtml } from './address-picker.js';
import { FotoPicker } from './foto-picker.js';
import { buildEmbedMapUrl } from '../lib/google-places.js';

const FIELDS = [
  'nome', 'nome_extrato', 'tipo', 'pessoa_tipo',
  'email', 'telefone', 'whatsapp', 'website',
  'linkedin', 'instagram',
  'documento', 'empresa', 'cargo',
  'pais', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado_uf',
  'aniversario', 'bio',
];

/**
 * Abre o modal de cadastro/edição. Retorna o contato salvo ou null.
 * @param {object} opts
 * @param {object} [opts.initialData]   - dados iniciais (nome, tipo, etc.)
 * @param {'create'|'edit'} [opts.modo] - default 'create'
 * @param {string} [opts.editingId]     - id do contato sendo editado (modo='edit')
 */
export function openContatoModal({ initialData = {}, modo = 'create', editingId = null } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.innerHTML = renderModalHtml(modo === 'edit' ? 'Editar contato' : 'Novo contato');
    document.body.appendChild(backdrop);

    let modalLogoUrl = initialData?.logo_url || null;

    // ── Helpers ────────────────────────────────────────────────
    const $ = (id) => backdrop.querySelector(`#${id}`);

    function applyPessoaTipoUI() {
      const pessoaTipo = $('ct-pessoa-tipo').value;
      $('ct-profissional-section').classList.toggle('hidden', pessoaTipo !== 'fisica');
      const labelEl = $('ct-documento-label');
      if (pessoaTipo === 'fisica')        labelEl.textContent = 'CPF';
      else if (pessoaTipo === 'juridica') labelEl.textContent = 'CNPJ';
      else                                labelEl.textContent = 'Documento (CPF/CNPJ)';
      // Botão "Buscar pelo CNPJ" foi removido — o campo Documento agora aceita
      // CPF ou CNPJ livre, e o label se adapta ao pessoa_tipo selecionado acima.

      // Botão "Buscar no Google" só aparece pra PJ não-estrangeira
      const estrangeiroPJ = $('ct-estrangeiro')?.checked ?? false;
      const showPlacesBtn = pessoaTipo === 'juridica' && !estrangeiroPJ;
      $('ct-btn-places-search')?.classList.toggle('hidden', !showPlacesBtn);
    }

    function applyEstrangeiroUI() {
      const checked = $('ct-estrangeiro')?.checked ?? false;
      $('ct-documento-wrap')?.classList.toggle('hidden', checked);
      if (checked) {
        const docEl = $('ct-documento');
        if (docEl) docEl.value = '';
      }
    }

    let mapaDebounce = null;
    function updateMapaPreview() {
      const wrap   = $('ct-mapa-preview');
      const iframe = $('ct-mapa-iframe');
      if (!wrap || !iframe || !apCm) return;
      const v = apCm.getValue();
      // Requer no mínimo cidade OU (logradouro + algum locale)
      const hasMinimo = !!v.cidade || (!!v.logradouro && (!!v.bairro || !!v.estado_uf));
      if (!hasMinimo) {
        wrap.classList.add('hidden');
        if (iframe.src) iframe.src = '';
        return;
      }
      const addr = apCm.getFormatted();
      const url  = buildEmbedMapUrl(addr);
      if (!url) {
        wrap.classList.add('hidden');
        return;
      }
      if (iframe.src !== url) iframe.src = url;
      wrap.classList.remove('hidden');
    }
    function scheduleMapaUpdate() {
      clearTimeout(mapaDebounce);
      mapaDebounce = setTimeout(updateMapaPreview, 400);
    }

    function fillFromInitial() {
      for (const k of FIELDS) {
        const el = $(`ct-${k.replace(/_/g, '-')}`);
        if (!el) continue;
        if (k === 'telefone' && ppTelCm) { ppTelCm.setValue(initialData?.[k] || ''); continue; }
        if (k === 'whatsapp'  && ppWaCm)  { ppWaCm.setValue(initialData?.[k]  || ''); continue; }
        el.value = initialData?.[k] ?? (k === 'tipo' ? 'fornecedor' : '');
      }
      // Address picker
      apCm.setValue(initialData || {});

      // Foto picker
      fpCm.setValue(initialData?.logo_url || null, initialData?.nome || '');
      // "Mesmo número" — detecta se os dois são iguais ao editar
      const mesmoEl = $('ct-mesmo-numero');
      if (mesmoEl && initialData?.telefone && initialData?.whatsapp && initialData.telefone === initialData.whatsapp) {
        mesmoEl.checked = true;
        if (ppWaCm) ppWaCm.setDisabled(true);
      }
      // Estrangeiro
      const estrEl = $('ct-estrangeiro');
      if (estrEl) estrEl.checked = initialData?.estrangeiro ?? false;
      applyPessoaTipoUI();
      applyEstrangeiroUI();
      updateMapaPreview();
    }

    function collectPayload() {
      const payload = {};
      for (const k of FIELDS) {
        const el = $(`ct-${k.replace(/_/g, '-')}`);
        if (!el) continue;
        const v = (el.value || '').trim();
        payload[k] = v === '' ? null : v;
      }
      payload.logo_url    = fpCm.getValue() ?? modalLogoUrl;
      payload.estrangeiro = $('ct-estrangeiro')?.checked ?? false;
      if (!payload.nome) {
        $('ct-nome').focus();
        $('ct-nome').classList.add('input--error');
        showToast('Informe o nome do contato.', 'error');
        return null;
      }
      if (!payload.tipo) payload.tipo = 'fornecedor';
      return payload;
    }

    async function handleSave() {
      const payload = collectPayload();
      if (!payload) return;
      const btn = $('btn-save-contato');
      btn.disabled = true; btn.textContent = 'Salvando…';
      try {
        const user = await getCurrentUser();
        let result;
        if (modo === 'edit' && editingId) {
          const r = await supabase.from('contatos').update(payload).eq('id', editingId).select().single();
          result = r;
        } else {
          const r = await supabase.from('contatos').insert({ ...payload, user_id: user.id, workspace_id: requireWorkspaceId() }).select().single();
          result = r;
        }
        if (result.error) throw result.error;
        showToast(modo === 'edit' ? 'Contato atualizado.' : `Contato "${result.data.nome}" criado.`, 'success');
        cleanup(result.data);
      } catch (err) {
        showToast('Erro ao salvar: ' + (err.message || err), 'error', 8000);
        btn.disabled = false; btn.textContent = 'Salvar contato';
      }
    }

    // ── Phone pickers ──────────────────────────────────────────
    const elTelCm = $('ct-telefone');
    const elWaCm  = $('ct-whatsapp');
    let ppTelCm = null, ppWaCm = null;
    if (elTelCm) ppTelCm = new PhonePicker(elTelCm, { placeholder: '(11) 99999-9999' });
    if (elWaCm)  ppWaCm  = new PhonePicker(elWaCm,  { placeholder: '(11) 99999-9999' });

    // ── Address picker ─────────────────────────────────────────
    const apCm = new AddressPicker('ct-', backdrop);

    // ── Foto picker ────────────────────────────────────────────
    const fpCm = new FotoPicker($('ct-foto-picker'));

    // ── Wiring ─────────────────────────────────────────────────
    fillFromInitial();
    $('ct-pessoa-tipo').addEventListener('change', applyPessoaTipoUI);
    $('ct-estrangeiro')?.addEventListener('change', applyEstrangeiroUI);
    $('ct-pais')?.addEventListener('change', () => {
      const pais = $('ct-pais')?.value ?? 'Brasil';
      const estrEl = $('ct-estrangeiro');
      if (!estrEl) return;
      estrEl.checked = !!pais && pais !== 'Brasil';
      applyEstrangeiroUI();
    });
    $('ct-documento').addEventListener('blur', () => {
      // Formata CNPJ automaticamente quando o usuário sai do campo
      const cnpj = $('ct-documento').value;
      if (isValidCnpj(cnpj)) $('ct-documento').value = formatCnpj(cnpj);
    });
    $('ct-nome').addEventListener('input', () => {
      $('ct-nome').classList.remove('input--error');
      fpCm.setNome($('ct-nome').value.trim());
    });
    $('btn-save-contato').addEventListener('click', handleSave);

    // Botão "Buscar no Google" → abre modal de busca de empresa
    $('ct-btn-places-search')?.addEventListener('click', async () => {
      const { openPlacesSearchModal } = await import('./places-search-modal.js');
      const { parseAddressComponents } = await import('../lib/google-places.js');
      const place = await openPlacesSearchModal({ initialQuery: $('ct-nome').value.trim() });
      if (!place) return;

      // Preenche apenas campos vazios (não sobrescreve dados que o usuário já digitou)
      const nomeEl = $('ct-nome');
      if (!nomeEl.value.trim()) nomeEl.value = place.displayName?.text || '';

      // Telefone (só se vazio) — usa nacional preferencialmente
      const tel = place.nationalPhoneNumber || place.internationalPhoneNumber;
      if (tel && ppTelCm && !$('ct-telefone').value.trim()) {
        ppTelCm.setValue(tel);
      }

      // Website (só se vazio)
      const websiteEl = $('ct-website');
      if (websiteEl && !websiteEl.value.trim() && place.websiteUri) {
        websiteEl.value = place.websiteUri;
      }

      // Endereço — SEMPRE sobrescreve (Google é mais completo)
      const addr = parseAddressComponents(place.addressComponents || []);
      apCm.setValue({
        pais:        addr.pais || 'Brasil',
        cep:         addr.cep,
        logradouro:  addr.logradouro,
        numero:      addr.numero,
        bairro:      addr.bairro,
        cidade:      addr.cidade,
        estado_uf:   addr.estado_uf,
      });

      // Atualiza foto/avatar se vier algo (Places New não retorna logo diretamente;
      // omitimos esse campo)

      // Atualiza nome no foto-picker se foi preenchido agora
      fpCm.setNome($('ct-nome').value.trim());

      updateMapaPreview();
      showToast('Dados da empresa preenchidos. Revise e salve.', 'success');
    });

    // Listeners pra atualizar o mini-mapa quando o endereço muda
    ['ct-logradouro', 'ct-numero', 'ct-bairro', 'ct-cidade', 'ct-estado-uf', 'ct-pais', 'ct-cep']
      .forEach((id) => {
        $(id)?.addEventListener('input',  scheduleMapaUpdate);
        $(id)?.addEventListener('change', scheduleMapaUpdate);
      });

    // "Mesmo número" toggle
    const mesmoElCm = $('ct-mesmo-numero');
    if (mesmoElCm) {
      mesmoElCm.addEventListener('change', () => {
        if (!ppWaCm || !ppTelCm) return;
        ppWaCm.setDisabled(mesmoElCm.checked);
        if (mesmoElCm.checked) ppWaCm.syncFrom(ppTelCm);
      });
    }
    // Sincroniza whatsapp quando telefone muda (se toggle ativo)
    if (elTelCm) {
      elTelCm.addEventListener('input', () => {
        if (mesmoElCm?.checked && ppWaCm && ppTelCm) ppWaCm.syncFrom(ppTelCm);
      });
    }

    // Close handlers
    function cleanup(result) {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') cleanup(null);
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave();
    }
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) return cleanup(null);
      if (e.target.closest('[data-cancel]')) return cleanup(null);
    });
    document.addEventListener('keydown', onKey);

    setTimeout(() => $('ct-nome').focus(), 30);
  });
}

// ── HTML do modal (idêntico ao usado em contatos.html) ───────────
function renderModalHtml(title) {
  return `
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3 class="modal-title">${escapeHtml(title)}</h3>
        <button type="button" class="modal-close" data-cancel aria-label="Fechar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">

        <!-- Foto de perfil -->
        <div class="foto-picker-container">
          <div class="foto-picker-el" id="ct-foto-picker"></div>
          <p class="field-hint" style="margin:0">Clique no avatar para adicionar ou trocar a foto</p>
        </div>

        <!-- Identificação -->
        <h3 class="field-section-title">Identificação</h3>
        <div class="field-group" style="grid-template-columns: 1fr 1fr;">
          <div class="field">
            <label class="field-label" for="ct-pessoa-tipo">Pessoa / Empresa</label>
            <select class="select" id="ct-pessoa-tipo">
              <option value="">— Não informado —</option>
              <option value="fisica">Pessoa Física</option>
              <option value="juridica">Pessoa Jurídica</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="ct-tipo">Relação</label>
            <select class="select" id="ct-tipo">
              <option value="ambos">Cliente e Fornecedor</option>
              <option value="cliente">Cliente</option>
              <option value="fornecedor">Fornecedor</option>
            </select>
          </div>
        </div>
        <label class="estrangeiro-check-row">
          <input type="checkbox" id="ct-estrangeiro">
          Estrangeiro — não possui CPF / CNPJ
        </label>
        <div class="field-group" style="grid-template-columns: 1fr 1fr;">
          <div class="field">
            <label class="field-label" for="ct-nome">
              Nome <span class="required">*</span>
              <button type="button" class="btn-link-search hidden" id="ct-btn-places-search" title="Buscar empresa no Google e preencher dados automaticamente">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                Buscar no Google
              </button>
            </label>
            <input type="text" class="input" id="ct-nome" required maxlength="120" placeholder="Nome do contato">
          </div>
          <div class="field" id="ct-documento-wrap">
            <label class="field-label" for="ct-documento" id="ct-documento-label">Documento (CPF/CNPJ)</label>
            <input type="text" class="input" id="ct-documento" maxlength="30">
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="ct-nome-extrato">Nome no extrato</label>
          <input type="text" class="input" id="ct-nome-extrato" maxlength="120" placeholder="Como aparece no extrato bancário">
          <p class="field-hint">Usado para reconhecimento por correspondência de texto.</p>
        </div>

        <!-- Contato -->
        <h3 class="field-section-title">Contato</h3>
        <div class="field-group" style="grid-template-columns: 1fr 1fr;">
          <div class="field">
            <label class="field-label" for="ct-email">E-mail</label>
            <input type="email" class="input" id="ct-email" maxlength="200" placeholder="email@dominio.com">
          </div>
          <div class="field">
            <label class="field-label" for="ct-website">Website</label>
            <input type="url" class="input" id="ct-website" maxlength="200" placeholder="https://…">
          </div>
        </div>
        <div class="field-group" style="grid-template-columns: 1fr 1fr;">
          <div class="field">
            <label class="field-label" for="ct-telefone">Telefone</label>
            <input type="text" id="ct-telefone" maxlength="40" placeholder="(11) 99999-9999">
          </div>
          <div class="field">
            <label class="field-label" for="ct-whatsapp">WhatsApp</label>
            <input type="text" id="ct-whatsapp" maxlength="40" placeholder="(11) 99999-9999">
          </div>
        </div>
        <div class="phone-same-row" style="margin-top: -8px; margin-bottom: 4px;">
          <input type="checkbox" id="ct-mesmo-numero">
          <label for="ct-mesmo-numero">Telefone e WhatsApp são o mesmo número</label>
        </div>

        <!-- Redes sociais -->
        <h3 class="field-section-title">Redes sociais</h3>
        <div class="field-group" style="grid-template-columns: 1fr 1fr;">
          <div class="field">
            <label class="field-label" for="ct-linkedin">LinkedIn</label>
            <input type="text" class="input" id="ct-linkedin" maxlength="200" placeholder="URL ou usuário">
          </div>
          <div class="field">
            <label class="field-label" for="ct-instagram">Instagram</label>
            <input type="text" class="input" id="ct-instagram" maxlength="60" placeholder="@usuario (sem @)">
          </div>
        </div>

        <!-- Profissional (só PF) -->
        <div id="ct-profissional-section" class="hidden">
          <h3 class="field-section-title">Profissional</h3>
          <div class="field-group" style="grid-template-columns: 1fr 1fr;">
            <div class="field">
              <label class="field-label" for="ct-empresa">Empresa</label>
              <input type="text" class="input" id="ct-empresa" maxlength="120">
            </div>
            <div class="field">
              <label class="field-label" for="ct-cargo">Cargo</label>
              <input type="text" class="input" id="ct-cargo" maxlength="80">
            </div>
          </div>
        </div>

        <!-- Localização -->
        <h3 class="field-section-title">Localização</h3>
        <div class="field">
          <label class="field-label">Endereço</label>
          <div id="ct-address-picker">
            ${renderAddressFieldsHtml('ct-')}
          </div>
          <div id="ct-mapa-preview" class="mapa-preview hidden">
            <iframe
              id="ct-mapa-iframe"
              class="mapa-preview__iframe"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              allowfullscreen
              src=""
              title="Mapa do endereço">
            </iframe>
          </div>
        </div>

        <!-- Outros -->
        <h3 class="field-section-title">Outros</h3>
        <div class="field-group" style="grid-template-columns: 1fr 1fr;">
          <div class="field">
            <label class="field-label" for="ct-aniversario">Aniversário</label>
            <input type="date" class="input" id="ct-aniversario">
          </div>
          <div class="field"></div>
        </div>
        <div class="field">
          <label class="field-label" for="ct-bio">Bio / Observação</label>
          <textarea class="textarea" id="ct-bio" rows="3" maxlength="500"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button type="button" class="btn btn-primary" id="btn-save-contato">Salvar contato</button>
      </div>
    </div>
  `;
}
