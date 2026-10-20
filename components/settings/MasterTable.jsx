'use client'

import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  ArchiveRestore,
  Archive,
  ChevronUp,
  ChevronDown,
  Loader2,
  Lock,
} from 'lucide-react'
import { invalidateMasters } from '@/hooks/useMasters'
import { isLockedOption } from '@/lib/masterCategories'

const token = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null)

export function MasterTable({ category }) {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    label: '',
    color: '#64748b',
    icon: '',
    description: '',
    requiresFollowUp: false,
  })

  const supportsColor = category?.supportsColor
  const supportsIcon = category?.supportsIcon
  const supportsFollowUp = category?.supportsFollowUp

  const load = async () => {
    if (!category) return
    setLoading(true)
    try {
      const res = await fetch(`/api/settings/masters?category=${category.key}`, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      const data = await res.json()
      if (res.ok) setOptions(data.options || [])
      else toast.error(data.error || 'Failed to load')
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category?.key])

  const filtered = useMemo(() => {
    return options
      .filter((o) => (showArchived ? true : !o.isArchived))
      .filter((o) =>
        search ? o.label.toLowerCase().includes(search.toLowerCase()) : true
      )
  }, [options, search, showArchived])

  const openAdd = () => {
    setEditing(null)
    setForm({ label: '', color: '#64748b', icon: '', description: '', requiresFollowUp: false })
    setDialogOpen(true)
  }

  const openEdit = (o) => {
    setEditing(o)
    setForm({
      label: o.label,
      color: o.color || '#64748b',
      icon: o.icon || '',
      description: o.description || '',
      requiresFollowUp: !!o.metadata?.requiresFollowUp,
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.label.trim()) {
      toast.error('Label is required')
      return
    }
    setSaving(true)
    try {
      const url = editing
        ? `/api/settings/masters/${editing._id}`
        : '/api/settings/masters'
      const method = editing ? 'PUT' : 'POST'
      const metadata = supportsFollowUp ? { requiresFollowUp: !!form.requiresFollowUp } : undefined
      const body = editing
        ? {
            label: form.label,
            color: form.color,
            icon: form.icon,
            description: form.description,
            ...(metadata ? { metadata } : {}),
          }
        : { category: category.key, ...form, ...(metadata ? { metadata } : {}) }
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Save failed')
        return
      }
      toast.success(editing ? 'Updated' : 'Added')
      setDialogOpen(false)
      invalidateMasters(category.key)
      load()
    } finally {
      setSaving(false)
    }
  }

  const patch = async (o, action) => {
    const res = await fetch(`/api/settings/masters/${o._id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error || 'Action failed')
      return
    }
    invalidateMasters(category.key)
    load()
  }

  const remove = async (o) => {
    if (!confirm(`Delete "${o.label}"?${o.isSystem ? ' (system default will be archived)' : ''}`)) return
    const res = await fetch(`/api/settings/masters/${o._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error || 'Delete failed')
      return
    }
    toast.success(data.archived ? 'Archived' : 'Deleted')
    invalidateMasters(category.key)
    load()
  }

  const move = async (o, dir) => {
    const idx = filtered.findIndex((x) => x._id === o._id)
    const swapWith = filtered[idx + dir]
    if (!swapWith) return
    await Promise.all([
      fetch(`/api/settings/masters/${o._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: swapWith.order }),
      }),
      fetch(`/api/settings/masters/${swapWith._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: o.order }),
      }),
    ])
    invalidateMasters(category.key)
    load()
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{category.label}</h3>
        {category.description && (
          <p className="text-sm text-muted-foreground">{category.description}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          Show archived
        </label>
        <Button onClick={openAdd} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      <div className="rounded-lg border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No options yet</div>
        ) : (
          <ul className="divide-y">
            {filtered.map((o, i) => {
              const locked = isLockedOption(o)
              return (
              <li
                key={o._id}
                className={`flex items-center gap-3 px-3 py-2.5 ${o.isArchived ? 'opacity-50' : ''}`}
              >
                <div className="flex flex-col">
                  <button
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={i === 0}
                    onClick={() => move(o, -1)}
                    title="Move up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={i === filtered.length - 1}
                    onClick={() => move(o, 1)}
                    title="Move down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {supportsColor && (
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border"
                    style={{ backgroundColor: o.color }}
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{o.label}</span>
                    {locked ? (
                      <Lock className="h-3 w-3 text-amber-500" title="Locked system default" />
                    ) : o.isSystem ? (
                      <Lock className="h-3 w-3 text-muted-foreground" title="System default" />
                    ) : null}
                    {o.isArchived && <Badge variant="outline">Archived</Badge>}
                    {supportsFollowUp && o.metadata?.requiresFollowUp && (
                      <Badge variant="outline" className="text-xs">Follow-up</Badge>
                    )}
                  </div>
                  {o.description && (
                    <p className="truncate text-xs text-muted-foreground">{o.description}</p>
                  )}
                </div>

                <Switch
                  checked={o.isActive}
                  onCheckedChange={() => patch(o, 'toggle')}
                  disabled={locked}
                  title={locked ? 'Locked default' : o.isActive ? 'Active' : 'Inactive'}
                />

                {locked ? (
                  <div className="flex items-center gap-1 pr-1 text-xs text-muted-foreground">
                    Default
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(o)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {o.isArchived ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => patch(o, 'restore')}
                        title="Restore"
                      >
                        <ArchiveRestore className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => patch(o, 'archive')}
                        title="Archive"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(o)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </li>
              )
            })}
          </ul>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit option' : `Add to ${category.label}`}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update this option.' : `Add a new option to ${category.label}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Label</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Qualified"
                autoFocus
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            {supportsColor && (
              <div>
                <Label>Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="h-9 w-14 cursor-pointer rounded border bg-background"
                  />
                  <Input
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="w-32"
                  />
                </div>
              </div>
            )}
            {supportsIcon && (
              <div>
                <Label>Icon (lucide name, optional)</Label>
                <Input
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  placeholder="e.g. phone"
                />
              </div>
            )}
            {supportsFollowUp && (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Requires follow-up</Label>
                  <p className="text-xs text-muted-foreground">
                    When a lead is set to this status, ask for a follow-up date and schedule it.
                  </p>
                </div>
                <Switch
                  checked={form.requiresFollowUp}
                  onCheckedChange={(v) => setForm({ ...form, requiresFollowUp: v })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
