#!/usr/bin/env python3
"""
Auditoria de microcopy contra docs/BRAND.md.
Lê extracted-strings.json e aplica heurísticas das guidelines.

Saída: docs/AUDIT-MICROCOPY.md com relatório agrupado por severidade e página.
"""

import json
import re
from pathlib import Path
from collections import defaultdict

# ===========================================
# Regras do BRAND.md
# ===========================================

# §2.3 — Vocabulário banido (case-insensitive, palavra inteira)
BANNED_WORDS = {
    'investidor':       'Use "você" — apresentamos pra pessoas comuns, não "investidores".',
    'cliente':          'Somos um app, eles são usuários ou simplesmente "você".',
    'plataforma':       'Use "app" ou "FinFlow".',
    'solução':          'Vendedor demais. Diga o que faz.',
    'empoderar':        'Palavra desgastada de marketing.',
    'empoderamos':      'Palavra desgastada de marketing.',
    'robô':             'Não somos isso. Somos um app determinístico bem projetado.',
    'inteligência artificial': 'Não usamos esse rótulo.',
    'ia ': 'Cuidado: "IA" em copy pode soar marketing. Confirmar contexto.',
    'insights':         'Anglicismo desnecessário. Use "análises", "descobertas" ou contexto específico.',
    'tracking':         'Anglicismo. Use "acompanhamento" ou "rastreamento".',
    'reportar':         'Use "avisar", "comunicar" — "reportar" é anglicismo.',
    'empowerment':      'Anglicismo + clichê de marketing.',
}

# §2.2 — Termos canônicos que provavelmente estão sendo usados errado
CANONICAL_VIOLATIONS = {
    r'\bdespesa fixa\b':            'Use "Compromisso" (BRAND §2.2)',
    r'\bdespesas fixas\b':          'Use "Compromissos" (BRAND §2.2)',
    r'\blançamento recorrente\b':   'Use "Compromisso" (BRAND §2.2)',
    r'\blançamentos recorrentes\b': 'Use "Compromissos" (BRAND §2.2)',
    r'\bmovimentação\b':            'Use "Transação" (BRAND §2.2)',
    r'\bmovimentações\b':           'Use "Transações" (BRAND §2.2)',
    r'\boperação financeira\b':     'Use "Transação" (BRAND §2.2)',
    r'\bpote\b':                    'Use "Caixinha" (BRAND §2.2)',
    r'\benvelope\b(?!.*email)':     'Use "Caixinha" (BRAND §2.2) — exceto se for envelope de email',
    r'\bantecipação\b':             'Use "Adiantamento de receita" (BRAND §2.2)',
    r'\bnet worth\b':               'Use "Patrimônio" em português (BRAND §2.2)',
}

# §6.1 — Frases vazias/ruins
BAD_PHRASES = {
    r'\bops[!,\.]':                 'Frase vazia. Diga o que aconteceu + como resolver. (BRAND §6.1)',
    r'algo deu errado':             'Frase vazia. Substitua por causa específica + próximo passo. (BRAND §6.1)',
    r'sucesso[!\.]':                'Vazio sem contexto. Diga o que foi bem-sucedido. (BRAND §6.1)',
    r'\btem certeza\?':             'Vago. Substitua por consequência específica. (BRAND §6.1)',
    r'deseja prosseguir':           'Use linguagem direta de ação. (BRAND §6.1)',
    r'prezad[oa]':                  'Formal demais. Use "você" ou nada. (BRAND §3 — tone)',
    r'caro\(a\) usuári[oa]':        'Formal demais. (BRAND §3)',
    r'jornada':                     'Clichê de marketing. Diga o que vai acontecer. (BRAND §6.3)',
    r'\boperação realizada':        'Robotizado. Diga o que mudou. (BRAND §3 — tone toast)',
    r'\bops[\!\?\.]':               'Frase vazia. (BRAND §6.1)',
    r'última chance':               'Urgência fabricada — banido (BRAND §1 We Are Not "Calmos")',
    r'faltam? \d+ dias?':           'Pode ser urgência fabricada. Verificar contexto.',
    r'agora ou nunca':              'Urgência fabricada.',
    r'não perca':                   'Urgência fabricada / marketing intenso.',
    r'\bbest-?in-?class\b':         'Anglicismo + clichê.',
    r'mundo dos':                   'Clichê ("entre no mundo dos investimentos").',
}

# Estrutura
MAX_WORDS_PER_PHRASE = 25
EXCLAMATION_LIMIT = 1  # mais que isso já é exagerado


def classify(severity):
    return {'HIGH': '🔴', 'MEDIUM': '🟡', 'LOW': '🟢'}.get(severity, '⚪')


def audit_string(s):
    """Retorna lista de issues encontrados na string."""
    if not s or not isinstance(s, str):
        return []
    issues = []
    lower = s.lower()

    # Vocabulário banido
    for word, reason in BANNED_WORDS.items():
        # Match como palavra inteira ou frase
        if re.search(r'\b' + re.escape(word) + r'\b', lower):
            issues.append(('HIGH', f'Vocab banido: "{word}"', reason))

    # Termos canônicos
    for pattern, reason in CANONICAL_VIOLATIONS.items():
        if re.search(pattern, lower):
            issues.append(('MEDIUM', f'Termo não-canônico (regex: {pattern})', reason))

    # Frases ruins
    for pattern, reason in BAD_PHRASES.items():
        if re.search(pattern, lower):
            issues.append(('MEDIUM', f'Frase problemática', reason))

    # Frase longa
    words = re.split(r'\s+', s.strip())
    if len(words) > MAX_WORDS_PER_PHRASE:
        issues.append(('LOW', f'Frase longa ({len(words)} palavras)',
                       f'Ideal <{MAX_WORDS_PER_PHRASE} palavras. Considere dividir.'))

    # Exclamações
    excl_count = s.count('!')
    if excl_count > EXCLAMATION_LIMIT:
        issues.append(('LOW', f'{excl_count} exclamações',
                       'Excesso. Marketing exagerado tira credibilidade.'))

    # All caps (palavras com 3+ letras todas maiúsculas, excluindo siglas comuns)
    caps_words = re.findall(r'\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{4,}\b', s)
    # Filtrar siglas e termos técnicos comuns
    EXCLUDE = {
        # Siglas BR financeiras / governamentais
        'BRASIL', 'BRASILEIRA', 'CPF', 'CNPJ', 'CEP', 'CDB', 'IBGE', 'IBOV',
        'CDI', 'IPCA', 'IGP', 'CCB', 'ETF', 'FII', 'FIIs',
        # Moedas
        'BRL', 'USD', 'EUR', 'GBP', 'JPY',
        # Formatos de arquivo (sempre maiúsculos por convenção)
        'OFX', 'PDF', 'XLSX', 'XLS', 'CSV', 'JPG', 'PNG', 'WEBP', 'GIF',
        'JSON', 'HTML', 'PPTX', 'DOCX', 'SVG', 'WAV', 'MP3', 'MP4',
        # Constantes técnicas
        'NULL', 'TRUE', 'FALSE',
    }
    caps_words = [w for w in caps_words if w not in EXCLUDE]
    if caps_words:
        issues.append(('LOW', f'ALL CAPS: {", ".join(caps_words)}',
                       'Use bold ou contexto. ALL CAPS soa gritando.'))

    return issues


def main():
    project = Path('/Users/arnaldodlanra/Library/CloudStorage/'
                   'GoogleDrive-arnaldo@leveluponline.org/'
                   'My Drive/Claude/finflow')
    catalog_path = project / 'extracted-strings.json'
    output_path = project / 'docs' / 'AUDIT-MICROCOPY.md'

    strings = json.loads(catalog_path.read_text(encoding='utf-8'))
    print(f'Carregadas {len(strings)} strings do catálogo')

    # Por página + por severidade
    by_page = defaultdict(list)
    by_severity = defaultdict(list)
    total_issues = 0
    pages_with_issues = set()

    for entry in strings:
        text = entry.get('pt_br', '')
        page = entry.get('pagina', 'unknown')
        chave = entry.get('chave', '')
        issues = audit_string(text)
        if issues:
            pages_with_issues.add(page)
            total_issues += len(issues)
            for severity, what, reason in issues:
                rec = {
                    'severity': severity,
                    'what': what,
                    'reason': reason,
                    'text': text,
                    'chave': chave,
                    'page': page,
                }
                by_page[page].append(rec)
                by_severity[severity].append(rec)

    # Resumo
    md = []
    md.append('# Auditoria de Microcopy — FinFlow')
    md.append('')
    md.append('> Gerado automaticamente por `scripts/audit-microcopy.py`')
    md.append(f'> Catálogo analisado: `extracted-strings.json` ({len(strings)} strings)')
    md.append('> Regras aplicadas: `docs/BRAND.md` §2.2, §2.3, §3, §6')
    md.append('')
    md.append('## Resumo executivo')
    md.append('')
    md.append(f'- **Strings totais analisadas**: {len(strings)}')
    md.append(f'- **Issues encontrados**: {total_issues}')
    md.append(f'- **Páginas afetadas**: {len(pages_with_issues)}')
    md.append('')
    md.append('### Por severidade')
    md.append('')
    md.append('| Severidade | Quantidade | O que é |')
    md.append('|------------|-----------|---------|')
    for sev in ['HIGH', 'MEDIUM', 'LOW']:
        count = len(by_severity.get(sev, []))
        label = {'HIGH': '🔴 Alta (vocabulário banido)',
                 'MEDIUM': '🟡 Média (termos não-canônicos, frases ruins)',
                 'LOW': '🟢 Baixa (frases longas, all caps, exclamações)'}[sev]
        md.append(f'| {label} | **{count}** | |')
    md.append('')
    md.append('### Top 10 páginas mais problemáticas')
    md.append('')
    md.append('| Página | Issues |')
    md.append('|--------|--------|')
    sorted_pages = sorted(by_page.items(), key=lambda x: -len(x[1]))
    for page, issues in sorted_pages[:10]:
        md.append(f'| `{page}` | {len(issues)} |')
    md.append('')

    # Detalhamento por severidade
    md.append('---')
    md.append('')
    md.append('## 🔴 Issues HIGH (vocabulário banido)')
    md.append('')
    md.append('Devem ser corrigidos. Violam o `BRAND.md` §2.3 diretamente.')
    md.append('')
    high = by_severity.get('HIGH', [])
    if not high:
        md.append('_Nenhum issue HIGH encontrado._ ✅')
    else:
        for issue in high:
            md.append(f'### `{issue["page"]}` / `{issue["chave"]}`')
            md.append(f'**Texto atual**: > {issue["text"]}')
            md.append('')
            md.append(f'**Problema**: {issue["what"]}')
            md.append('')
            md.append(f'**Por quê**: {issue["reason"]}')
            md.append('')
    md.append('')

    md.append('## 🟡 Issues MEDIUM (termos não-canônicos, frases ruins)')
    md.append('')
    md.append('Recomendado corrigir. Não bloqueia, mas degrada consistência.')
    md.append('')
    medium = by_severity.get('MEDIUM', [])
    if not medium:
        md.append('_Nenhum issue MEDIUM encontrado._ ✅')
    else:
        # Agrupa por página
        by_page_med = defaultdict(list)
        for i in medium:
            by_page_med[i['page']].append(i)
        for page in sorted(by_page_med.keys()):
            md.append(f'### `{page}`')
            md.append('')
            md.append('| Chave | Texto | Problema |')
            md.append('|-------|-------|----------|')
            for issue in by_page_med[page]:
                text_short = (issue["text"][:60] + '…') if len(issue["text"]) > 60 else issue["text"]
                text_short = text_short.replace('|', '\\|').replace('\n', ' ')
                md.append(f'| `{issue["chave"]}` | "{text_short}" | {issue["reason"]} |')
            md.append('')

    md.append('## 🟢 Issues LOW (estrutura: frases longas, exclamações, all caps)')
    md.append('')
    md.append('Baixa prioridade. Refino estilístico.')
    md.append('')
    low = by_severity.get('LOW', [])
    if not low:
        md.append('_Nenhum issue LOW encontrado._ ✅')
    else:
        md.append(f'_{len(low)} issues_ — agrupar e revisar em batch.')
        md.append('')
        # Resumo de tipos
        types = defaultdict(int)
        for i in low:
            if 'Frase longa' in i['what']:
                types['Frases longas (>25 palavras)'] += 1
            elif 'exclamações' in i['what']:
                types['Excesso de exclamações'] += 1
            elif 'ALL CAPS' in i['what']:
                types['ALL CAPS detectado'] += 1
            else:
                types['Outros'] += 1
        md.append('| Tipo | Count |')
        md.append('|------|-------|')
        for t, c in sorted(types.items(), key=lambda x: -x[1]):
            md.append(f'| {t} | {c} |')
        md.append('')

    md.append('---')
    md.append('')
    md.append('## Próximos passos sugeridos')
    md.append('')
    md.append('1. **Corrigir todos os HIGH** — vocabulário banido nunca deveria estar em produção.')
    md.append('2. **Revisar MEDIUM por página** — começar pelas top 5 mais problemáticas (acima).')
    md.append('3. **LOW em batch** — separar uma sessão dedicada de refinamento estilístico.')
    md.append('')
    md.append('Para corrigir uma string específica, encontre a chave em:')
    md.append('- Em HTML: `grep -rn \'data-i18n-key="<chave>"\' .`')
    md.append('- Em JS: `grep -rn "<chave>" src/js/`')
    md.append('')
    md.append('Atualize tanto o fallback no código quanto a tabela `i18n_strings` no Supabase.')
    md.append('')
    md.append('---')
    md.append('')
    md.append('## Limitações desta auditoria')
    md.append('')
    md.append('- ⚠️ Apenas strings em `extracted-strings.json` (catálogo do extract-strings.js). Strings inline não-marcadas em JS escapam.')
    md.append('- ⚠️ Regras são heurísticas: false positives possíveis. Use julgamento humano antes de corrigir.')
    md.append('- ⚠️ Contexto não é analisado: "ops" em log de erro pode ser técnico/intencional.')
    md.append('- ⚠️ Tom de voz subjetivo não é avaliado (só padrões objetivos).')

    output_path.write_text('\n'.join(md), encoding='utf-8')
    print(f'✓ Relatório gerado: {output_path}')
    print(f'  Total issues: {total_issues}')
    print(f'  HIGH: {len(by_severity.get("HIGH", []))}')
    print(f'  MEDIUM: {len(by_severity.get("MEDIUM", []))}')
    print(f'  LOW: {len(by_severity.get("LOW", []))}')


if __name__ == '__main__':
    main()
