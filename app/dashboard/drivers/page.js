'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Car, User, Phone, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { mutateJson } from '@/lib/mutate'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TableShell } from '@/components/crm/TableShell'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// Same ledger system as Suppliers (Supplier.type === 'transport'), just a
// dedicated view — cars/drivers get charged and paid the same way hotels
// do (see chargeSupplierForVehicle in app/api/bookings/[id]/confirmations),
// so this reuses the generic supplier ledger detail page for each row.
export default function DriversPage() {
  const router = useRouter()
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })

  const load = () => {
    const token = localStorage.getItem('token')
    fetch('/api/suppliers?type=transport', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setDrivers(d.suppliers || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!form.name) {
      toast.error('Name is required')
      return
    }
    try {
      await mutateJson('/api/suppliers', {
        token: localStorage.getItem('token'),
        body: { ...form, type: 'transport', email: form.email || 'na@example.com' },
      })
      toast.success('Driver/vehicle added')
      setOpen(false)
      setForm({ name: '', email: '', phone: '' })
      load()
    } catch (e) {
      toast.error(e.message || 'Failed to add')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground sm:text-base">
          Vehicles and drivers — payment ledger per car
        </p>
        <Button onClick={() => setOpen(true)} size="sm" className="shrink-0 gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          <span className="sm:hidden">Add</span>
          <span className="hidden sm:inline">Add driver / vehicle</span>
        </Button>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Driver / vehicle directory
          </CardTitle>
          <CardDescription>
            {drivers.length} driver(s)/vehicle(s) — auto-added the first time Operations confirms a vehicle with a
            price
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-3 sm:px-6">
          <div className="space-y-3 md:hidden">
            {drivers.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No drivers or vehicles yet.</p>
            )}
            {drivers.map((s) => (
              <Link
                key={s._id}
                href={`/dashboard/drivers/${s._id}`}
                className="block overflow-hidden rounded-xl border bg-card shadow-sm active:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-3 border-b bg-primary/5 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Vehicle number</p>
                    <p className="truncate text-base font-semibold">{s.name}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </div>
                <dl className="space-y-2 px-3 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <dt className="flex w-16 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="h-3.5 w-3.5" /> Driver
                    </dt>
                    <dd className="min-w-0 truncate">{s.contactPerson?.name || '—'}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="flex w-16 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" /> Phone
                    </dt>
                    <dd className="min-w-0 truncate">{s.phone || '—'}</dd>
                  </div>
                </dl>
                <div className="flex items-center justify-between border-t px-3 py-2.5">
                  <span className="text-xs text-muted-foreground">Balance due</span>
                  {s.balanceDue ? (
                    <span className="rounded-full bg-destructive/15 px-3 py-0.5 text-sm font-semibold text-destructive">
                      ₹{Number(s.balanceDue).toLocaleString('en-IN')}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Nil</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
          <TableShell className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle number</TableHead>
                  <TableHead>Driver name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Balance due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : drivers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No drivers/vehicles yet — they're added automatically the first time Operations confirms
                      transport with a price, or add one manually.
                    </TableCell>
                  </TableRow>
                ) : (
                  drivers.map((s) => (
                    <TableRow
                      key={s._id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/drivers/${s._id}`)}
                    >
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.contactPerson?.name || '—'}</TableCell>
                      <TableCell>{s.phone || '—'}</TableCell>
                      <TableCell>
                        {s.balanceDue ? (
                          <Badge className="bg-destructive">₹{s.balanceDue}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add driver / vehicle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Vehicle number or driver name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <Button className="w-full" onClick={create}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
