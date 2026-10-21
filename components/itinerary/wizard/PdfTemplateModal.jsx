'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Check, ImagePlus, Loader2, Lock, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { toCompressedDataUrl } from '@/lib/imageCompress'
import { PDF_THEME_OPTIONS, isPdfThemeUsable } from '@/modules/itinerary/pdfThemes'
import { useUnlockedPdfThemes } from '@/hooks/useUnlockedPdfThemes'

/** Ocean Blue's and Emerald Luxury's day-wise timelines each show a photo
 * beside every day — picked here, right after choosing the theme, either
 * from the agency's own gallery or uploaded fresh from the device
 * (laptop/phone). Component name kept from when only Ocean had this. */
function OceanDayPhotos({ form, update }) {
  const days = form.days || []
  const [gallery, setGallery] = useState([])
  const [popoverOpen, setPopoverOpen] = useState({})
  const [uploadingIndex, setUploadingIndex] = useState(null)
  const fileInputRefs = useRef({})

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch('/api/gallery', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setGallery(d.gallery || []))
      .catch(() => {})
  }, [])

  const setDayImage = (index, url) => {
    const nextDays = days.map((d, i) => (i === index ? { ...d, images: url ? [url] : [] } : d))
    update({ days: nextDays })
    setPopoverOpen((s) => ({ ...s, [index]: false }))
  }

  const handleFilePick = async (index, e) => {
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

  if (!days.length) return null

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
      <p className="text-sm font-semibold">Add a photo for each day</p>
      <p className="text-xs text-muted-foreground">
        These show up beside the day-wise plan in the Ocean Blue design. Optional — leave any blank to skip.
      </p>
      <div className="space-y-2">
        {days.map((day, index) => (
          <div key={index} className="flex items-center gap-3 rounded-lg border border-border/50 bg-background p-2.5">
            <Popover
              open={!!popoverOpen[index]}
              onOpenChange={(open) => setPopoverOpen((s) => ({ ...s, [index]: open }))}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border hover:border-primary/50"
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
                        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white"
                        title="Remove"
                      >
                        <X className="h-2.5 w-2.5" />
                      </span>
                    </>
                  ) : (
                    <ImagePlus className="h-4 w-4 text-muted-foreground" />
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
                  onChange={(e) => handleFilePick(index, e)}
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
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                Day {day.dayNumber} — {day.title || `Day ${day.dayNumber}`}
              </p>
              <p className="text-xs text-muted-foreground">{day.images?.[0] ? 'Photo added' : 'No photo yet'}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PdfTemplateModal({ open, onOpenChange, onConfirm, generating, form, update }) {
  const unlocked = useUnlockedPdfThemes()
  const usable = (id) => isPdfThemeUsable(id, unlocked)
  const [selected, setSelected] = useState(form?.pdfTheme || 'classic')

  // Keep in sync with a theme already picked earlier (e.g. in the Day-wise
  // Plan step) each time this modal is opened — falling back to Classic if
  // that design is a premium one this agency doesn't have unlocked.
  useEffect(() => {
    if (open) setSelected(usable(form?.pdfTheme || 'classic') ? form?.pdfTheme || 'classic' : 'classic')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unlocked])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Choose a PDF design</DialogTitle>
          <DialogDescription>
            Pick the look for this itinerary&apos;s PDF. You can export with a different design any time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PDF_THEME_OPTIONS.map((t) => {
              const canUse = usable(t.id)
              const premiumLocked = t.available && t.premium && !canUse
              const active = selected === t.id && canUse
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={!canUse}
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    'relative flex flex-col overflow-hidden rounded-xl border text-left transition-all',
                    active ? 'border-transparent ring-2 ring-offset-2 ring-offset-background' : 'border-border/60 hover:border-border',
                    !canUse && 'cursor-not-allowed opacity-50'
                  )}
                  style={active ? { '--tw-ring-color': t.primary } : undefined}
                >
                  <div
                    className="h-16 w-full"
                    style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.secondary})` }}
                  />
                  <div className="space-y-0.5 p-2.5">
                    <p className="text-xs font-semibold">{t.label}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {premiumLocked ? 'Premium — ask your admin to unlock' : t.description}
                    </p>
                  </div>
                  {active && (
                    <span
                      className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-white shadow-sm"
                      style={{ backgroundColor: t.primary }}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  {!canUse && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Lock className="h-3 w-3" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Ocean Blue / Emerald Luxury only — pick a photo for each day
           * right here, before generating, so the PDF's day-wise timeline
           * has them. */}
          {(selected === 'ocean' || selected === 'emerald' || selected === 'sunset') && form && update && (
            <OceanDayPhotos form={form} update={update} />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(selected)} disabled={generating}>
            {generating ? 'Generating…' : 'Generate PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
