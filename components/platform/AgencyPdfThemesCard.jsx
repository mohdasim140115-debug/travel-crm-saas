'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { saFetch } from '@/lib/superadmin-client'
import { PREMIUM_PDF_THEMES } from '@/modules/itinerary/pdfThemes'

/** Unlock premium itinerary PDF designs (e.g. Sunset Coral) per agency. */
export function AgencyPdfThemesCard({ agencyId, unlocked = [], onChange }) {
  const [saving, setSaving] = useState(null)
  const themes = PREMIUM_PDF_THEMES()

  const toggle = async (id, on) => {
    const next = on ? [...new Set([...unlocked, id])] : unlocked.filter((t) => t !== id)
    setSaving(id)
    try {
      await saFetch(`/api/superadmin/agencies/${agencyId}/pdf-themes`, { method: 'PUT', body: { themes: next } })
      toast.success(on ? 'Design unlocked for this agency' : 'Design locked for this agency')
      onChange?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(null)
    }
  }

  if (!themes.length) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Premium PDF designs
        </CardTitle>
        <CardDescription>Locked for every agency by default. Turn one on to let this agency export with it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {themes.map((t) => {
          const on = unlocked.includes(t.id)
          return (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="h-9 w-9 shrink-0 rounded-lg"
                  style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.secondary})` }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.description}</p>
                </div>
              </div>
              <Switch checked={on} disabled={saving === t.id} onCheckedChange={(v) => toggle(t.id, v)} />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
