'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Link from 'next/link'
import { Users, Bell, CalendarClock, Calendar, PhoneOff, Phone, TrendingUp } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

const iso = (d) => d.toISOString().slice(0, 10)

/** Presets resolve to a { from, to } date range (both inclusive, 'yyyy-mm-dd').
 * 'all' means no range — the API then returns all-time totals. */
function rangeForPreset(preset) {
  const today = new Date()
  if (preset === 'today') return { from: iso(today), to: iso(today) }
  if (preset === 'week') {
    const day = today.getDay() // 0=Sun
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((day + 6) % 7))
    return { from: iso(monday), to: iso(today) }
  }
  if (preset === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: iso(first), to: iso(today) }
  }
  return { from: '', to: '' }
}

export default function SalesDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { from, to } = preset === 'custom' ? { from: customFrom, to: customTo } : rangeForPreset(preset)

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    if (!['agent', 'manager'].includes(u.role)) {
      window.location.href = '/dashboard'
    }
  }, [])

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem('token')
      if (!token) {
        window.location.href = '/login'
        return
      }
      // Custom range with only one side picked isn't ready to query yet.
      if (preset === 'custom' && (!customFrom || !customTo)) return
      setLoading(true)
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`/api/analytics/sales?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setData(await res.json())
      setLoading(false)
    }
    load()
  }, [from, to, preset, customFrom, customTo])

  const today = data?.today || {}

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center justify-end gap-3">
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="w-[100px] shrink-0 sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground sm:text-base">
          Your leads, follow-ups, and bookings — focus on what matters today.
        </p>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-auto flex-1 sm:flex-none"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-auto flex-1 sm:flex-none"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {[
          { label: 'Total Leads', value: today.newLeads, icon: Users, href: '/dashboard/leads' },
          {
            label: 'Not Contacted Yet',
            value: today.notContacted,
            icon: PhoneOff,
            href: '/dashboard/leads?status=new',
            alert: 'warning',
          },
          {
            label: 'Pending Follow-Ups',
            value: today.pendingFollowUps,
            icon: Bell,
            href: '/dashboard/leads?followUp=pending',
            alert: 'info',
          },
          {
            label: "Today's Follow-Ups",
            value: today.todayFollowUps,
            icon: CalendarClock,
            href: '/dashboard/leads?followUp=today',
          },
          { label: 'Bookings Closed', value: today.bookingsClosed, icon: Calendar, href: '/dashboard/sales/bookings' },
        ].map((s) => {
          const Icon = s.icon
          // "Not Contacted Yet" / "Pending Follow-Ups" need to catch the eye —
          // swap the usual purple ambient glow for a warning/info-colored one
          // instead of blending in with every other stat card.
          const alertRgb = s.alert === 'warning' ? '245, 158, 11' : s.alert === 'info' ? '59, 130, 246' : null
          return (
            <Link key={s.label} href={s.href}>
              <Card
                className="h-full gap-1 py-3 transition-shadow hover:shadow-md sm:gap-3 sm:py-4"
                style={
                  alertRgb
                    ? {
                        background: `radial-gradient(circle at bottom left, rgba(${alertRgb}, 0.4) 0%, rgba(${alertRgb}, 0.14) 18%, transparent 55%), var(--card)`,
                        borderColor: `rgba(${alertRgb}, 0.4)`,
                      }
                    : undefined
                }
              >
                <CardHeader className="flex flex-col items-center gap-1 px-2 pb-0 text-center sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:pb-0 sm:text-left">
                  <Icon
                    className="order-first h-4 w-4 shrink-0 text-muted-foreground sm:order-last"
                    style={alertRgb ? { color: `rgb(${alertRgb})` } : undefined}
                  />
                  <CardTitle className="w-full truncate text-[11px] leading-tight font-medium text-muted-foreground sm:text-xs">
                    {s.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 text-center sm:px-4 sm:text-left">
                  <div className="text-lg font-bold text-accent-secondary sm:text-xl">{loading ? '—' : s.value ?? 0}</div>
                </CardContent>
              </Card>
            </Link>
          )
        })}

        <Card
          className="h-full gap-1 py-3 sm:gap-3 sm:py-4"
          style={{
            background:
              'radial-gradient(circle at bottom left, color-mix(in oklab, var(--accent-secondary) 30%, transparent) 0%, color-mix(in oklab, var(--accent-secondary) 12%, transparent) 18%, transparent 55%), var(--card)',
            borderColor: 'color-mix(in oklab, var(--accent-secondary) 35%, transparent)',
          }}
        >
          <CardHeader className="flex flex-col items-center gap-1 px-2 pb-0 text-center sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:pb-0 sm:text-left">
            <TrendingUp
              className="order-first h-4 w-4 shrink-0 text-muted-foreground sm:order-last"
              style={{ color: 'var(--accent-secondary)' }}
            />
            <CardTitle className="w-full truncate text-[11px] leading-tight font-medium text-muted-foreground sm:text-xs">
              My Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-4">
            <div className="h-8 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={(data?.monthlyBookings || []).slice(-3)}>
                  <Tooltip
                    cursor={{ stroke: 'var(--muted)' }}
                    labelFormatter={(label) => label}
                    formatter={(value) => [value, 'Bookings']}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={{ r: 2, fill: 'var(--chart-1)' }}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My Recent Leads</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/leads">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.recentLeads || []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No leads assigned yet.</p>
            ) : (
              data.recentLeads.map((lead) => (
                <Link
                  key={lead._id}
                  href={`/dashboard/leads/${lead._id}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lead.destination || lead.source} · {lead.phone}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">{lead.status || 'new'}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Due Follow-Ups
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/leads?followUp=any">Schedule</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.dueFollowUps || []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No follow-ups due soon.</p>
            ) : (
              data.dueFollowUps.map((fu) => (
                <Link
                  key={fu._id}
                  href={fu.leadId?._id ? `/dashboard/leads/${fu.leadId._id}` : '/dashboard/leads?followUp=any'}
                  className="block rounded-lg bg-muted/50 p-3 hover:bg-muted"
                >
                  <p className="truncate font-medium capitalize">
                    {fu.leadId?.firstName} {fu.leadId?.lastName} — {fu.type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(fu.scheduledDate).toLocaleString()}
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
