'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import {
  Menu,
  X,
  LogOut,
  Home,
  Users,
  Calendar,
  BarChart3,
  Settings,
  Globe,
  Bell,
  Map,
  PiggyBank,
  Shield,
  Waypoints,
  PenTool,
  FileText,
  Building2,
  Car,
  Wallet,
  Receipt,
  Building,
  UsersRound,
  PhoneCall,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { scheduleSilentRefresh, installAuthFetch, getValidToken } from '@/lib/auth-client'
import { getNavItems, ROLE_LABELS, getDashboardRoute, canAccessLeads } from '@/lib/permissions-client'
import { Toaster } from '@/components/ui/sonner'
import { ImpersonationBanner } from '@/components/crm/ImpersonationBanner'
import { NotificationBell } from '@/components/crm/NotificationBell'
import { ThemeToggle } from '@/components/crm/ThemeToggle'
import { cn } from '@/lib/utils'

export default function DashboardLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isMobile, setIsMobile] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [user, setUser] = useState(null)
  const [brands, setBrands] = useState([])
  const [brandValue, setBrandValue] = useState('all')
  const [loading, setLoading] = useState(true)
  const [navScrolling, setNavScrolling] = useState(false)
  const navScrollTimeout = useRef(null)

  // Scrolling the nav list moves items under a stationary cursor, which
  // triggers CSS :hover on whatever ends up underneath — looks like items
  // "sliding" on their own. Suppress the hover-slide effect while actively
  // scrolling; it resumes as soon as the cursor actually moves again.
  const handleNavScroll = () => {
    setNavScrolling(true)
    if (navScrollTimeout.current) clearTimeout(navScrollTimeout.current)
    navScrollTimeout.current = setTimeout(() => setNavScrolling(false), 200)
  }

  useEffect(() => {
    return () => {
      if (navScrollTimeout.current) clearTimeout(navScrollTimeout.current)
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => {
      const mobile = mq.matches
      setIsMobile(mobile)
      if (mobile) {
        setMobileNavOpen(false)
        setSidebarOpen(true)
      }
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!user || loading) return
    const allowedHrefs = getNavItems(user.role).map((m) => m.href)
    if (pathname === '/dashboard') return
    if (!canAccessLeads(user.role) && pathname.startsWith('/dashboard/leads')) {
      router.replace(getDashboardRoute(user.role))
      return
    }
    const matched = allowedHrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`))
    if (!matched && pathname.startsWith('/dashboard')) {
      router.replace(getDashboardRoute(user.role))
    }
  }, [user, pathname, loading, router])

  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileNavOpen])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    const token = localStorage.getItem('token')
    if (!userData || !token) {
      router.push('/login')
      return
    }
    try {
      setUser(JSON.parse(userData))
    } catch {
      router.push('/login')
      return
    }
    setLoading(false)

    // Installed before anything fetches so the page's very first requests are
    // already covered by pre-expiry refresh and 401-retry. Without this a tab
    // reopened after the 15m access token lapsed would fire a burst of
    // requests that all fail with "Invalid or expired token".
    const stopIntercept = installAuthFetch()
    const stopRefresh = scheduleSilentRefresh()
    return () => {
      stopRefresh()
      stopIntercept()
    }
  }, [router])

  // Keep this tab's role / active-brand in step with the DB. The silent token
  // refresh (every ~13 min, and on tab focus) rewrites localStorage['user']
  // with fresh values, but a tab that's just sitting open had already read the
  // old copy into state on mount — so an owner changing someone's role or
  // brand only showed up for that person after a manual reload / re-login.
  // Re-reading the stored user on focus and on cross-tab storage events closes
  // that gap; the nav-gating effect below then reacts to the new role.
  useEffect(() => {
    const syncUser = () => {
      try {
        const raw = localStorage.getItem('user')
        if (!raw) return
        const next = JSON.parse(raw)
        setUser((prev) => {
          if (
            prev &&
            prev.role === next.role &&
            String(prev.activeBrandId || '') === String(next.activeBrandId || '') &&
            String(prev.teamId || '') === String(next.teamId || '')
          ) {
            return prev // nothing that affects access changed — avoid a re-render
          }
          return next
        })
      } catch {
        /* leave the current user in place */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncUser()
    }
    const onStorage = (e) => {
      if (e.key === 'user') syncUser()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    async function loadBrands() {
      const u = user
      if (!u) return
      const token = await getValidToken()
      if (!token) return
      try {
        const res = await fetch('/api/brands', { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        const list = data.brands || []
        setBrands(list)
        const canViewAllBrands = u.role === 'admin' || u.role === 'superadmin'
        if (u.activeBrandId) {
          setBrandValue(String(u.activeBrandId))
        } else if (!canViewAllBrands && list.length) {
          // Non-owner staff must always be scoped to one brand — never the
          // whole workspace — so silently pin them to the first brand instead
          // of leaving activeBrandId unset (which reads as "all brands").
          onBrandChange(String(list[0]._id))
        } else {
          setBrandValue('all')
        }
      } catch {
        setBrands([])
      }
    }
    loadBrands()
  }, [user])

  const menuItems = useMemo(() => {
    if (!user?.role) return []
    const items = getNavItems(user.role)
    const icons = {
      '/dashboard/platform': Globe,
      '/dashboard/platform/demo-requests': PhoneCall,
      '/dashboard/platform/agencies': Building,
      '/dashboard/platform/users': UsersRound,
      '/dashboard/owner': Home,
      '/dashboard/sales': Home,
      '/dashboard/operations': Home,
      '/dashboard/accounts': Home,
      '/dashboard/leads': Users,
      '/dashboard/follow-ups': Bell,
      '/dashboard/itineraries': Map,
      '/dashboard/itinerary-builder': PenTool,
      '/dashboard/bookings': Waypoints,
      '/dashboard/vouchers': FileText,
      '/dashboard/invoices': Receipt,
      '/dashboard/payments': PiggyBank,
      '/dashboard/tour-calendar': Calendar,
      '/dashboard/suppliers': Building2,
      '/dashboard/drivers': Car,
      '/dashboard/finance': Wallet,
      '/dashboard/analytics': BarChart3,
      '/dashboard/admin': Shield,
      '/dashboard/settings': Settings,
    }
    return items.map((item) => ({ ...item, icon: icons[item.href] || Home }))
  }, [user])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    router.push('/login')
  }

  const onBrandChange = async (val) => {
    setBrandValue(val)
    const token = await getValidToken()
    if (!token) return
    const body = val === 'all' ? { brandId: null } : { brandId: val }
    const res = await fetch('/api/brands/active', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.user) {
      if (data.token) {
        localStorage.setItem('token', data.token)
      }
      localStorage.setItem('user', JSON.stringify(data.user))
      setUser(data.user)
      router.refresh()
    }
  }

  const showExpandedSidebar = isMobile ? true : sidebarOpen
  const currentPage = menuItems.find((m) => m.href === pathname)?.label || 'CRM'

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center safe-top safe-bottom">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </div>
    )
  }

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={`relative h-9 shrink-0 overflow-hidden ${showExpandedSidebar ? 'w-35' : 'w-9'}`}>
            <Image
              src="/logo1.png"
              alt="Travel SaaS CRM"
              fill
              className={showExpandedSidebar ? 'object-contain object-left' : 'object-cover object-left'}
              priority
            />
          </div>
          {showExpandedSidebar && (
            <div className="min-w-0">
              <p className="truncate text-xs capitalize text-sidebar-foreground/60">
                {ROLE_LABELS[user.role] || user.role}
              </p>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Close menu"
          className="rounded-lg p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
        {!isMobile && (
          <button
            type="button"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            className="rounded-lg p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav
        className="sidebar-nav-scroll flex-1 space-y-1 overflow-y-auto scroll-smooth p-3"
        onScroll={handleNavScroll}
      >
        {menuItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)}>
              <div
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 transition-all duration-200 ease-out',
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm ring-1 ring-sidebar-primary/40'
                    : !navScrolling && 'hover:translate-x-1 hover:bg-sidebar-accent hover:text-sidebar-foreground active:bg-sidebar-accent'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {showExpandedSidebar && <span className="truncate">{item.label}</span>}
              </div>
            </Link>
          )
        })}
      </nav>

      <div className="space-y-3 border-t border-sidebar-border px-4 pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}>
        {showExpandedSidebar && brands.length > 0 && (
          <div className="space-y-1">
            <label className="px-1 text-xs uppercase tracking-wide text-sidebar-foreground/50">Brand</label>
            <Select value={brandValue} onValueChange={onBrandChange}>
              <SelectTrigger className="w-full border-sidebar-border bg-sidebar-accent text-sidebar-foreground">
                <SelectValue placeholder="All brands" />
              </SelectTrigger>
              <SelectContent>
                {(user.role === 'admin' || user.role === 'superadmin') && (
                  <SelectItem value="all">All brands (workspace)</SelectItem>
                )}
                {brands.map((b) => (
                  <SelectItem key={String(b._id)} value={String(b._id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {user.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          {showExpandedSidebar && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{user.name}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{user.email}</p>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4 shrink-0" />
          {showExpandedSidebar && <span className="truncate">Logout</span>}
        </Button>
      </div>
    </>
  )

  // The sidebar is `fixed`, so it's out of normal document flow — the content
  // column needs a matching left margin (not flexbox sizing) to avoid sitting
  // underneath it. On mobile the sidebar overlays content instead of pushing
  // it, so no margin is applied there.
  const sidebarWidthClass = isMobile ? 'w-[min(100vw-3rem,18rem)]' : sidebarOpen ? 'w-64' : 'w-[72px]'
  const contentMarginClass = isMobile ? 'ml-0' : sidebarOpen ? 'ml-64' : 'ml-[72px]'

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      {isMobile && mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar transition-[width,transform] duration-300 ease-in-out',
          sidebarWidthClass,
          isMobile && (mobileNavOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full')
        )}
      >
        {sidebarContent}
      </aside>

      <div
        className={cn(
          'flex min-h-screen min-w-0 flex-col transition-[margin] duration-300 ease-in-out',
          contentMarginClass
        )}
      >
        <ImpersonationBanner />
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 safe-top sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {isMobile && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-xl">
                {currentPage}
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Travel CRM workspace
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
              <span className="rounded-full border px-2 py-1">
                Workspace: {String(user.teamId || '').slice(-6)}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto safe-bottom">
          <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 md:p-8">{children}</div>
          <Toaster richColors position="top-center" />
        </main>
      </div>
    </div>
  )
}
