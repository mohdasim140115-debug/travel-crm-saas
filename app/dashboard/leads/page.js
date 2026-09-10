'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Search, Trash2, Edit2, Eye, Filter, ArrowUpDown, MessageSquare, Phone, Mail, Loader2, Users, Calendar as CalendarIcon } from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { toast } from 'sonner'
import { format } from 'date-fns'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { TableShell } from '@/components/crm/TableShell'
import { LeadPreviewDrawer } from '@/components/crm/LeadPreviewDrawer'
import { LeadItinerariesDialog } from '@/components/crm/LeadItinerariesDialog'
import { LeadRemarksDialog } from '@/components/crm/LeadRemarksDialog'
import { CreateBookingDialog } from '@/components/crm/CreateBookingDialog'
import { useMasters, labelize } from '@/hooks/useMasters'
import { mutateJson } from '@/lib/mutate'
import { displayEmail, isPlaceholderEmail } from '@/utils/crm'
import { pickerToIso } from '@/lib/datetime'

export default function LeadsPage() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterAssigned, setFilterAssigned] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [statusCounts, setStatusCounts] = useState({})
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [previewId, setPreviewId] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [itinLead, setItinLead] = useState(null)
  const [itinOpen, setItinOpen] = useState(false)
  const [remarksLead, setRemarksLead] = useState(null)
  const [remarksOpen, setRemarksOpen] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [canAssign, setCanAssign] = useState(false)
  const [salesMembers, setSalesMembers] = useState([])
  const [opsMembers, setOpsMembers] = useState([])
  const [accountsMembers, setAccountsMembers] = useState([])
  const [bookLead, setBookLead] = useState(null)
  const [bookOpen, setBookOpen] = useState(false)
  const [followUpDateOpen, setFollowUpDateOpen] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    destination: '',
    travelDate: '',
    notes: '',
    destinationPreference: [],
    status: 'new',
    source: 'direct',
    autoAssign: true,
    lostReason: '',
    nextFollowUpAt: '',
    followUpType: 'call',
    followUpDate: '',
  })

  const { options: statusOptions } = useMasters('lead_status', [
    'new', 'contacted', 'interested', 'negotiating', 'booked', 'completed', 'lost',
  ])
  // Owner can flag any (non-locked) status in Settings → Lead Statuses as
  // "Requires follow-up" — Lost keeps its own richer reason/type block below,
  // this covers every other flagged status with just a date.
  const selectedStatusOption = statusOptions.find((s) => s.key === formData.status)
  const needsGenericFollowUp =
    formData.status !== 'lost' && !!selectedStatusOption?.metadata?.requiresFollowUp
  const { options: sourceOptions } = useMasters('lead_source', [
    'direct', 'facebook_ads', 'instagram', 'website', 'referral', 'social', 'other',
  ])
  const { options: lostReasons } = useMasters('lost_reason', [])
  const { options: followUpTypes } = useMasters('follow_up_type', [
    'call', 'email', 'whatsapp', 'meeting', 'site_visit',
  ])

  const openPreview = (id) => {
    setPreviewId(id)
    setPreviewOpen(true)
  }

  const openItineraries = (lead) => {
    setItinLead(lead)
    setItinOpen(true)
  }

  const openRemarks = (lead) => {
    setRemarksLead(lead)
    setRemarksOpen(true)
  }

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      setIsOwner(['admin', 'superadmin'].includes(u.role))
      // Only the Owner assigns / reassigns leads; sales staff just see their own.
      setCanAssign(['admin', 'superadmin'].includes(u.role))
    } catch {
      setIsOwner(false)
      setCanAssign(false)
    }
  }, [])

  useEffect(() => {
    // Fetched unconditionally (not just for Owner/canAssign) — the "Create
    // Booking" modal lets whoever is booking (sales or owner) optionally pick
    // the Operations/Accounts person by hand instead of leaving it to round-robin.
    const fetchMembers = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch('/api/team/members', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          const all = data.members || []
          // Open leads → Sales staff; booked leads → Operations staff.
          setSalesMembers(all.filter((m) => ['agent', 'manager'].includes(m.role)))
          setOpsMembers(all.filter((m) => m.role === 'operations'))
          setAccountsMembers(all.filter((m) => m.role === 'accounts'))
        }
      } catch (error) {
        console.error('Error fetching team members:', error)
      }
    }
    fetchMembers()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      fetchLeads()
    }, 300)
    return () => clearTimeout(t)
  }, [filterStatus, searchTerm, filterAssigned])

  useEffect(() => {
    fetchStatusCounts()
  }, [searchTerm, filterAssigned])

  const fetchLeads = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const params = new URLSearchParams({ limit: '200' })
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (filterAssigned !== 'all') params.set('assignedTo', filterAssigned)
      if (searchTerm.trim()) params.set('search', searchTerm.trim())

      const response = await fetch(`/api/leads?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setLeads(data.leads || [])
      }
    } catch (error) {
      console.error('Error fetching leads:', error)
    } finally {
      setLoading(false)
    }
  }

  // How many of my leads sit in each status right now — shown as clickable
  // count pills next to the status filter so a quick glance answers "where's
  // my pipeline stuck". Fetched separately from the (status-filtered) main
  // list since it always needs every status at once.
  const fetchStatusCounts = async () => {
    try {
      const token = localStorage.getItem('token')
      const params = new URLSearchParams({ counts: '1' })
      if (searchTerm.trim()) params.set('search', searchTerm.trim())
      if (filterAssigned !== 'all') params.set('assignedTo', filterAssigned)
      const response = await fetch(`/api/leads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) {
        const data = await response.json()
        setStatusCounts(data.counts || {})
      }
    } catch (error) {
      console.error('Error fetching status counts:', error)
    }
  }

  const handleAddClick = () => {
    setEditingId(null)
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      city: '',
      destination: '',
      travelDate: '',
      notes: '',
      destinationPreference: [],
      status: 'new',
      source: 'direct',
      autoAssign: true,
      lostReason: '',
      nextFollowUpAt: '',
      followUpType: 'call',
      followUpDate: '',
    })
    setShowModal(true)
  }

  const handleEditClick = (lead) => {
    setEditingId(lead._id)
    setFormData({
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone || '',
      city: lead.city || '',
      destination: lead.destination || '',
      notes: lead.notes || '',
      destinationPreference: lead.destinationPreference || [],
      status: lead.status,
      source: lead.source,
      lostReason: lead.lostReason || '',
      nextFollowUpAt: lead.lostDetails?.nextFollowUpAt
        ? new Date(lead.lostDetails.nextFollowUpAt).toISOString().slice(0, 16)
        : '',
      followUpType: lead.lostDetails?.followUpType || 'call',
      followUpDate: '',
    })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      const method = editingId ? 'PUT' : 'POST'
      const endpoint = editingId ? `/api/leads/${editingId}` : '/api/leads'

      const payload = { ...formData }
      if (formData.status === 'lost') {
        payload.lostReason = formData.lostReason
        payload.lostDetails = {
          nextFollowUpAt: formData.nextFollowUpAt || null,
          followUpType: formData.followUpType,
          remarks: formData.notes,
        }
      }

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        toast.error(data.error || `Failed to save lead (${response.status})`)
        return
      }

      const newLead = data.lead || data

      // Schedule the follow-up that goes with this status change. This used to
      // be a fire-and-forget `fetch(...).catch(() => {})` — a momentary blip
      // meant the lead saved, the toast said "updated", but no follow-up was
      // ever created and it silently fell off the sales person's list. Now it
      // retries, and if it genuinely can't be saved the user is told exactly
      // that (the lead change itself is already persisted).
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      const followUpAssignee =
        u.id || u.userId || u._id || newLead?.assignedTo?._id || newLead?.assignedTo
      let followUpSpec = null
      if (formData.status === 'lost' && formData.nextFollowUpAt && newLead?._id) {
        followUpSpec = {
          type: formData.followUpType,
          scheduledDate: pickerToIso(formData.nextFollowUpAt),
          description: formData.notes || `Lost lead follow-up (${formData.lostReason || 'no reason'})`,
        }
      } else if (needsGenericFollowUp && formData.followUpDate && newLead?._id) {
        // Any status the owner flagged "Requires follow-up" (Settings → Lead
        // Statuses), just with a plain date instead of Lost's reason/type.
        followUpSpec = {
          type: 'call',
          scheduledDate: pickerToIso(formData.followUpDate),
          description: formData.notes || `Follow-up for ${selectedStatusOption?.label || formData.status}`,
        }
      }

      let followUpFailed = false
      if (followUpSpec) {
        try {
          await mutateJson('/api/follow-ups', {
            token,
            body: { leadId: newLead._id, assignedTo: followUpAssignee, ...followUpSpec },
          })
        } catch (err) {
          console.error('Follow-up creation failed:', err)
          followUpFailed = true
        }
      }

      if (followUpFailed) {
        toast.error(
          'Lead saved, but the follow-up could not be scheduled. Open the lead and add it from the Remarks (💬) log.'
        )
      } else {
        toast.success(editingId ? 'Lead updated' : 'Lead created')
      }
      fetchLeads()
      fetchStatusCounts()
      setShowModal(false)
    } catch (error) {
      console.error('Error submitting form:', error)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this lead?')) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/leads/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        fetchLeads()
        fetchStatusCounts()
      }
    } catch (error) {
      console.error('Error deleting lead:', error)
    }
  }

  const waLink = (phone) => `https://wa.me/${String(phone || '').replace(/\D/g, '')}`

  // Booked leads are handled by Operations; open leads by Sales.
  const membersForLead = (lead) =>
    lead?.status === 'booked' ? opsMembers : salesMembers

  const handleAssign = async (leadId, userId) => {
    // Optimistic update so the dropdown reflects the choice immediately.
    const member = [...salesMembers, ...opsMembers].find((m) => m._id === userId)
    setLeads((prev) =>
      prev.map((l) =>
        l._id === leadId
          ? { ...l, assignedTo: member ? { _id: member._id, name: member.name, email: member.email } : null }
          : l
      )
    )
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assignedTo: userId || null }),
      })
      if (!response.ok) throw new Error('Assign failed')
    } catch (error) {
      console.error('Error assigning lead:', error)
      fetchLeads() // revert to server state on failure
    }
  }

  const openBook = (lead) => {
    setBookLead(lead)
    setBookOpen(true)
  }

  // Picking "Booked" in the edit modal opens the Book dialog (so a real Booking
  // is created), instead of silently flipping the status with no booking.
  const handleStatusChange = (value) => {
    if (value === 'booked' && editingId) {
      setShowModal(false)
      openBook({
        _id: editingId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        travelDate: formData.travelDate,
        numberOfTravelers: formData.numberOfTravelers,
      })
      return
    }
    setFormData({ ...formData, status: value })
  }

  // Closed leads (booked/completed) leave the Sales active list — they live in
  // Bookings now. The Owner still sees every lead.
  const CLOSED_STATUSES = ['booked', 'completed']
  const filteredLeads = leads
    .filter((lead) => {
      if (!isOwner && filterStatus === 'all' && CLOSED_STATUSES.includes(lead.status)) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt)
      if (sortBy === 'updated') return new Date(b.updatedAt) - new Date(a.updatedAt)
      return new Date(b.createdAt) - new Date(a.createdAt) // newest
    })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground sm:text-base">
          Manage and track all your travel leads
        </p>
        <Button onClick={handleAddClick} size="sm" className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" />
          Lead
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-nowrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger
              className="w-[44px] shrink-0 justify-center border border-border px-0 sm:w-[180px] sm:justify-between sm:px-3"
              aria-label="Filter by status"
            >
              <Filter className="h-4 w-4 shrink-0 text-muted-foreground sm:hidden" />
              <span className="hidden sm:inline">
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                All Status ({Object.values(statusCounts).reduce((a, b) => a + b, 0)})
              </SelectItem>
              {statusOptions.map((status) => (
                <SelectItem key={status.key} value={status.key}>
                  {status.label} ({statusCounts[status.key] || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canAssign && (
            <Select value={filterAssigned} onValueChange={setFilterAssigned}>
              <SelectTrigger
                className="w-[44px] shrink-0 justify-center border border-border px-0 sm:w-[180px] sm:justify-between sm:px-3"
                aria-label="Filter by employee"
              >
                <Users className="h-4 w-4 shrink-0 text-muted-foreground sm:hidden" />
                <span className="hidden sm:inline">
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {[...salesMembers, ...opsMembers, ...accountsMembers].map((m) => (
                  <SelectItem key={m._id} value={m._id}>
                    {m.name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger
              className="w-[44px] shrink-0 justify-center border border-border px-0 sm:w-[180px] sm:justify-between sm:px-3"
              aria-label="Sort"
            >
              <ArrowUpDown className="h-4 w-4 shrink-0 text-muted-foreground sm:hidden" />
              <span className="hidden sm:inline">
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="updated">Recently updated</SelectItem>
            </SelectContent>
          </Select>
        </div>

      </Card>

      {/* Leads Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">Loading leads...</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">No leads found</p>
          </div>
        ) : (
          <>
          <div className="space-y-3 p-4 md:hidden">
            {filteredLeads.map((lead) => (
              <div key={lead._id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      onClick={() => openPreview(lead._id)}
                      className="truncate text-left font-semibold text-accent-secondary hover:underline"
                    >
                      {lead.firstName} {lead.lastName}
                    </button>
                    <p className="truncate text-sm text-muted-foreground">{displayEmail(lead.email) || '—'}</p>
                    <p className="mt-1 text-sm">{lead.phone || '—'}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 capitalize">{lead.status}</Badge>
                </div>
                {canAssign && (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <label className="shrink-0 text-xs font-medium text-muted-foreground">Assigned to</label>
                    <Select
                      value={lead.assignedTo?._id || 'unassigned'}
                      onValueChange={(v) => handleAssign(lead._id, v === 'unassigned' ? '' : v)}
                    >
                      <SelectTrigger
                        className="h-8 max-w-[60%] border border-border text-sm"
                        aria-label="Assign lead to a sales member"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {membersForLead(lead).map((m) => (
                          <SelectItem key={m._id} value={m._id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openItineraries(lead)}>
                    Itineraries
                  </Button>
                  {/* Once booked, the lead moves to Operations — Sales can no
                   * longer edit its details or add remarks here. */}
                  {(lead.status !== 'booked' || isOwner) && (
                    <>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEditClick(lead)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openRemarks(lead)} title="Remarks">
                        <MessageSquare className="h-4 w-4 text-success" />
                      </Button>
                    </>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  {lead.phone && (
                    <Button size="sm" variant="outline" className="flex-1" asChild>
                      <a href={`tel:${lead.phone}`}>
                        <Phone className="h-4 w-4 text-sky-600" />
                      </a>
                    </Button>
                  )}
                  {lead.phone && (
                    <Button size="sm" variant="outline" className="flex-1" asChild>
                      <a href={waLink(lead.phone)} target="_blank" rel="noopener noreferrer">
                        <WhatsAppIcon className="h-4 w-4 text-success" />
                      </a>
                    </Button>
                  )}
                  {lead.email && !isPlaceholderEmail(lead.email) && (
                    <Button size="sm" variant="outline" className="flex-1" asChild>
                      <a href={`mailto:${lead.email}`}>
                        <Mail className="h-4 w-4 text-amber-600" />
                      </a>
                    </Button>
                  )}
                  {isOwner && (
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(lead._id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <TableShell className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left p-4 font-semibold">Name</th>
                  <th className="text-left p-4 font-semibold">Email</th>
                  <th className="text-left p-4 font-semibold">Phone</th>
                  <th className="text-left p-4 font-semibold">Status</th>
                  <th className="text-left p-4 font-semibold">Source</th>
                  {canAssign && <th className="text-left p-4 font-semibold">Assigned</th>}
                  <th className="text-left p-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr key={lead._id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="p-4">
                      <button
                        onClick={() => openPreview(lead._id)}
                        className="font-medium text-accent-secondary hover:underline"
                        title="Quick preview"
                      >
                        {lead.firstName} {lead.lastName}
                      </button>
                    </td>
                    <td className="p-4">{displayEmail(lead.email) || '—'}</td>
                    <td className="p-4">{lead.phone || '-'}</td>
                    <td className="p-4">
                      {(() => {
                        const opt = statusOptions.find((s) => s.key === lead.status)
                        const color = opt?.color || '#3b82f6'
                        return (
                          <span
                            className="rounded-full px-3 py-1 text-xs font-medium"
                            style={{ backgroundColor: `${color}22`, color }}
                          >
                            {opt?.label || labelize(lead.status)}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="p-4">{labelize(lead.source)}</td>
                    {canAssign && (
                      <td className="p-4">
                        <Select
                          value={lead.assignedTo?._id || 'unassigned'}
                          onValueChange={(v) => handleAssign(lead._id, v === 'unassigned' ? '' : v)}
                        >
                          <SelectTrigger
                            className="h-8 max-w-40 border border-border text-sm"
                            aria-label="Assign lead to a sales member"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {membersForLead(lead).map((m) => (
                              <SelectItem key={m._id} value={m._id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    )}
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openItineraries(lead)}
                          className="p-2 hover:bg-secondary rounded-lg"
                          title="View itineraries"
                        >
                          <Eye className="h-4 w-4 text-primary" />
                        </button>
                        {/* Once booked, the lead moves to Operations — Sales
                         * can no longer edit its details or add remarks here. */}
                        {(lead.status !== 'booked' || isOwner) && (
                          <>
                            <button
                              onClick={() => openRemarks(lead)}
                              className="p-2 hover:bg-secondary rounded-lg"
                              title="Remarks / conversation log"
                            >
                              <MessageSquare className="h-4 w-4 text-success" />
                            </button>
                            <button
                              onClick={() => handleEditClick(lead)}
                              className="p-2 hover:bg-secondary rounded-lg"
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4 text-blue-500" />
                            </button>
                          </>
                        )}
                        {lead.phone && (
                          <a
                            href={`tel:${lead.phone}`}
                            className="p-2 hover:bg-secondary rounded-lg"
                            title="Call"
                          >
                            <Phone className="h-4 w-4 text-sky-600" />
                          </a>
                        )}
                        {lead.phone && (
                          <a
                            href={waLink(lead.phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-secondary rounded-lg"
                            title="WhatsApp"
                          >
                            <WhatsAppIcon className="h-4 w-4 text-success" />
                          </a>
                        )}
                        {lead.email && !isPlaceholderEmail(lead.email) && (
                          <a
                            href={`mailto:${lead.email}`}
                            className="p-2 hover:bg-secondary rounded-lg"
                            title="Email"
                          >
                            <Mail className="h-4 w-4 text-amber-600" />
                          </a>
                        )}
                        {isOwner && (
                          <button
                            onClick={() => handleDelete(lead._id)}
                            className="p-2 hover:bg-secondary rounded-lg"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
          </>
        )}
      </Card>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <Card className="max-h-[90vh] w-full overflow-y-auto rounded-b-none p-6 sm:max-w-md sm:rounded-xl">
            <h2 className="text-2xl font-bold mb-4">
              {editingId ? 'Edit Lead' : 'Add New Lead'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <Input
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="Full name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Email (phone or email required)"
                    required={!formData.phone}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Phone *</label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Phone"
                    required={!formData.email}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Destination / Package</label>
                  <Input
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    placeholder="Kashmir Package"
                  />
                </div>
              </div>

              {/* Only when creating a lead — this captures the first bit of
                * context. For an existing lead, all conversation notes live in
                * the Remarks (💬) log, reachable from the leads list, which
                * keeps a dated history instead of one overwritable box. Any
                * note already saved on an older lead still shows (read-only) in
                * the lead preview drawer and is never wiped by an edit. */}
              {!editingId && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Remarks / Conversation notes
                  </label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="What did you discuss with the client? Requirements, budget, objections..."
                    className="min-h-[80px]"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <Select value={formData.status} onValueChange={(v) => handleStatusChange(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions
                      .filter((s) => {
                        if (s.key === formData.status) return true // always keep current
                        if (s.key === 'completed') return false // set later by Operations
                        // "Booked" only for existing leads — it opens the Book dialog.
                        if (s.key === 'booked') return !!editingId
                        return true
                      })
                      .map((status) => (
                        <SelectItem key={status.key} value={status.key}>
                          {status.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choosing <span className="font-medium">Booked</span> opens the booking form
                  (trip dates &amp; amount).
                </p>
              </div>

              {/* Lost follow-up fields — appear right below status when Lost */}
              {formData.status === 'lost' && (
                <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/60 p-3">
                  <p className="text-sm font-semibold text-red-700">Lost lead follow-up</p>

                  <div>
                    <label className="mb-1 block text-sm font-medium">Lost reason</label>
                    <Select
                      value={formData.lostReason || 'none'}
                      onValueChange={(v) =>
                        setFormData({ ...formData, lostReason: v === 'none' ? '' : v })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select reason</SelectItem>
                        {lostReasons.map((r) => (
                          <SelectItem key={r.key} value={r.key}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Next follow-up date &amp; time
                    </label>
                    <Input
                      type="datetime-local"
                      value={formData.nextFollowUpAt}
                      onChange={(e) =>
                        setFormData({ ...formData, nextFollowUpAt: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium">Follow-up type</label>
                    <Select
                      value={formData.followUpType}
                      onValueChange={(v) => setFormData({ ...formData, followUpType: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {followUpTypes.map((t) => (
                          <SelectItem key={t.key} value={t.key}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {editingId
                      ? 'Add what was discussed in the Remarks (💬) log for this lead.'
                      : 'Remarks are taken from the “Remarks / Conversation notes” field above.'}
                  </p>
                </div>
              )}

              {/* Generic follow-up date — appears for any status the owner
                  flagged "Requires follow-up" in Settings → Lead Statuses. */}
              {needsGenericFollowUp && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <label className="block text-sm font-medium">
                    Follow-up date <span className="text-muted-foreground font-normal">— required for “{selectedStatusOption?.label}”</span>
                  </label>
                  <Popover open={followUpDateOpen} onOpenChange={setFollowUpDateOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {formData.followUpDate
                          ? format(new Date(formData.followUpDate), 'dd MMM yyyy, hh:mm a')
                          : 'Select date & time'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={formData.followUpDate ? new Date(formData.followUpDate) : undefined}
                        onSelect={(date) => {
                          if (!date) return
                          const prev = formData.followUpDate ? new Date(formData.followUpDate) : new Date()
                          date.setHours(prev.getHours(), prev.getMinutes())
                          setFormData({ ...formData, followUpDate: format(date, "yyyy-MM-dd'T'HH:mm") })
                        }}
                        autoFocus
                      />
                      <div className="flex items-center gap-2 border-t p-3">
                        <label className="shrink-0 text-xs">Time</label>
                        <Input
                          type="time"
                          className="h-8"
                          value={formData.followUpDate ? formData.followUpDate.slice(11, 16) : ''}
                          onChange={(e) => {
                            const [hh, mm] = e.target.value.split(':').map(Number)
                            const base = formData.followUpDate ? new Date(formData.followUpDate) : new Date()
                            base.setHours(hh, mm)
                            setFormData({ ...formData, followUpDate: format(base, "yyyy-MM-dd'T'HH:mm") })
                          }}
                        />
                        <Button size="sm" className="ml-auto" onClick={() => setFollowUpDateOpen(false)}>
                          Done
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    Adds a follow-up on this date under Follow-ups.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Source</label>
                <Select
                  value={formData.source}
                  onValueChange={(v) => setFormData({ ...formData, source: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceOptions.map((source) => (
                      <SelectItem key={source.key} value={source.key}>
                        {source.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button variant="outline" onClick={() => setShowModal(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? 'Update Lead' : submitting ? 'Adding…' : 'Add Lead'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Convert lead → booking (hands off to Operations via the Bookings page) */}
      <CreateBookingDialog
        lead={bookLead}
        open={bookOpen}
        onOpenChange={setBookOpen}
        opsMembers={opsMembers}
        accountsMembers={accountsMembers}
        onBooked={() => {
          // Lead is now booked → it drops off the active sales list.
          fetchLeads()
          fetchStatusCounts()
        }}
      />

      <LeadPreviewDrawer
        leadId={previewId}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />

      <LeadItinerariesDialog
        lead={itinLead}
        open={itinOpen}
        onOpenChange={setItinOpen}
      />

      <LeadRemarksDialog
        lead={remarksLead}
        open={remarksOpen}
        onOpenChange={setRemarksOpen}
        onSaved={() => {
          fetchLeads()
          fetchStatusCounts()
        }}
      />
    </div>
  )
}
