'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Car } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HotelManager } from '@/components/settings/HotelManager'
import { VehicleManager } from '@/components/settings/VehicleManager'

const STAFF_ROLES = ['agent', 'manager', 'operations', 'accounts']

/** Hotel and Vehicle Management for Sales, Operations and Accounts — they can
 * look up hotels, room rates and vehicle route fares and add new ones, but
 * only the Owner (in Settings) can edit or delete existing entries. */
export default function RatesPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('hotels')

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      if (!STAFF_ROLES.includes(u.role)) {
        router.replace('/dashboard')
        return
      }
    } catch {
      router.replace('/login')
      return
    }
    setReady(true)
  }, [router])

  if (!ready) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={tab === 'hotels' ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5"
          onClick={() => setTab('hotels')}
        >
          <Building2 className="h-4 w-4" /> Hotels
        </Button>
        <Button
          variant={tab === 'vehicles' ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5"
          onClick={() => setTab('vehicles')}
        >
          <Car className="h-4 w-4" /> Vehicles
        </Button>
        <span className="self-center text-xs text-muted-foreground">You can add new ones; only the Owner can edit or delete.</span>
      </div>
      <Card className="p-3 max-sm:-mx-2 sm:p-5">{tab === 'hotels' ? <HotelManager readOnly /> : <VehicleManager readOnly />}</Card>
    </div>
  )
}
