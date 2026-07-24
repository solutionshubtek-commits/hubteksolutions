'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar, Clock, Plus, Phone, User,
  CheckCircle, XCircle, AlertCircle, RefreshCw,
  ChevronLeft, ChevronRight, Send, Trash2, Bell, BellOff, Edit2,
  LayoutList, CalendarDays,
} from 'lucide-react'

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface Appointment {
  id: string
  contato_nome: string
  contato_telefone: string
  servico: string | null
  profissional: string | null
  data_hora: string
  status: 'pendente' | 'confirmado' | 'cancelado' | 'concluido' | 'reagendando'
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

interface Profissional {
  id: string
  nome: string
  especialidade: string | null
  ativo: boolean
}

interface AgentConfig {
  horario_inicio: string
  horario_fim: string
}

// ─── Feriados nacionais Brasil ─────────────────────────────────────────────────

function calcularPascoa(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function getFeriadosAno(year: number): Map<string, string> {
  const feriados = new Map<string, string>()

  // Fixos
  const fixos: [number, number, string][] = [
    [1, 1, 'Ano Novo'],
    [4, 21, 'Tiradentes'],
    [5, 1, 'Dia do Trabalho'],
    [9, 7, 'Independência'],
    [10, 12, 'Nossa Sra. Aparecida'],
    [11, 2, 'Finados'],
    [11, 15, 'Proclamação da República'],
    [11, 20, 'Consciência Negra'],
    [12, 25, 'Natal'],
  ]
  fixos.forEach(([m, d, label]) => {
    const key = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    feriados.set(key, label)
  })

  // Móveis baseados na Páscoa
  const pascoa = calcularPascoa(year)
  const addDias = (base: Date, dias: number, label: string) => {
    const d = new Date(base.getTime() + dias * 86400000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    feriados.set(key, label)
  }
  addDias(pascoa, -48, 'Carnaval (seg)')
  addDias(pascoa, -47, 'Carnaval (ter)')
  addDias(pascoa, -2, 'Sexta-feira Santa')
  addDias(pascoa, 0, 'Páscoa')
  addDias(pascoa, 60, 'Corpus Christi')

  return feriados
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const br = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  return br.toISOString().slice(0, 16)
}

function dateKey(iso: string): string {
  const d = new Date(iso)
  const br = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  return br.toISOString().slice(0, 10)
}

// ─── Estilos ───────────────────────────────────────────────────────────────────

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
  pendente:    { label: 'Pendente',        bg: 'rgba(234,179,8,0.15)',   color: '#EAB308', icon: AlertCircle },
  confirmado:  { label: 'Confirmado',      bg: 'rgba(34,197,94,0.15)',   color: '#22C55E', icon: CheckCircle },
  cancelado:   { label: 'Cancelou',        bg: 'rgba(239,68,68,0.15)',   color: '#EF4444', icon: XCircle },
  concluido:   { label: 'Concluído',       bg: 'rgba(163,163,163,0.15)', color: '#A3A3A3', icon: CheckCircle },
  reagendando: { label: 'Sendo reagendado', bg: 'rgba(99,102,241,0.15)', color: '#6366F1', icon: RefreshCw },
}

// Estado visual derivado: além do status bruto, "Não respondeu" (laranja) é
// quando o lembrete já foi enviado e o cliente ainda não respondeu
// (status='pendente' + lembrete_enviado=true). Confirmado/Cancelou/Sendo
// reagendado vêm direto do status atualizado pelo agente ou pelo operador.
function getStatusVisual(appt: Appointment) {
  if (appt.status === 'pendente' && appt.lembrete_enviado) {
    return { label: 'Não respondeu', bg: 'rgba(249,115,22,0.15)', color: '#F97316', icon: Bell }
  }
  return STATUS_CONFIG[appt.status] ?? STATUS_CONFIG.pendente
}

const TASK_STATUS_CONFIG = {
  pendente:  { label: 'Agendado',  bg: 'rgba(59,130,246,0.15)',  color: '#3B82F6' },
  enviado:   { label: 'Enviado',   bg: 'rgba(34,197,94,0.15)',   color: '#22C55E' },
  falhou:    { label: 'Falhou',    bg: 'rgba(239,68,68,0.15)',   color: '#EF4444' },
  cancelado: { label: 'Cancelado', bg: 'rgba(163,163,163,0.15)', color: '#A3A3A3' },
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

// ─── Modal Reagendamento ───────────────────────────────────────────────────────

function ModalReagendamento({ appt, onClose, onSaved }: {
  appt: Appointment; onClose: () => void; onSaved: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [novaDataHora, setNovaDataHora] = useState(isoToDatetimeLocal(appt.data_hora))

  async function handleSubmit() {
    if (!novaDataHora) { alert('Selecione a nova data e horário'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/agendamentos', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appt.id, data_hora: novaDataHora }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onSaved(); onClose()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao reagendar')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ borderRadius: 10, background: 'rgba(234,179,8,0.1)', padding: 8 }}>
              <Edit2 size={18} color="#EAB308" />
            </div>
            <div>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>Reagendar</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{appt.contato_nome}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <XCircle size={20} />
          </button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--bg-surface-2)', borderRadius: 10, padding: '10px 14px' }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Data/hora atual</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
              {formatDate(appt.data_hora)} às {formatTime(appt.data_hora)}
            </p>
          </div>
          <div>
            <label style={labelStyle}>Nova data e horário <span style={{ color: '#EF4444' }}>*</span></label>
            <input type="datetime-local" value={novaDataHora} onChange={e => setNovaDataHora(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} style={{ borderRadius: 10, border: 'none', background: '#EAB308', color: '#000', padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: loading ? 0.6 : 1 }}>
            {loading ? <RefreshCw size={16} /> : <Edit2 size={16} />} Confirmar reagendamento
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Novo Agendamento ────────────────────────────────────────────────────

function ModalNovoAgendamento({ onClose, onSaved, instances, profissionais, dataInicial }: {
  onClose: () => void; onSaved: () => void; instances: TenantInstance[]
  profissionais: Profissional[]; dataInicial?: string
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    instance_name: instances[0]?.instance_name ?? '',
    contato_nome: '', contato_telefone: '', servico: '',
    data_hora: dataInicial ?? '', antecedencia_horas: 24, profissional: '',
  })
  const [profTextoLivre, setProfTextoLivre] = useState('')

  const temProfissionais = profissionais.filter(p => p.ativo).length > 0

  async function handleSubmit() {
    if (!form.contato_nome || !form.contato_telefone || !form.data_hora || !form.instance_name) {
      alert('Preencha todos os campos obrigatórios'); return
    }
    const profFinal = temProfissionais ? form.profissional : profTextoLivre
    setLoading(true)
    try {
      const res = await fetch('/api/agendamentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, profissional: profFinal || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onSaved(); onClose()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 520, borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.4)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ borderRadius: 10, background: 'rgba(59,130,246,0.1)', padding: 8 }}>
              <Calendar size={18} color="#3B82F6" />
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Novo Agendamento</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Serviço</label>
              <input type="text" placeholder="Ex: Corte, Consulta..." value={form.servico} onChange={e => setForm(f => ({ ...f, servico: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Profissional</label>
              {temProfissionais ? (
                <select value={form.profissional} onChange={e => setForm(f => ({ ...f, profissional: e.target.value }))} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}>
                  <option value="">Sem preferência</option>
                  {profissionais.filter(p => p.ativo).map(p => (
                    <option key={p.id} value={p.nome}>{p.nome}{p.especialidade ? ` — ${p.especialidade}` : ''}</option>
                  ))}
                </select>
              ) : (
                <input type="text" placeholder="Nome do profissional (opcional)" value={profTextoLivre} onChange={e => setProfTextoLivre(e.target.value)} style={inputStyle} />
              )}
            </div>
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

// ─── Modal Recontato ───────────────────────────────────────────────────────────

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 520, borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.4)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ borderRadius: 10, background: 'rgba(168,85,247,0.1)', padding: 8 }}>
              <Phone size={18} color="#A855F7" />
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Agendar Recontato</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
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

// ─── Modal Dia (central) ───────────────────────────────────────────────────────

function ModalDia({ date, appointments, profissionais, horarioInicio, horarioFim, onClose, onNavDay, onConfirmar, onReagendar, onCancelar, onNovoAgendamento }: {
  date: Date
  appointments: Appointment[]
  profissionais: Profissional[]
  horarioInicio: string
  horarioFim: string
  onClose: () => void
  onNavDay: (dir: -1 | 1) => void
  onConfirmar: (id: string) => void
  onReagendar: (appt: Appointment) => void
  onCancelar: (id: string) => void
  onNovoAgendamento: (dataInicial: string) => void
}) {
  const [filtroProf, setFiltroProf] = useState('')

  const dayLabel = DIAS_SEMANA[date.getDay()]
  const dayNum = date.getDate()
  const mesLabel = MESES[date.getMonth()]
  const ano = date.getFullYear()

  // Gera slots de hora respeitando horário configurado
  function gerarHoras(): string[] {
    const [hI] = horarioInicio.split(':').map(Number)
    const [hF] = horarioFim.split(':').map(Number)
    const horas: string[] = []
    for (let h = hI; h <= hF; h++) {
      horas.push(`${String(h).padStart(2, '0')}:00`)
    }
    return horas
  }
  const horas = gerarHoras()

  const apptsFiltrados = filtroProf
    ? appointments.filter(a => a.profissional === filtroProf)
    : appointments

  function apptsDaHora(hora: string): Appointment[] {
    return apptsFiltrados.filter(a => formatTime(a.data_hora) === hora)
  }

  const dataLocalStr = `${ano}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}T${horarioInicio}:00`

  const feriados = getFeriadosAno(ano)
  const fKey = `${ano}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
  const feriadoNome = feriados.get(fKey)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 580, borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface-2)', flexShrink: 0 }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              {dayLabel}, {dayNum} de {mesLabel} de {ano}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {apptsFiltrados.length} agendamento{apptsFiltrados.length !== 1 ? 's' : ''}
              {feriadoNome && <span style={{ marginLeft: 8, color: '#EF4444', fontWeight: 500 }}>· Feriado: {feriadoNome}</span>}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => onNavDay(-1)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={13} /> Anterior
            </button>
            <button onClick={() => onNavDay(1)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              Próximo <ChevronRight size={13} />
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center' }}>
              <XCircle size={20} />
            </button>
          </div>
        </div>

        {/* Filtro profissional */}
        {profissionais.filter(p => p.ativo).length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface-2)', flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Profissional:</span>
            <select value={filtroProf} onChange={e => setFiltroProf(e.target.value)} style={{ ...selectStyle, padding: '5px 10px', fontSize: 12 }}>
              <option value="">Todos</option>
              {profissionais.filter(p => p.ativo).map(p => (
                <option key={p.id} value={p.nome}>{p.nome}</option>
              ))}
            </select>
          </div>
        )}

        {/* Timeline */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
          {feriadoNome && (
            <div style={{ margin: '8px 20px', padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#EF4444' }}>
              ⚠️ Feriado nacional: {feriadoNome}. Verifique disponibilidade com a equipe.
            </div>
          )}
          {horas.map(hora => {
            const appts = apptsDaHora(hora)
            return (
              <div key={hora} style={{ display: 'flex', gap: 12, padding: '0 20px', minHeight: 52 }}>
                <div style={{ width: 44, textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', paddingTop: 6, flexShrink: 0 }}>{hora}</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12, flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: appts.length > 0 ? '#534AB7' : 'var(--border)', marginTop: 7, flexShrink: 0 }} />
                  <div style={{ flex: 1, width: 1, background: 'var(--border)', minHeight: 8 }} />
                </div>
                <div style={{ flex: 1, paddingBottom: 6 }}>
                  {appts.length > 0 ? appts.map(appt => {
                    const sc = getStatusVisual(appt)
                    const StatusIcon = sc.icon
                    return (
                      <div key={appt.id} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', marginTop: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{appt.contato_nome}</p>
                            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                              {appt.servico ?? '—'}
                              {appt.profissional && <span style={{ color: '#534AB7', marginLeft: 6 }}>· {appt.profissional}</span>}
                            </p>
                          </div>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 20, padding: '3px 8px', fontSize: 11, fontWeight: 500, background: sc.bg, color: sc.color }}>
                            <StatusIcon size={10} /> {sc.label}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                          {appt.status === 'pendente' && (
                            <button onClick={() => onConfirmar(appt.id)} style={{ borderRadius: 7, border: 'none', background: 'rgba(34,197,94,0.1)', color: '#22C55E', padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>✓ Confirmar</button>
                          )}
                          {(appt.status === 'pendente' || appt.status === 'confirmado' || appt.status === 'reagendando') && (
                            <button onClick={() => onReagendar(appt)} style={{ borderRadius: 7, border: 'none', background: 'rgba(234,179,8,0.1)', color: '#EAB308', padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
                              <Edit2 size={12} />
                            </button>
                          )}
                          {(appt.status === 'pendente' || appt.status === 'confirmado' || appt.status === 'reagendando') && (
                            <button onClick={() => onCancelar(appt.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 3 }}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  }) : (
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', paddingTop: 6, opacity: 0.5 }}>livre</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Horário: {horarioInicio} às {horarioFim}
          </span>
          <button onClick={() => onNovoAgendamento(dataLocalStr)} style={{ borderRadius: 10, border: 'none', background: '#534AB7', color: '#fff', padding: '8px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Novo agendamento neste dia
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card mobile agendamento ───────────────────────────────────────────────────

function AppointmentCard({ appt, onConfirmar, onReagendar, onCancelar }: {
  appt: Appointment
  onConfirmar: (id: string) => void
  onReagendar: (appt: Appointment) => void
  onCancelar: (id: string) => void
}) {
  const sc = getStatusVisual(appt)
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
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Serviço / Profissional</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>{appt.servico ?? '—'}</p>
          {appt.profissional && <p style={{ margin: 0, fontSize: 11, color: '#534AB7' }}>{appt.profissional}</p>}
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
          {(appt.status === 'pendente' || appt.status === 'confirmado' || appt.status === 'reagendando') && (
            <button onClick={() => onReagendar(appt)} style={{ borderRadius: 8, border: 'none', background: 'rgba(234,179,8,0.1)', color: '#EAB308', padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
              <Edit2 size={13} />
            </button>
          )}
          {(appt.status === 'pendente' || appt.status === 'confirmado' || appt.status === 'reagendando') && (
            <button onClick={() => onCancelar(appt.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
          )}
        </div>
      </div>
    </div>
  )
}

function TaskCard({ task, onCancelar }: { task: ScheduledTask; onCancelar: (id: string) => void }) {
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
      {task.erro && <p style={{ margin: '0 0 8px', fontSize: 11, color: '#EF4444' }}>{task.erro}</p>}
      {task.status === 'pendente' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => onCancelar(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
        </div>
      )}
    </div>
  )
}

// ─── Vista Calendário ──────────────────────────────────────────────────────────

function CalendarView({ appointments, profissionais, horarioInicio, horarioFim, onRefresh, instances }: {
  appointments: Appointment[]
  profissionais: Profissional[]
  horarioInicio: string
  horarioFim: string
  onRefresh: () => void
  instances: TenantInstance[]
}) {
  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [filtroProf, setFiltroProf] = useState('')
  const [modalDia, setModalDia] = useState<Date | null>(null)
  const [modalReagendar, setModalReagendar] = useState<Appointment | null>(null)
  const [modalNovoAgendamento, setModalNovoAgendamento] = useState<string | undefined>(undefined)
  const [modalNovoAberto, setModalNovoAberto] = useState(false)

  const feriados = getFeriadosAno(viewDate.getFullYear())

  const apptsFiltrados = filtroProf
    ? appointments.filter(a => a.profissional === filtroProf)
    : appointments

  function apptsByDay(day: number): Appointment[] {
    const y = viewDate.getFullYear()
    const m = viewDate.getMonth()
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return apptsFiltrados.filter(a => dateKey(a.data_hora) === key)
  }

  function statusCor(a: Appointment) {
    // "Não respondeu" — lembrete enviado e ainda sem resposta do cliente
    if (a.status === 'pendente' && a.lembrete_enviado) return { bg: 'rgba(194,98,14,0.15)', color: '#C2620E' }
    if (a.status === 'reagendando') return { bg: 'rgba(79,70,229,0.15)', color: '#4F46E5' }
    if (a.status === 'confirmado') return { bg: 'rgba(15,110,86,0.15)', color: '#0F6E56' }
    if (a.status === 'pendente') return { bg: 'rgba(186,117,23,0.15)', color: '#BA7517' }
    return { bg: 'rgba(163,45,45,0.12)', color: '#A32D2D' }
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7

  async function confirmarAgendamento(id: string) {
    await fetch('/api/agendamentos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'confirmado' }) })
    onRefresh()
  }
  async function cancelarAgendamento(id: string) {
    await fetch('/api/agendamentos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'cancelado' }) })
    onRefresh()
  }

  function navDay(dir: -1 | 1) {
    if (!modalDia) return
    const nova = new Date(modalDia.getTime() + dir * 86400000)
    if (nova.getMonth() !== viewDate.getMonth()) {
      setViewDate(new Date(nova.getFullYear(), nova.getMonth(), 1))
    }
    setModalDia(nova)
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '1px solid var(--border)', background: 'var(--bg-surface-2)',
  }

  return (
    <>
      {/* Controles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
          <ChevronLeft size={15} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', minWidth: 160, textAlign: 'center' }}>
          {MESES[month]} {year}
        </span>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
          <ChevronRight size={15} />
        </button>
        <button onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>
          Hoje
        </button>
        {profissionais.filter(p => p.ativo).length > 0 && (
          <select value={filtroProf} onChange={e => setFiltroProf(e.target.value)} style={{ ...selectStyle, padding: '6px 12px', fontSize: 12, marginLeft: 'auto' }}>
            <option value="">Todos os profissionais</option>
            {profissionais.filter(p => p.ativo).map(p => (
              <option key={p.id} value={p.nome}>{p.nome}</option>
            ))}
          </select>
        )}
      </div>

      {/* Grade */}
      <div style={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-surface)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {DIAS_SEMANA.map(d => <div key={d} style={thStyle}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {Array.from({ length: totalCells }, (_, i) => {
            let dayNum: number
            let isOther = false
            if (i < firstDay) { dayNum = prevDays - firstDay + i + 1; isOther = true }
            else if (i >= firstDay + daysInMonth) { dayNum = i - firstDay - daysInMonth + 1; isOther = true }
            else { dayNum = i - firstDay + 1 }

            const isWeekend = (i % 7 === 0 || i % 7 === 6)
            const isToday = !isOther && year === today.getFullYear() && month === today.getMonth() && dayNum === today.getDate()
            const fKey = !isOther ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : ''
            const feriadoNome = fKey ? feriados.get(fKey) : undefined
            const appts = !isOther ? apptsByDay(dayNum) : []

            return (
              <div
                key={i}
                onClick={() => { if (!isOther) { setModalDia(new Date(year, month, dayNum)) } }}
                style={{
                  minHeight: 72, padding: '4px', cursor: isOther ? 'default' : 'pointer',
                  borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                  background: isOther ? 'var(--bg-surface-2)' : isWeekend ? 'rgba(0,0,0,0.01)' : 'var(--bg-surface)',
                  opacity: isOther ? 0.4 : 1,
                  transition: 'background 0.1s',
                  ...(i % 7 === 6 ? { borderRight: 'none' } : {}),
                }}
                onMouseEnter={e => { if (!isOther) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface-2)' }}
                onMouseLeave={e => { if (!isOther) (e.currentTarget as HTMLDivElement).style.background = isWeekend ? 'rgba(0,0,0,0.01)' : 'var(--bg-surface)' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: isToday ? '#534AB7' : 'transparent', fontSize: 12, fontWeight: 500, color: isToday ? '#fff' : 'var(--text-muted)', marginBottom: 2 }}>
                  {dayNum}
                </div>
                {feriadoNome && (
                  <div style={{ fontSize: 9, color: '#EF4444', padding: '1px 3px', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={feriadoNome}>
                    🔴 {feriadoNome}
                  </div>
                )}
                {appts.slice(0, 2).map(a => {
                  const cor = statusCor(a)
                  return (
                    <div key={a.id} style={{ fontSize: 10, padding: '2px 5px', borderRadius: 3, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: cor.bg, color: cor.color }}>
                      {formatTime(a.data_hora)} {a.contato_nome.split(' ')[0]}
                    </div>
                  )
                })}
                {appts.length > 2 && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '1px 4px' }}>+{appts.length - 2} mais</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Legenda */}
        <div style={{ display: 'flex', gap: 14, padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0F6E56' }} /> Confirmado
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#BA7517' }} /> Pendente
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#C2620E' }} /> Não respondeu
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4F46E5' }} /> Sendo reagendado
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#A32D2D' }} /> Cancelou
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#EF4444' }}>
            🔴 Feriado nacional
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>Clique em um dia para ver detalhes</span>
        </div>
      </div>

      {/* Modal dia */}
      {modalDia && (
        <ModalDia
          date={modalDia}
          appointments={apptsByDay(modalDia.getDate()).concat(
            filtroProf ? [] : appointments.filter(a => {
              const k = dateKey(a.data_hora)
              const expected = `${modalDia.getFullYear()}-${String(modalDia.getMonth() + 1).padStart(2, '0')}-${String(modalDia.getDate()).padStart(2, '0')}`
              return k === expected
            }).filter(a => !apptsByDay(modalDia.getDate()).find(b => b.id === a.id))
          ).filter((v, i, a) => a.findIndex(b => b.id === v.id) === i)}
          profissionais={profissionais}
          horarioInicio={horarioInicio}
          horarioFim={horarioFim}
          onClose={() => setModalDia(null)}
          onNavDay={navDay}
          onConfirmar={async id => { await confirmarAgendamento(id); onRefresh() }}
          onReagendar={appt => { setModalReagendar(appt) }}
          onCancelar={async id => { await cancelarAgendamento(id); onRefresh() }}
          onNovoAgendamento={dataInicial => { setModalNovoAgendamento(dataInicial); setModalNovoAberto(true) }}
        />
      )}

      {modalReagendar && (
        <ModalReagendamento
          appt={modalReagendar}
          onClose={() => setModalReagendar(null)}
          onSaved={() => { onRefresh(); setModalReagendar(null) }}
        />
      )}

      {modalNovoAberto && (
        <ModalNovoAgendamento
          onClose={() => { setModalNovoAberto(false); setModalNovoAgendamento(undefined) }}
          onSaved={() => { onRefresh(); setModalNovoAberto(false) }}
          instances={instances}
          profissionais={profissionais}
          dataInicial={modalNovoAgendamento}
        />
      )}
    </>
  )
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function AgendamentosPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'agendamentos' | 'recontatos'>('agendamentos')
  const [viewMode, setViewMode] = useState<'calendario' | 'lista'>('calendario')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [instances, setInstances] = useState<TenantInstance[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({ horario_inicio: '08:00', horario_fim: '18:00' })
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalAgendamento, setModalAgendamento] = useState(false)
  const [modalRecontato, setModalRecontato] = useState(false)
  const [modalReagendar, setModalReagendar] = useState<Appointment | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const LIMIT = 50 // carregamos mais para o calendário

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

  // Tempo real: mudanças feitas pelo agente (ex.: cliente confirmou/cancelou/
  // pediu reagendamento pelo lembrete) ou por outro operador refletem na tela
  // sem recarregar. Cobre agendamentos e recontatos (scheduled_tasks).
  useEffect(() => {
    if (!tenantId) return
    const channel = supabase
      .channel(`agendamentos-rt-${tenantId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `tenant_id=eq.${tenantId}` },
        () => { fetchData() }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'scheduled_tasks', filter: `tenant_id=eq.${tenantId}` },
        () => { fetchData() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tenantId, fetchData, supabase])

  useEffect(() => {
    async function fetchExtras() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData) return
      setTenantId(userData.tenant_id)

      // Instâncias
      const { data: inst } = await supabase.from('tenant_instances').select('instance_name, apelido, status').eq('tenant_id', userData.tenant_id).eq('status', 'conectado')
      setInstances(inst ?? [])

      // Profissionais
      const res = await fetch('/api/profissionais')
      if (res.ok) { const json = await res.json(); setProfissionais(json.data ?? []) }

      // Horário do agente
      const { data: ac } = await supabase.from('agent_config').select('horario_inicio, horario_fim').eq('tenant_id', userData.tenant_id).maybeSingle()
      if (ac) setAgentConfig({ horario_inicio: ac.horario_inicio ?? '08:00', horario_fim: ac.horario_fim ?? '18:00' })
    }
    fetchExtras()
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
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
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
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header */}
          <div className="agend-header">
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Agendamentos</h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Gerencie agendamentos e recontatos</p>
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

          {/* Tabs + toggle view */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
              {([{ key: 'agendamentos', label: 'Agendamentos', icon: Calendar }, { key: 'recontatos', label: 'Recontatos', icon: Phone }] as const).map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => { setTab(key); setPage(1); setFilterStatus('') }} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, border: 'none', background: tab === key ? 'var(--bg-hover)' : 'transparent', color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)', padding: '8px 16px', fontSize: 13, fontWeight: tab === key ? 600 : 400, cursor: 'pointer' }}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {tab === 'agendamentos' && (
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
                <button onClick={() => setViewMode('calendario')} style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 7, border: 'none', background: viewMode === 'calendario' ? 'var(--bg-hover)' : 'transparent', color: viewMode === 'calendario' ? 'var(--text-primary)' : 'var(--text-muted)', padding: '6px 12px', fontSize: 12, fontWeight: viewMode === 'calendario' ? 600 : 400, cursor: 'pointer' }}>
                  <CalendarDays size={13} /> Calendário
                </button>
                <button onClick={() => setViewMode('lista')} style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 7, border: 'none', background: viewMode === 'lista' ? 'var(--bg-hover)' : 'transparent', color: viewMode === 'lista' ? 'var(--text-primary)' : 'var(--text-muted)', padding: '6px 12px', fontSize: 12, fontWeight: viewMode === 'lista' ? 600 : 400, cursor: 'pointer' }}>
                  <LayoutList size={13} /> Lista
                </button>
              </div>
            )}
          </div>

          {/* Filtros — só na lista */}
          {(tab === 'recontatos' || (tab === 'agendamentos' && viewMode === 'lista')) && (
            <div className="agend-filtros">
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} style={selectStyle}>
                <option value="">Todos os status</option>
                {tab === 'agendamentos'
                  ? <><option value="pendente">Pendente</option><option value="confirmado">Confirmado</option><option value="reagendando">Sendo reagendado</option><option value="cancelado">Cancelou</option><option value="concluido">Concluído</option></>
                  : <><option value="pendente">Agendado</option><option value="enviado">Enviado</option><option value="falhou">Falhou</option><option value="cancelado">Cancelado</option></>
                }
              </select>
              <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>
                <RefreshCw size={14} /> Atualizar
              </button>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{totalCount} registro{totalCount !== 1 ? 's' : ''}</span>
            </div>
          )}

          {/* Vista Calendário */}
          {tab === 'agendamentos' && viewMode === 'calendario' && (
            <CalendarView
              appointments={appointments}
              profissionais={profissionais}
              horarioInicio={agentConfig.horario_inicio}
              horarioFim={agentConfig.horario_fim}
              onRefresh={fetchData}
              instances={instances}
            />
          )}

          {/* Vista Lista */}
          {tab === 'agendamentos' && viewMode === 'lista' && (
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
                          {['Cliente', 'Serviço / Profissional', 'Data/Hora', 'Status', 'Lembrete', 'Ações'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {appointments.map(appt => {
                          const sc = getStatusVisual(appt)
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
                                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{appt.servico ?? '—'}</p>
                                {appt.profissional && <p style={{ margin: 0, fontSize: 11, color: '#534AB7', marginTop: 2 }}>{appt.profissional}</p>}
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
                                  {(appt.status === 'pendente' || appt.status === 'confirmado' || appt.status === 'reagendando') && (
                                    <button onClick={() => setModalReagendar(appt)} style={{ borderRadius: 8, border: 'none', background: 'rgba(234,179,8,0.1)', color: '#EAB308', padding: '6px 10px', fontSize: 12, cursor: 'pointer' }} title="Reagendar">
                                      <Edit2 size={13} />
                                    </button>
                                  )}
                                  {(appt.status === 'pendente' || appt.status === 'confirmado' || appt.status === 'reagendando') && (
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
                      <AppointmentCard key={appt.id} appt={appt} onConfirmar={confirmarAgendamento} onReagendar={setModalReagendar} onCancelar={cancelarAgendamento} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Recontatos */}
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
                    {tasks.map(task => <TaskCard key={task.id} task={task} onCancelar={cancelarTask} />)}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Paginação — só na lista */}
          {viewMode === 'lista' && totalPages > 1 && (
            <div className="agend-pagination">
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Página {page} de {totalPages}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', padding: 8, cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}><ChevronLeft size={15} /></button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', padding: 8, cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}><ChevronRight size={15} /></button>
              </div>
            </div>
          )}
        </div>

        {modalAgendamento && <ModalNovoAgendamento onClose={() => setModalAgendamento(false)} onSaved={fetchData} instances={instances} profissionais={profissionais} />}
        {modalRecontato && <ModalMeChama onClose={() => setModalRecontato(false)} onSaved={fetchData} instances={instances} />}
        {modalReagendar && <ModalReagendamento appt={modalReagendar} onClose={() => setModalReagendar(null)} onSaved={fetchData} />}
      </div>
    </>
  )
}