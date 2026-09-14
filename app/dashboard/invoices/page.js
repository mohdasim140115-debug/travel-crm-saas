'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, FileText, Upload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { mutateJson } from '@/lib/mutate'
import { formatInr } from '@/utils/crm'
import { TableShell } from '@/components/crm/TableShell'
import { toCompressedDataUrl } from '@/lib/imageCompress'

function formatDate(d) {
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return null
  }
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={null}>
      <InvoicesPageInner />
    </Suspense>
  )
}

function InvoicesPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [invoices, setInvoices] = useState([])
  const [bookings, setBookings] = useState([])
  const [dayPlanDates, setDayPlanDates] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [finalInvoiceAmount, setFinalInvoiceAmount] = useState(0)
  const [hasFinalInvoice, setHasFinalInvoice] = useState(false)
  const [paymentScreenshot, setPaymentScreenshot] = useState('')
  const [compressingScreenshot, setCompressingScreenshot] = useState(false)
  const [form, setForm] = useState({
    bookingId: '',
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    amount: '',
    dueDate: '',
    invoiceType: 'proforma',
    gstRate: 0,
  })

  const load = () => {
    const token = localStorage.getItem('token')
    Promise.all([
      // Was limit=50 with no bound on how many clients/bookings a team can
      // have — the Accounts dashboard's tiles count the whole (unbounded)
      // team, so this page silently showed fewer than the tile said once a
      // team passed 50 of either.
      fetch('/api/invoices?limit=500', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch('/api/bookings?limit=500', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([invData, bookData]) => {
        setInvoices(invData.invoices || [])
        setBookings(bookData.bookings || [])
        // Coming from the Accounts dashboard's "new advance payment" queue —
        // jump straight into the dialog with that booking pre-selected.
        const bookingId = searchParams.get('bookingId')
        if (bookingId && (bookData.bookings || []).some((b) => String(b._id) === bookingId)) {
          const invoiceType = searchParams.get('invoiceType') || 'advance'
          const amount = searchParams.get('amountReceived') || ''
          selectBooking(bookingId, { invoiceType, amount }, bookData.bookings || [])
          setOpen(true)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    if (!['admin', 'accounts'].includes(u.role)) {
      window.location.href = '/dashboard'
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Picking a booking (routed to this accounts person) auto-fills the
  // client's name/email/phone and the package amount from that booking —
  // no re-typing details that already live on the lead/booking. Due date
  // defaults to the client's arrival (Day 1 of the itinerary plan, falling
  // back to the booking's startDate) but stays fully editable either way.
  const selectBooking = (bookingId, overrides = {}, list = bookings) => {
    const b = list.find((x) => String(x._id) === bookingId)
    setForm((f) => ({
      ...f,
      bookingId,
      clientName: b ? [b.leadId?.firstName, b.leadId?.lastName].filter(Boolean).join(' ') : '',
      clientEmail: b?.leadId?.email || '',
      clientPhone: b?.leadId?.phone || '',
      amount: '',
      dueDate: b?.startDate ? new Date(b.startDate).toISOString().slice(0, 10) : '',
      ...overrides,
    }))

    setDayPlanDates([])
    setFinalInvoiceAmount(0)
    setHasFinalInvoice(false)
    setPaymentScreenshot('')
    if (!bookingId) return
    const token = localStorage.getItem('token')

    // Full booking detail (not the summary list row) has every invoice
    // already raised — needed to work out what's left for a Final Invoice.
    // Only invoice.amountPaid counts as "received" — the Sales-side advance
    // is never added separately, since it only ever shows up here once it's
    // been billed through some invoice; adding it again would double-count
    // the same money.
    fetch(`/api/bookings/${bookingId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        const booking = d.booking
        if (!booking) return
        const receivedSoFar = (booking.invoices || []).reduce((sum, i) => sum + (i.amountPaid || 0), 0)
        setFinalInvoiceAmount(Math.max(0, (booking.totalAmount || 0) - receivedSoFar))
        setHasFinalInvoice((booking.invoices || []).some((i) => i.invoiceType === 'tax_invoice'))
      })
      .catch(() => setFinalInvoiceAmount(0))

    const itineraryId = b?.itineraryId?._id || b?.itineraryId
    if (!itineraryId) return
    fetch(`/api/itineraries/${itineraryId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        const dates = (d.days || [])
          .filter((day) => day.date)
          .map((day) => ({
            value: new Date(day.date).toISOString().slice(0, 10),
            label: `Day ${day.dayNumber} — ${formatDate(day.date)}`,
          }))
        setDayPlanDates(dates)
        if (dates.length) {
          setForm((f) => ({ ...f, dueDate: f.dueDate || dates[0].value }))
        }
      })
      .catch(() => setDayPlanDates([]))
  }

  const handlePaymentScreenshotPick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCompressingScreenshot(true)
    try {
      // Well under 300KB — a proof screenshot, not an archival copy.
      const dataUrl = await toCompressedDataUrl(file, 300 * 1024)
      setPaymentScreenshot(dataUrl)
    } catch {
      toast.error('Failed to process screenshot')
    } finally {
      setCompressingScreenshot(false)
    }
  }

  const createInvoice = async () => {
    // Partial and Advance invoices both bill exactly what was received; a
    // Final Invoice bills whatever's left of the package and isn't hand-typed.
    const isAdvanceLike = ['advance', 'proforma'].includes(form.invoiceType)
    const isFinal = form.invoiceType === 'tax_invoice'
    const subtotal = isFinal ? finalInvoiceAmount : Number(form.amount)
    if (!form.bookingId || !form.clientName || !subtotal || (!isFinal && !form.dueDate)) {
      toast.error('Fill all required fields')
      return
    }
    if (isAdvanceLike && subtotal > finalInvoiceAmount) {
      toast.error(`Amount cannot exceed the due balance of ${formatInr(finalInvoiceAmount)}`)
      return
    }
    // The final-invoice amount is "package total minus what's been PAID so
    // far" — it doesn't drop to 0 just because a Final Invoice was already
    // raised, since the client hasn't actually paid it yet. That reads as
    // "the amount never goes away", but the real risk it hides is creating a
    // second Final Invoice for the same balance before the first is paid.
    if (isFinal && hasFinalInvoice) {
      toast.error('A Final Invoice already exists for this booking — mark it paid before raising another.')
      return
    }
    const token = localStorage.getItem('token')
    const selected = bookings.find((b) => String(b._id) === form.bookingId)
    let data
    try {
      data = await mutateJson('/api/invoices', {
        token,
        body: {
          bookingId: form.bookingId,
          leadId: selected?.leadId?._id || selected?.leadId,
          clientName: form.clientName,
          clientEmail: form.clientEmail,
          clientPhone: form.clientPhone,
          subtotal,
          taxRate: Number(form.gstRate) || 0,
          dueDate: isFinal ? new Date().toISOString().slice(0, 10) : form.dueDate,
          invoiceType: form.invoiceType,
          // A Final Invoice only shows as paid (and clears the client's
          // balance) once money has actually come in — a screenshot attached
          // to it IS that proof, so treat it the same as Advance/Partial.
          amountPaid: isAdvanceLike || (isFinal && paymentScreenshot) ? subtotal : 0,
          paymentScreenshot,
          items: [
            {
              description: isAdvanceLike ? 'Payment received' : isFinal ? 'Final payment' : 'Travel package',
              quantity: 1,
              rate: subtotal,
              amount: subtotal,
            },
          ],
        },
      })
    } catch (e) {
      toast.error(e.message || 'Failed to create invoice')
      return
    }
    toast.success('Invoice created')
    setOpen(false)
    setForm({
      bookingId: '',
      clientName: '',
      clientEmail: '',
      clientPhone: '',
      amount: '',
      dueDate: '',
      invoiceType: 'proforma',
      gstRate: 0,
    })
    setDayPlanDates([])
    setFinalInvoiceAmount(0)
    setPaymentScreenshot('')
    load()
    if (data.invoice?._id) downloadInvoicePdf(data.invoice._id)
  }

  // The PDF route needs the auth header, so it can't be a plain <a href> —
  // fetch it as a blob and trigger the browser's save-file dialog ourselves.
  const downloadInvoicePdf = async (invoiceId) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`, {
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
      a.download = `invoice-${invoiceId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err.message || 'Failed to download PDF')
    }
  }

  // Same client can have several invoices (proforma, advance, tax...) — the
  // list should show one row per client/booking, not one per invoice, with
  // a combined "Due balance" against that client's package total.
  const groupedInvoices = useMemo(() => {
    const groups = new Map()
    for (const inv of invoices) {
      const bookingId = inv.bookingId?._id || inv.bookingId
      const key = bookingId ? String(bookingId) : `no-booking-${inv.clientName}-${inv.clientEmail}`
      if (!groups.has(key)) {
        const booking = bookings.find((b) => String(b._id) === String(bookingId))
        groups.set(key, {
          key,
          bookingId,
          clientName: inv.clientName,
          packageTotal: booking?.totalAmount || 0,
          startDate: booking?.startDate || null,
          endDate: booking?.endDate || null,
          bookingStatus: booking?.status || null,
          refundAmount: booking?.refundAmount || 0,
          refundStatus: booking?.refundStatus || 'none',
          invoices: [],
        })
      }
      groups.get(key).invoices.push(inv)
    }
    // The Accounts dashboard's Ongoing/Upcoming/Arriving-Tomorrow tiles count
    // every confirmed booking in that date range, invoiced or not — a
    // booking nobody's invoiced yet is exactly the one Accounts most needs to
    // notice, especially if it's arriving tomorrow. Without this, a booking
    // with zero invoices had no row here at all, so the tile's count could
    // never match what this page showed.
    for (const b of bookings) {
      if (b.status !== 'confirmed') continue
      const key = String(b._id)
      if (groups.has(key)) continue
      groups.set(key, {
        key,
        bookingId: b._id,
        clientName: b.leadId ? [b.leadId.firstName, b.leadId.lastName].filter(Boolean).join(' ') : 'Client',
        packageTotal: b.totalAmount || 0,
        startDate: b.startDate || null,
        endDate: b.endDate || null,
        bookingStatus: b.status,
        refundAmount: b.refundAmount || 0,
        refundStatus: b.refundStatus || 'none',
        invoices: [],
      })
    }
    return Array.from(groups.values()).map((g) => {
      const amountPaidSum = g.invoices.reduce((s, i) => s + (i.amountPaid || 0), 0)
      const packageTotal = g.packageTotal || Math.max(...g.invoices.map((i) => i.totalAmount || 0), 0)
      const dueBalance = Math.max(0, packageTotal - amountPaidSum)
      const latest = [...g.invoices].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      )[0]
      // Ongoing = trip is happening right now (today between arrival and
      // departure); Upcoming = arrival hasn't happened yet; arrivingTomorrow
      // is a subset of Upcoming flagged separately for the alert filter.
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today.getTime() + 86400000)
      const arrival = g.startDate ? new Date(g.startDate) : null
      const departure = g.endDate ? new Date(g.endDate) : null
      let tripStage = null
      if (g.bookingStatus === 'cancelled') {
        tripStage = 'cancelled'
      } else if (arrival && departure) {
        if (today >= arrival && today <= departure) tripStage = 'ongoing'
        else if (today < arrival) tripStage = 'upcoming'
        else tripStage = 'past'
      }
      const arrivingTomorrow =
        g.bookingStatus !== 'cancelled' &&
        Boolean(
          arrival && arrival.getFullYear() === tomorrow.getFullYear() &&
            arrival.getMonth() === tomorrow.getMonth() &&
            arrival.getDate() === tomorrow.getDate()
        )
      const dueDate = g.invoices.reduce((min, i) => {
        if (!i.dueDate) return min
        return !min || new Date(i.dueDate) < new Date(min) ? i.dueDate : min
      }, null)
      return { ...g, amountPaidSum, packageTotal, dueBalance, latest, dueDate, tripStage, arrivingTomorrow }
    })
  }, [invoices, bookings])

  const [clientFilter, setClientFilter] = useState('all')
  useEffect(() => {
    const f = searchParams.get('filter')
    if (['ongoing', 'upcoming', 'tomorrow', 'pending'].includes(f)) setClientFilter(f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Same "chase this right now" definition the Accounts dashboard's Pending
  // Payments tile counts against (see app/api/analytics/accounts/route.js:
  // an *invoice* that's still unpaid/partial with a due date today or
  // already passed) — checked per invoice, not off the client's earliest
  // due date across every invoice (which could easily be one that's since
  // been paid), or that tile's count never matched this list.
  const isPending = (g) => {
    const dueWindow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    return (g.invoices || []).some(
      (inv) =>
        ['unpaid', 'partial'].includes(inv.paymentStatus) &&
        inv.dueDate &&
        new Date(inv.dueDate) <= dueWindow
    )
  }

  const visibleInvoices = useMemo(() => {
    if (clientFilter === 'all') return groupedInvoices
    if (clientFilter === 'tomorrow') return groupedInvoices.filter((g) => g.arrivingTomorrow)
    if (clientFilter === 'pending') return groupedInvoices.filter(isPending)
    return groupedInvoices.filter((g) => g.tripStage === clientFilter)
  }, [groupedInvoices, clientFilter])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground sm:text-base">
          GST invoices and payment tracking
        </p>
        <Button onClick={() => setOpen(true)} size="sm" className="shrink-0 gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">New invoice</span>
        </Button>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            All invoices
          </CardTitle>
          <CardDescription>{visibleInvoices.length} client(s)</CardDescription>
          <div className="scroll-hover-thin flex flex-nowrap gap-2 overflow-x-auto pt-1 pb-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'pending', label: 'Pending Payments' },
              { key: 'ongoing', label: 'Ongoing Clients' },
              { key: 'upcoming', label: 'Upcoming Clients' },
              { key: 'tomorrow', label: 'Arriving Tomorrow' },
            ].map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={clientFilter === f.key ? 'default' : 'outline'}
                className="shrink-0"
                onClick={() => setClientFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 md:hidden">
            {visibleInvoices.map((g, idx) => (
              <div
                key={g.key}
                className="rounded-xl border p-4"
                onClick={() => g.bookingId && router.push(`/dashboard/invoices/${g.bookingId}`)}
              >
                <p className="text-xs text-muted-foreground">#{idx + 1}</p>
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold">{g.clientName}</p>
                  {g.bookingStatus === 'cancelled' && (
                    <Badge className="bg-destructive hover:bg-destructive">Cancelled</Badge>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>{formatInr(g.packageTotal)}</span>
                  {g.bookingStatus === 'cancelled' ? (
                    g.refundAmount > 0 && (
                      <span className="text-sm">
                        Refund:{' '}
                        <span className={`font-semibold ${g.refundStatus === 'paid' ? 'text-success' : 'text-amber-600'}`}>
                          {formatInr(g.refundAmount)} {g.refundStatus === 'paid' ? '(paid)' : '(pending)'}
                        </span>
                      </span>
                    )
                  ) : (
                    <span className="text-sm">
                      Due: <span className="font-semibold text-destructive">{formatInr(g.dueBalance)}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <TableShell className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>S.No</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Due balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : visibleInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    {clientFilter === 'all' ? (
                      <>
                        No invoices yet.{' '}
                        <Link href="/dashboard/bookings" className="text-primary hover:underline">
                          Create a booking
                        </Link>{' '}
                        first, then invoice the client.
                      </>
                    ) : (
                      `No ${clientFilter} clients right now.`
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                visibleInvoices.map((g, idx) => (
                  <TableRow
                    key={g.key}
                    className={g.bookingId ? 'cursor-pointer' : undefined}
                    onClick={() => g.bookingId && router.push(`/dashboard/invoices/${g.bookingId}`)}
                  >
                    <TableCell className="font-medium">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {g.clientName}
                        {g.bookingStatus === 'cancelled' && (
                          <Badge className="bg-destructive hover:bg-destructive">Cancelled</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatInr(g.packageTotal)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {g.dueDate ? new Date(g.dueDate).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>
                      {g.bookingStatus === 'cancelled' ? (
                        g.refundAmount > 0 ? (
                          <span
                            className={`font-semibold ${g.refundStatus === 'paid' ? 'text-success' : 'text-amber-600'}`}
                          >
                            Refund {formatInr(g.refundAmount)} {g.refundStatus === 'paid' ? '(paid)' : '(pending)'}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )
                      ) : (
                        <span className="font-semibold text-destructive">{formatInr(g.dueBalance)}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </TableShell>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>Create invoice</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Client / Booking *</Label>
              <Select value={form.bookingId} onValueChange={selectBooking}>
                <SelectTrigger className="w-full">
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
              <p className="text-xs text-muted-foreground">
                Picking a booking fills in the client's name, contact, and package amount below.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Client name *</Label>
              <Input
                value={form.clientName}
                onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Client email</Label>
              <Input
                type="email"
                value={form.clientEmail}
                onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Client phone</Label>
              <Input
                value={form.clientPhone}
                onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Invoice type *</Label>
              <Select
                value={form.invoiceType}
                onValueChange={(v) => setForm((f) => ({ ...f, invoiceType: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proforma">Partial Invoice</SelectItem>
                  <SelectItem value="advance">Advance Invoice</SelectItem>
                  <SelectItem value="tax_invoice">Final Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {['advance', 'proforma'].includes(form.invoiceType) ? (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <Label>Amount received (₹) *</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className={
                    Number(form.amount) > finalInvoiceAmount ? 'border-destructive focus-visible:ring-destructive' : ''
                  }
                />
                {Number(form.amount) > finalInvoiceAmount && (
                  <p className="text-xs font-medium text-destructive">
                    Amount exceeds the due balance of {formatInr(finalInvoiceAmount)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  This invoice bills exactly what was received — the remaining balance is billed later via a
                  Final Invoice.
                </p>
                <div className="flex items-center justify-between border-t pt-2 text-sm">
                  <span className="text-muted-foreground">Total due</span>
                  <span className="font-semibold">{formatInr(finalInvoiceAmount)}</span>
                </div>
                <div className="border-t pt-2">
                  <Label className="text-xs">Payment screenshot</Label>
                  <input
                    id="invoice-list-payment-screenshot"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={compressingScreenshot}
                    onChange={handlePaymentScreenshotPick}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={compressingScreenshot}
                    className="mt-1 gap-1.5"
                    onClick={() => document.getElementById('invoice-list-payment-screenshot')?.click()}
                  >
                    {compressingScreenshot ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {paymentScreenshot ? 'Screenshot selected' : 'Upload screenshot (optional)'}
                  </Button>
                  {paymentScreenshot && (
                    <img
                      src={paymentScreenshot}
                      alt="Payment proof"
                      className="mt-2 h-20 w-20 rounded border object-cover"
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <Label>Final invoice amount (₹)</Label>
                <Input type="number" value={finalInvoiceAmount} disabled readOnly />
                <p className="text-xs text-muted-foreground">
                  Auto-calculated — package total minus everything already received (advance + Partial/Advance
                  invoices). Not editable.
                </p>
                {hasFinalInvoice && (
                  <p className="text-xs font-medium text-destructive">
                    A Final Invoice already exists for this booking — this amount stays until it's marked paid,
                    it isn't a second bill.
                  </p>
                )}
                <div className="border-t pt-2">
                  <Label className="text-xs">Payment screenshot</Label>
                  <p className="text-xs text-muted-foreground">
                    Attach only if this balance is already received — doing so marks this invoice Paid right away.
                  </p>
                  <input
                    id="invoice-list-final-payment-screenshot"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={compressingScreenshot}
                    onChange={handlePaymentScreenshotPick}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={compressingScreenshot}
                    className="mt-1 gap-1.5"
                    onClick={() => document.getElementById('invoice-list-final-payment-screenshot')?.click()}
                  >
                    {compressingScreenshot ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {paymentScreenshot ? 'Screenshot selected' : 'Upload screenshot (optional)'}
                  </Button>
                  {paymentScreenshot && (
                    <img
                      src={paymentScreenshot}
                      alt="Payment proof"
                      className="mt-2 h-20 w-20 rounded border object-cover"
                    />
                  )}
                </div>
              </div>
            )}
            <div className="space-y-2 rounded-md border p-3">
              <Label>GST</Label>
              <div className="grid grid-cols-3 gap-2">
                {[0, 5, 18].map((rate) => (
                  <Button
                    key={rate}
                    type="button"
                    size="sm"
                    variant={Number(form.gstRate) === rate ? 'default' : 'outline'}
                    onClick={() => setForm((f) => ({ ...f, gstRate: rate }))}
                  >
                    {rate === 0 ? 'No GST' : `${rate}%`}
                  </Button>
                ))}
              </div>
            </div>
            {form.invoiceType !== 'tax_invoice' && (
              <div className="space-y-2">
                <Label>Due date *</Label>
                {dayPlanDates.length > 0 ? (
                  <>
                    <Select
                      value={form.dueDate || 'none'}
                      onValueChange={(v) => setForm((f) => ({ ...f, dueDate: v === 'none' ? '' : v }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select a date from the day plan</SelectItem>
                        {dayPlanDates.map((d) => (
                          <SelectItem key={d.value} value={String(d.value)}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Dates come from this booking's itinerary day plan.
                    </p>
                  </>
                ) : (
                  <Input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  />
                )}
              </div>
            )}
          </div>
          <Button
            className="w-full"
            disabled={
              ['advance', 'proforma'].includes(form.invoiceType) && Number(form.amount) > finalInvoiceAmount
            }
            onClick={createInvoice}
          >
            Create invoice
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
