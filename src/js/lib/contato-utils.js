// Utilitários de contatos: normalização, busca por similaridade e criação.
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { showToast } from '../components/toast.js';

export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let prev = i;
    row[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cur = row[j + 1];
      row[j + 1] = a[i] === b[j] ? prev : Math.min(prev + 1, cur + 1, row[j] + 1);
      prev = cur;
    }
  }
  return row[b.length];
}

// Retorna { exact, similar } onde:
//   exact   = contatos cujo nome normalizado é igual a `nome` normalizado
//   similar = contatos com substring de 3+ chars OU Levenshtein <= 2
export function findSimilarContatos(nome, contatos) {
  const q = normalize(nome);
  if (!q) return { exact: [], similar: [] };
  const exact = [];
  const similar = [];
  for (const c of contatos) {
    const cn = normalize(c.nome);
    if (cn === q) {
      exact.push(c);
      continue;
    }
    if (q.length >= 3 && cn.length >= 3 && (cn.includes(q) || q.includes(cn))) {
      similar.push(c);
      continue;
    }
    if (Math.abs(cn.length - q.length) <= 2 && levenshtein(cn, q) <= 2) {
      similar.push(c);
    }
  }
  return { exact, similar };
}

// Insere um contato no Supabase. Retorna o registro criado ou null em erro.
// O caller é responsável por adicionar ao seu cache local.
export async function criarContato(nome, tipo) {
  return criarContatoCompleto({ nome, tipo });
}

// Versão completa: aceita qualquer subset de campos do contato.
export async function criarContatoCompleto(payload) {
  const user = await getCurrentUser();
  if (!user) return null;
  const cleaned = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if (v === undefined) continue;
    cleaned[k] = (typeof v === 'string' ? v.trim() : v) || null;
  }
  if (!cleaned.nome) return null;
  if (!cleaned.tipo) cleaned.tipo = 'fornecedor';
  const { data, error } = await supabase
    .from('contatos')
    .insert({ user_id: user.id, ...cleaned })
    .select()
    .single();
  if (error) {
    let msg = error.message;
    if (/relation.*contatos|column.*contatos/i.test(msg)) {
      msg = 'Tabela contatos não existe — rode a migration 0023 no Supabase.';
    }
    showToast('Erro ao criar contato: ' + msg, 'error', 8000);
    return null;
  }
  showToast(`Contato "${data.nome}" criado`, 'success');
  return data;
}
