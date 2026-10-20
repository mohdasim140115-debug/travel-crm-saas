'use client'

import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Search, Trash2, Pencil, Clock, Loader2, Compass } from 'lucide-react'

const token = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null)
const authH = () => ({ Authorization: `Bearer ${token()}` })

const emptyActivity = { name: '', duration: '', price: '', description: '' }

function formatPrice(n) {
  if (!n && n !== 0) return null
  return `₹${Number(n).toLocaleString('en-IN')}`
}

export function ActivityManager() {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyActivity)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/activities', { headers: authH() })
      const data = await res.json()
      if (res.ok) setActivities(data.activities || [])
      else toast.error(data.error || 'Failed to load activities')
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return activities.filter((a) => !q || a.name?.toLowerCase().includes(q))
  }, [activities, search])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyActivity)
    setDialogOpen(true)
  }

  const openEdit = (a) => {
    setEditing(a)
    setForm({
      name: a.name || '',
      duration: a.duration || '',
      price: a.price ?? '',
      description: a.description || '',
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Activity name is required')
      return
    }
    setSaving(true)
    try {
      const url = editing ? `/api/settings/activities/${editing._id}` : '/api/settings/activities'
      const method = editing ? 'PUT' : 'POST'
      const payload = { ...form, price: form.price === '' ? undefined : Number(form.price) }
      const res = await fetch(url, {
        method,
        headers: { ...authH(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Save failed')
        return
      }
      toast.success(editing ? 'Activity updated' : 'Activity added')
      setDialogOpen(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (a) => {
    if (!confirm(`Delete "${a.name}"?`)) return
    const res = await fetch(`/api/settings/activities/${a._id}`, { method: 'DELETE', headers: authH() })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error || 'Delete failed')
      return
    }
    toast.success('Deleted')
    load()
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Activity Management</h3>
        <p className="text-sm text-muted-foreground">
          Activities you offer — name, duration, and price — selectable in the itinerary builder.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search activities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button size="sm" className="gap-1" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add activity
        </Button>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border p-10 text-center">
          <Compass className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No activities yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <div key={a._id} className="space-y-1 rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-medium">{a.name}</p>
                {!a.isActive && <Badge variant="outline">Inactive</Badge>}
              </div>
              {a.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                {a.duration && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" /> {a.duration}
                  </span>
                )}
                {formatPrice(a.price) && (
                  <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                    {formatPrice(a.price)}
                  </Badge>
                )}
              </div>
              <div className="flex justify-end gap-1 pt-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(a)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(a)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit activity' : 'Add activity'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update this activity’s details.' : 'Add an activity to your workspace catalog.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Activity name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Gondola Ride"
                autoFocus
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Duration</Label>
                <Input
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                  placeholder="e.g. 2 hours / Half day"
                />
              </div>
              <div>
                <Label>Price (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="e.g. 1500"
                />
              </div>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional notes shown to your team"
              />
            </div>
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
