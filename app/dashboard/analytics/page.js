'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatInr } from '@/utils/crm'
import { PageHeader } from '@/components/crm/PageHeader'

const RANGES = [
  { key: '7d', label: '7 days' },
  { key: '15d', label: '15 days' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
]

function RangeTabs({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border/60 p-1">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => onChange(r.key)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            value === r.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch('/api/analytics/summary', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  // Top cards have their own range filter (default: this month).
  const [cardRange, setCardRange] = useState('month')
  const [cards, setCards] = useState(null)
  useEffect(() => {
    const token = localStorage.getItem('token')
    setCards(null)
    fetch(`/api/analytics/summary?only=cards&cardRange=${cardRange}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setCards)
      .catch(() => setCards({}))
  }, [cardRange])
  const rangeLabel = RANGES.find((r) => r.key === cardRange)?.label

  const sourceChart = (data?.bySource || []).map((row, i) => ({
    channel: row._id || `source_${i}`,
    leads: row.count,
  }))

  // Team chart has its own range filter; refetch just that series on change.
  const [agentRange, setAgentRange] = useState('all')
  const [agentRows, setAgentRows] = useState(null)
  const [agentLoading, setAgentLoading] = useState(false)
  useEffect(() => {
    if (agentRange === 'all') {
      setAgentRows(null)
      return
    }
    const token = localStorage.getItem('token')
    setAgentLoading(true)
    fetch(`/api/analytics/summary?only=agents&agentRange=${agentRange}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setAgentRows(d.agentPerformance || []))
      .catch(() => setAgentRows([]))
      .finally(() => setAgentLoading(false))
  }, [agentRange])

  const agentChart = (agentRows ?? data?.agentPerformance ?? []).map((row) => ({
    name: row.name || 'Agent',
    bookings: row.bookings || 0,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & reports"
        description="Workspace performance and sales insights"
      />

      <div className="flex justify-end">
        <RangeTabs value={cardRange} onChange={setCardRange} />
      </div>

      <div className="!mt-3 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {[
          { label: `Leads · ${rangeLabel}`, value: cards?.leadsInRange ?? '—' },
          { label: 'Leads today', value: cards?.leadsToday ?? '—' },
          { label: `Conversion rate · ${rangeLabel}`, value: cards?.conversionRate != null ? `${cards.conversionRate}%` : '—' },
          { label: `Revenue collected · ${rangeLabel}`, value: cards?.revenueCollected != null ? formatInr(cards.revenueCollected) : '—' },
        ].map((m) => (
          <Card key={m.label} className="border-border/60 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{!cards ? '…' : m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>Leads by source</CardTitle>
            <CardDescription>Channel attribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sourceChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="channel" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="leads" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>Pipeline status</CardTitle>
            <CardDescription>Lead distribution by stage</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={(data?.statusMix || []).map((r) => ({ status: r._id, count: r.count }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="status" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {(data?.agentPerformance?.length > 0 || agentRange !== 'all') && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Team performance</CardTitle>
              <CardDescription>Bookings by agent</CardDescription>
            </div>
            <RangeTabs value={agentRange} onChange={setAgentRange} />
          </CardHeader>
          <CardContent>
            {agentLoading ? (
              <p className="flex h-65 items-center justify-center text-sm text-muted-foreground">Loading…</p>
            ) : agentChart.length === 0 ? (
              <p className="flex h-65 items-center justify-center text-sm text-muted-foreground">No bookings in this period</p>
            ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={agentChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" fontSize={11} interval={0} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="bookings" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
