'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { TimeSelect } from '@/components/ui/time-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, MessageSquare, Send } from 'lucide-react'
import { format } from 'date-fns'
import { leadDisplayName, LEAD_STATUSES } from '@/utils/crm'
import { useMasters } from '@/hooks/useMasters'
import { mutateJson } from '@/lib/mutate'
import { pickerToIso } from '@/lib/datetime'

const token = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null)
const authH = () => ({ Authorization: `Bearer ${token()}` })

/**
 * Conversation / remarks log for a lead. Sales executives record what was
 * discussed with the client, and can update the pipeline status and
 * schedule the next follow-up in the same place — mirroring the Follow-ups
 * page's "Edit follow-up" flow, just reachable from the Leads list too.
 */
export function LeadRemarksDialog({ lead, open, onOpenChange, onSaved }) {
  const [remarks, setRemarks] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [dateOpen, setDateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const leadId = lead?._id
  const { options: statusOptions } = useMasters('lead_status', LEAD_STATUSES)

  const selectedStatusOption = statusOptions.find((s) => s.key === status)
  const needsFollowUp = !!selectedStatusOption?.metadata?.requiresFollowUp

  const load = async () => {
    if (!leadId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/timeline`, { headers: authH() })
      const data = await res.json().catch(() => ({}))
      setRemarks(data.timeline || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && leadId) {
      setText('')
      setStatus(lead?.status || '')
      setFollowUpDate('')
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leadId])

  const addRemark = async () => {
    if (!text.trim()) {
      toast.error('Remark is required')
      return
    }
    if (!status) {
      toast.error('Status is required')
      return
    }
    if (needsFollowUp && !followUpDate) {
      toast.error('Follow-up date is required')
      return
    }
    setSaving(true)
    const token = localStorage.getItem('token')
    const statusChanged = status !== lead?.status
    // Run the writes in order, not Promise.all — the old code fired all three
    // at once and, if any failed, showed a bare "Failed to save" while the
    // others had already gone through (and a retry then re-ran them). Order
    // here is by importance: the follow-up (the thing that was going missing)
    // first, then the status, then the timeline note as best-effort. The
    // first two are safe to retry — /api/follow-ups always leaves exactly one
    // pending follow-up, and a status PUT is idempotent — so mutateJson can
    // ride out a transient blip instead of dropping the write.
    try {
      if (needsFollowUp) {
        await mutateJson('/api/follow-ups', {
          token,
          body: { leadId, type: 'call', scheduledDate: pickerToIso(followUpDate), description: text.trim() },
        })
      }
      if (statusChanged) {
        await mutateJson(`/api/leads/${leadId}`, { method: 'PUT', token, body: { status } })
      }
    } catch (err) {
      toast.error(err.message || 'Could not save. Please try again.')
      setSaving(false)
      return
    }

    // Timeline note: a record of the conversation, not load-bearing for the
    // pipeline — don't fail the whole action if only this can't be written.
    try {
      await mutateJson(`/api/leads/${leadId}/timeline`, {
        token,
        retries: 0,
        body: { type: 'note', title: 'Remark', note: text.trim() },
      })
    } catch (err) {
      console.error('Timeline note write failed:', err)
    }

    toast.success('Remark saved')
    setText('')
    setFollowUpDate('')
    setSaving(false)
    load()
    onSaved?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Remarks
          </DialogTitle>
          <DialogDescription>
            {lead ? `Conversation log for ${leadDisplayName(lead)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Status <span className="text-destructive">*</span>
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions
                  .filter((s) => {
                    if (s.key === status) return true // always keep the current value selectable
                    if (s.key === 'completed') return false // set later by Operations
                    // Booked needs a real Booking record (itinerary + advance
                    // payment) — use the "Book" flow, not a bare status flip.
                    if (s.key === 'booked') return false
                    return true
                  })
                  .map((s) => (
                    <SelectItem key={s.key} value={s.key} className="capitalize">
                      {s.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {needsFollowUp && (
            <div className="space-y-1 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Label className="text-xs text-muted-foreground">
                Follow-up date &amp; time <span className="text-destructive">*</span>{' '}
                <span className="font-normal">— required for "{selectedStatusOption?.label}"</span>
              </Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {followUpDate
                      ? format(new Date(followUpDate), 'dd MMM yyyy, hh:mm a')
                      : 'Select date & time'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={followUpDate ? new Date(followUpDate) : undefined}
                    onSelect={(date) => {
                      if (!date) return
                      // Keep whatever time was already set (defaulting to
                      // now for a first pick) and close right away — the
                      // time itself is adjusted separately below, not here.
                      const prev = followUpDate ? new Date(followUpDate) : new Date()
                      date.setHours(prev.getHours(), prev.getMinutes())
                      setFollowUpDate(format(date, "yyyy-MM-dd'T'HH:mm"))
                      setDateOpen(false)
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
              <div className="flex items-center gap-2">
                <Label className="shrink-0 text-xs text-muted-foreground">Time</Label>
                <TimeSelect
                  value={followUpDate ? followUpDate.slice(11, 16) : ''}
                  onChange={(timeStr) => {
                    const [hh, mm] = timeStr.split(':').map(Number)
                    const base = followUpDate ? new Date(followUpDate) : new Date()
                    base.setHours(hh, mm)
                    setFollowUpDate(format(base, "yyyy-MM-dd'T'HH:mm"))
                  }}
                />
              </div>
            </div>
          )}

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What did you discuss with the client? Add a remark..."
            className="min-h-[80px]"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={addRemark} disabled={saving || !text.trim()}>
              <Send className="mr-1 h-4 w-4" />
              Add remark
            </Button>
          </div>
        </div>

        <div className="border-t pt-3">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : remarks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No remarks yet. Add the first one above.
            </p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {remarks.map((r) => (
                <div key={r._id} className="rounded-lg border bg-muted/30 p-2.5">
                  <p className="text-sm">{r.body || r.description || r.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.type ? `${String(r.type).replace('_', ' ')} · ` : ''}
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
