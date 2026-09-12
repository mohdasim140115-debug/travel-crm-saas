'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * A 12-hour Hour / Minute / AM-PM time picker built from our own <Select>s.
 * Replaces the native `<input type="time">` — that control renders the
 * browser/OS's own widget (a different, sometimes confusing layout per
 * platform, and one that ignores the app's light/dark theme). Every hour
 * here always has both AM and PM available, since they're just two options
 * in an ordinary dropdown rather than a native scroll-wheel.
 */
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1) // 1..12
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const pad = (n) => String(n).padStart(2, '0')

function to12Hour(h24) {
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  return { h12, period }
}

function to24Hour(h12, period) {
  const h = h12 % 12
  return period === 'PM' ? h + 12 : h
}

export function TimeSelect({ value, onChange, className = '' }) {
  const now = new Date()
  const [h24, minute] = value
    ? value.split(':').map(Number)
    : [now.getHours(), now.getMinutes()]
  const { h12, period } = to12Hour(h24)

  const emit = (nextH12, nextMinute, nextPeriod) => {
    onChange(`${pad(to24Hour(nextH12, nextPeriod))}:${pad(nextMinute)}`)
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Select value={String(h12)} onValueChange={(v) => emit(Number(v), minute, period)}>
        <SelectTrigger className="h-8 w-16" aria-label="Hour">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {HOURS.map((h) => (
            <SelectItem key={h} value={String(h)}>
              {pad(h)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select value={String(minute)} onValueChange={(v) => emit(h12, Number(v), period)}>
        <SelectTrigger className="h-8 w-16" aria-label="Minute">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {MINUTES.map((m) => (
            <SelectItem key={m} value={String(m)}>
              {pad(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={period} onValueChange={(v) => emit(h12, minute, v)}>
        <SelectTrigger className="h-8 w-20" aria-label="AM or PM">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
