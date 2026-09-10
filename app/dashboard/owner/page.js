'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  Users,
  Phone,
  FileText,
  Calendar,
  DollarSign,
  TrendingUp,
  ArrowRight,
  Scale,
  Trophy,
  Bell,
  CalendarClock,
} from 'lucide-react'
import { PageHeader } from '@/components/crm/PageHeader'

function formatINR(n) {
  return `₹${(n || 0).toLocaleString('en-IN')}`
}

export default function OwnerDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem('token')
      if (!token) {
        window.location.href = '/login'
        return
      }
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      if (!['admin', 'superadmin'].includes(u.role)) {
        window.location.href = '/dashboard'
        return
      }
      const res = await fetch('/api/analytics/owner', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setData(await res.json())
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    )
  }

  const today = data?.today || {}
  const month = data?.thisMonth || {}
  const team = data?.teamPerformance || []
  const followUps = data?.followUps || {}

  return (
    <div className="space-y-8">
      <PageHeader
        title="Business Dashboard"
        description="Agency overview — leads, bookings, revenue, and team performance."
      />

      <div>
        <h2 className="mb-3 text-lg font-semibold">Today</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'New Leads', value: today.newLeads, icon: Users },
            { label: 'Contacted', value: today.contacted, icon: Phone },
            { label: 'Quotations Sent', value: today.quotationsSent, icon: FileText },
            { label: 'Bookings', value: today.bookings, icon: Calendar },
            { label: 'Revenue', value: formatINR(today.revenue), icon: DollarSign },
          ].map((s) => {
            const Icon = s.icon
            return (
              <Card key={s.label} className="gap-1 py-3 sm:gap-6 sm:py-6">
                <CardHeader className="flex flex-row items-center justify-between px-3 pb-0 sm:px-6 sm:pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">{s.label}</CardTitle>
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  <div className="text-xl font-bold text-accent-secondary sm:text-2xl">{s.value ?? 0}</div>
                </CardContent>
              </Card>
            )
          })}

          {(() => {
            const topToday = [...team]
              .filter((m) => m.bookingsToday > 0)
              .sort((a, b) => b.bookingsToday - a.bookingsToday)
              .slice(0, 3)
            return (
              <Card className="gap-1 py-3 sm:gap-6 sm:py-6">
                <CardHeader className="flex flex-row items-center justify-between px-3 pb-0 sm:px-6 sm:pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">Top Performer</CardTitle>
                  <Trophy className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  {topToday.length ? (
                    <ul className="space-y-1">
                      {topToday.map((m, i) => (
                        <li key={String(m.userId)} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">
                            <span className="text-muted-foreground">#{i + 1}</span>{' '}
                            <span className="font-medium text-accent-secondary">{m.name}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {m.bookingsToday} booking{m.bookingsToday === 1 ? '' : 's'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No bookings closed today yet.</p>
                  )}
                </CardContent>
              </Card>
            )
          })()}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Follow-ups</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[
            {
              label: "Today's follow-ups",
              value: followUps.today,
              icon: CalendarClock,
              href: '/dashboard/follow-ups?filter=today',
            },
            {
              label: 'Pending follow-ups',
              value: followUps.pending,
              icon: Bell,
              href: '/dashboard/follow-ups?filter=pending',
            },
            {
              label: 'Total follow-ups',
              value: followUps.all,
              icon: FileText,
              href: '/dashboard/follow-ups?filter=all',
            },
          ].map((s) => {
            const Icon = s.icon
            return (
              <Link key={s.label} href={s.href}>
                <Card className="gap-1 py-3 transition-shadow hover:shadow-md sm:gap-6 sm:py-6">
                  <CardHeader className="flex flex-row items-center justify-between px-3 pb-0 sm:px-6 sm:pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">{s.label}</CardTitle>
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6">
                    <div className="text-xl font-bold text-accent-secondary sm:text-2xl">{s.value ?? 0}</div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">This Month</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="gap-1 py-3 sm:gap-6 sm:py-6">
            <CardHeader className="px-3 pb-0 sm:px-6 sm:pb-2">
              <CardTitle className="text-xs text-muted-foreground sm:text-sm">Leads</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <p className="text-xl font-bold text-accent-secondary sm:text-3xl">{month.leads ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="gap-1 py-3 sm:gap-6 sm:py-6">
            <CardHeader className="px-3 pb-0 sm:px-6 sm:pb-2">
              <CardTitle className="text-xs text-muted-foreground sm:text-sm">Bookings</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <p className="text-xl font-bold text-accent-secondary sm:text-3xl">{month.bookings ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="gap-1 py-3 sm:gap-6 sm:py-6">
            <CardHeader className="px-3 pb-0 sm:px-6 sm:pb-2">
              <CardTitle className="text-xs text-muted-foreground sm:text-sm">Revenue</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <p className="text-xl font-bold text-accent-secondary sm:text-3xl">{formatINR(month.revenue)}</p>
            </CardContent>
          </Card>

          {(() => {
            const topMonth = [...team]
              .filter((m) => m.bookingsMonth > 0)
              .sort((a, b) => b.bookingsMonth - a.bookingsMonth)
              .slice(0, 3)
            return (
              <Card className="gap-1 py-3 sm:gap-6 sm:py-6">
                <CardHeader className="flex flex-row items-center justify-between px-3 pb-0 sm:px-6 sm:pb-2">
                  <CardTitle className="text-xs text-muted-foreground sm:text-sm">Top Performer</CardTitle>
                  <Trophy className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  {topMonth.length ? (
                    <ul className="space-y-1">
                      {topMonth.map((m, i) => (
                        <li key={String(m.userId)} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">
                            <span className="text-muted-foreground">#{i + 1}</span>{' '}
                            <span className="font-medium text-accent-secondary">{m.name}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {m.bookingsMonth} booking{m.bookingsMonth === 1 ? '' : 's'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No bookings closed this month yet.</p>
                  )}
                </CardContent>
              </Card>
            )
          })()}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <TrendingUp className="h-5 w-5 shrink-0" />
              <span className="truncate">Team Performance</span>
            </CardTitle>
            <CardDescription className="hidden sm:block">
              Compare sales employees — spot top performers instantly.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0 px-2 text-xs sm:px-3 sm:text-sm">
            <Link href="/dashboard/admin">
              <Scale className="mr-1 h-4 w-4 sm:mr-2" />
              Lead Weights
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {team.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No sales employees yet.</p>
          ) : (
            <>
              {/* Mobile — stacked cards instead of a cramped 6-column table. */}
              <div className="space-y-3 sm:hidden">
                {[...team]
                  .sort((a, b) => b.bookings - a.bookings)
                  .map((m) => (
                    <div key={String(m.userId)} className="rounded-lg border border-border/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium">{m.name}</p>
                        <Badge variant={m.weight === 0 ? 'destructive' : 'secondary'}>
                          {m.weight === 0 ? 'Paused' : m.weight}
                        </Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <p className="text-muted-foreground">Assigned</p>
                          <p className="font-semibold">{m.assignedLeads}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Contacted</p>
                          <p className="font-semibold">{m.contacted}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Quotes</p>
                          <p className="font-semibold">{m.quotes}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 text-sm">
                        <span className="text-muted-foreground">Bookings</span>
                        <span className="font-semibold text-success">{m.bookings}</span>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Tablet/desktop — full table. */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 pr-4">Employee</th>
                      <th className="pb-3 pr-4">Weight</th>
                      <th className="pb-3 pr-4">Assigned</th>
                      <th className="pb-3 pr-4">Contacted</th>
                      <th className="pb-3 pr-4">Quotes</th>
                      <th className="pb-3">Bookings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...team]
                      .sort((a, b) => b.bookings - a.bookings)
                      .map((m) => (
                        <tr key={String(m.userId)} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-medium">{m.name}</td>
                          <td className="py-3 pr-4">
                            <Badge variant={m.weight === 0 ? 'destructive' : 'secondary'}>
                              {m.weight === 0 ? 'Paused' : m.weight}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4">{m.assignedLeads}</td>
                          <td className="py-3 pr-4">{m.contacted}</td>
                          <td className="py-3 pr-4">{m.quotes}</td>
                          <td className="py-3 font-semibold text-success">{m.bookings}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tours Overview</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {[
              { label: 'Upcoming', value: data?.tours?.upcoming },
              { label: 'Current', value: data?.tours?.current },
              { label: 'Completed', value: data?.tours?.completed },
              { label: 'Cancelled', value: data?.tours?.cancelled },
            ].map((t) => (
              <div key={t.label} className="rounded-lg bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">{t.label}</p>
                <p className="text-2xl font-bold text-accent-secondary">{t.value ?? 0}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Finance Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Revenue (month)</span>
              <span className="font-bold">{formatINR(data?.finance?.revenueMonth)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pending payments</span>
              <span className="font-bold">{data?.finance?.pendingPayments ?? 0}</span>
            </div>
            <Button asChild className="w-full">
              <Link href="/dashboard/bookings">
                View Bookings <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
