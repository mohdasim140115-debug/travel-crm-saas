'use client'

import { useEffect, useRef } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useMasters } from '@/hooks/useMasters'

// Merge the Settings catalog into the list as soon as it loads, alongside
// anything already there — not instead of it. Guarded to run once per mount.
function useAutoFillFromMaster(items, options, onChange) {
  const filled = useRef(false)
  useEffect(() => {
    if (filled.current) return
    if (!options.length) return
    filled.current = true
    const catalogLabels = options.map((o) => o.label)
    const extras = items.filter((i) => !catalogLabels.includes(i))
    onChange([...catalogLabels, ...extras])
  }, [items, options, onChange])
}

function PolicySection({ title, items, onChange, placeholder, defaults, loading }) {
  const inputRef = useRef(null)
  // The "+" button used to add a blank row regardless of what was typed —
  // it now reads the same input Enter already worked from.
  const add = () => {
    const val = inputRef.current?.value.trim()
    if (!val) return
    onChange([...items, val])
    inputRef.current.value = ''
  }
  const update = (i, val) => onChange(items.map((x, idx) => (idx === i ? val : x)))
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pb-4 sm:px-6">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(defaults)}>
          Load defaults
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                onChange([...items, e.currentTarget.value.trim()])
                e.currentTarget.value = ''
              }
            }}
          />
          <Button type="button" size="icon" variant="secondary" onClick={add} className="shrink-0">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {loading && items.length === 0 && (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-1">
              <Textarea
                rows={1}
                value={item}
                onChange={(e) => update(i, e.target.value)}
                className="min-h-9 resize-none py-1.5 text-sm leading-snug"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)} className="h-9 w-9 shrink-0 px-0 text-lg text-destructive" aria-label="Remove">
                ×
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function StepTerms({ form, update }) {
  const { options: termOptions, loading: termLoading } = useMasters('term')
  const { options: cancellationOptions, loading: cancellationLoading } = useMasters('cancellation_policy')

  const termsList = (form.termsAndConditions || '').split('\n').filter(Boolean)

  const setTermsList = (list) => {
    update({ termsAndConditions: list.join('\n') })
  }

  useAutoFillFromMaster(termsList, termOptions, setTermsList)
  useAutoFillFromMaster(form.cancellationPolicy || [], cancellationOptions, (v) => update({ cancellationPolicy: v }))

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <PolicySection
        title="Terms & conditions"
        items={termsList}
        onChange={setTermsList}
        placeholder="Add a term..."
        defaults={termOptions.map((o) => o.label)}
        loading={termLoading}
      />
      <PolicySection
        title="Cancellation policy"
        items={form.cancellationPolicy || []}
        onChange={(v) => update({ cancellationPolicy: v })}
        placeholder="Add cancellation rule..."
        defaults={cancellationOptions.map((o) => o.label)}
        loading={cancellationLoading}
      />
    </div>
  )
}
