#!/usr/bin/env python3
"""
Converte arquivo Markdown em HTML auto-contido (CSS embutido).
Uso: python3 scripts/md-to-html.py <input.md> <output.html> [titulo]

Estilizado pra documentos longos, legível em mobile e desktop.
"""

import sys
import re
from pathlib import Path
import markdown


CSS = """
:root {
  --color-text: #1a1a1a;
  --color-text-muted: #6b7280;
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-border: #e5e7eb;
  --color-accent: #2563eb;
  --color-success: #059669;
  --color-warning: #d97706;
  --color-danger: #dc2626;
  --color-code-bg: #f3f4f6;
  --max-width: 780px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-text: #e5e7eb;
    --color-text-muted: #9ca3af;
    --color-bg: #111827;
    --color-surface: #1f2937;
    --color-border: #374151;
    --color-accent: #60a5fa;
    --color-code-bg: #1f2937;
  }
}

* { box-sizing: border-box; }

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.65;
  color: var(--color-text);
  background: var(--color-bg);
  margin: 0;
  padding: 0;
}

.container {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 3rem 1.5rem 6rem;
  background: var(--color-surface);
  min-height: 100vh;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

@media (min-width: 1024px) {
  .container {
    margin: 2rem auto;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    min-height: auto;
  }
}

h1, h2, h3, h4, h5, h6 {
  font-weight: 700;
  line-height: 1.25;
  margin: 2.5rem 0 1rem;
  letter-spacing: -0.01em;
}

h1 {
  font-size: 2.25rem;
  margin-top: 0;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 0.75rem;
}

h2 {
  font-size: 1.625rem;
  margin-top: 3rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.5rem;
}

h3 {
  font-size: 1.25rem;
  color: var(--color-accent);
}

h4 {
  font-size: 1.05rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

p {
  margin: 0 0 1rem;
}

a {
  color: var(--color-accent);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s;
}
a:hover { border-bottom-color: var(--color-accent); }

strong {
  font-weight: 700;
  color: var(--color-text);
}

em {
  font-style: italic;
}

code {
  font-family: "SF Mono", Monaco, Menlo, Consolas, monospace;
  font-size: 0.875em;
  background: var(--color-code-bg);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  color: var(--color-danger);
}

pre {
  background: var(--color-code-bg);
  padding: 1rem 1.25rem;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1rem 0;
  border: 1px solid var(--color-border);
}

pre code {
  background: none;
  padding: 0;
  color: var(--color-text);
  font-size: 0.875rem;
  line-height: 1.5;
}

blockquote {
  border-left: 4px solid var(--color-accent);
  padding: 0.5rem 0 0.5rem 1.25rem;
  margin: 1.5rem 0;
  color: var(--color-text-muted);
  background: var(--color-code-bg);
  border-radius: 0 6px 6px 0;
}

blockquote p:last-child { margin-bottom: 0; }

ul, ol {
  margin: 0 0 1rem;
  padding-left: 1.5rem;
}

li {
  margin: 0.4rem 0;
}

li > ul, li > ol {
  margin-top: 0.4rem;
  margin-bottom: 0.4rem;
}

hr {
  border: 0;
  border-top: 1px solid var(--color-border);
  margin: 2.5rem 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.25rem 0;
  font-size: 0.95rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  display: block;
  overflow-x: auto;
  white-space: normal;
}

thead {
  background: var(--color-code-bg);
}

th, td {
  text-align: left;
  padding: 0.7rem 0.95rem;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}

th {
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

tbody tr:last-child td { border-bottom: none; }

tbody tr:hover {
  background: var(--color-code-bg);
}

/* Table of Contents (auto-gerado) */
.toc {
  background: var(--color-code-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  margin: 2rem 0;
}

.toc-title {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin: 0 0 0.5rem;
  font-weight: 700;
}

.toc ol {
  margin: 0;
  padding-left: 1.25rem;
}

.toc a {
  border-bottom: none;
}

.toc a:hover {
  border-bottom-color: var(--color-accent);
}

/* Print */
@media print {
  body { background: white; color: black; }
  .container { box-shadow: none; max-width: none; padding: 0; }
  a { color: inherit; border: none; }
  pre, blockquote, table { page-break-inside: avoid; }
}

/* Header com info */
.meta-bar {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin-bottom: 2rem;
  padding: 0.75rem 1rem;
  background: var(--color-code-bg);
  border-radius: 6px;
}
"""


def slugify(text):
    """Converte texto em slug pra usar como id de heading."""
    text = re.sub(r'[^\w\s-]', '', text.lower())
    text = re.sub(r'[-\s]+', '-', text).strip('-')
    return text


def extract_toc(html):
    """Extrai os h2 do HTML e gera um sumário."""
    h2_pattern = re.compile(r'<h2[^>]*>(.*?)</h2>', re.DOTALL)
    items = []
    for match in h2_pattern.finditer(html):
        text_with_tags = match.group(1)
        # Remove tags HTML internas pra pegar só o texto
        text = re.sub(r'<[^>]+>', '', text_with_tags).strip()
        slug = slugify(text)
        items.append((text, slug))
    if not items:
        return ''
    items_html = ''.join(f'<li><a href="#{slug}">{text}</a></li>' for text, slug in items)
    return f'<nav class="toc"><div class="toc-title">Conteúdo</div><ol>{items_html}</ol></nav>'


def add_heading_ids(html):
    """Adiciona id aos headings pra permitir links âncora."""
    def replacer(match):
        tag = match.group(1)
        attrs = match.group(2) or ''
        text = match.group(3)
        clean_text = re.sub(r'<[^>]+>', '', text).strip()
        slug = slugify(clean_text)
        if 'id=' in attrs:
            return match.group(0)
        return f'<{tag}{attrs} id="{slug}">{text}</{tag}>'
    return re.sub(r'<(h[1-6])([^>]*)>(.*?)</\1>', replacer, html, flags=re.DOTALL)


def convert(input_path, output_path, title=None):
    md_text = Path(input_path).read_text(encoding='utf-8')

    md = markdown.Markdown(extensions=['extra', 'sane_lists', 'smarty', 'tables', 'toc'])
    html_body = md.convert(md_text)
    html_body = add_heading_ids(html_body)

    toc_html = extract_toc(html_body)

    # Tenta extrair título do primeiro h1, senão usa nome do arquivo
    if not title:
        h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', html_body, re.DOTALL)
        if h1_match:
            title = re.sub(r'<[^>]+>', '', h1_match.group(1)).strip()
        else:
            title = Path(input_path).stem

    # Remove o primeiro h1 do corpo (vamos colocar como título da página)
    html_body_no_h1 = re.sub(r'<h1[^>]*>.*?</h1>', '', html_body, count=1, flags=re.DOTALL)

    html_doc = f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>{CSS}</style>
</head>
<body>
<div class="container">
<h1>{title}</h1>
<div class="meta-bar">Gerado a partir de <code>{Path(input_path).name}</code></div>
{toc_html}
{html_body_no_h1}
</div>
</body>
</html>
'''

    Path(output_path).write_text(html_doc, encoding='utf-8')
    print(f'✓ HTML gerado: {output_path}')
    print(f'  Tamanho: {len(html_doc):,} bytes')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Uso: python3 scripts/md-to-html.py <input.md> <output.html> [titulo]')
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
