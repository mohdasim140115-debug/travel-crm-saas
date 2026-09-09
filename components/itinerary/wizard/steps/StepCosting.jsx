'use client'

import { useEffect, useState } from 'react'
import { Plus, Car, X, Loader2, Pencil, Check } from 'lucide-react'
import {
  getRoomLines,
  getStayExtraCost,
  computeCategoryTotals,
  createDefaultRoomLine,
  BUDGET_TIERS,
  budgetTierLabel,
} from '@/modules/itinerary/studio'
import { DURATION_PRESETS } from '@/lib/data/masterRepository'

// Same rotating, strongly-tinted accent treatment as the Booking page's
// Hotels section — keyed to the hotel itself (not raw card position), so a
// re-check-in card always matches the color of that hotel's other card(s)
// instead of just cycling to whatever the next color happens to be.
const HOTEL_ACCENTS = [
  { wrap: 'border-sky-500/30 border-l-sky-500 bg-sky-500/10', label: 'text-sky-500' },
  { wrap: 'border-amber-500/30 border-l-amber-500 bg-amber-500/10', label: 'text-amber-500' },
  { wrap: 'border-violet-500/30 border-l-violet-500 bg-violet-500/10', label: 'text-violet-500' },
  { wrap: 'border-emerald-500/30 border-l-emerald-500 bg-emerald-500/10', label: 'text-emerald-500' },
  { wrap: 'border-rose-500/30 border-l-rose-500 bg-rose-500/10', label: 'text-rose-500' },
]
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function formatPrice(n) {
  if (!n || n <= 0) return 'Price on request'
  return `₹${Number(n).toLocaleString('en-IN')}`
}

// Trip duration was already picked in the Details step (e.g. "4N/5D") — the
// vehicle's "No. of days" should default to that instead of always starting at 1.
function tripDaysFromForm(form) {
  const preset = DURATION_PRESETS.find((p) => p.value === form.duration)
  if (preset?.days) return preset.days
  const match = String(form.customDuration || '').match(/(\d+)\s*D/i)
  return match ? Number(match[1]) : 1
}

/** One "Night stays" card, scoped to a single budget tier when `category` is
 * set (or to the whole trip when it's null — the pre-budget-tier behavior).
 * Stays/hotels are matched by object reference rather than array index so
 * add/update/remove stay correct even though this card only sees its own
 * filtered slice of `form.nightStays`. */
function NightStaysCard({ category, label, form, update, hotelMasters, extraBeds, cnbCount }) {
  const stays = (form.nightStays || []).filter((s) => (category ? s.category === category : !s.category))
  const hotelsForTier = (form.hotels || []).filter((h) => (category ? h.category === category : !h.category))

  // Auto-add-missing-hotels and rate-sync both used to run here, once per
  // NightStaysCard instance. With "Multiple budget options" on, the High and
  // Low cards mount side by side and each read the *same* form.nightStays
  // snapshot — whichever tier's effect fired last would overwrite the other's
  // just-added stays with a patch computed from that stale (pre-update)
  // array, silently wiping them out. Moved up to StepCosting as one
  // consolidated effect per concern so there's only ever one writer.

  const updateNightStay = (stay, patch) => {
    update({
      nightStays: (form.nightStays || []).map((s) =>
        s === stay ? { ...s, roomLines: getRoomLines(s), ...patch } : s
      ),
    })
  }

  const removeNightStay = (stay) => {
    update({ nightStays: (form.nightStays || []).filter((s) => s !== stay) })
  }

  const addRoomLine = (stay) => {
    update({
      nightStays: (form.nightStays || []).map((s) =>
        s === stay ? { ...s, roomLines: [...getRoomLines(s), createDefaultRoomLine()] } : s
      ),
    })
  }

  const updateRoomLine = (stay, lineIndex, patch) => {
    update({
      nightStays: (form.nightStays || []).map((s) => {
        if (s !== stay) return s
        const lines = getRoomLines(s).map((l, li) => (li === lineIndex ? { ...l, ...patch } : l))
        return { ...s, roomLines: lines }
      }),
    })
  }

  const removeRoomLine = (stay, lineIndex) => {
    update({
      nightStays: (form.nightStays || []).map((s) =>
        s === stay ? { ...s, roomLines: getRoomLines(s).filter((_, li) => li !== lineIndex) } : s
      ),
    })
  }


  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-3 space-y-0 border-b border-border/60 bg-linear-to-r from-primary/10 to-transparent sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-1.5 shrink-0 rounded-full bg-primary" />
          <div>
            <CardTitle>{label ? `${label} — Night stays` : 'Night stays'}</CardTitle>
            <CardDescription>
              A card appears automatically for every hotel picked in the Hotels step. If the client returns
              to one later in the trip, turn on "Re-check-in" on its card and add the return dates.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hotelsForTier.length === 0 && (
          <p className="text-sm text-amber-600">
            No hotels selected yet. Go back to the Hotels step and select {label ? `${label} ` : ''}hotels first.
          </p>
        )}
        {stays.length === 0 && <p className="text-sm text-muted-foreground">No night stays added yet.</p>}
        {(() => {
          // First-appearance order of each distinct hotel in this tier's
          // list — the color assigned here is what a re-check-in card reuses
          // (see accent lookup below), so both cards for the same hotel
          // always match.
          const hotelColorOrder = []
          for (const s of stays) {
            const k = s.hotelId || s.hotelName
            if (k && !hotelColorOrder.includes(k)) hotelColorOrder.push(k)
          }
          return stays.map((stay, i) => {
          const colorKey = stay.hotelId || stay.hotelName
          const accent = colorKey
            ? HOTEL_ACCENTS[hotelColorOrder.indexOf(colorKey) % HOTEL_ACCENTS.length]
            : null
          const master = hotelMasters.find((h) => h._id === stay.hotelId)
          const roomOptions = master?.rooms?.length
            ? master.rooms
            : master
              ? [{ roomType: master.roomType || 'DELUXE', price: master.price || 0 }]
              : []
          const roomLines = getRoomLines(stay)
          const roomsTotal = roomLines.reduce((sum, l) => {
            const nights = Number(l.nights) || 0
            const rooms = Number(l.roomCount) || 1
            return sum + nights * rooms * (Number(l.pricePerNight) || 0)
          }, 0)
          const extraCost = getStayExtraCost(stay, master, extraBeds, cnbCount)
          const stayTotal = roomsTotal + extraCost
          return (
            <div
              key={i}
              className={`overflow-hidden rounded-xl border-l-4 shadow-sm ${accent ? `border ${accent.wrap}` : 'border border-border/60'}`}
            >
              <div className="bg-linear-to-r from-primary/10 to-transparent p-3">
                <p
                  className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide ${accent ? accent.label : 'text-primary'}`}
                >
                  <span className={`h-3 w-1 rounded-full ${accent ? accent.label.replace('text-', 'bg-') : 'bg-primary'}`} />
                  Property
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Hotel</Label>
                    <Select
                      value={stay.hotelId || ''}
                      onValueChange={(id) => {
                        const selected = hotelsForTier.find((h, idx) => (h.id || h.name || String(idx)) === id)
                        const m = hotelMasters.find((h) => h._id === id)
                        const firstRoom = m?.rooms?.[0]
                        updateNightStay(stay, {
                          hotelId: id,
                          hotelName: selected?.name || m?.name || '',
                          location: stay.location || selected?.location || m?.city || '',
                          extraBedCharge: m?.extraBedCharge || 0,
                          cnbPrice: m?.cnbPrice || 0,
                          roomLines: [
                            {
                              ...createDefaultRoomLine(),
                              roomType: firstRoom?.roomType || m?.roomType || '',
                              pricePerNight: firstRoom?.price ?? m?.price ?? selected?.cost ?? 0,
                            },
                          ],
                        })
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select hotel" />
                      </SelectTrigger>
                      <SelectContent>
                        {hotelsForTier.length === 0 && (
                          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                            No hotels selected. Go to the Hotels step first.
                          </div>
                        )}
                        {hotelsForTier.map((h, idx) => {
                          const key = h.id || h.name || String(idx)
                          return (
                            <SelectItem key={key} value={key}>
                              {h.name}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Location</Label>
                    <Input
                      placeholder="e.g. Pahalgam"
                      value={stay.location}
                      onChange={(e) => updateNightStay(stay, { location: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Check-in</Label>
                    <Input
                      type="date"
                      value={stay.checkIn ? String(stay.checkIn).slice(0, 10) : ''}
                      onChange={(e) => updateNightStay(stay, { checkIn: e.target.value, datesOverridden: true })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Check-out</Label>
                    <Input
                      type="date"
                      value={stay.checkOut ? String(stay.checkOut).slice(0, 10) : ''}
                      onChange={(e) => updateNightStay(stay, { checkOut: e.target.value, datesOverridden: true })}
                    />
                  </div>
                </div>
                {stay.datesOverridden ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Set by hand — won't move on its own anymore.{' '}
                    <button
                      type="button"
                      className="text-primary underline"
                      onClick={() => updateNightStay(stay, { datesOverridden: false })}
                    >
                      Reset to auto
                    </button>
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Auto-set from the trip's start date and each stay's Nights — edit to override.
                  </p>
                )}

                {/* Re-check-in — the client comes back to this same hotel
                  * later in the trip. Handled right here on the card (not as
                  * a separate stay), with its own hand-entered return dates. */}
                {stay.hotelId && (
                  <div className="mt-3 rounded-lg border border-dashed p-2.5">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                      <Switch
                        checked={!!stay.hasReCheckIn}
                        onCheckedChange={(v) => updateNightStay(stay, { hasReCheckIn: v })}
                      />
                      Client re-checks in to {stay.hotelName || 'this hotel'} later in the trip
                    </label>
                    {stay.hasReCheckIn && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Return check-in</Label>
                          <Input
                            type="date"
                            value={stay.reCheckIn ? String(stay.reCheckIn).slice(0, 10) : ''}
                            onChange={(e) => updateNightStay(stay, { reCheckIn: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Return check-out</Label>
                          <Input
                            type="date"
                            value={stay.reCheckOut ? String(stay.reCheckOut).slice(0, 10) : ''}
                            onChange={(e) => updateNightStay(stay, { reCheckOut: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t px-3 pt-2">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    <span className="h-3 w-1 rounded-full bg-primary" />
                    Room types &amp; occupancy
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addRoomLine(stay)}
                    disabled={!stay.hotelId}
                    className="h-7 gap-1 px-2 text-xs"
                  >
                    <Plus className="h-3 w-3" />
                    Add room type
                  </Button>
                </div>

                {roomLines.map((line, li) => (
                  <div key={li} className="relative rounded-lg border border-dashed p-2.5">
                    {roomLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRoomLine(stay, li)}
                        className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div className="grid gap-2 sm:grid-cols-5">
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Room Type</Label>
                        <Select
                          value={line.roomType || ''}
                          onValueChange={(rt) => {
                            const room = roomOptions.find((r) => r.roomType === rt)
                            updateRoomLine(stay, li, { roomType: rt, pricePerNight: room?.price ?? line.pricePerNight })
                          }}
                          disabled={!stay.hotelId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select room" />
                          </SelectTrigger>
                          <SelectContent>
                            {roomOptions.length === 0 && (
                              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                                No room types saved for this hotel.
                              </div>
                            )}
                            {roomOptions.map((r, idx) => (
                              <SelectItem key={idx} value={r.roomType || `room-${idx}`}>
                                {r.roomType || 'Room'} {r.price ? `· ${formatPrice(r.price)}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Price/night (₹)</Label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={line.pricePerNight ?? ''}
                          onChange={(e) =>
                            updateRoomLine(stay, li, {
                              pricePerNight: e.target.value === '' ? '' : Number(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">No. of Rooms</Label>
                        <Input
                          type="number"
                          min={1}
                          placeholder="0"
                          value={line.roomCount ?? ''}
                          onChange={(e) =>
                            updateRoomLine(stay, li, {
                              roomCount: e.target.value === '' ? '' : Number(e.target.value) || 1,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nights</Label>
                        <Input
                          type="number"
                          min={1}
                          placeholder="0"
                          value={line.nights ?? ''}
                          onChange={(e) =>
                            updateRoomLine(stay, li, {
                              nights: e.target.value === '' ? '' : Number(e.target.value) || 1,
                            })
                          }
                        />
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs">
                      <span className="text-muted-foreground">Line price: </span>
                      <span className="font-semibold text-primary">
                        {(() => {
                          const nights = Number(line.nights) || 0
                          const rooms = Number(line.roomCount) || 1
                          const lineTotal = nights * rooms * (Number(line.pricePerNight) || 0)
                          return lineTotal ? formatPrice(lineTotal) : 'Price on request'
                        })()}
                      </span>
                    </p>
                  </div>
                ))}
              </div>

              {(extraBeds > 0 || cnbCount > 0) && (
                <div className="space-y-2 border-t px-3 pt-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    <span className="h-3 w-1 rounded-full bg-primary" />
                    Extra bed / CNB charges
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {extraBeds > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">Extra bed rate (₹/night × {extraBeds})</Label>
                        <Input
                          type="number"
                          min={0}
                          value={stay.extraBedCharge ?? ''}
                          onChange={(e) =>
                            updateNightStay(stay, {
                              extraBedCharge: e.target.value === '' ? '' : Number(e.target.value) || 0,
                              extraChargeOverridden: true,
                            })
                          }
                        />
                      </div>
                    )}
                    {cnbCount > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">CNB rate (₹/night × {cnbCount})</Label>
                        <Input
                          type="number"
                          min={0}
                          value={stay.cnbPrice ?? ''}
                          onChange={(e) =>
                            updateNightStay(stay, {
                              cnbPrice: e.target.value === '' ? '' : Number(e.target.value) || 0,
                              extraChargeOverridden: true,
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-xs">
                    <span className="text-muted-foreground">Extra charge total: </span>
                    <span className="font-semibold text-primary">
                      {extraCost ? formatPrice(extraCost) : 'Price on request'}
                    </span>
                  </p>
                </div>
              )}

              <div className="flex items-end justify-end gap-3 border-t px-3 py-2">
                <div className="space-y-1 text-right">
                  <Label className="text-xs">Total stay price</Label>
                  <p className="text-lg font-bold text-primary">
                    {stayTotal ? formatPrice(stayTotal) : 'Price on request'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end border-t px-3 py-1.5">
                <Button type="button" variant="ghost" size="sm" onClick={() => removeNightStay(stay)} className="text-destructive">
                  Remove stay
                </Button>
              </div>
            </div>
          )
          })
        })()}
      </CardContent>
    </Card>
  )
}

/** One "Extra charges" card, scoped to a single budget tier when `category`
 * is set (or to the whole trip when it's null). Percent charges are computed
 * off `baseTotalForTier` — that tier's own hotel cost plus the shared
 * vehicle/activity total — so a High Budget markup is never percent-of a
 * number that includes the Low Budget hotel cost, or vice versa. */
function ExtraChargesCard({ category, label, form, update, baseTotalForTier }) {
  const [percentInput, setPercentInput] = useState('')
  const [flatInput, setFlatInput] = useState('')
  const charges = (form.extraCharges || []).filter((e) => (category ? e.category === category : !e.category))

  const addPercentCharge = () => {
    const percent = Number(percentInput)
    if (!percent) return
    const amount = (baseTotalForTier * percent) / 100
    update({
      extraCharges: [
        ...(form.extraCharges || []),
        { label: `${percent}% charge`, type: 'percent', percent, amount, ...(category ? { category } : {}) },
      ],
    })
    setPercentInput('')
  }

  const addFlatCharge = () => {
    const amount = Number(flatInput)
    if (!amount) return
    update({
      extraCharges: [
        ...(form.extraCharges || []),
        { label: 'Extra charge', type: 'flat', amount, ...(category ? { category } : {}) },
      ],
    })
    setFlatInput('')
  }

  const removeCharge = (charge) => {
    update({ extraCharges: (form.extraCharges || []).filter((e) => e !== charge) })
  }

  return (
    <div className="space-y-2">
      {label && (
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">
          <span className="h-3 w-1 rounded-full bg-primary" />
          {label}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="e.g. 15"
            value={percentInput}
            onChange={(e) => setPercentInput(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">%</span>
          <Button type="button" size="sm" variant="outline" onClick={addPercentCharge}>
            Add %
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="e.g. 2000"
            value={flatInput}
            onChange={(e) => setFlatInput(e.target.value)}
          />
          <Button type="button" size="sm" variant="outline" onClick={addFlatCharge}>
            Add amount
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {charges.length === 0 ? (
          <span className="text-xs text-muted-foreground">No extra charges added yet.</span>
        ) : (
          charges.map((e, i) => (
            <span key={i} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
              {e.type === 'percent' ? `${e.percent}%` : e.label}
              {` — ${formatPrice(e.amount)}`}
              <button
                type="button"
                onClick={() => removeCharge(e)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  )
}

export default function StepCosting({ form, update }) {
  const [vehicles, setVehicles] = useState([])
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0)
  const [selectedDays, setSelectedDays] = useState(() => tripDaysFromForm(form))
  const [activityOptions, setActivityOptions] = useState([])
  const [selectedActivityId, setSelectedActivityId] = useState('')
  const [activityQty, setActivityQty] = useState(1)
  const [hotelMasters, setHotelMasters] = useState([])
  const [mastersLoading, setMastersLoading] = useState(true)
  // Which already-added vehicle/activity chip's price is being hand-edited
  // right now (index into form.vehicles / form.activities, or null).
  const [editingVehicleIndex, setEditingVehicleIndex] = useState(null)
  const [editVehicleCost, setEditVehicleCost] = useState('')
  const [editingActivityIndex, setEditingActivityIndex] = useState(null)
  const [editActivityCost, setEditActivityCost] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    Promise.all([
      fetch('/api/settings/vehicles', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setVehicles(d.vehicles || []))
        .catch(() => {}),
      fetch('/api/settings/activities', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setActivityOptions(d.activities || []))
        .catch(() => {}),
      fetch('/api/settings/hotels', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setHotelMasters(d.hotels || []))
        .catch(() => {}),
    ]).finally(() => setMastersLoading(false))
  }, [])

  // Auto-add a night-stay card for every hotel picked in the Hotels step —
  // across *every* budget tier in one pass, so "Multiple budget options"
  // never races two per-tier effects against each other (see the note on
  // NightStaysCard above; that race is what made High Budget hotels vanish).
  const tierCategories = form.budgetTiers ? BUDGET_TIERS.map((t) => t.key) : [null]
  const hotelAutoAddKey = (form.hotels || []).map((h) => `${h.id}:${h.category || ''}`).join('|')
  useEffect(() => {
    const nightStays = form.nightStays || []
    const additions = []
    let nextDayNumber = nightStays.length + 1
    for (const category of tierCategories) {
      const hotelsForTier = (form.hotels || []).filter((h) => (category ? h.category === category : !h.category))
      const existingIds = new Set(
        nightStays
          .filter((s) => (category ? s.category === category : !s.category))
          .map((s) => s.hotelId)
          .filter(Boolean)
      )
      for (const h of hotelsForTier) {
        if (!h.id || existingIds.has(h.id)) continue
        const m = hotelMasters.find((hm) => hm._id === h.id)
        const firstRoom = m?.rooms?.[0]
        additions.push({
          location: h.location || m?.city || '',
          hotelName: h.name || m?.name || '',
          hotelId: h.id,
          extraBedCharge: m?.extraBedCharge || 0,
          cnbPrice: m?.cnbPrice || 0,
          roomLines: [
            {
              ...createDefaultRoomLine(),
              roomType: firstRoom?.roomType || m?.roomType || h.roomType || '',
              pricePerNight: firstRoom?.price ?? m?.price ?? h.cost ?? 0,
            },
          ],
          dayNumber: nextDayNumber++,
          ...(category ? { category } : {}),
        })
      }
    }
    if (additions.length === 0) return
    update({ nightStays: [...nightStays, ...additions] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelAutoAddKey, hotelMasters.length, form.budgetTiers])

  // Keep every stay's extra-bed/CNB rate snapshot in sync with its hotel's
  // current master rate — one pass over the whole nightStays array (not one
  // per tier) for the same race-safety reason as above.
  const staySyncKey = (form.nightStays || [])
    .map((s) => `${s.hotelId}:${s.extraBedCharge}:${s.cnbPrice}`)
    .join('|')
  useEffect(() => {
    if (!hotelMasters.length) return
    const nightStays = form.nightStays || []
    let changed = false
    const next = nightStays.map((s) => {
      // A rate the agent hand-edited for this stay (see the Extra bed / CNB
      // charges block in NightStaysCard) stays put — it doesn't get
      // overwritten back to the master rate on the next sync pass.
      if (s.extraChargeOverridden) return s
      const m = hotelMasters.find((hm) => hm._id === s.hotelId)
      if (!m) return s
      const extraBedCharge = m.extraBedCharge || 0
      const cnbPrice = m.cnbPrice || 0
      if (s.extraBedCharge === extraBedCharge && s.cnbPrice === cnbPrice) return s
      changed = true
      return { ...s, extraBedCharge, cnbPrice }
    })
    if (!changed) return
    update({ nightStays: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staySyncKey, hotelMasters.length])

  // Check-in/check-out default to fully derived, chained dates: the first
  // stay (per tier) starts on Day 1's own scheduled date from the Day-wise
  // Plan (not the separate trip-level "start date" field, which can go
  // stale), and every stay after it starts the moment the previous one's
  // nights run out — in array order. That's right for the common case, but
  // array order alone can't always capture the true sequence once a re-check
  // -in is grouped next to its hotel's other card for editing (see "+ Add
  // stay" above) rather than sitting at the true chronological spot in the
  // list — e.g. Hotel A, then Hotel B, then back to Hotel A: putting the
  // second Hotel A card right after the first one (for a tidy grouped view)
  // means the chain would otherwise slot Hotel B's dates *after* both Hotel A
  // visits, not between them. So: any stay the agent has hand-corrected here
  // (`datesOverridden`) keeps its own dates exactly as set — the chain just
  // continues from that stay's own check-out for whatever comes after it.
  const tripAnchorDate = form.days?.[0]?.date ? String(form.days[0].date).slice(0, 10) : form.startDate
  const nightsSequenceKey = (form.nightStays || [])
    .map(
      (s) =>
        `${s.category || ''}:${s.datesOverridden ? `${s.checkIn}-${s.checkOut}` : Math.max(0, ...getRoomLines(s).map((l) => Number(l.nights) || 0))}`
    )
    .join('|')
  useEffect(() => {
    if (!tripAnchorDate) return
    const nightStays = form.nightStays || []
    const cursor = {} // category key ('' when tiers are off) -> next check-in date
    let changed = false
    const next = nightStays.map((s) => {
      const catKey = s.category || ''
      const nights = Math.max(1, ...getRoomLines(s).map((l) => Number(l.nights) || 0))

      if (s.datesOverridden && s.checkIn) {
        cursor[catKey] = s.checkOut || cursor[catKey] || tripAnchorDate
        return s
      }

      if (cursor[catKey] === undefined) cursor[catKey] = tripAnchorDate
      const checkInDate = new Date(cursor[catKey])
      const checkIn = checkInDate.toISOString().slice(0, 10)
      const checkOutDate = new Date(checkInDate)
      checkOutDate.setDate(checkOutDate.getDate() + nights)
      const checkOut = checkOutDate.toISOString().slice(0, 10)
      cursor[catKey] = checkOut
      if (s.checkIn === checkIn && s.checkOut === checkOut) return s
      changed = true
      return { ...s, checkIn, checkOut }
    })
    if (!changed) return
    update({ nightStays: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nightsSequenceKey, tripAnchorDate])

  const selectedVehicle = vehicles.find((v) => v._id === selectedVehicleId)
  const selectedRoute = selectedVehicle?.routes?.[selectedRouteIndex]

  // A trip can use one vehicle across several routes (or multiple vehicles),
  // so each pick is appended to a list rather than overwriting a single field.
  const addVehicleSelection = (type) => {
    if (!selectedVehicle || !selectedRoute) return
    const days = Number(selectedDays) || 1
    const price = type === 'AC' ? selectedRoute.priceAC : selectedRoute.priceNonAC
    update({
      vehicles: [
        ...(form.vehicles || []),
        {
          name: selectedVehicle.name,
          fromLocation: selectedRoute.fromLocation || '',
          toLocation: selectedRoute.toLocation || '',
          priceAC: selectedRoute.priceAC || 0,
          priceNonAC: selectedRoute.priceNonAC || 0,
          selectedType: type,
          days,
          cost: (price || 0) * days,
          currency: 'INR',
        },
      ],
    })
    setSelectedDays(tripDaysFromForm(form))
  }

  const removeVehicleSelection = (index) => {
    update({ vehicles: (form.vehicles || []).filter((_, i) => i !== index) })
  }

  const startEditVehicleCost = (index) => {
    setEditingVehicleIndex(index)
    setEditVehicleCost(String((form.vehicles || [])[index]?.cost ?? ''))
  }

  const saveVehicleCost = () => {
    const cost = Number(editVehicleCost) || 0
    update({
      vehicles: (form.vehicles || []).map((v, i) => (i === editingVehicleIndex ? { ...v, cost } : v)),
    })
    setEditingVehicleIndex(null)
  }

  const adults = Number(form.numberOfAdults) || 0
  const children = Number(form.numberOfChildren) || 0
  const totalPax = adults + children
  const extraBeds = Number(form.extraBeds) || 0
  const cnbCount = Number(form.cnbCount) || 0

  const nightStayTotal = (form.nightStays || []).reduce((sum, s) => {
    const roomsTotal = getRoomLines(s).reduce((lineSum, l) => {
      const nights = Number(l.nights) || 0
      const perNight = (Number(l.roomCount) || 1) * (Number(l.pricePerNight) || 0)
      return lineSum + nights * perNight
    }, 0)
    const m = hotelMasters.find((h) => h._id === s.hotelId)
    return sum + roomsTotal + getStayExtraCost(s, m, extraBeds, cnbCount)
  }, 0)
  const vehicleTotal = (form.vehicles || []).reduce((sum, v) => sum + (Number(v.cost) || 0), 0)
  const activityTotal = (form.activities || []).reduce((sum, a) => sum + (Number(a.cost) || 0), 0)
  const baseTotal = nightStayTotal + vehicleTotal + activityTotal
  const extraChargesTotal = (form.extraCharges || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const calculated = baseTotal + extraChargesTotal
  const categoryTotals = computeCategoryTotals(form, hotelMasters)

  const setField = (key, value) => update({ [key]: value })

  const selectedActivity = activityOptions.find((a) => a._id === selectedActivityId)

  const addActivity = () => {
    if (!selectedActivity) return
    const qty = Number(activityQty) || 1
    const inclusions = form.inclusions || []
    update({
      activities: [
        ...(form.activities || []),
        {
          activityId: selectedActivity._id,
          name: selectedActivity.name,
          price: selectedActivity.price || 0,
          currency: selectedActivity.priceCurrency || 'INR',
          quantity: qty,
          cost: (selectedActivity.price || 0) * qty,
        },
      ],
      inclusions: inclusions.includes(selectedActivity.name) ? inclusions : [...inclusions, selectedActivity.name],
    })
    setActivityQty(1)
  }

  const removeActivity = (index) => {
    update({ activities: (form.activities || []).filter((_, i) => i !== index) })
  }

  const startEditActivityCost = (index) => {
    setEditingActivityIndex(index)
    setEditActivityCost(String((form.activities || [])[index]?.cost ?? ''))
  }

  const saveActivityCost = () => {
    const cost = Number(editActivityCost) || 0
    update({
      activities: (form.activities || []).map((a, i) => (i === editingActivityIndex ? { ...a, cost } : a)),
    })
    setEditingActivityIndex(null)
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-primary/10 to-transparent">
          <div className="flex items-center gap-2.5">
            <span className="h-6 w-1.5 rounded-full bg-primary" />
            <CardTitle>Package costing</CardTitle>
          </div>
          <CardDescription>Traveler counts and vehicle — pricing is auto-calculated from selected hotels and vehicle</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Adults" type="number" value={form.numberOfAdults} onChange={(v) => setField('numberOfAdults', v)} />
            <Field label="Children" type="number" value={form.numberOfChildren} onChange={(v) => setField('numberOfChildren', v)} />
            <div className="space-y-2">
              <Label>Total travelers</Label>
              <Input value={totalPax} readOnly className="bg-muted" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Extra Bed" type="number" value={form.extraBeds} onChange={(v) => setField('extraBeds', v)} />
            <Field label="CNB" type="number" value={form.cnbCount} onChange={(v) => setField('cnbCount', v)} />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Vehicle</Label>
            <Select
              value={selectedVehicleId}
              onValueChange={(id) => {
                setSelectedVehicleId(id)
                setSelectedRouteIndex(0)
              }}
            >
              <SelectTrigger disabled={mastersLoading}>
                <div className="flex items-center gap-2">
                  {mastersLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Car className="h-4 w-4 text-muted-foreground" />
                  )}
                  <SelectValue placeholder={mastersLoading ? 'Loading vehicles…' : 'Select vehicle'} />
                </div>
              </SelectTrigger>
              <SelectContent>
                {!mastersLoading && vehicles.length === 0 && (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                    No vehicles saved. Add them under Settings → Vehicle Management.
                  </div>
                )}
                {vehicles.map((v) => (
                  <SelectItem key={v._id} value={v._id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedVehicle && selectedVehicle.routes?.length > 1 && (
              <Select
                value={String(selectedRouteIndex)}
                onValueChange={(v) => setSelectedRouteIndex(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select route" />
                </SelectTrigger>
                <SelectContent>
                  {selectedVehicle.routes.map((r, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {[r.fromLocation, r.toLocation].filter(Boolean).join(' → ') || `Route ${i + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {selectedVehicle && selectedRoute && (
              <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2.5 pt-2">
                <div className="flex items-center gap-2">
                  <Label className="whitespace-nowrap text-xs">No. of days</Label>
                  <Input
                    type="number"
                    min={1}
                    value={selectedDays}
                    onChange={(e) => setSelectedDays(Number(e.target.value) || 1)}
                    className="h-8 w-20"
                  />
                </div>
                <p className="text-xs font-medium text-primary">
                  Click a fare below to add this vehicle for {selectedDays} day{Number(selectedDays) > 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                {(selectedRoute.priceAC > 0 || selectedRoute.priceNonAC > 0
                  ? ['AC', 'Non-AC'].filter(
                      (type) => (type === 'AC' ? selectedRoute.priceAC : selectedRoute.priceNonAC) > 0
                    )
                  : ['']
                ).map((type) => {
                    const price = type === 'AC' ? selectedRoute.priceAC : selectedRoute.priceNonAC
                    const total = (price || 0) * (Number(selectedDays) || 1)
                    return (
                      <button
                        key={type || 'plain'}
                        type="button"
                        onClick={() => addVehicleSelection(type)}
                        className="rounded-full border border-primary bg-background px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                      >
                        <Plus className="mr-1 inline h-3 w-3" />
                        {type ? `${type} · ${formatPrice(total)}` : `Add vehicle · ${formatPrice(total)}`}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {(form.vehicles || []).length === 0 ? (
                <span className="text-xs text-muted-foreground">No vehicles added yet.</span>
              ) : (
                (form.vehicles || []).map((v, i) => {
                  const routeLabel = [v.fromLocation, v.toLocation].filter(Boolean).join(' → ')
                  if (editingVehicleIndex === i) {
                    return (
                      <span key={i} className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs">
                        ₹
                        <Input
                          type="number"
                          autoFocus
                          value={editVehicleCost}
                          onChange={(e) => setEditVehicleCost(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveVehicleCost()}
                          className="h-6 w-24 px-1.5 py-0"
                        />
                        <button type="button" onClick={saveVehicleCost} className="text-primary hover:text-primary/80">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingVehicleIndex(null)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )
                  }
                  return (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs"
                    >
                      {v.name}
                      {routeLabel ? ` (${routeLabel})` : ''}
                      {v.selectedType ? ` - ${v.selectedType}` : ''}
                      {v.days ? ` · ${v.days}d` : ''}
                      {v.cost ? ` — ${formatPrice(v.cost)}` : ''}
                      <button
                        type="button"
                        onClick={() => startEditVehicleCost(i)}
                        className="text-muted-foreground hover:text-primary"
                        title="Edit price"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeVehicleSelection(i)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )
                })
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Activities</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedActivityId} onValueChange={setSelectedActivityId}>
                <SelectTrigger className="w-auto min-w-55" disabled={mastersLoading}>
                  {mastersLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <SelectValue placeholder={mastersLoading ? 'Loading activities…' : 'Select activity'} />
                </SelectTrigger>
                <SelectContent>
                  {!mastersLoading && activityOptions.length === 0 && (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                      No activities saved. Add them under Settings → Activities.
                    </div>
                  )}
                  {activityOptions.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name} {a.price ? `· ${formatPrice(a.price)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <Label className="text-xs">Number of activities</Label>
                <Input
                  type="number"
                  min={1}
                  value={activityQty}
                  onChange={(e) =>
                    setActivityQty(e.target.value === '' ? '' : Number(e.target.value) || 1)
                  }
                  className="h-9 w-20"
                />
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addActivity} disabled={!selectedActivity} className="gap-1">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {(form.activities || []).length === 0 ? (
                <span className="text-xs text-muted-foreground">No activities added yet.</span>
              ) : (
                (form.activities || []).map((a, i) =>
                  editingActivityIndex === i ? (
                    <span key={i} className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs">
                      ₹
                      <Input
                        type="number"
                        autoFocus
                        value={editActivityCost}
                        onChange={(e) => setEditActivityCost(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveActivityCost()}
                        className="h-6 w-24 px-1.5 py-0"
                      />
                      <button type="button" onClick={saveActivityCost} className="text-primary hover:text-primary/80">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingActivityIndex(null)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ) : (
                    <span key={i} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
                      {a.name}
                      {a.quantity > 1 ? ` ×${a.quantity}` : ''}
                      {a.cost ? ` — ${formatPrice(a.cost)}` : ''}
                      <button
                        type="button"
                        onClick={() => startEditActivityCost(i)}
                        className="text-muted-foreground hover:text-primary"
                        title="Edit price"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeActivity(i)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )
                )
              )}
            </div>
          </div>
          </div>
        </CardContent>
      </Card>

      {form.budgetTiers ? (
        BUDGET_TIERS.map((tier) => (
          <NightStaysCard
            key={tier.key}
            category={tier.key}
            label={tier.label}
            form={form}
            update={update}
            hotelMasters={hotelMasters}
            extraBeds={extraBeds}
            cnbCount={cnbCount}
          />
        ))
      ) : (
        <NightStaysCard
          category={null}
          label={null}
          form={form}
          update={update}
          hotelMasters={hotelMasters}
          extraBeds={extraBeds}
          cnbCount={cnbCount}
        />
      )}

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-primary/10 to-transparent">
          <div className="flex items-center gap-2.5">
            <span className="h-6 w-1.5 rounded-full bg-primary" />
            <CardTitle>Extra charges</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {form.budgetTiers ? (
            <div className="space-y-5">
              {BUDGET_TIERS.map((tier) => {
                const tierBase =
                  (categoryTotals.find((c) => c.category === tier.key)?.hotelTotal || 0) +
                  vehicleTotal +
                  activityTotal
                return (
                  <ExtraChargesCard
                    key={tier.key}
                    category={tier.key}
                    label={tier.label}
                    form={form}
                    update={update}
                    baseTotalForTier={tierBase}
                  />
                )
              })}
            </div>
          ) : (
            <ExtraChargesCard category={null} label={null} form={form} update={update} baseTotalForTier={baseTotal} />
          )}

          {categoryTotals.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {categoryTotals.map(({ category, total }) => (
                <div key={category} className="rounded-xl border bg-primary/5 px-5 py-4">
                  <p className="text-sm text-muted-foreground">{budgetTierLabel(category)} package total</p>
                  <p className="text-2xl font-bold text-primary">{formatPrice(total)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border bg-primary/5 px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Total package cost</p>
                {form.totalPriceOverride !== null && form.totalPriceOverride !== undefined && form.totalPriceOverride !== '' && (
                  <button
                    type="button"
                    onClick={() => update({ totalPriceOverride: null })}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Reset to auto ({formatPrice(calculated)})
                  </button>
                )}
              </div>
              <Input
                type="number"
                value={form.totalPriceOverride ?? calculated}
                onChange={(e) => update({ totalPriceOverride: e.target.value === '' ? '' : Number(e.target.value) })}
                className="mt-1 h-auto border-none bg-transparent px-0 text-2xl font-bold text-primary shadow-none focus-visible:ring-0"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </div>
  )
}
