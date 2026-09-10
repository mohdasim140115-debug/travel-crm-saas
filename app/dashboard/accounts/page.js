'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CreditCard,
  Receipt,
  DollarSign,
  Sparkles,
  ImageIcon,
  ArrowRight,
  Users,
  CalendarClock,
  AlertTriangle,
  Undo2,
  Loader2,
} from 'lucide-react'
import { PageHeader } from '@/components/crm/PageHeader'
import { toCompressedDataUrl } from '@/lib/imageCompress'

function formatINR(n) {
  return `₹${(n || 0).toLocaleString('en-IN')}`
}

function timeAgo(date) {
  if (!date) return ''
  const diffMs = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const INVOICE_TYPES = [
  { key: 'proforma', label: 'Proforma Invoice', desc: 'Estimate before payment' },
  { key: 'advance', label: 'Advance Invoice', desc: 'When customer pays advance' },
  { key: 'tax_invoice', label: 'Final Tax Invoice', desc: 'Full payment with GST' },
]

export default function AccountsDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [previewImage, setPreviewImage] = useState(null)
  const [refundTarget, setRefundTarget] = useState(null)
  const [refundNote, setRefundNote] = useState('')
  const [refundProof, setRefundProof] = useState('')
  const [savingRefund, setSavingRefund] = useState(false)

  const load = () => {
    const token = localStorage.getItem('token')
    if (!token) {
      window.location.href = '/login'
      return
    }
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    if (!['accounts', 'admin'].includes(u.role)) {
      window.location.href = '/dashboard'
      return
    }
    fetch('/api/analytics/accounts', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => d && setData(d))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const openRefundDialog = (booking) => {
    setRefundTarget(booking)
    setRefundNote('')
    setRefundProof('')
  }

  const pickRefundProof = async (file) => {
    if (!file) return
    const dataUrl = await toCompressedDataUrl(file, 70 * 1024)
    setRefundProof(dataUrl)
  }

  const saveRefund = async () => {
    if (!refundProof) {
      toast.error('Upload a screenshot of the refund payment')
      return
    }
    setSavingRefund(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/bookings/${refundTarget._id}/refund`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ screenshotUrl: refundProof, note: refundNote.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record refund')
      toast.success('Refund marked as paid')
      setRefundTarget(null)
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingRefund(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Accounts Dashboard"
        description="Invoices, payments, GST — finance queue for confirmed bookings."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          {
            label: 'Pending Payments',
            value: data?.pendingPayments,
            icon: CreditCard,
            href: '/dashboard/invoices',
            accent: 'warning',
          },
          {
            label: 'Bookings in Queue',
            value: data?.bookingsInQueue,
            icon: Receipt,
            href: '/dashboard/bookings?opsFilter=queue',
            accent: 'info',
          },
          {
            label: 'Ongoing Clients',
            value: data?.ongoingClients,
            icon: Users,
            href: '/dashboard/invoices?filter=ongoing',
            accent: 'purple',
          },
          {
            label: 'Upcoming Clients',
            value: data?.upcomingClients,
            icon: CalendarClock,
            href: '/dashboard/invoices?filter=upcoming',
            accent: 'lime',
          },
          {
            label: 'Arriving Tomorrow',
            value: data?.arrivingTomorrowCount,
            icon: AlertTriangle,
            href: '/dashboard/invoices?filter=tomorrow',
            alert: (data?.arrivingTomorrowCount || 0) > 0,
            accent: 'warning',
          },
        ].map((s) => {
          const Icon = s.icon
          // Each stat card gets its own accent color (instead of the default
          // purple glow) so they're easier to tell apart at a glance.
          const accentRgb =
            s.accent === 'warning'
              ? '245, 158, 11'
              : s.accent === 'info'
                ? '59, 130, 246'
                : s.accent === 'lime'
                  ? '182, 255, 59'
                  : null
          return (
            <Link key={s.label} href={s.href}>
              <Card
                className="transition-shadow hover:shadow-md"
                style={
                  accentRgb
                    ? {
                        background: `radial-gradient(circle at bottom left, rgba(${accentRgb}, 0.4) 0%, rgba(${accentRgb}, 0.15) 18%, transparent 55%), var(--card)`,
                        borderColor: `rgba(${accentRgb}, 0.4)`,
                      }
                    : undefined
                }
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                  <Icon
                    className="h-4 w-4 text-muted-foreground"
                    style={
                      s.accent === 'lime'
                        ? { color: 'var(--accent-secondary)' }
                        : accentRgb
                          ? { color: `rgb(${accentRgb})` }
                          : undefined
                    }
                  />
                </CardHeader>
                <CardContent>
                  <div
                    className="text-2xl font-bold text-accent-secondary"
                    style={s.accent === 'warning' ? { color: 'rgb(245, 158, 11)' } : undefined}
                  >
                    {s.value ?? 0}
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {(data?.arrivingTomorrow || []).length > 0 && (
        <Card
          style={{
            background:
              'radial-gradient(circle at bottom left, rgba(245, 158, 11, 0.4) 0%, rgba(245, 158, 11, 0.15) 18%, transparent 55%), var(--card)',
            borderColor: 'rgba(245, 158, 11, 0.4)',
          }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Arriving Tomorrow — Action Needed
              <Badge className="bg-amber-600 hover:bg-amber-600">{data.arrivingTomorrow.length}</Badge>
            </CardTitle>
            <CardDescription>These clients' trip starts tomorrow — make sure payments/invoices are settled.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.arrivingTomorrow.map((b) => (
              <Link
                key={b._id}
                href={`/dashboard/bookings/${b._id}`}
                className="flex items-center justify-between rounded-lg border bg-background p-3 transition-colors hover:bg-muted/50"
              >
                <div>
                  <p className="font-medium">
                    {b.leadId?.firstName} {b.leadId?.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.bookingNumber} · Arrival {new Date(b.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · Departure{' '}
                    {new Date(b.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
                <p className="font-semibold text-amber-700">{formatINR(b.totalAmount)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-success/40 bg-success/15 dark:border-success/40 dark:bg-success/15">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-success" />
            New Advance Payments — Action Needed
            {(data?.pendingAdvancePayments || []).length > 0 && (
              <Badge className="bg-success hover:bg-success">{data.pendingAdvancePayments.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Sales just closed these bookings and collected an advance — verify the proof and send the advance
            invoice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.pendingAdvancePayments || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No new advance payments waiting to be invoiced.
            </p>
          ) : (
            data.pendingAdvancePayments.map((p) => (
              <div
                key={p._id}
                className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  {p.screenshotUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(p.screenshotUrl)}
                      className="shrink-0 overflow-hidden rounded-md border"
                      title="View payment screenshot"
                    >
                      <img src={p.screenshotUrl} alt="Advance payment proof" className="h-14 w-14 object-cover" />
                    </button>
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium">
                      {p.leadId?.firstName} {p.leadId?.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Booked by: {p.processedBy?.name || '—'} · {timeAgo(p.createdAt)}
                    </p>
                    {!p.amount && p.zeroReason && (
                      <p className="text-xs text-amber-600">No advance — reason: {p.zeroReason}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:justify-end">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Total package</p>
                    <p className="font-medium">{formatINR(p.bookingId?.totalAmount)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Advance paid</p>
                    <p className="font-semibold text-success">{formatINR(p.amount)}</p>
                  </div>
                  <Button asChild size="sm" className="gap-1">
                    <Link
                      href={`/dashboard/invoices?bookingId=${p.bookingId?._id}&invoiceType=advance&amountReceived=${p.amount || 0}`}
                    >
                      Create Invoice
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Undo2 className="h-4 w-4 text-red-600" />
            Cancelled Bookings — Refund Pending
            {(data?.refundsPending || []).length > 0 && (
              <Badge className="bg-red-600 hover:bg-red-600">{data.refundsPending.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            These trips were cancelled and the client is owed a refund — pay it and upload proof.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.refundsPending || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No refunds pending.</p>
          ) : (
            data.refundsPending.map((b) => (
              <div
                key={b._id}
                className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {b.leadId?.firstName} {b.leadId?.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.bookingNumber} · Cancelled {timeAgo(b.cancelledAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">Reason: {b.cancelReason}</p>
                </div>
                <div className="flex items-center gap-4 sm:justify-end">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Refund amount</p>
                    <p className="font-semibold text-red-700">{formatINR(b.refundAmount)}</p>
                  </div>
                  <Button size="sm" className="gap-1" onClick={() => openRefundDialog(b)}>
                    Mark refund paid
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/dashboard/payments">
          <Card className="transition-colors hover:border-primary/50 hover:bg-muted/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="h-4 w-4" />
                Revenue Collected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{formatINR(data?.finance?.revenueCollected)}</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/invoices">
          <Card className="transition-colors hover:border-primary/50 hover:bg-muted/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pending Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-600">{formatINR(data?.finance?.pendingAmount)}</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Dialog open={!!previewImage} onOpenChange={(o) => !o && setPreviewImage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment screenshot</DialogTitle>
          </DialogHeader>
          {previewImage && (
            <img src={previewImage} alt="Advance payment proof" className="w-full rounded-md border" />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!refundTarget} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Mark refund paid — {refundTarget?.leadId?.firstName} {refundTarget?.leadId?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="text-xs text-muted-foreground">Refund amount</p>
              <p className="text-lg font-semibold text-red-700">{formatINR(refundTarget?.refundAmount)}</p>
            </div>
            <div className="space-y-2">
              <Label>Screenshot of refund payment *</Label>
              <Input type="file" accept="image/*" onChange={(e) => pickRefundProof(e.target.files?.[0])} />
              {refundProof && (
                <img src={refundProof} alt="Refund proof" className="mt-1 h-20 rounded border object-cover" />
              )}
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                value={refundNote}
                onChange={(e) => setRefundNote(e.target.value)}
                placeholder="e.g. Refunded via UPI"
              />
            </div>
          </div>
          <Button className="w-full gap-1.5" disabled={savingRefund} onClick={saveRefund}>
            {savingRefund && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm refund paid
          </Button>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Types</CardTitle>
          <CardDescription>Accounts team can create and send these invoice types.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {INVOICE_TYPES.map((t) => (
            <div key={t.key} className="rounded-lg border p-4">
              <p className="font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Due Reminders</CardTitle>
          <CardDescription>Invoices due within 24 hours (or already overdue) — chase these first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.duePayments || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing due in the next 24 hours.</p>
          ) : (
            data.duePayments.map((inv) => {
              const balance = Number(inv.totalAmount || 0) - Number(inv.amountPaid || 0)
              const overdue = inv.dueDate && new Date(inv.dueDate) < new Date()
              return (
                <Link
                  key={inv._id}
                  href="/dashboard/invoices"
                  className={`flex items-center justify-between rounded-lg border p-3 transition-opacity hover:opacity-80 ${overdue ? 'border-destructive/30 bg-destructive/10' : 'border-warning/30 bg-warning/10'}`}
                >
                  <div>
                    <p className="font-medium">{inv.clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.invoiceNumber} · Due {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}
                      {overdue ? ' (overdue)' : ' (due soon)'}
                    </p>
                  </div>
                  <p className={`font-semibold ${overdue ? 'text-red-600' : 'text-amber-600'}`}>
                    {formatINR(balance)} due
                  </p>
                </Link>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bookings in Queue</CardTitle>
          <CardDescription>Confirmed bookings waiting on invoices — and which sales agent closed them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.recentBookings || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No bookings in queue.</p>
          ) : (
            data.recentBookings.map((b) => (
              <Link
                key={b._id}
                href={`/dashboard/bookings/${b._id}`}
                className="flex items-center justify-between rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
              >
                <div>
                  <p className="font-medium">
                    {b.leadId?.firstName} {b.leadId?.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.bookingNumber} · Booked by: {b.assignedTo?.name || '—'}
                  </p>
                </div>
                <p className="font-semibold">{formatINR(b.totalAmount)}</p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Invoices</CardTitle>
          <Button asChild>
            <Link href="/dashboard/invoices">Create Invoice</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.recentInvoices || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            data.recentInvoices.map((inv) => (
              <Link
                key={inv._id}
                href="/dashboard/invoices"
                className="flex items-center justify-between rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
              >
                <div>
                  <p className="font-medium">{inv.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.clientName} · {inv.invoiceType?.replace('_', ' ')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatINR(inv.totalAmount)}</p>
                  <Badge variant="outline">{inv.paymentStatus}</Badge>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
