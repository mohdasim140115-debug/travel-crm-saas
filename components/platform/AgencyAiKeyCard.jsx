'use client'

import { useState } from 'react'
import { Sparkles, Loader2, KeyRound, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { saFetch, formatDate } from '@/lib/superadmin-client'

/**
 * AI Itinerary Builder — bring-your-own-key. The agency gives its own
 * Anthropic API key; the super admin saves it here. AI usage then bills to
 * the agency's Anthropic account. The key is verified on save, stored
 * encrypted, and never shown back (only its last 4 characters).
 */
export function AgencyAiKeyCard({ agencyId, ai, onChange }) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const enabled = Boolean(ai?.enabled)

  const save = async () => {
    if (!apiKey.trim()) {
      toast.error('Paste the agency’s Anthropic API key first')
      return
    }
    setSaving(true)
    try {
      await saFetch(`/api/superadmin/agencies/${agencyId}/ai-key`, { method: 'PUT', body: { apiKey: apiKey.trim() } })
      toast.success('AI key verified and saved — AI Itinerary Builder is on for this agency')
      setApiKey('')
      onChange?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm('Remove this agency’s AI key? The AI Itinerary Builder will turn off for them.')) return
    setRemoving(true)
    try {
      await saFetch(`/api/superadmin/agencies/${agencyId}/ai-key`, { method: 'DELETE' })
      toast.success('AI key removed')
      onChange?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Itinerary Builder
          {enabled ? (
            <Badge className="bg-success text-white hover:bg-success">On</Badge>
          ) : (
            <Badge variant="outline">Off</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Uses the agency’s own Anthropic API key — AI usage is billed to their Anthropic account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {enabled && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-secondary/40 p-3">
            <div className="flex items-center gap-2 text-sm">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono">sk-ant-…{ai.keyLast4}</span>
              {ai.keySavedAt && (
                <span className="text-xs text-muted-foreground">saved {formatDate(ai.keySavedAt)}</span>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={remove} disabled={removing} className="gap-1.5 text-destructive">
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Remove
            </Button>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>{enabled ? 'Replace API key' : 'Anthropic API key'}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <PasswordInput
                autoComplete="new-password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="font-mono"
              />
            </div>
            <Button onClick={save} disabled={saving} className="shrink-0 gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify &amp; save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The key is checked with Anthropic before saving and stored encrypted. It is never shown again.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
