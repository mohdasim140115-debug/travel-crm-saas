'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/crm/PageHeader'
import { MASTER_GROUPS, categoriesByGroup } from '@/lib/masterCategories'
import { MasterTable } from '@/components/settings/MasterTable'
import {
  Search,
  Building2,
  Compass,
  Car,
  Route,
  Megaphone,
  BadgeCheck,
  History,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  Images,
  Settings as SettingsIcon,
  CalendarClock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Only one panel is ever on screen, but eagerly importing all of them made the
 * settings route pull ~2.8k lines of manager UI (HotelManager alone is ~1k)
 * before it could paint. Loading each on demand keeps the first render to the
 * nav plus whichever panel was actually opened.
 */
const panel = (loader) => dynamic(loader, {
  loading: () => (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  ),
})

const HotelManager = panel(() =>
  import('@/components/settings/HotelManager').then((m) => m.HotelManager)
)
const ActivityManager = panel(() =>
  import('@/components/settings/ActivityManager').then((m) => m.ActivityManager)
)
const VehicleManager = panel(() =>
  import('@/components/settings/VehicleManager').then((m) => m.VehicleManager)
)
const DayPlanTemplateManager = panel(() =>
  import('@/components/settings/DayPlanTemplateManager').then((m) => m.DayPlanTemplateManager)
)
const MarketingTemplateManager = panel(() =>
  import('@/components/settings/MarketingTemplateManager').then((m) => m.MarketingTemplateManager)
)
const AuditLogViewer = panel(() =>
  import('@/components/settings/AuditLogViewer').then((m) => m.AuditLogViewer)
)
const CompanyProfile = panel(() =>
  import('@/components/settings/CompanyProfile').then((m) => m.CompanyProfile)
)
const GalleryManager = panel(() =>
  import('@/components/settings/GalleryManager').then((m) => m.GalleryManager)
)

export default function SettingsPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState('lead_status')
  const [navSearch, setNavSearch] = useState('')
  const [mobileView, setMobileView] = useState('list')
  const [subInfo, setSubInfo] = useState(null)

  useEffect(() => {
    let role
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      role = u.role
      if (!['admin', 'superadmin'].includes(u.role)) {
        router.replace('/dashboard')
        return
      }
    } catch {
      router.replace('/login')
      return
    }
    setReady(true)

    // Only the agency owner sees the subscription notice — staff they add
    // never reach /dashboard/settings at all (redirected above), but the
    // fetch itself is also gated server-side to the `admin` role.
    if (role === 'admin') {
      const token = localStorage.getItem('token')
      fetch('/api/team/subscription', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setSubInfo(d))
        .catch(() => {})
    }
  }, [router])

  const groups = useMemo(() => {
    const q = navSearch.toLowerCase()
    return MASTER_GROUPS.map((g) => {
      const categories = categoriesByGroup(g.id).filter(
        (c) => !q || c.label.toLowerCase().includes(q)
      )
      const extraItems = [
        { id: 'activities', label: 'Activity Management', icon: Compass },
        { id: 'vehicles', label: 'Vehicle Management', icon: Car },
        { id: 'day-plan-templates', label: 'Day Plan Templates', icon: Route },
        { id: 'marketing-templates', label: 'Marketing Templates', icon: Megaphone },
      ]
      const extra =
        g.id === 'travel'
          ? extraItems.filter((e) => !q || e.label.toLowerCase().includes(q))
          : []
      return { ...g, categories, extra }
    }).filter((g) => g.categories.length || g.extra.length)
  }, [navSearch])

  const activeCategory = useMemo(() => {
    for (const g of MASTER_GROUPS) {
      const found = categoriesByGroup(g.id).find((c) => c.key === active)
      if (found) return found
    }
    return null
  }, [active])

  if (!ready) return null

  const NavButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => {
        setActive(id)
        setMobileView('detail')
      }}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
        active === id ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
      )}
    >
      <span className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4" />}
        {label}
      </span>
      <ChevronRight className="h-3.5 w-3.5 opacity-60" />
    </button>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & Master Data"
        description="Owner-controlled configuration for every dropdown and master used across the CRM."
      />

      {subInfo?.subscriptionExpiresAt && (() => {
        const days = Math.ceil(
          (new Date(subInfo.subscriptionExpiresAt).getTime() - Date.now()) / 86_400_000
        )
        const expired = days < 0
        return (
          <Card
            className={cn(
              'flex items-center gap-3 border p-4',
              expired || days <= 7 ? 'border-destructive/40 bg-destructive/5' : ''
            )}
          >
            <CalendarClock
              className={cn('h-5 w-5 shrink-0', expired || days <= 7 ? 'text-destructive' : 'text-primary')}
            />
            <p className="text-sm">
              {expired ? (
                <span className="font-medium text-destructive">
                  Your subscription expired on {new Date(subInfo.subscriptionExpiresAt).toLocaleDateString('en-IN')}.
                </span>
              ) : (
                <>
                  Your subscription is valid until{' '}
                  <span className="font-medium">
                    {new Date(subInfo.subscriptionExpiresAt).toLocaleDateString('en-IN')}
                  </span>{' '}
                  <span className={days <= 7 ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                    ({days} day{days === 1 ? '' : 's'} left)
                  </span>
                </>
              )}{' '}
              — contact your platform admin to renew.
            </p>
          </Card>
        )
      })()}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
        {/* Left navigation */}
        <Card
          className={cn(
            'max-h-[calc(100vh-6rem)] flex-col p-3 lg:sticky lg:top-20 lg:flex',
            mobileView === 'detail' ? 'hidden' : 'flex'
          )}
        >
          <div className="relative mb-3 shrink-0">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search settings..."
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="scroll-hover-thin scroll-smooth space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1">
              <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Workspace
              </p>
              <NavButton id="company" label="Company Profile" icon={BadgeCheck} />
              <NavButton id="gallery" label="Itinerary Gallery" icon={Images} />
              <NavButton id="hotels" label="Hotel Management" icon={Building2} />
              <NavButton id="audit" label="Audit Logs" icon={History} />
            </div>

            {groups.map((g) => (
              <div key={g.id} className="space-y-1">
                <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </p>
                {g.extra?.map((e) => (
                  <NavButton key={e.id} id={e.id} label={e.label} icon={e.icon} />
                ))}
                {g.categories.map((c) => (
                  <NavButton key={c.key} id={c.key} label={c.label} icon={SlidersHorizontal} />
                ))}
              </div>
            ))}
          </div>
        </Card>

        {/* Right content */}
        <Card
          className={cn(
            'scroll-hover-thin scroll-smooth max-h-[calc(100vh-6rem)] min-h-[400px] overflow-y-auto p-3 max-sm:-mx-2 sm:p-5 lg:sticky lg:top-20 lg:block',
            mobileView === 'list' ? 'hidden' : 'block'
          )}
        >
          <button
            onClick={() => setMobileView('list')}
            className="mb-3 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground lg:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Settings
          </button>
          {active === 'company' ? (
            <CompanyProfile />
          ) : active === 'gallery' ? (
            <GalleryManager />
          ) : active === 'hotels' ? (
            <HotelManager />
          ) : active === 'activities' ? (
            <ActivityManager />
          ) : active === 'vehicles' ? (
            <VehicleManager />
          ) : active === 'day-plan-templates' ? (
            <DayPlanTemplateManager />
          ) : active === 'marketing-templates' ? (
            <MarketingTemplateManager />
          ) : active === 'audit' ? (
            <AuditLogViewer />
          ) : activeCategory ? (
            <MasterTable key={activeCategory.key} category={activeCategory} />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
              <SettingsIcon className="mb-2 h-8 w-8" />
              Select a category
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
