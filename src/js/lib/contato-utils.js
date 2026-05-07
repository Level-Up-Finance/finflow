// Utilitários de contatos: normalização e busca por similaridade.
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

