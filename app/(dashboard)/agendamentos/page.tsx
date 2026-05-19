'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar,
  Clock,
  Plus,
  Phone,
  User,
  Scissors,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Send,
  Trash2,
  Bell,
  BellOff,
} from 'lucide-react'

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

const STATUS_CONFIG = {
  pendente:   { label: 'Pendente',   color: 'bg-yellow-100 text-yellow-800',  icon: AlertCircle },
  confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-800',    icon: CheckCircle },
  cancelado:  { label: 'Cancelado',  color: 'bg-red-100 text-red-800',        icon: XCircle },
  concluido:  { label: 'Concluído',  color: 'bg-gray-100 text-gray-600',      icon: CheckCircle },
}

const TASK_STATUS_CONFIG = {
  pendente:  { label: 'Agendado',  color: 'bg-blue-100 text-blue-800' },
  enviado:   { label: 'Enviado',   color: 'bg-green-100 text-green-800' },
  falhou:    { label: 'Falhou',    color: 'bg-red-100 text-red-800' },
  cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-600' },
}

// ----------------------------------------------------------------
// Modal Novo Agendamento
// ----------------------------------------------------------------
function ModalNovoAgendamento({
  onClose,
  onSaved,
  instances,
}: {
  onClose: () => void
  onSaved: () => void
  instances: TenantInstance[]
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    instance_name: instances[0]?.instance_name ?? '',
    contato_nome: '',
    contato_telefone: '',
    servico: '',
    data_hora: '',
    antecedencia_horas: 24,
  })

  async function handleSubmit() {
    if (!form.contato_nome || !form.contato_telefone || !form.data_hora || !form.instance_name) {
      alert('Preencha todos os campos obrigatórios')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onSaved()
      onClose()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-2">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Novo Agendamento</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Instância */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Instância WhatsApp <span className="text-red-500">*</span>
            </label>
            <select
              value={form.instance_name}
              onChange={(e) => setForm((f) => ({ ...f, instance_name: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {instances.map((i) => (
                <option key={i.instance_name} value={i.instance_name}>
                  {i.apelido ?? i.instance_name}
                </option>
              ))}
            </select>
          </div>

          {/* Nome e telefone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Nome do cliente <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="João Silva"
                value={form.contato_nome}
                onChange={(e) => setForm((f) => ({ ...f, contato_nome: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Telefone <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="51999999999"
                value={form.contato_telefone}
                onChange={(e) => setForm((f) => ({ ...f, contato_telefone: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Serviço */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Serviço</label>
            <input
              type="text"
              placeholder="Ex: Corte de cabelo, Consulta, Limpeza dental..."
              value={form.servico}
              onChange={(e) => setForm((f) => ({ ...f, servico: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Data/hora */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Data e horário <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={form.data_hora}
              onChange={(e) => setForm((f) => ({ ...f, data_hora: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Antecedência do lembrete */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Enviar lembrete com antecedência de
            </label>
            <div className="flex items-center gap-3">
              <select
                value={form.antecedencia_horas}
                onChange={(e) => setForm((f) => ({ ...f, antecedencia_horas: parseInt(e.target.value) }))}
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value={1}>1 hora</option>
                <option value={2}>2 horas</option>
                <option value={4}>4 horas</option>
                <option value={6}>6 horas</option>
                <option value={12}>12 horas</option>
                <option value={24}>24 horas</option>
                <option value={48}>48 horas</option>
              </select>
              <p className="text-sm text-gray-500">antes do agendamento</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Salvar agendamento
          </button>
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// Modal Novo "Me Chama Depois" manual
// ----------------------------------------------------------------
function ModalMeChama({
  onClose,
  onSaved,
  instances,
}: {
  onClose: () => void
  onSaved: () => void
  instances: TenantInstance[]
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    instance_name: instances[0]?.instance_name ?? '',
    contato_nome: '',
    contato_telefone: '',
    mensagem_inicial: 'Olá {{nome}}! Você pediu para eu entrar em contato agora. Como posso ajudar? 😊',
    agendado_para: '',
  })

  async function handleSubmit() {
    if (!form.contato_nome || !form.contato_telefone || !form.agendado_para || !form.mensagem_inicial) {
      alert('Preencha todos os campos obrigatórios')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/scheduled-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          variaveis: { nome: form.contato_nome },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onSaved()
      onClose()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-purple-50 p-2">
              <Phone className="h-5 w-5 text-purple-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Agendar Recontato</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Instância WhatsApp</label>
            <select
              value={form.instance_name}
              onChange={(e) => setForm((f) => ({ ...f, instance_name: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              {instances.map((i) => (
                <option key={i.instance_name} value={i.instance_name}>
                  {i.apelido ?? i.instance_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="Nome do cliente"
                value={form.contato_nome}
                onChange={(e) => setForm((f) => ({ ...f, contato_nome: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Telefone <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="51999999999"
                value={form.contato_telefone}
                onChange={(e) => setForm((f) => ({ ...f, contato_telefone: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Quando contatar <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={form.agendado_para}
              onChange={(e) => setForm((f) => ({ ...f, agendado_para: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Mensagem de abertura <span className="text-sm text-gray-400">(use {'{{nome}}'} para o nome)</span>
            </label>
            <textarea
              rows={3}
              value={form.mensagem_inicial}
              onChange={(e) => setForm((f) => ({ ...f, mensagem_inicial: e.target.value }))}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Agendar recontato
          </button>
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// Página principal
// ----------------------------------------------------------------
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
        const params = new URLSearchParams({
          page: String(page),
          limit: String(LIMIT),
          ...(filterStatus && { status: filterStatus }),
        })
        const res = await fetch(`/api/agendamentos?${params}`)
        const json = await res.json()
        setAppointments(json.data ?? [])
        setTotalCount(json.count ?? 0)
      } else {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(LIMIT),
          ...(filterStatus && { status: filterStatus }),
          tipo: 'me_chama_depois',
        })
        const res = await fetch(`/api/scheduled-tasks?${params}`)
        const json = await res.json()
        setTasks(json.data ?? [])
        setTotalCount(json.count ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [tab, page, filterStatus])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    async function fetchInstances() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData) return
      const { data } = await supabase
        .from('tenant_instances')
        .select('instance_name, apelido, status')
        .eq('tenant_id', userData.tenant_id)
        .eq('status', 'open')
      setInstances(data ?? [])
    }
    fetchInstances()
  }, [supabase])

  async function cancelarTask(id: string) {
    await fetch(`/api/scheduled-tasks?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  async function cancelarAgendamento(id: string) {
    await fetch(`/api/agendamentos`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'cancelado' }),
    })
    fetchData()
  }

  async function confirmarAgendamento(id: string) {
    await fetch(`/api/agendamentos`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'confirmado' }),
    })
    fetchData()
  }

  const totalPages = Math.ceil(totalCount / LIMIT)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl space-y-6 p-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agendamentos</h1>
            <p className="text-sm text-gray-500">Gerencie lembretes e recontatos proativos</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setModalRecontato(true)}
              className="flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-medium text-purple-700 hover:bg-purple-100"
            >
              <Phone className="h-4 w-4" />
              Agendar recontato
            </button>
            <button
              onClick={() => setModalAgendamento(true)}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Novo agendamento
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
          {[
            { key: 'agendamentos', label: 'Agendamentos', icon: Calendar },
            { key: 'recontatos', label: 'Recontatos', icon: Phone },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setTab(key as typeof tab); setPage(1); setFilterStatus('') }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3">
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="">Todos os status</option>
            {tab === 'agendamentos' ? (
              <>
                <option value="pendente">Pendente</option>
                <option value="confirmado">Confirmado</option>
                <option value="cancelado">Cancelado</option>
                <option value="concluido">Concluído</option>
              </>
            ) : (
              <>
                <option value="pendente">Agendado</option>
                <option value="enviado">Enviado</option>
                <option value="falhou">Falhou</option>
                <option value="cancelado">Cancelado</option>
              </>
            )}
          </select>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <span className="text-sm text-gray-400">{totalCount} registro{totalCount !== 1 ? 's' : ''}</span>
        </div>

        {/* Lista Agendamentos */}
        {tab === 'agendamentos' && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : appointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Calendar className="h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">Nenhum agendamento encontrado</p>
                <button
                  onClick={() => setModalAgendamento(true)}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  Criar o primeiro agendamento
                </button>
              </div>
            ) : (
              <table className="w-full">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Cliente</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Serviço</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Data/Hora</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Lembrete</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {appointments.map((appt) => {
                    const sc = STATUS_CONFIG[appt.status]
                    const StatusIcon = sc.icon
                    return (
                      <tr key={appt.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                              <User className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{appt.contato_nome}</p>
                              <p className="text-xs text-gray-400">{appt.contato_telefone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Scissors className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-700">{appt.servico ?? '—'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{formatDate(appt.data_hora)}</p>
                            <p className="text-xs text-gray-400">{formatTime(appt.data_hora)}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${sc.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {appt.lembrete_enviado ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-green-600">
                              <Bell className="h-3.5 w-3.5" /> Enviado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                              <BellOff className="h-3.5 w-3.5" /> {appt.antecedencia_horas}h antes
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {appt.status === 'pendente' && (
                              <button
                                onClick={() => confirmarAgendamento(appt.id)}
                                className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                              >
                                Confirmar
                              </button>
                            )}
                            {(appt.status === 'pendente' || appt.status === 'confirmado') && (
                              <button
                                onClick={() => cancelarAgendamento(appt.id)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Lista Recontatos */}
        {tab === 'recontatos' && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Phone className="h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">Nenhum recontato agendado</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Cliente</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Agendado para</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Origem</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Mensagem</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tasks.map((task) => {
                    const sc = TASK_STATUS_CONFIG[task.status]
                    return (
                      <tr key={task.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-50">
                              <User className="h-4 w-4 text-purple-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{task.contato_nome}</p>
                              <p className="text-xs text-gray-400">{task.contato_telefone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{formatDate(task.agendado_para)}</p>
                            <p className="text-xs text-gray-400">{formatTime(task.agendado_para)}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                            task.criado_por ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
                          }`}>
                            {task.criado_por ? (
                              <><User className="h-3 w-3" /> Operador</>
                            ) : (
                              <><Clock className="h-3 w-3" /> Agente IA</>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${sc.color}`}>
                            {sc.label}
                          </span>
                          {task.erro && (
                            <p className="mt-1 text-xs text-red-500 max-w-[150px] truncate" title={task.erro}>
                              {task.erro}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="max-w-[200px] truncate text-xs text-gray-500" title={task.mensagem_inicial}>
                            {task.mensagem_inicial}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {task.status === 'pendente' && (
                            <button
                              onClick={() => cancelarTask(task.id)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modais */}
      {modalAgendamento && (
        <ModalNovoAgendamento
          onClose={() => setModalAgendamento(false)}
          onSaved={fetchData}
          instances={instances}
        />
      )}
      {modalRecontato && (
        <ModalMeChama
          onClose={() => setModalRecontato(false)}
          onSaved={fetchData}
          instances={instances}
        />
      )}
    </div>
  )
}