'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
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
  ArrowLeft,
  CalendarClock,
  Loader2,
  Pencil,
  Save,
  ShieldAlert,
  Trash2,
  UserCog,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { TableShell } from '@/components/crm/TableShell'
import { guardSuperadmin, saFetch, formatINR, formatDate } from '@/lib/superadmin-client'
import { startImpersonation } from '@/lib/impersonation'
import { ROLE_LABELS } from '@/lib/permissions-client'

const NUMERIC_LIMITS = [
  { key: 'maxBrands', label: 'Max brands', usageKey: 'brands' },
  { key: 'maxAgents', label: 'Max staff seats', usageKey: 'agents' },
  { key: 'maxLeadsPerMonth', label: 'Leads / month', usageKey: 'leadsThisMonth' },
]

const FEATURE_LIMITS = [
  { key: 'automation', label: 'Automation' },
  { key: 'whatsappAutomation', label: 'WhatsApp automation' },
  { key: 'apiIngest', label: 'API lead ingest' },
]

export default function AgencyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const agencyId = params?.id

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null)
  // Override inputs are held as strings so an empty field can mean "inherit"
  // rather than collapsing to 0.
  const [overrides, setOverrides] = useState({})
  const [purgeOpen, setPurgeOpen] = useState(false)
  const [purgeConfirm, setPurgeConfirm] = useState('')
  const [purging, setPurging] = useState(false)
  const [editingUserId, setEditingUserId] = useState(null)
  const [editingUserName, setEditingUserName] = useState('')
  const [savingUserName, setSavingUserName] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await saFetch(`/api/superadmin/agencies/${agencyId}`)
      setData(res)
      const a = res.agency
      setForm({
        name: a.name || '',
        email: a.email || '',
        phone: a.phone || '',
        subscriptionStatus: a.subscriptionStatus || 'trialing',
        walletCredits: a.walletCredits ?? 0,
        isActive: a.isActive !== false,
        platformNotes: a.platformNotes || '',
      })
      const o = a.planOverrides || {}
      setOverrides({
        maxBrands: o.maxBrands ?? '',
        maxAgents: o.maxAgents ?? '',
        maxLeadsPerMonth: o.maxLeadsPerMonth ?? '',
        automation: o.automation,
        whatsappAutomation: o.whatsappAutomation,
        apiIngest: o.apiIngest,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [agencyId])

  useEffect(() => {
    if (!guardSuperadmin()) return
    load()
  }, [load])

  const patch = async (body, successMessage = 'Saved') => {
    setSaving(true)
    try {
      await saFetch(`/api/superadmin/agencies/${agencyId}`, { method: 'PATCH', body })
      toast.success(successMessage)
      await load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const saveProfile = () =>
    patch({
      name: form.name,
      email: form.email,
      phone: form.phone,
      subscriptionStatus: form.subscriptionStatus,
      walletCredits: Number(form.walletCredits),
      platformNotes: form.platformNotes,
    })

  const renewSubscription = () => patch({ renew: true }, 'Subscription renewed for 1 month')

  const saveUserName = async (userId) => {
    if (!editingUserName.trim()) {
      toast.error('Name cannot be empty')
      return
    }
    setSavingUserName(true)
    try {
      await saFetch('/api/superadmin/users', {
        method: 'PATCH',
        body: { userId, name: editingUserName.trim() },
      })
      toast.success('Name updated')
      setEditingUserId(null)
      await load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingUserName(false)
    }
  }

  const saveOverrides = () => {
    // `null` clears an override server-side; a blank field means the same here.
    const payload = {}
    for (const { key } of NUMERIC_LIMITS) {
      payload[key] = overrides[key] === '' || overrides[key] === null ? null : Number(overrides[key])
    }
    for (const { key } of FEATURE_LIMITS) {
      payload[key] = overrides[key] === undefined ? null : overrides[key]
    }
    return patch({ planOverrides: payload }, 'Limit overrides saved')
  }

  const toggleSuspension = async () => {
    const suspending = form.isActive
    if (suspending) {
      const reason = prompt(
        `Suspend "${data.agency.name}"?\n\nEvery user in this workspace will be signed out and blocked from logging in.\n\nReason (optional):`
      )
      if (reason === null) return
      await patch({ isActive: false, suspensionReason: reason || undefined }, 'Agency suspended')
    } else {
      await patch({ isActive: true }, 'Agency reactivated')
    }
  }

  const impersonate = async (userId, label) => {
    if (!confirm(`Start a 30-minute support session as ${label}? Every action is recorded.`)) return
    try {
      const res = await saFetch('/api/superadmin/impersonate', {
        method: 'POST',
        body: { userId },
      })
      startImpersonation(res)
      window.location.href = '/dashboard'
    } catch (e) {
      toast.error(e.message)
    }
  }

  const purge = async () => {
    setPurging(true)
    try {
      const res = await saFetch(
        `/api/superadmin/agencies/${agencyId}?purge=true&confirm=${encodeURIComponent(purgeConfirm)}`,
        { method: 'DELETE' }
      )
      toast.success(res.message)
      router.push('/dashboard/platform/agencies')
    } catch (e) {
      toast.error(e.message)
      setPurging(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !data || !form) {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href="/dashboard/platform/agencies">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to agencies
          </Link>
        </Button>
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error || 'Agency not found'}</span>
        </div>
      </div>
    )
  }

  const { agency, users, brands, limits, usage } = data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard/platform/agencies">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{agency.name}</h2>
            <p className="text-xs text-muted-foreground">
              Created {formatDate(agency.createdAt)} · Owner {agency.owner?.email || '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {agency.isActive === false ? (
            <Badge variant="destructive">Suspended</Badge>
          ) : (
            <Badge variant="secondary" className="capitalize">
              {agency.subscriptionStatus}
            </Badge>
          )}
          <Button variant={form.isActive ? 'destructive' : 'default'} onClick={toggleSuspension} disabled={saving}>
            <ShieldAlert className="mr-2 h-4 w-4" />
            {form.isActive ? 'Suspend' : 'Reactivate'}
          </Button>
        </div>
      </div>

      {agency.isActive === false && agency.suspensionReason && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Suspended {formatDate(agency.suspendedAt)} — {agency.suspensionReason}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Users', value: users.length },
          { label: 'Leads', value: usage.leads.toLocaleString('en-IN') },
          { label: 'Bookings', value: usage.bookings.toLocaleString('en-IN') },
          { label: 'Revenue', value: formatINR(usage.revenue) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <CalendarClock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Subscription access</p>
              {agency.subscriptionExpiresAt ? (
                (() => {
                  const days = Math.ceil(
                    (new Date(agency.subscriptionExpiresAt).getTime() - Date.now()) / 86_400_000
                  )
                  return (
                    <p className="text-sm text-muted-foreground">
                      {days < 0 ? (
                        <span className="font-medium text-destructive">Expired {formatDate(agency.subscriptionExpiresAt)}</span>
                      ) : (
                        <>
                          Expires {formatDate(agency.subscriptionExpiresAt)}{' '}
                          <span className={days <= 7 ? 'font-medium text-amber-500' : ''}>
                            ({days} day{days === 1 ? '' : 's'} left)
                          </span>
                        </>
                      )}
                    </p>
                  )
                })()
              ) : (
                <p className="text-sm text-muted-foreground">No expiry set</p>
              )}
            </div>
          </div>
          <Button onClick={renewSubscription} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}
            Renew +1 month
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile &amp; Subscription</CardTitle>
            <CardDescription>Status and workspace contact details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Agency name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Subscription status</Label>
              <Select
                value={form.subscriptionStatus}
                onValueChange={(subscriptionStatus) => setForm({ ...form, subscriptionStatus })}
              >
                <SelectTrigger className="w-full sm:w-52">
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
              <Label>Wallet credits</Label>
              <Input
                type="number"
                min={0}
                value={form.walletCredits}
                onChange={(e) => setForm({ ...form, walletCredits: e.target.value })}
              />
            </div>
            <div>
              <Label>Internal notes</Label>
              <Textarea
                rows={3}
                value={form.platformNotes}
                onChange={(e) => setForm({ ...form, platformNotes: e.target.value })}
                placeholder="Only visible to platform admins."
              />
            </div>
            <Button onClick={saveProfile} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limits &amp; Overrides</CardTitle>
            <CardDescription>
              Blank inherits the default value. Anything you set here applies to this agency only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {NUMERIC_LIMITS.map((l) => {
              const used = usage[l.usageKey] ?? 0
              const effective = limits[l.key]
              const pct = effective ? Math.min(100, Math.round((used / effective) * 100)) : 0
              return (
                <div key={l.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm">{l.label}</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {used} / {effective}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        className="w-24"
                        placeholder="inherit"
                        value={overrides[l.key]}
                        onChange={(e) => setOverrides({ ...overrides, [l.key]: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={pct >= 100 ? 'h-full bg-destructive' : 'h-full bg-primary'}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}

            <div className="space-y-3 border-t pt-4">
              {FEATURE_LIMITS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm">{f.label}</Label>
                    <p className="text-xs text-muted-foreground">
                      {overrides[f.key] === undefined
                        ? `Inheriting default (${limits[f.key] ? 'on' : 'off'})`
                        : 'Overridden for this agency'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={overrides[f.key] === undefined ? Boolean(limits[f.key]) : Boolean(overrides[f.key])}
                      onCheckedChange={(v) => setOverrides({ ...overrides, [f.key]: v })}
                    />
                    {overrides[f.key] !== undefined && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOverrides({ ...overrides, [f.key]: undefined })}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={saveOverrides} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save overrides
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team ({users.length})</CardTitle>
          <CardDescription>
            Everyone in this workspace. Use the support button to act as a user for 30 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TableShell minWidth="44rem">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead className="text-right">Support</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={String(u._id)}>
                    <TableCell className="font-medium">
                      {editingUserId === String(u._id) ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={editingUserName}
                            onChange={(e) => setEditingUserName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveUserName(u._id)}
                            className="h-8 w-36"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            className="h-8 px-2"
                            disabled={savingUserName}
                            onClick={() => saveUserName(u._id)}
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={() => setEditingUserId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="flex items-center gap-1.5 hover:underline"
                          onClick={() => {
                            setEditingUserId(String(u._id))
                            setEditingUserName(u.name || '')
                          }}
                        >
                          {u.name}
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ROLE_LABELS[u.role] || u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {u.isBlocked || !u.isActive ? (
                        <Badge variant="destructive">Suspended</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.lastLogin ? formatDate(u.lastLogin) : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={u.isBlocked}
                        onClick={() => impersonate(u._id, `${u.name} (${u.email})`)}
                      >
                        <UserCog className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
          <p className="mt-3 text-xs text-muted-foreground">
            Add, remove or re-role users from{' '}
            <Link href={`/dashboard/platform/users?teamId=${agencyId}`} className="underline">
              All Users
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brands ({brands.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {brands.length === 0 ? (
            <p className="text-sm text-muted-foreground">No brands.</p>
          ) : (
            brands.map((b) => (
              <Badge key={String(b._id)} variant={b.isActive === false ? 'outline' : 'secondary'}>
                {b.name}
                {b.isDefault ? ' · default' : ''}
              </Badge>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Permanently erase this agency and every lead, booking, invoice, itinerary and user
            belonging to it. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setPurgeOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete agency permanently
          </Button>
        </CardContent>
      </Card>

      <Dialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete “{agency.name}”?</DialogTitle>
            <DialogDescription>
              This erases the workspace and all of its data across every collection. There is no
              backup and no undo. Type the agency name exactly to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              placeholder={agency.name}
            />
            <Button
              variant="destructive"
              className="w-full"
              disabled={purging || purgeConfirm.trim() !== agency.name.trim()}
              onClick={purge}
            >
              {purging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              I understand — delete everything
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
