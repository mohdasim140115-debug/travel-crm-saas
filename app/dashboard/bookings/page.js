'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Calendar, Plus, X, Loader2, Clock, CheckCircle2, PackageCheck, XCircle, MapPin, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { leadDisplayName, formatInr } from '@/utils/crm'
import { TableShell } from '@/components/crm/TableShell'

function StatusBadge({ status, href }) {
  const confirmed = status === 'confirmed'
  const Icon = confirmed ? CheckCircle2 : Clock
  return (
    <Link href={href}>
      <Badge
        className={
          confirmed
            ? '!rounded-full border-success/40 bg-success/15 text-success hover:bg-success/15'
            : '!rounded-full border-destructive/40 bg-destructive/15 text-destructive hover:bg-destructive/15'
        }
      >
        <Icon className="h-3 w-3" />
        {confirmed ? 'Confirmed' : 'Pending'}
      </Badge>
    </Link>
  )
}

const ADVANCE_INVOICE_LABEL = {
  not_created: 'Not created',
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
}

function AdvanceInvoiceBadge({ booking }) {
  const status = booking.advanceInvoiceStatus || 'not_created'
  const href =
    status === 'not_created'
      ? `/dashboard/invoices?bookingId=${booking._id}&invoiceType=advance&amountReceived=${booking.totalAmount || 0}`
      : '/dashboard/invoices'
  const cls =
    status === 'paid'
      ? 'bg-success hover:bg-success'
      : status === 'sent'
        ? 'bg-blue-600 hover:bg-blue-600'
        : status === 'draft'
          ? 'bg-amber-500 hover:bg-amber-500'
          : 'bg-muted-foreground/60 hover:bg-muted-foreground/60'
  return (
    <Link href={href}>
      <Badge className={cls}>{ADVANCE_INVOICE_LABEL[status]}</Badge>
    </Link>
  )
}

function HotelAdvanceBadge({ booking }) {
  const status = booking.hotelAdvancePaymentStatus || 'none'
  if (status === 'none') return <span className="text-xs text-muted-foreground">—</span>
  return (
    <Link href={`/dashboard/bookings/${booking._id}`}>
      <Badge className={status === 'paid' ? 'bg-success hover:bg-success' : 'bg-destructive hover:bg-destructive'}>
        {status === 'paid' ? 'Paid' : 'Pending'}
      </Badge>
    </Link>
  )
}

function ActivityPaymentBadge({ booking }) {
  const status = booking.activityPaymentStatus || 'none'
  if (status === 'none') return <span className="text-xs text-muted-foreground">—</span>
  return (
    <Link href={`/dashboard/bookings/${booking._id}`}>
      <Badge className={status === 'paid' ? 'bg-success hover:bg-success' : 'bg-destructive hover:bg-destructive'}>
        {status === 'paid' ? 'Paid' : 'Pending'}
      </Badge>
    </Link>
  )
}

// Labels/predicates for the Operations dashboard's stat-tile deep links —
// mirrors the same accurate, live-derived logic app/api/analytics/operations
// uses (hotel/cab status from the confirmation helpers, not the stale
// opsStatus enum), so the count on the tile always matches what shows here.
const OPS_FILTERS = {
  new: { label: 'New Bookings', match: (b) => b.opsStatus === 'awaiting_ops' },
  hotel_pending: { label: 'Hotel Confirmation Pending', match: (b) => b.hotelStatus === 'pending' },
  cab_pending: { label: 'Cab Confirmation Pending', match: (b) => b.vehicleStatus === 'pending' },
  upcoming: {
    label: 'Upcoming Arrivals (next 7 days)',
    match: (b) => {
      if (b.status !== 'confirmed' || !b.startDate) return false
      const sd = new Date(b.startDate)
      const now = new Date()
      return sd >= now && sd <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    },
  },
  running: {
    label: 'Running Tours',
    match: (b) => {
      if (b.status !== 'confirmed' || !b.startDate || !b.endDate) return false
      const now = new Date()
      return new Date(b.startDate) <= now && new Date(b.endDate) >= now
    },
  },
  queue: {
    label: 'Bookings in Queue (not yet invoiced)',
    match: (b) => b.status === 'confirmed' && !b.hasAnyInvoice,
  },
}

export default function BookingsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>}>
      <BookingsPageContent />
    </Suspense>
  )
}

function BookingsPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const opsFilter = searchParams.get('opsFilter')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelRefundAmount, setCancelRefundAmount] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [tabCounts, setTabCounts] = useState({ all: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0 })

  // Counts for the tab tiles — fetched once, independent of which tab is
  // currently selected (the main `bookings` list below is re-fetched
  // *scoped* to the active tab, so it can never answer "how many are
  // Cancelled" while you're sitting on the Pending tab).
  useEffect(() => {
    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }
    const hasAnyPendingC = (b) => b.hotelStatus === 'pending' || b.vehicleStatus === 'pending' || b.activityStatus === 'pending'
    Promise.all([
      fetch(`/api/bookings?status=confirmed&limit=500`, { headers }).then((r) => r.json()).catch(() => null),
      fetch(`/api/bookings?status=cancelled&limit=1`, { headers }).then((r) => r.json()).catch(() => null),
    ]).then(([confirmedData, cancelledData]) => {
      const confirmedBookings = confirmedData?.bookings || []
      setTabCounts({
        all: confirmedBookings.length,
        pending: confirmedBookings.filter(hasAnyPendingC).length,
        confirmed: confirmedBookings.filter((b) => !hasAnyPendingC(b)).length,
        completed: confirmedBookings.filter((b) => b.endDate && new Date(b.endDate) < new Date()).length,
        cancelled: cancelledData?.pagination?.total ?? 0,
      })
    })
  }, [])

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      setRole(u.role || null)
    } catch {
      setRole(null)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    // Every booking is created with status 'confirmed' (see POST
    // /api/bookings) — 'pending' is never actually saved, and 'completed' is
    // derived from the trip's own dates having passed rather than a real
    // status value. So "Pending"/"Confirmed"/"Completed" all fetch the same
    // confirmed-status bookings and are told apart client-side: "Pending" /
    // "Confirmed" by the per-item hotel/cab/activity confirmation state (the
    // same badges the table shows), "Completed" by end date.
    const statusQ =
      ['completed', 'pending', 'confirmed'].includes(filter) ? 'status=confirmed' : filter !== 'all' ? `status=${filter}` : ''
    // The API defaults to limit=10 with no `limit=` param — the Operations
    // dashboard's stat tiles (e.g. "New Bookings: 8") count against the whole
    // team unbounded, so without a real limit here this list only ever showed
    // whatever fit in the first 10 overall, then filtered *that* down to the
    // matching subset — always fewer than the tile's real count.
    const q = `?${statusQ ? `${statusQ}&` : ''}limit=500`
    // Show the skeleton while a new filter's data is in flight — without this
    // the previous filter's rows stayed on screen, then popped.
    setLoading(true)
    fetch(`/api/bookings${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setBookings(d.bookings || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filter])

  const opsFilterDef = opsFilter ? OPS_FILTERS[opsFilter] : null
  const hasAnyPending = (b) => b.hotelStatus === 'pending' || b.vehicleStatus === 'pending' || b.activityStatus === 'pending'
  const tabFiltered =
    filter === 'completed'
      ? bookings.filter((b) => b.endDate && new Date(b.endDate) < new Date())
      : filter === 'pending'
        ? bookings.filter(hasAnyPending)
        : filter === 'confirmed'
          ? bookings.filter((b) => !hasAnyPending(b))
          : bookings
  const opsFiltered = opsFilterDef ? tabFiltered.filter(opsFilterDef.match) : tabFiltered
  const searchQuery = search.trim().toLowerCase()
  const displayedBookings = searchQuery
    ? opsFiltered.filter((b) => {
        const haystack = [
          leadDisplayName(b.leadId),
          b.assignedTo?.name,
          b.itineraryId?.destination,
          b.itineraryId?.tripName,
          b.itineraryId?.title,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(searchQuery)
      })
    : opsFiltered

  const confirmCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error('Add a reason for cancelling this booking')
      return
    }
    const refundAmount = Number(cancelRefundAmount) || 0
    if (refundAmount < 0) {
      toast.error('Refund amount cannot be negative')
      return
    }
    setCancelling(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/bookings/${cancelTarget._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'cancelled', cancelReason: cancelReason.trim(), refundAmount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to cancel booking')
      setBookings((list) => list.map((b) => (b._id === cancelTarget._id ? { ...b, status: 'cancelled' } : b)))
      toast.success('Booking cancelled')
      setCancelTarget(null)
      setCancelReason('')
      setCancelRefundAmount('')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCancelling(false)
    }
  }

  // Operations and Accounts can't reach /dashboard/leads at all, so send them
  // to the full booking detail page instead — same page, with the confirmed
  // hotel/transport/activity details Accounts needs to see. Everyone else
  // keeps going to the lead profile.
  const leadHref = (b) =>
    role === 'operations' || role === 'accounts'
      ? `/dashboard/bookings/${b._id}`
      : b.leadId
        ? `/dashboard/leads/${b.leadId._id || b.leadId}`
        : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground sm:text-base">
          Confirmed trips converted from leads and itineraries
        </p>
        {role !== 'operations' && role !== 'accounts' && (
          <Button asChild size="sm" className="shrink-0 gap-1.5 shadow-sm">
            <Link href="/dashboard/leads">
              <Plus className="h-4 w-4" />
              <span className="sm:hidden">Lead</span>
              <span className="hidden sm:inline">From lead</span>
            </Link>
          </Button>
        )}
      </div>

      <div className={role === 'accounts' ? 'scroll-hover-thin flex flex-nowrap gap-2 overflow-x-auto pb-1' : 'grid grid-cols-2 gap-3 sm:grid-cols-5'}>
        {role === 'accounts' ? (
          <>
            <Button
              size="sm"
              variant={!opsFilterDef && filter === 'all' ? 'default' : 'outline'}
              className="shrink-0"
              onClick={() => {
                setFilter('all')
                if (opsFilter) router.push('/dashboard/bookings')
              }}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={!opsFilterDef && filter === 'completed' ? 'default' : 'outline'}
              className="shrink-0"
              onClick={() => {
                setFilter('completed')
                if (opsFilter) router.push('/dashboard/bookings')
              }}
            >
              Completed
            </Button>
            <Button
              size="sm"
              variant={opsFilter === 'queue' ? 'default' : 'outline'}
              className="shrink-0"
              onClick={() => {
                setFilter('all')
                router.push('/dashboard/bookings?opsFilter=queue')
              }}
            >
              Queue
            </Button>
          </>
        ) : (
          ['all', 'pending', 'confirmed', 'completed', 'cancelled'].map((s) => {
            // Same colour each status badge already uses elsewhere on this
            // page (green=confirmed, red=pending/cancelled, blue=completed)
            // — so the tab you're on and the badges in the table below read
            // as the same language instead of every tab just being purple.
            // Active = solid colour; inactive still gets a tinted version of
            // the same colour (not plain/blank) so every tile reads as "this
            // is what Pending/Confirmed/… looks like" even before picking it.
            const TONE = {
              all: { bg: '!bg-primary !border-primary' },
              pending: { bg: '!bg-destructive !border-destructive' },
              confirmed: { bg: '!bg-success !border-success' },
              completed: { bg: '!bg-sky-600 !border-sky-600' },
              cancelled: { bg: '!bg-zinc-600 !border-zinc-600' },
            }
            const ICON = { all: Calendar, pending: Clock, confirmed: CheckCircle2, completed: PackageCheck, cancelled: XCircle }
            const Icon = ICON[s]
            const active = filter === s
            const tone = TONE[s]
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`flex items-center gap-3 rounded-sm border p-3 text-left capitalize transition-transform hover:-translate-y-0.5 ${tone.bg} ${
                  active ? 'shadow-lg ring-2 ring-white/60' : 'opacity-80'
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/25 text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xl font-bold leading-tight tabular-nums text-white">{tabCounts[s]}</p>
                  <p className="truncate text-xs text-white/80">{s}</p>
                </div>
              </button>
            )
          })
        )}
      </div>

      {opsFilterDef && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span>
            Filtered: <span className="font-medium">{opsFilterDef.label}</span> ({displayedBookings.length})
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1"
            onClick={() => router.push('/dashboard/bookings')}
          >
            <X className="h-3.5 w-3.5" /> Clear filter
          </Button>
        </div>
      )}

      <Card className="border-border/60 shadow-sm">
        <CardContent className="space-y-4 px-3 pt-3 sm:px-6 sm:pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9"
              placeholder="Search by lead name, booked by, or destination…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-3 md:hidden">
            {loading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
            ) : displayedBookings.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No bookings yet. Convert an itinerary from a lead profile.
              </p>
            ) : (
              displayedBookings.map((b) => (
                <div key={b._id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <div className="flex items-start justify-between gap-3 border-b bg-primary/5 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">
                        {leadHref(b) ? (
                          <Link href={leadHref(b)} className="text-primary hover:underline">
                            {leadDisplayName(b.leadId)}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {b.itineraryId?.tripName || b.itineraryId?.title || '—'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Amount</p>
                      <p className="text-base font-bold">{formatInr(b.totalAmount, b.currency)}</p>
                    </div>
                  </div>
                  <dl className="space-y-2 px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-xs text-muted-foreground">Booked by</dt>
                      <dd className="font-medium">{b.assignedTo?.name || '—'}</dd>
                    </div>
                    {role === 'accounts' ? (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-xs text-muted-foreground">Advance invoice</dt>
                          <dd><AdvanceInvoiceBadge booking={b} /></dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-xs text-muted-foreground">Hotel advance</dt>
                          <dd><HotelAdvanceBadge booking={b} /></dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-xs text-muted-foreground">Activity payment</dt>
                          <dd><ActivityPaymentBadge booking={b} /></dd>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-xs text-muted-foreground">Hotel</dt>
                          <dd><StatusBadge status={b.hotelStatus} href={`/dashboard/bookings/${b._id}`} /></dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-xs text-muted-foreground">Transport</dt>
                          <dd><StatusBadge status={b.vehicleStatus} href={`/dashboard/bookings/${b._id}`} /></dd>
                        </div>
                        {b.hasActivities && (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="text-xs text-muted-foreground">Activity</dt>
                            <dd><StatusBadge status={b.activityStatus} href={`/dashboard/bookings/${b._id}`} /></dd>
                          </div>
                        )}
                      </>
                    )}
                  </dl>
                  {role !== 'accounts' && (
                    <div className="flex gap-2 border-t px-3 py-2.5">
                      <Button size="sm" variant="outline" className="flex-1" asChild>
                        <Link href={`/dashboard/bookings/${b._id}`}>Open booking</Link>
                      </Button>
                      {b.status === 'cancelled' ? (
                        <Badge className="self-center bg-destructive hover:bg-destructive">Cancelled</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setCancelTarget(b)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <TableShell className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="!border-b-2 border-primary/30 bg-primary/10 hover:bg-primary/10">
                  <TableHead className="py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lead</TableHead>
                  <TableHead className="py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Booked by</TableHead>
                  <TableHead className="py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Itinerary</TableHead>
                  <TableHead className="py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Dates</TableHead>
                  <TableHead className="py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Amount</TableHead>
                  {role === 'accounts' ? (
                    <>
                      <TableHead className="py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Advance Invoice</TableHead>
                      <TableHead className="py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Hotel Advance Payment</TableHead>
                      <TableHead className="py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Activity Payment</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Hotel Status</TableHead>
                      <TableHead className="py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Transport Status</TableHead>
                      <TableHead className="py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Activity Status</TableHead>
                      <TableHead className="py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Action</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody className="[&_td]:py-4">
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={role === 'accounts' ? 8 : 9} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : displayedBookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={role === 'accounts' ? 8 : 9} className="py-8 text-center text-muted-foreground">
                      No bookings yet. Convert an itinerary from a lead profile.
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedBookings.map((b) => (
                    <TableRow key={b._id} className="border-b border-border/40 hover:bg-primary/5">
                      <TableCell className="font-medium">
                        {leadHref(b) ? (
                          <Link href={leadHref(b)} className="text-primary hover:underline">
                            {leadDisplayName(b.leadId)}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{b.assignedTo?.name || '—'}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-sm">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {b.itineraryId?.destination || b.itineraryId?.tripName || b.itineraryId?.title || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {b.startDate
                            ? `${new Date(b.startDate).toLocaleDateString()} – ${new Date(b.endDate).toLocaleDateString()}`
                            : '—'}
                        </span>
                      </TableCell>
                      <TableCell>{formatInr(b.totalAmount, b.currency)}</TableCell>
                      {role === 'accounts' ? (
                        <>
                          <TableCell>
                            <AdvanceInvoiceBadge booking={b} />
                          </TableCell>
                          <TableCell>
                            <HotelAdvanceBadge booking={b} />
                          </TableCell>
                          <TableCell>
                            <ActivityPaymentBadge booking={b} />
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>
                            <StatusBadge status={b.hotelStatus} href={`/dashboard/bookings/${b._id}`} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={b.vehicleStatus} href={`/dashboard/bookings/${b._id}`} />
                          </TableCell>
                          <TableCell>
                            {b.hasActivities ? (
                              <StatusBadge status={b.activityStatus} href={`/dashboard/bookings/${b._id}`} />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {b.status === 'cancelled' ? (
                              <Badge className="!rounded-full border-destructive/40 bg-destructive/15 text-destructive hover:bg-destructive/15">
                                <XCircle className="h-3 w-3" />
                                Cancelled
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="!rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setCancelTarget(b)}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Cancel
                              </Button>
                            )}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableShell>
        </CardContent>
      </Card>

      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel booking — {leadDisplayName(cancelTarget?.leadId)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for cancelling *</Label>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Client cancelled the trip"
              />
            </div>
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <Label>Refund / settlement amount (₹)</Label>
              <Input
                type="number"
                value={cancelRefundAmount}
                onChange={(e) => setCancelRefundAmount(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                How much the company owes the client back. Leave 0 if nothing is refundable — Accounts will see
                this and settle it once you confirm.
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            className="w-full gap-1.5"
            disabled={cancelling}
            onClick={confirmCancel}
          >
            {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm cancellation
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
