#!/usr/bin/env node
// =============================================================
// FinFlow — Gerador de SQL para sincronizar i18n_strings
// =============================================================
// Lê extracted-strings.json (saída do extract-strings.js) e produz
// um arquivo SQL com INSERTs idempotentes que populam ou atualizam
// a tabela i18n_strings.
//
// Uso:
//   node scripts/extract-strings.js
//   node scripts/sync-strings.js
//   → gera supabase/migrations/auto_i18n_sync.sql (ou caminho passado)
//
// Aplique o SQL no Supabase (SQL Editor) ou via CLI da Supabase.
// =============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const inputFile  = path.join(ROOT, 'extracted-strings.json');
if (!fs.existsSync(inputFile)) {
  console.error(`Arquivo não encontrado: ${inputFile}`);
  console.error('Rode antes: node scripts/extract-strings.js');
  process.exit(1);
}

const argOut = process.argv[2];
const outFile = argOut
  ? path.resolve(argOut)
  : path.join(ROOT, 'supabase', 'migrations', `auto_i18n_sync_${stamp()}.sql`);

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// Categoria: heurística baseada na chave
function inferCategoria(chave) {
  if (chave.includes('.toast') || chave.includes('toast.'))   return 'toast';
  if (chave.includes('.modal') || chave.includes('modal.'))   return 'modal';
  if (chave.includes('.erro')  || chave.includes('error') || chave.includes('.fail')) return 'erro';
  if (chave.includes('.btn')   || chave.includes('button'))   return 'ui';
  if (chave.includes('.label') || chave.includes('.field'))   return 'ui';
  if (chave.includes('.placeholder') || chave.includes('.hint')) return 'ui';
  if (chave.includes('.titulo') || chave.includes('title'))   return 'sistema';
  return 'ui';
}

function inferVisibilidade(categoria) {
  return categoria === 'toast' || categoria === 'erro' ? 'notificacao' : 'usuario';
}

// SQL escape para texto pt-BR
function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

const lines = [];
lines.push('-- =============================================================');
lines.push(`-- Auto-gerado por scripts/sync-strings.js em ${new Date().toISOString()}`);
lines.push(`-- ${data.length} strings extraídas`);
lines.push('-- =============================================================');
lines.push('');
lines.push('-- Insere strings novas e atualiza pt_br das existentes (canônico = código).');
lines.push('insert into public.i18n_strings (chave, pagina, categoria, visibilidade, descricao, pt_br) values');

const tuples = data.map((row) => {
  const categoria  = inferCategoria(row.chave);
  const visib      = inferVisibilidade(categoria);
  const descricao  = `Auto-extraído de ${(row.fontes || []).slice(0, 2).join(', ')}`;
  return `  ('${sqlEscape(row.chave)}', '${sqlEscape(row.pagina)}', '${categoria}', '${visib}', '${sqlEscape(descricao)}', '${sqlEscape(row.pt_br)}')`;
});

lines.push(tuples.join(',\n'));
lines.push('on conflict (chave) do update');
lines.push('  set pt_br      = excluded.pt_br,');
lines.push('      pagina     = excluded.pagina,');
lines.push('      categoria  = excluded.categoria,');
lines.push('      updated_at = now();');
lines.push('');

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, lines.join('\n'));

console.log(`Strings: ${data.length}`);
console.log(`SQL gerado: ${path.relative(ROOT, outFile)}`);
console.log('Aplique no Supabase (SQL Editor ou CLI).');
