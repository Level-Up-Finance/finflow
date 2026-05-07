#!/usr/bin/env node
// =============================================================
// FinFlow — Extrator de strings i18n
// =============================================================
// Faz parse de todos os arquivos .js e .html em src/ + raiz e
// extrai strings marcadas para tradução:
//
// JS:
//   t('chave', 'texto pt-BR')
//
// HTML:
//   <tag data-i18n-key="chave">Texto pt-BR</tag>
//   <input data-i18n-placeholder="chave" placeholder="…">
//   <button data-i18n-title="chave" title="…">
//   <button data-i18n-aria-label="chave" aria-label="…">
//
// Saída: extracted-strings.json no diretório atual (raiz do projeto).
// =============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

// Diretórios e arquivos a varrer
const SCAN_DIRS  = ['src/js'];
const HTML_GLOB  = /\.html$/;
const JS_GLOB    = /\.js$/;
const SKIP_DIRS  = new Set(['node_modules', '.git', 'dist', 'build', '.supabase']);

// ── Helpers de IO ──────────────────────────────────────────────
function listFiles(rootDir, predicate, files = []) {
  if (!fs.existsSync(rootDir)) return files;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) listFiles(full, predicate, files);
    else if (predicate(entry.name)) files.push(full);
  }
  return files;
}

function listHtmlAtRoot(rootDir) {
  const files = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isFile() && HTML_GLOB.test(entry.name)) {
      files.push(path.join(rootDir, entry.name));
    }
  }
  return files;
}

// ── JS: t('chave', 'texto') ────────────────────────────────────
// Aceita aspas simples, duplas e backticks. Suporta escapes simples.
const JS_PATTERN = /\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1\s*,\s*(['"`])((?:\\.|(?!\3).)*)\3/g;

// ── HTML: data-i18n-* ──────────────────────────────────────────
const HTML_KEY_PATTERN         = /data-i18n-key\s*=\s*"([^"]+)"\s*[^>]*>([^<]*)/g;
const HTML_PLACEHOLDER_PATTERN = /data-i18n-placeholder\s*=\s*"([^"]+)"[^>]*\splaceholder\s*=\s*"([^"]*)"/g;
const HTML_PLACEHOLDER_REV     = /placeholder\s*=\s*"([^"]*)"[^>]*\sdata-i18n-placeholder\s*=\s*"([^"]+)"/g;
const HTML_TITLE_PATTERN       = /data-i18n-title\s*=\s*"([^"]+)"[^>]*\stitle\s*=\s*"([^"]*)"/g;
const HTML_TITLE_REV           = /title\s*=\s*"([^"]*)"[^>]*\sdata-i18n-title\s*=\s*"([^"]+)"/g;
const HTML_ARIA_PATTERN        = /data-i18n-aria-label\s*=\s*"([^"]+)"[^>]*\saria-label\s*=\s*"([^"]*)"/g;
const HTML_ARIA_REV            = /aria-label\s*=\s*"([^"]*)"[^>]*\sdata-i18n-aria-label\s*=\s*"([^"]+)"/g;

function unescapeJs(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\`/g, '`')
    .replace(/\\\\/g, '\\');
}

const found = new Map(); // chave -> { ptbr, files: Set<string>, kind: 'js'|'html' }

function record(chave, ptbr, file, kind) {
  if (!chave || !ptbr) return;
  const cleaned = ptbr.trim();
  if (!cleaned) return;
  const rel = path.relative(ROOT, file);
  if (!found.has(chave)) found.set(chave, { ptbr: cleaned, files: new Set(), kinds: new Set() });
  found.get(chave).files.add(rel);
  found.get(chave).kinds.add(kind);
  // Se chaves repetidas têm valores diferentes, logamos warning
  if (found.get(chave).ptbr !== cleaned) {
    console.warn(`[i18n] AVISO: chave "${chave}" tem valores diferentes:`);
    console.warn(`        existente: ${JSON.stringify(found.get(chave).ptbr)}`);
    console.warn(`        em ${rel}: ${JSON.stringify(cleaned)}`);
  }
}

// ── Scan JS ────────────────────────────────────────────────────
let totalJs = 0;
for (const dir of SCAN_DIRS) {
  for (const file of listFiles(path.join(ROOT, dir), (n) => JS_GLOB.test(n))) {
    totalJs++;
    const src = fs.readFileSync(file, 'utf8');
    let m;
    JS_PATTERN.lastIndex = 0;
    while ((m = JS_PATTERN.exec(src))) {
      record(m[2], unescapeJs(m[4]), file, 'js');
    }
  }
}

// ── Scan HTML (raiz do projeto) ────────────────────────────────
let totalHtml = 0;
for (const file of listHtmlAtRoot(ROOT)) {
  totalHtml++;
  const src = fs.readFileSync(file, 'utf8');
  let m;
  HTML_KEY_PATTERN.lastIndex = 0;
  while ((m = HTML_KEY_PATTERN.exec(src))) {
    record(m[1], m[2], file, 'html');
  }
  for (const re of [HTML_PLACEHOLDER_PATTERN, HTML_TITLE_PATTERN, HTML_ARIA_PATTERN]) {
    re.lastIndex = 0;
    while ((m = re.exec(src))) record(m[1], m[2], file, 'html');
  }
  for (const re of [HTML_PLACEHOLDER_REV, HTML_TITLE_REV, HTML_ARIA_REV]) {
    re.lastIndex = 0;
    while ((m = re.exec(src))) record(m[2], m[1], file, 'html');
  }
}

// ── Output ─────────────────────────────────────────────────────
const out = [];
for (const [chave, { ptbr, files, kinds }] of [...found.entries()].sort()) {
  const pagina = chave.split('.')[0] || 'global';
  out.push({
    chave,
    pt_br: ptbr,
    pagina,
    fontes: [...files].sort(),
    kinds: [...kinds],
  });
}

const outPath = path.join(ROOT, 'extracted-strings.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

console.log(`Arquivos JS varridos:    ${totalJs}`);
console.log(`Arquivos HTML varridos:  ${totalHtml}`);
console.log(`Strings únicas extraídas: ${out.length}`);
console.log(`→ ${path.relative(ROOT, outPath)}`);
