'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { ImagePlus, Loader2, Upload, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toCompressedDataUrl } from '@/lib/imageCompress'

export default function StepVisuals({ form, update }) {
  const [gallery, setGallery] = useState([])
  const [galleryLoading, setGalleryLoading] = useState(true)
  const [templates, setTemplates] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const selected = form.gallery || []

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch('/api/gallery', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        const items = d.gallery || []
        setGallery(items)
        // Gallery images are covers by default — no manual selection step needed.
        if (selected.length === 0 && items.length > 0) {
          const autoSelected = items.slice(0, 4).map((item) => item.url)
          update({ gallery: autoSelected, bannerImage: autoSelected[0] || '' })
        }
      })
      .catch(() => {})
      .finally(() => setGalleryLoading(false))
    fetch('/api/settings/marketing-templates', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Separate from the fetch above so this always checks the *current* form
  // state at the moment the template list actually arrives, rather than
  // whatever form looked like when this component first mounted.
  useEffect(() => {
    if (templates.length === 0) return
    if (form.marketingTemplate || form.marketingOverview) return
    // Same as the gallery covers above — the first template from Settings is
    // applied by default rather than leaving this on "None".
    update({ marketingTemplate: templates[0]._id, marketingOverview: templates[0].description || '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates])

  const toggleImage = (url) => {
    const current = [...selected]
    const idx = current.indexOf(url)
    if (idx >= 0) {
      current.splice(idx, 1) // deselect
    } else if (current.length < 4) {
      current.push(url) // add — only while under 4
    } else {
      return // already 4 selected → ignore extra selections
    }
    update({ gallery: current, bannerImage: current[0] || '' })
  }

  const removeSelected = (url) => {
    const next = selected.filter((u) => u !== url)
    update({ gallery: next, bannerImage: next[0] || '' })
  }

  const handleFilePick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await toCompressedDataUrl(file, 400 * 1024)
      // Always keep exactly 4 covers — once full, the newest upload takes the
      // last slot instead of erroring and making the agent remove one by
      // hand first. The primary (first) cover is never bumped by this.
      const next = selected.length >= 4 ? [...selected.slice(0, 3), dataUrl] : [...selected, dataUrl]
      update({ gallery: next, bannerImage: next[0] || '' })
    } catch {
      toast.error('Could not process that image')
    } finally {
      setUploading(false)
    }
  }

  const applyTemplate = (id) => {
    if (!id) return
    if (id === 'none') {
      // Only clears which template is marked as applied — the overview text
      // itself is left as-is, since the agent may have already edited it.
      update({ marketingTemplate: '' })
      return
    }
    const template = templates.find((t) => t._id === id)
    if (!template) return
    update({
      marketingTemplate: id,
      marketingOverview: template.description || '',
    })
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Cover images</CardTitle>
          <CardDescription>
            Pick up to 4 cover photos — from your agency gallery below, or upload your own from this
            device. The first one is used as the primary cover.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFilePick}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload from laptop / phone
            </Button>
          </div>

          {selected.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Selected covers ({selected.length}/4)
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {selected.map((url, i) => (
                  <div
                    key={`${url}-${i}`}
                    className="group relative aspect-4/3 overflow-hidden rounded-xl border-2 border-primary ring-2 ring-primary/20"
                  >
                    <Image src={url} alt={`Cover ${i + 1}`} fill className="object-cover" unoptimized />
                    {i === 0 && <Badge className="absolute left-2 top-2">Primary</Badge>}
                    <button
                      type="button"
                      onClick={() => removeSelected(url)}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Or choose from your agency gallery</p>
            {(() => {
              // Already-selected photos are shown (and removable) in the
              // strip above — repeating them here too just duplicates the
              // same picture on screen twice.
              const unselectedGallery = gallery.filter((item) => !selected.includes(item.url))
              if (galleryLoading) {
                return (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading gallery…
                  </div>
                )
              }
              if (gallery.length === 0) {
                return (
                  <p className="flex items-center gap-1.5 py-4 text-sm text-muted-foreground">
                    <ImagePlus className="h-4 w-4" />
                    No agency gallery photos yet — upload one above instead.
                  </p>
                )
              }
              if (unselectedGallery.length === 0) {
                return (
                  <p className="py-4 text-sm text-muted-foreground">
                    Every gallery photo is already selected above.
                  </p>
                )
              }
              return (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {unselectedGallery.map((item) => {
                    const atMax = selected.length >= 4
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleImage(item.url)}
                        disabled={atMax}
                        title={atMax ? 'You can select only 4 images' : undefined}
                        className={cn(
                          'group relative aspect-4/3 overflow-hidden rounded-xl border-2 border-border transition-all hover:border-primary/40',
                          atMax && 'cursor-not-allowed opacity-40 hover:border-border'
                        )}
                      >
                        <Image src={item.url} alt={item.label} fill className="object-cover" unoptimized />
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Marketing overview</CardTitle>
          <CardDescription>A short welcome summary for the itinerary cover and PDF.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Label className="shrink-0">Template</Label>
            <Select value={form.marketingTemplate || 'none'} onValueChange={applyTemplate}>
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t._id} value={t._id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            placeholder="Write a welcoming summary that captures the traveler's imagination..."
            value={form.marketingOverview}
            onChange={(e) => update({ marketingOverview: e.target.value })}
            className="min-h-[140px]"
          />
        </CardContent>
      </Card>
    </div>
  )
}
