'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  FileText,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { CreateBookingDialog } from '@/components/crm/CreateBookingDialog'
import { leadDisplayName, LEAD_STATUSES, formatInr, isPlaceholderEmail } from '@/utils/crm'
import { useMasters } from '@/hooks/useMasters'
import { mutateJson } from '@/lib/mutate'
import { pickerToIso } from '@/lib/datetime'

export default function LeadDetailPage({ params }) {
  const { id } = use(params)
  const router = useRouter()
  const [lead, setLead] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [itineraries, setItineraries] = useState([])
  const [followUps, setFollowUps] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [lostForm, setLostForm] = useState({
    lostReason: '',
    nextFollowUpAt: '',
    followUpType: 'call',
    remarks: '',
  })
  const [savingLost, setSavingLost] = useState(false)
  const [opsMembers, setOpsMembers] = useState([])
  const [accountsMembers, setAccountsMembers] = useState([])
  const [bookLead, setBookLead] = useState(null)
  const [bookOpen, setBookOpen] = useState(false)

  const { options: statusMasters } = useMasters('lead_status', LEAD_STATUSES)
  const { options: followUpTypes } = useMasters('follow_up_type', [
    'call', 'email', 'whatsapp', 'meeting', 'site_visit',
  ])
  const { options: lostReasons } = useMasters('lost_reason', [])

  const token = () => localStorage.getItem('token')

  const loadAll = async () => {
    setLoading(true)
    try {
      const t = token()
      const [leadRes, timelineRes, itRes, fuRes, bkRes] = await Promise.all([
        fetch(`/api/leads/${id}`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`/api/leads/${id}/timeline`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`/api/itineraries?leadId=${id}&limit=20`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`/api/follow-ups?leadId=${id}&limit=20`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`/api/bookings?leadId=${id}&limit=20`, { headers: { Authorization: `Bearer ${t}` } }),
      ])

      const leadData = await leadRes.json()
      if (!leadRes.ok) throw new Error(leadData.error || 'Lead not found')
      const l = leadData.lead || leadData
      setLead(l)
      setLostForm({
        lostReason: l.lostReason || '',
        nextFollowUpAt: l.lostDetails?.nextFollowUpAt
          ? new Date(l.lostDetails.nextFollowUpAt).toISOString().slice(0, 16)
          : '',
        followUpType: l.lostDetails?.followUpType || 'call',
        remarks: l.lostDetails?.remarks || '',
      })

      const tl = await timelineRes.json()
      setTimeline(tl.timeline || [])

      const it = await itRes.json()
      setItineraries(it.itineraries || [])

      const fu = await fuRes.json()
      setFollowUps(fu.followUps || [])

      const bk = await bkRes.json()
      setBookings(bk.bookings || [])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    try {
      setUser(JSON.parse(localStorage.getItem('user') || 'null'))
    } catch {
      setUser(null)
    }
    loadAll()
  }, [id])

  // Needed for the Create Booking dialog's Operations/Accounts assign pickers
  // — same as the Leads list page.
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch('/api/team/members', {
          headers: { Authorization: `Bearer ${token()}` },
        })
        if (res.ok) {
          const data = await res.json()
          const all = data.members || []
          setOpsMembers(all.filter((m) => m.role === 'operations'))
          setAccountsMembers(all.filter((m) => m.role === 'accounts'))
        }
      } catch (error) {
        console.error('Error fetching team members:', error)
      }
    }
    fetchMembers()
  }, [])

  const saveLostDetails = async () => {
    setSavingLost(true)
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'lost',
          lostReason: lostForm.lostReason,
          lostDetails: {
            nextFollowUpAt: lostForm.nextFollowUpAt || null,
            followUpType: lostForm.followUpType,
            remarks: lostForm.remarks,
          },
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'Failed to save')
        return
      }
      // Also schedule a follow-up so it surfaces in the Follow-ups module.
      // Retried + surfaced rather than fire-and-forget — a dropped request
      // here used to leave the lead marked Lost with no follow-up ever
      // created, and nothing told the user.
      if (lostForm.nextFollowUpAt) {
        try {
          await mutateJson('/api/follow-ups', {
            token: token(),
            body: {
              leadId: id,
              assignedTo: user?.id || user?.userId || user?._id,
              type: lostForm.followUpType,
              scheduledDate: pickerToIso(lostForm.nextFollowUpAt),
              description:
                lostForm.remarks || `Lost lead follow-up (${lostForm.lostReason || 'no reason'})`,
            },
          })
        } catch (err) {
          console.error('Lost follow-up creation failed:', err)
          toast.error('Lead marked Lost, but the follow-up could not be scheduled — try adding it again.')
          loadAll()
          return
        }
      }
      toast.success('Lost follow-up saved')
      loadAll()
    } finally {
      setSavingLost(false)
    }
  }

  // Marking a lead Booked always goes through the same Create Booking dialog
  // as the Leads list (itinerary pick, advance paid + screenshot, Ops/Accounts
  // assign) — no more silent auto-30%-advance shortcut from this page.
  const openBook = () => {
    setBookLead(lead)
    setBookOpen(true)
  }

  // Remarks entered while actioning a follow-up are logged to the timeline
  // going forward (see PATCH /api/follow-ups/[id]), tagged with
  // metadata.followUpId. Older follow-ups predate that and only ever had
  // their remark stored on the FollowUp record itself — merge those in here
  // so past remark history still shows, without double-counting the ones
  // that already have a matching timeline entry.
  const loggedFollowUpIds = new Set(
    timeline.filter((t) => t.metadata?.followUpId).map((t) => String(t.metadata.followUpId))
  )
  const legacyFollowUpEntries = followUps
    .filter((fu) => fu.description?.trim() && !loggedFollowUpIds.has(String(fu._id)))
    .map((fu) => ({
      _id: `fu-${fu._id}`,
      title: fu.status === 'completed' ? 'Follow-up completed' : 'Follow-up remark',
      body: fu.description,
      createdAt: fu.updatedAt || fu.createdAt,
    }))
  const timelineEntries = [...timeline, ...legacyFollowUpEntries].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Lead not found</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/dashboard/leads">Back to leads</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild className="gap-2 -ml-2">
        <Link href="/dashboard/leads">
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </Link>
      </Button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{leadDisplayName(lead)}</h1>
          {!isPlaceholderEmail(lead.email) && <p className="mt-1 text-muted-foreground">{lead.email}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline" className="capitalize">{lead.status}</Badge>
            <Badge variant="secondary" className="capitalize">{lead.source}</Badge>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button asChild className="w-full sm:w-auto">
            <Link href={`/dashboard/itinerary-builder?leadId=${id}`}>
              <FileText className="mr-2 h-4 w-4" />
              Create itinerary
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/60 shadow-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              {lead.phone || '—'}
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              {lead.whatsapp || lead.phone || '—'}
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              {lead.destinationPreference?.join(', ') || '—'}
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              {lead.numberOfTravelers || '—'} travelers
            </div>
            <div className="pt-2">
              <Label className="text-xs text-muted-foreground">Pipeline status</Label>
              <div className="mt-1 flex items-center gap-2">
                {(() => {
                  const opt = statusMasters.find((s) => s.key === lead.status)
                  const color = opt?.color || '#3b82f6'
                  return (
                    <span
                      className="inline-block rounded-full px-3 py-1.5 text-sm font-medium capitalize"
                      style={{ backgroundColor: `${color}22`, color }}
                    >
                      {opt?.label || lead.status}
                    </span>
                  )
                })()}
                {!['booked', 'completed'].includes(lead.status) && (
                  <Button size="sm" variant="outline" onClick={openBook}>
                    Mark as Booked
                  </Button>
                )}
              </div>
            </div>

            {/* Lost lead follow-up — only visible for lost leads */}
            {lead.status === 'lost' && (
              <div className="mt-2 space-y-3 rounded-lg border border-red-200 bg-red-50/60 p-3">
                <p className="text-sm font-semibold text-red-700">Lost lead follow-up</p>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Lost reason</Label>
                  <Select
                    value={lostForm.lostReason}
                    onValueChange={(v) => setLostForm((f) => ({ ...f, lostReason: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {lostReasons.length === 0 ? (
                        <SelectItem value="other">Other</SelectItem>
                      ) : (
                        lostReasons.map((r) => (
                          <SelectItem key={r.key} value={r.key}>
                            {r.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Next follow-up date &amp; time
                  </Label>
                  <Input
                    type="datetime-local"
                    value={lostForm.nextFollowUpAt}
                    onChange={(e) =>
                      setLostForm((f) => ({ ...f, nextFollowUpAt: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Follow-up type</Label>
                  <Select
                    value={lostForm.followUpType}
                    onValueChange={(v) => setLostForm((f) => ({ ...f, followUpType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {followUpTypes.map((t) => (
                        <SelectItem key={t.key} value={t.key} className="capitalize">
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Remarks</Label>
                  <Textarea
                    value={lostForm.remarks}
                    onChange={(e) => setLostForm((f) => ({ ...f, remarks: e.target.value }))}
                    placeholder="Why was this lead lost? Next steps..."
                    className="min-h-[70px]"
                  />
                </div>

                <Button
                  size="sm"
                  className="w-full"
                  onClick={saveLostDetails}
                  disabled={savingLost}
                >
                  {savingLost ? 'Saving...' : 'Save lost follow-up'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {lead.metadata?.google && (
          <Card className="border-border/60 shadow-sm lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Google Ads</CardTitle>
              <CardDescription>
                {lead.metadata.google.sourceType === 'google_lead_form' ? 'Lead Form' : 'Landing Page / Website'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ['Campaign', lead.metadata.google.campaignName],
                ['Ad Group', lead.metadata.google.adGroupId],
                ['Ad / Asset', lead.metadata.google.adId],
                ['Lead Form', lead.metadata.google.formId],
                ['GCLID', lead.metadata.google.gclid],
                ['UTM Source', lead.metadata.google.utmSource],
                ['UTM Medium', lead.metadata.google.utmMedium],
                ['UTM Campaign', lead.metadata.google.utmCampaign],
                ['UTM Term', lead.metadata.google.utmTerm],
                ['UTM Content', lead.metadata.google.utmContent],
                ['Landing Page', lead.metadata.google.landingPageUrl || lead.metadata.google.landingPageId],
              ]
                // Only ever show fields that actually have a value.
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="max-w-[65%] truncate text-right font-mono text-xs" title={String(value)}>
                      {value}
                    </span>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}

        <Card className="border-border/60 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Activity timeline</CardTitle>
            <CardDescription>Notes and system events for this lead</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {timelineEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet</p>
              ) : (
                timelineEntries.map((item) => (
                  <div key={item._id} className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-sm font-medium">{item.title}</p>
                    {(item.body || item.description) && (
                      <p className="text-sm text-muted-foreground">
                        {item.body || item.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Itineraries</CardTitle>
              <CardDescription>Quotations linked to this lead</CardDescription>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/dashboard/itinerary-builder?leadId=${id}`}>
                <Plus className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {itineraries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No itineraries yet</p>
            ) : (
              itineraries.map((it) => (
                <div
                  key={it._id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{it.tripName || it.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {it.destination} · {formatInr(it.totalPrice || 0, it.currency)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
                      <Link href={`/dashboard/itinerary-builder?id=${it._id}`}>Edit</Link>
                    </Button>
                    <Button size="sm" className="w-full sm:w-auto" onClick={openBook}>
                      Book
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Follow-ups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {followUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No follow-ups scheduled</p>
            ) : (
              followUps.map((fu) => (
                <div key={fu._id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium capitalize">{fu.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(fu.scheduledDate).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">{fu.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {bookings.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Bookings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bookings.map((b) => (
              <div key={b._id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">{b.bookingNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatInr(b.totalAmount, b.currency)} · {b.status}
                  </p>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/dashboard/bookings">View</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <CreateBookingDialog
        lead={bookLead}
        open={bookOpen}
        onOpenChange={setBookOpen}
        opsMembers={opsMembers}
        accountsMembers={accountsMembers}
        onBooked={() => {
          toast.success('Booking created')
          loadAll()
          router.push('/dashboard/bookings')
        }}
      />
    </div>
  )
}
