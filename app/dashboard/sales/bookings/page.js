'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Pencil, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PageHeader } from '@/components/crm/PageHeader'
import { TableShell } from '@/components/crm/TableShell'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { leadDisplayName } from '@/utils/crm'

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** "Booking Closed" — Sales' own closed clients. The status column is purely
 * informational (Processing until Operations has confirmed hotel + transport
 * and sent both vouchers), but Edit is a real action: it reopens the same
 * itinerary in the Builder. Operations and Accounts both read that itinerary
 * live (hotel/vehicle confirmations, pricing) rather than a frozen copy of
 * it, so a fix Sales makes here — a wrong room type, a date, a price — shows
 * up for them immediately, without anyone re-entering anything. */
export default function MyBookingsPage() {
  const router = useRouter()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch('/api/bookings/mine', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setBookings(d.bookings || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
        <Link href="/dashboard/sales">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </Button>

      <PageHeader
        title="Booking Closed"
        description="Clients you've closed — edit here to fix a room, date or price; Operations and Accounts see it too."
      />

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Closed clients</CardTitle>
          <CardDescription>{bookings.length} booking(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {loading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
            ) : bookings.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No closed bookings yet.
              </p>
            ) : (
              bookings.map((b) => (
                <div key={b._id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{leadDisplayName(b.leadId)}</p>
                    {b.itineraryId && (
                      b.salesEditEnabled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 gap-1.5"
                          onClick={() => router.push(`/dashboard/itinerary-builder?id=${b.itineraryId}`)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      ) : (
                        <span
                          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border/60 px-3 text-xs text-muted-foreground"
                          title="Operations/Accounts has locked this booking from further edits"
                        >
                          <Lock className="h-3.5 w-3.5" /> Locked
                        </span>
                      )
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(b.startDate)} → {formatDate(b.endDate)}
                  </p>
                  <div className="mt-2">
                    <Badge className={b.opsStatus === 'done' ? 'bg-success' : ''} variant={b.opsStatus === 'done' ? undefined : 'outline'}>
                      {b.opsStatus === 'done' ? 'Done' : 'Processing'}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
          <TableShell className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Arrival date</TableHead>
                  <TableHead>Departure date</TableHead>
                  <TableHead>Operations status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : bookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No closed bookings yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  bookings.map((b) => (
                    <TableRow key={b._id}>
                      <TableCell className="font-medium">{leadDisplayName(b.leadId)}</TableCell>
                      <TableCell>{formatDate(b.startDate)}</TableCell>
                      <TableCell>{formatDate(b.endDate)}</TableCell>
                      <TableCell>
                        <Badge
                          className={b.opsStatus === 'done' ? 'bg-success' : ''}
                          variant={b.opsStatus === 'done' ? undefined : 'outline'}
                        >
                          {b.opsStatus === 'done' ? 'Done' : 'Processing'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {b.itineraryId && (
                          b.salesEditEnabled ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => router.push(`/dashboard/itinerary-builder?id=${b.itineraryId}`)}
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Button>
                          ) : (
                            <span
                              className="flex w-fit items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-xs text-muted-foreground"
                              title="Operations/Accounts has locked this booking from further edits"
                            >
                              <Lock className="h-3.5 w-3.5" /> Locked
                            </span>
                          )
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
    </div>
  )
}
