'use client'

import { useEffect, useState } from 'react'
import { Pencil, User, Award, CalendarRange, MapPinned, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { PACKAGE_CATEGORIES, DURATION_PRESETS } from '@/lib/data/masterRepository'
import { useMasters } from '@/hooks/useMasters'
import { computeBudgetTierLabels } from '@/modules/itinerary/studio'
import { cn } from '@/lib/utils'

function leadName(lead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ')
}

// A booked/completed lead is a closed deal — its itinerary is done, so it
// never shows up again as a client to build a new one for.
const CLOSED_LEAD_STATUSES = ['booked', 'completed']

const DESTINATION_FALLBACK = [
  'Kashmir', 'Kerala', 'Goa', 'Rajasthan', 'Dubai', 'Thailand', 'Bali',
]

export default function StepDetails({ form, update }) {
  const isCustom = form.duration === 'custom'
  const [leads, setLeads] = useState([])
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [leadPopoverOpen, setLeadPopoverOpen] = useState(false)
  const { options: destinationOptions } = useMasters('destination', DESTINATION_FALLBACK)
  // Was reading a hardcoded 5-item list (lib/data/masterRepository.js)
  // instead of the live master — anything the owner added/renamed in
  // Settings → Package Categories (STANDARD, BUDGET, DELUXE, …) never showed
  // up here, no matter how many were added.
  const { options: packageCategoryOptions } = useMasters('package_category', PACKAGE_CATEGORIES)

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch('/api/leads?limit=200', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) =>
        setLeads((d.leads || []).filter((l) => !CLOSED_LEAD_STATUSES.includes(l.status)))
      )
      .catch(() => {})
      .finally(() => setLeadsLoading(false))
  }, [])

  const query = (form.customerName || '').trim().toLowerCase()
  const filteredLeads = query ? leads.filter((l) => leadName(l).toLowerCase().includes(query)) : leads

  const selectLead = (lead) => {
    update({ customerName: leadName(lead), leadId: String(lead._id) })
    setLeadPopoverOpen(false)
  }

  // Picking a second category turns on the Hotels step's "Multiple budget
  // options" automatically — the two categories become the High/Low tier
  // names (more premium one is High) instead of the generic labels. Picking
  // back down to one turns tiers off again.
  const toggleCategory = (label) => {
    const current = form.packageCategories || []
    const isSelected = current.includes(label)
    let next
    if (isSelected) {
      next = current.filter((c) => c !== label)
    } else if (current.length >= 2) {
      next = [current[1], label] // drop the oldest pick, keep the most recent + this one
    } else {
      next = [...current, label]
    }
    if (next.length === 0) return // always keep at least one category picked
    update({
      packageCategories: next,
      packageCategory: next.join(' & '),
      budgetTiers: next.length === 2,
      budgetTierLabels: computeBudgetTierLabels(next, packageCategoryOptions),
    })
  }

  const applyDuration = (value) => {
    if (value !== 'custom') {
      const preset = DURATION_PRESETS.find((p) => p.value === value)
      if (preset?.nights != null && form.startDate) {
        const start = new Date(form.startDate)
        const end = new Date(start)
        end.setDate(end.getDate() + preset.days - 1)
        update({
          duration: value,
          endDate: end.toISOString().slice(0, 10),
        })
        return
      }
    }
    update({ duration: value })
  }

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 bg-linear-to-r from-primary/10 to-transparent">
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-1.5 rounded-full bg-primary" />
          <CardTitle>Trip details</CardTitle>
        </div>
        {form.leadId && (
          <Badge className="w-fit bg-accent-secondary/15 text-accent-secondary hover:bg-accent-secondary/15">
            Linked to lead
          </Badge>
        )}
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-row items-center gap-2 sm:gap-3">
          <Label className="flex w-20 shrink-0 items-center gap-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-accent-secondary sm:w-36 sm:gap-1.5 sm:text-xs">
            <User className="h-3.5 w-3.5" /> Client name *
          </Label>
          <div className="min-w-0 flex-1">
            <Popover open={leadPopoverOpen} onOpenChange={setLeadPopoverOpen}>
              <PopoverAnchor asChild>
                <Input
                  placeholder="Search and select a client…"
                  value={form.customerName}
                  onChange={(e) => {
                    // Typing only filters the dropdown — it doesn't count as
                    // picking a client, so clear leadId until an actual
                    // CommandItem is selected. Continue is blocked without one.
                    update({ customerName: e.target.value, leadId: '' })
                    setLeadPopoverOpen(true)
                  }}
                  onFocus={() => setLeadPopoverOpen(true)}
                  onBlur={() => {
                    if (!form.leadId) {
                      setTimeout(() => update({ customerName: '' }), 150)
                    }
                  }}
                  className="rounded-xl"
                />
              </PopoverAnchor>
              <PopoverContent
                className="w-(--radix-popover-anchor-width) p-0"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <Command shouldFilter={false}>
                  <CommandList>
                    <CommandEmpty>
                      {leadsLoading ? 'Loading leads…' : leads.length === 0 ? 'No leads found.' : 'No matching leads.'}
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredLeads.map((lead) => (
                        <CommandItem
                          key={lead._id}
                          value={lead._id}
                          onSelect={() => selectLead(lead)}
                        >
                          {leadName(lead)}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="flex flex-row items-center gap-2 sm:gap-3">
          <Label className="flex w-20 shrink-0 items-center gap-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-accent-secondary sm:w-36 sm:gap-1.5 sm:text-xs">
            <MapPinned className="h-3.5 w-3.5" /> Destination *
          </Label>
          <Select value={form.destination} onValueChange={(v) => update({ destination: v })}>
            <SelectTrigger className="min-w-0 w-full flex-1 rounded-xl">
              <SelectValue placeholder="Select destination" />
            </SelectTrigger>
            <SelectContent>
              {destinationOptions.map((d) => (
                <SelectItem key={d.key} value={d.label}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:gap-3 md:col-span-2 md:flex-row md:items-start">
          <Label className="flex w-20 shrink-0 items-center gap-1 pt-2 text-[10px] font-bold uppercase leading-tight tracking-wide text-accent-secondary sm:w-36 sm:gap-1.5 sm:text-xs">
            <Award className="h-3.5 w-3.5" /> Package category *
          </Label>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              {packageCategoryOptions.map((c) => {
                const isSelected = (form.packageCategories || []).includes(c.label)
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleCategory(c.label)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition-all',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                        : 'border-border/70 bg-muted/40 text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary'
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                    {c.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {(form.packageCategories || []).length === 2 ? (
                <>
                  Two picked — this itinerary will offer both a{' '}
                  <span className="font-medium text-foreground">{form.budgetTierLabels?.high}</span> and a{' '}
                  <span className="font-medium text-foreground">{form.budgetTierLabels?.low}</span> package.
                </>
              ) : (
                'Pick a second one to build two budget options (High/Low) for this client to choose from.'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-row items-center gap-2 sm:gap-3">
          <Label className="flex w-20 shrink-0 items-center gap-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-accent-secondary sm:w-36 sm:gap-1.5 sm:text-xs">
            <CalendarRange className="h-3.5 w-3.5" /> Duration *
          </Label>
          <div className="min-w-0 flex-1">
            <Select value={form.duration} onValueChange={applyDuration}>
              <SelectTrigger className="w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <span className="flex items-center gap-2">
                      {p.label}
                      {p.value === 'custom' && <Pencil className="h-3 w-3 text-muted-foreground" />}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isCustom && (
              <Input
                placeholder="e.g. 10N / 11D"
                value={form.customDuration}
                onChange={(e) => update({ customDuration: e.target.value })}
                className="mt-2 rounded-xl"
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
