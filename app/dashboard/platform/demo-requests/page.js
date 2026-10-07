'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  Building2,
  X,
  Search,
  Users,
  PhoneCall,
  CheckCircle2,
  Clock,
  CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { TableShell } from '@/components/crm/TableShell'
import { guardSuperadmin, saFetch, formatDate } from '@/lib/superadmin-client'

const STATUS_PILL = {
  new: { tone: 'blue', label: 'New' },
  contacted: { tone: 'green', label: 'Contacted' },
  converted: { tone: 'violet', label: 'Converted' },
  dismissed: { tone: 'red', label: 'Dismissed' },
}

function Avatar({ letter }) {
  const ch = String(letter || '?').trim().charAt(0).toUpperCase() || '?'
  const hues = ['from-blue-500 to-indigo-600', 'from-pink-500 to-rose-600', 'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600']
  const tone = hues[ch.charCodeAt(0) % hues.length]
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${tone} text-sm font-bold text-white`}>
      {ch}
    </div>
  )
}

function StatusPill({ tone, label }) {
  const box = {
    blue: 'bg-sky-500/15 text-sky-500 border-sky-500/30',
    green: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    violet: 'bg-violet-500/15 text-violet-500 border-violet-500/30',
    red: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
  }
  const dot = { blue: 'bg-sky-500', green: 'bg-emerald-500', violet: 'bg-violet-500', red: 'bg-rose-500' }
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${box[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} />
      {label}
    </span>
  )
}

export default function DemoRequestsPage() {
  const router = useRouter()
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState({ total: 0, newThisMonth: 0, contacted: 0, pending: 0 })
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '25' })
      if (statusFilter !== 'all') qs.set('status', statusFilter)
      if (search.trim()) qs.set('search', search.trim())
      const data = await saFetch(`/api/demo-requests?${qs}`)
      setRows(data.requests || [])
      if (data.summary) setSummary(data.summary)
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 })
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, search])

  useEffect(() => {
    if (!guardSuperadmin()) return
    load()
  }, [load])

  // Typing resets to page 1 — same debounce pattern the Leads/Agencies
  // search boxes use, so every keystroke doesn't hit the API.
  useEffect(() => {
    const id = setTimeout(() => setPage(1), 350)
    return () => clearTimeout(id)
  }, [search])

  const setStatus = async (id, status) => {
    try {
      await saFetch(`/api/demo-requests/${id}`, { method: 'PATCH', body: { status } })
      setRows((prev) => prev.map((r) => (r._id === id ? { ...r, status } : r)))
    } catch (e) {
      toast.error(e.message)
    }
  }

  const convertToAgency = (r) => {
    const qs = new URLSearchParams({
      demoId: r._id,
      ownerName: r.name || '',
      ownerEmail: r.email || '',
      ownerPhone: r.phone || '',
      name: r.name ? `${r.name}'s Workspace` : '',
    })
    router.push(`/dashboard/platform/agencies?${qs}`)
  }

  const STAT_CARDS = [
    { key: 'all', label: 'Total Requests', sub: 'All demo requests', value: summary.total, icon: Users, tile: 'from-blue-500 to-blue-600' },
    { key: 'new', label: 'New Requests', sub: 'This month', value: summary.newThisMonth, icon: PhoneCall, tile: 'from-sky-500 to-cyan-600' },
    { key: 'contacted', label: 'Contacted', sub: 'Already contacted', value: summary.contacted, icon: CheckCircle2, tile: 'from-emerald-500 to-emerald-600' },
    { key: 'pending', label: 'Pending', sub: 'Yet to contact', value: summary.pending, icon: Clock, tile: 'from-orange-400 to-orange-500' },
  ]

  const from = pagination.total ? (pagination.page - 1) * 25 + 1 : 0
  const to = Math.min(pagination.page * 25, pagination.total)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Demo Requests</h1>
        <p className="text-sm text-muted-foreground">
          Leads from the &apos;Book a Demo&apos; form on the marketing site. Convert one into an agency to provision their workspace.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {STAT_CARDS.map((c) => {
          const Icon = c.icon
          const active = c.key !== 'all' && (c.key === 'pending' ? statusFilter === 'new' : statusFilter === c.key)
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setPage(1)
                const target = c.key === 'all' ? 'all' : c.key === 'pending' ? 'new' : c.key
                setStatusFilter(statusFilter === target ? 'all' : target)
              }}
              className={`flex items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition hover:shadow-md ${active ? 'border-primary' : ''}`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${c.tile} text-white`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{c.label}</p>
                <p className="text-xl font-bold tabular-nums">{c.value ?? 0}</p>
                <p className="truncate text-[11px] text-muted-foreground">{c.sub}</p>
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder="Search by name, email, phone or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setPage(1)
            setStatusFilter(v)
          }}
        >
          <SelectTrigger className="h-10 w-full lg:w-52">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <TableShell minWidth="56rem">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Preferred Date</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <Loader2 className="inline h-6 w-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    No demo requests match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const pill = STATUS_PILL[r.status] || { tone: 'blue', label: r.status }
                  return (
                    <TableRow key={r._id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar letter={r.name} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{r.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.phone || '—'}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{r.address || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CalendarDays className="h-4 w-4" />
                          {r.preferredDate ? formatDate(r.preferredDate) : '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CalendarDays className="h-4 w-4" />
                          {formatDate(r.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={pill.tone} label={pill.label} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          {r.status !== 'converted' && (
                            <Button
                              size="sm"
                              onClick={() => convertToAgency(r)}
                              className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:opacity-90"
                            >
                              <Building2 className="mr-1.5 h-3.5 w-3.5" />
                              Create agency
                            </Button>
                          )}
                          {r.status === 'new' && (
                            <Button size="sm" variant="outline" onClick={() => setStatus(r._id, 'contacted')}>
                              Mark contacted
                            </Button>
                          )}
                          {r.status !== 'dismissed' && r.status !== 'converted' && (
                            <Button size="sm" variant="outline" onClick={() => setStatus(r._id, 'dismissed')}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableShell>

        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground">
            Showing {from} to {to} of {pagination.total} requests
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="px-3 tabular-nums">
              {pagination.page} / {pagination.pages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
