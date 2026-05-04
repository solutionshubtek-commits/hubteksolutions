// ============== ADMIN PANEL DATA ==============
const adminClients = [
  { id: 1, name: 'Pizzaria Vesúvio',         segment: 'Tatuapé · SP',           agent: 'active',       convos: 6412,  tokens: 2_840_000, cost: 1284.50, cycleEnding: false, expiresAt: '12/jul/2026', daysLeft: 75,  status: 'ok' },
  { id: 2, name: 'Clínica Vita Saúde',       segment: 'Botafogo · RJ',          agent: 'active',       convos: 4288,  tokens: 1_920_000, cost: 864.00,  cycleEnding: true,  expiresAt: '03/mai/2026', daysLeft: 5,   status: 'expiring' },
  { id: 3, name: 'Auto Center Garagem 88',   segment: 'Zona Sul · SP',          agent: 'paused',       convos: 1247,  tokens: 540_000,   cost: 243.00,  cycleEnding: false, expiresAt: '28/jul/2026', daysLeft: 91,  status: 'ok' },
  { id: 4, name: 'Salão Estilo Próprio',     segment: 'Pinheiros · SP',         agent: 'active',       convos: 3120,  tokens: 1_310_000, cost: 589.50,  cycleEnding: true,  expiresAt: '06/mai/2026', daysLeft: 8,   status: 'expiring' },
  { id: 5, name: 'Loja Rede Móveis',         segment: 'Goiânia · GO',           agent: 'active',       convos: 8941,  tokens: 4_120_000, cost: 1854.00, cycleEnding: false, expiresAt: '14/out/2026', daysLeft: 169, status: 'ok' },
  { id: 6, name: 'Studio Pilates Movimento', segment: 'Campinas · SP',          agent: 'disconnected', convos: 0,     tokens: 0,         cost: 0,       cycleEnding: false, expiresAt: '15/abr/2026', daysLeft: -13, status: 'blocked' },
  { id: 7, name: 'Petshop Bicho Solto',      segment: 'Santo André · SP',       agent: 'active',       convos: 2683,  tokens: 1_184_000, cost: 532.80,  cycleEnding: false, expiresAt: '22/jun/2026', daysLeft: 55,  status: 'ok' },
  { id: 8, name: 'Distribuidora Norte Bebidas', segment: 'Manaus · AM',         agent: 'active',       convos: 5418,  tokens: 2_410_000, cost: 1084.50, cycleEnding: true,  expiresAt: '05/mai/2026', daysLeft: 7,   status: 'expiring' },
];

// 30 days of token consumption — realistic ramp
const tokenSeries = [
  68000, 74000, 71000, 82000, 89000, 64000, 58000,
  92000, 98000, 104000, 112000, 118000, 87000, 79000,
  124000, 132000, 138000, 142000, 148000, 102000, 94000,
  152000, 161000, 168000, 174000, 181000, 124000, 118000,
  189000, 196000
];

const knowledgeDocs = [
  { id: 1, name: 'Cardápio completo — Pizzaria Vesúvio.pdf', size: '2.4 MB', updated: 'há 3 dias',  type: 'pdf' },
  { id: 2, name: 'Política de entrega e bairros.docx',         size: '184 KB', updated: 'há 1 semana', type: 'doc' },
  { id: 3, name: 'FAQ — perguntas frequentes.txt',             size: '24 KB',  updated: 'há 2 semanas', type: 'txt' },
  { id: 4, name: 'Tabela de preços promocionais — Abril.xlsx', size: '78 KB',  updated: 'há 5 dias',  type: 'xls' },
];

const closedCycles = [
  { month: 'Março/2026',     convos: 24180, tokens: 10_840_000, cost: 4878.00, status: 'closed' },
  { month: 'Fevereiro/2026', convos: 21490, tokens: 9_620_000,  cost: 4329.00, status: 'closed' },
  { month: 'Janeiro/2026',   convos: 19840, tokens: 8_910_000,  cost: 4009.50, status: 'closed' },
  { month: 'Dezembro/2025',  convos: 22310, tokens: 10_120_000, cost: 4554.00, status: 'closed' },
];

// ============== Components ==============
const { useState: useStateA } = React;
const fmtBR = (n) => n.toLocaleString('pt-BR');
const fmtBRL = (n) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCompact = (n) => n >= 1_000_000 ? (n/1_000_000).toFixed(2).replace('.',',') + 'M'
                       : n >= 1000 ? (n/1000).toFixed(1).replace('.',',') + 'k'
                       : String(n);

const ADMIN_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark"
}/*EDITMODE-END*/;

// ----- Header -----
const AdminHeader = ({ theme, onToggleTheme }) => (
  <header className="header">
    <div className="header-logo">
      <img src="assets/logo-horizontal.png" alt="HUBTEK SOLUTIONS"/>
    </div>
    <span className="admin-badge">
      <span className="dot"/> Painel Admin
    </span>

    <div className="header-spacer"/>

    <div className="header-meta">
      <span className="meta-label">Clientes ativos</span>
      <span className="meta-value">
        <span className="meta-dot"/>
        7 / 8
      </span>
    </div>

    <button className="header-icon-btn" title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} onClick={onToggleTheme}>
      {theme === 'dark' ? <window.Icons.Sun/> : <window.Icons.Moon/>}
    </button>

    <button className="header-icon-btn" title="Notificações">
      <window.Icons.Bell/>
      <span className="notif-dot"/>
    </button>

    <div className="user-avatar admin-avatar" title="Admin · Robson Oliveira">RO</div>
  </header>
);

// ----- Sidebar -----
const AdminSidebar = ({ active, onChange }) => {
  const items = [
    { id: 'overview',    label: 'Visão Geral',           icon: 'LayoutDashboard' },
    { id: 'clients',     label: 'Clientes',              icon: 'Users', badge: 8 },
    { id: 'costs',       label: 'Custos de IA',          icon: 'Wallet' },
    { id: 'training',    label: 'Treinamento de Agentes', icon: 'Bot' },
    { id: 'reports',     label: 'Relatórios',            icon: 'FileText' },
    { id: 'config',      label: 'Configurações',         icon: 'Settings' },
  ];
  return (
    <aside className="sidebar">
      <div className="sb-section-label">Administração</div>
      {items.map(it => {
        const I = window.Icons[it.icon];
        return (
          <button key={it.id}
                  className={`sb-item ${active === it.id ? 'selected' : ''}`}
                  onClick={() => onChange(it.id)}>
            <I/>
            <span>{it.label}</span>
            {it.badge ? <span className="sb-badge">{it.badge}</span> : null}
          </button>
        );
      })}

      <div className="sb-footer">
        <div className="sb-help-card">
          <div className="title">Status do sistema</div>
          <div className="body">Todos os serviços operando normalmente. Última verificação há 30s.</div>
          <a className="link" href="#"><span style={{display:'inline-block',width:6,height:6,borderRadius:9999,background:'var(--accent)',marginRight:6,verticalAlign:'middle'}}/> status.hubtek.io</a>
        </div>
      </div>
    </aside>
  );
};

// ----- KPI -----
const AdminKpi = ({ label, value, sub, delta, deltaDir, icon, accent }) => {
  const I = window.Icons[icon];
  return (
    <div className="kpi-card">
      <div className="top-row">
        <div className="label">{label}</div>
        <div className="icon-box"><I/></div>
      </div>
      <div className="value" style={accent ? {color:'var(--accent)'} : null}>{value}</div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div style={{font:'400 11px/1 var(--font-sans)', color:'var(--fg3)'}}>{sub}</div>
        {delta && (
          <div className={`delta ${deltaDir === 'down' ? 'down' : ''}`}>
            {deltaDir === 'down' ? <window.Icons.ArrowDown/> : <window.Icons.ArrowUp/>}
            <span>{delta}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ----- Client status badge -----
const AgentStatusBadge = ({ status }) => {
  const map = {
    active:       { cls: 'active',  label: 'Ativo' },
    paused:       { cls: 'paused',  label: 'Pausado' },
    disconnected: { cls: 'disconn', label: 'Desconectado' },
  };
  const cfg = map[status];
  return <span className={`status-badge ${cfg.cls}`}><span className="dot"/>{cfg.label}</span>;
};

// ----- Plan tag -----
const ExpiryTag = ({ expiresAt, daysLeft, status }) => {
  let cls = 'expiry-tag ';
  let label;
  if (status === 'blocked') {
    cls += 'expiry-blocked';
    label = <>🔒 Bloqueado · expirou em {expiresAt}</>;
  } else if (status === 'expiring') {
    cls += 'expiry-expiring';
    label = <>⚠ Expira em {daysLeft}d · {expiresAt}</>;
  } else {
    cls += 'expiry-ok';
    label = <>{expiresAt} · {daysLeft}d</>;
  }
  return <span className={cls}>{label}</span>;
};

// ----- Client table -----
const ClientTable = ({ rows, onCloseClient }) => (
  <table className="tbl">
    <thead>
      <tr>
        <th style={{width: '22%'}}>Cliente</th>
        <th style={{width: '12%'}}>Status do agente</th>
        <th style={{width: '16%'}}>Expiração do acesso</th>
        <th style={{width: '10%', textAlign:'right'}}>Conversas</th>
        <th style={{width: '10%', textAlign:'right'}}>Tokens</th>
        <th style={{width: '12%', textAlign:'right'}}>Custo estimado</th>
        <th style={{width: '18%'}}>Ações</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(r => (
        <tr key={r.id}>
          <td className="contact">
            <div className="avatar">{r.name.split(' ').slice(0,2).map(s=>s[0]).join('').toUpperCase()}</div>
            <div style={{display:'flex', flexDirection:'column'}}>
              <span style={{font:'500 13px/1.3 var(--font-sans)', color:'var(--fg1)'}}>{r.name}</span>
              <span style={{font:'400 11px/1 var(--font-sans)', color:'var(--fg3)', marginTop:3}}>{r.segment}</span>
            </div>
          </td>
          <td><AgentStatusBadge status={r.agent}/></td>
          <td><ExpiryTag expiresAt={r.expiresAt} daysLeft={r.daysLeft} status={r.status}/></td>
          <td style={{textAlign:'right', font:'500 13px/1 var(--font-mono)', color:'var(--fg1)'}}>{fmtBR(r.convos)}</td>
          <td style={{textAlign:'right', font:'400 13px/1 var(--font-mono)', color:'var(--fg2)'}}>{fmtCompact(r.tokens)}</td>
          <td style={{textAlign:'right', font:'600 13px/1 var(--font-mono)', color: r.cost > 0 ? 'var(--accent)' : 'var(--fg3)'}}>
            {r.cost > 0 ? fmtBRL(r.cost) : '—'}
          </td>
          <td>
            <div style={{display:'flex', gap:6, alignItems:'center'}}>
              <button className="row-action pause" title="Ver detalhes">Detalhes</button>
              {r.status === 'blocked' ? (
                <button className="row-action close-cycle" onClick={() => onCloseClient(r.id)}>
                  <window.Icons.RefreshCw/> Renovar acesso
                </button>
              ) : r.status === 'expiring' ? (
                <button className="row-action close-cycle" onClick={() => onCloseClient(r.id)}>
                  <window.Icons.AlertTriangle/> Renovar
                </button>
              ) : (
                <button className="row-action pause" title="Configurar"><window.Icons.Settings/></button>
              )}
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

// ----- Line chart for token consumption -----
const TokenLineChart = ({ data }) => {
  const w = 700, h = 260, pad = { l: 60, r: 16, t: 16, b: 32 };
  const max = Math.max(...data) * 1.1;
  const points = data.map((v, i) => {
    const x = pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
    const y = pad.t + (1 - v / max) * (h - pad.t - pad.b);
    return [x, y];
  });
  const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const areaPath = path + ` L${points[points.length-1][0]},${h - pad.b} L${pad.l},${h - pad.b} Z`;

  // Y axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    y: pad.t + (1 - t) * (h - pad.t - pad.b),
    label: fmtCompact(Math.round(max * t))
  }));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      <defs>
        <linearGradient id="lg-tokens" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="#10B981" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} y1={t.y} x2={w - pad.r} y2={t.y}
                stroke="var(--border-subtle)" strokeDasharray="3 4"/>
          <text x={pad.l - 8} y={t.y + 4} fontSize="10" fontFamily="Inter"
                fill="var(--fg3)" textAnchor="end">{t.label}</text>
        </g>
      ))}
      {/* X axis: every 5 days */}
      {data.map((_, i) => i % 5 === 0 && (
        <text key={i} x={pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r)}
              y={h - 10} fontSize="10" fontFamily="Inter"
              fill="var(--fg3)" textAnchor="middle">{`${i+1}`}</text>
      ))}
      <path d={areaPath} fill="url(#lg-tokens)"/>
      <path d={path} fill="none" stroke="#10B981" strokeWidth="1.8"/>
      {points.map((p, i) => i % 5 === 0 && (
        <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--bg-raised)" stroke="#10B981" strokeWidth="1.5"/>
      ))}
      {/* Last point — emphasized */}
      <circle cx={points[points.length-1][0]} cy={points[points.length-1][1]} r="5" fill="#10B981"/>
      <circle cx={points[points.length-1][0]} cy={points[points.length-1][1]} r="9" fill="#10B981" opacity="0.2"/>
    </svg>
  );
};

// ============== PAGE: VISÃO GERAL ==============
const AdminOverview = ({ rows, onCloseClient }) => (
  <>
    <div className="page-head">
      <div>
        <div className="greet">Painel Administrativo</div>
        <div className="title">Visão Geral Consolidada</div>
        <div className="sub">Saúde da operação, custos e performance dos 8 clientes ativos no ciclo atual.</div>
      </div>
      <div style={{display:'flex', gap:8}}>
        <button className="btn btn-secondary"><window.Icons.Download/> Exportar consolidado</button>
        <button className="btn btn-primary"><window.Icons.Plus/> Novo cliente</button>
      </div>
    </div>

    <div className="kpi-grid">
      <AdminKpi label="Clientes ativos"          value="6"     sub="1 bloqueado · 8 cadastrados"     icon="Users"/>
      <AdminKpi label="Conversas no mês"          value="32.1k" sub="todos os clientes ativos"        delta="+18%" deltaDir="up" icon="MessageCircle"/>
      <AdminKpi label="Custo de IA · ciclo atual" value="R$ 6.451,80" sub="abril/2026"                delta="+12%" deltaDir="up" icon="Wallet" accent/>
      <AdminKpi label="Acessos a expirar"         value="3"     sub="próximos 10 dias"  icon="AlertTriangle"/>
    </div>

    <div className="card table-card" style={{marginTop:0}}>
      <div className="card-head">
        <div>
          <div className="card-title">Clientes — visão consolidada</div>
          <div className="card-sub">Status do agente, consumo e custo por cliente. Fechar ciclos próximos do vencimento à direita.</div>
        </div>
        <div className="card-actions">
          <button className="filter-select">Todos os planos <window.Icons.ChevronDown/></button>
          <button className="filter-select"><window.Icons.Filter/> Filtrar</button>
          <button className="btn btn-secondary"><window.Icons.Search/></button>
        </div>
      </div>
      <ClientTable rows={rows} onCloseClient={onCloseClient}/>
    </div>
  </>
);

// ============== PAGE: CLIENTES (full table) ==============
const AdminClientsPage = ({ rows, onCloseClient }) => (
  <>
    <div className="page-head">
      <div>
        <div className="greet">Gestão</div>
        <div className="title">Clientes</div>
        <div className="sub">8 contas cadastradas. Inclusão e exclusão são feitas internamente — acesso padrão de 3 meses, renovável conforme contratação.</div>
      </div>
      <div style={{display:'flex', gap:8}}>
        <button className="btn btn-secondary"><window.Icons.Download/> Exportar</button>
        <button className="btn btn-primary"><window.Icons.Plus/> Cadastrar cliente</button>
      </div>
    </div>
    <div className="card table-card" style={{marginTop:0}}>
      <ClientTable rows={rows} onCloseClient={onCloseClient}/>
    </div>
  </>
);

// ============== PAGE: CUSTOS DE IA ==============
const AdminCostsPage = ({ rows }) => {
  const [client, setClient] = useStateA(rows[0].id);
  const [month, setMonth] = useStateA('abril/2026');
  const selected = rows.find(r => r.id === client);

  // Fake daily breakdown table (show 7 most recent days)
  const days = Array.from({length: 7}, (_, i) => {
    const d = new Date(2026, 3, 22 + i); // Apr 22-28
    return {
      date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      convos: 80 + Math.round(Math.random() * 240),
      tokens: 70_000 + Math.round(Math.random() * 130_000),
      cost: 32 + Math.round(Math.random() * 60 * 100) / 100,
    };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="greet">Faturamento</div>
          <div className="title">Custos de IA</div>
          <div className="sub">Detalhamento diário do consumo de tokens por cliente e ciclo de cobrança.</div>
        </div>
        <div style={{display:'flex', gap:8}}>
          <select className="select-control" value={client} onChange={e => setClient(Number(e.target.value))}>
            {rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="select-control" value={month} onChange={e => setMonth(e.target.value)}>
            <option>abril/2026</option>
            <option>março/2026</option>
            <option>fevereiro/2026</option>
            <option>janeiro/2026</option>
          </select>
        </div>
      </div>

      <div className="kpi-grid">
        <AdminKpi label="Custo total do ciclo"  value={fmtBRL(selected.cost)} sub={month} icon="Wallet" accent/>
        <AdminKpi label="Tokens consumidos"     value={fmtCompact(selected.tokens)} sub="entrada + saída" icon="Zap"/>
        <AdminKpi label="Conversas no ciclo"    value={fmtBR(selected.convos)} sub="incluindo automatizadas" icon="MessageCircle"/>
        <AdminKpi label="Custo médio / conversa" value={fmtBRL(selected.cost / Math.max(selected.convos,1))} sub="custo unitário" icon="TrendingUp"/>
      </div>

      <div className="card" style={{marginBottom:24}}>
        <div className="card-head">
          <div>
            <div className="card-title">Consumo diário de tokens — {month}</div>
            <div className="card-sub">{selected.name} · {fmtCompact(selected.tokens)} tokens no ciclo</div>
          </div>
          <div className="card-actions">
            <button className="btn btn-secondary"><window.Icons.Download/> Exportar PDF</button>
            <button className="btn btn-primary"><window.Icons.Download/> Exportar CSV</button>
          </div>
        </div>
        <TokenLineChart data={tokenSeries}/>
      </div>

      <div className="card" style={{marginBottom:24}}>
        <div className="card-head">
          <div>
            <div className="card-title">Detalhamento diário</div>
            <div className="card-sub">Últimos 7 dias do ciclo selecionado.</div>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width:'18%'}}>Data</th>
              <th style={{width:'20%', textAlign:'right'}}>Conversas</th>
              <th style={{width:'20%', textAlign:'right'}}>Tokens</th>
              <th style={{width:'20%', textAlign:'right'}}>Custo (R$)</th>
              <th style={{width:'22%'}}>Variação</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={i}>
                <td style={{font:'500 13px/1 var(--font-sans)', color:'var(--fg1)'}}>{d.date}</td>
                <td style={{textAlign:'right', font:'400 13px/1 var(--font-mono)', color:'var(--fg2)'}}>{fmtBR(d.convos)}</td>
                <td style={{textAlign:'right', font:'400 13px/1 var(--font-mono)', color:'var(--fg2)'}}>{fmtCompact(d.tokens)}</td>
                <td style={{textAlign:'right', font:'600 13px/1 var(--font-mono)', color:'var(--accent)'}}>{fmtBRL(d.cost)}</td>
                <td>
                  <div style={{height:6, background:'var(--bg-sunken)', borderRadius:9999, overflow:'hidden', maxWidth:140}}>
                    <div style={{width:`${30 + (i*9)}%`, height:'100%', background:'var(--accent)', borderRadius:9999, opacity: 0.4 + (i*0.08)}}/>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Histórico de ciclos fechados</div>
            <div className="card-sub">Ciclos faturados anteriormente. Clique em um ciclo para ver o relatório completo.</div>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width:'24%'}}>Ciclo</th>
              <th style={{width:'18%', textAlign:'right'}}>Conversas</th>
              <th style={{width:'18%', textAlign:'right'}}>Tokens</th>
              <th style={{width:'18%', textAlign:'right'}}>Custo total</th>
              <th style={{width:'12%'}}>Status</th>
              <th style={{width:'10%'}}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {closedCycles.map((c, i) => (
              <tr key={i}>
                <td style={{font:'500 13px/1 var(--font-sans)', color:'var(--fg1)'}}>{c.month}</td>
                <td style={{textAlign:'right', font:'400 13px/1 var(--font-mono)', color:'var(--fg2)'}}>{fmtBR(c.convos)}</td>
                <td style={{textAlign:'right', font:'400 13px/1 var(--font-mono)', color:'var(--fg2)'}}>{fmtCompact(c.tokens)}</td>
                <td style={{textAlign:'right', font:'600 13px/1 var(--font-mono)', color:'var(--fg1)'}}>{fmtBRL(c.cost)}</td>
                <td><span className="status-badge closed"><span className="dot"/> Fechado</span></td>
                <td>
                  <button className="row-action pause"><window.Icons.Download/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============== PAGE: TREINAMENTO ==============
const AdminTrainingPage = ({ rows }) => {
  const [client, setClient] = useStateA(rows[0].id);
  const [agentOn, setAgentOn] = useStateA(true);
  const [hours, setHours] = useStateA({ from: '08:00', to: '23:00' });
  const [docs, setDocs] = useStateA(knowledgeDocs);
  const [prompt, setPrompt] = useStateA(
`Você é o atendente virtual da {empresa}. Sua função é responder dúvidas sobre o cardápio, formas de pagamento, prazos de entrega e tirar pedidos.

Tom de voz: cordial, direto, brasileiro informal mas educado. Use "você", nunca "tu".

Regras importantes:
- Sempre confirme o pedido com o cliente antes de finalizar.
- Se o cliente pedir desconto, oriente sobre as promoções vigentes — NÃO ofereça descontos por conta própria.
- Para pagamento via Pix, envie a chave: 12.345.678/0001-90
- Em caso de dúvida sobre alergia/restrição alimentar, transfira IMEDIATAMENTE para um atendente humano.
- Horário de funcionamento: terça a domingo, das 18h às 23h.

Sempre encerre com: "Posso ajudar em mais alguma coisa?"`
  );
  const selected = rows.find(r => r.id === client);

  const docIcon = (type) => ({
    pdf: '📄', doc: '📝', txt: '📃', xls: '📊'
  }[type] || '📄');

  return (
    <>
      <div className="page-head">
        <div>
          <div className="greet">Configuração</div>
          <div className="title">Treinamento de Agentes</div>
          <div className="sub">Edite o prompt principal, gerencie a base de conhecimento e ajuste o comportamento do agente.</div>
        </div>
        <select className="select-control" value={client} onChange={e => setClient(Number(e.target.value))} style={{minWidth:240}}>
          {rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {/* Top status row */}
      <div className="card" style={{marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div style={{display:'flex', alignItems:'center', gap:14}}>
          <div className="company-mark" style={{width:44, height:44, fontSize:14}}>
            {selected.name.split(' ').slice(0,2).map(s=>s[0]).join('').toUpperCase()}
          </div>
          <div>
            <div style={{font:'600 15px/1.2 var(--font-sans)', color:'var(--fg1)'}}>{selected.name}</div>
            <div style={{font:'400 12px/1 var(--font-sans)', color:'var(--fg3)', marginTop:4}}>{selected.segment} · acesso até {selected.expiresAt}</div>
          </div>
        </div>
        <div style={{display:'flex', gap:24, alignItems:'center'}}>
          <div style={{textAlign:'right'}}>
            <div style={{font:'500 11px/1 var(--font-sans)', color:'var(--fg3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4}}>Status do agente</div>
            <div style={{font:'600 13px/1 var(--font-sans)', color: agentOn ? 'var(--accent)' : 'var(--danger)'}}>
              {agentOn ? '● Ativo · respondendo' : '● Inativo · não responde'}
            </div>
          </div>
          <button className={`big-toggle ${agentOn ? 'on' : 'off'}`} onClick={() => setAgentOn(!agentOn)}>
            <span className="thumb"/>
          </button>
        </div>
      </div>

      <div className="train-grid">
        {/* Left: prompt editor */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Prompt principal</div>
              <div className="card-sub">Define a personalidade, regras e contexto do agente. Use {`{empresa}`} para inserir o nome do cliente automaticamente.</div>
            </div>
            <button className="btn btn-ghost" style={{padding:'6px 10px'}}><window.Icons.History/> Histórico</button>
          </div>
          <textarea className="prompt-editor" value={prompt} onChange={e => setPrompt(e.target.value)}/>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14}}>
            <div style={{font:'400 11px/1 var(--font-sans)', color:'var(--fg3)'}}>
              {prompt.length} caracteres · ~{Math.round(prompt.length / 4)} tokens
            </div>
            <div style={{display:'flex', gap:8}}>
              <button className="btn btn-ghost">Descartar</button>
              <button className="btn btn-primary"><window.Icons.CheckCircle/> Salvar configurações</button>
            </div>
          </div>
        </div>

        {/* Right: knowledge base + hours */}
        <div style={{display:'flex', flexDirection:'column', gap:16}}>
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Horário de funcionamento</div>
                <div className="card-sub">O agente só responde dentro deste intervalo.</div>
              </div>
            </div>
            <div style={{display:'flex', gap:10, alignItems:'center', marginTop:14}}>
              <input className="time-input" type="time" value={hours.from} onChange={e => setHours({...hours, from: e.target.value})}/>
              <span style={{color:'var(--fg3)', font:'400 13px/1 var(--font-sans)'}}>até</span>
              <input className="time-input" type="time" value={hours.to} onChange={e => setHours({...hours, to: e.target.value})}/>
            </div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:14}}>
              {['Seg','Ter','Qua','Qui','Sex','Sab','Dom'].map((d, i) => (
                <button key={d} className={`day-pill ${i !== 0 ? 'on' : ''}`}>{d}</button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Base de conhecimento</div>
                <div className="card-sub">{docs.length} documentos · usados como contexto para respostas.</div>
              </div>
              <button className="btn btn-primary" style={{padding:'7px 12px', fontSize:12}}>
                <window.Icons.Upload/> Upload
              </button>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:14}}>
              {docs.map(doc => (
                <div key={doc.id} className="kb-doc">
                  <div className="kb-icon">{docIcon(doc.type)}</div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{font:'500 13px/1.3 var(--font-sans)', color:'var(--fg1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {doc.name}
                    </div>
                    <div style={{font:'400 11px/1 var(--font-sans)', color:'var(--fg3)', marginTop:3}}>
                      {doc.size} · atualizado {doc.updated}
                    </div>
                  </div>
                  <div style={{display:'flex', gap:4}}>
                    <button className="row-more" title="Editar"><window.Icons.Settings/></button>
                    <button className="row-more" title="Remover" onClick={() => setDocs(ds => ds.filter(d => d.id !== doc.id))}>
                      <window.Icons.X/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ============== APP ==============
const AdminApp = () => {
  const [t, setTweak] = useTweaks(ADMIN_TWEAK_DEFAULTS);
  const [page, setPage] = useStateA('overview');
  const [rows, setRows] = useStateA(adminClients);

  const theme = t.theme || 'dark';
  React.useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  const toggleTheme = () => setTweak('theme', theme === 'dark' ? 'light' : 'dark');

  const handleCloseClient = (id) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, cycleEnding: false } : r));
  };

  const labels = {
    overview: '01 Admin · Visão Geral',
    clients:  '02 Admin · Clientes',
    costs:    '03 Admin · Custos de IA',
    training: '04 Admin · Treinamento',
    reports:  '05 Admin · Relatórios',
    config:   '06 Admin · Configurações',
  };

  return (
    <div className="app" data-screen-label={labels[page]}>
      <AdminHeader theme={theme} onToggleTheme={toggleTheme}/>
      <AdminSidebar active={page} onChange={setPage}/>
      <main className="main">
        {page === 'overview' && <AdminOverview rows={rows} onCloseClient={handleCloseClient}/>}
        {page === 'clients'  && <AdminClientsPage rows={rows} onCloseClient={handleCloseClient}/>}
        {page === 'costs'    && <AdminCostsPage rows={rows}/>}
        {page === 'training' && <AdminTrainingPage rows={rows}/>}
        {page === 'reports' && (
          <div className="empty">
            <div className="empty-icon"><window.Icons.FileText/></div>
            <div className="empty-title">Relatórios</div>
            <div className="empty-sub">Geração de relatórios consolidados, exportação para Excel/PDF e envio agendado por e-mail.</div>
          </div>
        )}
        {page === 'config' && (
          <div className="empty">
            <div className="empty-icon"><window.Icons.Settings/></div>
            <div className="empty-title">Configurações da plataforma</div>
            <div className="empty-sub">Chaves de API, integrações, equipe, cobrança e segurança.</div>
          </div>
        )}
      </main>

      <TweaksPanel>
        <TweakSection label="Tema"/>
        <TweakRadio label="Aparência" value={theme}
                    options={['dark','light']}
                    onChange={(v) => setTweak('theme', v)}/>
        <TweakSection label="Navegação"/>
        <TweakRadio label="Tela" value={page}
                    options={['overview','clients','costs','training']}
                    onChange={setPage}/>
      </TweaksPanel>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<AdminApp/>);
