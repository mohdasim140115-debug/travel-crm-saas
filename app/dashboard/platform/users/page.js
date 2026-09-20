'use client'

import { useCallback, useEffect, useState } from 'react'
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
import {
  Building2,
  KeyRound,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  ShieldOff,
  Trash2,
  UserCheck,
  UserCog,
  Users as UsersIcon,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/crm/PageHeader'
import { TableShell } from '@/components/crm/TableShell'
import { guardSuperadmin, saFetch, formatDate } from '@/lib/superadmin-client'
import { startImpersonation } from '@/lib/impersonation'
import { ROLE_LABELS } from '@/lib/permissions-client'

const ROLES = [
  { value: 'agent', label: 'Sales Employee' },
  { value: 'manager', label: 'Sales Lead' },
  { value: 'operations', label: 'Operations' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'admin', label: 'Owner' },
  { value: 'superadmin', label: 'Platform Super Admin' },
]

// Deterministic pastel color per user (by name) so the same person always
// gets the same avatar tint across reloads, without storing anything.
const AVATAR_PALETTE = [
  'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  'bg-pink-500/15 text-pink-600 dark:text-pink-400',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
]

function avatarColor(name) {
  const str = name || '?'
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

function formatTime(value) {
  if (!value) return null
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// A compact page-number strip (1 2 3 … 18) instead of just Prev/Next — same
// `page`/`setPage` state underneath, just a friendlier way to jump around.
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, total, current - 1, current, current + 1])
  return Array.from(pages)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b)
    .reduce((acc, p, i, arr) => {
      if (i > 0 && p - arr[i - 1] > 1) acc.push('…')
      acc.push(p)
      return acc
    }, [])
}

const EMPTY_USER = {
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'agent',
  teamId: '',
  leadAssignmentWeight: 1,
}

export default function PlatformUsersPage() {
  const [rows, setRows] = useState([])
  const [agencies, setAgencies] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 50 })
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    pendingUsers: 0,
    suspendedUsers: 0,
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(EMPTY_USER)
  const [resetTarget, setResetTarget] = useState(null)
  const [newPassword, setNewPassword] = useState('')

  // Read from location rather than useSearchParams so the page needs no
  // Suspense boundary at build time.
  useEffect(() => {
    const teamId = new URLSearchParams(window.location.search).get('teamId')
    if (teamId) setTeamFilter(teamId)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '50' })
      if (search.trim()) qs.set('search', search.trim())
      if (roleFilter !== 'all') qs.set('role', roleFilter)
      if (teamFilter !== 'all') qs.set('teamId', teamFilter)
      if (statusFilter !== 'all') qs.set('status', statusFilter)
      const data = await saFetch(`/api/superadmin/users?${qs}`)
      setRows(data.users || [])
      setAgencies(data.agencies || [])
      setPagination(data.pagination || { page: 1, pages: 1, total: 0, limit: 50 })
      if (data.stats) setStats(data.stats)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [page, search, roleFilter, teamFilter, statusFilter])

  useEffect(() => {
    if (!guardSuperadmin()) return
    const id = setTimeout(load, 300)
    return () => clearTimeout(id)
  }, [load])

  const patchUser = async (userId, body, message = 'Updated') => {
    try {
      await saFetch('/api/superadmin/users', { method: 'PATCH', body: { userId, ...body } })
      toast.success(message)
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const createUser = async () => {
    setCreating(true)
    try {
      const body = { ...draft }
      if (body.role === 'superadmin' && !body.teamId) delete body.teamId
      await saFetch('/api/superadmin/users', { method: 'POST', body })
      toast.success('User created')
      setCreateOpen(false)
      setDraft(EMPTY_USER)
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCreating(false)
    }
  }

  const removeUser = async (user) => {
    const purge = confirm(
      `Remove ${user.email}?\n\nOK = permanently delete the record.\nCancel = you'll be asked to deactivate instead.`
    )
    if (!purge && !confirm(`Deactivate ${user.email} instead?`)) return
    try {
      const res = await saFetch(
        `/api/superadmin/users?userId=${user._id}${purge ? '&purge=true' : ''}`,
        { method: 'DELETE' }
      )
      toast.success(res.message)
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const impersonate = async (user) => {
    if (!confirm(`Start a 30-minute support session as ${user.email}? Every action is recorded.`)) return
    try {
      const res = await saFetch('/api/superadmin/impersonate', {
        method: 'POST',
        body: { userId: user._id },
      })
      startImpersonation(res)
      window.location.href = '/dashboard'
    } catch (e) {
      toast.error(e.message)
    }
  }

  const resetFilters = () => {
    setPage(1)
    setSearch('')
    setRoleFilter('all')
    setTeamFilter('all')
    setStatusFilter('all')
  }

  const STAT_CARDS = [
    { label: 'Total Users', value: stats.totalUsers, caption: 'Across all agencies', icon: UsersIcon, tint: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    { label: 'Active Users', value: stats.activeUsers, caption: 'Currently active', icon: UserCheck, tint: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    { label: 'Pending Approval', value: stats.pendingUsers, caption: 'Awaiting approval', icon: Clock, tint: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    { label: 'Suspended', value: stats.suspendedUsers, caption: 'Temporarily blocked', icon: ShieldOff, tint: 'bg-destructive/10 text-destructive' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        description="Every account across every agency. Change roles, move users between agencies, reset passwords or suspend access."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New User
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((s) => (
          <Card key={s.label} className="gap-0 border-border/60 py-4 shadow-sm">
            <CardContent className="flex items-center gap-3 px-4">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${s.tint}`}>
                <s.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.caption}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="py-4">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 sm:min-w-50">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Name, email or phone…"
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
            />
          </div>
          <Select
            value={teamFilter}
            onValueChange={(v) => {
              setPage(1)
              setTeamFilter(v)
            }}
          >
            <SelectTrigger className="w-full sm:w-45">
              <SelectValue placeholder="Agency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agencies</SelectItem>
              {agencies.map((a) => (
                <SelectItem key={String(a._id)} value={String(a._id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={roleFilter}
            onValueChange={(v) => {
              setPage(1)
              setRoleFilter(v)
            }}
          >
            <SelectTrigger className="w-full sm:w-42.5">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setPage(1)
              setStatusFilter(v)
            }}
          >
            <SelectTrigger className="w-full sm:w-42.5">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending approval</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={resetFilters}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <TableShell minWidth="80rem">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    User
                  </TableHead>
                  <TableHead className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Agency
                  </TableHead>
                  <TableHead className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Role
                  </TableHead>
                  <TableHead className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Last login
                  </TableHead>
                  <TableHead className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center">
                      <Loader2 className="inline h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      No users match these filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((u) => (
                    <TableRow key={String(u._id)} className="even:bg-muted/30">
                      <TableCell className="px-4 py-5 align-middle">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarColor(u.name)}`}
                          >
                            {initials(u.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold">{u.name}</p>
                            <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle">
                        <Select
                          value={u.teamId?._id ? String(u.teamId._id) : ''}
                          onValueChange={(teamId) =>
                            patchUser(u._id, { teamId }, 'Moved to a different agency')
                          }
                        >
                          <SelectTrigger className="w-52" title={u.teamId?.name || ''}>
                            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-left">
                              <SelectValue placeholder={u.role === 'superadmin' ? 'Platform' : 'None'} />
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {agencies.map((a) => (
                              <SelectItem key={String(a._id)} value={String(a._id)}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle">
                        <Select value={u.role} onValueChange={(role) => patchUser(u._id, { role })}>
                          <SelectTrigger className="w-42.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle">
                        {u.approvalStatus === 'pending' ? (
                          <div className="space-y-1.5">
                            <Badge className="bg-warning text-white">Pending approval</Badge>
                            {u.requestedBy?.name && (
                              <p className="text-xs text-muted-foreground">by {u.requestedBy.name}</p>
                            )}
                          </div>
                        ) : u.isBlocked || !u.isActive ? (
                          <Badge variant="destructive">Suspended</Badge>
                        ) : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle text-sm">
                        {u.lastLogin ? (
                          <>
                            <p>{formatDate(u.lastLogin)}</p>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="h-1.5 w-1.5 rounded-full bg-success" />
                              {formatTime(u.lastLogin)}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle">
                        {u.approvalStatus === 'pending' ? (
                          <div className="flex flex-nowrap justify-end gap-1.5 whitespace-nowrap">
                            <Button
                              size="sm"
                              className="h-8 px-3"
                              onClick={() =>
                                patchUser(u._id, { approvalStatus: 'approved' }, 'Employee approved')
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 px-3"
                              onClick={() => {
                                if (!confirm(`Decline the request to add ${u.email}?`)) return
                                patchUser(u._id, { approvalStatus: 'rejected' }, 'Request declined')
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3"
                              title="Suspend / restore"
                              onClick={() =>
                                patchUser(u._id, { isBlocked: !u.isBlocked, isActive: !!u.isBlocked })
                              }
                            >
                              {u.isBlocked ? 'Restore' : 'Suspend'}
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              title="Reset password"
                              onClick={() => setResetTarget(u)}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              title="Impersonate for support"
                              disabled={u.role === 'superadmin' || u.isBlocked || !u.teamId}
                              onClick={() => impersonate(u)}
                            >
                              <UserCog className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="destructive"
                              className="h-8 w-8"
                              title="Remove"
                              onClick={() => removeUser(u)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableShell>

          {!loading && rows.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
              <span className="text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
              </span>
              {pagination.pages > 1 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ‹
                  </Button>
                  {pageWindow(pagination.page, pagination.pages).map((p, i) =>
                    p === '…' ? (
                      <span key={`e${i}`} className="px-1 text-muted-foreground">
                        …
                      </span>
                    ) : (
                      <Button
                        key={p}
                        size="sm"
                        variant={p === pagination.page ? 'default' : 'outline'}
                        className="h-8 w-8 p-0"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    disabled={page >= pagination.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    ›
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New User</DialogTitle>
            <DialogDescription>
              Creates an account inside the chosen agency. Super admins are platform-level and need
              no agency.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full name *</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </div>
            <div>
              <Label>Password * (min 8 characters)</Label>
              <PasswordInput
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={draft.role} onValueChange={(role) => setDraft({ ...draft, role })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.role !== 'superadmin' && (
              <div>
                <Label>Agency *</Label>
                <Select value={draft.teamId} onValueChange={(teamId) => setDraft({ ...draft, teamId })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agency" />
                  </SelectTrigger>
                  <SelectContent>
                    {agencies.map((a) => (
                      <SelectItem key={String(a._id)} value={String(a._id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {['agent', 'manager'].includes(draft.role) && (
              <div>
                <Label>Lead distribution weight</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={draft.leadAssignmentWeight}
                  onChange={(e) =>
                    setDraft({ ...draft, leadAssignmentWeight: Number(e.target.value) })
                  }
                />
              </div>
            )}
            <Button className="w-full" onClick={createUser} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create User
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={() => setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              {resetTarget?.email} will be signed out of every device immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <PasswordInput
              placeholder="New password (min 8 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Button
              className="w-full"
              disabled={newPassword.length < 8}
              onClick={() => {
                patchUser(resetTarget._id, { resetPassword: newPassword }, 'Password reset')
                setResetTarget(null)
                setNewPassword('')
              }}
            >
              Reset password
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
