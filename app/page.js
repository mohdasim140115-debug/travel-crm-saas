'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION } from '@/lib/seo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CheckCircle2,
  Users,
  Calendar,
  Zap,
  BarChart3,
  ArrowRight,
  Plane,
  Building2,
  Sparkles,
  Star,
  Loader2,
  PartyPopper,
  MessageCircle,
  Mail,
  Bell,
  Hotel,
  FileText,
  MapPin,
  ChevronDown,
  Phone,
  User as UserIcon,
  Inbox,
  Shuffle,
  BellRing,
  ListChecks,
  LineChart,
  Route,
  Calculator,
  Palette,
  Link2,
  ClipboardCheck,
  CalendarDays,
  Ticket,
  Wallet,
  Receipt,
  IndianRupee,
  BookOpen,
  Truck,
  UserCog,
  Layers,
  Settings,
  History,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/crm/ThemeToggle'

const EMPTY_DEMO = { name: '', email: '', phone: '', address: '', preferredDate: '' }

function BookDemoDialog({ open, onOpenChange }) {
  const [form, setForm] = useState(EMPTY_DEMO)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/demo-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }
      setDone(true)
      setForm(EMPTY_DEMO)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const field =
    'h-11 rounded-xl border-border/80 bg-background pl-10 shadow-none transition focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15'
  const iconCls = 'pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setDone(false)
      }}
    >
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto rounded-3xl border-border/60 p-0 sm:max-w-3xl">
        <div className="grid md:grid-cols-[0.9fr_1.1fr]">
          {/* Brand panel */}
          <div className="relative hidden overflow-hidden bg-[#010d23] p-8 text-white md:block">
            <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-violet-600/40 blur-3xl" />
            <div className="pointer-events-none absolute -right-20 -bottom-24 h-64 w-64 rounded-full bg-accent-secondary/20 blur-3xl" />
            <div className="relative flex h-full flex-col">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
                <Sparkles className="h-3.5 w-3.5 text-accent-secondary" /> Free personalised demo
              </span>
              <h3 className="mt-5 text-2xl leading-tight font-bold">
                See TravDX run{' '}
                <span className="bg-linear-to-r from-accent-secondary to-cyan-300 bg-clip-text text-transparent">
                  your agency
                </span>
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                A live walkthrough built around how your team sells, plans and books trips.
              </p>
              <ul className="mt-7 space-y-4">
                {[
                  'Full CRM walkthrough — leads to invoices',
                  'We set up your workspace for you',
                  'Get answers from our team, no commitment',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-white/85">
                    <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-accent-secondary" />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-10">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-accent-secondary text-accent-secondary" />
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/70">
                    Trusted by 1000+ travel agencies across India.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="p-6 sm:p-8">
            {done ? (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-secondary/15">
                  <PartyPopper className="h-8 w-8 text-accent-secondary" />
                </div>
                <h3 className="mt-5 text-xl font-semibold">Thanks — request received!</h3>
                <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                  Our team will reach out shortly to set up your workspace and walk you through a demo.
                </p>
                <Button className="mt-7 h-11 w-full rounded-xl" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            ) : (
              <>
                <DialogHeader className="text-left">
                  <DialogTitle className="text-2xl font-bold tracking-tight">Book a demo</DialogTitle>
                  <DialogDescription>
                    Share a few details and our team will get in touch with you.
                  </DialogDescription>
                </DialogHeader>
                <form className="mt-6 space-y-4" onSubmit={submit}>
                  {error && (
                    <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Full name *</Label>
                    <div className="relative">
                      <UserIcon className={iconCls} />
                      <Input
                        required
                        placeholder="Your name"
                        className={field}
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-[13px]">Email *</Label>
                      <div className="relative">
                        <Mail className={iconCls} />
                        <Input
                          type="email"
                          required
                          placeholder="you@agency.com"
                          className={field}
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[13px]">Phone *</Label>
                      <div className="relative">
                        <Phone className={iconCls} />
                        <Input
                          type="tel"
                          required
                          placeholder="+91 98765 43210"
                          className={field}
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Address</Label>
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-muted-foreground" />
                      <Textarea
                        placeholder="City, state"
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        className="min-h-[76px] rounded-xl border-border/80 bg-background pl-10 shadow-none transition focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Preferred date</Label>
                    <div className="relative">
                      <CalendarDays className={iconCls} />
                      <Input
                        type="date"
                        className={field}
                        value={form.preferredDate}
                        onChange={(e) => setForm({ ...form, preferredDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="h-12 w-full gap-2 rounded-xl bg-linear-to-r from-primary to-violet-500 text-base font-semibold shadow-lg shadow-primary/30 transition hover:opacity-95"
                    disabled={submitting}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Request demo
                    {!submitting && <ArrowRight className="h-4 w-4" />}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    We only use your details to contact you about TravDX.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  )
}

function AgencyLogoStrip() {
  const [agencies, setAgencies] = useState([])

  useEffect(() => {
    // Show the last-seen logos instantly on repeat visits, then refresh.
    try {
      const cached = JSON.parse(localStorage.getItem('agencyLogos') || '[]')
      if (Array.isArray(cached) && cached.length) setAgencies(cached)
    } catch {}
    fetch('/api/public/agencies')
      .then((r) => r.json())
      .then((d) => {
        const list = d.agencies || []
        setAgencies(list)
        try {
          localStorage.setItem('agencyLogos', JSON.stringify(list))
        } catch {}
      })
      .catch(() => {})
  }, [])

  if (!agencies.length) return null

  // Duplicated once so the marquee can loop seamlessly at -50% instead of
  // snapping back to the start.
  const track = [...agencies, ...agencies]

  return (
    <div id="customers" className="mx-auto mt-4 w-full max-w-7xl scroll-mt-24">
      <div className="mb-5 flex items-center justify-center gap-4">
        <span className="hidden h-px w-16 bg-linear-to-r from-transparent to-border sm:block" />
        <p className="text-center text-base font-semibold tracking-tight text-foreground sm:text-lg">
          Trusted by{' '}
          <span className="bg-linear-to-r from-accent-secondary to-emerald-400 bg-clip-text text-xl font-bold text-transparent sm:text-2xl">
            1000+
          </span>{' '}
          travel agencies across India
        </p>
        <span className="hidden h-px w-16 bg-linear-to-l from-transparent to-border sm:block" />
      </div>
      <div className="group relative overflow-hidden py-3 mask-[linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="flex w-max animate-marquee gap-5 group-hover:paused">
          {track.map((a, i) => (
            <div
              key={`${a.name}-${i}`}
              className="flex h-20 w-44 shrink-0 items-center justify-center rounded-2xl bg-white px-4 py-2.5 shadow-[0_4px_20px_-6px_rgba(15,23,42,0.18)] ring-1 ring-black/5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_10px_30px_-8px_rgba(124,58,237,0.35)] dark:ring-white/10"
              title={a.name}
            >
              <Image
                src={a.logo}
                alt={a.name}
                width={160}
                height={64}
                unoptimized
                priority
                className="h-full w-full object-contain"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Mock bar — never real data, just enough to suggest a table/list row at a glance. */
function MockBar({ className }) {
  return <div className={cn('h-2.5 rounded-full bg-foreground/15', className)} />
}

/** Illustrative, non-interactive mock of what each feature's screen actually looks like —
 * no real screenshots on hand, so these are small CSS mockups in the app's own visual
 * language (rounded cards, pill badges, muted rows) rather than generic icon art. */
function FeaturePreview({ title }) {
  switch (title) {
    case 'Lead Management':
      return (
        <div className="space-y-2.5">
          {[
            { name: 'Rahul Sharma', meta: 'Andaman · 4N · Google Ads', status: 'New', color: 'bg-accent-secondary/15 text-accent-secondary' },
            { name: 'Priya Verma', meta: 'Rajasthan · 7N · Website', status: 'Follow-up', color: 'bg-amber-500/15 text-amber-500' },
            { name: 'Anil Kumar', meta: 'Himachal · 5N · Referral', status: 'Hot', color: 'bg-destructive/15 text-destructive' },
          ].map((row) => (
            <div key={row.name} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-secondary/15 text-[15px] font-semibold text-accent-secondary">
                  {row.name[0]}
                </div>
                <div>
                  <p className="text-[15px] font-medium">{row.name}</p>
                  <p className="text-[13px] text-muted-foreground">{row.meta}</p>
                </div>
              </div>
              <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[13px] font-medium', row.color)}>{row.status}</span>
            </div>
          ))}
        </div>
      )
    case 'Itinerary Builder':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { day: 'Day 1', place: 'Port Blair arrival', icon: Plane },
            { day: 'Day 2', place: 'Havelock · Radhanagar', icon: MapPin },
            { day: 'Day 3', place: 'Neil Island beaches', icon: Hotel },
          ].map((d) => (
            <div key={d.day} className="rounded-xl border border-border/70 bg-secondary/30 p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[13px] font-semibold text-primary">{d.day}</span>
                <d.icon className="h-4 w-4 text-accent-secondary" />
              </div>
              <p className="mt-3 text-[15px] font-medium">{d.place}</p>
              <MockBar className="mt-3 w-4/5" />
              <MockBar className="mt-2 w-3/5" />
            </div>
          ))}
        </div>
      )
    case 'Smart Automation':
      return (
        <div className="space-y-3">
          {[
            { icon: MessageCircle, text: 'WhatsApp reminder sent to Priya Verma', time: '2m ago' },
            { icon: Mail, text: 'Itinerary emailed to Anil Kumar', time: '18m ago' },
            { icon: Bell, text: 'Follow-up auto-scheduled for Rahul Sharma', time: '1h ago' },
          ].map((row) => (
            <div key={row.text} className="flex items-center gap-3 rounded-xl border border-border/70 bg-secondary/30 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-secondary/15 text-accent-secondary">
                <row.icon className="h-4 w-4" />
              </div>
              <p className="flex-1 text-[15px]">{row.text}</p>
              <span className="shrink-0 text-[13px] text-muted-foreground">{row.time}</span>
            </div>
          ))}
        </div>
      )
    case 'Hotel & Master Data':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { name: 'Symphony Palms Resort', meta: '4★ · Havelock', price: '₹6,500/night' },
            { name: 'SeaShell Port Blair', meta: '5★ · Port Blair', price: '₹9,200/night' },
            { name: 'Barefoot Resort', meta: '4★ · Neil Island', price: '₹7,800/night' },
          ].map((h) => (
            <div key={h.name} className="rounded-xl border border-border/70 bg-secondary/30 p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-secondary/15 text-accent-secondary">
                <Hotel className="h-4 w-4" />
              </div>
              <p className="mt-3 text-[15px] font-medium leading-snug">{h.name}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{h.meta}</p>
              <p className="mt-2 text-[15px] font-semibold text-accent-secondary">{h.price}</p>
            </div>
          ))}
        </div>
      )
    case 'Advanced Analytics':
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Conversion', value: '32%' },
              { label: 'Revenue (MTD)', value: '₹18.4L' },
              { label: 'Avg. response', value: '9 min' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                <p className="text-[13px] text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-lg font-bold text-accent-secondary">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="flex h-24 items-end gap-2 rounded-xl border border-border/70 bg-secondary/30 p-4">
            {[40, 65, 50, 80, 60, 95, 70].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-accent-secondary/60" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      )
    case 'Bookings & Invoices':
    default:
      return (
        <div className="space-y-2.5">
          {[
            { name: 'Rahul Kumar', id: 'INV-2026-0142', amount: '₹64,000', status: 'Paid', color: 'bg-success/15 text-success' },
            { name: 'Mubassir Ali', id: 'INV-2026-0141', amount: '₹1,22,700', status: 'Due ₹70,000', color: 'bg-destructive/15 text-destructive' },
            { name: 'Ankit Sharma', id: 'INV-2026-0140', amount: '₹47,500', status: 'Partial', color: 'bg-amber-500/15 text-amber-500' },
          ].map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[15px] font-medium">{row.name}</p>
                  <p className="text-[13px] text-muted-foreground">{row.id} · {row.amount}</p>
                </div>
              </div>
              <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[13px] font-medium', row.color)}>{row.status}</span>
            </div>
          ))}
        </div>
      )
  }
}

function HomeContent() {
  const searchParams = useSearchParams()
  const [demoOpen, setDemoOpen] = useState(false)
  const [activeFeature, setActiveFeature] = useState('Lead Management')
  // Hover keeps a dropdown open, so after a click it's force-hidden until the pointer leaves it.
  const [closedMenu, setClosedMenu] = useState(null)

  useEffect(() => {
    if (searchParams.get('demo') === '1') setDemoOpen(true)
  }, [searchParams])

  const features = [
    {
      icon: Users,
      title: 'Lead Management',
      description:
        'Capture, auto-assign, and convert leads with weighted distribution and smart follow-up reminders.',
    },
    {
      icon: Calendar,
      title: 'Itinerary Builder',
      description:
        'Design stunning day-wise travel itineraries with live cost calculations and shareable links.',
    },
    {
      icon: Zap,
      title: 'Smart Automation',
      description:
        'Automate follow-ups, reminders, and notifications across WhatsApp, Email, and SMS.',
    },
    {
      icon: Building2,
      title: 'Hotel & Master Data',
      description:
        'Owner-controlled master settings and Google Places hotel import — configure everything, no code.',
    },
    {
      icon: BarChart3,
      title: 'Advanced Analytics',
      description:
        'Track conversion rates, revenue, and team performance with clear, real-time dashboards.',
    },
    {
      icon: CheckCircle2,
      title: 'Bookings & Invoices',
      description:
        'Full booking lifecycle with payments, vouchers, and GST-ready invoicing built in.',
    },
  ]

  const scrollToId = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Close the hover/focus dropdown once an item is picked.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }
  const openDemo = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setDemoOpen(true)
  }

  const navMenus = [
    {
      label: 'Features',
      compact: true,
      columns: [
        {
          groups: [
            {
              heading: 'CRM & Sales Automation',
              items: [
                { icon: Inbox, title: 'Auto-Lead Capture', feature: 'Lead Management' },
                { icon: Shuffle, title: 'Auto-Lead Distribution', feature: 'Lead Management' },
                { icon: BellRing, title: 'Follow-ups & Reminders', feature: 'Smart Automation' },
                { icon: ListChecks, title: 'Lead Status Pipeline', feature: 'Lead Management' },
                { icon: LineChart, title: 'Real-Time Sales Reports', feature: 'Advanced Analytics' },
              ],
            },
            {
              heading: 'Smart Itinerary Builder',
              items: [
                { icon: Route, title: 'Day-wise Itinerary Builder', feature: 'Itinerary Builder' },
                { icon: Calculator, title: 'Live Package Costing', feature: 'Itinerary Builder' },
                { icon: Palette, title: 'Branded PDF Themes', badge: 'New', feature: 'Itinerary Builder' },
                { icon: Link2, title: 'Shareable Itinerary Links', feature: 'Itinerary Builder' },
              ],
            },
          ],
        },
        {
          groups: [
            {
              heading: 'Booking & Operations',
              items: [
                { icon: ClipboardCheck, title: 'Bookings & Confirmations', feature: 'Bookings & Invoices' },
                { icon: CalendarDays, title: 'Smart Tour Calendar' },
                { icon: Ticket, title: 'Hotel & Trip Vouchers', feature: 'Bookings & Invoices' },
              ],
            },
            {
              heading: 'Payment & Collection Tracking',
              items: [
                { icon: Wallet, title: 'Real-Time Payment Tracking', feature: 'Bookings & Invoices' },
                { icon: Receipt, title: 'Proforma & Advance Invoices', feature: 'Bookings & Invoices' },
                { icon: IndianRupee, title: 'GST Tax Invoices', feature: 'Bookings & Invoices' },
                { icon: LineChart, title: 'Company Finance & Expenses' },
              ],
            },
          ],
        },
        {
          groups: [
            {
              heading: 'Supplier Management',
              items: [
                { icon: BookOpen, title: 'Hotel Suppliers Ledger' },
                { icon: Truck, title: 'Transport Suppliers Ledger' },
                { icon: Hotel, title: 'Hotels & Vehicles Rate Master', feature: 'Hotel & Master Data' },
              ],
            },
            {
              heading: 'Administration & Security',
              items: [
                { icon: UserCog, title: 'User Management & Roles' },
                { icon: Layers, title: 'Multi-Brand Workspaces' },
                { icon: Settings, title: 'Configurable Master Data', feature: 'Hotel & Master Data' },
                { icon: History, title: 'Audit Logs' },
              ],
            },
          ],
        },
      ],
    },
    {
      label: 'Solutions',
      columns: [
        {
          heading: 'Who we work with',
          items: [
            { title: 'DMCs', text: 'Handle ground ops with your own hotels, transport and local suppliers.' },
            { title: 'Inbound Tour Operators', text: 'Build and price tours for guests travelling into India.' },
            { title: 'Outbound Tour Operators', text: 'Sell holidays abroad with hotels, transfers and sightseeing.' },
            { title: 'Travel Agencies', text: 'Run sales, operations and accounts from one workspace.' },
            { title: 'Freelance Itinerary Creators', text: 'A focused account just for building and sharing itineraries.' },
          ],
        },
        {
          heading: 'What we solve for',
          items: [
            { title: 'Never Lose a Lead', text: 'Every enquiry captured, assigned and followed up — without leaks.', feature: 'Lead Management' },
            { title: 'Quote Faster, Without Errors', text: 'Beautiful itineraries with correct costing in minutes, not hours.', feature: 'Itinerary Builder' },
            { title: 'Get Paid on Time', text: 'Track customer collections and vendor payments in one place.', feature: 'Bookings & Invoices' },
            { title: 'Smooth Day-to-Day Operations', text: 'A real-time view of tours, vouchers and team schedules.', feature: 'Bookings & Invoices' },
            { title: 'Know Your Numbers', text: 'Revenue, conversion and team performance at a glance.', feature: 'Advanced Analytics' },
          ],
        },
        {
          heading: 'Enhance with add-ons',
          items: [
            { title: 'Meta & Google Ads Leads', text: 'Ad enquiries flow straight into your CRM, auto-assigned.', badge: 'Popular' },
            { title: 'WhatsApp Sharing', text: 'Send itineraries and updates to clients on WhatsApp in a click.' },
            { title: 'Premium PDF Themes', text: 'Classic, Ocean Blue and Emerald Luxury itinerary designs.', badge: 'New' },
            { title: 'Multi-Brand', text: 'Run multiple brands with their own logos and details in one login.' },
            { title: 'Team Roles & Permissions', text: 'Separate access for Sales, Operations, Accounts and Owner.' },
          ],
        },
      ],
    },
    { label: 'Pricing', onClick: openDemo },
    {
      label: 'Resources',
      items: [
        { icon: Zap, title: 'How it works', text: 'From enquiry to booking in 3 simple steps.', onClick: () => scrollToId('how-it-works') },
        { icon: Star, title: 'Our customers', text: 'Travel agencies across India already on TravDX.', onClick: () => scrollToId('customers') },
        { icon: Calendar, title: 'Book a free demo', text: 'See the full CRM live with our team.', onClick: openDemo },
      ],
    },
    { label: 'Contact', onClick: openDemo },
  ]

  const stats = [
    { value: '10k+', label: 'Leads managed' },
    { value: '2.5x', label: 'Faster follow-ups' },
    { value: '40+', label: 'Configurable masters' },
    { value: '99.9%', label: 'Uptime' },
  ]

  const steps = [
    { icon: Users, title: 'Capture leads', text: 'From website, Meta ads, or manual entry — all in one inbox.' },
    { icon: Plane, title: 'Build & send', text: 'Craft itineraries and quotes, share instantly with clients.' },
    { icon: BarChart3, title: 'Close & grow', text: 'Convert to bookings, collect payments, and track revenue.' },
  ]

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/logo1.png`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: SITE_URL,
    },
  ]

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 shrink items-center gap-2">
            <Image
              src="/logo1.png"
              alt="Travel SaaS CRM"
              width={162}
              height={40}
              className="h-7 w-auto shrink-0 object-contain sm:h-10"
              priority
            />
          </div>

          {/* Desktop menu — hover (or keyboard focus) opens each dropdown. */}
          <div className="hidden items-center gap-1 lg:flex">
            {navMenus.map((menu) =>
              menu.columns ? (
                // Full-width mega menu: anchored to the nav bar (not the
                // button) so all three columns fit; the wrapper spans the
                // full bar height so the pointer never leaves the hover area.
                <div key={menu.label} className="group flex h-16 items-center" onMouseLeave={() => setClosedMenu(null)}>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors group-hover:bg-secondary group-hover:text-foreground group-focus-within:bg-secondary group-focus-within:text-foreground"
                  >
                    {menu.label}
                    <ChevronDown className="h-4 w-4 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" />
                  </button>
                  <div className={cn('invisible absolute inset-x-4 top-full z-50 opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 sm:inset-x-6 lg:inset-x-8', closedMenu === menu.label && 'invisible! opacity-0!')}>
                    <div className="grid grid-cols-3 gap-6 rounded-2xl border border-border bg-popover p-6 shadow-2xl">
                      {menu.columns.map((col, ci) => (
                        <div key={ci} className="space-y-5">
                          {(col.groups || [col]).map((group) => (
                            <div key={group.heading}>
                              <p className={cn('px-3 text-sm font-medium text-muted-foreground', menu.compact ? 'mb-1.5' : 'mb-3')}>
                                {group.heading}
                              </p>
                              <div className={menu.compact ? 'space-y-0.5' : 'space-y-1'}>
                                {group.items.map((item) => (
                                  <button
                                    key={item.title}
                                    type="button"
                                    onClick={() => {
                                      setClosedMenu(menu.label)
                                      if (item.feature) {
                                        setActiveFeature(item.feature)
                                        scrollToId('features')
                                      } else {
                                        openDemo()
                                      }
                                    }}
                                    className={cn(
                                      'w-full rounded-xl px-3 text-left transition-colors hover:bg-secondary',
                                      menu.compact ? 'flex items-center gap-3 py-2' : 'block py-2.5'
                                    )}
                                  >
                                    {menu.compact && item.icon && (
                                      <item.icon className="h-[18px] w-[18px] shrink-0 text-foreground/80" />
                                    )}
                                    <span className="flex items-center gap-2">
                                      <span
                                        className={cn(
                                          'text-foreground',
                                          menu.compact ? 'text-[15px] font-medium' : 'text-[15px] font-semibold'
                                        )}
                                      >
                                        {item.title}
                                      </span>
                                      {item.badge && (
                                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                                          {item.badge}
                                        </span>
                                      )}
                                    </span>
                                    {!menu.compact && item.text && (
                                      <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{item.text}</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : menu.items ? (
                <div key={menu.label} className="group relative" onMouseLeave={() => setClosedMenu(null)}>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground group-focus-within:text-foreground"
                  >
                    {menu.label}
                    <ChevronDown className="h-4 w-4 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" />
                  </button>
                  <div className={cn('invisible absolute top-full left-1/2 z-50 -translate-x-1/2 pt-2 opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100', closedMenu === menu.label && 'invisible! opacity-0!')}>
                    <div
                      className={cn(
                        'grid gap-1 rounded-2xl border border-border bg-popover p-2 shadow-2xl',
                        menu.wide ? 'w-[640px] grid-cols-2' : 'w-80'
                      )}
                    >
                      {menu.items.map((item) => (
                        <button
                          key={item.title}
                          type="button"
                          onClick={() => {
                            setClosedMenu(menu.label)
                            item.onClick()
                          }}
                          className="flex items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-secondary"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-secondary/10 text-accent-secondary">
                            <item.icon className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{item.title}</p>
                            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{item.text}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  key={menu.label}
                  type="button"
                  onClick={menu.onClick}
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {menu.label}
                </button>
              )
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <ThemeToggle />
            <Link href="/login">
              <Button variant="ghost" size="sm" className="px-2 text-xs sm:h-9 sm:px-4 sm:text-sm">
                Sign In
              </Button>
            </Link>
            <Button
              size="sm"
              className="gap-1 px-3 text-xs sm:h-9 sm:gap-1.5 sm:px-4 sm:text-sm"
              onClick={() => setDemoOpen(true)}
            >
              Book a Demo <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="relative overflow-hidden bg-white dark:bg-[#010d23]">
          {/* Same navy as the artwork's own backdrop so the image has no visible box edge. */}
          <div className="pointer-events-none absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-violet-300/30 blur-[120px] dark:bg-violet-700/20" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-b from-transparent to-background" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 pt-6 pb-8 sm:px-6 lg:min-h-[560px] lg:grid-cols-[0.85fr_1.15fr] lg:px-8 lg:pt-6 lg:pb-14">
            <div className="w-full text-center lg:text-left">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-1.5 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-accent-secondary" />
                The all-in-one platform for travel agencies
              </div>
              <h1 className="text-balance text-3xl leading-[1.1] font-bold tracking-tight sm:text-4xl xl:text-[44px]">
                Run your entire travel business from{' '}
                <span className="bg-linear-to-r from-accent-secondary via-emerald-300 to-cyan-300 bg-clip-text text-transparent">
                  one beautiful workspace
                </span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg lg:mx-0">
                Leads, itineraries, bookings, payments, and owner-controlled master settings — everything
                your agency needs to sell more trips and delight more travelers.
              </p>
              <div className="mt-8 flex flex-row items-center justify-center gap-3 lg:justify-start">
                <Button
                  size="lg"
                  className="flex-1 gap-2 rounded-full bg-accent-secondary px-7 text-base text-accent-secondary-foreground shadow-[0_0_30px_-5px] shadow-accent-secondary/50 hover:bg-accent-secondary/90 sm:flex-none"
                  onClick={() => setDemoOpen(true)}
                >
                  Book a Demo <ArrowRight className="h-4 w-4" />
                </Button>
                <a href="#features" className="flex-1 sm:flex-none">
                  <Button variant="outline" size="lg" className="w-full rounded-full px-7 text-base">
                    Explore Features
                  </Button>
                </a>
              </div>
            </div>
            <div>
              {/* Light theme: same artwork with its navy backdrop cut out to transparent. */}
              <Image
                src="/hero-laptop-light.webp"
                alt="TravDX dashboard"
                width={1587}
                height={991}
                priority
                unoptimized
                className="h-auto w-full lg:-ml-[6%] lg:w-[112%] lg:max-w-none dark:hidden"
              />
              <Image
                src="/hero-laptop.webp"
                alt="TravDX dashboard"
                width={1587}
                height={991}
                priority
                unoptimized
                className="hidden h-auto w-full lg:-ml-[6%] lg:w-[112%] lg:max-w-none dark:block"
                style={{
                  maskImage:
                    'linear-gradient(to right, transparent, black 10%, black 92%, transparent), linear-gradient(to bottom, transparent, black 8%, black 85%, transparent)',
                  maskComposite: 'intersect',
                  WebkitMaskImage:
                    'linear-gradient(to right, transparent, black 10%, black 92%, transparent), linear-gradient(to bottom, transparent, black 8%, black 85%, transparent)',
                  WebkitMaskComposite: 'source-in',
                }}
              />
            </div>
          </div>
        </div>
        <div className="relative mx-auto max-w-7xl px-4 pt-4 pb-20 text-center sm:px-6 lg:px-8 lg:pb-28">
          <AgencyLogoStrip />

          {/* Features showcase */}
          <div id="features" className="mt-16 scroll-mt-24">
            <div className="scroll-hover-thin mx-auto flex max-w-6xl flex-nowrap items-center justify-start gap-x-7 overflow-x-auto border-b border-border/70 sm:justify-center">
              {features.map((feature) => {
                const Icon = feature.icon
                const active = activeFeature === feature.title
                return (
                  <button
                    key={feature.title}
                    onClick={() => setActiveFeature(feature.title)}
                    className={cn(
                      'relative flex shrink-0 items-center gap-2 pb-3.5 text-[15px] font-medium transition-colors',
                      active ? 'text-accent-secondary' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {feature.title}
                    {active && (
                      <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent-secondary" />
                    )}
                  </button>
                )
              })}
            </div>

            <div className="relative mt-8 text-left">
              <div className="absolute inset-0 -z-10 rounded-4xl bg-linear-to-br from-accent-secondary/15 via-primary/10 to-transparent blur-2xl" />
              <div className="mx-auto max-w-6xl rounded-3xl border border-border/70 bg-card/60 p-2 shadow-2xl backdrop-blur">
                <div className="overflow-hidden rounded-2xl border border-border bg-background">
                  <div className="flex items-center gap-1.5 border-b border-border bg-secondary/40 px-4 py-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                    <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                  </div>
                  <div className="p-5 sm:p-8">
                    <FeaturePreview title={activeFeature} />
                  </div>
                </div>
              </div>
              <p className="mx-auto mt-5 max-w-md text-center text-sm text-muted-foreground">
                {features.find((f) => f.title === activeFeature)?.description}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur"
              >
                <div className="text-3xl font-bold text-accent-secondary">{s.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">From enquiry to booking in 3 steps</h2>
            <p className="mt-4 text-muted-foreground">A workflow your whole team will love.</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => {
              const Icon = step.icon
              return (
                <div key={step.title} className="relative rounded-2xl border border-border bg-card p-7">
                  <div className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                    Step {i + 1}
                  </div>
                  <Icon className="mt-2 h-8 w-8 text-accent-secondary" />
                  <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-8 py-14 text-center text-primary-foreground shadow-xl">
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
          <div className="relative">
            <div className="mb-4 flex justify-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-current text-accent-secondary" />
              ))}
            </div>
            <h2 className="text-3xl font-bold sm:text-4xl">Ready to grow your travel business?</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg opacity-90">
              Join agencies using Travel SaaS CRM to manage leads, itineraries, and bookings — beautifully.
            </p>
            <Button
              variant="secondary"
              size="lg"
              className="mt-8 gap-2 bg-accent-secondary text-accent-secondary-foreground hover:bg-accent-secondary/90"
              onClick={() => setDemoOpen(true)}
            >
              Book a Demo <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      {/* Always the hero's dark navy, in both themes. */}
      <footer className="border-t border-white/10 bg-[#010d23]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6 lg:px-8">
          <div className="sm:flex-1">
            <Image src="/logo1.png" alt="TravDX" width={130} height={32} className="h-8 w-auto object-contain" />
          </div>
          <p className="text-center text-sm text-slate-400">
            A product of{' '}
            <a
              href="https://deenxconsultancy.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-white underline-offset-4 transition-colors hover:text-accent-secondary hover:underline"
            >
              Deenx Consultancy
            </a>
          </p>
          <p className="text-center text-sm text-slate-400 sm:flex-1 sm:text-right">
            &copy; {new Date().getFullYear()} Deenx Consultancy. All rights reserved.
          </p>
        </div>
      </footer>

      <BookDemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
    </main>
  )
}
