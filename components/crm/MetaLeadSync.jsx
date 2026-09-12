'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { PasswordInput } from '@/components/ui/password-input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckCircle2, XCircle, Loader2, RefreshCw, PlugZap, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/auth-client'

function relative(date) {
  if (!date) return 'never'
  const diff = Date.now() - new Date(date).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

/**
 * Self-serve Meta Lead Ads connection.
 *
 * The webhook route needs the agency to configure a callback inside Meta;
 * this only needs a form ID and a page access token, which any agency can copy
 * out of Business Suite. Once saved, the CRM polls Meta on a schedule and the
 * leads land through the same weight-assignment flow as every other source.
 */
export function MetaLeadSync() {
  const [config, setConfig] = useState(null)
  const [formIds, setFormIds] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [busy, setBusy] = useState('')
  const [testResults, setTestResults] = useState(null)
  const [salesMembers, setSalesMembers] = useState([])
  const [assignBusy, setAssignBusy] = useState('')

  const load = async () => {
    const res = await apiFetch('/api/admin/meta-sync')
    if (!res.ok) return
    const data = await res.json()
    setConfig(data)
    setFormIds((data.formIds || []).join(', '))
  }

  useEffect(() => {
    load()
    apiFetch('/api/team/members')
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setSalesMembers((d.members || []).filter((m) => ['agent', 'manager'].includes(m.role))))
      .catch(() => {})
  }, [])

  // Empty list = "All employees" (the normal team-wide round robin);
  // otherwise this form only rotates among the listed ids.
  const poolForForm = (formId) =>
    (config?.formAssignments || []).find((a) => a.formId === formId)?.assignedTo || []

  const setFormPool = async (formId, employeeIds) => {
    setAssignBusy(formId)
    const others = (config?.formAssignments || []).filter((a) => a.formId !== formId)
    const next = [...others, { formId, assignedTo: employeeIds }]
    await save({ formAssignments: next }, { silent: true })
    setAssignBusy('')
    toast.success(
      employeeIds.length
        ? `Form ${formId} now round-robins among ${employeeIds.length} selected employee(s)`
        : `Form ${formId} back to All employees (round robin)`
    )
  }

  const save = async (patch, { silent = false } = {}) => {
    const res = await apiFetch('/api/admin/meta-sync', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error || 'Save failed')
      return false
    }
    setConfig(data)
    if (!silent) toast.success(data.message || 'Saved')
    return true
  }

  const handleSave = async () => {
    setBusy('save')
    // Token is write-only server-side: sending it only when the owner typed a
    // new one means re-saving form IDs never wipes the stored credential.
    const patch = { formIds }
    if (accessToken.trim()) patch.accessToken = accessToken.trim()
    const ok = await save(patch)
    if (ok) setAccessToken('')
    setBusy('')
  }

  const handleTest = async () => {
    setBusy('test')
    setTestResults(null)
    const res = await apiFetch('/api/admin/meta-sync/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        formIds,
        ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
      }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy('')
    if (!res.ok) {
      toast.error(data.error || 'Test failed')
      return
    }
    setTestResults(data.results || [])
    if (data.ok) toast.success(data.message)
    else toast.warning(data.message)
  }

  const handleToggle = async (next) => {
    setBusy('toggle')
    await save({ enabled: next })
    setBusy('')
  }

  const handleFetchNow = async (full = false) => {
    setBusy(full ? 'full' : 'fetch')
    const res = await apiFetch('/api/admin/meta-sync/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy('')
    if (!res.ok) {
      toast.error(data.error || 'Fetch failed')
      return
    }
    if (data.error) {
      toast.warning(`${data.created} imported — ${data.error}`)
    } else {
      toast.success(
        data.created > 0
          ? `${data.created} new lead(s) imported`
          : `No new leads (${data.duplicates} already in CRM)`
      )
    }
    load()
  }

  if (!config) return null

  const auto = config.auto || {}
  const autoLive = config.enabled && auto.active
  const statusBadge = !config.enabled ? (
    <Badge variant="outline">Off</Badge>
  ) : autoLive ? (
    <Badge className="bg-success text-white">
      Auto-fetch every {auto.intervalMinutes || 15} min
    </Badge>
  ) : (
    // Toggle is on but nothing is scheduled — on Vercel that means CRON_SECRET
    // is missing. Saying so beats silently importing nothing.
    <Badge variant="destructive">On, but no scheduler running</Badge>
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PlugZap className="h-5 w-5" />
              Meta Lead Ads — Auto Fetch
            </CardTitle>
            <CardDescription>
              Form ID aur Page Access Token daalo — CRM har 15 minute me nayi leads khud le aayega
              aur weight ke hisaab se assign kar dega. Kuch manually fetch karne ki zarurat nahi.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {statusBadge}
            <Switch
              checked={!!config.enabled}
              disabled={busy === 'toggle'}
              onCheckedChange={handleToggle}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Form ID(s) — comma se separate</Label>
          <Input
            placeholder="e.g. 1048956997835119, 1234567890"
            value={formIds}
            onChange={(e) => setFormIds(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">
            Page Access Token
            {config.hasToken && (
              <span className="ml-2 text-success">saved {config.tokenPreview}</span>
            )}
          </Label>
          <PasswordInput
            placeholder={config.hasToken ? 'Saved — type to replace' : 'EAAG...'}
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={handleSave} disabled={busy === 'save'}>
          {busy === 'save' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Save Meta Settings
        </Button>
        <Button size="sm" variant="outline" onClick={handleTest} disabled={busy === 'test'}>
          {busy === 'test' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Test Connection
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleFetchNow(false)}
          disabled={!config.hasToken || busy === 'fetch'}
        >
          {busy === 'fetch' ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3 w-3" />
          )}
          Fetch Now
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleFetchNow(true)}
          disabled={!config.hasToken || busy === 'full'}
          title="Re-scan the form's full history (already-imported leads are skipped)"
        >
          {busy === 'full' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Import all past leads
        </Button>
      </div>

      {config.formIds?.length > 0 && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs font-medium">
            Route each form's leads — pick "All employees" for the normal round robin, or select
            just the employees this form should rotate among
          </p>
          <div className="space-y-2">
            {config.formIds.map((formId) => (
              <div key={formId} className="flex items-center justify-between gap-3">
                <span className="truncate font-mono text-xs text-muted-foreground">{formId}</span>
                <FormPoolPicker
                  members={salesMembers}
                  selected={poolForForm(formId)}
                  disabled={assignBusy === formId}
                  onChange={(ids) => setFormPool(formId, ids)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {testResults && (
        <div className="space-y-1 rounded border bg-background p-3 text-xs">
          {testResults.map((r) => (
            <div key={r.formId} className="flex items-start gap-2">
              {r.ok ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              )}
              <span className="font-mono">{r.formId}</span>
              <span className={r.ok ? 'text-muted-foreground' : 'text-destructive'}>
                {r.ok
                  ? `${r.name}${r.leadsCount != null ? ` — ${r.leadsCount} leads on Meta` : ''} (${r.status})`
                  : r.error}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Last sync: <strong>{relative(config.lastSyncAt)}</strong>
          {config.lastSyncStatus && ` (${config.lastSyncStatus})`}
        </span>
        <span>
          Last run imported: <strong>{config.lastSyncCreated}</strong>
        </span>
        <span>
          Total imported: <strong>{config.totalSynced}</strong>
        </span>
        {autoLive && (
          <span className="text-success">
            Background sync active{auto.running ? ' — running now' : ''}
          </span>
        )}
      </div>

      {config.enabled && !auto.active && (
        <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          Auto-fetch is on but no scheduler is running
          {auto.mode === 'vercel-cron'
            ? ' — set CRON_SECRET in your Vercel environment variables.'
            : ' — restart the server, or unset META_SYNC_AUTO=off.'}{' '}
          Leads will only arrive when you press Fetch Now.
        </p>
      )}

      {config.lastSyncError && (
        <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {config.lastSyncError}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Form ID: Meta Business Suite → Instant Forms. Token: Page Access Token with the{' '}
        <code className="rounded bg-muted px-1">leads_retrieval</code> permission — use a long-lived
        one, a short-lived token expires in about an hour and the sync starts failing.
      </p>
      </CardContent>
    </Card>
  )
}

/** Multi-select checklist: "All employees" clears the pool (team-wide round
 * robin); ticking anyone else narrows the form to just those checked. */
function FormPoolPicker({ members, selected, disabled, onChange }) {
  const [open, setOpen] = useState(false)
  const isAll = selected.length === 0
  const label = isAll
    ? 'All employees'
    : selected.length === 1
      ? members.find((m) => m._id === selected[0])?.name || '1 selected'
      : `${selected.length} employees selected`

  const toggle = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 w-56 justify-between text-xs font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
          <Checkbox checked={isAll} onCheckedChange={() => onChange([])} />
          All employees (round robin)
        </label>
        <div className="my-1 border-t" />
        <div className="max-h-48 space-y-0.5 overflow-y-auto">
          {members.map((m) => (
            <label
              key={m._id}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={selected.includes(m._id)} onCheckedChange={() => toggle(m._id)} />
              <span className="truncate">{m.name || m.email}</span>
            </label>
          ))}
          {!members.length && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No sales employees yet</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
