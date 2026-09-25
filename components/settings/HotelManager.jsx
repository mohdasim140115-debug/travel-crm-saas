'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
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
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  MapPin,
  Star,
  Loader2,
  Globe,
  Phone,
  Building2,
  Check,
  X,
  Save,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMasters } from '@/hooks/useMasters'

const token = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null)
const authH = () => ({ Authorization: `Bearer ${token()}` })

const QUICK_AMENITIES = [
  'Welcome Drink',
  'Daily Breakfast',
  'Daily Dinner',
  'Free Wi-Fi',
  '24/7 Room Service',
  'Electric Blanket',
  'Mineral Water',
  'Housekeeping',
  'Tea/Coffee Maker',
  'Bonfire Facility',
]

const FALLBACK_ROOM_TYPES = ['DELUXE', 'SUPER DELUXE', 'STANDARD', 'SUITE', 'PREMIUM']

const MAX_PHOTOS = 1

const emptyHotel = {
  name: '',
  destination: '',
  address: '',
  stars: 3,
  rooms: [{ roomType: '', price: '' }],
  extraBedCharge: '',
  cnbPrice: '',
  amenities: [],
  photos: [],
}

function formatPrice(n) {
  if (!n && n !== 0) return null
  return `₹${Number(n).toLocaleString('en-IN')}`
}

// Photos are stored as data URLs directly on the hotel document, and MongoDB
// caps a single document at 16MB — a handful of uncompressed camera photos
// (3-8MB each) blows past that. Downscale + re-encode as JPEG client-side so
// many photos comfortably fit.
const MAX_PHOTO_DIMENSION = 1600
const PHOTO_QUALITY = 0.72
// Whatever size the source photo is (a phone camera shot can be several MB),
// re-encode down to roughly this many bytes so the stored data URL stays small.
const TARGET_BYTES = 10 * 1024

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function dataUrlSize(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.ceil((base64.length * 3) / 4)
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      let dimension = MAX_PHOTO_DIMENSION
      let quality = PHOTO_QUALITY
      let dataUrl = ''
      // Shrink quality first (cheap, preserves detail), then dimension, until
      // the encoded size fits the target — bail out after a bounded number of
      // passes so a stubborn image can't loop forever.
      for (let attempt = 0; attempt < 14; attempt++) {
        const scale = Math.min(1, dimension / Math.max(img.width, img.height))
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        dataUrl = canvas.toDataURL('image/jpeg', quality)
        if (dataUrlSize(dataUrl) <= TARGET_BYTES || (quality <= 0.2 && dimension <= 240)) break
        if (quality > 0.2) quality -= 0.08
        else dimension = Math.round(dimension * 0.8)
      }
      resolve(dataUrl)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

async function filesToDataUrls(files) {
  return Promise.all(
    files.map(async (file) => {
      if (!file.type?.startsWith('image/')) return readFileAsDataUrl(file)
      try {
        return await compressImage(file)
      } catch {
        return readFileAsDataUrl(file)
      }
    })
  )
}

/** `readOnly` — staff (Sales/Operations/Accounts) can browse and ADD hotels,
 * but only the Owner edits or deletes existing ones. */
export function HotelManager({ readOnly = false } = {}) {
  const [hotels, setHotels] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [placesOpen, setPlacesOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyHotel)
  const [saving, setSaving] = useState(false)
  const [customAmenity, setCustomAmenity] = useState('')
  const fileInputRef = useRef(null)
  const { options: cityOptions } = useMasters('city', [])
  const { options: roomTypeOptions } = useMasters('room_type', FALLBACK_ROOM_TYPES)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/hotels', { headers: authH() })
      const data = await res.json()
      if (res.ok) setHotels(data.hotels || [])
      else toast.error(data.error || 'Failed to load hotels')
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
    return hotels.filter(
      (h) =>
        !q ||
        h.name?.toLowerCase().includes(q) ||
        h.city?.toLowerCase().includes(q) ||
        h.destination?.toLowerCase().includes(q)
    )
  }, [hotels, search])

  // One continuous grid, ordered by destination so nearby cards still cluster —
  // but never forced onto their own row like a per-destination grouping would.
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = a.destination || a.city || ''
      const db = b.destination || b.city || ''
      return da.localeCompare(db) || (a.name || '').localeCompare(b.name || '')
    })
  }, [filtered])

  const openManualAdd = () => {
    setPlacesOpen(false)
    setEditing(null)
    setForm(emptyHotel)
    setManualOpen(true)
  }

  const openEdit = (h) => {
    setPlacesOpen(false)
    setEditing(h)
    setForm({
      name: h.name || '',
      destination: h.destination || '',
      address: h.address || '',
      stars: h.stars || 3,
      rooms: h.rooms?.length
        ? h.rooms.map((r) => ({ roomType: r.roomType || '', price: r.price ?? '' }))
        : [{ roomType: h.roomType || '', price: h.price ?? '' }],
      extraBedCharge: h.extraBedCharge ?? '',
      cnbPrice: h.cnbPrice ?? '',
      amenities: h.amenities || [],
      photos: h.photos || [],
    })
    setManualOpen(true)
  }

  const addRoomRow = () => {
    setForm((f) => ({ ...f, rooms: [...f.rooms, { roomType: '', price: '' }] }))
  }

  const updateRoomRow = (index, patch) => {
    setForm((f) => ({
      ...f,
      rooms: f.rooms.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }))
  }

  const removeRoomRow = (index) => {
    setForm((f) => ({
      ...f,
      rooms: f.rooms.length > 1 ? f.rooms.filter((_, i) => i !== index) : f.rooms,
    }))
  }

  const toggleAmenity = (a) => {
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(a)
        ? f.amenities.filter((x) => x !== a)
        : [...f.amenities, a],
    }))
  }

  const addCustomAmenity = () => {
    const val = customAmenity.trim()
    if (!val) return
    setForm((f) => (f.amenities.includes(val) ? f : { ...f, amenities: [...f.amenities, val] }))
    setCustomAmenity('')
  }

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const remaining = MAX_PHOTOS - form.photos.length
    if (remaining <= 0) {
      toast.error(`You can only add up to ${MAX_PHOTOS} images`)
      return
    }
    if (files.length > remaining) {
      toast.info(`Only ${remaining} more image${remaining > 1 ? 's' : ''} can be added (max ${MAX_PHOTOS})`)
    }
    const dataUrls = await filesToDataUrls(files.slice(0, remaining))
    setForm((f) => ({ ...f, photos: [...f.photos, ...dataUrls] }))
  }

  const removePhoto = (idx) => {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }))
  }

  const saveManual = async () => {
    if (!form.name.trim()) {
      toast.error('Hotel name is required')
      return
    }
    setSaving(true)
    try {
      const url = editing ? `/api/settings/hotels/${editing._id}` : '/api/settings/hotels'
      const method = editing ? 'PUT' : 'POST'
      const payload = {
        ...form,
        stars: Number(form.stars) || undefined,
        rooms: form.rooms
          .filter((r) => r.roomType || r.price !== '')
          .map((r) => ({ roomType: r.roomType, price: r.price === '' ? undefined : Number(r.price) })),
        extraBedCharge: form.extraBedCharge === '' ? undefined : Number(form.extraBedCharge),
        cnbPrice: form.cnbPrice === '' ? undefined : Number(form.cnbPrice),
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
      toast.success(editing ? 'Hotel updated' : 'Hotel added')
      setManualOpen(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (h) => {
    if (!confirm(`Delete "${h.name}"?`)) return
    const res = await fetch(`/api/settings/hotels/${h._id}`, { method: 'DELETE', headers: authH() })
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Hotel Management</h3>
          <p className="text-sm text-muted-foreground">
            Organize hotels by destination or city. Import from Google Places or add manually.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search saved hotels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => {
            setManualOpen(false)
            setPlacesOpen(true)
          }}
        >
          <MapPin className="h-4 w-4" /> Search Google Places
        </Button>
        <Button size="sm" className="gap-1" onClick={openManualAdd}>
          <Plus className="h-4 w-4" /> Add manually
        </Button>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border p-10 text-center">
          <Building2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hotels yet. Search Google Places or add one manually.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((h) => (
            <div
              key={h._id}
                    className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] bg-muted">
                      {h.photos?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.photos[0]} alt={h.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Building2 className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      {!h.isActive && (
                        <Badge variant="outline" className="absolute right-2 top-2 bg-background">
                          Inactive
                        </Badge>
                      )}
                      {/* Always visible — these used to be hover-only on
                        * desktop (md:opacity-0 …group-hover…), which made the
                        * Edit/Delete buttons look completely absent to anyone
                        * on a laptop who didn't happen to mouse over the card. */}
                      {!readOnly && (
                        <div className="absolute bottom-0 right-0 flex gap-1 bg-gradient-to-t from-black/50 to-transparent p-1.5">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-7 w-7"
                            onClick={() => openEdit(h)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-7 w-7"
                            onClick={() => remove(h)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 font-bold uppercase leading-tight tracking-tight">
                          {h.name}
                        </p>
                        <div className="flex shrink-0 gap-0.5 pt-0.5">
                          {Array.from({ length: h.stars || 0 }).map((_, i) => (
                            <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                      </div>
                      {(h.destination || h.city) && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
                          <MapPin className="h-3 w-3" /> {h.destination || h.city}
                        </p>
                      )}

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-muted px-2 py-1.5 text-center">
                          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Images
                          </p>
                          <p className="text-sm font-bold">{h.photos?.length || 0}</p>
                        </div>
                        <div className="rounded-lg bg-muted px-2 py-1.5 text-center">
                          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Features
                          </p>
                          <p className="text-sm font-bold">{h.amenities?.length || 0}</p>
                        </div>
                      </div>

                      {formatPrice(h.price) && (
                        <Badge className="mt-2 bg-primary/10 text-primary hover:bg-primary/10">
                          {formatPrice(h.price)}/night
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
        </div>
      )}

      <PlacesSearchDialog open={placesOpen} onOpenChange={setPlacesOpen} onSaved={load} />

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl p-0 sm:max-w-3xl lg:max-w-4xl">
          <DialogHeader className="gap-0 border-b bg-muted/30 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Building2 className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg font-extrabold uppercase tracking-wide">
                {editing ? 'Edit Property' : 'New Property Registration'}
              </DialogTitle>
            </div>
            <DialogDescription className="sr-only">
              {editing ? 'Update this property’s details.' : 'Register a new property with photos and amenities.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-8 px-6 py-6 sm:grid-cols-[1.4fr_1fr]">
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Hotel Display Name
                  </Label>
                  <Input
                    className="mt-1.5"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Radisson Blu"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Region / Destination
                  </Label>
                  <Select
                    value={form.destination}
                    onValueChange={(v) => setForm({ ...form, destination: v })}
                  >
                    <SelectTrigger className="mt-1.5 w-full">
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      {cityOptions.map((c) => (
                        <SelectItem key={c.key} value={c.label}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Full Address / Landmark
                </Label>
                <div className="relative mt-1.5">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="e.g. Near Dal Lake, Gate No. 1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Star Category
                </Label>
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setForm({ ...form, stars: n })}
                      className={cn(
                        'flex h-10 w-14 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                        form.stars === n
                          ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
                          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
                      )}
                    >
                      {n}★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Room Types &amp; Pricing
                  </Label>
                  <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addRoomRow}>
                    <Plus className="h-3.5 w-3.5" /> Add room
                  </Button>
                </div>
                <div className="mt-1.5 space-y-2">
                  {form.rooms.map((room, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                      <Select
                        value={room.roomType}
                        onValueChange={(v) => updateRoomRow(i, { roomType: v })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select room type" />
                        </SelectTrigger>
                        <SelectContent>
                          {roomTypeOptions.map((r) => (
                            <SelectItem key={r.key} value={r.label}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        value={room.price}
                        onChange={(e) => updateRoomRow(i, { price: e.target.value })}
                        placeholder="Price per night (₹)"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={form.rooms.length <= 1}
                        onClick={() => removeRoomRow(i)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Extra Bed Charge (₹)
                </Label>
                <Input
                  type="number"
                  min={0}
                  className="mt-1.5"
                  value={form.extraBedCharge}
                  onChange={(e) => setForm({ ...form, extraBedCharge: e.target.value })}
                  placeholder="e.g. 800"
                />
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  CNB Price (₹)
                </Label>
                <Input
                  type="number"
                  min={0}
                  className="mt-1.5"
                  value={form.cnbPrice}
                  onChange={(e) => setForm({ ...form, cnbPrice: e.target.value })}
                  placeholder="e.g. 1500"
                />
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Quick Select Amenities
                </Label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {QUICK_AMENITIES.map((a) => {
                    const checked = form.amenities.includes(a)
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => toggleAmenity(a)}
                        className={cn(
                          'flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors',
                          checked
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            checked ? 'border-primary bg-primary' : 'border-border'
                          )}
                        >
                          {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                        </span>
                        {a}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Custom Amenities
                </Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={customAmenity}
                    onChange={(e) => setCustomAmenity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addCustomAmenity()
                      }
                    }}
                    placeholder="Type unique amenity..."
                    className="flex-1"
                  />
                  <Button type="button" size="icon" className="shrink-0" onClick={addCustomAmenity}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.amenities.length === 0 ? (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                      No amenities selected yet
                    </span>
                  ) : (
                    form.amenities.map((a) => (
                      <span
                        key={a}
                        className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"
                      >
                        {a}
                        <button
                          type="button"
                          onClick={() => toggleAmenity(a)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Property Photographs
              </Label>
              <p className="mb-1.5 mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                The first image is your cover photo · {form.photos.length}/{MAX_PHOTOS} added
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleFiles}
              />
              {form.photos.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm">
                    <Upload className="h-5 w-5" />
                  </span>
                  <span className="px-6 text-center text-xs font-semibold uppercase leading-relaxed tracking-wide">
                    Click to upload images
                  </span>
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {form.photos.map((p, i) => (
                    <div key={i} className="relative aspect-square overflow-hidden rounded-lg border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p} alt="" className="h-full w-full object-cover" />
                      {i === 0 && (
                        <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                          COVER
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {form.photos.length < MAX_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <Upload className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/30 px-6 py-4">
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              Discard
            </Button>
            <Button onClick={saveManual} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Commit to Database
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PlacesSearchDialog({ open, onOpenChange, onSaved }) {
  const [query, setQuery] = useState('')
  const [destination, setDestination] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [savingId, setSavingId] = useState(null)

  const runSearch = async (e) => {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setNotConfigured(false)
    try {
      const res = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`, {
        headers: authH(),
      })
      const data = await res.json()
      if (data.configured === false) {
        setNotConfigured(true)
        setResults([])
        return
      }
      if (!res.ok) {
        toast.error(data.error || 'Search failed')
        setResults([])
        return
      }
      setResults(data.results || [])
      if (!data.results?.length) toast.info('No hotels found')
    } catch {
      toast.error('Network error')
    } finally {
      setSearching(false)
    }
  }

  const saveHotel = async (r) => {
    setSavingId(r.placeId)
    try {
      const res = await fetch('/api/settings/hotels', {
        method: 'POST',
        headers: { ...authH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: r.name,
          address: r.address,
          city: r.address?.split(',').slice(-3, -2)[0]?.trim(),
          destination: destination.trim() || undefined,
          location: r.location,
          placeId: r.placeId,
          googleRating: r.googleRating,
          googleReviews: r.googleReviews,
          priceLevel: r.priceLevel,
          phone: r.phone,
          website: r.website,
          photos: r.photos,
        }),
      })
      const data = await res.json()
      if (res.status === 409) {
        toast.info('Already saved')
        return
      }
      if (!res.ok) {
        toast.error(data.error || 'Save failed')
        return
      }
      toast.success(`Saved ${r.name}`)
      onSaved?.()
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search hotels on Google Places</DialogTitle>
          <DialogDescription>
            Find hotels by name or city, then save them into your workspace.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={runSearch} className="flex flex-wrap gap-2">
          <Input
            placeholder="e.g. hotels in Srinagar"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1"
            autoFocus
          />
          <Button type="submit" disabled={searching} className="gap-1">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
        </form>

        <div>
          <Label className="text-xs text-muted-foreground">
            Group saved hotels under destination (optional)
          </Label>
          <Input
            placeholder="e.g. Kashmir"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>

        {notConfigured && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Google Places is not configured. Add <code>GOOGLE_PLACES_API_KEY</code> to your
            environment to enable hotel search. You can still add hotels manually.
          </div>
        )}

        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.placeId} className="flex gap-3 rounded-lg border p-2">
              {r.photos?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photos[0]} alt={r.name} className="h-16 w-16 rounded object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded bg-muted">
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">{r.address}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {r.googleRating ? (
                    <span className="flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {r.googleRating} ({r.googleReviews || 0})
                    </span>
                  ) : null}
                  {r.phone && (
                    <span className="flex items-center gap-0.5">
                      <Phone className="h-3 w-3" /> {r.phone}
                    </span>
                  )}
                  {r.website && (
                    <a
                      href={r.website}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-0.5 text-primary hover:underline"
                    >
                      <Globe className="h-3 w-3" /> Site
                    </a>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => saveHotel(r)}
                disabled={savingId === r.placeId}
                className="self-center"
              >
                {savingId === r.placeId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
