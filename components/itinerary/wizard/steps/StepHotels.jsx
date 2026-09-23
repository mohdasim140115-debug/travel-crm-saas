'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { MapPin, Search, Star, Check, Loader2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { BUDGET_TIERS, budgetTierLabel } from '@/modules/itinerary/studio'

function formatPrice(n) {
  if (!n && n !== 0) return null
  return `₹${Number(n).toLocaleString('en-IN')}`
}

function buildHotelEntry(hotel, category) {
  return {
    id: hotel._id,
    name: hotel.name,
    location: hotel.city || hotel.destination || hotel.address || '',
    stars: hotel.stars || 3,
    images: hotel.photos?.length ? [hotel.photos[0]] : [],
    amenities: hotel.amenities || [],
    roomType: hotel.roomType || 'DELUXE',
    cost: hotel.price || 0,
    currency: hotel.priceCurrency || 'INR',
    ...(category ? { category } : {}),
  }
}

/** A single "search + grid" hotel picker, scoped to one budget tier when
 * `category` is set (or to the whole trip when it's null, the pre-budget-tier
 * behavior). Selecting a hotel here tags it with `category` so the Costing
 * step and PDF can group it under the right tier. */
function HotelPicker({ category, form, update }) {
  const [hotels, setHotels] = useState([])
  const [search, setSearch] = useState('')
  const [hotelsLoading, setHotelsLoading] = useState(true)
  const all = form.hotels || []
  const selected = all.filter((h) => (category ? h.category === category : !h.category))

  useEffect(() => {
    const token = localStorage.getItem('token')
    const q = search ? `?search=${encodeURIComponent(search)}` : ''
    setHotelsLoading(true)
    const t = setTimeout(() => {
      fetch(`/api/settings/hotels${q}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setHotels(d.hotels || []))
        .catch(() => {})
        .finally(() => setHotelsLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [search])

  const isSelected = (id) =>
    selected.some((h) => h.id === id || h.name === hotels.find((x) => x._id === id)?.name)

  const toggleHotel = (hotel) => {
    const exists = selected.find((h) => h.id === hotel._id || h.name === hotel.name)
    if (exists) {
      update({
        hotels: all.filter((h) => h !== exists),
        nightStays: (form.nightStays || []).filter((s) => s.hotelId !== (exists.id || hotel._id)),
      })
    } else {
      update({ hotels: [...all, buildHotelEntry(hotel, category)] })
    }
  }

  const removeSelected = (entry) => {
    update({
      hotels: all.filter((h) => h !== entry),
      nightStays: (form.nightStays || []).filter((s) => s.hotelId !== entry.id),
    })
  }

  return (
    <div className="space-y-4">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((h) => (
            <Badge
              key={h.id || h.name}
              className="gap-1.5 bg-accent-secondary/15 pr-1 text-accent-secondary hover:bg-accent-secondary/15"
            >
              {h.name}
              <button
                type="button"
                onClick={() => removeSelected(h)}
                className="rounded-full p-0.5 hover:bg-accent-secondary/25"
                aria-label={`Remove ${h.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or city..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {hotelsLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading hotels…
        </div>
      ) : hotels.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hotels saved yet. Add hotels under Settings → Hotel Management to select them here.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hotels.map((hotel) => {
            const active = isSelected(hotel._id)
            const image = hotel.photos?.[0]
            const price = formatPrice(hotel.price)
            return (
              <button
                key={hotel._id}
                type="button"
                onClick={() => toggleHotel(hotel)}
                className={cn(
                  'overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all hover:shadow-md',
                  active && 'border-accent-secondary ring-2 ring-accent-secondary/30'
                )}
              >
                <div className="relative aspect-16/10 bg-muted">
                  {image && (
                    <Image src={image} alt={hotel.name} fill className="object-cover" unoptimized />
                  )}
                  {active && (
                    <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-accent-secondary px-2.5 py-1 text-xs font-semibold text-accent-secondary-foreground shadow-sm">
                      <Check className="h-3 w-3" /> Selected
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold">{hotel.name}</h3>
                  <div className="mt-1 flex gap-0.5">
                    {Array.from({ length: hotel.stars || 0 }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {(hotel.city || hotel.destination) && (
                      <Badge variant="secondary" className="gap-1">
                        <MapPin className="h-3 w-3" />
                        {hotel.city || hotel.destination}
                      </Badge>
                    )}
                    {price && (
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                        {price}/night
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selected.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {selected.length} hotel{selected.length > 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  )
}

export default function StepHotels({ form, update }) {
  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Select hotels</CardTitle>
          <CardDescription>Choose properties from your master hotel repository</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-dashed p-3">
            <div>
              <Label className="text-sm font-medium">
                Multiple budget options ({budgetTierLabel('low', form.budgetTierLabels)} /{' '}
                {budgetTierLabel('high', form.budgetTierLabels)})
              </Label>
              <p className="text-xs text-muted-foreground">
                {(form.packageCategories || []).length === 2 ? (
                  <>
                    Set automatically since two Package categories are picked in Details — a{' '}
                    {budgetTierLabel('low', form.budgetTierLabels)} option and a{' '}
                    {budgetTierLabel('high', form.budgetTierLabels)} option, each with its own
                    night stays, price, and section in the PDF.
                  </>
                ) : (
                  <>
                    Turn on to build two separate hotel picks — a Low Budget option and a High
                    Budget option — each with its own night stays, price, and section in the PDF.
                  </>
                )}
              </p>
            </div>
            <Switch
              checked={Boolean(form.budgetTiers)}
              onCheckedChange={(checked) => update({ budgetTiers: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {form.budgetTiers ? (
        BUDGET_TIERS.map((tier) => {
          const label = budgetTierLabel(tier.key, form.budgetTierLabels)
          return (
            <Card key={tier.key} className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle>{label} hotels</CardTitle>
                <CardDescription>Hotels picked here appear under {label} in Costing and the PDF.</CardDescription>
              </CardHeader>
              <CardContent>
                <HotelPicker category={tier.key} form={form} update={update} />
              </CardContent>
            </Card>
          )
        })
      ) : (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="pt-6">
            <HotelPicker category={null} form={form} update={update} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
