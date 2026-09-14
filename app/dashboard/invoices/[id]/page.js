'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus, User, Wallet, IndianRupee, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { leadDisplayName, formatInr, displayEmail } from '@/utils/crm'
import { toCompressedDataUrl } from '@/lib/imageCompress'

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function authH() {
  const token = localStorage.getItem('token')
  return { Authorization: `Bearer ${token}` }
}

const INVOICE_TYPE_LABELS = {
  proforma: 'Partial',
  advance: 'Advance',
  tax_invoice: 'Final Invoice',
  credit_note: 'Credit Note',
}

function invoiceTypeLabel(type) {
  return INVOICE_TYPE_LABELS[type] || INVOICE_TYPE_LABELS.proforma
}

async function downloadInvoicePdf(invoiceId) {
  try {
    const res = await fetch(`/api/invoices/${invoiceId}/pdf`, { headers: authH() })
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

function SettlementBadge({ amount, paid }) {
  const remaining = Math.max(0, (amount || 0) - (paid || 0))
  return remaining <= 0 ? (
    <Badge className="bg-success">Cleared</Badge>
  ) : (
    <Badge className="bg-destructive">Balance {formatInr(remaining)}</Badge>
  )
}

/** Read-only client ledger for Accounts — reached by clicking a row on the
 * Invoices list. Deliberately a separate page from the Operations booking
 * detail page (which has all the edit/confirm forms) — Accounts just needs
 * to see client + trip details and the full money picture in one place. */
export default function InvoiceClientLedgerPage() {
  const { id } = useParams()
  const router = useRouter()
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [previewImage, setPreviewImage] = useState(null)
  const [addingExpense, setAddingExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({ amount: '', remark: '' })
  const [savingExpense, setSavingExpense] = useState(false)
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceType: 'proforma',
    amount: '',
    amountReceived: '',
    dueDate: '',
    gstRate: 0,
  })
  const [paymentScreenshot, setPaymentScreenshot] = useState('')
  const [compressingScreenshot, setCompressingScreenshot] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [editForm, setEditForm] = useState({ amount: '', dueDate: '', invoiceType: 'proforma', remark: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [markPaidInvoice, setMarkPaidInvoice] = useState(null)
  const [markPaidScreenshot, setMarkPaidScreenshot] = useState('')
  const [compressingMarkPaidScreenshot, setCompressingMarkPaidScreenshot] = useState(false)
  const [savingMarkPaid, setSavingMarkPaid] = useState(false)
  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    if (!['admin', 'accounts'].includes(u.role)) {
      window.location.href = '/dashboard'
      return
    }
    if (!id) return
    fetch(`/api/bookings/${id}`, { headers: authH() })
      .then((r) => r.json())
      .then((d) => setBooking(d.booking))
      .catch(() => toast.error('Failed to load client ledger'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const saveOtherExpense = async () => {
    const amount = Number(expenseForm.amount)
    if (!(amount > 0)) {
      toast.error('Enter a valid expense amount')
      return
    }
    if (!expenseForm.remark.trim()) {
      toast.error('Add a remark explaining this expense')
      return
    }
    setSavingExpense(true)
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({ otherExpense: { amount, remark: expenseForm.remark.trim() } }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save expense')
      setBooking((b) => ({ ...b, otherExpenses: data.otherExpenses }))
      setExpenseForm({ amount: '', remark: '' })
      setAddingExpense(false)
      toast.success('Expense added')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingExpense(false)
    }
  }

  const openCreateInvoice = () => {
    setInvoiceForm({
      invoiceType: 'proforma',
      amount: '',
      dueDate: booking?.planStartDate
        ? new Date(booking.planStartDate).toISOString().slice(0, 10)
        : booking?.startDate
          ? new Date(booking.startDate).toISOString().slice(0, 10)
          : '',
      gstRate: 0,
    })
    setPaymentScreenshot('')
    setInvoiceDialogOpen(true)
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
    // Partial and Advance invoices both bill exactly what was received (a
    // client can pay in bits mid-trip, not just one upfront advance) — so
    // their total is the amount typed in, and they're fully paid. A Final
    // Invoice bills whatever's left of the package and isn't hand-typed.
    const isAdvanceLike = ['advance', 'proforma'].includes(invoiceForm.invoiceType)
    const isFinal = invoiceForm.invoiceType === 'tax_invoice'
    const subtotal = isFinal ? finalInvoiceAmount : Number(invoiceForm.amount)
    if (!subtotal || (!isFinal && !invoiceForm.dueDate)) {
      toast.error('Fill all required fields')
      return
    }
    if (isAdvanceLike && subtotal > finalInvoiceAmount) {
      toast.error(`Amount cannot exceed the due balance of ${formatInr(finalInvoiceAmount)}`)
      return
    }
    // The final-invoice amount is "package total minus what's been PAID so
    // far" — it deliberately doesn't drop to 0 just because a Final Invoice
    // was already raised, since the client hasn't actually paid it yet. That
    // reads as "the amount never goes away", but the real risk it was
    // hiding is creating a second Final Invoice for the same balance before
    // the first one is paid — block that here instead.
    if (isFinal && (booking.invoices || []).some((inv) => inv.invoiceType === 'tax_invoice')) {
      toast.error('A Final Invoice already exists for this booking — mark it paid before raising another.')
      return
    }
    setCreatingInvoice(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({
          bookingId: booking._id,
          leadId: lead?._id || booking.leadId,
          clientName: leadDisplayName(lead),
          // A Meta/Google lead that only ever gave a phone number carries a
          // synthetic placeholder email (see lib/leadIngest.js) just to
          // satisfy the Lead schema — never prefill an invoice with it, or
          // Accounts would try to send/receive at an address that doesn't exist.
          clientEmail: displayEmail(lead?.email),
          clientPhone: lead?.phone || '',
          subtotal,
          taxRate: Number(invoiceForm.gstRate) || 0,
          dueDate: isFinal ? new Date().toISOString().slice(0, 10) : invoiceForm.dueDate,
          invoiceType: invoiceForm.invoiceType,
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
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create invoice')
      setBooking((b) => ({ ...b, invoices: [data.invoice, ...(b.invoices || [])] }))
      toast.success('Invoice created')
      setInvoiceDialogOpen(false)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCreatingInvoice(false)
    }
  }

  const openEditInvoice = (inv) => {
    setEditingInvoice(inv)
    setEditForm({
      amount: String(inv.totalAmount || ''),
      dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : '',
      invoiceType: inv.invoiceType || 'proforma',
      remark: '',
    })
  }

  const saveEditInvoice = async () => {
    const amount = Number(editForm.amount)
    if (!(amount > 0) || !editForm.dueDate) {
      toast.error('Enter a valid amount and due date')
      return
    }
    if (!editForm.remark.trim()) {
      toast.error('Add a remark explaining this edit')
      return
    }
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/invoices/${editingInvoice._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({
          edit: {
            amount,
            dueDate: editForm.dueDate,
            invoiceType: editForm.invoiceType,
            remark: editForm.remark.trim(),
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update invoice')
      setBooking((b) => ({
        ...b,
        invoices: b.invoices.map((i) => (i._id === data.invoice._id ? data.invoice : i)),
      }))
      toast.success('Invoice updated')
      setEditingInvoice(null)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const openMarkPaid = (inv) => {
    setMarkPaidInvoice(inv)
    setMarkPaidScreenshot(inv.paymentScreenshot || '')
  }

  const handleMarkPaidScreenshotPick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCompressingMarkPaidScreenshot(true)
    try {
      const dataUrl = await toCompressedDataUrl(file, 300 * 1024)
      setMarkPaidScreenshot(dataUrl)
    } catch {
      toast.error('Failed to process screenshot')
    } finally {
      setCompressingMarkPaidScreenshot(false)
    }
  }

  const saveMarkPaid = async () => {
    setSavingMarkPaid(true)
    try {
      const res = await fetch(`/api/invoices/${markPaidInvoice._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({ markPaid: { paymentScreenshot: markPaidScreenshot } }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update invoice')
      setBooking((b) => ({
        ...b,
        invoices: b.invoices.map((i) => (i._id === data.invoice._id ? data.invoice : i)),
      }))
      toast.success('Invoice marked as paid')
      setMarkPaidInvoice(null)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingMarkPaid(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  if (!booking) {
    return <p className="py-16 text-center text-muted-foreground">Booking not found.</p>
  }

  const lead = booking.leadId
  const itinerary = booking.itineraryId

  // What the client has actually paid so far — every invoice's amountPaid.
  // The Sales-side advance is never added separately here: it only ever
  // shows up once it's been billed through some invoice (Partial/Advance),
  // so adding booking.advancePayment.amount on top would double-count the
  // exact same money. A Final Invoice bills whatever's left, so its amount
  // is derived, not typed in.
  const totalReceived = (booking.invoices || []).reduce((sum, inv) => sum + (inv.amountPaid || 0), 0)
  const finalInvoiceAmount = Math.max(0, (booking.totalAmount || 0) - totalReceived)
  const balanceFromClient = finalInvoiceAmount

  // Real cost/profit — only counts what's actually been confirmed with a
  // vendor (Charged), never a Quoted estimate that hasn't been agreed yet.
  const hotelExpense = (booking.hotelConfirmations || []).reduce(
    (sum, h) => sum + (h.negotiatedPrice ? Number(h.negotiatedPrice) : 0),
    0
  )
  const vehicleExpense = (booking.vehicleConfirmations || []).reduce(
    (sum, v) => sum + (v.confirmed && v.price ? Number(v.price) : 0),
    0
  )
  const activityExpense = (booking.activityConfirmations || []).reduce(
    (sum, a) => sum + (a.confirmed && a.price != null ? Number(a.price) * (Number(a.quantity) || 1) : 0),
    0
  )
  const otherExpense = (booking.otherExpenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const totalExpense = hotelExpense + vehicleExpense + activityExpense + otherExpense
  const profit = (booking.totalAmount || 0) - totalExpense
  const margin = booking.totalAmount ? (profit / booking.totalAmount) * 100 : 0

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => router.push('/dashboard/invoices')}>
        <ArrowLeft className="h-4 w-4" /> Back to invoices
      </Button>

      <div>
        <h1 className="text-2xl font-bold">{leadDisplayName(lead)}</h1>
        <p className="text-sm text-muted-foreground">
          Destination: {itinerary?.destination || '—'}
        </p>
      </div>

      {/* Client Details */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" /> Client Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <p className="text-sm font-medium">{leadDisplayName(lead)}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Number</Label>
              <p className="text-sm font-medium">{lead?.phone || '—'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Adults / Child</Label>
              <p className="text-sm font-medium">
                {itinerary?.numberOfAdults ?? '—'} adults · {itinerary?.numberOfChildren ?? 0} child
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Destination</Label>
              <p className="text-sm font-medium">{itinerary?.destination || '—'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Arrival date</Label>
              <p className="text-sm font-medium">{formatDate(booking.planStartDate)}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Departure date</Label>
              <p className="text-sm font-medium">{formatDate(booking.planEndDate)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payments & Ledger */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> Payments & Ledger
          </CardTitle>
          <CardDescription>What the client owes, what's been invoiced, and what's owed to vendors.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total package</p>
              <p className="text-lg font-semibold">{formatInr(booking.totalAmount, booking.currency)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total received</p>
              <p className="text-lg font-semibold text-success">{formatInr(totalReceived)}</p>
              {booking.advancePayment?.screenshotUrl ? (
                <button
                  type="button"
                  className="mt-1 text-xs text-primary hover:underline"
                  onClick={() => setPreviewImage(booking.advancePayment.screenshotUrl)}
                >
                  View advance screenshot
                </button>
              ) : booking.advancePayment?.zeroReason ? (
                <p className="mt-1 text-xs text-amber-600">Advance reason: {booking.advancePayment.zeroReason}</p>
              ) : null}
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Balance from client</p>
              <p className="text-lg font-semibold text-amber-600">{formatInr(balanceFromClient)}</p>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Invoices</p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={openCreateInvoice}>
                <Plus className="h-3.5 w-3.5" /> New invoice
              </Button>
            </div>
            {(booking.invoices || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoice raised yet.</p>
            ) : (
              <div className="space-y-2">
                {booking.invoices.map((inv) => (
                  <div key={inv._id} className="rounded-lg bg-muted/50 p-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {inv.invoiceNumber}{' '}
                        <span className="text-xs text-muted-foreground">({invoiceTypeLabel(inv.invoiceType)})</span>
                        {inv.editHistory?.length > 0 && (
                          <Badge variant="outline" className="ml-1.5 text-xs">
                            Edited {inv.editHistory.length > 1 ? `${inv.editHistory.length}×` : ''}
                          </Badge>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{formatInr(inv.totalAmount)}</span>
                        <Badge variant="outline" className="capitalize">
                          {inv.paymentStatus}
                        </Badge>
                        {inv.paymentScreenshot && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPreviewImage(inv.paymentScreenshot)}
                          >
                            Proof
                          </Button>
                        )}
                        {inv.paymentStatus !== 'paid' && (
                          <Button size="sm" variant="outline" onClick={() => openMarkPaid(inv)}>
                            Mark Paid
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(inv._id)}>
                          Download
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEditInvoice(inv)}>
                          Edit
                        </Button>
                      </span>
                    </div>
                    {inv.editHistory?.length > 0 && (
                      <div className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                        {inv.editHistory.map((h, i) => (
                          <p key={i}>
                            {formatDate(h.editedAt)} — was {formatInr(h.previousTotalAmount)}, due{' '}
                            {formatDate(h.previousDueDate)} ({invoiceTypeLabel(h.previousInvoiceType)}) ·{' '}
                            {h.remark}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Vendor payments (Hotels, Transport & Activities)</p>
            <div className="space-y-2">
              {(booking.hotelConfirmations || [])
                .filter((h) => h.negotiatedPrice)
                .map((h) => (
                  <div key={h.key} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                    <div>
                      <p className="font-medium">{h.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Charged: {formatInr(h.negotiatedPrice)}
                        {h.advanceRequired && (
                          <>
                            {' · Advance '}
                            {h.advancePaid ? (
                              <span className="text-success">paid (₹{h.advanceAmount})</span>
                            ) : h.advanceSentAt ? (
                              <span className="text-destructive">pending (₹{h.advanceAmount})</span>
                            ) : (
                              'not sent'
                            )}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {h.advancePaid && h.advancePaidScreenshot && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => setPreviewImage(h.advancePaidScreenshot)}
                        >
                          View payment proof
                        </button>
                      )}
                      {h.supplierId && <SettlementBadge amount={h.negotiatedPrice} paid={h.chargePaidAmount} />}
                      {h.supplierId && (
                        <Link href={`/dashboard/suppliers/${h.supplierId}`} className="text-xs text-primary hover:underline">
                          View ledger
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              {(booking.vehicleConfirmations || []).map((v) => (
                <div key={v.key} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                  <div>
                    <p className="font-medium">{v.name || 'Vehicle'}</p>
                    <p className="text-xs text-muted-foreground">
                      Driver: {v.driverName || '—'}
                      {v.driverPhone ? ` (${v.driverPhone})` : ''}
                      {v.vehicleNumber ? ` · ${v.vehicleNumber}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.supplierId ? (
                        <>Charged: {formatInr(v.price)}</>
                      ) : v.confirmed && v.price ? (
                        <span className="text-amber-600">Confirmed but not charged to ledger yet — re-save transport to charge it</span>
                      ) : v.price ? (
                        <>Quoted: {formatInr(v.price)} (not yet confirmed)</>
                      ) : (
                        <span className="text-amber-600">Price not entered yet</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {v.supplierId && <SettlementBadge amount={v.price} paid={v.chargePaidAmount} />}
                    {v.supplierId && (
                      <Link href={`/dashboard/drivers/${v.supplierId}`} className="text-xs text-primary hover:underline">
                        View ledger
                      </Link>
                    )}
                  </div>
                </div>
              ))}
              {(booking.activityConfirmations || []).map((a) => (
                <div key={a.key} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                  <div>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.price != null ? (
                        <>
                          {a.confirmed ? 'Charged' : 'Quoted'}: {formatInr((a.price || 0) * (a.quantity || 1))} (
                          {a.quantity || 1} × {formatInr(a.price)}){!a.confirmed && ' (not yet confirmed)'}
                        </>
                      ) : (
                        <span className="text-amber-600">Price not entered yet</span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
              {!(booking.hotelConfirmations || []).some((h) => h.negotiatedPrice) &&
                !(booking.vehicleConfirmations || []).length &&
                !(booking.activityConfirmations || []).length && (
                  <p className="text-sm text-muted-foreground">No vendor charges confirmed yet.</p>
                )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Booking Profitability */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IndianRupee className="h-4 w-4" /> Booking Profitability
          </CardTitle>
          <CardDescription>
            Real numbers — only vendor charges Operations has actually confirmed count as expense, not quoted
            estimates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total package (revenue)</p>
              <p className="text-lg font-semibold">{formatInr(booking.totalAmount, booking.currency)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total booking expenses</p>
              <p className="text-lg font-semibold text-destructive">{formatInr(totalExpense)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Profit ({margin.toFixed(1)}% margin)</p>
              <p className={`text-lg font-semibold ${profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatInr(profit)}
              </p>
            </div>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-muted-foreground">Hotels</span>
              <span className="font-medium">{formatInr(hotelExpense)}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-muted-foreground">Transport</span>
              <span className="font-medium">{formatInr(vehicleExpense)}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-muted-foreground">Activities</span>
              <span className="font-medium">{formatInr(activityExpense)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Other expenses</span>
              <span className="font-medium">{formatInr(otherExpense)}</span>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Other expenses</Label>
                <p className="text-xs text-muted-foreground">
                  On-ground costs outside hotel/transport/activity — e.g. a breakdown or permit fee.
                </p>
              </div>
              <Switch checked={addingExpense} onCheckedChange={setAddingExpense} />
            </div>
            {addingExpense && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Expense cost (₹)</Label>
                  <Input
                    type="number"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 sm:col-span-1">
                  <Label className="text-xs">Remark</Label>
                  <Input
                    value={expenseForm.remark}
                    onChange={(e) => setExpenseForm((f) => ({ ...f, remark: e.target.value }))}
                    placeholder="e.g. Vehicle breakdown repair"
                  />
                </div>
                <div className="flex items-end">
                  <Button className="w-full gap-1.5" disabled={savingExpense} onClick={saveOtherExpense}>
                    {savingExpense && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Save
                  </Button>
                </div>
              </div>
            )}
            {(booking.otherExpenses || []).length > 0 && (
              <div className="mt-3 space-y-1.5 border-t pt-3 text-sm">
                {booking.otherExpenses.map((e, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {e.remark} · {formatDate(e.addedAt)}
                    </span>
                    <span className="font-medium">{formatInr(e.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>New invoice — {leadDisplayName(lead)}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Invoice type *</Label>
              <Select
                value={invoiceForm.invoiceType}
                onValueChange={(v) => setInvoiceForm((f) => ({ ...f, invoiceType: v }))}
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
            {['advance', 'proforma'].includes(invoiceForm.invoiceType) ? (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <Label>Amount received (₹) *</Label>
                <Input
                  type="number"
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))}
                  className={
                    Number(invoiceForm.amount) > finalInvoiceAmount ? 'border-destructive focus-visible:ring-destructive' : ''
                  }
                />
                {Number(invoiceForm.amount) > finalInvoiceAmount && (
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
                    id="invoice-payment-screenshot"
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
                    onClick={() => document.getElementById('invoice-payment-screenshot')?.click()}
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
                {(booking.invoices || []).some((inv) => inv.invoiceType === 'tax_invoice') && (
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
                    id="invoice-final-payment-screenshot"
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
                    onClick={() => document.getElementById('invoice-final-payment-screenshot')?.click()}
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
                    variant={Number(invoiceForm.gstRate) === rate ? 'default' : 'outline'}
                    onClick={() => setInvoiceForm((f) => ({ ...f, gstRate: rate }))}
                  >
                    {rate === 0 ? 'No GST' : `${rate}%`}
                  </Button>
                ))}
              </div>
            </div>
            {invoiceForm.invoiceType !== 'tax_invoice' && (
              <div className="space-y-2">
                <Label>Due date *</Label>
                <Input
                  type="date"
                  value={invoiceForm.dueDate}
                  onChange={(e) => setInvoiceForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            )}
          </div>
          <Button
            className="w-full gap-1.5"
            disabled={
              creatingInvoice ||
              (['advance', 'proforma'].includes(invoiceForm.invoiceType) &&
                Number(invoiceForm.amount) > finalInvoiceAmount)
            }
            onClick={createInvoice}
          >
            {creatingInvoice && <Loader2 className="h-4 w-4 animate-spin" />}
            Create invoice
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingInvoice} onOpenChange={(o) => !o && setEditingInvoice(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>Edit invoice — {editingInvoice?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Invoice type</Label>
              <Select
                value={editForm.invoiceType}
                onValueChange={(v) => setEditForm((f) => ({ ...f, invoiceType: v }))}
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
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                value={editForm.amount}
                onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Due date *</Label>
              <Input
                type="date"
                value={editForm.dueDate}
                onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <Label>Remark — why is this being edited? *</Label>
              <Input
                value={editForm.remark}
                onChange={(e) => setEditForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder="e.g. Client name spelling was corrected, amount was entered wrong"
              />
              <p className="text-xs text-muted-foreground">
                The previous amount/due date is kept as a visible log entry on this invoice for transparency.
              </p>
            </div>
          </div>
          <Button className="w-full gap-1.5" disabled={savingEdit} onClick={saveEditInvoice}>
            {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!markPaidInvoice} onOpenChange={(o) => !o && setMarkPaidInvoice(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark {markPaidInvoice?.invoiceNumber} as paid</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This records {formatInr(markPaidInvoice?.totalAmount)} as received in full. Attach the payment
              screenshot if you have it — optional but recommended.
            </p>
            <div>
              <input
                id="mark-paid-screenshot"
                type="file"
                accept="image/*"
                className="hidden"
                disabled={compressingMarkPaidScreenshot}
                onChange={handleMarkPaidScreenshotPick}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={compressingMarkPaidScreenshot}
                className="gap-1.5"
                onClick={() => document.getElementById('mark-paid-screenshot')?.click()}
              >
                {compressingMarkPaidScreenshot ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {markPaidScreenshot ? 'Screenshot selected' : 'Upload screenshot (optional)'}
              </Button>
              {markPaidScreenshot && (
                <img
                  src={markPaidScreenshot}
                  alt="Payment proof"
                  className="mt-2 h-20 w-20 rounded border object-cover"
                />
              )}
            </div>
          </div>
          <Button className="w-full gap-1.5" disabled={savingMarkPaid} onClick={saveMarkPaid}>
            {savingMarkPaid && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm — mark as paid
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImage} onOpenChange={(o) => !o && setPreviewImage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment screenshot</DialogTitle>
          </DialogHeader>
          {previewImage && <img src={previewImage} alt="Advance payment proof" className="w-full rounded-md border" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
