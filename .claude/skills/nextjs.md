# SKILL: Next.js — Hubtek Solutions

## Propósito
Padrões obrigatórios de estrutura, TypeScript e organização para todo o desenvolvimento Next.js deste projeto.

---

## 1. ESTRUTURA DE PASTAS

```
hubtek-solutions/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Layout com sidebar do cliente
│   │   ├── visao-geral/
│   │   │   └── page.tsx
│   │   ├── conversas/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── historico/
│   │   │   └── page.tsx
│   │   ├── reconexao-whatsapp/
│   │   │   └── page.tsx
│   │   └── configuracoes/
│   │       └── page.tsx
│   ├── (admin)/
│   │   ├── layout.tsx              # Layout com sidebar do admin
│   │   ├── admin/
│   │   │   ├── visao-geral/
│   │   │   │   └── page.tsx
│   │   │   ├── clientes/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── custos-ia/
│   │   │   │   └── page.tsx
│   │   │   ├── treinamento/
│   │   │   │   └── page.tsx
│   │   │   └── relatorios/
│   │   │       └── page.tsx
│   └── api/
│       ├── webhook/
│       │   └── evolution/
│       │       └── route.ts        # Recebe mensagens WhatsApp
│       ├── agent/
│       │   ├── process/
│       │   │   └── route.ts        # Processa mensagem e gera resposta
│       │   └── pause/
│       │       └── route.ts        # Pausa/retoma agente por conversa
│       ├── knowledge/
│       │   ├── upload/
│       │   │   └── route.ts        # Upload de documentos
│       │   └── search/
│       │       └── route.ts        # Busca semântica
│       ├── conversations/
│       │   └── route.ts
│       ├── tenants/
│       │   └── route.ts
│       └── billing/
│           └── close-cycle/
│               └── route.ts
├── components/
│   ├── ui/                         # Componentes shadcn/ui
│   ├── dashboard/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── KpiCard.tsx
│   │   ├── ConversationTable.tsx
│   │   ├── ChatViewer.tsx
│   │   ├── WhatsAppBanner.tsx      # Banner de número banido
│   │   └── AgentToggle.tsx
│   ├── admin/
│   │   ├── AdminSidebar.tsx
│   │   ├── TenantTable.tsx
│   │   ├── CostChart.tsx
│   │   ├── AgentTraining.tsx
│   │   └── BillingCycleCard.tsx
│   └── shared/
│       ├── StatusBadge.tsx
│       ├── LoadingSpinner.tsx
│       └── EmptyState.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # Browser client
│   │   ├── server.ts               # Server client
│   │   └── queries/
│   │       ├── conversations.ts
│   │       ├── tenants.ts
│   │       └── ai-usage.ts
│   ├── ai/
│   │   ├── openai.ts               # Cliente OpenAI + Whisper
│   │   ├── anthropic.ts            # Cliente Anthropic (backup)
│   │   ├── process-message.ts      # Lógica principal do agente
│   │   └── embeddings.ts           # Geração de embeddings
│   ├── evolution/
│   │   ├── client.ts               # Cliente Evolution API
│   │   └── webhook.ts              # Parser de webhooks
│   ├── google-calendar/
│   │   └── client.ts
│   ├── resend/
│   │   └── client.ts
│   └── utils/
│       ├── tokens.ts               # Cálculo de custo de tokens
│       ├── date.ts                 # Helpers de data em pt-BR
│       └── validators.ts
├── hooks/
│   ├── useConversations.ts
│   ├── useAgent.ts
│   └── useTenant.ts
├── types/
│   └── index.ts                    # Todos os tipos TypeScript
├── middleware.ts                   # Proteção de rotas por role
├── .env.local                      # Chaves de API (nunca commitar)
├── .env.example                    # Template sem valores reais
└── .gitignore                      # .env.local obrigatório aqui
```

---

## 2. TIPOS TYPESCRIPT GLOBAIS

```typescript
// types/index.ts — fonte única de verdade para todos os tipos

export type UserRole = 
  | 'admin_hubtek' 
  | 'admin_tenant' 
  | 'operador' 
  | 'self_managed'

export type AgentStatus = 'ativo' | 'pausado' | 'inativo'

export type WhatsAppStatus = 
  | 'conectado' 
  | 'desconectado' 
  | 'banido' 
  | 'bloqueado'

export type ConversationStatus = 'ativo' | 'pausado' | 'encerrado'

export type MessageType = 'texto' | 'audio' | 'imagem' | 'video' | 'documento'

export type AIMotor = 'openai' | 'anthropic'

export interface Tenant {
  id: string
  nome: string
  slug: string
  whatsapp_number: string | null
  whatsapp_status: WhatsAppStatus
  status: string
  self_managed: boolean
  acesso_expira_em: string | null
  criado_em: string
}

export interface User {
  id: string
  tenant_id: string | null
  email: string
  nome: string | null
  role: UserRole
  ativo: boolean
}

export interface Conversation {
  id: string
  tenant_id: string
  contato_nome: string | null
  contato_telefone: string
  status: ConversationStatus
  agente_pausado: boolean
  criado_em: string
  ultima_mensagem_em: string
}

export interface Message {
  id: string
  conversation_id: string
  tenant_id: string
  origem: 'agente' | 'cliente'
  tipo: MessageType
  conteudo: string | null
  arquivo_url: string | null
  transcricao: string | null
  criado_em: string
}

export interface AgentConfig {
  id: string
  tenant_id: string
  prompt_principal: string | null
  motor_ia_principal: AIMotor
  motor_ia_backup: AIMotor
  ativo: boolean
  horario_inicio: string
  horario_fim: string
  dias_funcionamento: string[]
  mensagem_ausencia: string
}

export interface AIUsageSummary {
  tenant_id: string
  ciclo_mes: number
  ciclo_ano: number
  total_tokens: number
  custo_total_reais: number
  total_conversas: number
}
```

---

## 3. MIDDLEWARE DE PROTEÇÃO DE ROTAS

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rotas públicas
  if (pathname.startsWith('/login')) {
    return NextResponse.next()
  }

  // Verificar sessão
  const supabase = createServerClient(...)
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Rotas admin: apenas admin_hubtek
  if (pathname.startsWith('/admin')) {
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (user?.role !== 'admin_hubtek') {
      return NextResponse.redirect(new URL('/visao-geral', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
}
```

---

## 4. PADRÃO DE API ROUTE

```typescript
// app/api/conversations/route.ts
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient(...)

    // 1. Verificar autenticação
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json(
        { error: 'Não autorizado' }, 
        { status: 401 }
      )
    }

    // 2. Buscar dados com RLS ativo (tenant_id filtrado automaticamente)
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('ultima_mensagem_em', { ascending: false })

    if (error) throw error

    return NextResponse.json({ data })

  } catch (error) {
    console.error('[GET /api/conversations]', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
```

---

## 5. PADRÃO DE COMPONENTE

```typescript
// components/dashboard/KpiCard.tsx
import { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  titulo: string
  valor: string | number
  variacao?: number
  icone: LucideIcon
  corVariacao?: 'positiva' | 'negativa' | 'neutra'
}

export function KpiCard({ 
  titulo, 
  valor, 
  variacao, 
  icone: Icone,
  corVariacao = 'positiva'
}: KpiCardProps) {
  return (
    <div className="bg-[#0A0A0A] border border-[#1F1F1F] 
      rounded-xl p-6">
      <div className="flex items-start justify-between">
        <p className="text-[#A3A3A3] text-sm font-medium">
          {titulo}
        </p>
        <Icone className="text-[#10B981] w-5 h-5" />
      </div>
      <p className="text-white text-4xl font-bold mt-3 tracking-tight">
        {valor}
      </p>
      {variacao !== undefined && (
        <p className={`text-xs mt-2 ${
          corVariacao === 'positiva' 
            ? 'text-[#10B981]' 
            : 'text-[#EF4444]'
        }`}>
          {variacao > 0 ? '+' : ''}{variacao}% vs. semana anterior
        </p>
      )}
    </div>
  )
}
```

---

## 6. VARIÁVEIS DE AMBIENTE

```bash
# .env.local — nunca commitar este arquivo

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# Anthropic (backup)
ANTHROPIC_API_KEY=

# Evolution API
EVOLUTION_API_URL=
EVOLUTION_API_KEY=

# Google Calendar
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=

# Resend
RESEND_API_KEY=

# Next Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

---

## 7. REGRAS GERAIS

```
✅ Todos os componentes em TypeScript com Props tipadas
✅ Todos os erros de API logados com prefixo [ROTA]
✅ Comentários em português no código
✅ Nomes de arquivos em kebab-case
✅ Nomes de componentes em PascalCase
✅ Nomes de funções e variáveis em camelCase
✅ Commits em português e descritivos
✅ .env.local no .gitignore — verificar antes de todo commit
✅ Loading state em todo fetch de dados
✅ Empty state em toda lista que pode estar vazia
❌ Nunca usar any no TypeScript
❌ Nunca console.log em produção — usar apenas console.error
❌ Nunca chamar API do Supabase diretamente no client-side
   para operações sensíveis — usar API Routes
❌ Nunca commitar chaves de API
```
