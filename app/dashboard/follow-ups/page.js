'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { Calendar, Phone, Mail, Eye, AlertCircle, Pencil, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { leadDisplayName, isPlaceholderEmail } from '@/utils/crm'
import { TableShell } from '@/components/crm/TableShell'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { CreateBookingDialog } from '@/components/crm/CreateBookingDialog'
import { useMasters, labelize } from '@/hooks/useMasters'
import { mutateJson } from '@/lib/mutate'
import { pickerToIso } from '@/lib/datetime'

// A lead that's been won or shelved has no actionable follow-up — hide any
// pending row still attached to it (a safety net for records that predate the
// server-side cleanup, and for an instantly-correct list before the refetch).
const RESTING_LEAD_STATUSES = new Set(['booked', 'completed'])

const waLink = (phone) => `https://wa.me/${String(phone || '').replace(/\D/g, '')}`

function LeadStatusPill({ status, statusOptions }) {
  const opt = statusOptions.find((s) => s.key === status)
  const color = opt?.color || '#3b82f6'
  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-medium"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {opt?.label || labelize(status)}
    </span>
  )
}

export default function FollowUpsPage() {
  return (
    <Suspense fallback={null}>
      <FollowUpsContent />
    </Suspense>
  )
}

function FollowUpsContent() {
  const searchParams = useSearchParams()
  const initialFilter = searchParams.get('filter')
  const [followUps, setFollowUps] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState(
    ['today', 'all', 'pending'].includes(initialFilter) ? initialFilter : 'today'
  )
  const [searchTerm, setSearchTerm] = useState('')
  const { options: statusOptions } = useMasters('lead_status', [
    'new', 'contacted', 'interested', 'negotiating', 'booked', 'completed', 'lost',
  ])

  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({ scheduledDate: '', description: '', leadStatus: '' })
  const [saving, setSaving] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [opsMembers, setOpsMembers] = useState([])
  const [accountsMembers, setAccountsMembers] = useState([])
  const [bookLead, setBookLead] = useState(null)
  const [bookOpen, setBookOpen] = useState(false)
  const [pendingFollowUpId, setPendingFollowUpId] = useState(null)

  useEffect(() => {
    fetchFollowUps()
  }, [filter])

  // Needed for the Create Booking dialog's Operations/Accounts assign
  // pickers — same as the Leads list page.
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch('/api/team/members', {
          headers: { Authorization: `Bearer ${token}` },
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

  const fetchFollowUps = async () => {
    try {
      const token = localStorage.getItem('token')
      const statusQuery = filter !== 'all' && filter !== 'today' ? `&status=${filter}` : ''
      const response = await fetch(`/api/follow-ups?limit=200${statusQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      setFollowUps(data.followUps || [])
    } catch (error) {
      console.error('Error fetching follow-ups:', error)
    } finally {
      setLoading(false)
    }
  }

  const openEdit = (followUp) => {
    setEditing(followUp)
    setEditForm({
      scheduledDate: new Date(followUp.scheduledDate).toISOString().slice(0, 16),
      description: followUp.description || '',
      leadStatus: followUp.leadId?.status || '',
    })
  }

  // Picking "Booked" opens the Create Booking dialog immediately — no need
  // to fill the remark or press Save first, same as the Leads list's own
  // status dropdown.
  const handleEditStatusChange = (value) => {
    setEditForm((f) => ({ ...f, leadStatus: value }))
    if (value === 'booked' && editing) {
      setPendingFollowUpId(editing._id)
      setBookLead(editing.leadId)
      setBookOpen(true)
      setEditing(null)
    }
  }

  const selectedEditStatusOption = statusOptions.find((s) => s.key === editForm.leadStatus)
  const editNeedsFollowUp = !!selectedEditStatusOption?.metadata?.requiresFollowUp

  const saveEdit = async () => {
    if (!editing) return
    if (!editForm.leadStatus) {
      toast.error('Status is required')
      return
    }
    if (editNeedsFollowUp && !editForm.scheduledDate) {
      toast.error('Follow-up date is required')
      return
    }
    if (!editForm.description.trim()) {
      toast.error('Remark is required')
      return
    }
    setSaving(true)
    try {
      const token = localStorage.getItem('token')

      // "Booked" is handled the moment it's picked in the dropdown (see
      // handleEditStatusChange) — by the time Save could be clicked here the
      // status is always something else.
      //
      // Both writes go through mutateJson: a momentary network/5xx blip used
      // to be swallowed here, so the row looked updated but the follow-up (or
      // the lead status) never actually moved. Now it retries, and a real
      // failure is shown instead of a false success.
      await mutateJson(`/api/follow-ups/${editing._id}`, {
        method: 'PATCH',
        token,
        body: {
          description: editForm.description,
          ...(editNeedsFollowUp
            ? { status: 'pending', scheduledDate: pickerToIso(editForm.scheduledDate) }
            : { status: 'completed' }),
        },
      })

      if (editing.leadId?._id) {
        await mutateJson(`/api/leads/${editing.leadId._id}`, {
          method: 'PUT',
          token,
          body: { status: editForm.leadStatus },
        })
      }

      toast.success('Follow-up updated')
      setEditing(null)
      fetchFollowUps()
    } catch (err) {
      toast.error(err.message || 'Failed to update follow-up')
    } finally {
      setSaving(false)
    }
  }

  const isToday = (date) => {
    const d = new Date(date)
    const now = new Date()
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    )
  }

  // Strictly before today — matches the "Pending Follow-Ups" count on the
  // Sales dashboard, so a follow-up scheduled for later this week doesn't
  // show up under Pending before its own day arrives.
  const isPastDue = (date) => {
    const d = new Date(date)
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return d < startOfToday
  }

  // Keep only one follow-up per lead: a still-pending one always wins (it's
  // the actionable one), regardless of whether a later-timestamped
  // completed/cancelled entry exists for that same lead. Otherwise, whichever
  // was created/edited most recently represents the lead's current state —
  // NOT whichever happens to have the furthest-out scheduled date (an older
  // duplicate dated further out would otherwise bury a just-scheduled one).
  const latestPerLead = new Map()
  for (const fu of followUps) {
    const key = String(fu.leadId?._id || fu.leadId || '')
    const existing = latestPerLead.get(key)
    if (!existing) {
      latestPerLead.set(key, fu)
      continue
    }
    const fuPending = fu.status === 'pending'
    const existingPending = existing.status === 'pending'
    if (fuPending !== existingPending) {
      if (fuPending) latestPerLead.set(key, fu)
      continue
    }
    if (new Date(fu.createdAt) > new Date(existing.createdAt)) {
      latestPerLead.set(key, fu)
    }
  }

  // "Today" and "Pending" are mutually exclusive: a pending follow-up only
  // shows under Today while it's scheduled for today. The moment its date
  // passes without being actioned, it drops out of Today and appears under
  // Pending instead — future-dated follow-ups show under neither until
  // their day arrives (they're visible under "All").
  const matchesSearch = (fu) => {
    const name = leadDisplayName(fu.leadId).toLowerCase()
    const q = searchTerm.toLowerCase()
    return name.includes(q) || fu.type?.toLowerCase().includes(q)
  }
  const visibleFollowUps = [...latestPerLead.values()].filter(
    // A won/handed-off lead's pending follow-up is stale — never list it.
    (fu) => !(fu.status === 'pending' && RESTING_LEAD_STATUSES.has(fu.leadId?.status))
  )
  const filteredFollowUps = visibleFollowUps.filter((fu) => {
    if (filter === 'today' && (fu.status !== 'pending' || !isToday(fu.scheduledDate))) return false
    if (filter === 'pending' && (fu.status !== 'pending' || !isPastDue(fu.scheduledDate))) return false
    return matchesSearch(fu)
  })
  // How many exist regardless of the today/pending bucket — so an empty
  // "Today" view can say "you have N under All" instead of a flat "none",
  // which looked like a just-created follow-up had vanished.
  const totalUnderAll = visibleFollowUps.filter(matchesSearch).length

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground sm:text-base">
          Manage and schedule follow-ups with your leads
        </p>
      </div>

      {/* Filters */}
      <div className="scroll-hover-thin flex flex-nowrap gap-2 overflow-x-auto pb-1">
        {['today', 'all', 'pending'].map((status) => (
          <Button
            key={status}
            variant={filter === status ? 'default' : 'outline'}
            onClick={() => setFilter(status)}
            size="sm"
            className="shrink-0 capitalize"
          >
            {status}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div>
        <Input
          placeholder="Search follow-ups..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">Loading follow-ups...</p>
          </div>
        ) : filteredFollowUps.length === 0 ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-muted-foreground">
              {filter === 'today'
                ? 'No follow-ups scheduled for today'
                : filter === 'pending'
                  ? 'No overdue follow-ups'
                  : 'No follow-ups found'}
            </p>
            {filter !== 'all' && totalUnderAll > 0 && (
              <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
                View all {totalUnderAll} follow-up{totalUnderAll > 1 ? 's' : ''}
              </Button>
            )}
          </div>
        ) : (
        <>
          <div className="space-y-3 p-4 md:hidden">
            {filteredFollowUps.map((followUp) => {
              const isOverdue = new Date(followUp.scheduledDate) < new Date() && followUp.status === 'pending'
              return (
                <div key={followUp._id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {followUp.leadId?._id ? (
                          <Link href={`/dashboard/leads/${followUp.leadId._id}`} className="text-accent-secondary">
                            {leadDisplayName(followUp.leadId)}
                          </Link>
                        ) : (
                          leadDisplayName(followUp.leadId)
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(followUp.scheduledDate).toLocaleString()}
                      </p>
                    </div>
                    <LeadStatusPill status={followUp.leadId?.status} statusOptions={statusOptions} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    {followUp.leadId?.phone && (
                      <Button size="sm" variant="outline" className="flex-1" asChild>
                        <a href={`tel:${followUp.leadId.phone}`}>
                          <Phone className="h-4 w-4 text-sky-600" />
                        </a>
                      </Button>
                    )}
                    {followUp.leadId?.phone && (
                      <Button size="sm" variant="outline" className="flex-1" asChild>
                        <a href={waLink(followUp.leadId.phone)} target="_blank" rel="noopener noreferrer">
                          <WhatsAppIcon className="h-4 w-4 text-success" />
                        </a>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(followUp)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  {isOverdue && <p className="mt-2 text-xs text-destructive">Overdue</p>}
                </div>
              )
            })}
          </div>
          <TableShell className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left p-4 font-semibold">Lead</th>
                  <th className="text-left p-4 font-semibold">Scheduled</th>
                  <th className="text-left p-4 font-semibold">Remark</th>
                  <th className="text-left p-4 font-semibold">Status</th>
                  <th className="text-left p-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFollowUps.map((followUp) => {
                    const isOverdue = new Date(followUp.scheduledDate) < new Date() && followUp.status === 'pending'
                    const lead = followUp.leadId

                    return (
                      <tr key={followUp._id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                        <td className="p-4 font-medium">
                          {lead?._id ? (
                            <Link href={`/dashboard/leads/${lead._id}`} className="text-accent-secondary hover:underline">
                              {leadDisplayName(lead)}
                            </Link>
                          ) : (
                            leadDisplayName(lead)
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            {new Date(followUp.scheduledDate).toLocaleDateString()} {new Date(followUp.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="line-clamp-2 max-w-xs text-sm text-muted-foreground">
                            {followUp.description || '—'}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="inline-flex items-center gap-1">
                            <LeadStatusPill status={lead?.status} statusOptions={statusOptions} />
                            {isOverdue && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {lead?._id && (
                              <Link href={`/dashboard/leads/${lead._id}`} title="View lead">
                                <Eye className="h-4 w-4 text-primary" />
                              </Link>
                            )}
                            {lead?.phone && (
                              <a href={`tel:${lead.phone}`} title="Call">
                                <Phone className="h-4 w-4 text-sky-500" />
                              </a>
                            )}
                            {lead?.phone && (
                              <a href={waLink(lead.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp">
                                <WhatsAppIcon className="h-4 w-4 text-success" />
                              </a>
                            )}
                            {lead?.email && !isPlaceholderEmail(lead.email) && (
                              <a href={`mailto:${lead.email}`} title="Email">
                                <Mail className="h-4 w-4 text-amber-500" />
                              </a>
                            )}
                            <button type="button" onClick={() => openEdit(followUp)} title="Edit follow-up">
                              <Pencil className="h-4 w-4 text-primary" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </TableShell>
        </>
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit follow-up</DialogTitle>
            <DialogDescription>
              {editing ? leadDisplayName(editing.leadId) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Status <span className="text-destructive">*</span></Label>
              <Select value={editForm.leadStatus} onValueChange={handleEditStatusChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Follow-up date — only for statuses the owner flagged
                "Requires follow-up" in Settings → Lead Statuses. */}
            {editNeedsFollowUp && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <Label>
                  Follow-up date <span className="text-destructive">*</span>{' '}
                  <span className="font-normal text-muted-foreground">
                    — required for "{selectedEditStatusOption?.label}"
                  </span>
                </Label>
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                      <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {editForm.scheduledDate
                        ? format(new Date(editForm.scheduledDate), 'dd MMM yyyy, hh:mm a')
                        : 'Select date & time'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={editForm.scheduledDate ? new Date(editForm.scheduledDate) : undefined}
                      onSelect={(date) => {
                        if (!date) return
                        const prev = editForm.scheduledDate ? new Date(editForm.scheduledDate) : new Date()
                        date.setHours(prev.getHours(), prev.getMinutes())
                        setEditForm((f) => ({ ...f, scheduledDate: format(date, "yyyy-MM-dd'T'HH:mm") }))
                      }}
                      autoFocus
                    />
                    <div className="flex items-center gap-2 border-t p-3">
                      <Label className="shrink-0 text-xs">Time</Label>
                      <Input
                        type="time"
                        className="h-8"
                        value={editForm.scheduledDate ? editForm.scheduledDate.slice(11, 16) : ''}
                        onChange={(e) => {
                          const [hh, mm] = e.target.value.split(':').map(Number)
                          const base = editForm.scheduledDate ? new Date(editForm.scheduledDate) : new Date()
                          base.setHours(hh, mm)
                          setEditForm((f) => ({ ...f, scheduledDate: format(base, "yyyy-MM-dd'T'HH:mm") }))
                        }}
                      />
                      <Button size="sm" className="ml-auto" onClick={() => setDateOpen(false)}>
                        Done
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="space-y-2">
              <Label>Remark <span className="text-destructive">*</span></Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={saving} className="gap-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateBookingDialog
        lead={bookLead}
        open={bookOpen}
        onOpenChange={setBookOpen}
        opsMembers={opsMembers}
        accountsMembers={accountsMembers}
        onBooked={async () => {
          // The booking API itself now completes every pending follow-up on a
          // booked lead (app/api/bookings/route.js), so this row is already
          // handled server-side. This extra PATCH is just belt-and-braces for
          // the one that opened the Book dialog — harmless if it no-ops.
          if (pendingFollowUpId) {
            const token = localStorage.getItem('token')
            await mutateJson(`/api/follow-ups/${pendingFollowUpId}`, {
              method: 'PATCH',
              token,
              body: { status: 'completed' },
            }).catch(() => {})
            setPendingFollowUpId(null)
          }
          toast.success('Booking created')
          fetchFollowUps()
        }}
      />
    </div>
  )
}
