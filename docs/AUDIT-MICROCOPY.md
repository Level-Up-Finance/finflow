# Auditoria de Microcopy — FinFlow

> Gerado automaticamente por `scripts/audit-microcopy.py`
> Catálogo analisado: `extracted-strings.json` (339 strings)
> Regras aplicadas: `docs/BRAND.md` §2.2, §2.3, §3, §6

## Resumo executivo

- **Strings totais analisadas**: 339
- **Issues encontrados**: 1
- **Páginas afetadas**: 1

### Por severidade

| Severidade | Quantidade | O que é |
|------------|-----------|---------|
| 🔴 Alta (vocabulário banido) | **0** | |
| 🟡 Média (termos não-canônicos, frases ruins) | **0** | |
| 🟢 Baixa (frases longas, all caps, exclamações) | **1** | |

### Top 10 páginas mais problemáticas

| Página | Issues |
|--------|--------|
| `tutorial` | 1 |

---

## 🔴 Issues HIGH (vocabulário banido)

Devem ser corrigidos. Violam o `BRAND.md` §2.3 diretamente.

_Nenhum issue HIGH encontrado._ ✅

## 🟡 Issues MEDIUM (termos não-canônicos, frases ruins)

Recomendado corrigir. Não bloqueia, mas degrada consistência.

_Nenhum issue MEDIUM encontrado._ ✅
## 🟢 Issues LOW (estrutura: frases longas, exclamações, all caps)

Baixa prioridade. Refino estilístico.

_1 issues_ — agrupar e revisar em batch.

| Tipo | Count |
|------|-------|
| Frases longas (>25 palavras) | 1 |

---

## Próximos passos sugeridos

1. **Corrigir todos os HIGH** — vocabulário banido nunca deveria estar em produção.
2. **Revisar MEDIUM por página** — começar pelas top 5 mais problemáticas (acima).
3. **LOW em batch** — separar uma sessão dedicada de refinamento estilístico.

Para corrigir uma string específica, encontre a chave em:
- Em HTML: `grep -rn 'data-i18n-key="<chave>"' .`
- Em JS: `grep -rn "<chave>" src/js/`

Atualize tanto o fallback no código quanto a tabela `i18n_strings` no Supabase.

---

## Limitações desta auditoria

- ⚠️ Apenas strings em `extracted-strings.json` (catálogo do extract-strings.js). Strings inline não-marcadas em JS escapam.
- ⚠️ Regras são heurísticas: false positives possíveis. Use julgamento humano antes de corrigir.
- ⚠️ Contexto não é analisado: "ops" em log de erro pode ser técnico/intencional.
- ⚠️ Tom de voz subjetivo não é avaliado (só padrões objetivos).