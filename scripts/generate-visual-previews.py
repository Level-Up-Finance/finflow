#!/usr/bin/env python3
"""
Gera previews HTML de combinações Paleta + Tipografia
pra exploração de identidade visual do FinFlow.

Cada paleta é um dict de tokens CSS. Tipo é fixo (Manrope + Inter,
pode ser parametrizado também se necessário).

Uso:
    python3 scripts/generate-visual-previews.py
    # Gera N arquivos em docs/visual-preview-<id>.html
"""

from pathlib import Path

# ============================================================
# PALETAS
# ============================================================

PALETAS = {
    'a-roxo-tech': {
        'nome': 'Roxo Tech (Atual)',
        'mood': 'Moderno premium, geek-friendly · Notion, Linear, Vercel',
        'tokens': {
            'primary': '#6D5EF5',
            'primary-dark': '#4B3FD6',
            'primary-light': '#8B7FF7',
            'primary-50': '#F1EFFE',
            'primary-100': '#E5E1FD',
            'secondary': '#3B82F6',
            'secondary-dark': '#2563EB',
            'text-main': '#1F2937',
            'text-secondary': '#6B7280',
            'text-muted': '#9CA3AF',
            'border': '#E5E7EB',
            'background': '#F8FAFC',
            'surface': '#FFFFFF',
            'sidebar-bg': '#1F2937',
            'sidebar-text': '#D1D5DB',
            'success': '#065F46',
            'success-bg': '#D1FAE5',
            'warning': '#92400E',
            'warning-bg': '#FEF3C7',
            'danger': '#991B1B',
            'danger-bg': '#FEE2E2',
            'cartao': '#5B21B6',
            'cartao-bg': '#EDE9FE',
            'gradient-hero': 'linear-gradient(135deg, #6D5EF5 0%, #4B3FD6 50%, #3B82F6 100%)',
            'shadow-card': '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(109,94,245,0.06)',
            'focus-ring': 'rgba(109,94,245,0.15)',
        },
    },
    'b-verde-salvia': {
        'nome': 'Verde Sálvia + Areia',
        'mood': 'Calmo, slow money, sustentável · Wise, Monarch, Lunch Money',
        'tokens': {
            'primary': '#2D6A4F',
            'primary-dark': '#1B4332',
            'primary-light': '#52B788',
            'primary-50': '#F0F7F2',
            'primary-100': '#D8EDDE',
            'secondary': '#C8AC85',
            'secondary-dark': '#A88859',
            'text-main': '#1A2E1F',
            'text-secondary': '#56685A',
            'text-muted': '#95A299',
            'border': '#E7E2D8',
            'background': '#FAF8F5',
            'surface': '#FFFFFF',
            'sidebar-bg': '#1B4332',
            'sidebar-text': '#B7D5C4',
            'success': '#14532D',
            'success-bg': '#D1FAE5',
            'warning': '#854D0E',
            'warning-bg': '#FEF3C7',
            'danger': '#7F1D1D',
            'danger-bg': '#FEE2E2',
            'cartao': '#5B21B6',
            'cartao-bg': '#EDE9FE',
            'gradient-hero': 'linear-gradient(135deg, #1B4332 0%, #2D6A4F 50%, #C8AC85 100%)',
            'shadow-card': '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(45,106,79,0.08)',
            'focus-ring': 'rgba(45,106,79,0.15)',
        },
    },
    'd-bold-lime': {
        'nome': 'Bold Preto + Lime',
        'mood': 'Contemporâneo, ousado, statement · Cash App, Robinhood',
        'tokens': {
            'primary': '#0A0A0A',
            'primary-dark': '#000000',
            'primary-light': '#404040',
            'primary-50': '#FAFAFA',
            'primary-100': '#F0F0F0',
            'secondary': '#C2F542',
            'secondary-dark': '#A3D331',
            'text-main': '#0A0A0A',
            'text-secondary': '#525252',
            'text-muted': '#A3A3A3',
            'border': '#E5E5E5',
            'background': '#FAFAFA',
            'surface': '#FFFFFF',
            'sidebar-bg': '#000000',
            'sidebar-text': '#A3A3A3',
            'success': '#166534',
            'success-bg': '#DCFCE7',
            'warning': '#854D0E',
            'warning-bg': '#FEF9C3',
            'danger': '#991B1B',
            'danger-bg': '#FEE2E2',
            'cartao': '#5B21B6',
            'cartao-bg': '#EDE9FE',
            'gradient-hero': 'linear-gradient(135deg, #000000 0%, #1A1A1A 50%, #C2F542 100%)',
            'shadow-card': '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.08)',
            'focus-ring': 'rgba(0,0,0,0.15)',
        },
    },
    'ad-roxo-lime': {
        'nome': 'Roxo Tech + Lime (Mix A + D)',
        'mood': 'Tech moderno com statement pop · roxo do Notion + lime do Cash App',
        'tokens': {
            'primary': '#6D5EF5',
            'primary-dark': '#4B3FD6',
            'primary-light': '#8B7FF7',
            'primary-50': '#F1EFFE',
            'primary-100': '#E5E1FD',
            'secondary': '#C2F542',
            'secondary-dark': '#A3D331',
            'text-main': '#0F172A',
            'text-secondary': '#525252',
            'text-muted': '#A3A3A3',
            'border': '#E5E7EB',
            'background': '#FAFAFA',
            'surface': '#FFFFFF',
            'sidebar-bg': '#0A0A0A',
            'sidebar-text': '#A3A3A3',
            'success': '#047857',
            'success-bg': '#D1FAE5',
            'warning': '#B45309',
            'warning-bg': '#FEF3C7',
            'danger': '#991B1B',
            'danger-bg': '#FEE2E2',
            'cartao': '#5B21B6',
            'cartao-bg': '#EDE9FE',
            'gradient-hero': 'linear-gradient(135deg, #6D5EF5 0%, #4B3FD6 40%, #0A0A0A 70%, #C2F542 100%)',
            'shadow-card': '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(109,94,245,0.08)',
            'focus-ring': 'rgba(109,94,245,0.15)',
        },
    },
    'e-indigo-salmao': {
        'nome': 'Indigo + Salmão (Warm Pro)',
        'mood': 'Amigável-profissional, warm · Stripe, Plaid, Affirm',
        'tokens': {
            'primary': '#4F46E5',
            'primary-dark': '#3730A3',
            'primary-light': '#818CF8',
            'primary-50': '#EEF2FF',
            'primary-100': '#E0E7FF',
            'secondary': '#FB7185',
            'secondary-dark': '#E11D48',
            'text-main': '#1E1B4B',
            'text-secondary': '#4B5563',
            'text-muted': '#9CA3AF',
            'border': '#E5E5F0',
            'background': '#FAFAFE',
            'surface': '#FFFFFF',
            'sidebar-bg': '#1E1B4B',
            'sidebar-text': '#C7D2FE',
            'success': '#047857',
            'success-bg': '#D1FAE5',
            'warning': '#B45309',
            'warning-bg': '#FEF3C7',
            'danger': '#991B1B',
            'danger-bg': '#FEE2E2',
            'cartao': '#5B21B6',
            'cartao-bg': '#EDE9FE',
            'gradient-hero': 'linear-gradient(135deg, #3730A3 0%, #4F46E5 50%, #FB7185 100%)',
            'shadow-card': '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(79,70,229,0.08)',
            'focus-ring': 'rgba(79,70,229,0.15)',
        },
    },
}


# ============================================================
# TEMPLATE HTML
# ============================================================

TEMPLATE = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{nome} — FinFlow Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {{
  --color-primary: {primary};
  --color-primary-dark: {primary_dark};
  --color-primary-light: {primary_light};
  --color-primary-50: {primary_50};
  --color-primary-100: {primary_100};
  --color-secondary: {secondary};
  --color-secondary-dark: {secondary_dark};
  --color-text-main: {text_main};
  --color-text-secondary: {text_secondary};
  --color-text-muted: {text_muted};
  --color-border: {border};
  --color-background: {background};
  --color-surface: {surface};
  --color-sidebar-bg: {sidebar_bg};
  --color-sidebar-text: {sidebar_text};
  --color-success: {success};
  --color-success-bg: {success_bg};
  --color-warning: {warning};
  --color-warning-bg: {warning_bg};
  --color-danger: {danger};
  --color-danger-bg: {danger_bg};
  --color-cartao: {cartao};
  --color-cartao-bg: {cartao_bg};
  --gradient-hero: {gradient_hero};
  --shadow-card: {shadow_card};
  --focus-ring: {focus_ring};

  --font-display: 'Manrope', sans-serif;
  --font-body: 'Inter', sans-serif;
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
  font-family: var(--font-body);
  background: var(--color-background);
  color: var(--color-text-main);
  line-height: 1.5;
  padding: 2rem 1rem;
  min-height: 100vh;
}}
.wrapper {{ max-width: 1200px; margin: 0 auto; }}
.tabular {{ font-variant-numeric: tabular-nums; font-family: 'Geist Mono', monospace; }}
h1, h2, h3 {{ font-family: var(--font-display); font-weight: 700; letter-spacing: -0.02em; }}

.intro {{
  background: var(--color-surface);
  border-radius: 20px;
  padding: 2rem;
  margin-bottom: 2rem;
  border: 1px solid var(--color-border);
}}
.intro h1 {{ font-size: 1.75rem; margin-bottom: 0.5rem; }}
.intro .meta {{ color: var(--color-text-secondary); font-size: 0.95rem; }}
.intro .meta strong {{ color: var(--color-text-main); }}
.intro .pill {{
  display: inline-block;
  background: var(--color-primary-50);
  color: var(--color-primary-dark);
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 0.75rem;
}}

.grid {{
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 1.5rem;
}}
@media (max-width: 800px) {{ .grid {{ grid-template-columns: 1fr; }} }}

.sidebar {{
  background: var(--color-sidebar-bg);
  border-radius: 16px;
  padding: 1.25rem 0.75rem;
  height: fit-content;
}}
.sidebar-logo {{
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.25rem;
  color: white;
  padding: 0.5rem 0.75rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}}
.sidebar-logo-mark {{
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--gradient-hero);
}}
.sidebar-item {{
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  color: var(--color-sidebar-text);
  border-radius: 8px;
  font-size: 0.9rem;
  margin-bottom: 0.15rem;
  cursor: pointer;
}}
.sidebar-item.active {{
  background: var(--color-primary);
  color: white;
}}
.sidebar-item.active.bold-secondary {{ color: var(--color-secondary); }}

.main {{ display: flex; flex-direction: column; gap: 1.5rem; }}

.topbar {{
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}}
.topbar h2 {{ font-size: 1.5rem; }}

.btn-primary {{
  background: var(--color-primary);
  color: white;
  padding: 0.6rem 1.2rem;
  border-radius: 10px;
  border: none;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  font-family: var(--font-body);
}}
.btn-primary:hover {{ background: var(--color-primary-dark); }}
.btn-secondary {{
  background: var(--color-secondary);
  color: var(--color-text-main);
  padding: 0.6rem 1.2rem;
  border-radius: 10px;
  border: none;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  font-family: var(--font-body);
}}
.btn-secondary:hover {{ background: var(--color-secondary-dark); color: white; }}
.btn-ghost {{
  background: transparent;
  color: var(--color-text-main);
  padding: 0.6rem 1.2rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  font-weight: 500;
  font-size: 0.9rem;
  cursor: pointer;
  font-family: var(--font-body);
}}

.kpi-row {{
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}}
@media (max-width: 700px) {{ .kpi-row {{ grid-template-columns: 1fr; }} }}

.kpi {{
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: var(--shadow-card);
}}
.kpi-label {{
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
  font-weight: 600;
  margin-bottom: 0.5rem;
}}
.kpi-value {{
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}}
.kpi-trend {{
  font-size: 0.85rem;
  margin-top: 0.25rem;
  font-weight: 500;
}}
.kpi-trend.up {{ color: var(--color-success); }}
.kpi-trend.down {{ color: var(--color-danger); }}

.card {{
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: var(--shadow-card);
}}
.card-title {{
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: 1rem;
}}

.table {{ width: 100%; }}
.row {{
  display: grid;
  grid-template-columns: 32px 1fr auto auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--color-border);
}}
.row:last-child {{ border-bottom: none; }}
.row-avatar {{
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
}}
.row-avatar.itau {{ background: #EC7000; }}
.row-avatar.nu {{ background: #8A05BE; }}
.row-info strong {{
  display: block;
  font-size: 0.95rem;
  font-weight: 600;
}}
.row-info span {{
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}}
.row-value {{
  font-variant-numeric: tabular-nums;
  font-family: 'Geist Mono', monospace;
  font-weight: 600;
}}
.badge {{
  display: inline-block;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}}
.badge.pago {{ background: var(--color-success-bg); color: var(--color-success); }}
.badge.agendado {{ background: var(--color-warning-bg); color: var(--color-warning); }}
.badge.atrasado {{ background: var(--color-danger-bg); color: var(--color-danger); }}
.badge.cartao {{ background: var(--color-cartao-bg); color: var(--color-cartao); }}

.cta-hero {{
  background: var(--gradient-hero);
  border-radius: 16px;
  padding: 2rem;
  color: white;
  text-align: center;
}}
.cta-hero h2 {{ color: white; font-size: 1.75rem; margin-bottom: 0.5rem; }}
.cta-hero p {{ color: rgba(255,255,255,0.85); margin-bottom: 1rem; }}
.cta-hero button {{
  background: white;
  color: var(--color-text-main);
  padding: 0.75rem 1.5rem;
  border-radius: 10px;
  border: none;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
}}

.form-row {{
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 1rem;
}}
.form-row label {{
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}}
.form-row input,
.form-row select {{
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  font-family: var(--font-body);
  font-size: 0.95rem;
  outline: none;
  background: var(--color-surface);
  color: var(--color-text-main);
}}
.form-row input:focus,
.form-row select:focus {{
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--focus-ring);
}}

.swatches-strip {{
  display: flex;
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  margin-top: 1rem;
  height: 40px;
}}
.swatches-strip .sw {{
  flex: 1;
  position: relative;
}}
.swatches-strip .sw::after {{
  content: attr(data-name);
  position: absolute;
  bottom: 3px;
  left: 6px;
  font-family: 'Geist Mono', monospace;
  font-size: 0.65rem;
  color: var(--label-color, white);
  opacity: 0.85;
  font-weight: 500;
}}

.footer {{
  margin-top: 3rem;
  padding: 1.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}}
.footer code {{
  background: var(--color-primary-50);
  color: var(--color-primary-dark);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.85rem;
}}
</style>
</head>
<body>
<div class="wrapper">

  <div class="intro">
    <span class="pill">Paleta {paleta_id} + Tipo A</span>
    <h1>FinFlow — {nome}</h1>
    <p class="meta"><strong>Mood:</strong> {mood} · <strong>Tipografia:</strong> Manrope + Inter</p>
    <div class="swatches-strip">
      <div class="sw" style="background: {primary};" data-name="primary"></div>
      <div class="sw" style="background: {secondary}; --label-color: {secondary_label_color};" data-name="secondary"></div>
      <div class="sw" style="background: {sidebar_bg};" data-name="sidebar"></div>
      <div class="sw" style="background: {success};" data-name="success"></div>
      <div class="sw" style="background: {warning};" data-name="warning"></div>
      <div class="sw" style="background: {danger};" data-name="danger"></div>
    </div>
  </div>

  <div class="grid">

    <aside class="sidebar">
      <div class="sidebar-logo">
        <span class="sidebar-logo-mark"></span>
        FinFlow
      </div>
      <div class="sidebar-item">Dashboard</div>
      <div class="sidebar-item active">Pagamentos</div>
      <div class="sidebar-item">Contas</div>
      <div class="sidebar-item">Compromissos</div>
      <div class="sidebar-item">Transações</div>
      <div class="sidebar-item">Dívidas</div>
      <div class="sidebar-item">Investimentos</div>
      <div class="sidebar-item">Relatórios</div>
    </aside>

    <div class="main">

      <div class="topbar">
        <h2>Pagamentos · Maio/2026</h2>
        <button class="btn-primary">+ Novo compromisso</button>
      </div>

      <div class="kpi-row">
        <div class="kpi">
          <div class="kpi-label">Saldo total</div>
          <div class="kpi-value">R$ 28.450,12</div>
          <div class="kpi-trend up">↑ R$ 1.240 vs mês passado</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">A pagar este mês</div>
          <div class="kpi-value">R$ 7.850,00</div>
          <div class="kpi-trend">12 compromissos</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Patrimônio</div>
          <div class="kpi-value">R$ 142.300,50</div>
          <div class="kpi-trend up">↑ 2,4% no mês</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Próximos pagamentos</div>
        <div class="table">
          <div class="row">
            <div class="row-avatar itau">I</div>
            <div class="row-info">
              <strong>Aluguel</strong>
              <span>Custo de Vida · vence 05/05</span>
            </div>
            <span class="badge pago">Pago</span>
            <span class="row-value">R$ 2.500,00</span>
          </div>
          <div class="row">
            <div class="row-avatar nu">N</div>
            <div class="row-info">
              <strong>Luz</strong>
              <span>Custo de Vida · vence 15/05</span>
            </div>
            <span class="badge agendado">Agendado</span>
            <span class="row-value">R$ 380,45</span>
          </div>
          <div class="row">
            <div class="row-avatar">B</div>
            <div class="row-info">
              <strong>Mercado da semana</strong>
              <span>Alimentação · vence 18/05</span>
            </div>
            <span class="badge atrasado">Atrasado 2d</span>
            <span class="row-value">R$ 620,00</span>
          </div>
          <div class="row">
            <div class="row-avatar itau">I</div>
            <div class="row-info">
              <strong>Internet</strong>
              <span>Custo de Vida · vence 20/05</span>
            </div>
            <span class="badge cartao">Cartão</span>
            <span class="row-value">R$ 129,90</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Novo compromisso</div>
        <div class="form-row">
          <label>Nome</label>
          <input type="text" placeholder="Ex: Aluguel">
        </div>
        <div class="form-row">
          <label>Conta</label>
          <select>
            <option>Itaú Corrente</option>
            <option>Nubank</option>
            <option>Banco Inter</option>
          </select>
        </div>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
          <button class="btn-primary">Salvar compromisso</button>
          <button class="btn-ghost">Cancelar</button>
        </div>
      </div>

      <div class="cta-hero">
        <h2>Pronto pra organizar de verdade?</h2>
        <p>A gente vê pra onde foi o dinheiro. E pra onde vai.</p>
        <button>Começar agora</button>
      </div>

      <div class="card">
        <div class="card-title">Botões e ações</div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn-primary">Primário</button>
          <button class="btn-secondary">Secundário</button>
          <button class="btn-ghost">Ghost</button>
        </div>
      </div>

    </div>
  </div>

  <div class="footer">
    Preview da paleta <code>{paleta_id}</code> + tipografia Manrope/Inter.<br>
    Gerado por <code>scripts/generate-visual-previews.py</code>.
  </div>

</div>
</body>
</html>
"""


def is_light(hex_color):
    """Detecta se a cor é clara (pra escolher cor do label nos swatches)."""
    hex_color = hex_color.lstrip('#')
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    # YIQ formula
    yiq = (r * 299 + g * 587 + b * 114) / 1000
    return yiq >= 160


def render(paleta_id, paleta_data, output_dir):
    """Gera um arquivo HTML pra uma paleta."""
    t = paleta_data['tokens']
    paleta_letter = paleta_id.split('-')[0].upper()
    secondary_label_color = 'black' if is_light(t['secondary']) else 'white'

    html = TEMPLATE.format(
        nome=paleta_data['nome'],
        mood=paleta_data['mood'],
        paleta_id=paleta_letter,
        primary=t['primary'],
        primary_dark=t['primary-dark'],
        primary_light=t['primary-light'],
        primary_50=t['primary-50'],
        primary_100=t['primary-100'],
        secondary=t['secondary'],
        secondary_dark=t['secondary-dark'],
        text_main=t['text-main'],
        text_secondary=t['text-secondary'],
        text_muted=t['text-muted'],
        border=t['border'],
        background=t['background'],
        surface=t['surface'],
        sidebar_bg=t['sidebar-bg'],
        sidebar_text=t['sidebar-text'],
        success=t['success'],
        success_bg=t['success-bg'],
        warning=t['warning'],
        warning_bg=t['warning-bg'],
        danger=t['danger'],
        danger_bg=t['danger-bg'],
        cartao=t['cartao'],
        cartao_bg=t['cartao-bg'],
        gradient_hero=t['gradient-hero'],
        shadow_card=t['shadow-card'],
        focus_ring=t['focus-ring'],
        secondary_label_color=secondary_label_color,
    )

    output_path = output_dir / f'visual-preview-{paleta_id}.html'
    output_path.write_text(html, encoding='utf-8')
    return output_path


def main():
    project = Path(__file__).resolve().parent.parent
    output_dir = project / 'docs'
    output_dir.mkdir(exist_ok=True)

    generated = []
    for paleta_id, paleta_data in PALETAS.items():
        path = render(paleta_id, paleta_data, output_dir)
        generated.append(path)
        print(f'✓ {path.name}')

    print(f'\n{len(generated)} arquivos gerados em {output_dir}/')
    print('\nPra abrir todos no Safari:')
    files = ' '.join(f'"{p}"' for p in generated)
    print(f'  open -a Safari {files}')


if __name__ == '__main__':
    main()
