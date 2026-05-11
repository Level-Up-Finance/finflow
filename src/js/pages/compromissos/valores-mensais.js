// =============================================================
// FinFlow — Compromissos: grid de valores mensais (valor_variavel)
// =============================================================
// Para subcategorias / categorias com valor_variavel = true,
// renderiza um grid de N meses com input de valor_previsto.
// Usa orcamento_geral como tabela de persistência.
// =============================================================
import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../components/toast.js';
import { getCurrentUser } from '../../lib/auth.js';
import { parseUserNumber } from '../../lib/utils.js';

/** Próximos N meses como [{year, month, mesAno, label}, ...] */
export function nextNMonths(n = 12) {
  const now = new Date();
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mesAno = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
    out.push({ year: d.getFullYear(), month: d.getMonth(), mesAno, label });
  }
  return out;
}

/**
 * Renderiza grid com 12 meses futuros, pré-preenchendo com valores existentes.
 * `c` (compromisso/subcategoria) ou `catId` — fornece um dos dois.
 */
export async function populateValoresMensaisGrid(c, catId = null) {
  const grid = document.getElementById('valores-mensais-grid');
  const months = nextNMonths(12);

  const existingMap = new Map();
  const lookupId = catId || c?.id;
  if (lookupId) {
    const startMesAno = months[0].mesAno;
    const endMesAno = months[months.length - 1].mesAno;
    const col = catId ? 'categoria_id' : 'subcategoria_id';
    const { data, error } = await supabase
      .from('orcamento_geral')
      .select('mes_ano, valor_previsto')
      .eq(col, lookupId)
      .gte('mes_ano', startMesAno)
      .lte('mes_ano', endMesAno);
    if (!error) {
      for (const row of data || []) {
        existingMap.set(row.mes_ano, Number(row.valor_previsto) || 0);
      }
    }
  }

  grid.innerHTML = months.map((m) => {
    const valor = existingMap.has(m.mesAno) ? existingMap.get(m.mesAno) : '';
    return `
      <div class="valor-mensal-item">
        <span class="valor-mensal-label">${m.label}</span>
        <input type="text" inputmode="decimal" class="valor-mensal-input" data-mes-ano="${m.mesAno}" value="${valor}" placeholder="0,00">
      </div>
    `;
  }).join('');
}

/** Lê os inputs do grid e devolve [{ mes_ano, valor_previsto }, ...]. */
export function collectValoresMensais() {
  const inputs = document.querySelectorAll('.valor-mensal-input');
  const items = [];
  inputs.forEach((inp) => {
    const v = inp.value.trim();
    if (v === '') return;
    const num = parseUserNumber(v);
    if (isNaN(num) || num < 0) return;
    items.push({ mes_ano: inp.dataset.mesAno, valor_previsto: num });
  });
  return items;
}

/** Persiste os valores mensais em orcamento_geral. */
export async function saveValoresMensaisToOrcamento(subcategoriaId, moeda, items, categoriaId = null) {
  if (items.length === 0) return;
  const user = await getCurrentUser();
  if (!user) return;

  if (categoriaId) {
    // Índice parcial não suporta ON CONFLICT — usa DELETE + INSERT
    const mesAnos = items.map((it) => it.mes_ano);
    const { error: delErr } = await supabase
      .from('orcamento_geral')
      .delete()
      .eq('categoria_id', categoriaId)
      .in('mes_ano', mesAnos);
    if (delErr) console.error('[saveValoresMensais delete]', delErr);

    const rows = items.map((it) => ({
      user_id: user.id,
      categoria_id: categoriaId,
      mes_ano: it.mes_ano,
      valor_previsto: it.valor_previsto,
      moeda,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('orcamento_geral').insert(rows);
    if (error) {
      console.error('[saveValoresMensaisToOrcamento cat]', error);
      showToast('Erro ao salvar valores mensais: ' + error.message, 'error', 8000);
    }
    return;
  }

  const rows = items.map((it) => ({
    user_id: user.id,
    subcategoria_id: subcategoriaId,
    mes_ano: it.mes_ano,
    valor_previsto: it.valor_previsto,
    moeda,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('orcamento_geral')
    .upsert(rows, { onConflict: 'user_id,subcategoria_id,mes_ano' });

  if (error) {
    console.error('[saveValoresMensaisToOrcamento sub]', error);
    showToast('Erro ao salvar valores mensais: ' + error.message, 'error', 8000);
  }
}
