'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Calendar, Plus, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  return (
    <Link href={href}>
      <Badge className={confirmed ? 'bg-success hover:bg-success' : 'bg-destructive hover:bg-destructive'}>
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
  const [role, setRole] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelRefundAmount, setCancelRefundAmount] = useState('')
  const [cancelling, setCancelling] = useState(false)

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
    // "Completed" isn't a status any booking is ever actually saved with —
    // it's derived from the trip's own dates (still 'confirmed', but the
    // departure date has already passed), so fetch confirmed bookings and
    // filter by date client-side instead of asking the API for status=completed.
    const q = filter === 'completed' ? '?status=confirmed' : filter !== 'all' ? `?status=${filter}` : ''
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
  const completedFiltered =
    filter === 'completed'
      ? bookings.filter((b) => b.endDate && new Date(b.endDate) < new Date())
      : bookings
  const displayedBookings = opsFilterDef ? completedFiltered.filter(opsFilterDef.match) : completedFiltered

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

      <div className="scroll-hover-thin flex flex-nowrap gap-2 overflow-x-auto pb-1">
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
          ['all', 'pending', 'confirmed', 'completed', 'cancelled'].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? 'default' : 'outline'}
              onClick={() => setFilter(s)}
              className="shrink-0 capitalize"
            >
              {s}
            </Button>
          ))
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            All bookings
          </CardTitle>
          <CardDescription>{displayedBookings.length} booking(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 md:hidden">
            {loading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
            ) : displayedBookings.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No bookings yet. Convert an itinerary from a lead profile.
              </p>
            ) : (
              displayedBookings.map((b) => (
                <div key={b._id} className="rounded-xl border p-4">
                  <p className="font-semibold">
                    {leadHref(b) ? (
                      <Link href={leadHref(b)} className="text-primary hover:underline">
                        {leadDisplayName(b.leadId)}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </p>
                  <p className="mt-1 text-sm">{b.itineraryId?.tripName || b.itineraryId?.title || '—'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Booked by: {b.assignedTo?.name || '—'}
                  </p>
                  <div className="mt-2">
                    <span className="font-medium">{formatInr(b.totalAmount, b.currency)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {role === 'accounts' ? (
                      <>
                        <span className="text-xs text-muted-foreground">Advance invoice:</span>
                        <AdvanceInvoiceBadge booking={b} />
                        <span className="text-xs text-muted-foreground">Hotel advance:</span>
                        <HotelAdvanceBadge booking={b} />
                        <span className="text-xs text-muted-foreground">Activity payment:</span>
                        <ActivityPaymentBadge booking={b} />
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-muted-foreground">Hotel:</span>
                        <StatusBadge status={b.hotelStatus} href={`/dashboard/bookings/${b._id}`} />
                        <span className="text-xs text-muted-foreground">Transport:</span>
                        <StatusBadge status={b.vehicleStatus} href={`/dashboard/bookings/${b._id}`} />
                        {b.hasActivities && (
                          <>
                            <span className="text-xs text-muted-foreground">Activity:</span>
                            <StatusBadge status={b.activityStatus} href={`/dashboard/bookings/${b._id}`} />
                          </>
                        )}
                        {b.status === 'cancelled' ? (
                          <Badge className="bg-destructive hover:bg-destructive">Cancelled</Badge>
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
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <TableShell className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Booked by</TableHead>
                  <TableHead>Itinerary</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Amount</TableHead>
                  {role === 'accounts' ? (
                    <>
                      <TableHead>Advance Invoice</TableHead>
                      <TableHead>Hotel Advance Payment</TableHead>
                      <TableHead>Activity Payment</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>Hotel Status</TableHead>
                      <TableHead>Transport Status</TableHead>
                      <TableHead>Activity Status</TableHead>
                      <TableHead>Action</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
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
                    <TableRow key={b._id}>
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
                        {b.itineraryId?.tripName || b.itineraryId?.title || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {b.startDate
                          ? `${new Date(b.startDate).toLocaleDateString()} – ${new Date(b.endDate).toLocaleDateString()}`
                          : '—'}
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
                              <Badge className="bg-destructive hover:bg-destructive">Cancelled</Badge>
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
