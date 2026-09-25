'use client'

import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Search, Trash2, Pencil, ArrowRight, Loader2, Car, X, Snowflake, Fan } from 'lucide-react'

const token = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null)
const authH = () => ({ Authorization: `Bearer ${token()}` })

const emptyRoute = { fromLocation: '', toLocation: '', priceAC: '', priceNonAC: '' }
const emptyVehicle = { name: '', routes: [{ ...emptyRoute }] }

function formatPrice(n) {
  if (!n && n !== 0) return null
  return `₹${Number(n).toLocaleString('en-IN')}`
}

/** `readOnly` — staff can look up and ADD vehicles and route fares; only the
 * Owner edits or deletes existing ones. */
export function VehicleManager({ readOnly = false } = {}) {
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyVehicle)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/vehicles', { headers: authH() })
      const data = await res.json()
      if (res.ok) setVehicles(data.vehicles || [])
      else toast.error(data.error || 'Failed to load vehicles')
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
    return vehicles.filter(
      (v) =>
        !q ||
        v.name?.toLowerCase().includes(q) ||
        v.routes?.some(
          (r) =>
            r.fromLocation?.toLowerCase().includes(q) || r.toLocation?.toLowerCase().includes(q)
        )
    )
  }, [vehicles, search])

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', routes: [{ ...emptyRoute }] })
    setDialogOpen(true)
  }

  const openEdit = (v) => {
    setEditing(v)
    setForm({
      name: v.name || '',
      routes: v.routes?.length
        ? v.routes.map((r) => ({
            fromLocation: r.fromLocation || '',
            toLocation: r.toLocation || '',
            priceAC: r.priceAC ?? '',
            priceNonAC: r.priceNonAC ?? '',
          }))
        : [{ ...emptyRoute }],
    })
    setDialogOpen(true)
  }

  const addRoute = () => {
    setForm((f) => ({ ...f, routes: [...f.routes, { ...emptyRoute }] }))
  }

  const updateRoute = (index, patch) => {
    setForm((f) => ({
      ...f,
      routes: f.routes.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }))
  }

  const removeRoute = (index) => {
    setForm((f) => ({ ...f, routes: f.routes.filter((_, i) => i !== index) }))
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Vehicle name is required')
      return
    }
    setSaving(true)
    try {
      const url = editing ? `/api/settings/vehicles/${editing._id}` : '/api/settings/vehicles'
      const method = editing ? 'PUT' : 'POST'
      const payload = {
        name: form.name,
        routes: form.routes
          .filter((r) => r.fromLocation || r.toLocation || r.priceAC || r.priceNonAC)
          .map((r) => ({
            fromLocation: r.fromLocation,
            toLocation: r.toLocation,
            priceAC: r.priceAC === '' ? undefined : Number(r.priceAC),
            priceNonAC: r.priceNonAC === '' ? undefined : Number(r.priceNonAC),
          })),
      }
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
      toast.success(editing ? 'Vehicle updated' : 'Vehicle added')
      setDialogOpen(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (v) => {
    if (!confirm(`Delete "${v.name}"?`)) return
    const res = await fetch(`/api/settings/vehicles/${v._id}`, { method: 'DELETE', headers: authH() })
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
        <h3 className="text-lg font-semibold">Vehicle Management</h3>
        <p className="text-sm text-muted-foreground">
          Vehicles with one or more route-wise fares (AC / Non-AC) — selectable in the itinerary builder.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vehicle or route..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button size="sm" className="gap-1" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add vehicle
        </Button>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border p-10 text-center">
          <Car className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No vehicles yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <div key={v._id} className="space-y-2 rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-medium">{v.name}</p>
                {!v.isActive && <Badge variant="outline">Inactive</Badge>}
              </div>
              {v.routes?.length > 0 && (
                <div className="space-y-2">
                  {v.routes.map((r, i) => (
                    <div key={i} className="rounded-lg border bg-muted/30 p-2">
                      {(r.fromLocation || r.toLocation) && (
                        <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-foreground">
                          {r.fromLocation || '—'} <ArrowRight className="h-3 w-3 text-muted-foreground" /> {r.toLocation || '—'}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="rounded-md bg-sky-50 px-2 py-1.5 text-center dark:bg-sky-950/40">
                          <p className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400">
                            <Snowflake className="h-3 w-3" /> AC
                          </p>
                          <p className="text-sm font-bold text-sky-700 dark:text-sky-300">
                            {formatPrice(r.priceAC) || '—'}
                          </p>
                        </div>
                        <div className="rounded-md bg-amber-50 px-2 py-1.5 text-center dark:bg-amber-950/40">
                          <p className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            <Fan className="h-3 w-3" /> Non-AC
                          </p>
                          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
                            {formatPrice(r.priceNonAC) || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!readOnly && (
                <div className="flex justify-end gap-1 pt-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(v)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(v)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit vehicle' : 'Add vehicle'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update this vehicle and its routes.'
                : 'Add a vehicle, then add one or more routes with AC / Non-AC fares.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Vehicle name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Innova Crysta"
                autoFocus
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Routes</Label>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addRoute}>
                  <Plus className="h-3.5 w-3.5" /> Add route
                </Button>
              </div>
              {form.routes.map((r, i) => (
                <div key={i} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Route {i + 1}
                    </p>
                    {form.routes.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => removeRoute(i)}
                        title="Remove route"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      value={r.fromLocation}
                      onChange={(e) => updateRoute(i, { fromLocation: e.target.value })}
                      placeholder="e.g. Jammu"
                      className="flex-1"
                    />
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">to</span>
                    <Input
                      value={r.toLocation}
                      onChange={(e) => updateRoute(i, { toLocation: e.target.value })}
                      placeholder="e.g. Srinagar"
                      className="flex-1"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">AC price (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        className="mt-1"
                        value={r.priceAC}
                        onChange={(e) => updateRoute(i, { priceAC: e.target.value })}
                        placeholder="e.g. 6500"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Non-AC price (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        className="mt-1"
                        value={r.priceNonAC}
                        onChange={(e) => updateRoute(i, { priceNonAC: e.target.value })}
                        placeholder="e.g. 5500"
                      />
                    </div>
                  </div>
                </div>
              ))}
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
