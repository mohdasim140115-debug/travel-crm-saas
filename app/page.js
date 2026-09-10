'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION } from '@/lib/seo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
  ShieldCheck,
  Sparkles,
  Star,
  Loader2,
  PartyPopper,
} from 'lucide-react'

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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setDone(false)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {done ? (
          <div className="py-6 text-center">
            <PartyPopper className="mx-auto h-10 w-10 text-accent-secondary" />
            <h3 className="mt-4 text-lg font-semibold">Thanks — request received!</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Our team will reach out shortly to set up your workspace and walk you through a demo.
            </p>
            <Button className="mt-6 w-full" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Book a demo</DialogTitle>
              <DialogDescription>
                Tell us a bit about your agency — our team sets up your workspace and reaches out to
                walk you through it.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={submit}>
              {error && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div>
                <Label>Full name *</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Phone *</Label>
                <Input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Address</Label>
                <Textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="min-h-[80px]"
                />
              </div>
              <div>
                <Label>Preferred date</Label>
                <Input
                  type="date"
                  value={form.preferredDate}
                  onChange={(e) => setForm({ ...form, preferredDate: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Request demo
              </Button>
            </form>
          </>
        )}
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

function HomeContent() {
  const searchParams = useSearchParams()
  const [demoOpen, setDemoOpen] = useState(false)

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
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
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
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
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
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 glow-primary" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-accent-secondary" />
            The all-in-one platform for travel agencies
          </div>
          <h1 className="mx-auto max-w-4xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            Run your entire travel business from{' '}
            <span className="text-accent-secondary">one beautiful workspace</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
            Leads, itineraries, bookings, payments, and owner-controlled master settings — everything
            your agency needs to sell more trips and delight more travelers.
          </p>
          <div className="mt-9 flex flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              className="flex-1 gap-2 bg-accent-secondary text-base text-accent-secondary-foreground hover:bg-accent-secondary/90 sm:flex-none"
              onClick={() => setDemoOpen(true)}
            >
              Book a Demo <ArrowRight className="h-4 w-4" />
            </Button>
            <a href="#features" className="flex-1 sm:flex-none">
              <Button variant="outline" size="lg" className="w-full text-base">
                Explore Features
              </Button>
            </a>
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-accent-secondary" />
            No credit card required · Multi-tenant & secure
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

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need, nothing you don&apos;t
          </h2>
          <p className="mt-4 text-muted-foreground">
            A modern, fully configurable CRM designed for the way travel agencies actually work.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <Card
                key={feature.title}
                className="card-hover border-border/70 bg-card p-7"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-secondary/10 text-accent-secondary">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </Card>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border bg-secondary/40">
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
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Image src="/logo1.png" alt="Travel SaaS CRM" width={130} height={32} className="h-8 w-auto object-contain" />
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Travel SaaS CRM. All rights reserved.
          </p>
        </div>
      </footer>

      <BookDemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
    </main>
  )
}
