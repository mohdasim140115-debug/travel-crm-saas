'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  Check,
  Pencil,
  User,
  Hotel,
  Car,
  BedDouble,
  Ticket,
  Send,
  Mail,
  Copy,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { leadDisplayName, formatInr } from '@/utils/crm'
import { toCompressedDataUrl } from '@/lib/imageCompress'

// Rotates across a booking's hotels so each one is visually distinct —
// saturated color tints (not a gray/muted shade, which barely showed up
// against the card's own background in either theme).
const HOTEL_ACCENTS = [
  { wrap: 'border border-sky-500/30 border-l-4 border-l-sky-500 bg-sky-500/10', label: 'text-sky-500' },
  { wrap: 'border border-amber-500/30 border-l-4 border-l-amber-500 bg-amber-500/10', label: 'text-amber-500' },
  { wrap: 'border border-violet-500/30 border-l-4 border-l-violet-500 bg-violet-500/10', label: 'text-violet-500' },
  { wrap: 'border border-emerald-500/30 border-l-4 border-l-emerald-500 bg-emerald-500/10', label: 'text-emerald-500' },
  { wrap: 'border border-rose-500/30 border-l-4 border-l-rose-500 bg-rose-500/10', label: 'text-rose-500' },
]

const MEAL_PLANS = [
  { value: 'EP', label: 'EP — European Plan (room only)' },
  { value: 'CP', label: 'CP — Continental Plan (+breakfast)' },
  { value: 'MAP', label: 'MAP — Modified American Plan (+breakfast & dinner)' },
  { value: 'AP', label: 'AP — American Plan (all meals)' },
]

function formatDate(d) {
  if (!d) return ''
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toIsoDate(d) {
  if (!d) return ''
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

/** Every selectable day of the trip (inclusive) — a hotel's check-in/check-out
 * can only ever be one of these, so it can never end up confirmed against a
 * date outside the actual trip. */
function tripDateOptions(startDate, endDate) {
  if (!startDate || !endDate) return []
  const out = []
  const cursor = new Date(startDate)
  const end = new Date(endDate)
  while (cursor <= end) {
    out.push(toIsoDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

const token = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null)
const authH = () => ({ Authorization: `Bearer ${token()}` })
const currentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}')
  } catch {
    return {}
  }
}

/** Dynamic, ready-to-copy confirmation email to the hotel — every value
 * comes straight from what Operations has already fetched/entered here. */
function buildHotelEmailText({ booking, lead, itinerary, item, draft, senderName, agencyName }) {
  const totalGuests = (itinerary?.numberOfAdults || 0) + (itinerary?.numberOfChildren || 0)
  const guestName = leadDisplayName(lead)
  return [
    `Subject: Room Booking Confirmation – ${item.name} – ${guestName}`,
    '',
    `Dear ${item.name}, Reservation Team`,
    '',
    `Warm greetings from ${agencyName || 'our agency'}!`,
    '',
    'We would like to request room confirmation for our valued guest as per the following details:',
    '',
    `Guest Name: ${guestName}`,
    `Check-in: ${formatDate(draft.checkIn) || '—'}`,
    `Check-out: ${formatDate(draft.checkOut) || '—'}`,
    `Number of Nights: ${item.nights ?? '—'}`,
    `Room Type: ${item.roomType || '—'}`,
    `Number of Rooms: ${item.roomCount ?? '—'}`,
    `Extra Bed: ${item.extraBeds || 0}`,
    `CNB (Child No Bed): ${item.cnbCount || 0}`,
    `Meal Plan: ${draft.mealPlan || '—'}`,
    `Total Guests: ${totalGuests} (${itinerary?.numberOfAdults ?? 0} Adults, ${itinerary?.numberOfChildren ?? 0} Children)`,
    '',
    'Kindly share the final confirmation at your earliest convenience.',
    '',
    'Looking forward to your valued response.',
    '',
    'Warm regards,',
    senderName || 'Operations Team',
    agencyName || '',
  ].join('\n')
}

export default function BookingDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tripDates, setTripDates] = useState([])
  const [role, setRole] = useState(null)
  const [userName, setUserName] = useState('')
  const [agencyName, setAgencyName] = useState('')
  const [emailModalItem, setEmailModalItem] = useState(null)
  const [emailText, setEmailText] = useState('')
  const [emailSentKeys, setEmailSentKeys] = useState({})
  const [sendingAdvanceKey, setSendingAdvanceKey] = useState(null)
  const [payingAdvanceKey, setPayingAdvanceKey] = useState(null)
  const [previewImage, setPreviewImage] = useState(null)
  const [paidScreenshots, setPaidScreenshots] = useState({})
  const [compressingPaidKey, setCompressingPaidKey] = useState(null)

  const [pickup, setPickup] = useState('')
  const [drop, setDrop] = useState('')
  const [savingLocation, setSavingLocation] = useState(false)

  const [hotelDrafts, setHotelDrafts] = useState({})
  const [editingHotelKey, setEditingHotelKey] = useState(null)
  const [savingHotelKey, setSavingHotelKey] = useState(null)

  const [vehicleDrafts, setVehicleDrafts] = useState({})
  const [editingVehicleKey, setEditingVehicleKey] = useState(null)
  const [savingVehicleKey, setSavingVehicleKey] = useState(null)

  const [activityDrafts, setActivityDrafts] = useState({})
  const [editingActivityKey, setEditingActivityKey] = useState(null)
  const [savingActivityKey, setSavingActivityKey] = useState(null)
  const [sendingActivityPaymentKey, setSendingActivityPaymentKey] = useState(null)
  const [payingActivityPaymentKey, setPayingActivityPaymentKey] = useState(null)
  const [activityPaidScreenshots, setActivityPaidScreenshots] = useState({})
  const [compressingActivityPaidKey, setCompressingActivityPaidKey] = useState(null)

  const load = () => {
    setLoading(true)
    fetch(`/api/bookings/${id}`, { headers: authH() })
      .then((r) => r.json())
      .then((d) => {
        const b = d.booking
        setBooking(b)
        setPickup(b?.pickupLocation || deriveDefaultPickup(b))
        setDrop(b?.dropLocation || deriveDefaultDrop(b))
        setTripDates(tripDateOptions(b?.planStartDate, b?.planEndDate))
        setHotelDrafts(
          Object.fromEntries(
            (b?.hotelConfirmations || []).map((h) => [
              h.key,
              {
                checkIn: toIsoDate(h.checkIn),
                checkOut: toIsoDate(h.checkOut),
                mealPlan: h.mealPlan || '',
                roomPrice: h.roomPrice ?? h.quotedRoomPricePerNight ?? '',
                extraBedPrice: h.extraBedPrice ?? h.quotedExtraBedPrice ?? '',
                cnbPrice: h.cnbPrice ?? h.quotedCnbPrice ?? '',
                advanceRequired: Boolean(h.advanceRequired),
                advanceAmount: h.advanceAmount ?? '',
                extraCharge: h.extraCharge ?? '',
                extraChargeRemark: h.extraChargeRemark || '',
              },
            ])
          )
        )
        setVehicleDrafts(
          Object.fromEntries(
            (b?.vehicleConfirmations || []).map((v) => [
              v.key,
              {
                driverName: v.driverName || '',
                driverPhone: v.driverPhone || '',
                vehicleNumber: v.vehicleNumber || '',
                licenseNumber: v.licenseNumber || '',
                price: v.price ?? '',
              },
            ])
          )
        )
        setActivityDrafts(
          Object.fromEntries(
            (b?.activityConfirmations || []).map((a) => [
              a.key,
              {
                price: a.price ?? a.quotedUnitPrice ?? '',
                quantity: a.quantity ?? 1,
              },
            ])
          )
        )
      })
      .catch(() => toast.error('Failed to load booking'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    const u = currentUser()
    setRole(u.role || null)
    setUserName(u.name || '')
  }, [])

  // Agency name for the hotel-confirmation email — the brand linked to this
  // booking's itinerary, falling back to the workspace's default brand.
  useEffect(() => {
    if (!booking) return
    fetch('/api/brands', { headers: authH() })
      .then((r) => r.json())
      .then((d) => {
        const brands = d.brands || []
        const itineraryBrandId = booking.itineraryId?.brandId
        const match =
          (itineraryBrandId && brands.find((b) => String(b._id) === String(itineraryBrandId))) ||
          brands.find((b) => b.isDefault) ||
          brands[0]
        setAgencyName(match?.name || '')
      })
      .catch(() => {})
  }, [booking?.itineraryId?.brandId])

  const canEditOps = role === 'operations' || role === 'admin'
  const canPayAdvance = role === 'accounts' || role === 'admin'

  function deriveDefaultPickup(b) {
    const vehicles = b?.itineraryId?.vehicles || []
    if (vehicles[0]?.fromLocation) return vehicles[0].fromLocation
    const transfers = b?.itineraryId?.transfers || []
    return transfers[0]?.from || ''
  }
  function deriveDefaultDrop(b) {
    const vehicles = b?.itineraryId?.vehicles || []
    if (vehicles.length) return vehicles[vehicles.length - 1]?.toLocation || ''
    const transfers = b?.itineraryId?.transfers || []
    return transfers.length ? transfers[transfers.length - 1]?.to || '' : ''
  }

  const savePickupDrop = async () => {
    setSavingLocation(true)
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({ pickupLocation: pickup, dropLocation: drop }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Pickup/Drop saved')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingLocation(false)
    }
  }

  const confirmHotel = async (item) => {
    const draft = hotelDrafts[item.key] || {}
    if (!(Number(draft.roomPrice) > 0)) {
      toast.error('Enter the room price agreed with the hotel')
      return
    }
    if (draft.checkIn && draft.checkOut && draft.checkOut <= draft.checkIn) {
      toast.error('Check-out must be after check-in')
      return
    }
    if (draft.advanceRequired && !(Number(draft.advanceAmount) > 0)) {
      toast.error('Enter the advance amount required')
      return
    }
    if (draft.advanceRequired && !item.advancePaid) {
      toast.error('Get the advance paid by Accounts before confirming this hotel')
      return
    }
    if (Number(draft.extraCharge) > 0 && !draft.extraChargeRemark?.trim()) {
      toast.error('Add a remark explaining the extra charge')
      return
    }
    setSavingHotelKey(item.key)
    try {
      const res = await fetch(`/api/bookings/${id}/confirmations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({
          type: 'hotel',
          key: item.key,
          confirmed: true,
          roomType: item.roomType,
          checkIn: draft.checkIn,
          checkOut: draft.checkOut,
          mealPlan: draft.mealPlan,
          roomPrice: Number(draft.roomPrice) || 0,
          extraBedPrice: Number(draft.extraBedPrice) || 0,
          cnbPrice: Number(draft.cnbPrice) || 0,
          advanceRequired: draft.advanceRequired,
          advanceAmount: draft.advanceRequired ? Number(draft.advanceAmount) || 0 : 0,
          extraCharge: Number(draft.extraCharge) || 0,
          extraChargeRemark: Number(draft.extraCharge) > 0 ? draft.extraChargeRemark.trim() : '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to confirm')
      setBooking((b) => ({ ...b, hotelConfirmations: data.hotelConfirmations, hotelStatus: data.status }))
      setEditingHotelKey(null)
      toast.success('Hotel confirmed — charged to supplier ledger')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingHotelKey(null)
    }
  }

  const sendAdvanceRequest = async (item) => {
    const draft = hotelDrafts[item.key] || {}
    if (!(Number(draft.roomPrice) > 0)) {
      toast.error('Enter the room price agreed with the hotel')
      return
    }
    if (!(Number(draft.advanceAmount) > 0)) {
      toast.error('Enter the advance amount required')
      return
    }
    if (draft.checkIn && draft.checkOut && draft.checkOut <= draft.checkIn) {
      toast.error('Check-out must be after check-in')
      return
    }
    if (Number(draft.extraCharge) > 0 && !draft.extraChargeRemark?.trim()) {
      toast.error('Add a remark explaining the extra charge')
      return
    }
    setSendingAdvanceKey(item.key)
    try {
      const res = await fetch(`/api/bookings/${id}/hotel-advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({
          key: item.key,
          roomType: item.roomType,
          checkIn: draft.checkIn,
          checkOut: draft.checkOut,
          mealPlan: draft.mealPlan,
          roomPrice: Number(draft.roomPrice) || 0,
          extraBedPrice: Number(draft.extraBedPrice) || 0,
          cnbPrice: Number(draft.cnbPrice) || 0,
          extraCharge: Number(draft.extraCharge) || 0,
          extraChargeRemark: draft.extraChargeRemark || '',
          advanceAmount: Number(draft.advanceAmount) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setBooking((b) => ({ ...b, hotelConfirmations: data.hotelConfirmations, hotelStatus: data.status }))
      toast.success('Sent to Accountant')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSendingAdvanceKey(null)
    }
  }

  const handlePaidScreenshotPick = async (key, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCompressingPaidKey(key)
    try {
      // Kept well under 30KB so this never bloats the DB or slows the app —
      // it's a proof screenshot, not an archival copy.
      const dataUrl = await toCompressedDataUrl(file, 30 * 1024)
      setPaidScreenshots((s) => ({ ...s, [key]: dataUrl }))
    } catch {
      toast.error('Failed to process screenshot')
    } finally {
      setCompressingPaidKey(null)
    }
  }

  const markAdvancePaid = async (item) => {
    const screenshotUrl = paidScreenshots[item.key]
    if (!screenshotUrl) {
      toast.error('Upload a screenshot of the payment made to the hotel first')
      return
    }
    setPayingAdvanceKey(item.key)
    try {
      const res = await fetch(`/api/bookings/${id}/hotel-advance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({ key: item.key, screenshotUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update')
      setBooking((b) => ({
        ...b,
        hotelConfirmations: b.hotelConfirmations.map((h) =>
          h.key === item.key
            ? { ...h, advancePaid: true, advancePaidAt: data.advancePaidAt, advancePaidScreenshot: data.advancePaidScreenshot }
            : h
        ),
      }))
      setPaidScreenshots((s) => {
        const next = { ...s }
        delete next[item.key]
        return next
      })
      toast.success('Advance marked as paid')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setPayingAdvanceKey(null)
    }
  }

  const confirmVehicle = async (item) => {
    const draft = vehicleDrafts[item.key] || {}
    if (!draft.driverName.trim() || !draft.vehicleNumber.trim()) {
      toast.error('Driver name and vehicle number are required')
      return
    }
    if (!(Number(draft.price) > 0)) {
      toast.error('Enter the price agreed with the driver/transport vendor')
      return
    }
    setSavingVehicleKey(item.key)
    try {
      const res = await fetch(`/api/bookings/${id}/confirmations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({
          type: 'vehicle',
          key: item.key,
          confirmed: true,
          driverName: draft.driverName,
          driverPhone: draft.driverPhone,
          vehicleNumber: draft.vehicleNumber,
          licenseNumber: draft.licenseNumber,
          price: Number(draft.price) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to confirm')
      setBooking((b) => ({ ...b, vehicleConfirmations: data.vehicleConfirmations, vehicleStatus: data.status }))
      setEditingVehicleKey(null)
      toast.success('Transport confirmed — charged to supplier ledger')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingVehicleKey(null)
    }
  }

  const sendActivityPaymentRequest = async (item) => {
    const draft = activityDrafts[item.key] || {}
    if (!(Number(draft.price) >= 0)) {
      toast.error('Enter the price agreed for this activity')
      return
    }
    if (!(Number(draft.quantity) > 0)) {
      toast.error('Enter how many guests this activity is for')
      return
    }
    setSendingActivityPaymentKey(item.key)
    try {
      const res = await fetch(`/api/bookings/${id}/activity-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({ key: item.key, price: Number(draft.price), quantity: Number(draft.quantity) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send payment request')
      setBooking((b) => ({ ...b, activityConfirmations: data.activityConfirmations, activityStatus: data.status }))
      toast.success('Payment request sent to Accountant')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSendingActivityPaymentKey(null)
    }
  }

  const handleActivityPaidScreenshotPick = async (key, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCompressingActivityPaidKey(key)
    try {
      const dataUrl = await toCompressedDataUrl(file, 30 * 1024)
      setActivityPaidScreenshots((s) => ({ ...s, [key]: dataUrl }))
    } catch {
      toast.error('Failed to process screenshot')
    } finally {
      setCompressingActivityPaidKey(null)
    }
  }

  const markActivityPaymentPaid = async (item) => {
    const screenshotUrl = activityPaidScreenshots[item.key]
    if (!screenshotUrl) {
      toast.error('Upload a screenshot of the payment made first')
      return
    }
    setPayingActivityPaymentKey(item.key)
    try {
      const res = await fetch(`/api/bookings/${id}/activity-payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({ key: item.key, screenshotUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update')
      setBooking((b) => ({
        ...b,
        activityConfirmations: b.activityConfirmations.map((a) =>
          a.key === item.key
            ? { ...a, paymentPaid: true, paymentPaidAt: data.paymentPaidAt, paymentPaidScreenshot: data.paymentPaidScreenshot }
            : a
        ),
      }))
      setActivityPaidScreenshots((s) => {
        const next = { ...s }
        delete next[item.key]
        return next
      })
      toast.success('Payment marked as paid')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setPayingActivityPaymentKey(null)
    }
  }

  const confirmActivity = async (item) => {
    const draft = activityDrafts[item.key] || {}
    if (!(Number(draft.price) >= 0)) {
      toast.error('Enter the price agreed for this activity')
      return
    }
    if (!(Number(draft.quantity) > 0)) {
      toast.error('Enter how many guests this activity is for')
      return
    }
    if (!item.paymentPaid) {
      toast.error('Get the payment done by Accounts before confirming this activity')
      return
    }
    setSavingActivityKey(item.key)
    try {
      const res = await fetch(`/api/bookings/${id}/confirmations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({
          type: 'activity',
          key: item.key,
          confirmed: true,
          price: Number(draft.price),
          quantity: Number(draft.quantity),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update')
      setBooking((b) => ({ ...b, activityConfirmations: data.activityConfirmations, activityStatus: data.status }))
      setEditingActivityKey(null)
      toast.success('Activity booked')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingActivityKey(null)
    }
  }


  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }
  if (!booking) {
    return <p className="py-16 text-center text-muted-foreground">Booking not found.</p>
  }

  const lead = booking.leadId
  const itinerary = booking.itineraryId

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" onClick={() => router.push('/dashboard/bookings')}>
        <ArrowLeft className="h-4 w-4" /> Back to bookings
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{leadDisplayName(lead)}</h1>
        <p className="text-sm text-muted-foreground">
          {booking.bookingNumber} · {itinerary?.tripName || itinerary?.title || '—'}
        </p>
      </div>

      {/* Client Details */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" /> Client Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <p className="font-medium">{leadDisplayName(lead)}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Number</Label>
              <p className="font-medium">{lead?.phone || '—'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Adults / Child</Label>
              <p className="font-medium">
                {itinerary?.numberOfAdults ?? '—'} adults · {itinerary?.numberOfChildren ?? 0} child
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Arrival date</Label>
              <p className="font-medium">{formatDate(booking.planStartDate) || '—'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Departure date</Label>
              <p className="font-medium">{formatDate(booking.planEndDate) || '—'}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Pick up</Label>
              <Input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Pick up point" />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Drop</Label>
                <Input value={drop} onChange={(e) => setDrop(e.target.value)} placeholder="Drop point" />
              </div>
              <Button size="sm" disabled={savingLocation} onClick={savePickupDrop}>
                {savingLocation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!previewImage} onOpenChange={(o) => !o && setPreviewImage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment screenshot</DialogTitle>
          </DialogHeader>
          {previewImage && <img src={previewImage} alt="Advance payment proof" className="w-full rounded-md border" />}
        </DialogContent>
      </Dialog>

      {/* Hotels */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hotel className="h-4 w-4" /> Hotels
            <Badge className={booking.hotelStatus === 'confirmed' ? 'bg-success' : 'bg-destructive'}>
              {booking.hotelStatus === 'confirmed' ? 'Confirmed' : 'Pending'}
            </Badge>
          </CardTitle>
          <CardDescription>Fetched from the closed itinerary — confirm the actual rate with each hotel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(booking.hotelConfirmations || []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No hotels on this booking's itinerary.</p>
          ) : (
            booking.hotelConfirmations.map((item, idx) => {
              const draft = hotelDrafts[item.key] || {}
              const editing = canEditOps && (!item.confirmed || editingHotelKey === item.key)
              const total =
                (Number(draft.roomPrice) || 0) * (item.roomCount || 1) * (item.nights || 1) +
                (Number(draft.extraBedPrice) || 0) * (item.extraBeds || 0) * (item.nights || 1) +
                (Number(draft.cnbPrice) || 0) * (item.cnbCount || 0) * (item.nights || 1) +
                (Number(draft.extraCharge) || 0)
              // Rotating, strongly-tinted (not just gray-muted) accent per
              // hotel so two or more on one booking are unmistakable at a
              // glance — a faint gray tint wasn't visible enough against the
              // card's own background in either theme.
              const accent = HOTEL_ACCENTS[idx % HOTEL_ACCENTS.length]
              return (
                <div key={item.key} className={`space-y-3 rounded-lg p-4 ${accent.wrap}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`mb-1 text-lg font-extrabold uppercase tracking-wide ${accent.label}`}>
                        Hotel {idx + 1}
                      </p>
                      <p className="font-semibold">{item.name}</p>
                      {item.location && <p className="text-xs text-muted-foreground">{item.location}</p>}
                    </div>
                    {item.confirmed && (
                      <Badge className="gap-1 bg-success">
                        <Check className="h-3 w-3" /> Confirmed
                      </Badge>
                    )}
                  </div>

                  {/* Fetched row */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-1">
                      <Label className="text-xs">Check-in</Label>
                      <Select
                        value={draft.checkIn || ''}
                        onValueChange={(v) => setHotelDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], checkIn: v } }))}
                        disabled={!editing}
                      >
                        <SelectTrigger><SelectValue placeholder="Select date" /></SelectTrigger>
                        <SelectContent>
                          {tripDates.map((d) => (
                            <SelectItem key={d} value={d}>{formatDate(d)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Check-out</Label>
                      <Select
                        value={draft.checkOut || ''}
                        onValueChange={(v) => setHotelDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], checkOut: v } }))}
                        disabled={!editing}
                      >
                        <SelectTrigger><SelectValue placeholder="Select date" /></SelectTrigger>
                        <SelectContent>
                          {tripDates.map((d) => (
                            <SelectItem key={d} value={d}>{formatDate(d)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Nights</Label>
                      <p className="flex h-9 items-center text-sm">{item.nights ?? '—'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Rooms</Label>
                      <p className="flex h-9 items-center gap-1 text-sm">
                        <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />
                        {item.roomCount ?? '—'} · {item.roomType || '—'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Extra bed / CNB</Label>
                      <p className="flex h-9 items-center text-sm">
                        {item.extraBeds || 0} extra bed · {item.cnbCount || 0} CNB
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1 sm:max-w-xs">
                    <Label className="text-xs">Meal plan</Label>
                    <Select
                      value={draft.mealPlan || ''}
                      onValueChange={(v) => setHotelDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], mealPlan: v } }))}
                      disabled={!editing}
                    >
                      <SelectTrigger><SelectValue placeholder="Select meal plan" /></SelectTrigger>
                      <SelectContent>
                        {MEAL_PLANS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Payment confirm row */}
                  <div className="rounded-md border border-dashed p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Payment confirm
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Room price (per room/night)</Label>
                        <Input
                          type="number"
                          value={draft.roomPrice ?? ''}
                          disabled={!editing}
                          onChange={(e) => setHotelDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], roomPrice: e.target.value } }))}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          × {item.roomCount || 1} room{(item.roomCount || 1) === 1 ? '' : 's'} × {item.nights || 1} night{(item.nights || 1) === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Extra bed price (per bed)</Label>
                        <Input
                          type="number"
                          value={draft.extraBedPrice ?? ''}
                          disabled={!editing}
                          onChange={(e) => setHotelDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], extraBedPrice: e.target.value } }))}
                        />
                        <p className="text-[11px] text-muted-foreground">× {item.extraBeds || 0} extra bed(s) × {item.nights || 1} night{(item.nights || 1) === 1 ? '' : 's'}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CNB price (per CNB)</Label>
                        <Input
                          type="number"
                          value={draft.cnbPrice ?? ''}
                          disabled={!editing}
                          onChange={(e) => setHotelDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], cnbPrice: e.target.value } }))}
                        />
                        <p className="text-[11px] text-muted-foreground">× {item.cnbCount || 0} CNB × {item.nights || 1} night{(item.nights || 1) === 1 ? '' : 's'}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Total cost</Label>
                        <p className="flex h-9 items-center font-semibold">₹{total}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Extra charge (if any)</Label>
                        <Input
                          type="number"
                          placeholder="e.g. late check-out fee"
                          value={draft.extraCharge ?? ''}
                          disabled={!editing}
                          onChange={(e) => setHotelDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], extraCharge: e.target.value } }))}
                        />
                      </div>
                      {Number(draft.extraCharge) > 0 && (
                        <div className="space-y-1">
                          <Label className="text-xs">Remark — why this extra charge? *</Label>
                          <Input
                            placeholder="e.g. Late check-out till 5 PM"
                            value={draft.extraChargeRemark ?? ''}
                            disabled={!editing}
                            onChange={(e) => setHotelDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], extraChargeRemark: e.target.value } }))}
                          />
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={Boolean(draft.advanceRequired)}
                          disabled={!editing}
                          onCheckedChange={(v) => setHotelDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], advanceRequired: v } }))}
                        />
                        <Label className="text-xs">Advance required?</Label>
                      </div>
                      {draft.advanceRequired && (
                        <div className="flex flex-wrap items-end gap-2">
                          <Input
                            type="number"
                            placeholder="Advance amount"
                            className="w-40"
                            value={draft.advanceAmount ?? ''}
                            disabled={!editing}
                            onChange={(e) => setHotelDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], advanceAmount: e.target.value } }))}
                          />

                          {/* Advance hand-off — Operations sends once the hotel is
                           * confirmed (that's when the Supplier charge/ledger this
                           * advance applies against actually exists); Accounts marks
                           * it paid once the payment is made. */}
                          {item.advancePaid ? (
                            <>
                              <Badge className="h-9 gap-1 bg-success px-3">
                                <Check className="h-3.5 w-3.5" /> Paid ({formatDate(item.advancePaidAt)})
                              </Badge>
                              {item.advancePaidScreenshot && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  onClick={() => setPreviewImage(item.advancePaidScreenshot)}
                                >
                                  View payment proof
                                </Button>
                              )}
                            </>
                          ) : item.advanceSentAt ? (
                            <>
                              <Button size="sm" variant="outline" disabled className="gap-1.5">
                                Pending Payment
                              </Button>
                              {canPayAdvance && (
                                <>
                                  <input
                                    id={`paid-screenshot-${item.key}`}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={compressingPaidKey === item.key}
                                    onChange={(e) => handlePaidScreenshotPick(item.key, e)}
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={compressingPaidKey === item.key}
                                    className="gap-1.5"
                                    onClick={() => document.getElementById(`paid-screenshot-${item.key}`)?.click()}
                                  >
                                    {compressingPaidKey === item.key ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Upload className="h-3.5 w-3.5" />
                                    )}
                                    {paidScreenshots[item.key] ? 'Proof selected' : 'Upload payment proof'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    disabled={payingAdvanceKey === item.key || !paidScreenshots[item.key]}
                                    onClick={() => markAdvancePaid(item)}
                                    className="gap-1.5"
                                  >
                                    {payingAdvanceKey === item.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                    Mark as paid
                                  </Button>
                                </>
                              )}
                            </>
                          ) : (
                            canEditOps && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={sendingAdvanceKey === item.key}
                                onClick={() => sendAdvanceRequest(item)}
                                className="gap-1.5"
                              >
                                {sendingAdvanceKey === item.key ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Send className="h-3.5 w-3.5" />
                                )}
                                Send to Accountant
                              </Button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    {canEditOps && (
                      <Button
                        size="sm"
                        variant={emailSentKeys[item.key] ? undefined : 'outline'}
                        className={emailSentKeys[item.key] ? 'gap-1.5 bg-success hover:bg-success' : 'gap-1.5'}
                        onClick={() => {
                          setEmailModalItem({ item, draft })
                          setEmailText(
                            buildHotelEmailText({
                              booking,
                              lead,
                              itinerary,
                              item,
                              draft,
                              senderName: userName,
                              agencyName,
                            })
                          )
                        }}
                      >
                        {emailSentKeys[item.key] ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Mail className="h-3.5 w-3.5" />
                        )}
                        {emailSentKeys[item.key] ? 'Email sent' : 'Send Email'}
                      </Button>
                    )}
                    {!canEditOps ? null : !editing ? (
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => setEditingHotelKey(item.key)}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={savingHotelKey === item.key || (Boolean(draft.advanceRequired) && !item.advancePaid)}
                        onClick={() => confirmHotel(item)}
                        className="gap-1.5"
                      >
                        {savingHotelKey === item.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {draft.advanceRequired && !item.advancePaid ? 'Awaiting advance payment' : 'Confirm hotel'}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Transport */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Car className="h-4 w-4" /> Transport
            <Badge className={booking.vehicleStatus === 'confirmed' ? 'bg-success' : 'bg-destructive'}>
              {booking.vehicleStatus === 'confirmed' ? 'Confirmed' : 'Pending'}
            </Badge>
          </CardTitle>
          <CardDescription>Vehicle from the closed itinerary — add the actual driver once confirmed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(booking.vehicleConfirmations || []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No vehicles on this booking's itinerary.</p>
          ) : (
            booking.vehicleConfirmations.map((item) => {
              const draft = vehicleDrafts[item.key] || {}
              const editing = canEditOps && (!item.confirmed || editingVehicleKey === item.key)
              return (
                <div key={item.key} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.name || 'Vehicle'}</p>
                      {item.route && <p className="text-xs text-muted-foreground">{item.route}</p>}
                    </div>
                    {item.confirmed && (
                      <Badge className="gap-1 bg-success">
                        <Check className="h-3 w-3" /> Confirmed
                      </Badge>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Driver name</Label>
                      <Input
                        value={draft.driverName ?? ''}
                        disabled={!editing}
                        onChange={(e) => setVehicleDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], driverName: e.target.value } }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Driver number</Label>
                      <Input
                        value={draft.driverPhone ?? ''}
                        disabled={!editing}
                        onChange={(e) => setVehicleDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], driverPhone: e.target.value } }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Vehicle number</Label>
                      <Input
                        value={draft.vehicleNumber ?? ''}
                        disabled={!editing}
                        // Normalized here (no spaces, uppercase) so the same
                        // car always resolves to the same Driver/Supplier
                        // record instead of splitting its ledger by typo.
                        onChange={(e) =>
                          setVehicleDrafts((d) => ({
                            ...d,
                            [item.key]: { ...d[item.key], vehicleNumber: e.target.value.replace(/\s+/g, '').toUpperCase() },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">License number</Label>
                      <Input
                        value={draft.licenseNumber ?? ''}
                        disabled={!editing}
                        onChange={(e) => setVehicleDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], licenseNumber: e.target.value } }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Agreed price (₹)</Label>
                      <Input
                        type="number"
                        value={draft.price ?? ''}
                        disabled={!editing}
                        onChange={(e) => setVehicleDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], price: e.target.value } }))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {item.confirmed && item.price != null && (
                      <p className="text-xs text-muted-foreground">
                        Charged to transport ledger: <span className="font-medium text-foreground">₹{item.price}</span>
                        {item.supplierId && (
                          <>
                            {' · '}
                            <Link href={`/dashboard/drivers/${item.supplierId}`} className="text-primary hover:underline">
                              View ledger
                            </Link>
                          </>
                        )}
                      </p>
                    )}
                    <div className="ml-auto flex gap-2">
                      {!canEditOps ? null : !editing ? (
                        <Button size="sm" variant="ghost" className="gap-1" onClick={() => setEditingVehicleKey(item.key)}>
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                      ) : (
                        <Button size="sm" disabled={savingVehicleKey === item.key} onClick={() => confirmVehicle(item)} className="gap-1.5">
                          {savingVehicleKey === item.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Confirm transport
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Additional Activities */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-4 w-4" /> Additional Activities
            <Badge className={booking.activityStatus === 'confirmed' ? 'bg-success' : 'bg-destructive'}>
              {booking.activityStatus === 'confirmed' ? 'Booked' : 'Pending'}
            </Badge>
          </CardTitle>
          <CardDescription>Add-on activities from the closed itinerary — price and headcount are editable since the supplier's rate can change.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(booking.activityConfirmations || []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No additional activities on this booking's itinerary.</p>
          ) : (
            booking.activityConfirmations.map((item) => {
              const draft = activityDrafts[item.key] || {}
              const editing = canEditOps && (!item.confirmed || editingActivityKey === item.key)
              const total = (Number(draft.price) || 0) * (Number(draft.quantity) || 0)
              return (
                <div key={item.key} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.name || 'Activity'}</p>
                      {item.quotedPrice != null && (
                        <p className="text-xs text-muted-foreground">Quoted: ₹{item.quotedPrice}</p>
                      )}
                    </div>
                    {item.confirmed && (
                      <Badge className="gap-1 bg-success">
                        <Check className="h-3 w-3" /> Booked
                      </Badge>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Price per guest</Label>
                      <Input
                        type="number"
                        value={draft.price ?? ''}
                        disabled={!editing}
                        onChange={(e) => setActivityDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], price: e.target.value } }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={draft.quantity ?? ''}
                        disabled={!editing}
                        onChange={(e) => setActivityDrafts((d) => ({ ...d, [item.key]: { ...d[item.key], quantity: e.target.value } }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Total</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="flex h-9 items-center font-semibold">₹{total}</p>
                        {!item.paymentSentAt && canEditOps && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={sendingActivityPaymentKey === item.key}
                            onClick={() => sendActivityPaymentRequest(item)}
                            className="gap-1.5"
                          >
                            {sendingActivityPaymentKey === item.key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Send Accountant
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {item.paymentSentAt && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
                      {item.paymentPaid ? (
                        <>
                          <Badge className="h-9 gap-1 bg-success px-3">
                            <Check className="h-3.5 w-3.5" /> Paid ({formatDate(item.paymentPaidAt)})
                          </Badge>
                          {item.paymentPaidScreenshot && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => setPreviewImage(item.paymentPaidScreenshot)}
                            >
                              View payment proof
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" disabled className="gap-1.5">
                            Pending Payment
                          </Button>
                          {canPayAdvance && (
                            <>
                              <input
                                id={`activity-paid-screenshot-${item.key}`}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={compressingActivityPaidKey === item.key}
                                onChange={(e) => handleActivityPaidScreenshotPick(item.key, e)}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={compressingActivityPaidKey === item.key}
                                className="gap-1.5"
                                onClick={() => document.getElementById(`activity-paid-screenshot-${item.key}`)?.click()}
                              >
                                {compressingActivityPaidKey === item.key ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Upload className="h-3.5 w-3.5" />
                                )}
                                {activityPaidScreenshots[item.key] ? 'Proof selected' : 'Upload payment proof'}
                              </Button>
                              <Button
                                size="sm"
                                disabled={payingActivityPaymentKey === item.key || !activityPaidScreenshots[item.key]}
                                onClick={() => markActivityPaymentPaid(item)}
                                className="gap-1.5"
                              >
                                {payingActivityPaymentKey === item.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Mark as paid
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    {!canEditOps ? null : !editing ? (
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => setEditingActivityKey(item.key)}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={savingActivityKey === item.key || !item.paymentPaid}
                        onClick={() => confirmActivity(item)}
                        className="gap-1.5"
                      >
                        {savingActivityKey === item.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {!item.paymentPaid ? 'Awaiting accountant payment' : 'Confirm activity'}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(emailModalItem)} onOpenChange={(o) => !o && setEmailModalItem(null)}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> Hotel confirmation email
            </DialogTitle>
            <DialogDescription>
              Edit if needed, then copy and send from your email client — pre-filled from what's on this booking.
            </DialogDescription>
          </DialogHeader>
          {emailModalItem && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <Textarea
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                className="h-full min-h-[240px] flex-1 resize-none font-mono text-xs"
              />
              <Button
                className="w-full shrink-0 gap-1.5"
                onClick={() => {
                  navigator.clipboard.writeText(emailText)
                  toast.success('Copied to clipboard')
                  setEmailSentKeys((s) => ({ ...s, [emailModalItem.item.key]: true }))
                  setEmailModalItem(null)
                }}
              >
                <Copy className="h-4 w-4" /> Copy email
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
