// ============== Data ==============
const conversations = [
  { id: 1, name: 'Maria Ribeiro', initials: 'MR', phone: '+55 11 98342-1207', lastMsg: 'Pra SP capital o frete sai por R$ 18,90 — entrega em 2 dias úteis.', status: 'active', time: '14:32' },
  { id: 2, name: 'João Paulo Mendes', initials: 'JP', phone: '+55 11 99721-8845', lastMsg: 'Ok, posso pagar via Pix? Me passa a chave por favor', status: 'active', time: '14:28' },
  { id: 3, name: 'Clínica Vita Saúde', initials: 'CV', phone: '+55 21 98123-4567', lastMsg: 'Precisamos agendar retorno da Dra. Helena para próxima semana', status: 'paused', time: '14:12' },
  { id: 4, name: 'Bruno Lima', initials: 'BL', phone: '+55 11 97554-2210', lastMsg: 'Não entendi o valor do frete pra Belo Horizonte', status: 'active', time: '13:58' },
  { id: 5, name: 'Ana Souza', initials: 'AS', phone: '+55 11 99812-3456', lastMsg: 'Valeu! Chegou certinho, muito obrigada', status: 'closed', time: '13:40' },
  { id: 6, name: 'Carlos Eduardo Santos', initials: 'CE', phone: '+55 31 98877-1122', lastMsg: 'Quero falar com um humano por favor', status: 'paused', time: '13:22' },
  { id: 7, name: 'Patricia Gomes', initials: 'PG', phone: '+55 11 98456-7890', lastMsg: 'Confirmado o pedido #4821, obrigada!', status: 'closed', time: '12:58' },
];

// 30-day bar chart data — realistic shape with weekly cadence
const barData = [
  142, 168, 124, 187, 203, 89, 76,
  198, 224, 256, 241, 287, 134, 98,
  263, 298, 312, 289, 334, 167, 142,
  346, 378, 412, 398, 421, 198, 178,
  445, 482
];

// ============== Components ==============
const { useState } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showBanner": false,
  "agentState": "active",
  "theme": "dark",
  "denseTable": false
}/*EDITMODE-END*/;

const formatNumber = (n) => n.toLocaleString('pt-BR');

// ----- Header -----
const Header = ({ agentState, onToggleAgent, onOpenReconnect, theme, onToggleTheme }) => {
  const stateConfig = {
    active:       { cls: '',                label: 'Agente',   value: 'Ativo' },
    paused:       { cls: 'paused',          label: 'Agente',   value: 'Pausado' },
    disconnected: { cls: 'disconnected',    label: 'WhatsApp', value: 'Desconectado' },
  }[agentState];
  return (
    <header className="header">
      <div className="header-logo">
        <img src="assets/logo-horizontal.png" alt="HUBTEK SOLUTIONS"/>
      </div>
      <div className="header-divider"/>
      <div className="header-company">
        <div className="company-mark">PV</div>
        <div className="company-info">
          <div className="company-label">Workspace</div>
          <div className="company-name">Pizzaria Vesúvio · Tatuapé</div>
        </div>
      </div>

      <div className="header-spacer"/>

      <button
        className={`agent-status ${stateConfig.cls}`}
        onClick={agentState === 'disconnected' ? onOpenReconnect : onToggleAgent}>
        <div className="pulse-wrap">
          <div className="pulse-ring"/>
          <div className="pulse-dot"/>
        </div>
        <span className="label">{stateConfig.label}</span>
        <span className="value">{stateConfig.value}</span>
      </button>

      <button className="header-icon-btn theme-btn" title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} onClick={onToggleTheme}>
        {theme === 'dark' ? <window.Icons.Sun/> : <window.Icons.Moon/>}
      </button>

      <button className="header-icon-btn" title="Notificações">
        <window.Icons.Bell/>
        <span className="notif-dot"/>
      </button>

      <div className="user-avatar" title="Robson Oliveira">RO</div>
    </header>
  );
};

// ----- Sidebar -----
const Sidebar = ({ active, onChange, agentState }) => {
  const items = [
    { id: 'overview',   label: 'Visão Geral',         icon: 'LayoutDashboard' },
    { id: 'conversas',  label: 'Conversas',           icon: 'MessageCircle', badge: 7 },
    { id: 'historico',  label: 'Histórico',           icon: 'History' },
    { id: 'reconectar', label: 'Reconexão WhatsApp',  icon: 'Smartphone',
      badgeDanger: agentState === 'disconnected' ? '!' : null },
    { id: 'config',     label: 'Configurações',       icon: 'Settings' },
  ];
  return (
    <aside className="sidebar">
      <div className="sb-section-label">Menu</div>
      {items.map(it => {
        const I = window.Icons[it.icon];
        return (
          <button key={it.id}
                  className={`sb-item ${active === it.id ? 'selected' : ''}`}
                  onClick={() => onChange(it.id)}>
            <I/>
            <span>{it.label}</span>
            {it.badge ? <span className="sb-badge">{it.badge}</span> : null}
            {it.badgeDanger ? <span className="sb-badge danger">{it.badgeDanger}</span> : null}
          </button>
        );
      })}

      <div className="sb-footer">
        <div className="sb-help-card">
          <div className="title">Precisa de ajuda?</div>
          <div className="body">Fale com nosso time. Respondemos em minutos no próprio WhatsApp.</div>
          <a className="link" href="#">Abrir suporte <window.Icons.ArrowRight/></a>
        </div>
      </div>
    </aside>
  );
};

// ----- KPI card -----
const KpiCard = ({ label, value, delta, deltaDir, icon, alt }) => {
  const I = window.Icons[icon];
  return (
    <div className={`kpi-card ${alt ? 'alt' : ''}`}>
      <div className="top-row">
        <div className="label">{label}</div>
        <div className="icon-box"><I/></div>
      </div>
      <div className="value">{value}</div>
      <div className={`delta ${deltaDir === 'down' ? 'down' : ''}`}>
        {deltaDir === 'down' ? <window.Icons.ArrowDown/> : <window.Icons.ArrowUp/>}
        <span>{delta}</span>
        <span className="vs">vs. semana anterior</span>
      </div>
    </div>
  );
};

// ----- Bar chart -----
const BarChart = ({ data }) => {
  const max = Math.max(...data);
  const total = data.reduce((a,b) => a+b, 0);
  const avg = Math.round(total / data.length);
  const peak = max;

  // Day labels for hover
  const today = new Date();
  const labels = data.map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (data.length - 1 - i));
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  });

  return (
    <div className="chart-wrap">
      <div className="chart-stats">
        <div className="chart-stat">
          <div className="label">Total no período</div>
          <div className="value accent">{formatNumber(total)}</div>
        </div>
        <div className="chart-stat">
          <div className="label">Média diária</div>
          <div className="value">{formatNumber(avg)}</div>
        </div>
        <div className="chart-stat">
          <div className="label">Pico</div>
          <div className="value">{formatNumber(peak)}</div>
        </div>
      </div>
      <div className="bar-chart">
        {data.map((v, i) => {
          const heightPct = (v / max) * 100;
          // Vary opacity for visual rhythm — newer bars more vivid
          const opacity = 0.35 + (0.65 * (i / data.length));
          const showLabel = i % 5 === 0 || i === data.length - 1;
          return (
            <div className="bar-col" key={i}>
              <div className="bar-tooltip">
                <span className="num">{formatNumber(v)} conversas</span>
                <span className="day">{labels[i]}</span>
              </div>
              <div className="bar-track">
                <div className="bar" style={{
                  height: `${heightPct}%`,
                  opacity: opacity
                }}/>
              </div>
              <div className="bar-label">{showLabel ? labels[i].split(' ')[0] : ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ----- Status badge -----
const StatusBadge = ({ status }) => {
  const map = {
    active: { cls: 'active', label: 'Ativo' },
    paused: { cls: 'paused', label: 'Pausado' },
    closed: { cls: 'closed', label: 'Encerrado' },
  };
  const cfg = map[status];
  return <span className={`status-badge ${cfg.cls}`}><span className="dot"/>{cfg.label}</span>;
};

// ----- Conversation table -----
const ConversationTable = ({ rows, onToggleRow }) => (
  <table className="tbl">
    <thead>
      <tr>
        <th style={{width: '24%'}}>Contato</th>
        <th style={{width: '16%'}}>Telefone</th>
        <th>Última mensagem</th>
        <th style={{width: '12%'}}>Status</th>
        <th style={{width: '10%'}}>Hora</th>
        <th style={{width: '14%'}}>Ações</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(r => (
        <tr key={r.id}>
          <td className="contact">
            <div className="avatar">{r.initials}</div>
            <span>{r.name}</span>
          </td>
          <td className="phone">{r.phone}</td>
          <td className="last-msg">{r.lastMsg}</td>
          <td><StatusBadge status={r.status}/></td>
          <td className="phone">{r.time}</td>
          <td>
            {r.status === 'closed' ? (
              <span style={{font:'400 12px/1 var(--font-sans)', color:'var(--fg3)'}}>—</span>
            ) : r.status === 'paused' ? (
              <button className="row-action resume" onClick={() => onToggleRow(r.id)}>
                <window.Icons.Play/> Retomar
              </button>
            ) : (
              <button className="row-action pause" onClick={() => onToggleRow(r.id)}>
                <window.Icons.Pause/> Pausar
              </button>
            )}
            <button className="row-more" title="Mais"><window.Icons.MoreVertical/></button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

// ----- Activity feed (small side card) -----
const ActivityFeed = () => {
  const items = [
    { dot: 'green',  title: <span><b>Maria Ribeiro</b> teve a conversa fechada com sucesso.</span>, time: 'há 2 min' },
    { dot: 'yellow', title: <span><b>Carlos E.</b> solicitou atendimento humano.</span>, time: 'há 8 min' },
    { dot: 'green',  title: <span>Pico de <b>34 conversas</b> simultâneas registrado.</span>, time: 'há 23 min' },
    { dot: 'gray',   title: <span>Automação <b>"Boas-vindas"</b> respondeu 142 vezes hoje.</span>, time: 'há 1 h' },
    { dot: 'green',  title: <span><b>Pizzaria Vesúvio</b> WhatsApp reconectado.</span>, time: 'há 3 h' },
  ];
  return (
    <div className="activity">
      {items.map((it, i) => (
        <div className="activity-item" key={i}>
          <div className={`activity-dot ${it.dot}`}/>
          <div className="activity-content">
            <div className="activity-title">{it.title}</div>
            <div className="activity-time">{it.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ----- Reconnect QR Modal -----
const ReconnectModal = ({ onClose, onReconnect }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-head">
        <div>
          <div className="modal-title">Reconectar WhatsApp</div>
        </div>
        <button className="header-icon-btn" onClick={onClose}><window.Icons.X/></button>
      </div>
      <div className="modal-sub">
        Escaneie o QR code abaixo para vincular sua conta. A conexão fica ativa enquanto seu telefone estiver online.
      </div>
      <div className="qr-frame"><QRPlaceholder/></div>
      <div className="qr-steps">
        <div className="qr-step"><div className="num">1</div><div className="text">Abra o <b>WhatsApp</b> no seu telefone.</div></div>
        <div className="qr-step"><div className="num">2</div><div className="text">Toque em <b>Mais opções</b> → <b>Aparelhos conectados</b>.</div></div>
        <div className="qr-step"><div className="num">3</div><div className="text">Toque em <b>Conectar um aparelho</b> e aponte para a tela.</div></div>
      </div>
      <div style={{display:'flex', gap:8}}>
        <button className="btn btn-primary" style={{flex:1, justifyContent:'center'}} onClick={onReconnect}>
          <window.Icons.CheckCircle/> Já escaneei
        </button>
        <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
      </div>
    </div>
  </div>
);

// Stylized fake QR — looks legit, doesn't actually scan
const QRPlaceholder = () => {
  // Build a 25×25 deterministic-ish grid
  const size = 25;
  const cells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Position markers (3 corners)
      const inMarker = (cx, cy) =>
        x >= cx && x < cx + 7 && y >= cy && y < cy + 7;
      const isMarker = inMarker(0,0) || inMarker(size-7, 0) || inMarker(0, size-7);
      let fill = false;
      if (isMarker) {
        const inner = (cx, cy) => x >= cx+1 && x < cx+6 && y >= cy+1 && y < cy+6;
        const dot = (cx, cy) => x >= cx+2 && x < cx+5 && y >= cy+2 && y < cy+5;
        const top = inMarker(0,0), tr = inMarker(size-7,0), bl = inMarker(0,size-7);
        const cx = top ? 0 : tr ? size-7 : 0;
        const cy = top ? 0 : tr ? 0 : size-7;
        fill = !inner(cx,cy) || dot(cx,cy);
      } else {
        // Pseudo-random pattern
        fill = ((x * 73 + y * 137 + x*y*3) % 7) < 3;
      }
      if (fill) cells.push({x, y});
    }
  }
  const px = 8;
  return (
    <svg width={size*px} height={size*px} viewBox={`0 0 ${size*px} ${size*px}`}>
      <rect width="100%" height="100%" fill="#fff"/>
      {cells.map((c, i) =>
        <rect key={i} x={c.x*px} y={c.y*px} width={px} height={px} fill="#000"/>
      )}
      {/* Center logo plate */}
      <rect x={size*px/2 - 22} y={size*px/2 - 22} width="44" height="44" rx="8" fill="#10B981"/>
      <text x={size*px/2} y={size*px/2 + 4} fontSize="14" fontWeight="700"
            fontFamily="Inter, sans-serif" fill="#fff" textAnchor="middle">H</text>
    </svg>
  );
};

// ----- Disconnected banner -----
const DisconnectedBanner = ({ onReconnect, onDismiss }) => (
  <div className="banner">
    <div className="banner-icon"><window.Icons.WifiOff/></div>
    <div className="banner-content">
      <div className="banner-title">WhatsApp desconectado · O agente não está respondendo</div>
      <div className="banner-sub">Última sincronização há 14 minutos. Reconecte para retomar o atendimento automático.</div>
    </div>
    <button className="btn btn-danger" onClick={onReconnect}>
      <window.Icons.RefreshCw/> Reconectar agora
    </button>
    <button className="header-icon-btn" onClick={onDismiss} style={{marginLeft:0}}>
      <window.Icons.X/>
    </button>
  </div>
);

// ----- Page: Visão Geral -----
const Overview = ({ rows, onToggleRow, agentState }) => {
  const [range, setRange] = useState('30d');
  const ranges = [['7d','7 dias'],['30d','30 dias'],['90d','90 dias']];
  const dataLen = range === '7d' ? 7 : range === '90d' ? 30 : 30;
  const chartData = barData.slice(-dataLen);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="greet">Bom dia, Robson</div>
          <div className="title">Visão Geral</div>
          <div className="sub">Como seu agente de atendimento performou {range === '7d' ? 'nos últimos 7 dias' : range === '90d' ? 'nos últimos 90 dias' : 'nos últimos 30 dias'}.</div>
        </div>
        <div className="range-tabs">
          {ranges.map(([k,l]) => (
            <button key={k}
                    className={range === k ? 'active' : ''}
                    onClick={() => setRange(k)}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="kpi-grid">
        <KpiCard label="Novas conversas hoje"        value="284"   delta="+12%"    deltaDir="up"   icon="Inbox"/>
        <KpiCard label="Conversas na semana"          value="1.847" delta="+8,3%"   deltaDir="up"   icon="CalendarRange"/>
        <KpiCard label="Conversas no mês"             value="6.412" delta="+24%"    deltaDir="up"   icon="TrendingUp"/>
        <KpiCard label="Pausadas (atendimento humano)" value="23"   delta="−3"      deltaDir="down" icon="PauseCircle" alt/>
      </div>

      {/* Chart + activity */}
      <div className="row-2">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Volume de conversas — últimos 30 dias</div>
              <div className="card-sub">Total agregado por dia, incluindo automatizadas e humanas.</div>
            </div>
            <div className="card-actions">
              <button className="filter-select">Todas as fontes <window.Icons.ChevronDown/></button>
              <button className="btn btn-ghost" style={{padding:'7px 10px'}}>
                <window.Icons.Download/>
              </button>
            </div>
          </div>
          <BarChart data={chartData}/>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Atividade recente</div>
              <div className="card-sub">Eventos do agente em tempo real.</div>
            </div>
          </div>
          <ActivityFeed/>
        </div>
      </div>

      {/* Conversations table */}
      <div className="card table-card">
        <div className="card-head">
          <div>
            <div className="card-title">Conversas recentes</div>
            <div className="card-sub">7 conversas das últimas 2 horas. Pause o agente em qualquer linha para assumir o controle.</div>
          </div>
          <div className="card-actions">
            <button className="filter-select"><window.Icons.Filter/> Filtrar</button>
            <button className="btn btn-secondary"><window.Icons.Download/> Exportar</button>
          </div>
        </div>
        <ConversationTable rows={rows} onToggleRow={onToggleRow}/>
      </div>
    </>
  );
};

// ----- Empty placeholder for other pages -----
const Placeholder = ({ icon, title, sub }) => {
  const I = window.Icons[icon];
  return (
    <div className="empty">
      <div className="empty-icon"><I/></div>
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{sub}</div>
    </div>
  );
};

// ============== App ==============
const App = () => {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = useState('overview');
  const [rows, setRows] = useState(conversations);
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);

  const agentState = t.agentState;
  const theme = t.theme || 'dark';

  // Apply theme to <html> for CSS attribute selectors
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTweak('theme', theme === 'dark' ? 'light' : 'dark');

  const toggleAgent = () => {
    if (agentState === 'active') setTweak('agentState', 'paused');
    else if (agentState === 'paused') setTweak('agentState', 'active');
  };
  const toggleRow = (id) => {
    setRows(rs => rs.map(r => r.id === id
      ? { ...r, status: r.status === 'active' ? 'paused' : 'active' }
      : r));
  };
  const handleReconnect = () => {
    setTweak('agentState', 'active');
    setReconnectOpen(false);
    setBannerVisible(false);
  };

  const showBanner = (agentState === 'disconnected' || t.showBanner) && bannerVisible;

  const pageLabels = {
    overview:   ['01 Visão Geral'],
    conversas:  ['02 Conversas'],
    historico:  ['03 Histórico'],
    reconectar: ['04 Reconexão'],
    config:     ['05 Configurações'],
  };

  return (
    <div className="app" data-screen-label={pageLabels[page][0]}>
      <Header
        agentState={agentState}
        onToggleAgent={toggleAgent}
        onOpenReconnect={() => setReconnectOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <Sidebar active={page} onChange={setPage} agentState={agentState}/>
      <main className="main">
        {showBanner && (
          <DisconnectedBanner
            onReconnect={() => setReconnectOpen(true)}
            onDismiss={() => setBannerVisible(false)}
          />
        )}

        {page === 'overview' && (
          <Overview rows={rows} onToggleRow={toggleRow} agentState={agentState}/>
        )}
        {page === 'conversas' && (
          <Placeholder icon="MessageCircle" title="Inbox unificado"
            sub="Veja todas as conversas em andamento, atribua atendentes e responda direto pelo painel."/>
        )}
        {page === 'historico' && (
          <Placeholder icon="History" title="Histórico de conversas"
            sub="Pesquise e exporte conversas encerradas dos últimos 12 meses."/>
        )}
        {page === 'reconectar' && (
          <Placeholder icon="Smartphone" title="Reconexão WhatsApp"
            sub="Vincule, desvincule e gerencie os dispositivos conectados ao seu agente."/>
        )}
        {page === 'config' && (
          <Placeholder icon="Settings" title="Configurações"
            sub="Personalize prompts, horários, respostas automáticas e integrações."/>
        )}
      </main>

      {reconnectOpen && (
        <ReconnectModal
          onClose={() => setReconnectOpen(false)}
          onReconnect={handleReconnect}
        />
      )}

      <TweaksPanel>
        <TweakSection label="Tema"/>
        <TweakRadio label="Aparência" value={theme}
                    options={['dark','light']}
                    onChange={(v) => setTweak('theme', v)}/>
        <TweakSection label="Estado do agente"/>
        <TweakRadio label="Status" value={t.agentState}
                    options={['active','paused','disconnected']}
                    onChange={(v) => { setTweak('agentState', v); if (v === 'disconnected') setBannerVisible(true); }}/>
        <TweakToggle label="Mostrar banner de desconexão" value={t.showBanner}
                     onChange={(v) => { setTweak('showBanner', v); setBannerVisible(true); }}/>
        <TweakButton label="Abrir QR de reconexão"
                     onClick={() => setReconnectOpen(true)}/>
      </TweaksPanel>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
