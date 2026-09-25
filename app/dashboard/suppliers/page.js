'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Building2, Mail, Phone, MapPin, ChevronRight } from 'lucide-react'
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

export default function SuppliersPage() {
  const router = useRouter()
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })

  // Transport vendors have their own dedicated section (Drivers /
  // Transport Suppliers) — this page is hotels only.
  const load = () => {
    const token = localStorage.getItem('token')
    fetch('/api/suppliers?type=hotel', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setSuppliers(d.suppliers || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!form.name || !form.email) {
      toast.error('Name and email required')
      return
    }
    try {
      await mutateJson('/api/suppliers', {
        token: localStorage.getItem('token'),
        body: { ...form, type: 'hotel' },
      })
      toast.success('Supplier added')
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
          Hotels and accommodation partners
        </p>
        <Button onClick={() => setOpen(true)} size="sm" className="shrink-0 gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          <span className="sm:hidden">Add</span>
          <span className="hidden sm:inline">Add supplier</span>
        </Button>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Hotel directory
          </CardTitle>
          <CardDescription>{suppliers.length} hotel supplier(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-3 sm:px-6">
          <div className="space-y-3 md:hidden">
            {loading && <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>}
            {!loading && suppliers.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No hotel suppliers yet.</p>
            )}
            {suppliers.map((s) => (
              <Link
                key={s._id}
                href={`/dashboard/suppliers/${s._id}`}
                className="block overflow-hidden rounded-xl border bg-card shadow-sm active:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-3 border-b bg-primary/5 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{s.name}</p>
                    <Badge variant="secondary" className="mt-1 capitalize">{s.type}</Badge>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </div>
                <dl className="space-y-2 px-3 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <dt className="flex w-16 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" /> Email
                    </dt>
                    <dd className="min-w-0 truncate">{s.email || '—'}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="flex w-16 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" /> Phone
                    </dt>
                    <dd className="min-w-0 truncate">{s.phone || '—'}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="flex w-16 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" /> City
                    </dt>
                    <dd className="min-w-0 truncate">{s.address?.city || '—'}</dd>
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
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Balance due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No hotel suppliers yet.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
                  <TableRow
                    key={s._id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/suppliers/${s._id}`)}
                  >
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{s.type}</Badge>
                    </TableCell>
                    <TableCell>{s.email}</TableCell>
                    <TableCell>{s.phone || '—'}</TableCell>
                    <TableCell>{s.address?.city || '—'}</TableCell>
                    <TableCell>
                      {s.balanceDue ? (
                        <Badge className="bg-destructive">{s.balanceDue}</Badge>
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
            <DialogTitle>Add supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={create}>Save supplier</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
