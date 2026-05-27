'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar, Clock, Plus, Phone, User,
  CheckCircle, XCircle, AlertCircle, RefreshCw,
  ChevronLeft, ChevronRight, Send, Trash2, Bell, BellOff,
} from 'lucide-react'

interface Appointment {
  id: string
  contato_nome: string
  contato_telefone: string
  servico: string | null
  data_hora: string
  status: 'pendente' | 'confirmado' | 'cancelado' | 'concluido'
  lembrete_enviado: boolean
  antecedencia_horas: number
  google_event_id: string | null
  criado_em: string
}

interface ScheduledTask {
  id: string
  contato_nome: string
  contato_telefone: string
  tipo: 'lembrete_agendamento' | 'me_chama_depois'
  mensagem_inicial: string
  status: 'pendente' | 'enviado' | 'falhou' | 'cancelado'
  agendado_para: string
  enviado_em: string | null
  erro: string | null
  criado_por: string | null
}

interface TenantInstance {
  instance_name: string
  apelido: string | null
  status: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

const inputStyle: React.CSSProperties = {
  width: '100%', borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-surface-2)',
  color: 'var(--text-primary)',
  padding: '10px 14px', fontSize: 14, outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 500,
  color: 'var(--text-secondary)', marginBottom: 6,
}

const selectStyle: React.CSSProperties = {
  borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
  padding: '10px 14px', fontSize: 14, outline: 'none', cursor: 'pointer',
}

const STATUS_CONFIG = {
  pendente:   { label: 'Pendente',   bg: 'rgba(234,179,8,0.15)',   color: '#EAB308', icon: AlertCircle },
  confirmado: { label: 'Confirmado', bg: 'rgba(34,197,94,0.15)',   color: '#22C55E', icon: CheckCircle },
  cancelado:  { label: 'Cancelado',  bg: 'rgba(239,68,68,0.15)',   color: '#EF4444', icon: XCircle },
  concluido:  { label: 'Concluído',  bg: 'rgba(163,163,163,0.15)', color: '#A3A3A3', icon: CheckCircle },
}

const TASK_STATUS_CONFIG = {
  pendente:  { label: 'Agendado',  bg: 'rgba(59,130,246,0.15)',  color: '#3B82F6' },
  enviado:   { label: 'Enviado',   bg: 'rgba(34,197,94,0.15)',   color: '#22C55E' },
  falhou:    { label: 'Falhou',    bg: 'rgba(239,68,68,0.15)',   color: '#EF4444' },
  cancelado: { label: 'Cancelado', bg: 'rgba(163,163,163,0.15)', color: '#A3A3A3' },
}

function ModalNovoAgendamento({ onClose, onSaved, instances }: {
  onClose: () => void; onSaved: () => void; instances: TenantInstance[]
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    instance_name: instances[0]?.instance_name ?? '',
    contato_nome: '', contato_telefone: '', servico: '',
    data_hora: '', antecedencia_horas: 24,
  })

  async function handleSubmit() {
    if (!form.contato_nome || !form.contato_telefone || !form.data_hora || !form.instance_name) {
      alert('Preencha todos os campos obrigatórios'); return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/agendamentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onSaved(); onClose()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 520, borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.4)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ borderRadius: 10, background: 'rgba(59,130,246,0.1)', padding: 8, flexShrink: 0 }}>
              <Calendar size={18} color="#3B82F6" />
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Novo Agendamento</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}>
            <XCircle size={20} />
          </button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Instância WhatsApp <span style={{ color: '#EF4444' }}>*</span></label>
            <select value={form.instance_name} onChange={e => setForm(f => ({ ...f, instance_name: e.target.value }))} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}>
              {instances.length === 0 && <option value="">Nenhuma instância conectada</option>}
              {instances.map(i => <option key={i.instance_name} value={i.instance_name}>{i.apelido ?? i.instance_name}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Nome do cliente <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="text" placeholder="João Silva" value={form.contato_nome} onChange={e => setForm(f => ({ ...f, contato_nome: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Telefone <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="tel" placeholder="51999999999" value={form.contato_telefone} onChange={e => setForm(f => ({ ...f, contato_telefone: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Serviço</label>
            <input type="text" placeholder="Ex: Corte, Consulta, Limpeza dental..." value={form.servico} onChange={e => setForm(f => ({ ...f, servico: e.target.value }))} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Data e horário <span style={{ color: '#EF4444' }}>*</span></label>
            <input type="datetime-local" value={form.data_hora} onChange={e => setForm(f => ({ ...f, data_hora: e.target.value }))} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Agente de IA enviará a mensagem em</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <select value={form.antecedencia_horas} onChange={e => setForm(f => ({ ...f, antecedencia_horas: parseInt(e.target.value) }))} style={selectStyle}>
                {[1,2,4,6,12,24,48].map(h => <option key={h} value={h}>{h === 1 ? '1 hora' : `${h} horas`}</option>)}
              </select>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>antes do agendamento</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <button onClick={onClose} style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} style={{ borderRadius: 10, border: 'none', background: '#3B82F6', color: '#fff', padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: loading ? 0.6 : 1 }}>
            {loading ? <RefreshCw size={16} /> : <Plus size={16} />} Salvar agendamento
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalMeChama({ onClose, onSaved, instances }: {
  onClose: () => void; onSaved: () => void; instances: TenantInstance[]
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    instance_name: instances[0]?.instance_name ?? '',
    contato_nome: '', contato_telefone: '',
    mensagem_inicial: 'Olá {{nome}}! Você pediu para eu entrar em contato agora. Como posso ajudar? 😊',
    agendado_para: '',
  })

  async function handleSubmit() {
    if (!form.contato_nome || !form.contato_telefone || !form.agendado_para || !form.mensagem_inicial) {
      alert('Preencha todos os campos obrigatórios'); return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/scheduled-tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, variaveis: { nome: form.contato_nome } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onSaved(); onClose()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 520, borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.4)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ borderRadius: 10, background: 'rgba(168,85,247,0.1)', padding: 8, flexShrink: 0 }}>
              <Phone size={18} color="#A855F7" />
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Agendar Recontato</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}>
            <XCircle size={20} />
          </button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Instância WhatsApp</label>
            <select value={form.instance_name} onChange={e => setForm(f => ({ ...f, instance_name: e.target.value }))} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}>
              {instances.length === 0 && <option value="">Nenhuma instância conectada</option>}
              {instances.map(i => <option key={i.instance_name} value={i.instance_name}>{i.apelido ?? i.instance_name}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Nome <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="text" placeholder="Nome do cliente" value={form.contato_nome} onChange={e => setForm(f => ({ ...f, contato_nome: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Telefone <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="tel" placeholder="51999999999" value={form.contato_telefone} onChange={e => setForm(f => ({ ...f, contato_telefone: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Quando contatar <span style={{ color: '#EF4444' }}>*</span></label>
            <input type="datetime-local" value={form.agendado_para} onChange={e => setForm(f => ({ ...f, agendado_para: e.target.value }))} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>
              Mensagem de abertura{' '}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>(use {'{{nome}}'} para o nome)</span>
            </label>
            <textarea rows={3} value={form.mensagem_inicial} onChange={e => setForm(f => ({ ...f, mensagem_inicial: e.target.value }))} style={{ ...inputStyle, resize: 'none' }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <button onClick={onClose} style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} style={{ borderRadius: 10, border: 'none', background: '#A855F7', color: '#fff', padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: loading ? 0.6 : 1 }}>
            {loading ? <RefreshCw size={16} /> : <Send size={16} />} Agendar recontato
          </button>
        </div>
      </div>
    </div>
  )
}

function AppointmentCard({ appt, onConfirmar, onCancelar }: {
  appt: Appointment
  onConfirmar: (id: string) => void
  onCancelar: (id: string) => void
}) {
  const sc = STATUS_CONFIG[appt.status]
  const StatusIcon = sc.icon
  return (
    <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={15} color="#3B82F6" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{appt.contato_nome}</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{appt.contato_telefone}</p>
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 500, background: sc.bg, color: sc.color, flexShrink: 0 }}>
          <StatusIcon size={11} /> {sc.label}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ background: 'var(--bg-surface-2)', borderRadius: 8, padding: '8px 10px' }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Data / Hora</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{formatDate(appt.data_hora)}</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(appt.data_hora)}</p>
        </div>
        <div style={{ background: 'var(--bg-surface-2)', borderRadius: 8, padding: '8px 10px' }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Serviço</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <Calendar size={12} color="var(--text-muted)" />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{appt.servico ?? '—'}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
          {appt.lembrete_enviado
            ? <><Bell size={13} color="#22C55E" /><span style={{ color: '#22C55E' }}>Lembrete enviado</span></>
            : <><BellOff size={13} color="var(--text-muted)" /><span style={{ color: 'var(--text-muted)' }}>{appt.antecedencia_horas}h antes</span></>
          }
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {appt.status === 'pendente' && (
            <button onClick={() => onConfirmar(appt.id)} style={{ borderRadius: 8, border: 'none', background: 'rgba(34,197,94,0.1)', color: '#22C55E', padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Confirmar</button>
          )}
          {(appt.status === 'pendente' || appt.status === 'confirmado') && (
            <button onClick={() => onCancelar(appt.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
          )}
        </div>
      </div>
    </div>
  )
}

function TaskCard({ task, onCancelar }: {
  task: ScheduledTask
  onCancelar: (id: string) => void
}) {
  const sc = TASK_STATUS_CONFIG[task.status]
  return (
    <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={15} color="#A855F7" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{task.contato_nome}</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{task.contato_telefone}</p>
          </div>
        </div>
        <span style={{ display: 'inline-flex', borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 500, background: sc.bg, color: sc.color, flexShrink: 0 }}>{sc.label}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ background: 'var(--bg-surface-2)', borderRadius: 8, padding: '8px 10px' }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Agendado para</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{formatDate(task.agendado_para)}</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(task.agendado_para)}</p>
        </div>
        <div style={{ background: 'var(--bg-surface-2)', borderRadius: 8, padding: '8px 10px' }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Origem</p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 20, padding: '3px 8px', fontSize: 11, fontWeight: 500, marginTop: 2, background: task.criado_por ? 'rgba(59,130,246,0.1)' : 'rgba(249,115,22,0.1)', color: task.criado_por ? '#3B82F6' : '#F97316' }}>
            {task.criado_por ? <><User size={10} /> Operador</> : <><Clock size={10} /> Agente IA</>}
          </span>
        </div>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.mensagem_inicial}>
        {task.mensagem_inicial}
      </p>

      {task.erro && (
        <p style={{ margin: '0 0 8px', fontSize: 11, color: '#EF4444' }}>{task.erro}</p>
      )}

      {task.status === 'pendente' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => onCancelar(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
        </div>
      )}
    </div>
  )
}

export default function AgendamentosPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'agendamentos' | 'recontatos'>('agendamentos')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [instances, setInstances] = useState<TenantInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAgendamento, setModalAgendamento] = useState(false)
  const [modalRecontato, setModalRecontato] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const LIMIT = 15

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'agendamentos') {
        const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), ...(filterStatus && { status: filterStatus }) })
        const res = await fetch(`/api/agendamentos?${params}`)
        const json = await res.json()
        setAppointments(json.data ?? []); setTotalCount(json.count ?? 0)
      } else {
        const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), ...(filterStatus && { status: filterStatus }), tipo: 'me_chama_depois' })
        const res = await fetch(`/api/scheduled-tasks?${params}`)
        const json = await res.json()
        setTasks(json.data ?? []); setTotalCount(json.count ?? 0)
      }
    } finally { setLoading(false) }
  }, [tab, page, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    async function fetchInstances() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData) return
      const { data } = await supabase.from('tenant_instances').select('instance_name, apelido, status').eq('tenant_id', userData.tenant_id).eq('status', 'conectado')
      setInstances(data ?? [])
    }
    fetchInstances()
  }, [supabase])

  async function cancelarTask(id: string) {
    await fetch(`/api/scheduled-tasks?id=${id}`, { method: 'DELETE' }); fetchData()
  }
  async function cancelarAgendamento(id: string) {
    await fetch('/api/agendamentos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'cancelado' }) }); fetchData()
  }
  async function confirmarAgendamento(id: string) {
    await fetch('/api/agendamentos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'confirmado' }) }); fetchData()
  }

  const totalPages = Math.ceil(totalCount / LIMIT)

  const thStyle: React.CSSProperties = {
    padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
  }

  return (
    <>
      <style>{`
        .agend-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
        .agend-header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .agend-filtros { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .agend-table-wrapper { display: block; }
        .agend-cards-wrapper { display: none; }
        .agend-pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        @media (max-width: 640px) {
          .agend-header-actions button { flex: 1; justify-content: center; }
          .agend-table-wrapper { display: none; }
          .agend-cards-wrapper { display: block; }
          .agend-pagination { flex-direction: column; align-items: center; }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', padding: '16px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div className="agend-header">
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Agendamentos</h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Gerencie lembretes e recontatos proativos</p>
            </div>
            <div className="agend-header-actions">
              <button onClick={() => setModalRecontato(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: '1px solid var(--border-2)', background: 'rgba(168,85,247,0.08)', color: '#A855F7', padding: '10px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                <Phone size={15} /> Agendar recontato
              </button>
              <button onClick={() => setModalAgendamento(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: 'none', background: '#3B82F6', color: '#fff', padding: '10px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                <Plus size={15} /> Novo agendamento
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
            {([{ key: 'agendamentos', label: 'Agendamentos', icon: Calendar }, { key: 'recontatos', label: 'Recontatos', icon: Phone }] as const).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => { setTab(key); setPage(1); setFilterStatus('') }} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, border: 'none', background: tab === key ? 'var(--bg-hover)' : 'transparent', color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)', padding: '8px 16px', fontSize: 13, fontWeight: tab === key ? 600 : 400, cursor: 'pointer' }}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          <div className="agend-filtros">
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} style={selectStyle}>
              <option value="">Todos os status</option>
              {tab === 'agendamentos'
                ? <><option value="pendente">Pendente</option><option value="confirmado">Confirmado</option><option value="cancelado">Cancelado</option><option value="concluido">Concluído</option></>
                : <><option value="pendente">Agendado</option><option value="enviado">Enviado</option><option value="falhou">Falhou</option><option value="cancelado">Cancelado</option></>
              }
            </select>
            <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>
              <RefreshCw size={14} /> Atualizar
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{totalCount} registro{totalCount !== 1 ? 's' : ''}</span>
          </div>

          {tab === 'agendamentos' && (
            <div style={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-surface)', overflow: 'hidden' }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><RefreshCw size={24} color="var(--text-muted)" /></div>
              ) : appointments.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 64, textAlign: 'center' }}>
                  <Calendar size={40} color="var(--text-label)" />
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Nenhum agendamento encontrado</p>
                  <button onClick={() => setModalAgendamento(true)} style={{ background: 'none', border: 'none', color: '#3B82F6', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Criar o primeiro agendamento</button>
                </div>
              ) : (
                <>
                  <div className="agend-table-wrapper" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface-2)' }}>
                          {['Cliente', 'Serviço', 'Data/Hora', 'Status', 'Lembrete', 'Ações'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {appointments.map(appt => {
                          const sc = STATUS_CONFIG[appt.status]
                          const StatusIcon = sc.icon
                          return (
                            <tr key={appt.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '14px 20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <User size={15} color="#3B82F6" />
                                  </div>
                                  <div>
                                    <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{appt.contato_nome}</p>
                                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{appt.contato_telefone}</p>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '14px 20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Calendar size={13} color="var(--text-muted)" />
                                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{appt.servico ?? '—'}</span>
                                </div>
                              </td>
                              <td style={{ padding: '14px 20px' }}>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{formatDate(appt.data_hora)}</p>
                                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(appt.data_hora)}</p>
                              </td>
                              <td style={{ padding: '14px 20px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 500, background: sc.bg, color: sc.color }}>
                                  <StatusIcon size={11} /> {sc.label}
                                </span>
                              </td>
                              <td style={{ padding: '14px 20px' }}>
                                {appt.lembrete_enviado
                                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#22C55E' }}><Bell size={13} /> Enviado</span>
                                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}><BellOff size={13} /> {appt.antecedencia_horas}h antes</span>
                                }
                              </td>
                              <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                                  {appt.status === 'pendente' && (
                                    <button onClick={() => confirmarAgendamento(appt.id)} style={{ borderRadius: 8, border: 'none', background: 'rgba(34,197,94,0.1)', color: '#22C55E', padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Confirmar</button>
                                  )}
                                  {(appt.status === 'pendente' || appt.status === 'confirmado') && (
                                    <button onClick={() => cancelarAgendamento(appt.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="agend-cards-wrapper">
                    {appointments.map(appt => (
                      <AppointmentCard key={appt.id} appt={appt} onConfirmar={confirmarAgendamento} onCancelar={cancelarAgendamento} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'recontatos' && (
            <div style={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-surface)', overflow: 'hidden' }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><RefreshCw size={24} color="var(--text-muted)" /></div>
              ) : tasks.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 64, textAlign: 'center' }}>
                  <Phone size={40} color="var(--text-label)" />
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Nenhum recontato agendado</p>
                </div>
              ) : (
                <>
                  <div className="agend-table-wrapper" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface-2)' }}>
                          {['Cliente', 'Agendado para', 'Origem', 'Status', 'Mensagem', 'Ações'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map(task => {
                          const sc = TASK_STATUS_CONFIG[task.status]
                          return (
                            <tr key={task.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '14px 20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <User size={15} color="#A855F7" />
                                  </div>
                                  <div>
                                    <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{task.contato_nome}</p>
                                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{task.contato_telefone}</p>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '14px 20px' }}>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{formatDate(task.agendado_para)}</p>
                                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(task.agendado_para)}</p>
                              </td>
                              <td style={{ padding: '14px 20px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 500, background: task.criado_por ? 'rgba(59,130,246,0.1)' : 'rgba(249,115,22,0.1)', color: task.criado_por ? '#3B82F6' : '#F97316' }}>
                                  {task.criado_por ? <><User size={11} /> Operador</> : <><Clock size={11} /> Agente IA</>}
                                </span>
                              </td>
                              <td style={{ padding: '14px 20px' }}>
                                <span style={{ display: 'inline-flex', borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 500, background: sc.bg, color: sc.color }}>{sc.label}</span>
                                {task.erro && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#EF4444', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.erro}>{task.erro}</p>}
                              </td>
                              <td style={{ padding: '14px 20px' }}>
                                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.mensagem_inicial}>{task.mensagem_inicial}</p>
                              </td>
                              <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                {task.status === 'pendente' && (
                                  <button onClick={() => cancelarTask(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="agend-cards-wrapper">
                    {tasks.map(task => (
                      <TaskCard key={task.id} task={task} onCancelar={cancelarTask} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {totalPages > 1 && (
            <div className="agend-pagination">
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Página {page} de {totalPages}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', padding: 8, cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}><ChevronLeft size={15} /></button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', padding: 8, cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}><ChevronRight size={15} /></button>
              </div>
            </div>
          )}
        </div>

        {modalAgendamento && <ModalNovoAgendamento onClose={() => setModalAgendamento(false)} onSaved={fetchData} instances={instances} />}
        {modalRecontato && <ModalMeChama onClose={() => setModalRecontato(false)} onSaved={fetchData} instances={instances} />}
      </div>
    </>
  )
}