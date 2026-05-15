'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Pause, Play, Send, Bot, Headphones, Paperclip, X, Mic, Square } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Mensagem {
  id: string
  origem: string
  tipo: string
  conteudo: string
  arquivo_url: string | null
  criado_em: string
  from_me: boolean | null
  sent_by_user_id: string | null
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
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [arquivoPreview, setArquivoPreview] = useState<string | null>(null)
  const [uploadando, setUploadando] = useState(false)

  const [operadoresNome, setOperadoresNome] = useState<Record<string, string>>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserNome, setCurrentUserNome] = useState<string | null>(null)

  const [gravando, setGravando] = useState(false)
  const [tempoGravacao, setTempoGravacao] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior })
  }, [])

  const resolverNomesOperadores = useCallback(async (msgs: Mensagem[]) => {
    const supabase = createClient()
    const idsNovos = Array.from(new Set(
      msgs
        .filter(m => m.sent_by_user_id && !operadoresNome[m.sent_by_user_id])
        .map(m => m.sent_by_user_id as string)
    ))
    if (idsNovos.length === 0) return
    const { data } = await supabase.from('users').select('id, nome').in('id', idsNovos)
    if (data) {
      setOperadoresNome(prev => {
        const next = { ...prev }
        data.forEach(u => { next[u.id] = u.nome ?? 'Operador' })
        return next
      })
    }
  }, [operadoresNome])

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
        const { data: ud } = await supabase.from('users').select('nome').eq('id', user.id).single()
        setCurrentUserNome(ud?.nome ?? null)
      }
      const { data: conv } = await supabase
        .from('conversations')
        .select('id, contato_nome, contato_telefone, status, agente_pausado, instance_name, tenant_id')
        .eq('id', params.id)
        .single()
      if (!conv) { router.push('/conversas'); return }
      setConversa(conv)
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, origem, tipo, conteudo, arquivo_url, criado_em, from_me, sent_by_user_id')
        .eq('conversation_id', params.id)
        .order('criado_em', { ascending: true })
      const lista = msgs || []
      setMensagens(lista)
      setCarregando(false)
      setTimeout(() => scrollToBottom('auto'), 100)
      await resolverNomesOperadores(lista)
    }
    carregar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, router, scrollToBottom])

  useEffect(() => {
    const supabase = createClient()
    let msgChannel: ReturnType<typeof supabase.channel>
    let convChannel: ReturnType<typeof supabase.channel>

    function subscribe() {
      msgChannel = supabase
        .channel(`conv-messages-${params.id}-${Date.now()}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${params.id}`,
        }, async (payload) => {
          const nova = payload.new as Mensagem
          setMensagens(prev => {
            if (prev.find(m => m.id === nova.id)) return prev
            return [...prev, nova]
          })
          setTimeout(() => scrollToBottom('smooth'), 50)
          await resolverNomesOperadores([nova])
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') setTimeout(subscribe, 3000)
        })

      convChannel = supabase
        .channel(`conv-status-${params.id}-${Date.now()}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${params.id}`,
        }, (payload) => {
          setConversa(prev => prev ? { ...prev, ...payload.new } : prev)
        })
        .subscribe()
    }

    subscribe()

    const polling = setInterval(async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, origem, tipo, conteudo, arquivo_url, criado_em, from_me, sent_by_user_id')
        .eq('conversation_id', params.id)
        .order('criado_em', { ascending: true })
      if (data) {
        setMensagens(prev => {
          const idsExistentes = new Set(prev.map(m => m.id))
          const novas = data.filter((m: Mensagem) => !idsExistentes.has(m.id))
          if (novas.length === 0) return prev
          setTimeout(() => scrollToBottom('smooth'), 50)
          resolverNomesOperadores(novas)
          return [...prev, ...novas]
        })
      }
    }, 3000)

    return () => {
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(convChannel)
      clearInterval(polling)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, scrollToBottom])

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function labelOperador(msg: Mensagem): string {
    if (msg.sent_by_user_id) {
      const nome = operadoresNome[msg.sent_by_user_id]
      if (nome) {
        if (msg.sent_by_user_id === currentUserId) return 'Você (operador)'
        return `${nome} (operador)`
      }
    }
    return 'Você (operador)'
  }

  async function handlePausarRetomar() {
    if (!conversa) return
    setPausando(true)
    const supabase = createClient()
    const novoPausado = !conversa.agente_pausado

    // Se conversa encerrada, reabre ao pausar/retomar
    if (conversa.status === 'encerrada' || conversa.status === 'encerrado') {
      await supabase.from('conversations').update({
        status: 'ativa',
        agente_pausado: novoPausado,
        pausado_em: novoPausado ? new Date().toISOString() : null,
      }).eq('id', conversa.id)
      setConversa(prev => prev ? { ...prev, status: 'ativa', agente_pausado: novoPausado } : prev)
    } else {
      await supabase.from('conversations').update({
        agente_pausado: novoPausado,
        pausado_em: novoPausado ? new Date().toISOString() : null,
      }).eq('id', conversa.id)
      setConversa(prev => prev ? { ...prev, agente_pausado: novoPausado } : prev)
    }

    await fetch('/api/conversas/registrar-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversa.id,
        tenant_id: conversa.tenant_id,
        acao: novoPausado ? 'pausou_ia' : 'retomou_ia',
        contato_nome: conversa.contato_nome || conversa.contato_telefone,
        operador_nome: currentUserNome,
      }),
    })

    setPausando(false)
    if (novoPausado) setTimeout(() => inputRef.current?.focus(), 100)
  }

  function selecionarArquivo(file: File) {
    setArquivo(file)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setArquivoPreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setArquivoPreview(null)
    }
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  function limparArquivo() {
    setArquivo(null)
    setArquivoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) selecionarArquivo(file)
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const named = new File([file], `imagem_${Date.now()}.png`, { type: file.type })
          selecionarArquivo(named)
        }
        break
      }
    }
  }

  async function iniciarGravacao() {
    if (arquivo) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const file = new File([blob], `audio_${Date.now()}.ogg`, { type: mimeType })
        selecionarArquivo(file)
        setGravando(false)
        setTempoGravacao(0)
        if (timerRef.current) clearInterval(timerRef.current)
      }
      recorder.start(100)
      mediaRecorderRef.current = recorder
      setGravando(true)
      setTempoGravacao(0)
      timerRef.current = setInterval(() => setTempoGravacao(prev => prev + 1), 1000)
    } catch {
      alert('Não foi possível acessar o microfone.')
    }
  }

  function pararGravacao() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) clearInterval(timerRef.current)
  }

  function cancelarGravacao() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop())
    }
    if (timerRef.current) clearInterval(timerRef.current)
    chunksRef.current = []
    setGravando(false)
    setTempoGravacao(0)
  }

  function formatarTempoGravacao(segundos: number) {
    const m = Math.floor(segundos / 60).toString().padStart(2, '0')
    const s = (segundos % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  async function getAuthHeader(): Promise<Record<string, string>> {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) return { 'Authorization': `Bearer ${session.access_token}` }
    return {}
  }

  async function enviarMensagemTexto(msg: string) {
    if (!conversa) return
    const authHeaders = await getAuthHeader()
    await fetch('/api/whatsapp/enviar-mensagem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        conversation_id: conversa.id,
        tenant_id: conversa.tenant_id,
        instance_name: conversa.instance_name,
        telefone: conversa.contato_telefone,
        mensagem: msg,
      }),
    })
  }

  async function handleEnviar() {
    if (enviando || uploadando || !conversa) return
    const temTexto = texto.trim().length > 0
    const temArquivo = !!arquivo
    if (!temTexto && !temArquivo) return
    setEnviando(true)
    try {
      const authHeaders = await getAuthHeader()
      if (temTexto && !temArquivo) {
        const msg = texto.trim()
        setTexto('')
        const res = await fetch('/api/whatsapp/enviar-mensagem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            conversation_id: conversa.id,
            tenant_id: conversa.tenant_id,
            instance_name: conversa.instance_name,
            telefone: conversa.contato_telefone,
            mensagem: msg,
          }),
        })
        if (!res.ok) setTexto(msg)
        // Se conversa foi reaberta, atualiza estado local
        if (res.ok) {
          const json = await res.json()
          if (json.reaberta) setConversa(prev => prev ? { ...prev, status: 'ativa', agente_pausado: false } : prev)
        }
      }
      if (temArquivo) {
        setUploadando(true)
        const caption = temTexto ? texto.trim() : ''
        setTexto('')
        const supabase = createClient()
        const ext = arquivo!.name.split('.').pop() ?? 'bin'
        const safeName = `${Date.now()}.${ext}`
        const path = `${conversa.tenant_id}/${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('mensagens-midia')
          .upload(path, arquivo!, { contentType: arquivo!.type })
        if (uploadError) {
          console.error('[page] Erro upload Supabase:', uploadError)
          setUploadando(false)
          setEnviando(false)
          return
        }
        const { data: urlData } = supabase.storage.from('mensagens-midia').getPublicUrl(path)
        const publicUrl = urlData.publicUrl
        const isAudio = arquivo!.type.startsWith('audio/')
        const isVideo = arquivo!.type.startsWith('video/')
        const isImage = arquivo!.type.startsWith('image/')
        const tipo = isAudio ? 'audio' : isVideo ? 'video' : isImage ? 'imagem' : 'documento'
        const res = await fetch('/api/whatsapp/enviar-midia-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            conversation_id: conversa.id,
            tenant_id: conversa.tenant_id,
            instance_name: conversa.instance_name,
            telefone: conversa.contato_telefone,
            arquivo_url: publicUrl,
            tipo,
            nome: arquivo!.name,
            caption: isAudio ? undefined : (caption || undefined),
          }),
        })
        if (res.ok) {
          const json = await res.json()
          if (json.reaberta) setConversa(prev => prev ? { ...prev, status: 'ativa', agente_pausado: false } : prev)
        }
        if (isAudio && caption) await enviarMensagemTexto(caption)
        setUploadando(false)
        limparArquivo()
        if (!res.ok) console.error('Erro ao enviar arquivo')
      }
    } finally {
      setEnviando(false)
      inputRef.current?.focus()
    }
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

  function renderConteudoMensagem(msg: Mensagem) {
    if (!msg.arquivo_url) return <span>{msg.conteudo}</span>
    const tipo = msg.tipo?.toLowerCase() ?? ''
    if (tipo === 'imagem') {
      return (
        <div className="flex flex-col gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={msg.arquivo_url} alt="imagem" className="rounded-lg max-w-[200px] max-h-[200px] object-cover" />
          {msg.conteudo && msg.conteudo !== 'undefined' && <span className="text-xs">{msg.conteudo}</span>}
        </div>
      )
    }
    if (tipo === 'video') {
      return (
        <div className="flex flex-col gap-1">
          <video controls src={msg.arquivo_url} className="rounded-lg max-w-[240px] max-h-[160px]" />
          {msg.conteudo && msg.conteudo !== 'undefined' && <span className="text-xs">{msg.conteudo}</span>}
        </div>
      )
    }
    if (tipo === 'audio') {
      return (
        <div className="flex flex-col gap-1">
          <audio controls src={msg.arquivo_url} className="max-w-[240px]" />
          {msg.conteudo && msg.conteudo !== 'undefined' && <span className="text-xs">{msg.conteudo}</span>}
        </div>
      )
    }
    return (
      <a href={msg.arquivo_url} target="_blank" rel="noopener noreferrer" className="underline text-blue-400 text-xs">
        📎 {msg.conteudo || 'Arquivo anexado'}
      </a>
    )
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="w-6 h-6 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!conversa) return null

  const estaEncerrada = conversa.status === 'encerrada' || conversa.status === 'encerrado'

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
        <div className="flex items-center gap-2">
          {estaEncerrada ? (
            <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Encerrada
            </span>
          ) : conversa.agente_pausado ? (
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
          <button onClick={handlePausarRetomar} disabled={pausando}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={conversa.agente_pausado
              ? { background: '#10B98118', color: '#10B981', border: '1px solid #10B98130' }
              : { background: '#F59E0B18', color: '#F59E0B', border: '1px solid #F59E0B30' }
            }>
            {conversa.agente_pausado ? <><Play size={11} /> Retomar IA</> : <><Pause size={11} /> Pausar IA</>}
          </button>
        </div>
      </div>

      {/* Mensagens */}
<div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2">
      {mensagens.map((msg, i) => {
          const isCliente = msg.origem === 'cliente'
          const isAgente = msg.origem === 'agente'
          const isOperadorWeb = msg.origem === 'operador' && !!msg.from_me
          const isOperador = msg.origem === 'operador' && !msg.from_me
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
                <div className={`max-w-[75%] flex flex-col gap-0.5 ${isCliente ? '' : 'items-end'}`}>
                  {isOperador && (
                    <span className="text-[10px] px-1" style={{ color: '#818CF8' }}>
                      {labelOperador(msg)}
                    </span>
                  )}
                  {isOperadorWeb && (
                    <span className="text-[10px] px-1 flex items-center gap-1 justify-end" style={{ color: '#818CF8' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.855L0 24l6.335-1.652A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.016-1.373l-.36-.214-3.732.979.995-3.638-.235-.374A9.818 9.818 0 1112 21.818z"/>
                      </svg>
                      WhatsApp Web
                    </span>
                  )}
                  <div className="px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                    style={isCliente
                      ? { background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderBottomLeftRadius: 4 }
                      : isOperadorWeb
                      ? { background: '#6366F110', color: 'var(--text-primary)', border: '1px dashed #6366F150', borderBottomRightRadius: 4, opacity: 0.9 }
                      : isOperador
                      ? { background: '#6366F118', color: 'var(--text-primary)', border: '1px solid #6366F130', borderBottomRightRadius: 4 }
                      : { background: '#10B98118', color: 'var(--text-primary)', border: '1px solid #10B98130', borderBottomRightRadius: 4 }
                    }>
                    {renderConteudoMensagem(msg)}
                  </div>
                  <span className="text-[10px] px-1" style={{ color: 'var(--text-muted)' }}>
                    {formatarHora(msg.criado_em)}
                    {isAgente && ' · IA'}
                    {isOperador && ' · enviado'}
                    {isOperadorWeb && ' · web'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input — sempre visível, mesmo em conversa encerrada */}
      <div className="px-4 py-3 flex-shrink-0"
        style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}>

        {/* Banner informativo quando encerrada */}
        {estaEncerrada && (
          <div className="mb-2 px-3 py-1.5 rounded-lg text-xs text-center"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Conversa encerrada — envie uma mensagem para reabri-la
          </div>
        )}

        {!conversa.agente_pausado && !estaEncerrada ? (
          <div className="flex items-center justify-center gap-2 py-1">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Pause o agente para responder manualmente
            </p>
            <button onClick={handlePausarRetomar} disabled={pausando}
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
              style={{ background: '#F59E0B18', color: '#F59E0B', border: '1px solid #F59E0B30' }}>
              <Pause size={10} /> Pausar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {arquivo && !gravando && (
              <div className="rounded-lg overflow-hidden"
                style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
                {arquivoPreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={arquivoPreview} alt="preview" className="max-h-32 w-full object-contain" />
                    <button onClick={limparArquivo}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Paperclip size={13} style={{ color: '#818CF8' }} />
                    <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{arquivo.name}</span>
                    <button onClick={limparArquivo} style={{ color: 'var(--text-muted)' }}><X size={13} /></button>
                  </div>
                )}
              </div>
            )}

            {gravando && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: '#EF444418', border: '1px solid #EF444430' }}>
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-medium" style={{ color: '#EF4444' }}>
                  Gravando... {formatarTempoGravacao(tempoGravacao)}
                </span>
                <div className="flex-1" />
                <button onClick={cancelarGravacao} className="text-xs px-2 py-0.5 rounded"
                  style={{ color: 'var(--text-muted)' }}>Cancelar</button>
              </div>
            )}

            <div className="flex items-end gap-2">
              {!gravando && (
                <>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    <Paperclip size={15} />
                  </button>
                  <input ref={fileInputRef} type="file"
                    accept="image/*,video/*,audio/*,.pdf,.docx,.xlsx"
                    onChange={handleFileChange} className="hidden" />
                </>
              )}
              {!gravando && (
                <textarea
                  ref={inputRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={arquivo ? 'Adicione uma legenda (opcional)...' : estaEncerrada ? 'Envie uma mensagem para reabrir a conversa...' : 'Digite uma mensagem... (Enter para enviar)'}
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
              )}
              {gravando && <div className="flex-1" />}
              {!arquivo && !texto.trim() && (
                <button onClick={gravando ? pararGravacao : iniciarGravacao}
                  disabled={enviando || uploadando}
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-40"
                  style={gravando
                    ? { background: '#EF4444', color: '#fff' }
                    : { color: 'var(--text-muted)', border: '1px solid var(--border)' }
                  }>
                  {gravando ? <Square size={14} /> : <Mic size={15} />}
                </button>
              )}
              {(texto.trim() || arquivo) && !gravando && (
                <button onClick={handleEnviar} disabled={enviando || uploadando}
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-40"
                  style={{ background: '#10B981', color: '#fff' }}>
                  {enviando || uploadando
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Send size={15} />
                  }
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
