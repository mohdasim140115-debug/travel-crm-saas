'use client'

import { useEffect, useRef } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useMasters } from '@/hooks/useMasters'

// Merge the Settings catalog into the list as soon as it loads, so agents see
// the owner's configured items without an extra click — alongside anything
// already there (e.g. an activity name auto-added from the Costing step),
// not instead of it. Guarded to run once per mount so it never fights a
// deliberate clear-all, and never duplicates an item already present.
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

function ListSection({ title, items, onChange, defaults, loading }) {
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
            placeholder={`Add ${title.toLowerCase()}...`}
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

export default function StepInclusions({ form, update }) {
  const { options: inclusionOptions, loading: inclusionLoading } = useMasters('inclusion')
  const { options: exclusionOptions, loading: exclusionLoading } = useMasters('exclusion')
  const { options: supplementOptions, loading: supplementLoading } = useMasters('supplement')

  useAutoFillFromMaster(form.inclusions || [], inclusionOptions, (v) => update({ inclusions: v }))
  useAutoFillFromMaster(form.exclusions || [], exclusionOptions, (v) => update({ exclusions: v }))
  useAutoFillFromMaster(form.supplements || [], supplementOptions, (v) => update({ supplements: v }))

  return (
    <div className="space-y-6">
      <ListSection
        title="Inclusions"
        items={form.inclusions || []}
        onChange={(v) => update({ inclusions: v })}
        defaults={inclusionOptions.map((o) => o.label)}
        loading={inclusionLoading}
      />
      <ListSection
        title="Exclusions"
        items={form.exclusions || []}
        onChange={(v) => update({ exclusions: v })}
        defaults={exclusionOptions.map((o) => o.label)}
        loading={exclusionLoading}
      />
      <ListSection
        title="Supplements"
        items={form.supplements || []}
        onChange={(v) => update({ supplements: v })}
        defaults={supplementOptions.map((o) => o.label)}
        loading={supplementLoading}
      />
    </div>
  )
}
