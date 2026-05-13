'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Pause, Play, Send, Bot, User, Headphones } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Mensagem {
  id: string
  origem: string
  tipo: string
  conteudo: string
  criado_em: string
}

interface Conversa {
  id: string
  contato_nome: string
  contato_telefone: string
  status: string
  agente_pausado: boolean
  instance_name: string | null
  tenant_id: string
}

export default function ConversaDetalhePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [conversa, setConversa] = useState<Conversa | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [pausando, setPausando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [texto, setTexto] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()

      const { data: conv } = await supabase
        .from('conversations')
        .select('id, contato_nome, contato_telefone, status, agente_pausado, instance_name, tenant_id')
        .eq('id', params.id)
        .single()

      if (!conv) { router.push('/conversas'); return }
      setConversa(conv)

      const { data: msgs } = await supabase
        .from('messages')
        .select('id, origem, tipo, conteudo, criado_em')
        .eq('conversation_id', params.id)
        .order('criado_em', { ascending: true })

      setMensagens(msgs || [])
      setCarregando(false)
      setTimeout(scrollToBottom, 100)
    }
    carregar()
  }, [params.id, router, scrollToBottom])

  // Realtime — novas mensagens
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${params.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${params.id}`,
      }, (payload) => {
        const nova = payload.new as Mensagem
        setMensagens(prev => {
          if (prev.find(m => m.id === nova.id)) return prev
          return [...prev, nova]
        })
        setTimeout(scrollToBottom, 50)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [params.id, scrollToBottom])

  async function handlePausarRetomar() {
    if (!conversa) return
    setPausando(true)
    const supabase = createClient()
    const novoPausado = !conversa.agente_pausado
    await supabase.from('conversations').update({
      agente_pausado: novoPausado,
      pausado_em: novoPausado ? new Date().toISOString() : null,
    }).eq('id', conversa.id)
    setConversa(prev => prev ? { ...prev, agente_pausado: novoPausado } : prev)
    setPausando(false)
  }

  async function handleEnviar() {
    if (!texto.trim() || !conversa || enviando) return
    const msg = texto.trim()
    setTexto('')
    setEnviando(true)

    const res = await fetch('/api/whatsapp/enviar-mensagem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversa.id,
        tenant_id: conversa.tenant_id,
        instance_name: conversa.instance_name,
        telefone: conversa.contato_telefone,
        mensagem: msg,
      }),
    })

    setEnviando(false)
    if (!res.ok) setTexto(msg) // devolve o texto se falhar
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEnviar()
    }
  }

  function formatarHora(iso: string) {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  function iniciais(nome: string) {
    if (!nome) return '?'
    return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="w-6 h-6 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!conversa) return null

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]" style={{ background: 'var(--bg-base)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => router.push('/conversas')}
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
          style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
          {iniciais(conversa.contato_nome)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {conversa.contato_nome || conversa.contato_telefone}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{conversa.contato_telefone}</p>
        </div>

        {/* Status agente */}
        <div className="flex items-center gap-2">
          {conversa.agente_pausado ? (
            <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ background: '#F59E0B18', color: '#F59E0B', border: '1px solid #F59E0B30' }}>
              <Headphones size={11} /> Operador
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ background: '#10B98118', color: '#10B981', border: '1px solid #10B98130' }}>
              <Bot size={11} /> Agente IA
            </span>
          )}
          {conversa.status !== 'encerrada' && (
            <button onClick={handlePausarRetomar} disabled={pausando}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={conversa.agente_pausado
                ? { background: '#10B98118', color: '#10B981', border: '1px solid #10B98130' }
                : { background: '#F59E0B18', color: '#F59E0B', border: '1px solid #F59E0B30' }
              }>
              {conversa.agente_pausado ? <><Play size={11} /> Retomar IA</> : <><Pause size={11} /> Pausar IA</>}
            </button>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {mensagens.map((msg, i) => {
          const isCliente = msg.origem === 'cliente'
          const isAgente = msg.origem === 'agente'
          const isOperador = msg.origem === 'operador'
          const showDate = i === 0 || new Date(msg.criado_em).toDateString() !== new Date(mensagens[i - 1].criado_em).toDateString()

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-3">
                  <span className="text-[11px] px-3 py-1 rounded-full"
                    style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {new Date(msg.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                  </span>
                </div>
              )}
              <div className={`flex ${isCliente ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[75%] ${isCliente ? '' : 'items-end'} flex flex-col gap-0.5`}>
                  {/* Label origem */}
                  {isOperador && (
                    <span className="text-[10px] px-1" style={{ color: '#818CF8' }}>Você (operador)</span>
                  )}
                  <div className="px-3 py-2 rounded-2xl text-sm leading-relaxed"
                    style={isCliente
                      ? { background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderBottomLeftRadius: 4 }
                      : isOperador
                      ? { background: '#6366F118', color: 'var(--text-primary)', border: '1px solid #6366F130', borderBottomRightRadius: 4 }
                      : { background: '#10B98118', color: 'var(--text-primary)', border: '1px solid #10B98130', borderBottomRightRadius: 4 }
                    }>
                    {msg.conteudo}
                  </div>
                  <span className="text-[10px] px-1" style={{ color: 'var(--text-muted)' }}>
                    {formatarHora(msg.criado_em)}
                    {isAgente && ' · IA'}
                    {isOperador && ' · enviado'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 flex-shrink-0"
        style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}>
        {conversa.status === 'encerrada' ? (
          <p className="text-center text-sm py-2" style={{ color: 'var(--text-muted)' }}>Conversa encerrada</p>
        ) : (
          <div className="flex items-end gap-2">
            {!conversa.agente_pausado && (
              <p className="text-xs mb-2 flex-1 text-center" style={{ color: 'var(--text-muted)' }}>
                Pause o agente para responder manualmente
              </p>
            )}
            {conversa.agente_pausado && (
              <>
                <textarea
                  ref={inputRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite uma mensagem..."
                  rows={1}
                  className="flex-1 rounded-2xl px-4 py-2.5 text-sm focus:outline-none resize-none"
                  style={{
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    maxHeight: 120,
                    overflowY: 'auto',
                  }}
                />
                <button
                  onClick={handleEnviar}
                  disabled={!texto.trim() || enviando}
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-40"
                  style={{ background: '#10B981', color: '#fff' }}>
                  {enviando
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Send size={16} />
                  }
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}