'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Building2, Loader2, Plus, Search, UserCog, ArrowRight, Plane, CheckCircle2, Clock, Ban, Users, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { TableShell } from '@/components/crm/TableShell'
import { guardSuperadmin, saFetch, formatINR, formatDate } from '@/lib/superadmin-client'
import { startImpersonation } from '@/lib/impersonation'

function expiryLabel(date) {
  if (!date) return <span className="text-muted-foreground">—</span>
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return <span className="text-destructive font-medium">Expired</span>
  if (days === 0) return <span className="text-destructive font-medium">Expires today</span>
  if (days <= 7) return <span className="text-amber-500 font-medium">{days}d left</span>
  return <span className="text-muted-foreground">{days}d left</span>
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'expired', label: 'Expired' },
  { value: 'expiring', label: 'Expiring in 7 days' },
  { value: 'running', label: 'Plan running' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'past_due', label: 'Past due' },
  { value: 'cancelled', label: 'Cancelled' },
]

const EMPTY_AGENCY = {
  name: '',
  plan: 'basic',
  subscriptionStatus: 'trialing',
  subscriptionExpiresAt: '',
  ownerName: '',
  ownerEmail: '',
  ownerPassword: '',
  ownerPhone: '',
  brandName: '',
}

/** yyyy-mm-dd, 1 calendar month from today — the default access window shown
 * (and editable) in the New Agency form. */
function defaultExpiryDate() {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

function daysLeftOf(date) {
  if (!date) return null
  return Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

// Deterministic gradient per name (by hash) so the same agency/owner always
// gets the same tint across reloads, and different agencies don't all look
// like the same blue circle.
const AVATAR_PALETTE = [
  'from-blue-500 to-indigo-600',
  'from-pink-500 to-rose-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
  'from-fuchsia-500 to-pink-600',
  'from-lime-500 to-green-600',
]

function autoTone(name) {
  const str = String(name || '?')
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function Avatar({ letter, tone, small }) {
  const ch = String(letter || '?').trim().charAt(0).toUpperCase() || '?'
  tone = tone || autoTone(letter)
  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br ${tone} font-bold text-white ${
        small ? 'h-8 w-8 rounded-full text-xs' : 'h-10 w-10 rounded-xl text-sm'
      }`}
    >
      {ch}
    </div>
  )
}

function StatusPill({ tone, label }) {
  const box = {
    green: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    red: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
  }
  const dot = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500' }
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${box[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} />
      {label}
    </span>
  )
}

function ExpiryCell({ days }) {
  if (days === null) return <span className="text-muted-foreground">—</span>
  const expired = days < 0
  const urgent = expired || days <= 7
  const bar = urgent ? 'bg-rose-500' : days <= 14 ? 'bg-amber-500' : 'bg-emerald-500'
  const pct = Math.max(0, Math.min(100, (days / 30) * 100))
  return (
    <div className="w-36">
      <p className={`text-sm font-medium ${urgent ? 'text-rose-500' : ''}`}>
        {expired ? `Expired ${-days}d ago` : days === 0 ? 'Expires today' : `${days} days left`}
      </p>
      <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
        <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function CountPill({ icon: Icon, value }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-sm font-medium tabular-nums">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {value ?? 0}
    </span>
  )
}

export default function AgenciesPage() {
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ suspended: 0, expired: 0, expiring: 0, active: 0, activeUsers: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(() => ({ ...EMPTY_AGENCY, subscriptionExpiresAt: defaultExpiryDate() }))
  const [demoId, setDemoId] = useState(null)

  // Arriving from a "Book a Demo" request pre-fills the create-agency form
  // with what the lead already gave us instead of retyping it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ownerName = params.get('ownerName')
    const ownerEmail = params.get('ownerEmail')
    if (!ownerName && !ownerEmail) return
    setDraft((prev) => ({
      ...prev,
      name: params.get('name') || prev.name,
      ownerName: ownerName || prev.ownerName,
      ownerEmail: ownerEmail || prev.ownerEmail,
      ownerPhone: params.get('ownerPhone') || prev.ownerPhone,
    }))
    setDemoId(params.get('demoId'))
    setCreateOpen(true)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '25' })
      if (search.trim()) qs.set('search', search.trim())
      if (statusFilter !== 'all') qs.set('status', statusFilter)
      const data = await saFetch(`/api/superadmin/agencies?${qs}`)
      setRows(data.agencies || [])
      if (data.summary) setSummary(data.summary)
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 })
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => {
    if (!guardSuperadmin()) return
    // Debounced so typing in the search box doesn't fire a request per keystroke.
    const id = setTimeout(load, 300)
    return () => clearTimeout(id)
  }, [load])

  const createAgency = async () => {
    setCreating(true)
    try {
      await saFetch('/api/superadmin/agencies', { method: 'POST', body: draft })
      toast.success(`Agency "${draft.name}" created`)
      if (demoId) {
        await saFetch(`/api/demo-requests/${demoId}`, {
          method: 'PATCH',
          body: { status: 'converted' },
        }).catch(() => {})
        setDemoId(null)
      }
      setCreateOpen(false)
      setDraft({ ...EMPTY_AGENCY, subscriptionExpiresAt: defaultExpiryDate() })
      setPage(1)
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCreating(false)
    }
  }

  const impersonateOwner = async (agency) => {
    if (
      !confirm(
        `Start a support session as the owner of "${agency.name}"?\n\nYou will act as that user for 30 minutes and every action is recorded.`
      )
    ) {
      return
    }
    try {
      const data = await saFetch('/api/superadmin/impersonate', {
        method: 'POST',
        body: { teamId: agency._id },
      })
      startImpersonation(data)
      window.location.href = '/dashboard/owner'
    } catch (e) {
      toast.error(e.message)
    }
  }

  const STAT_CARDS = [
    { key: 'all', label: 'Total Agencies', value: summary.total, icon: Building2, tile: 'from-blue-500 to-blue-600' },
    { key: 'active', label: 'Active', value: summary.active, icon: CheckCircle2, tile: 'from-emerald-500 to-emerald-600' },
    { key: 'expiring', label: 'Expiring Soon', value: summary.expiring, icon: Clock, tile: 'from-orange-400 to-orange-500' },
    { key: 'suspended', label: 'Suspended', value: summary.suspended, icon: Ban, tile: 'from-rose-500 to-red-600' },
  ]
  const from = pagination.total ? (pagination.page - 1) * 25 + 1 : 0
  const to = Math.min(pagination.page * 25, pagination.total)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md">
            <Plane className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Travel Agencies</h1>
            <p className="text-sm text-muted-foreground">Manage your travel agency partners, track performance and revenue.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {STAT_CARDS.map((c) => {
            const Icon = c.icon
            const active = c.key !== 'all' && statusFilter === c.key
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setPage(1)
                  setStatusFilter(c.key === 'all' || active ? 'all' : c.key)
                }}
                className={`flex items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition hover:shadow-md ${active ? 'border-primary' : ''}`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${c.tile} text-white`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-xl font-bold tabular-nums">{c.value ?? 0}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder="Search by agency name, email or phone..."
            value={search}
            onChange={(e) => {
              setPage(1)
              setSearch(e.target.value)
            }}
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
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setCreateOpen(true)} className="h-10 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:opacity-90">
          <Plus className="mr-2 h-4 w-4" />
          Add Agency
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {/* On a narrow phone the wide table only ever shows its first column
         * (the avatar) before you scroll right — the name/status/everything
         * else is off-screen. A stacked card per agency shows all of it at
         * once instead, same pattern the rest of the app uses on mobile. */}
        <div className="divide-y md:hidden">
          {loading ? (
            <p className="py-12 text-center text-muted-foreground">
              <Loader2 className="inline h-6 w-6 animate-spin" />
            </p>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">No agencies match these filters.</p>
          ) : (
            rows.map((a) => {
              const days = daysLeftOf(a.subscriptionExpiresAt)
              const expiringSoon = days !== null && days <= 7 && days >= 0
              return (
                <div key={String(a._id)} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar letter={a.name} />
                      <div className="min-w-0">
                        <Link href={`/dashboard/platform/agencies/${a._id}`} className="block truncate font-semibold hover:underline">
                          {a.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{a.email || '—'}</p>
                      </div>
                    </div>
                    {a.isActive === false ? (
                      <StatusPill tone="red" label="Suspended" />
                    ) : expiringSoon ? (
                      <StatusPill tone="amber" label="Expiring Soon" />
                    ) : (
                      <StatusPill tone="green" label="Active" />
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 rounded-lg bg-muted/30 p-2">
                    <Avatar letter={a.owner?.name || '?'} small />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.owner?.name || '—'}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.owner?.email || ''}</p>
                    </div>
                  </div>

                  <ExpiryCell days={days} />

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      Users <CountPill icon={Users} value={a.userCount} />
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      Leads <CountPill icon={Users} value={a.leadCount} />
                    </div>
                    <div className="text-muted-foreground">
                      Revenue <span className="font-medium text-foreground">{formatINR(a.revenue)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" /> {formatDate(a.createdAt)}
                    </div>
                  </div>

                  <Button asChild className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90">
                    <Link href={`/dashboard/platform/agencies/${a._id}`}>
                      Manage
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              )
            })
          )}
        </div>

        <div className="hidden md:block">
        <TableShell minWidth="62rem">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agency</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <Loader2 className="inline h-6 w-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                    No agencies match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((a) => {
                  const days = daysLeftOf(a.subscriptionExpiresAt)
                  const expiringSoon = days !== null && days <= 7 && days >= 0
                  return (
                    <TableRow key={String(a._id)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar letter={a.name} />
                          <div className="min-w-0">
                            <Link href={`/dashboard/platform/agencies/${a._id}`} className="block truncate font-semibold hover:underline">
                              {a.name}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">{a.email || '—'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar letter={a.owner?.name || "?"} small />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{a.owner?.name || '—'}</p>
                            <p className="truncate text-xs text-muted-foreground">{a.owner?.email || ''}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {a.isActive === false ? (
                          <StatusPill tone="red" label="Suspended" />
                        ) : expiringSoon ? (
                          <StatusPill tone="amber" label="Expiring Soon" />
                        ) : (
                          <StatusPill tone="green" label="Active" />
                        )}
                      </TableCell>
                      <TableCell>
                        <ExpiryCell days={days} />
                      </TableCell>
                      <TableCell>
                        <CountPill icon={Users} value={a.userCount} />
                      </TableCell>
                      <TableCell>
                        <CountPill icon={Users} value={a.leadCount} />
                      </TableCell>
                      <TableCell className="tabular-nums font-medium">{formatINR(a.revenue)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CalendarDays className="h-4 w-4" />
                          {formatDate(a.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" asChild className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90">
                            <Link href={`/dashboard/platform/agencies/${a._id}`}>
                              Manage
                              <ArrowRight className="ml-1 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            title="Log in as the owner for support"
                            onClick={() => impersonateOwner(a)}
                          >
                            <UserCog className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableShell>
        </div>

        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground">
            Showing {from} to {to} of {pagination.total} agencies
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              New Agency
            </DialogTitle>
            <DialogDescription>
              Creates the workspace, its owner account and a default brand in one step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Agency name *</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Himalayan Trails Pvt Ltd"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Subscription</Label>
                <Select
                  value={draft.subscriptionStatus}
                  onValueChange={(subscriptionStatus) => setDraft({ ...draft, subscriptionStatus })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trialing">Trialing</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="past_due">Past due</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Access until *</Label>
                <Input
                  type="date"
                  value={draft.subscriptionExpiresAt}
                  onChange={(e) => setDraft({ ...draft, subscriptionExpiresAt: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">Defaults to 1 month from today.</p>
              </div>
            </div>
            <div>
              <Label>Default brand name</Label>
              <Input
                value={draft.brandName}
                onChange={(e) => setDraft({ ...draft, brandName: e.target.value })}
                placeholder="Defaults to the agency name"
              />
            </div>

            <div className="rounded-lg border p-4">
              <p className="mb-3 text-sm font-medium">Owner account</p>
              <div className="space-y-3">
                <div>
                  <Label>Full name *</Label>
                  <Input
                    value={draft.ownerName}
                    onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={draft.ownerEmail}
                    onChange={(e) => setDraft({ ...draft, ownerEmail: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={draft.ownerPhone}
                    onChange={(e) => setDraft({ ...draft, ownerPhone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Temporary password *</Label>
                  <PasswordInput
                    value={draft.ownerPassword}
                    onChange={(e) => setDraft({ ...draft, ownerPassword: e.target.value })}
                    placeholder="Minimum 8 characters"
                  />
                </div>
              </div>
            </div>

            <Button className="w-full" onClick={createAgency} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Agency
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
