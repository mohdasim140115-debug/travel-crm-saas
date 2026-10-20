'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DURATION_PRESETS } from '@/lib/data/masterRepository'

function nightsFromForm(form) {
  const preset = DURATION_PRESETS.find((p) => p.value === form.duration)
  if (preset) return preset.nights
  const m = String(form.customDuration || '').match(/(\d+)\s*N/i)
  return m ? Number(m[1]) : 4
}

/**
 * "Generate with AI" — collects the trip brief, asks the server to draft the
 * itinerary with the agency's own AI key, and hands the resulting form patch
 * back to the Studio. Nothing is saved here; the agent reviews every step
 * and saves as usual.
 */
export default function AiGenerateDialog({ open, onOpenChange, form, onApply }) {
  const [brief, setBrief] = useState(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!open) return
    setBrief({
      destination: form.destination || '',
      nights: nightsFromForm(form),
      startDate: form.startDate || '',
      adults: Number(form.numberOfAdults) || 2,
      children: Number(form.numberOfChildren) || 0,
      preferences: '',
    })
    // Seed only when the dialog opens, not on every form keystroke behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (patch) => setBrief((b) => ({ ...b, ...patch }))

  const generate = async () => {
    if (!brief.destination.trim()) return toast.error('Enter a destination')
    if (!(Number(brief.nights) >= 1)) return toast.error('Enter the number of nights')
    if (!brief.startDate) return toast.error('Pick the start date')
    if (!(Number(brief.adults) >= 1)) return toast.error('At least 1 adult is required')

    setGenerating(true)
    try {
      const res = await fetch('/api/ai/itinerary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          ...brief,
          nights: Number(brief.nights),
          adults: Number(brief.adults),
          children: Number(brief.children) || 0,
          packageCategory: form.packageCategory,
        }),
      })
      // The server streams whitespace heartbeats before the JSON body.
      const text = await res.text()
      let data = {}
      try {
        data = JSON.parse(text.trim() || '{}')
      } catch {
        throw new Error('Unexpected response from the server. Please try again.')
      }
      if (!res.ok || data.error) throw new Error(data.error || 'AI generation failed')
      onApply(data.patch, data.warnings || [])
      onOpenChange(false)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !generating && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate itinerary with AI
          </DialogTitle>
          <DialogDescription>
            AI drafts the day-wise plan and picks hotels and transport from your own rate master. Review every
            step before saving.
          </DialogDescription>
        </DialogHeader>

        {brief && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Destination *</Label>
              <Input
                value={brief.destination}
                onChange={(e) => set({ destination: e.target.value })}
                placeholder="e.g. Kashmir"
                disabled={generating}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nights *</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={brief.nights}
                  onChange={(e) => set({ nights: e.target.value })}
                  disabled={generating}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Start date *</Label>
                <Input
                  type="date"
                  value={brief.startDate}
                  onChange={(e) => set({ startDate: e.target.value })}
                  disabled={generating}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Adults *</Label>
                <Input
                  type="number"
                  min={1}
                  value={brief.adults}
                  onChange={(e) => set({ adults: e.target.value })}
                  disabled={generating}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Children</Label>
                <Input
                  type="number"
                  min={0}
                  value={brief.children}
                  onChange={(e) => set({ children: e.target.value })}
                  disabled={generating}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Client requests (optional)</Label>
              <Textarea
                value={brief.preferences}
                onChange={(e) => set({ preferences: e.target.value })}
                placeholder="e.g. Honeymoon couple, must include Gulmarg Gondola and a houseboat night"
                className="min-h-[80px]"
                disabled={generating}
              />
            </div>
            <p className="rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
              Package category: <span className="font-medium text-foreground">{form.packageCategory || '—'}</span>.
              This replaces the current day plan, hotels, transport, inclusions and exclusions. Client details stay
              as they are.
            </p>
            <Button className="h-11 w-full gap-2" onClick={generate} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI is drafting your itinerary… (up to 1–2 min)
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generate draft
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
