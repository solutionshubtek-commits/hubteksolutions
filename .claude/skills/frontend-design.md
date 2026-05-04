# SKILL: Frontend Design — Hubtek Solutions

## Propósito
Garantir que todo componente, tela e interação siga fielmente a identidade visual da Hubtek Solutions. Esta skill deve ser lida antes de qualquer criação ou edição de componente visual.

---

## 1. IDENTIDADE VISUAL OBRIGATÓRIA

### Cores — nunca usar valores fora desta lista
```css
/* Fundos */
--bg-primary: #000000;        /* Fundo principal de todas as páginas */
--bg-card: #0A0A0A;           /* Fundo de cards e painéis */
--bg-sidebar: #0A0A0A;        /* Fundo da barra lateral */

/* Bordas */
--border-default: #1F1F1F;    /* Borda padrão de cards */
--border-divider: #262626;    /* Linhas separadoras */

/* Textos */
--text-primary: #FFFFFF;      /* Texto principal */
--text-secondary: #A3A3A3;    /* Labels, descrições, metadados */

/* Destaque — verde Hubtek */
--accent: #10B981;            /* Botões CTA, badges ativos, ícones */
--accent-hover: #059669;      /* Estado hover de botões verdes */
--accent-soft: #34D399;       /* Badges sutis, destaques secundários */

/* Alertas */
--error: #EF4444;             /* Erros, banimentos, urgência */
--warning: #F59E0B;           /* Avisos, ciclos próximos do vencimento */
--success: #10B981;           /* Confirmações, status ativo */

/* Gradientes */
--gradient-cta: linear-gradient(135deg, #10B981 0%, #059669 100%);
--gradient-bg: radial-gradient(circle at top, #0A0A0A 0%, #000000 70%);
```

### Tipografia
```css
/* Fonte obrigatória em todo o projeto */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

/* Hierarquia */
/* H1: 36px / font-weight: 700 / letter-spacing: -0.02em */
/* H2: 28px / font-weight: 700 / letter-spacing: -0.02em */
/* H3: 22px / font-weight: 600 / letter-spacing: -0.01em */
/* H4: 18px / font-weight: 600 */
/* Body: 16px / font-weight: 400 */
/* Small: 14px / font-weight: 400 */
/* Caption: 12px / font-weight: 500 / letter-spacing: 0.02em */
```

### Bordas e espaçamentos
```css
/* Border radius */
--radius-btn: 8px;      /* Botões */
--radius-card: 12px;    /* Cards */
--radius-modal: 16px;   /* Modais e drawers */
--radius-badge: 6px;    /* Badges e tags */

/* Transições */
--transition: all 200ms ease;
```

---

## 2. COMPONENTES PADRÃO

### Card
```tsx
// ✅ CORRETO
<div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-6">
  {children}
</div>

// ❌ ERRADO — nunca usar bg-white, bg-gray, sombras pesadas
<div className="bg-white shadow-lg rounded-lg p-6">
```

### Botão primário (CTA)
```tsx
// ✅ CORRETO
<button className="bg-[#10B981] hover:bg-[#059669] text-white 
  font-semibold px-4 py-2 rounded-lg transition-all duration-200">
  Salvar configurações
</button>

// ❌ ERRADO — nunca azul, nunca roxo, nunca cinza como primário
<button className="bg-blue-500 hover:bg-blue-600">
```

### Botão secundário
```tsx
// ✅ CORRETO
<button className="border border-[#1F1F1F] text-[#A3A3A3] 
  hover:border-[#10B981] hover:text-white px-4 py-2 
  rounded-lg transition-all duration-200">
  Cancelar
</button>
```

### Badge de status
```tsx
// ✅ Ativo
<span className="bg-[#10B981]/10 text-[#10B981] text-xs 
  font-medium px-2 py-1 rounded-md">
  Ativo
</span>

// ✅ Pausado
<span className="bg-[#F59E0B]/10 text-[#F59E0B] text-xs 
  font-medium px-2 py-1 rounded-md">
  Pausado
</span>

// ✅ Desconectado / Bloqueado
<span className="bg-[#EF4444]/10 text-[#EF4444] text-xs 
  font-medium px-2 py-1 rounded-md">
  Bloqueado
</span>

// ✅ Encerrado
<span className="bg-[#A3A3A3]/10 text-[#A3A3A3] text-xs 
  font-medium px-2 py-1 rounded-md">
  Encerrado
</span>
```

### Input / Textarea
```tsx
// ✅ CORRETO
<input className="w-full bg-[#0A0A0A] border border-[#262626] 
  text-white placeholder-[#A3A3A3] rounded-lg px-4 py-3
  focus:outline-none focus:border-[#10B981] 
  transition-all duration-200" />
```

### Tabela
```tsx
// ✅ CORRETO
<table className="w-full">
  <thead>
    <tr className="border-b border-[#1F1F1F]">
      <th className="text-left text-[#A3A3A3] text-xs font-medium 
        uppercase tracking-wider py-3 px-4">
        Coluna
      </th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-[#1F1F1F] hover:bg-[#0A0A0A]/50 
      transition-colors duration-150">
      <td className="py-4 px-4 text-white text-sm">
        Valor
      </td>
    </tr>
  </tbody>
</table>
```

### Banner de alerta crítico (número banido)
```tsx
// ✅ CORRETO — alerta de banimento
<div className="bg-[#EF4444]/10 border border-[#EF4444]/30 
  rounded-xl p-4 flex items-center justify-between">
  <div className="flex items-center gap-3">
    <AlertTriangle className="text-[#EF4444] w-5 h-5" />
    <div>
      <p className="text-white font-semibold text-sm">
        Número bloqueado pelo WhatsApp
      </p>
      <p className="text-[#A3A3A3] text-xs">
        Seu número foi banido. Troque para retomar o atendimento.
      </p>
    </div>
  </div>
  <button className="bg-[#EF4444] hover:bg-[#DC2626] text-white 
    text-sm font-semibold px-4 py-2 rounded-lg 
    transition-all duration-200">
    Trocar número
  </button>
</div>
```

### KPI Card (cards de métricas)
```tsx
// ✅ CORRETO
<div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl p-6">
  <div className="flex items-start justify-between">
    <p className="text-[#A3A3A3] text-sm font-medium">
      Novas conversas hoje
    </p>
    <MessageSquare className="text-[#10B981] w-5 h-5" />
  </div>
  <p className="text-white text-4xl font-bold mt-3 
    tracking-tight">
    284
  </p>
  <p className="text-[#10B981] text-xs mt-2 flex items-center gap-1">
    <TrendingUp className="w-3 h-3" />
    +12% vs. semana anterior
  </p>
</div>
```

---

## 3. LAYOUT PADRÃO

### Sidebar
```tsx
// Largura fixa: 180px
// Fundo: #0A0A0A
// Borda direita: 1px solid #1F1F1F
// Item ativo: texto branco + borda esquerda 2px #10B981 + bg #10B981/5
// Item inativo: texto #A3A3A3, hover texto branco
```

### Header
```tsx
// Altura: 64px
// Fundo: #000000
// Borda inferior: 1px solid #1F1F1F
// Logo à esquerda, ações à direita
```

### Área de conteúdo
```tsx
// Padding: 32px
// Max-width: 1280px
// Background: #000000
```

---

## 4. ÍCONES

Usar **exclusivamente Lucide React**. Nunca Heroicons, FontAwesome ou emojis como ícones funcionais.

```tsx
import { MessageSquare, TrendingUp, AlertTriangle, 
  Settings, Users, BarChart2, Zap } from 'lucide-react'

// Tamanho padrão: w-5 h-5 (20px)
// Tamanho em KPI cards: w-5 h-5
// Tamanho em menu sidebar: w-4 h-4
// Stroke: padrão do Lucide (1.5)
```

---

## 5. ANTI-PADRÕES — nunca fazer isto

```
❌ Fundo branco ou claro em qualquer tela principal
❌ Botões azuis, roxos ou laranjas como ação primária
❌ Sombras pesadas (shadow-lg, shadow-xl) em cards
❌ Border radius maior que 16px
❌ Gradientes coloridos em backgrounds de página
❌ Texto escuro sobre fundo escuro (baixo contraste)
❌ Tabelas sem hover state nas linhas
❌ Formulários sem focus ring verde no input
❌ Ícones misturados de bibliotecas diferentes
❌ Fontes diferentes de Inter
❌ Animações longas (acima de 300ms)
❌ Modais sem overlay escuro (#000000 com 60% opacidade)
❌ Loading states sem skeleton ou spinner verde
❌ Mensagens de erro sem cor vermelha #EF4444
❌ Status "ativo" em qualquer cor que não seja #10B981
```

---

## 6. RESPONSIVIDADE

```
Mobile first. Breakpoints Tailwind padrão.
Sidebar: drawer em mobile, fixa em md+
Cards KPI: 1 coluna mobile, 2 em sm, 4 em lg
Tabelas: scroll horizontal em mobile
Padding de página: 16px mobile, 32px desktop
```
