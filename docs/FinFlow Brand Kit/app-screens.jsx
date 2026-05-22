// FinFlow App Screens — canvas with 6 artboards across 3 sections.
// Each artboard is 1440 × 900, a desktop app screen.

const { useState } = React;

// ═════════════════════════════════════════════════════════════════════
// Shared bits
// ═════════════════════════════════════════════════════════════════════

const TwinTrackLogo = ({ size = 24, primary = "white", accent = "var(--color-accent-400)" }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <line x1="14" y1="32" x2="86" y2="32" stroke={primary} strokeWidth="12" strokeLinecap="round"/>
    <path d="M14 68 L38 68 L41 50 L59 50 L62 68 L86 68" stroke={accent} strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const Icon = ({ d, sw = 1.8 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

const ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></>,
  payments:  <><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></>,
  accounts:  <><path d="M3 21h18M3 18V8l9-5 9 5v10M9 22V12h6v10"/></>,
  commits:   <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
  trans:     <><path d="M3 6h13l-4 4M21 18H8l4-4"/></>,
  debts:     <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></>,
  invest:    <><path d="M3 3v18h18M7 16l4-4 4 4 6-6"/></>,
  budget:    <><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 4"/></>,
  reports:   <><path d="M3 3v18h18"/><rect x="7" y="13" width="3" height="5"/><rect x="12" y="9" width="3" height="9"/><rect x="17" y="5" width="3" height="13"/></>,
  search:    <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
  bell:      <><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 004 0"/></>,
  filter:    <><path d="M3 6h18M6 12h12M10 18h4"/></>,
  download:  <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></>,
  plus:      <><path d="M12 5v14M5 12h14"/></>,
  check:     <><path d="M5 12l5 5 9-11"/></>,
  warning:   <><path d="M12 9v4M12 17h.01M10.3 3.5L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.5a2 2 0 00-3.4 0z"/></>,
  swap:      <><path d="M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/></>,
  home:      <><path d="M3 12l9-9 9 9M5 10v10h14V10"/></>,
  utensils:  <><path d="M3 2v20M3 11h4l-1-9M21 15V2c-2.8 1-5 4-5 7.5V15c0 1 1 2 2 2h2c1 0 2-1 2-2z"/></>,
  cart:      <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.5L23 6H6"/></>,
};

const Sidebar = ({ active, dark }) => (
  <aside className="scr-sidebar">
    <div className="brand"><TwinTrackLogo size={26} /> FinFlow</div>
    <div className={'nav-item' + (active === 'dashboard' ? ' active' : '')}><Icon d={ICONS.dashboard} /> Dashboard</div>
    <div className={'nav-item' + (active === 'payments' ? ' active' : '')}><Icon d={ICONS.payments} /> Pagamentos</div>
    <div className={'nav-item' + (active === 'accounts' ? ' active' : '')}><Icon d={ICONS.accounts} /> Contas</div>
    <div className={'nav-item' + (active === 'commits' ? ' active' : '')}><Icon d={ICONS.commits} /> Compromissos</div>
    <div className={'nav-item' + (active === 'trans' ? ' active' : '')}><Icon d={ICONS.trans} /> Transações</div>
    <div className="nav-section">Planejamento</div>
    <div className={'nav-item' + (active === 'debts' ? ' active' : '')}><Icon d={ICONS.debts} /> Dívidas</div>
    <div className={'nav-item' + (active === 'invest' ? ' active' : '')}><Icon d={ICONS.invest} /> Investimentos</div>
    <div className={'nav-item' + (active === 'budget' ? ' active' : '')}><Icon d={ICONS.budget} /> Orçamento</div>
    <div className="nav-section">Análise</div>
    <div className={'nav-item' + (active === 'reports' ? ' active' : '')}><Icon d={ICONS.reports} /> Relatórios</div>
    <div className="footer">
      <div className="avatar">A</div>
      <div className="footer-info">
        <strong>Arnaldo C.</strong>
        <span>arnaldo@finflow.app</span>
      </div>
    </div>
  </aside>
);

const Topbar = ({ title, sub, actions }) => (
  <div className="scr-topbar">
    <div>
      <h1>{title}</h1>
      <div className="sub">{sub}</div>
    </div>
    <div className="actions">{actions}</div>
  </div>
);

// Bank avatars (color + initial)
const BankAv = ({ name }) => {
  const bank = {
    Itaú:    { bg: '#EC7000', letter: 'I' },
    Nubank:  { bg: '#8A05BE', letter: 'N' },
    Inter:   { bg: '#FF7A00', letter: 'B' },
    BTG:     { bg: '#003366', letter: 'B' },
    Caixa:   { bg: '#0A4D8C', letter: 'C' },
    Wise:    { bg: '#9FE870', letter: 'W' },
    Binance: { bg: '#F0B90B', letter: 'B' },
  }[name] || { bg: 'var(--color-primary-500)', letter: name?.[0] || '?' };
  return <div className="av" style={{ background: bank.bg }}>{bank.letter}</div>;
};
const BankLogo = ({ name }) => {
  const bank = {
    Itaú:    { bg: '#EC7000', letter: 'itaú' },
    Nubank:  { bg: '#8A05BE', letter: 'Nu' },
    Inter:   { bg: '#FF7A00', letter: 'I' },
    BTG:     { bg: '#003366', letter: 'BTG' },
    Wise:    { bg: '#163300', letter: 'W' },
    Binance: { bg: '#F0B90B', letter: 'B' },
  }[name] || { bg: 'var(--color-primary-500)', letter: name?.[0] || '?' };
  return <div className="acc-logo" style={{ background: bank.bg, fontSize: bank.letter.length > 2 ? 11 : 18 }}>{bank.letter}</div>;
};


// ═════════════════════════════════════════════════════════════════════
// SCREEN 1 — COMPROMISSOS
// ═════════════════════════════════════════════════════════════════════

function ScreenCompromissos() {
  return (
    <div className="scr">
      <Sidebar active="commits" />
      <div className="scr-main">
        <Topbar
          title="Compromissos"
          sub="42 ativos · maio/2026"
          actions={
            <>
              <button className="btn-icon"><Icon d={ICONS.search}/></button>
              <button className="btn-icon"><Icon d={ICONS.filter}/></button>
              <button className="btn btn-ghost">Arquivados</button>
              <button className="btn btn-primary"><Icon d={ICONS.plus}/> Novo compromisso</button>
            </>
          }
        />

        <div className="scr-content">
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="label">Receitas / mês</div>
              <div className="value" style={{color: 'var(--color-success)'}}>+ R$ 12.000</div>
              <div className="trend">3 compromissos</div>
            </div>
            <div className="kpi-card">
              <div className="label">Despesas / mês</div>
              <div className="value" style={{color: 'var(--color-danger)'}}>− R$ 7.850</div>
              <div className="trend">12 compromissos</div>
            </div>
            <div className="kpi-card">
              <div className="label">Sobra projetada</div>
              <div className="value">R$ 4.150</div>
              <div className="trend up">↑ R$ 280 vs abril</div>
            </div>
            <div className="kpi-card accent">
              <div className="label">Caixa Livre</div>
              <div className="value">R$ 28.450</div>
              <div className="trend up">↑ 4,5% no mês</div>
            </div>
          </div>

          {/* Custo de Vida */}
          <div className="cat-card cat-custo">
            <div className="cat-header">
              <div className="left">
                <Icon d={ICONS.home}/>
                <h3>Custo de Vida</h3>
              </div>
              <div className="summary">R$ 3.510,35 / mês · 4 compromissos</div>
            </div>
            <div className="cat-rows">
              <div className="row">
                <BankAv name="Itaú"/>
                <div className="info">
                  <strong>Aluguel</strong>
                  <span>Mensal · dia 05 · Sandra Imóveis</span>
                </div>
                <span className="badge b-pago">Mensal</span>
                <span className="val">R$ 2.500,00</span>
              </div>
              <div className="row">
                <BankAv name="Nubank"/>
                <div className="info">
                  <strong>Luz</strong>
                  <span>Mensal · dia 15 · ENEL</span>
                </div>
                <span className="badge b-pago">Mensal</span>
                <span className="val">R$ 380,45</span>
              </div>
              <div className="row">
                <BankAv name="Itaú"/>
                <div className="info">
                  <strong>Internet</strong>
                  <span>Mensal · dia 20 · Vivo Fibra</span>
                </div>
                <span className="badge b-pago">Mensal</span>
                <span className="val">R$ 129,90</span>
              </div>
              <div className="row">
                <BankAv name="Itaú"/>
                <div className="info">
                  <strong>Condomínio</strong>
                  <span>Mensal · dia 25 · Edifício Aurora</span>
                </div>
                <span className="badge b-pago">Mensal</span>
                <span className="val">R$ 500,00</span>
              </div>
            </div>
          </div>

          {/* Alimentação */}
          <div className="cat-card cat-alim">
            <div className="cat-header">
              <div className="left">
                <Icon d={ICONS.utensils}/>
                <h3>Alimentação</h3>
              </div>
              <div className="summary">R$ 1.400 / mês · 2 compromissos</div>
            </div>
            <div className="cat-rows">
              <div className="row">
                <BankAv name="Inter"/>
                <div className="info">
                  <strong>Mercado da semana</strong>
                  <span>Semanal · Hortifruti + Pão de Açúcar</span>
                </div>
                <span className="badge b-pago">Semanal</span>
                <span className="val">R$ 1.020,00</span>
              </div>
              <div className="row">
                <BankAv name="Itaú"/>
                <div className="info">
                  <strong>Restaurantes</strong>
                  <span>Recorrente · sem dia fixo</span>
                </div>
                <span className="badge b-pago">Mensal</span>
                <span className="val">R$ 380,00</span>
              </div>
            </div>
          </div>

          {/* Receitas */}
          <div className="cat-card cat-rec">
            <div className="cat-header">
              <div className="left">
                <Icon d={ICONS.debts}/>
                <h3>Receitas</h3>
              </div>
              <div className="summary">R$ 12.000 / mês · 3 compromissos</div>
            </div>
            <div className="cat-rows">
              <div className="row">
                <BankAv name="Itaú"/>
                <div className="info">
                  <strong>Salário</strong>
                  <span>Mensal · dia 05 · TechCorp</span>
                </div>
                <span className="badge b-pago">Mensal</span>
                <span className="val">R$ 8.500,00</span>
              </div>
              <div className="row">
                <BankAv name="Wise"/>
                <div className="info">
                  <strong>Freela design</strong>
                  <span>Variável · USD · Cliente USA</span>
                </div>
                <span className="badge b-pagar">Variável</span>
                <span className="val">$ 650,00</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════
// SCREEN 2 — CONTAS
// ═════════════════════════════════════════════════════════════════════

function ScreenContas() {
  return (
    <div className="scr">
      <Sidebar active="accounts" />
      <div className="scr-main">
        <Topbar
          title="Contas"
          sub="6 ativas · R$ 28.450,12 no total"
          actions={
            <>
              <button className="btn btn-ghost"><Icon d={ICONS.download}/> Importar extrato</button>
              <button className="btn btn-primary"><Icon d={ICONS.plus}/> Nova conta</button>
            </>
          }
        />

        <div className="scr-content">
          <div className="kpi-row" style={{gridTemplateColumns: 'repeat(3, 1fr)'}}>
            <div className="kpi-card">
              <div className="label">Saldo total</div>
              <div className="value">R$ 28.450,12</div>
              <div className="trend up">↑ R$ 1.240 vs mês passado</div>
            </div>
            <div className="kpi-card">
              <div className="label">Diferença extrato vs FinFlow</div>
              <div className="value" style={{color:'var(--color-success)'}}>R$ 0,00</div>
              <div className="trend">Tudo bate</div>
            </div>
            <div className="kpi-card accent">
              <div className="label">Total em caixinhas</div>
              <div className="value">R$ 8.200</div>
              <div className="trend">5 caixinhas em 3 contas</div>
            </div>
          </div>

          <div className="acc-grid">
            {/* Itaú */}
            <div className="acc-card">
              <div className="acc-head">
                <BankLogo name="Itaú"/>
                <div className="info">
                  <strong>Itaú Corrente</strong>
                  <span className="tag">Corrente · BRL</span>
                </div>
              </div>
              <div className="acc-saldo-row">
                <span className="acc-saldo-lbl">Saldo</span>
                <span className="acc-saldo-val">R$ 12.480,50</span>
                <span className="acc-recon"><Icon d={ICONS.check}/> Tudo bate</span>
              </div>
              <div className="caixinhas">
                <div>
                  <div className="caixinha">
                    <span className="nm">Emergência</span>
                    <span className="vl">R$ 4.500 / 6.000</span>
                  </div>
                  <div className="bar"><div className="bar-fill" style={{width: '75%', background: 'var(--color-success)'}}></div></div>
                </div>
                <div>
                  <div className="caixinha">
                    <span className="nm">Viagem Bariloche</span>
                    <span className="vl">R$ 1.800 / 6.000</span>
                  </div>
                  <div className="bar"><div className="bar-fill" style={{width: '30%', background: 'var(--color-primary-500)'}}></div></div>
                </div>
              </div>
            </div>

            {/* Nubank */}
            <div className="acc-card">
              <div className="acc-head">
                <BankLogo name="Nubank"/>
                <div className="info">
                  <strong>Nubank</strong>
                  <span className="tag">Corrente · BRL</span>
                </div>
              </div>
              <div className="acc-saldo-row">
                <span className="acc-saldo-lbl">Saldo</span>
                <span className="acc-saldo-val">R$ 3.250,12</span>
                <span className="acc-recon warn"><Icon d={ICONS.warning}/> Diferença R$ 45,00</span>
              </div>
              <div className="caixinhas">
                <div>
                  <div className="caixinha">
                    <span className="nm">Caixinha pet</span>
                    <span className="vl">R$ 480 / 1.200</span>
                  </div>
                  <div className="bar"><div className="bar-fill" style={{width: '40%', background: 'var(--color-accent-600)'}}></div></div>
                </div>
              </div>
            </div>

            {/* Inter */}
            <div className="acc-card">
              <div className="acc-head">
                <BankLogo name="Inter"/>
                <div className="info">
                  <strong>Banco Inter</strong>
                  <span className="tag">Poupança · BRL</span>
                </div>
              </div>
              <div className="acc-saldo-row">
                <span className="acc-saldo-lbl">Saldo</span>
                <span className="acc-saldo-val">R$ 6.820,00</span>
                <span className="acc-recon"><Icon d={ICONS.check}/> Tudo bate</span>
              </div>
              <div className="caixinhas">
                <div>
                  <div className="caixinha">
                    <span className="nm">Reserva apartamento</span>
                    <span className="vl">R$ 1.420 / 100.000</span>
                  </div>
                  <div className="bar"><div className="bar-fill" style={{width: '1.4%', background: 'var(--color-primary-500)'}}></div></div>
                </div>
              </div>
            </div>

            {/* BTG */}
            <div className="acc-card">
              <div className="acc-head">
                <BankLogo name="BTG"/>
                <div className="info">
                  <strong>BTG Pactual</strong>
                  <span className="tag">Investimento · BRL</span>
                </div>
              </div>
              <div className="acc-saldo-row">
                <span className="acc-saldo-lbl">Saldo</span>
                <span className="acc-saldo-val">R$ 4.200,00</span>
                <span className="acc-recon"><Icon d={ICONS.check}/> Tudo bate</span>
              </div>
              <div style={{fontSize:'12px', color:'var(--color-ink-600)'}}>
                CDB 110% CDI · vence em 18 meses
              </div>
            </div>

            {/* Wise */}
            <div className="acc-card">
              <div className="acc-head">
                <BankLogo name="Wise"/>
                <div className="info">
                  <strong>Wise</strong>
                  <span className="tag">Multimoeda · USD/EUR</span>
                </div>
              </div>
              <div className="acc-saldo-row">
                <span className="acc-saldo-lbl">Saldo (em BRL)</span>
                <span className="acc-saldo-val">R$ 1.580,00</span>
                <span className="acc-recon"><Icon d={ICONS.check}/> $ 286 + € 120</span>
              </div>
              <div style={{fontSize:'12px', color:'var(--color-ink-600)'}}>
                Última cotação · há 3 min
              </div>
            </div>

            {/* Binance */}
            <div className="acc-card">
              <div className="acc-head">
                <BankLogo name="Binance"/>
                <div className="info">
                  <strong>Binance Crypto</strong>
                  <span className="tag">Investimento · USDT</span>
                </div>
              </div>
              <div className="acc-saldo-row">
                <span className="acc-saldo-lbl">Saldo (em BRL)</span>
                <span className="acc-saldo-val">R$ 120,50</span>
                <span className="acc-recon"><Icon d={ICONS.check}/> 21,8 USDT</span>
              </div>
              <div style={{fontSize:'12px', color:'var(--color-ink-600)'}}>
                Última cotação · há 5 min
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════
// SCREEN 3 — RELATÓRIOS · FLUXO
// ═════════════════════════════════════════════════════════════════════

function ScreenRelatorios({ tab = 'fluxo' }) {
  return (
    <div className="scr">
      <Sidebar active="reports" />
      <div className="scr-main">
        <Topbar
          title="Relatórios"
          sub="Janeiro 2026 → Maio 2026 · BRL"
          actions={
            <>
              <button className="btn btn-ghost"><Icon d={ICONS.filter}/> Período</button>
              <button className="btn btn-ghost"><Icon d={ICONS.download}/> Exportar PDF</button>
            </>
          }
        />

        <div className="scr-content">
          <div className="tabs">
            <div className={'tab' + (tab === 'fluxo' ? ' active' : '')}>Fluxo</div>
            <div className={'tab' + (tab === 'prev' ? ' active' : '')}>Previsto × Real</div>
            <div className={'tab' + (tab === 'cat' ? ' active' : '')}>Categorias</div>
            <div className={'tab' + (tab === 'comp' ? ' active' : '')}>Compromissos</div>
            <div className={'tab' + (tab === 'div' ? ' active' : '')}>Dívidas</div>
            <div className={'tab' + (tab === 'inv' ? ' active' : '')}>Investimentos</div>
            <div className={'tab' + (tab === 'sf' ? ' active' : '')}>Saúde Financeira</div>
            <div className={'tab' + (tab === 'pat' ? ' active' : '')}>Patrimônio</div>
          </div>

          {tab === 'fluxo' && <RelFluxo/>}
          {tab === 'sf' && <RelSaudeFinanceira/>}
        </div>
      </div>
    </div>
  );
}

function RelFluxo() {
  return (
    <>
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="label">Entradas · 5 meses</div>
          <div className="value" style={{color: 'var(--color-success)'}}>R$ 58.500</div>
          <div className="trend up">↑ 4,3% vs período anterior</div>
        </div>
        <div className="kpi-card">
          <div className="label">Saídas · 5 meses</div>
          <div className="value" style={{color: 'var(--color-danger)'}}>R$ 41.230</div>
          <div className="trend down">↑ 2,1% vs período anterior</div>
        </div>
        <div className="kpi-card">
          <div className="label">Saldo do período</div>
          <div className="value">R$ 17.270</div>
          <div className="trend up">↑ R$ 2.840 vs anterior</div>
        </div>
        <div className="kpi-card accent">
          <div className="label">Taxa de poupança</div>
          <div className="value">29,5%</div>
          <div className="trend up">Acima da meta (25%)</div>
        </div>
      </div>

      <div className="card mb-3" style={{height: 420}}>
        <div className="card-title">
          Fluxo de caixa · entradas vs saídas
          <span className="meta">5 meses</span>
        </div>
        <svg viewBox="0 0 1200 320" style={{width: '100%', height: 'calc(100% - 36px)'}} preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="entFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#10B981" stopOpacity="0.18"/>
              <stop offset="1" stopColor="#10B981" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="saiFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#EF4444" stopOpacity="0.15"/>
              <stop offset="1" stopColor="#EF4444" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {/* grid */}
          <line x1="60" y1="60" x2="1180" y2="60" stroke="var(--color-border)" strokeDasharray="2 4"/>
          <line x1="60" y1="140" x2="1180" y2="140" stroke="var(--color-border)" strokeDasharray="2 4"/>
          <line x1="60" y1="220" x2="1180" y2="220" stroke="var(--color-border)" strokeDasharray="2 4"/>
          {/* Y axis labels */}
          <text x="50" y="65" fontFamily="Geist Mono" fontSize="11" fill="var(--color-ink-500)" textAnchor="end">15k</text>
          <text x="50" y="145" fontFamily="Geist Mono" fontSize="11" fill="var(--color-ink-500)" textAnchor="end">10k</text>
          <text x="50" y="225" fontFamily="Geist Mono" fontSize="11" fill="var(--color-ink-500)" textAnchor="end">5k</text>

          {/* Entradas line */}
          <path d="M 120 100 L 320 90 L 520 70 L 720 80 L 920 60 L 1120 50" stroke="#10B981" strokeWidth="3" fill="none" strokeLinecap="round"/>
          <path d="M 120 100 L 320 90 L 520 70 L 720 80 L 920 60 L 1120 50 L 1120 280 L 120 280 Z" fill="url(#entFill)"/>
          {/* Saídas line */}
          <path d="M 120 200 L 320 220 L 520 210 L 720 195 L 920 215 L 1120 200" stroke="#EF4444" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="0"/>
          <path d="M 120 200 L 320 220 L 520 210 L 720 195 L 920 215 L 1120 200 L 1120 280 L 120 280 Z" fill="url(#saiFill)"/>

          {/* dots */}
          {[120, 320, 520, 720, 920, 1120].map((x, i) => {
            const yEnt = [100, 90, 70, 80, 60, 50][i];
            const ySai = [200, 220, 210, 195, 215, 200][i];
            return (
              <g key={i}>
                <circle cx={x} cy={yEnt} r="4" fill="#10B981"/>
                <circle cx={x} cy={ySai} r="4" fill="#EF4444"/>
              </g>
            );
          })}
          {/* highlight today */}
          <line x1="1120" y1="20" x2="1120" y2="280" stroke="var(--color-ink-400)" strokeDasharray="3 3" opacity="0.5"/>

          {/* X axis labels */}
          {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Hoje'].map((m, i) => (
            <text key={i} x={[120, 320, 520, 720, 920, 1120][i]} y="305" fontFamily="Geist Mono" fontSize="11" fill="var(--color-ink-500)" textAnchor="middle">{m}</text>
          ))}
        </svg>
        <div style={{display:'flex', gap: 24, marginTop: 8, fontSize: 12, color: 'var(--color-ink-700)'}}>
          <span style={{display:'flex', alignItems:'center', gap:6}}><span style={{width: 12, height: 3, background: '#10B981', borderRadius: 2}}></span>Entradas</span>
          <span style={{display:'flex', alignItems:'center', gap:6}}><span style={{width: 12, height: 3, background: '#EF4444', borderRadius: 2}}></span>Saídas</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Top 5 categorias de saída</div>
          <div>
            {[
              { name: 'Custo de Vida', val: 17500, pct: 42 },
              { name: 'Alimentação', val: 7000, pct: 17 },
              { name: 'Transporte', val: 4500, pct: 11 },
              { name: 'Lazer', val: 3200, pct: 8 },
              { name: 'Saúde', val: 2800, pct: 7 },
            ].map((c, i) => (
              <div key={i} style={{padding: '10px 0', borderBottom: '1px solid var(--color-ink-100)'}}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom: 4}}>
                  <span style={{fontSize: 13, fontWeight: 500}}>{c.name}</span>
                  <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink-700)'}}>R$ {c.val.toLocaleString('pt-BR')}</span>
                </div>
                <div style={{height: 4, background: 'var(--color-ink-100)', borderRadius: 2, overflow: 'hidden'}}>
                  <div style={{height: '100%', background: 'var(--color-primary-500)', width: `${c.pct * 2.3}%`}}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Insights do período</div>
          <div style={{display:'flex', flexDirection:'column', gap: 12}}>
            <div style={{padding: 12, background: 'var(--color-status-pago-bg)', borderRadius: 8, borderLeft: '3px solid var(--color-success)'}}>
              <div style={{fontWeight: 600, color: 'var(--color-status-pago-text)', fontSize: 13, marginBottom: 4}}>Taxa de poupança subiu 2,3 pp</div>
              <div style={{color: 'var(--color-status-pago-text)', fontSize: 12, opacity: 0.85}}>De 27,2% para 29,5% nos últimos 5 meses.</div>
            </div>
            <div style={{padding: 12, background: 'var(--color-status-apagar-bg)', borderRadius: 8, borderLeft: '3px solid var(--color-warning)'}}>
              <div style={{fontWeight: 600, color: 'var(--color-status-apagar-text)', fontSize: 13, marginBottom: 4}}>Alimentação +15% em maio</div>
              <div style={{color: 'var(--color-status-apagar-text)', fontSize: 12, opacity: 0.85}}>Pico fora do padrão. Vale revisar mercado da semana.</div>
            </div>
            <div style={{padding: 12, background: 'var(--color-primary-50)', borderRadius: 8, borderLeft: '3px solid var(--color-primary-500)'}}>
              <div style={{fontWeight: 600, color: 'var(--color-primary-700)', fontSize: 13, marginBottom: 4}}>Salário em dia · 5 / 5 meses</div>
              <div style={{color: 'var(--color-primary-700)', fontSize: 12, opacity: 0.85}}>Recebido sempre no dia 05. Sem variações.</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function RelSaudeFinanceira() {
  return (
    <>
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="label">Taxa de poupança</div>
          <div className="value">29,5%</div>
          <div className="trend up">Acima da meta (25%)</div>
        </div>
        <div className="kpi-card">
          <div className="label">Reserva de emergência</div>
          <div className="value">5,4 meses</div>
          <div className="trend up">Meta: 6 meses</div>
        </div>
        <div className="kpi-card">
          <div className="label">Endividamento</div>
          <div className="value">8,2%</div>
          <div className="trend">do patrimônio</div>
        </div>
        <div className="kpi-card accent">
          <div className="label">Patrimônio líquido</div>
          <div className="value">R$ 142.300</div>
          <div className="trend up">↑ 2,4% no mês</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Taxa de poupança · evolução</div>
          <svg viewBox="0 0 600 220" style={{width: '100%', height: 220}}>
            <line x1="40" y1="40" x2="580" y2="40" stroke="var(--color-border)" strokeDasharray="2 4"/>
            <line x1="40" y1="100" x2="580" y2="100" stroke="var(--color-success)" strokeDasharray="3 4" opacity="0.4"/>
            <text x="585" y="103" fontFamily="Geist Mono" fontSize="10" fill="var(--color-success)" textAnchor="start">25% meta</text>
            <line x1="40" y1="160" x2="580" y2="160" stroke="var(--color-border)" strokeDasharray="2 4"/>

            <path d="M 80 130 L 180 120 L 280 95 L 380 85 L 480 75 L 560 70" stroke="var(--color-primary-500)" strokeWidth="3" fill="none" strokeLinecap="round"/>
            {[80, 180, 280, 380, 480, 560].map((x, i) => {
              const y = [130, 120, 95, 85, 75, 70][i];
              return <circle key={i} cx={x} cy={y} r="4" fill="var(--color-primary-500)"/>;
            })}
            <circle cx="560" cy="70" r="6" fill="var(--color-accent-400)" stroke="var(--color-ink-900)" strokeWidth="1.5"/>

            {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Hoje'].map((m, i) => (
              <text key={i} x={[80, 180, 280, 380, 480, 560][i]} y="200" fontFamily="Geist Mono" fontSize="10" fill="var(--color-ink-500)" textAnchor="middle">{m}</text>
            ))}
          </svg>
        </div>

        <div className="card">
          <div className="card-title">Composição do patrimônio</div>
          <svg viewBox="0 0 320 200" style={{width: '100%', height: 200}}>
            {/* Donut */}
            <g transform="translate(100,100)">
              {/* Contas + investimentos */}
              <circle r="70" fill="none" stroke="var(--color-primary-500)" strokeWidth="24" strokeDasharray="240 220" transform="rotate(-90)"/>
              {/* Imóveis (lime) */}
              <circle r="70" fill="none" stroke="var(--color-accent-500)" strokeWidth="24" strokeDasharray="120 340" transform="rotate(150)"/>
              {/* Dívidas (red, inset) */}
              <circle r="70" fill="none" stroke="var(--color-danger)" strokeWidth="24" strokeDasharray="40 420" transform="rotate(260)"/>
              <text x="0" y="0" fontFamily="Manrope" fontWeight="800" fontSize="20" fill="var(--color-ink-900)" textAnchor="middle" dy="0">R$ 142k</text>
              <text x="0" y="0" fontFamily="Geist Mono" fontSize="10" fill="var(--color-ink-500)" textAnchor="middle" dy="18">patrimônio</text>
            </g>
            {/* Legend */}
            <g transform="translate(200, 50)">
              <rect x="0" y="0" width="10" height="10" fill="var(--color-primary-500)" rx="2"/>
              <text x="16" y="9" fontFamily="Inter" fontSize="11" fill="var(--color-ink-700)">Líquidos · R$ 28k</text>
              <rect x="0" y="22" width="10" height="10" fill="var(--color-accent-500)" rx="2"/>
              <text x="16" y="31" fontFamily="Inter" fontSize="11" fill="var(--color-ink-700)">Imóveis · R$ 124k</text>
              <rect x="0" y="44" width="10" height="10" fill="var(--color-danger)" rx="2"/>
              <text x="16" y="53" fontFamily="Inter" fontSize="11" fill="var(--color-ink-700)">− Dívidas · R$ 10k</text>
            </g>
          </svg>
        </div>
      </div>

      <div className="card" style={{marginTop: 12}}>
        <div className="card-title">Reserva de emergência</div>
        <div style={{display:'flex', alignItems:'center', gap: 24}}>
          <div style={{flex: 1}}>
            <div style={{fontSize: 13, color: 'var(--color-ink-600)', marginBottom: 4}}>5,4 / 6 meses</div>
            <div style={{height: 10, background: 'var(--color-ink-100)', borderRadius: 5, overflow: 'hidden'}}>
              <div style={{height: '100%', width: '90%', background: 'linear-gradient(90deg, var(--color-success), var(--color-accent-500))', borderRadius: 5}}></div>
            </div>
            <div style={{fontSize: 11, color: 'var(--color-ink-500)', marginTop: 6, fontFamily:'var(--font-mono)'}}>
              R$ 4.500 / R$ 5.000 · faltam R$ 500 pra atingir a meta
            </div>
          </div>
          <button className="btn btn-primary">+ Aportar agora</button>
        </div>
      </div>
    </>
  );
}


// ═════════════════════════════════════════════════════════════════════
// CANVAS
// ═════════════════════════════════════════════════════════════════════

function App() {
  return (
    <DesignCanvas>
      <DCSection id="compromissos" title="Compromissos" subtitle="Coração do app · lista agrupada por categoria">
        <DCArtboard id="comp-light" label="Light mode" width={1440} height={900}>
          <div data-theme="light"><ScreenCompromissos/></div>
        </DCArtboard>
        <DCArtboard id="comp-dark" label="Dark mode" width={1440} height={900}>
          <div data-theme="dark"><ScreenCompromissos/></div>
        </DCArtboard>
      </DCSection>

      <DCSection id="contas" title="Contas" subtitle="Cards de banco com saldo, reconciliação e caixinhas">
        <DCArtboard id="con-light" label="Light mode" width={1440} height={900}>
          <div data-theme="light"><ScreenContas/></div>
        </DCArtboard>
        <DCArtboard id="con-dark" label="Dark mode" width={1440} height={900}>
          <div data-theme="dark"><ScreenContas/></div>
        </DCArtboard>
      </DCSection>

      <DCSection id="relatorios" title="Relatórios" subtitle="Aba Fluxo (light) e Saúde Financeira (dark)">
        <DCArtboard id="rel-fluxo-light" label="Fluxo · Light" width={1440} height={900}>
          <div data-theme="light"><ScreenRelatorios tab="fluxo"/></div>
        </DCArtboard>
        <DCArtboard id="rel-sf-dark" label="Saúde Financeira · Dark" width={1440} height={900}>
          <div data-theme="dark"><ScreenRelatorios tab="sf"/></div>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
