'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Plus,
  MapPin,
  Clock,
  LayoutTemplate,
  Loader2,
  Trash2,
  Search,
  ChevronsUpDown,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Upload,
  X,
  Bold,
  Calendar as CalendarIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { toCompressedDataUrl } from '@/lib/imageCompress'
import { DEFAULT_DAY } from '@/modules/itinerary/constants'
import { PDF_THEME_OPTIONS } from '@/modules/itinerary/pdfThemes'

const TODAY_START = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})()

// --- Rich-text <-> marker-string conversion for the day description -------
// A plain <textarea> can't render inline bold/color, so the description is
// edited in a contentEditable div instead — these convert between its HTML
// and the same **text** / **{#rrggbb}text** marker string the PDF and the
// public preview page already parse.
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function markersToHtml(text) {
  const raw = String(text || '')
  const regex = /\*\*(?:\{(#[0-9a-fA-F]{6})\})?(.+?)\*\*/g
  let html = ''
  let last = 0
  let m
  while ((m = regex.exec(raw))) {
    if (m.index > last) html += escapeHtml(raw.slice(last, m.index))
    const inner = escapeHtml(m[2])
    html += m[1] ? `<strong style="color:${m[1]}">${inner}</strong>` : `<strong>${inner}</strong>`
    last = m.index + m[0].length
  }
  if (last < raw.length) html += escapeHtml(raw.slice(last))
  return html.replace(/\n/g, '<br>')
}

// Browsers normalize an inline `style="color:#rrggbb"` to `rgb(r, g, b)`
// when read back via element.style.color — this converts it back to hex so
// the stored marker matches what the color picker produced.
function rgbToHex(colorStr) {
  if (!colorStr) return null
  if (colorStr.startsWith('#')) return colorStr
  const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return null
  return `#${m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`
}

function htmlToMarkers(root) {
  let out = ''
  const walk = (n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out += n.textContent
      return
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const tag = n.tagName.toLowerCase()
    if (tag === 'br') {
      out += '\n'
      return
    }
    if (tag === 'strong' || tag === 'b') {
      const inner = n.textContent
      if (!inner) return
      const hex = rgbToHex(n.style?.color)
      out += hex ? `**{${hex}}${inner}**` : `**${inner}**`
      return
    }
    if (tag === 'div' || tag === 'p') {
      if (out.length > 0 && !out.endsWith('\n')) out += '\n'
      n.childNodes.forEach(walk)
      return
    }
    n.childNodes.forEach(walk)
  }
  root.childNodes.forEach(walk)
  return out
}

export default function StepPlan({ form, update, showErrors = false }) {
  const days = form.days || []
  const theme = form.pdfTheme || 'classic'
  // Ocean Blue and Emerald Luxury both show a per-day photo in their
  // day-wise timeline — Classic Red doesn't.
  const supportsDayImages = theme === 'ocean' || theme === 'emerald'
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState({})
  const [datePopoverOpen, setDatePopoverOpen] = useState({})
  const [gallery, setGallery] = useState([])
  const [imagePopoverOpen, setImagePopoverOpen] = useState({})
  const [uploadingIndex, setUploadingIndex] = useState(null)
  const [boldPopoverOpen, setBoldPopoverOpen] = useState({})
  // Phone only: a long day description is clamped to ~5 lines with a
  // "See more" toggle. descLong = it is taller than the clamp; expanded = the
  // user opened it (focusing it to edit also opens it).
  const [descExpanded, setDescExpanded] = useState({})
  const [descLong, setDescLong] = useState({})
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 640) return
    setDescLong((prev) => {
      let next = prev
      Object.entries(descriptionRefs.current).forEach(([i, el]) => {
        if (!el || descExpanded[i]) return
        const long = el.scrollHeight > el.clientHeight + 2
        if (Boolean(prev[i]) !== long) next = { ...next, [i]: long }
      })
      return next
    })
  })
  const fileInputRefs = useRef({})
  const customColorRefs = useRef({})
  const descriptionRefs = useRef({})
  // The selection inside a contentEditable can be cleared the moment focus
  // moves to the Bold popover/color picker — this holds on to the last
  // real (non-collapsed) selection made inside the editor so Bold/Remove
  // still have something to act on.
  const savedRangeRef = useRef({})
  // What each editor's DOM currently reflects — lets the sync effect below
  // tell "the user is still typing" (skip re-render) apart from "this day's
  // description changed from elsewhere" (re-render from the marker string).
  const lastSyncedRef = useRef({})

  // Keeps each day's contentEditable in sync with form.days — but only
  // rewrites the DOM (which would otherwise reset the cursor) when the
  // description changed from somewhere other than the editor's own typing
  // (a template pick, a Bold/Remove action, or the day list itself
  // reordering) — its own onInput already updated lastSyncedRef.
  useEffect(() => {
    days.forEach((day, index) => {
      const el = descriptionRefs.current[index]
      if (!el) return
      const text = day.description || ''
      if (lastSyncedRef.current[index] === text) return
      el.innerHTML = markersToHtml(text)
      lastSyncedRef.current[index] = text
    })
  }, [days])

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch('/api/settings/day-plan-templates', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => {})
      .finally(() => setTemplatesLoading(false))
  }, [])

  // Only fetched when Ocean Blue or Emerald Luxury is the active design —
  // those are the themes whose day-wise timeline shows a per-day photo.
  useEffect(() => {
    if (!supportsDayImages || gallery.length) return
    const token = localStorage.getItem('token')
    fetch('/api/gallery', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setGallery(d.gallery || []))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportsDayImages])

  const updateDay = (index, patch) => {
    let next = days.map((d, i) => (i === index ? { ...d, ...patch } : d))

    // Setting a day's date cascades forward — each later day auto-fills to
    // the next consecutive date, so only Day 1's date needs to be picked.
    if (patch.date) {
      const base = new Date(patch.date)
      if (!Number.isNaN(base.getTime())) {
        next = next.map((d, i) => {
          if (i <= index) return d
          const dt = new Date(base)
          dt.setDate(dt.getDate() + (i - index))
          return { ...d, date: dt.toISOString().slice(0, 10) }
        })
      }
    }

    update({ days: next })
  }

  // The selection is saved on every mouseup/keyup inside the editor (see
  // the contentEditable's handlers below) — focus moving to the Bold
  // popover/color input can otherwise clear window.getSelection() before
  // the click handler here even runs.
  const saveSelection = (index) => {
    const el = descriptionRefs.current[index]
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    if (!el.contains(range.commonAncestorContainer)) return
    savedRangeRef.current[index] = range.cloneRange()
  }

  // Re-reads the editor's DOM into the marker string and pushes it to
  // form.days — used after any DOM-manipulating action (bold/unbold) below.
  const commitDescriptionFromDom = (index) => {
    const el = descriptionRefs.current[index]
    if (!el) return
    const text = htmlToMarkers(el)
    lastSyncedRef.current[index] = text
    updateDay(index, { description: text })
  }

  // Wraps the saved selection in a <strong>, colored if `color` is given —
  // the PDF and the public preview page both parse the resulting
  // **text**/**{#rrggbb}text** marker the same way. Re-bolding an existing
  // bold span just changes its color instead of nesting a second <strong>.
  const applyBold = (index, color) => {
    const el = descriptionRefs.current[index]
    const range = savedRangeRef.current[index]
    if (!el || !range) {
      toast.info('Select the text you want to bold first')
      return
    }
    el.focus()
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)

    const existingStrong =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer.closest?.('strong')
        : range.startContainer.parentElement?.closest('strong')
    let strong
    if (existingStrong && el.contains(existingStrong) && existingStrong.textContent === range.toString()) {
      strong = existingStrong
    } else {
      strong = document.createElement('strong')
      strong.appendChild(range.extractContents())
      range.insertNode(strong)
    }
    strong.style.color = color || ''

    const newRange = document.createRange()
    newRange.selectNodeContents(strong)
    sel.removeAllRanges()
    sel.addRange(newRange)
    savedRangeRef.current[index] = newRange.cloneRange()

    commitDescriptionFromDom(index)
  }

  // Unwraps the <strong> the saved selection sits inside (if any).
  const removeBold = (index) => {
    const el = descriptionRefs.current[index]
    const range = savedRangeRef.current[index]
    if (!el || !range) {
      toast.info('Select the text you want to un-bold first')
      return
    }
    const node = range.startContainer
    const strong = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('strong')
    if (!strong || !el.contains(strong)) {
      toast.info('That selection isn’t bold')
      return
    }
    const parent = strong.parentNode
    while (strong.firstChild) parent.insertBefore(strong.firstChild, strong)
    parent.removeChild(strong)

    commitDescriptionFromDom(index)
  }

  const addDay = () => {
    const n = days.length + 1
    update({
      days: [
        ...days,
        {
          ...DEFAULT_DAY,
          dayNumber: n,
          sortOrder: days.length,
          title: `Day ${n}`,
        },
      ],
    })
  }

  const removeDay = (index) => {
    if (days.length <= 1) return
    const next = days
      .filter((_, i) => i !== index)
      .map((d, i) => ({ ...d, dayNumber: i + 1, sortOrder: i }))
    update({ days: next })
  }

  const setDayImage = (index, url) => {
    updateDay(index, { images: url ? [url] : [] })
    setImagePopoverOpen((s) => ({ ...s, [index]: false }))
  }

  const handleDayFilePick = async (index, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingIndex(index)
    try {
      const dataUrl = await toCompressedDataUrl(file, 300 * 1024)
      setDayImage(index, dataUrl)
    } catch {
      toast.error('Could not process that image')
    } finally {
      setUploadingIndex(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Day-wise plan</h2>
          <p className="hidden text-sm text-muted-foreground sm:block">Build your itinerary timeline day by day</p>
        </div>
        <Button type="button" onClick={addDay} size="sm" className="h-9 shrink-0 gap-1 px-3 shadow-sm sm:px-4">
          <Plus className="h-4 w-4" />
          <span className="sm:hidden">Day</span>
          <span className="hidden sm:inline">Add day</span>
        </Button>
      </div>

      {/* Design theme — Ocean Blue's day-wise timeline shows a photo beside
       * every day, so it needs picking before that option can appear. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
        <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Design theme:
        </span>
        {PDF_THEME_OPTIONS.filter((t) => t.available).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => update({ pdfTheme: t.id })}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              theme === t.id
                ? 'border-transparent text-white'
                : 'border-border/60 text-muted-foreground hover:border-border'
            )}
            style={theme === t.id ? { backgroundColor: t.primary } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {days.map((day, index) => {
        // Highlighted red the moment Continue was blocked on a blank day —
        // clears itself live as soon as that field is typed into.
        const titleMissing = showErrors && !day.title?.trim()
        const descriptionMissing = showErrors && !day.description?.trim()
        return (
        <Card
          key={index}
          className="overflow-hidden rounded-2xl border-border/60 shadow-[0_10px_30px_-15px_rgba(11,28,45,0.35)]"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-border/60 bg-linear-to-r from-primary/10 to-transparent pb-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <Badge className="shrink-0 bg-primary text-white hover:bg-primary">Day {day.dayNumber}</Badge>
              <CardTitle className="truncate text-sm font-medium sm:text-base">
                {day.title || `Day ${day.dayNumber}`}
              </CardTitle>
            </div>
            {days.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeDay(index)}
                className="shrink-0 text-destructive"
              >
                Remove
              </Button>
            )}
          </CardHeader>
          <CardContent className={supportsDayImages ? 'sm:grid sm:grid-cols-[1fr_190px] sm:items-start sm:gap-5' : undefined}>
            <div className="space-y-5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
                  <LayoutTemplate className="h-3.5 w-3.5" /> Search Templates:
                </Label>
                <button
                  type="button"
                  onClick={() =>
                    updateDay(index, { title: '', distance: '', travelDuration: '', description: '' })
                  }
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-destructive"
                  title="Clear day fields"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </button>
              </div>
              <Popover
                open={!!templatePopoverOpen[index]}
                onOpenChange={(open) => setTemplatePopoverOpen((s) => ({ ...s, [index]: open }))}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between rounded-xl font-normal text-muted-foreground"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Search className="h-4 w-4 shrink-0" />
                      Type to search templates...
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Type to search templates..." />
                    <CommandList>
                      <CommandEmpty>
                        {templatesLoading
                          ? 'Loading templates…'
                          : templates.length === 0
                            ? 'No templates saved yet — add some under Settings → Day Plan Templates.'
                            : 'No templates found.'}
                      </CommandEmpty>
                      <CommandGroup>
                        {templates.map((t) => (
                          <CommandItem
                            key={t._id}
                            value={t.title}
                            onSelect={() => {
                              updateDay(index, {
                                title: t.title,
                                distance: t.distance || '',
                                travelDuration: t.duration || '',
                                description: t.description || '',
                              })
                              setTemplatePopoverOpen((s) => ({ ...s, [index]: false }))
                            }}
                          >
                            {t.title}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wide text-primary">
                  Activity Title
                </Label>
                <Input
                  value={day.title}
                  onChange={(e) => updateDay(index, { title: e.target.value })}
                  placeholder="e.g. Arrival in Srinagar"
                  className={cn(
                    'text-lg font-extrabold uppercase tracking-wide text-foreground focus-visible:border-primary',
                    titleMissing && 'border-destructive focus-visible:border-destructive'
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wide text-accent-secondary">
                  Schedule Date
                </Label>
                <Popover
                  open={!!datePopoverOpen[index]}
                  onOpenChange={(open) => setDatePopoverOpen((s) => ({ ...s, [index]: open }))}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-10 w-full items-center gap-2 rounded-full border border-accent-secondary/30 bg-accent-secondary/10 px-4 text-left text-sm font-bold text-accent-secondary sm:w-40"
                    >
                      <CalendarIcon className="h-4 w-4 shrink-0" />
                      {day.date ? format(new Date(String(day.date).slice(0, 10)), 'dd MMM yyyy') : 'Select date'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={day.date ? new Date(String(day.date).slice(0, 10)) : undefined}
                      onSelect={(date) => {
                        if (!date) return
                        updateDay(index, { date: format(date, 'yyyy-MM-dd') })
                        setDatePopoverOpen((s) => ({ ...s, [index]: false }))
                      }}
                      disabled={{ before: TODAY_START }}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wide text-primary">Distance (km)</Label>
                <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="e.g. 120"
                  value={day.distance || ''}
                  onChange={(e) => updateDay(index, { distance: e.target.value.replace(/[^0-9]/g, '') })}
                  className="rounded-full pl-10"
                  inputMode="numeric"
                />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wide text-primary">Travel time (hrs)</Label>
                <div className="relative">
                <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="e.g. 3.5"
                  value={day.travelDuration || ''}
                  onChange={(e) => updateDay(index, { travelDuration: e.target.value.replace(/[^0-9.]/g, '') })}
                  className="rounded-full pl-10"
                  inputMode="decimal"
                />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wide text-primary">Description</Label>
                <Popover
                  open={!!boldPopoverOpen[index]}
                  onOpenChange={(open) => setBoldPopoverOpen((s) => ({ ...s, [index]: open }))}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      title="Bold the selected text"
                    >
                      <Bold className="h-3.5 w-3.5" />
                      Bold
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3" align="end">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Bold color</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        title="Bold (no color)"
                        onClick={() => {
                          applyBold(index, null)
                          setBoldPopoverOpen((s) => ({ ...s, [index]: false }))
                        }}
                        className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-semibold transition-colors hover:border-primary"
                      >
                        <Bold className="h-3.5 w-3.5" />
                        Default
                      </button>
                      <button
                        type="button"
                        title="Custom color"
                        onClick={() => customColorRefs.current[index]?.click()}
                        className="h-9 w-9 shrink-0 rounded-full border-2 border-dashed border-border transition-colors hover:border-primary"
                        style={{
                          background:
                            'conic-gradient(from 0deg, red, yellow, lime, cyan, blue, magenta, red)',
                        }}
                      />
                      <input
                        ref={(el) => {
                          customColorRefs.current[index] = el
                        }}
                        type="color"
                        className="sr-only"
                        onChange={(e) => {
                          applyBold(index, e.target.value)
                          setBoldPopoverOpen((s) => ({ ...s, [index]: false }))
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full gap-1 text-xs"
                      onClick={() => {
                        removeBold(index)
                        setBoldPopoverOpen((s) => ({ ...s, [index]: false }))
                      }}
                    >
                      <X className="h-3 w-3" />
                      Remove bold
                    </Button>
                  </PopoverContent>
                </Popover>
              </div>
              {/* A contentEditable, not a <textarea> — a plain textarea has
               * no way to render the inline bold/color the Bold button
               * applies. Its content is kept in form.days as the same
               * marker string (bold text wrapped in double asterisks, with
               * an optional {#hex} color prefix) via the sync effect and
               * commitDescriptionFromDom above. */}
              <div
                ref={(el) => {
                  descriptionRefs.current[index] = el
                }}
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Describe the day's adventure, sightseeings, and highlights..."
                onInput={(e) => {
                  const text = htmlToMarkers(e.currentTarget)
                  lastSyncedRef.current[index] = text
                  updateDay(index, { description: text })
                }}
                onFocus={() => setDescExpanded((s) => (s[index] ? s : { ...s, [index]: true }))}
                onMouseUp={() => saveSelection(index)}
                onKeyUp={() => saveSelection(index)}
                className={cn(
                  !descExpanded[index] && 'max-h-[8.5rem] overflow-hidden sm:max-h-none',
                  'min-h-[110px] w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm',
                  descriptionMissing && 'border-destructive focus-visible:border-destructive'
                )}
              />
              {(descLong[index] || descExpanded[index]) && (
                <button
                  type="button"
                  onClick={() => setDescExpanded((s) => ({ ...s, [index]: !s[index] }))}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 py-2 text-sm font-semibold text-primary active:bg-primary/20 sm:hidden"
                >
                  {descExpanded[index] ? (
                    <>See less <ChevronUp className="h-4 w-4" /></>
                  ) : (
                    <>See more <ChevronDown className="h-4 w-4" /></>
                  )}
                </button>
              )}
            </div>
            </div>

            {/* Ocean Blue / Emerald Luxury only — their day-wise timelines
             * each show one photo beside/alongside the day, picked from the
             * agency's own gallery. */}
            {supportsDayImages && (
              <div className="mt-4 space-y-1.5 sm:mt-0">
                <Label className="text-xs font-bold uppercase tracking-wide text-primary">Day photo</Label>
                <Popover
                  open={!!imagePopoverOpen[index]}
                  onOpenChange={(open) => setImagePopoverOpen((s) => ({ ...s, [index]: open }))}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="relative flex aspect-square w-full max-w-[190px] items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border hover:border-primary/50"
                    >
                      {day.images?.[0] ? (
                        <>
                          <Image src={day.images[0]} alt="" fill className="object-cover" unoptimized />
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation()
                              setDayImage(index, null)
                            }}
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                            title="Remove photo"
                          >
                            <X className="h-3.5 w-3.5" />
                          </span>
                        </>
                      ) : (
                        <span className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
                          <ImagePlus className="h-5 w-5" />
                          Add photo
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3" align="start">
                    <input
                      ref={(el) => {
                        fileInputRefs.current[index] = el
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleDayFilePick(index, e)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mb-3 w-full gap-2"
                      disabled={uploadingIndex === index}
                      onClick={() => fileInputRefs.current[index]?.click()}
                    >
                      {uploadingIndex === index ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      Upload from laptop / phone
                    </Button>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Or choose from gallery</p>
                    <div className="grid grid-cols-3 gap-2">
                      {gallery.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setDayImage(index, item.url)}
                          className={cn(
                            'relative aspect-square overflow-hidden rounded-lg border-2',
                            day.images?.[0] === item.url ? 'border-primary' : 'border-transparent hover:border-border'
                          )}
                        >
                          <Image src={item.url} alt={item.label || ''} fill className="object-cover" unoptimized />
                        </button>
                      ))}
                      {gallery.length === 0 && (
                        <p className="col-span-3 text-xs text-muted-foreground">No gallery images yet.</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </CardContent>
        </Card>
      )})}
    </div>
  )
}
