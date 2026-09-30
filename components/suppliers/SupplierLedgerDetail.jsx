'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Wallet, Plus, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/crm/PageHeader'
import { toCompressedDataUrl } from '@/lib/imageCompress'

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(d) {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** The generic Supplier ledger view — same page whether it's reached from
 * /dashboard/suppliers/[id] (hotels, guides, etc.) or /dashboard/drivers/[id]
 * (transport vendors); a Supplier record is a Supplier record either way, so
 * this is the single implementation both routes render. */
export default function SupplierLedgerDetail() {
  const { id } = useParams()
  const router = useRouter()
  const [supplier, setSupplier] = useState(null)
  const [entries, setEntries] = useState([])
  const [balanceDue, setBalanceDue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [manualForm, setManualForm] = useState({ amount: '', note: '', screenshot: '' })
  const [compressingManualScreenshot, setCompressingManualScreenshot] = useState(false)
  const [savingManual, setSavingManual] = useState(false)
  const [payEntry, setPayEntry] = useState(null)
  const [payForm, setPayForm] = useState({ amount: '', screenshot: '' })
  const [compressingPayScreenshot, setCompressingPayScreenshot] = useState(false)
  const [savingPay, setSavingPay] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const [adjustEntry, setAdjustEntry] = useState(null)
  const [adjustForm, setAdjustForm] = useState({ direction: 'add', amount: '', remark: '' })
  const [savingAdjust, setSavingAdjust] = useState(false)

  const load = () => {
    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch(`/api/suppliers/${id}`, { headers }).then((r) => r.json()),
      fetch(`/api/suppliers/${id}/ledger`, { headers }).then((r) => r.json()),
    ])
      .then(([supplierRes, ledgerRes]) => {
        setSupplier(supplierRes.supplier || null)
        setEntries(ledgerRes.entries || [])
        setBalanceDue(ledgerRes.balanceDue ?? 0)
      })
      .catch(() => toast.error('Failed to load supplier'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleManualScreenshotPick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCompressingManualScreenshot(true)
    try {
      const dataUrl = await toCompressedDataUrl(file, 30 * 1024)
      setManualForm((f) => ({ ...f, screenshot: dataUrl }))
    } catch {
      toast.error('Failed to process screenshot')
    } finally {
      setCompressingManualScreenshot(false)
    }
  }

  const saveManualPayment = async () => {
    const amount = Number(manualForm.amount)
    if (!(amount > 0)) {
      toast.error('Enter a valid amount')
      return
    }
    setSavingManual(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/suppliers/${id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount,
          note: manualForm.note,
          screenshotUrl: manualForm.screenshot || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record payment')
      toast.success('Payment recorded — applied to the oldest balances first')
      setPickerOpen(false)
      setManualMode(false)
      setManualForm({ amount: '', note: '', screenshot: '' })
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingManual(false)
    }
  }

  const handlePayScreenshotPick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCompressingPayScreenshot(true)
    try {
      const dataUrl = await toCompressedDataUrl(file, 30 * 1024)
      setPayForm((f) => ({ ...f, screenshot: dataUrl }))
    } catch {
      toast.error('Failed to process screenshot')
    } finally {
      setCompressingPayScreenshot(false)
    }
  }

  const saveChargePayment = async () => {
    const amount = Number(payForm.amount)
    if (!(amount > 0)) {
      toast.error('Enter a valid amount')
      return
    }
    if (!payForm.screenshot) {
      toast.error('Upload a screenshot of the payment made')
      return
    }
    setSavingPay(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/suppliers/${id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, chargeEntryId: payEntry._id, screenshotUrl: payForm.screenshot }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save payment')
      toast.success('Payment saved')
      setPayEntry(null)
      setPayForm({ amount: '', screenshot: '' })
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingPay(false)
    }
  }

  const saveAdjustment = async () => {
    const amount = Number(adjustForm.amount)
    if (!(amount > 0)) {
      toast.error('Enter a valid amount')
      return
    }
    if (!adjustForm.remark.trim()) {
      toast.error('Add a remark explaining this adjustment')
      return
    }
    setSavingAdjust(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/suppliers/${id}/charges/${adjustEntry._id}/adjust`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, direction: adjustForm.direction, remark: adjustForm.remark.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save adjustment')
      toast.success('Charge adjusted')
      setAdjustEntry(null)
      setAdjustForm({ direction: 'add', amount: '', remark: '' })
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingAdjust(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  if (!supplier) {
    return <p className="py-16 text-center text-muted-foreground">Supplier not found.</p>
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <PageHeader
        title={supplier.name}
        description={`${supplier.type} · ${supplier.email}${supplier.phone ? ' · ' + supplier.phone : ''}`}
        actions={
          <Button onClick={() => setPickerOpen(true)} className="w-full gap-2 shadow-sm sm:w-auto">
            <Plus className="h-4 w-4" /> Record payment
          </Button>
        }
      />

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <Wallet className="h-8 w-8 text-muted-foreground" />
          <div>
            <CardDescription>Balance due</CardDescription>
            <CardTitle className={`text-3xl ${balanceDue > 0 ? 'text-destructive' : ''}`}>
              {balanceDue}
            </CardTitle>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
          <CardDescription>Client-wise stays and payments for this supplier</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {entries.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No charges or payments yet.</p>
          ) : (
            (() => {
              const charges = entries.filter((e) => e.type === 'charge')
              const payments = entries.filter((e) => e.type === 'payment')
              // bookingId comes back *populated* ({_id, bookingNumber}), not a
              // bare id — String() on that object always gives "[object
              // Object]" on both sides, so this check silently matched every
              // payment to every charge regardless of booking. Two different
              // clients' bookings can end up with the identical hotelKey/
              // vehicleKey (same master hotel/vehicle, same room-line index),
              // so without this fix a payment could get attributed to the
              // wrong client entirely — one looked paid up while the other
              // looked like they still owed the money.
              const bookingIdOf = (v) => String(v?._id || v || '')
              const linkedIds = new Set()
              const groups = charges.map((charge) => {
                const linked = payments.filter((p) => {
                  if (linkedIds.has(String(p._id))) return false
                  if (bookingIdOf(p.bookingId) !== bookingIdOf(charge.bookingId)) return false
                  if (charge.hotelKey) return p.hotelKey === charge.hotelKey
                  if (charge.vehicleKey) return p.vehicleKey === charge.vehicleKey
                  return false
                })
                linked.forEach((p) => linkedIds.add(String(p._id)))
                return { charge, payments: linked }
              })
              const otherPayments = payments.filter((p) => !linkedIds.has(String(p._id)))

              return (
                <>
                  {groups.map(({ charge: e, payments: linkedPayments }) => {
                    const clientName = e.leadId
                      ? [e.leadId.firstName, e.leadId.lastName].filter(Boolean).join(' ') || '—'
                      : '—'
                    const remaining = Math.max(0, (e.amount || 0) - (e.paidAmount || 0))
                    const stayBits = [
                      e.checkIn || e.checkOut ? `${formatDate(e.checkIn)} → ${formatDate(e.checkOut)}` : null,
                      e.nights ? `${e.nights} night(s)` : null,
                      e.roomCount ? `${e.roomCount} room(s)${e.roomType ? ` (${e.roomType})` : ''}` : null,
                      e.extraBeds ? `${e.extraBeds} extra bed` : null,
                      e.cnbCount ? `${e.cnbCount} CNB` : null,
                      e.mealPlan || null,
                      e.pax ? `${e.pax} PAX` : null,
                      e.arrivalDate || e.departureDate
                        ? `${formatDate(e.arrivalDate)} → ${formatDate(e.departureDate)}`
                        : null,
                      e.pickupLocation ? `Pickup: ${e.pickupLocation}` : null,
                      e.dropLocation ? `Drop: ${e.dropLocation}` : null,
                      e.driverName ? `Driver: ${e.driverName}${e.driverPhone ? ` (${e.driverPhone})` : ''}` : null,
                    ].filter(Boolean)
                    return (
                      <div key={e._id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{clientName}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(e.date)}</p>
                            {stayBits.length > 0 && (
                              <p className="mt-1 text-xs text-muted-foreground">{stayBits.join(' · ')}</p>
                            )}
                            {e.advanceRequired && (
                              <p className="mt-0.5 text-xs font-medium text-amber-600">
                                Advance required: ₹{e.advanceAmount}
                              </p>
                            )}
                            {e.extraCharge > 0 && (
                              <p className="mt-0.5 text-xs font-medium text-destructive">
                                Extra charge: ₹{e.extraCharge}
                                {e.extraChargeRemark ? ` — ${e.extraChargeRemark}` : ''}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-destructive">+{e.amount}</p>
                            {remaining <= 0 ? (
                              <Badge className="mt-1 bg-success">Cleared</Badge>
                            ) : (
                              <Badge className="mt-1 bg-destructive">Due ₹{remaining}</Badge>
                            )}
                          </div>
                        </div>

                        {linkedPayments.length > 0 && (
                          <div className="mt-3 space-y-1.5 border-t pt-2">
                            {linkedPayments.map((p) => (
                              <div key={p._id} className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">{formatDateTime(p.date)} · Payment made</span>
                                <span className="flex items-center gap-2">
                                  <span className="font-medium text-success">-{p.amount}</span>
                                  {p.screenshotUrl && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => setPreviewImage(p.screenshotUrl)}
                                    >
                                      View proof
                                    </Button>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {(e.adjustments || []).length > 0 && (
                          <div className="mt-3 space-y-1.5 border-t pt-2">
                            {e.adjustments.map((a, i) => (
                              <div key={i} className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                  {formatDateTime(a.date)} · {a.remark}
                                </span>
                                <span
                                  className={`font-medium ${a.direction === 'add' ? 'text-destructive' : 'text-success'}`}
                                >
                                  {a.direction === 'add' ? '+' : '-'}
                                  {a.amount}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setPayEntry(e)
                              setPayForm({ amount: '', screenshot: '' })
                            }}
                          >
                            Add payment
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAdjustEntry(e)
                              setAdjustForm({ direction: 'add', amount: '', remark: '' })
                            }}
                          >
                            Adjust amount
                          </Button>
                        </div>
                      </div>
                    )
                  })}

                  {otherPayments.length > 0 && (
                    <div className="rounded-lg border p-3">
                      <p className="mb-2 text-sm font-medium">Other payments</p>
                      <div className="space-y-1.5">
                        {otherPayments.map((p) => (
                          <div key={p._id} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {formatDateTime(p.date)} · {p.note || 'Payment'}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="font-medium text-success">-{p.amount}</span>
                              {p.screenshotUrl && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => setPreviewImage(p.screenshotUrl)}
                                >
                                  View proof
                                </Button>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            })()
          )}
        </CardContent>
      </Card>

      <Dialog
        open={pickerOpen}
        onOpenChange={(o) => {
          setPickerOpen(o)
          if (!o) {
            setManualMode(false)
            setManualForm({ amount: '', note: '', screenshot: '' })
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment to {supplier.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Manual / lump sum payment</Label>
                <p className="text-xs text-muted-foreground">
                  Paid one combined amount across multiple clients at once — not tied to a single client.
                </p>
              </div>
              <Switch checked={manualMode} onCheckedChange={setManualMode} />
            </div>

            {manualMode ? (
              <>
                <div className="space-y-2">
                  <Label>Amount paid (₹)</Label>
                  <Input
                    type="number"
                    value={manualForm.amount}
                    onChange={(e) => setManualForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="e.g. 50000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Applied to the oldest outstanding balances first, across all clients.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Textarea
                    value={manualForm.note}
                    onChange={(e) => setManualForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="e.g. Paid via bank transfer for July bookings"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment screenshot (optional)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={compressingManualScreenshot}
                    onChange={handleManualScreenshotPick}
                  />
                  {compressingManualScreenshot && <p className="text-xs text-muted-foreground">Compressing…</p>}
                  {manualForm.screenshot && !compressingManualScreenshot && (
                    <div className="flex items-center gap-2 pt-1">
                      <img
                        src={manualForm.screenshot}
                        alt="Payment proof"
                        className="h-14 w-14 rounded-md border object-cover"
                      />
                      <span className="text-xs text-muted-foreground">Ready to save</span>
                    </div>
                  )}
                </div>
                <Button className="w-full gap-1.5" disabled={savingManual} onClick={saveManualPayment}>
                  {savingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Save payment
                </Button>
              </>
            ) : (
              <div className="space-y-2">
                <Label>Client</Label>
                <Select
                  onValueChange={(v) => {
                    const charge = entries.find((e) => e._id === v)
                    setPickerOpen(false)
                    setPayEntry(charge)
                    setPayForm({ amount: '', screenshot: '' })
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a client with a balance due" />
                  </SelectTrigger>
                  <SelectContent>
                    {entries
                      .filter((e) => e.type === 'charge' && (e.amount || 0) - (e.paidAmount || 0) > 0)
                      .map((e) => {
                        const clientName = e.leadId
                          ? [e.leadId.firstName, e.leadId.lastName].filter(Boolean).join(' ') || 'Client'
                          : 'Client'
                        const remaining = (e.amount || 0) - (e.paidAmount || 0)
                        return (
                          <SelectItem key={e._id} value={e._id}>
                            {clientName} — Due ₹{remaining}
                          </SelectItem>
                        )
                      })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Only clients with a balance still due show here — pick one to enter their payment.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payEntry} onOpenChange={(o) => !o && setPayEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add payment{payEntry?.leadId ? ` — ${[payEntry.leadId.firstName, payEntry.leadId.lastName].filter(Boolean).join(' ')}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {payEntry && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                {(payEntry.checkIn || payEntry.checkOut) && (
                  <p className="text-muted-foreground">
                    {formatDate(payEntry.checkIn)} → {formatDate(payEntry.checkOut)}
                    {payEntry.roomCount ? ` · ${payEntry.roomCount} room(s)${payEntry.roomType ? ` (${payEntry.roomType})` : ''}` : ''}
                  </p>
                )}
                {(payEntry.arrivalDate || payEntry.departureDate) && (
                  <p className="text-muted-foreground">
                    {formatDate(payEntry.arrivalDate)} → {formatDate(payEntry.departureDate)}
                    {payEntry.pax ? ` · ${payEntry.pax} PAX` : ''}
                  </p>
                )}
                {payEntry.driverName && (
                  <p className="text-muted-foreground">
                    Driver: {payEntry.driverName}
                    {payEntry.driverPhone ? ` (${payEntry.driverPhone})` : ''}
                  </p>
                )}
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">Total cost</span>
                  <span className="font-medium">₹{payEntry.amount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Already paid</span>
                  <span className="font-medium text-success">₹{payEntry.paidAmount || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Balance due</span>
                  <span className="font-medium text-destructive">
                    ₹{Math.max(0, (payEntry.amount || 0) - (payEntry.paidAmount || 0))}
                  </span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Amount paid (₹)</Label>
              <Input
                type="number"
                value={payForm.amount}
                onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 6400"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment screenshot</Label>
              <Input type="file" accept="image/*" disabled={compressingPayScreenshot} onChange={handlePayScreenshotPick} />
              {compressingPayScreenshot && (
                <p className="text-xs text-muted-foreground">Compressing…</p>
              )}
              {payForm.screenshot && !compressingPayScreenshot && (
                <div className="flex items-center gap-2 pt-1">
                  <img src={payForm.screenshot} alt="Payment proof" className="h-14 w-14 rounded-md border object-cover" />
                  <span className="text-xs text-muted-foreground">Ready to save</span>
                </div>
              )}
            </div>
            <Button className="w-full gap-1.5" disabled={savingPay} onClick={saveChargePayment}>
              {savingPay ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Save payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjustEntry} onOpenChange={(o) => !o && setAdjustEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Adjust amount
              {adjustEntry?.leadId
                ? ` — ${[adjustEntry.leadId.firstName, adjustEntry.leadId.lastName].filter(Boolean).join(' ')}`
                : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {adjustEntry && (
              <p className="text-sm text-muted-foreground">
                Current total: <span className="font-medium text-foreground">₹{adjustEntry.amount}</span> — e.g. the
                vehicle got swapped mid-trip, or the stay ran an extra day.
              </p>
            )}
            <div className="flex rounded-md border p-1">
              <button
                type="button"
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${
                  adjustForm.direction === 'add' ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground'
                }`}
                onClick={() => setAdjustForm((f) => ({ ...f, direction: 'add' }))}
              >
                + Add
              </button>
              <button
                type="button"
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${
                  adjustForm.direction === 'subtract' ? 'bg-success text-white' : 'text-muted-foreground'
                }`}
                onClick={() => setAdjustForm((f) => ({ ...f, direction: 'subtract' }))}
              >
                − Subtract
              </button>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                value={adjustForm.amount}
                onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 2000"
              />
            </div>
            <div className="space-y-2">
              <Label>Remark *</Label>
              <Textarea
                value={adjustForm.remark}
                onChange={(e) => setAdjustForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder="e.g. Vehicle swapped mid-trip to a bigger car"
              />
            </div>
            <Button className="w-full gap-1.5" disabled={savingAdjust} onClick={saveAdjustment}>
              {savingAdjust && <Loader2 className="h-4 w-4 animate-spin" />}
              Save adjustment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImage} onOpenChange={(o) => !o && setPreviewImage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment screenshot</DialogTitle>
          </DialogHeader>
          {previewImage && <img src={previewImage} alt="Payment proof" className="w-full rounded-md border" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
