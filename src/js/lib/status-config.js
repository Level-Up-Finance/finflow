// Taxonomia unificada de status para dívidas e projetos de investimento.
// Mesma estrutura, mesmas regras — só os rótulos mudam por contexto.

/**
 * 6 status semânticos universais (id, ordem, props funcionais).
 * Cada contexto (dívida/investimento) tem seu próprio rótulo, mas o ID lógico
 * é compartilhado e usado pra regras de comportamento.
 */
export const STATUS_IDS = [
  'sem_definicao',  // sem plano/meta — ciência mas sem números fechados
  'a_comecar',      // plano/meta definido, ainda não executado (acumulado=0)
  'em_curso',       // plano/meta definido, parcialmente executado
  'pausado',        // pausado (negociação para dívida, pausa para investimento)
  'sucesso',        // terminado por atingir o objetivo
  'arquivado',      // terminado sem atingir o objetivo
];

/**
 * Regras funcionais por status id:
 *   - exigeData:        data_vencimento/data_alvo é obrigatória?
 *   - geraCompromisso:  o sistema deve gerar pagamentos/aportes automaticamente?
 *   - terminado:        é um estado terminal (sai dos blocos ativos)?
 *   - permiteAtraso:    pode receber badge derivado de atraso/vencido?
 */
export const STATUS_RULES = {
  sem_definicao: { exigeData: false, geraCompromisso: false, terminado: false, permiteAtraso: false },
  a_comecar:     { exigeData: true,  geraCompromisso: true,  terminado: false, permiteAtraso: true  },
  em_curso:      { exigeData: true,  geraCompromisso: true,  terminado: false, permiteAtraso: true  },
  pausado:       { exigeData: false, geraCompromisso: false, terminado: false, permiteAtraso: false },
  sucesso:       { exigeData: false, geraCompromisso: false, terminado: true,  permiteAtraso: false },
  arquivado:     { exigeData: false, geraCompromisso: false, terminado: true,  permiteAtraso: false },
};

/**
 * Vocabulário por contexto.
 *   - label:  rótulo exibido no select e nos badges
 *   - color:  cor (var CSS ou hex) usada em pills/badges
 *   - desc:   descrição curta exibida em help-text
 *   - badgeAtraso: rótulo exibido quando data passou e status permiteAtraso
 */
export const STATUS_BY_CONTEXT = {
  divida: {
    sem_definicao: { dbValue: 'Sem plano',       label: 'Sem plano',       color: 'var(--color-text-muted)', desc: 'Ciência da dívida, sem plano de pagamento definido.' },
    a_comecar:     { dbValue: 'A pagar',         label: 'A pagar',         color: 'var(--color-info)',        desc: 'Plano definido, ainda não começou a pagar.' },
    em_curso:      { dbValue: 'Pagando',         label: 'Pagando',         color: 'var(--color-warning)',     desc: 'Já começou a pagar.' },
    pausado:       { dbValue: 'Em negociação',   label: 'Em negociação',   color: '#a78bfa',                  desc: 'Pausada para renegociação.' },
    sucesso:       { dbValue: 'Quitada',         label: 'Quitada',         color: 'var(--color-success)',     desc: 'Totalmente paga.' },
    arquivado:     { dbValue: 'Arquivada',       label: 'Arquivada',       color: 'var(--color-text-muted)',  desc: 'Encerrada (sem necessariamente ter quitado).' },
    badgeAtraso:   { label: 'Atrasada', color: 'var(--color-danger)' },
  },
  investimento: {
    sem_definicao: { dbValue: 'Sem meta',  label: 'Sem meta',  color: 'var(--color-text-muted)', desc: 'Projeto registrado, sem meta definida.' },
    a_comecar:     { dbValue: 'A começar', label: 'A começar', color: 'var(--color-info)',        desc: 'Meta definida, ainda sem aportes.' },
    em_curso:      { dbValue: 'Aportando', label: 'Aportando', color: 'var(--color-warning)',     desc: 'Recebendo aportes.' },
    pausado:       { dbValue: 'Pausado',   label: 'Pausado',   color: '#a78bfa',                  desc: 'Aportes pausados.' },
    sucesso:       { dbValue: 'Concluído', label: 'Concluído', color: 'var(--color-success)',     desc: 'Meta atingida.' },
    arquivado:     { dbValue: 'Arquivado', label: 'Arquivado', color: 'var(--color-text-muted)',  desc: 'Encerrado.' },
    badgeAtraso:   { label: 'Meta vencida', color: 'var(--color-danger)' },
  },
};

/** Devolve o id semântico de um valor de banco no contexto. */
export function statusIdFromDb(dbValue, context) {
  const ctx = STATUS_BY_CONTEXT[context];
  if (!ctx) return null;
  for (const id of STATUS_IDS) {
    if (ctx[id]?.dbValue === dbValue) return id;
  }
  return null;
}

/** Devolve a config visual (label, color, desc) de um status no contexto. */
export function statusConfig(dbValue, context) {
  const id = statusIdFromDb(dbValue, context);
  if (!id) return null;
  return { id, ...STATUS_BY_CONTEXT[context][id], rules: STATUS_RULES[id] };
}

/** Verifica se uma data está vencida (< hoje). Aceita 'YYYY-MM-DD' ou Date. */
function isVencida(data) {
  if (!data) return false;
  const d = typeof data === 'string' ? new Date(data + 'T00:00:00') : data;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return d < hoje;
}

/**
 * Calcula se um item deve mostrar badge de atraso/meta-vencida.
 * Retorna { label, color } ou null.
 */
export function calcularBadgeAtraso(item, dbValue, context) {
  const cfg = statusConfig(dbValue, context);
  if (!cfg || !cfg.rules.permiteAtraso) return null;
  const dataLimite = context === 'investimento' ? item?.data_alvo : item?.data_vencimento;
  if (!isVencida(dataLimite)) return null;
  return STATUS_BY_CONTEXT[context].badgeAtraso;
}

/**
 * Devolve a ordem do status (pra ordenar blocos/listagem).
 * Mais novo no fluxo primeiro: sem definição → em curso → terminado.
 */
export function statusOrder(dbValue, context) {
  const id = statusIdFromDb(dbValue, context);
  return id ? STATUS_IDS.indexOf(id) : 999;
}

/**
 * Renderiza <option>s pra um select, ordenadas pela ordem semântica.
 * Marca como selecionado o `selectedDbValue`.
 */
export function renderStatusOptions(context, selectedDbValue = null) {
  const ctx = STATUS_BY_CONTEXT[context];
  if (!ctx) return '';
  return STATUS_IDS.map((id) => {
    const { dbValue, label } = ctx[id];
    const sel = dbValue === selectedDbValue ? ' selected' : '';
    return `<option value="${dbValue}"${sel}>${label}</option>`;
  }).join('');
}
