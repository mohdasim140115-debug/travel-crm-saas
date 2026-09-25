'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { mutateJson } from '@/lib/mutate'
import { FileCheck, Hotel, Car, MapPin, BedDouble, Calendar, IndianRupee, Route, X } from 'lucide-react'

function formatDate(d) {
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return null
  }
}

const VOUCHER_TYPES = [
  { value: 'hotel', label: 'Hotel Voucher', icon: Hotel },
  { value: 'cab', label: 'Cab Voucher', icon: Car },
  { value: 'driver', label: 'Driver Voucher', icon: Route },
]

export default function VouchersPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>}>
      <VouchersPageContent />
    </Suspense>
  )
}

function VouchersPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const statusFilter = searchParams.get('status')
  const [vouchers, setVouchers] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ bookingId: '', type: 'hotel', details: '' })
  const [itineraryHotels, setItineraryHotels] = useState([])
  const [itineraryVehicles, setItineraryVehicles] = useState([])
  const [dayPlanDates, setDayPlanDates] = useState([])
  const [hotelsLoading, setHotelsLoading] = useState(false)
  const [selectedHotelIds, setSelectedHotelIds] = useState([])
  const [selectedVehicleIds, setSelectedVehicleIds] = useState([])
  // Check-in/check-out chosen per hotel — keyed by hotel _id — since a
  // multi-city trip needs a different pair of dates for each stay.
  const [hotelDates, setHotelDates] = useState({})
  // Holds an existing voucher's saved selections while its booking's
  // itinerary reloads, so "Edit" restores exactly what was picked before
  // instead of opening blank. Cleared once applied (one-time use).
  const [editSeed, setEditSeed] = useState(null)

  const load = async () => {
    const token = localStorage.getItem('token')
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    if (!['operations', 'admin'].includes(u.role)) {
      window.location.href = '/dashboard'
      return
    }
    const [vRes, bRes] = await Promise.all([
      fetch('/api/vouchers', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/bookings?limit=50', { headers: { Authorization: `Bearer ${token}` } }),
    ])
    if (vRes.ok) {
      const d = await vRes.json()
      setVouchers(d.vouchers || [])
    }
    if (bRes.ok) {
      const d = await bRes.json()
      setBookings(d.bookings || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Pull the hotels AND vehicles the sales team actually added to this
  // booking's itinerary (same data the itinerary PDF uses), so Ops picks the
  // real stay/cab instead of re-typing it by hand.
  useEffect(() => {
    setSelectedHotelIds([])
    setSelectedVehicleIds([])
    setItineraryHotels([])
    setItineraryVehicles([])
    setDayPlanDates([])
    setHotelDates({})
    const booking = bookings.find((b) => String(b._id) === form.bookingId)
    const itineraryId = booking?.itineraryId?._id || booking?.itineraryId
    if (!itineraryId) return
    setHotelsLoading(true)
    const token = localStorage.getItem('token')
    Promise.all([
      fetch(`/api/itineraries/${itineraryId}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
        r.json()
      ),
      // The itinerary only has the originally quoted dates — the real
      // check-in/check-out Operations confirmed with the hotel live on
      // booking.hotelConfirmations, so pull that too and prefer it.
      fetch(`/api/bookings/${booking._id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .catch(() => null),
    ])
      .then(([d, bookingRes]) => {
        // Same day-plan dates the itinerary PDF shows against each day —
        // offered as check-in/check-out options instead of free typing.
        const dates = (d.days || [])
          .filter((day) => day.date)
          .map((day) => ({ value: new Date(day.date).toISOString().slice(0, 10), label: `Day ${day.dayNumber} — ${formatDate(day.date)}` }))
        setDayPlanDates(dates)
        const it = d.itinerary || {}
        const vehicles = it.vehicles?.length
          ? it.vehicles
          : it.vehicle
            ? [{ name: it.vehicle, ...(it.vehicleDetails || {}), cost: it.vehicleCost }]
            : []
        // The itinerary's vehicle row doesn't have the driver's name/phone or
        // the actual vehicle number — that's collected by Operations against
        // booking.vehicleConfirmations once the cab is confirmed.
        const confirmedVehicles = bookingRes?.booking?.vehicleConfirmations || []
        const usedConfirmations = new Set()
        const enrichedVehicles = vehicles.map((v, i) => {
          const match = confirmedVehicles.find(
            (c, ci) => !usedConfirmations.has(ci) && c.name && v.name && c.name.trim().toLowerCase() === v.name.trim().toLowerCase()
          )
          if (match) usedConfirmations.add(confirmedVehicles.indexOf(match))
          return {
            ...v,
            _id: v._id || `vehicle-${i}`,
            driverName: match?.driverName || '',
            driverPhone: match?.driverPhone || '',
            vehicleNumber: match?.vehicleNumber || '',
          }
        })
        setItineraryVehicles(enrichedVehicles)

        // The itinerary's hotels[] row doesn't carry room/CNB counts — but
        // the confirmed nightStays breakdown (booking.hotelConfirmations)
        // does, so pull those from there too, matched by name.
        const confirmedHotels = bookingRes?.booking?.hotelConfirmations || []
        const initialDates = {}
        const enrichedHotels = (d.hotels || []).map((h) => {
          const match = confirmedHotels.find(
            (c) => c.name && h.name && c.name.trim().toLowerCase() === h.name.trim().toLowerCase()
          )
          if (match?.checkIn || match?.checkOut) {
            initialDates[String(h._id)] = {
              checkIn: match.checkIn ? new Date(match.checkIn).toISOString().slice(0, 10) : '',
              checkOut: match.checkOut ? new Date(match.checkOut).toISOString().slice(0, 10) : '',
            }
          }
          return {
            ...h,
            // Dates Operations confirmed on the booking are final — the voucher
            // shows them read-only.
            datesLocked: Boolean(match?.checkIn || match?.checkOut),
            returnCheckIn: match?.returnCheckIn ? new Date(match.returnCheckIn).toISOString().slice(0, 10) : '',
            returnCheckOut: match?.returnCheckOut ? new Date(match.returnCheckOut).toISOString().slice(0, 10) : '',
            roomCount: match?.roomCount ?? null,
            extraBeds: match?.extraBeds ?? 0,
            cnbCount: match?.cnbCount ?? 0,
          }
        })
        setItineraryHotels(enrichedHotels)

        // Editing an existing voucher — restore exactly what it had saved
        // (selection + dates) instead of the freshly-computed defaults, so
        // reopening it for a tweak doesn't silently discard prior edits.
        if (editSeed?.type === 'hotel' && editSeed.hotels?.length) {
          const seedIds = []
          const seedDates = { ...initialDates }
          for (const sh of editSeed.hotels) {
            const match = enrichedHotels.find(
              (h) => h.name && sh.hotelName && h.name.trim().toLowerCase() === sh.hotelName.trim().toLowerCase()
            )
            if (match) {
              seedIds.push(String(match._id))
              if (match.datesLocked) continue
              seedDates[String(match._id)] = {
                checkIn: sh.checkIn ? new Date(sh.checkIn).toISOString().slice(0, 10) : '',
                checkOut: sh.checkOut ? new Date(sh.checkOut).toISOString().slice(0, 10) : '',
              }
            }
          }
          setSelectedHotelIds(seedIds)
          setHotelDates(seedDates)
          setForm((f) => ({
            ...f,
            details: JSON.stringify({
              hotels: seedIds.map((id) => {
                const h = enrichedHotels.find((x) => String(x._id) === id)
                const picked = seedDates[id] || {}
                return {
                  hotelName: h.name,
                  location: h.location,
                  roomType: h.roomType,
                  roomCount: h.roomCount,
                  extraBeds: h.extraBeds,
                  cnbCount: h.cnbCount,
                  checkIn: picked.checkIn || h.checkIn,
                  checkOut: picked.checkOut || h.checkOut,
                  returnCheckIn: h.returnCheckIn || undefined,
                  returnCheckOut: h.returnCheckOut || undefined,
                  cost: h.cost,
                }
              }),
            }),
          }))
        } else {
          setHotelDates(initialDates)
        }

        if (editSeed?.type === 'cab' && editSeed.cabs?.length) {
          const seedVehicleIds = []
          for (const sc of editSeed.cabs) {
            const match = enrichedVehicles.find((v) => v.name && sc.name && v.name.trim().toLowerCase() === sc.name.trim().toLowerCase())
            if (match) seedVehicleIds.push(String(match._id))
          }
          setSelectedVehicleIds(seedVehicleIds)
          const selected = enrichedVehicles.filter((v) => seedVehicleIds.includes(String(v._id)))
          setForm((f) => ({
            ...f,
            details: JSON.stringify({
              cabs: selected.map((v) => ({
                name: v.name,
                fromLocation: v.fromLocation,
                toLocation: v.toLocation,
                selectedType: v.selectedType,
                driverName: v.driverName,
                driverPhone: v.driverPhone,
                vehicleNumber: v.vehicleNumber,
                cost: v.cost,
              })),
            }),
          }))
        }
        setEditSeed(null)
      })
      .catch(() => {
        setItineraryHotels([])
        setItineraryVehicles([])
        setDayPlanDates([])
      })
      .finally(() => setHotelsLoading(false))
  }, [form.bookingId, bookings])

  // Re-derive the details JSON any time the checked hotels (or their picked
  // check-in/check-out) change — a multi-city booking can have several
  // stays, so the voucher should carry all of them, not just one.
  const buildHotelDetails = (ids, dates) => {
    const selected = itineraryHotels.filter((h) => ids.includes(String(h._id)))
    return {
      hotels: selected.map((h) => {
        const picked = dates[String(h._id)] || {}
        return {
          hotelName: h.name,
          location: h.location,
          roomType: h.roomType,
          roomCount: h.roomCount,
          extraBeds: h.extraBeds,
          cnbCount: h.cnbCount,
          checkIn: picked.checkIn || h.checkIn,
          checkOut: picked.checkOut || h.checkOut,
          returnCheckIn: h.returnCheckIn || undefined,
          returnCheckOut: h.returnCheckOut || undefined,
          cost: h.cost,
        }
      }),
    }
  }

  const toggleHotel = (hotelId, checked) => {
    const nextIds = checked
      ? [...selectedHotelIds, hotelId]
      : selectedHotelIds.filter((id) => id !== hotelId)
    setSelectedHotelIds(nextIds)
    setForm((f) => ({ ...f, details: JSON.stringify(buildHotelDetails(nextIds, hotelDates)) }))
  }

  const setHotelDate = (hotelId, field, value) => {
    const nextDates = { ...hotelDates, [hotelId]: { ...hotelDates[hotelId], [field]: value } }
    setHotelDates(nextDates)
    setForm((f) => ({ ...f, details: JSON.stringify(buildHotelDetails(selectedHotelIds, nextDates)) }))
  }

  const toggleVehicle = (vehicleId, checked) => {
    const nextIds = checked
      ? [...selectedVehicleIds, vehicleId]
      : selectedVehicleIds.filter((id) => id !== vehicleId)
    setSelectedVehicleIds(nextIds)
    const selected = itineraryVehicles.filter((v) => nextIds.includes(String(v._id)))
    setForm((f) => ({
      ...f,
      details: JSON.stringify({
        cabs: selected.map((v) => ({
          name: v.name,
          fromLocation: v.fromLocation,
          toLocation: v.toLocation,
          selectedType: v.selectedType,
          driverName: v.driverName,
          driverPhone: v.driverPhone,
          vehicleNumber: v.vehicleNumber,
          cost: v.cost,
        })),
      }),
    }))
  }

  const createVoucher = async () => {
    if (!form.bookingId || !form.type) {
      toast.error('Select booking and voucher type')
      return
    }
    const token = localStorage.getItem('token')
    let details = {}
    try {
      details = form.details ? JSON.parse(form.details) : {}
    } catch {
      details = { notes: form.details }
    }
    let data
    try {
      data = await mutateJson('/api/vouchers', {
        token,
        body: { bookingId: form.bookingId, type: form.type, details },
      })
    } catch (e) {
      toast.error(e.message || 'Failed to generate voucher')
      return
    }
    toast.success('Voucher generated')
    setOpen(false)
    setForm({ bookingId: '', type: 'hotel', details: '' })
    load()
    if (['hotel', 'cab', 'driver'].includes(form.type) && data.voucher?._id) {
      downloadVoucherPdf(data.voucher._id)
    }
  }

  // The PDF route needs the auth header, so it can't be a plain <a href> —
  // fetch it as a blob and trigger the browser's save-file dialog ourselves.
  const downloadVoucherPdf = async (voucherId) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/vouchers/${voucherId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to generate PDF')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `voucher-${voucherId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err.message || 'Failed to download PDF')
    }
  }

  // Reopens the dialog pre-filled with an existing voucher's booking, type,
  // and previously selected hotels/cabs — Generate then overwrites this same
  // voucher (POST upserts on bookingId+type) instead of creating a duplicate.
  const openEditVoucher = (v) => {
    const bookingId = String(v.bookingId?._id || v.bookingId)
    setEditSeed({ type: v.type, ...(v.details || {}) })
    setForm({ bookingId, type: v.type, details: '' })
    setOpen(true)
  }

  // 'pending' mirrors what the Operations dashboard's "Voucher Pending" tile
  // counts — pending and confirmed both mean the voucher hasn't been sent yet.
  const filteredVouchers = !statusFilter
    ? vouchers
    : statusFilter === 'pending'
      ? vouchers.filter((v) => ['pending', 'confirmed'].includes(v.status))
      : vouchers.filter((v) => v.status === statusFilter)

  // One card per client instead of one flat row per voucher — a client with
  // all three (hotel/cab/driver) generated should read as a single group,
  // not three unrelated-looking rows.
  const voucherGroups = (() => {
    const groups = new Map()
    for (const v of filteredVouchers) {
      const bookingId = String(v.bookingId?._id || v.bookingId || 'unknown')
      if (!groups.has(bookingId)) {
        groups.set(bookingId, {
          bookingId,
          clientName:
            [v.bookingId?.leadId?.firstName, v.bookingId?.leadId?.lastName].filter(Boolean).join(' ') ||
            v.bookingId?.bookingNumber ||
            'Unknown booking',
          latestDate: v.createdAt,
          vouchers: {},
        })
      }
      const g = groups.get(bookingId)
      g.vouchers[v.type] = v
      if (new Date(v.createdAt) > new Date(g.latestDate)) g.latestDate = v.createdAt
    }
    return Array.from(groups.values()).sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate))
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground sm:text-base">
          Hotel and cab vouchers for confirmed bookings.
        </p>
        <Button
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => {
            setEditSeed(null)
            setForm({ bookingId: '', type: 'hotel', details: '' })
            setOpen(true)
          }}
        >
          <FileCheck className="h-4 w-4" />
          <span className="sm:hidden">Generate</span>
          <span className="hidden sm:inline">Generate Voucher</span>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {VOUCHER_TYPES.map((t) => {
          const Icon = t.icon
          const count = vouchers.filter((v) => v.type === t.value).length
          return (
            <Card key={t.value} className="gap-1 py-3 sm:gap-6 sm:py-6">
              <CardHeader className="flex flex-row items-center justify-between px-3 pb-0 sm:px-6 sm:pb-2">
                <CardTitle className="text-xs sm:text-sm">{t.label}</CardTitle>
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <p className="text-xl font-bold sm:text-2xl">{count}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {statusFilter && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span>
            Filtered: <span className="font-medium capitalize">{statusFilter}</span> vouchers ({filteredVouchers.length})
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1"
            onClick={() => router.push('/dashboard/vouchers')}
          >
            <X className="h-3.5 w-3.5" /> Clear filter
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Vouchers</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : voucherGroups.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No vouchers yet.</p>
          ) : (
            <div className="space-y-4">
              {voucherGroups.map((g) => (
                <div key={g.bookingId} className="overflow-hidden rounded-xl border border-accent-secondary/40">
                  <div className="bg-muted/30 px-4 py-3">
                    <p className="font-semibold">{g.clientName}</p>
                    <p className="text-xs text-muted-foreground">Last updated {new Date(g.latestDate).toLocaleDateString()}</p>
                  </div>
                  <div className="divide-y">
                    {VOUCHER_TYPES.map((t) => {
                      const v = g.vouchers[t.value]
                      const Icon = t.icon
                      return (
                        <div key={t.value} className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2.5">
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className={v ? 'font-medium' : 'text-muted-foreground'}>{t.label}</span>
                          </div>
                          {v ? (
                            <div className="flex flex-wrap items-center gap-2">
                              {['hotel', 'cab'].includes(v.type) && (
                                <Button size="sm" variant="outline" onClick={() => openEditVoucher(v)}>
                                  Edit
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => downloadVoucherPdf(v._id)}>
                                Download PDF
                              </Button>
                              <Badge variant={v.status === 'generated' ? 'default' : 'outline'}>{v.status}</Badge>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground"
                              onClick={() => {
                                setEditSeed(null)
                                setForm({ bookingId: g.bookingId, type: t.value, details: '' })
                                setOpen(true)
                              }}
                            >
                              Not generated
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setEditSeed(null)
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
          <DialogHeader>
            <DialogTitle>Generate Voucher</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div>
              <Label>Booking</Label>
              <Select value={form.bookingId} onValueChange={(v) => setForm({ ...form, bookingId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select booking" />
                </SelectTrigger>
                <SelectContent>
                  {bookings.map((b) => (
                    <SelectItem key={b._id} value={String(b._id)}>
                      {b.bookingNumber} — {b.leadId?.firstName} {b.leadId?.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Voucher Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOUCHER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.type === 'hotel' && form.bookingId && (
              <div>
                <Label>Hotels (from this booking's itinerary)</Label>
                <p className="mb-1 text-xs text-muted-foreground">
                  Check all that apply — a multi-city trip can have more than one.
                </p>
                {hotelsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading hotels…</p>
                ) : itineraryHotels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hotels found on this booking's itinerary — fill in details manually below.
                  </p>
                ) : (
                  <div className="space-y-3 rounded-md border p-3">
                    {itineraryHotels.map((h) => {
                      const id = String(h._id)
                      const isChecked = selectedHotelIds.includes(id)
                      return (
                        <div key={id} className={isChecked ? 'space-y-2' : ''}>
                          <label className="flex items-center gap-2 text-base">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => toggleHotel(id, checked === true)}
                            />
                            <span className="font-medium">
                              {h.name}
                              {h.location ? ` — ${h.location}` : ''}
                              {h.roomType ? ` · ${h.roomType}` : ''}
                            </span>
                          </label>
                          {isChecked && h.datesLocked && (
                            <div className="ml-6 grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <Label className="text-xs">Check-in</Label>
                                <p className="font-medium">{formatDate(hotelDates[id]?.checkIn) || '—'}</p>
                              </div>
                              <div>
                                <Label className="text-xs">Check-out</Label>
                                <p className="font-medium">{formatDate(hotelDates[id]?.checkOut) || '—'}</p>
                              </div>
                              {h.returnCheckIn && (
                                <>
                                  <div>
                                    <Label className="text-xs">Re-check-in</Label>
                                    <p className="font-medium">{formatDate(h.returnCheckIn)}</p>
                                  </div>
                                  <div>
                                    <Label className="text-xs">Re-check-out</Label>
                                    <p className="font-medium">{formatDate(h.returnCheckOut) || '—'}</p>
                                  </div>
                                </>
                              )}
                              <p className="col-span-2 text-xs text-muted-foreground">Dates confirmed by Operations — cannot be changed here.</p>
                            </div>
                          )}
                          {isChecked && !h.datesLocked && (
                            <div className="ml-6 grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Check-in</Label>
                                <Select
                                  value={hotelDates[id]?.checkIn || 'none'}
                                  onValueChange={(v) => setHotelDate(id, 'checkIn', v === 'none' ? '' : v)}
                                >
                                  <SelectTrigger className="h-8 w-36 text-xs">
                                    <SelectValue placeholder="Select date" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Select date</SelectItem>
                                    {dayPlanDates.map((d) => (
                                      <SelectItem key={d.value} value={d.value}>
                                        {d.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs">Check-out</Label>
                                <Select
                                  value={hotelDates[id]?.checkOut || 'none'}
                                  onValueChange={(v) => setHotelDate(id, 'checkOut', v === 'none' ? '' : v)}
                                >
                                  <SelectTrigger className="h-8 w-36 text-xs">
                                    <SelectValue placeholder="Select date" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Select date</SelectItem>
                                    {dayPlanDates.map((d) => (
                                      <SelectItem key={d.value} value={d.value}>
                                        {d.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {form.type === 'cab' && form.bookingId && (
              <div>
                <Label>Vehicles (from this booking's itinerary)</Label>
                <p className="mb-1 text-xs text-muted-foreground">
                  Check all that apply — a multi-city trip can use more than one vehicle/route.
                </p>
                {hotelsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading vehicles…</p>
                ) : itineraryVehicles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No vehicle found on this booking's itinerary — fill in details manually below.
                  </p>
                ) : (
                  <div className="space-y-2 rounded-md border p-3">
                    {itineraryVehicles.map((v) => {
                      const id = String(v._id)
                      const route = [v.fromLocation, v.toLocation].filter(Boolean).join(' → ')
                      return (
                        <label key={id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selectedVehicleIds.includes(id)}
                            onCheckedChange={(checked) => toggleVehicle(id, checked === true)}
                          />
                          <span>
                            {v.name || 'Vehicle'}
                            {route ? ` — ${route}` : ''}
                            {v.selectedType ? ` · ${v.selectedType}` : ''}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {form.type === 'driver' && form.bookingId && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                Nothing to select here — the driver voucher is built automatically from this booking's day-wise
                plan and hotel stays (guest details, the enroute day plan, and how many nights at each hotel).
              </div>
            )}

            {form.type === 'hotel' && selectedHotelIds.length > 0 ? (
              <div>
                <Label>Voucher will include</Label>
                <div className="mt-1 space-y-2">
                  {itineraryHotels
                    .filter((h) => selectedHotelIds.includes(String(h._id)))
                    .map((h) => {
                      const picked = hotelDates[String(h._id)] || {}
                      const checkIn = picked.checkIn || h.checkIn
                      const checkOut = picked.checkOut || h.checkOut
                      return (
                        <div key={h._id} className="rounded-md border bg-muted/30 p-3 text-sm">
                          <p className="font-semibold">{h.name}</p>
                          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {h.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {h.location}
                              </span>
                            )}
                            {h.roomType && (
                              <span className="flex items-center gap-1">
                                <BedDouble className="h-3 w-3" /> {h.roomType}
                              </span>
                            )}
                            {(formatDate(checkIn) || formatDate(checkOut)) && (
                              <span className="col-span-2 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(checkIn) || '—'} → {formatDate(checkOut) || '—'}
                              </span>
                            )}
                            {h.returnCheckIn && (
                              <span className="col-span-2 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Re-check-in: {formatDate(h.returnCheckIn)} → {formatDate(h.returnCheckOut) || '—'}
                              </span>
                            )}
                            {h.cost > 0 && (
                              <span className="flex items-center gap-1">
                                <IndianRupee className="h-3 w-3" /> {Number(h.cost).toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            ) : form.type === 'cab' && selectedVehicleIds.length > 0 ? (
              <div>
                <Label>Voucher will include</Label>
                <div className="mt-1 space-y-2">
                  {itineraryVehicles
                    .filter((v) => selectedVehicleIds.includes(String(v._id)))
                    .map((v) => {
                      const route = [v.fromLocation, v.toLocation].filter(Boolean).join(' → ')
                      return (
                        <div key={v._id} className="rounded-md border bg-muted/30 p-3 text-sm">
                          <p className="font-semibold">{v.name || 'Vehicle'}</p>
                          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {route && (
                              <span className="col-span-2 flex items-center gap-1">
                                <Route className="h-3 w-3" /> {route}
                              </span>
                            )}
                            {v.selectedType && (
                              <span className="flex items-center gap-1">
                                <Car className="h-3 w-3" /> {v.selectedType}
                              </span>
                            )}
                            {v.cost > 0 && (
                              <span className="flex items-center gap-1">
                                <IndianRupee className="h-3 w-3" /> {Number(v.cost).toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            ) : (
              <div>
                <Label>Details (JSON or notes)</Label>
                <Input
                  placeholder='{"hotelName":"Grand Kashmir","roomType":"Deluxe"}'
                  value={form.details}
                  onChange={(e) => setForm({ ...form, details: e.target.value })}
                />
              </div>
            )}
          </div>
          <Button className="w-full" onClick={createVoucher}>
            Generate
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
