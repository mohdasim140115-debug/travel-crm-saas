import { authenticate, requireRoles } from '@/lib/middleware'

const OWNER_ROLES = ['admin', 'superadmin']
// Sales / Operations / Accounts can add hotels & vehicles too (edit/delete stay owner-only).
const ADD_ROLES = [...OWNER_ROLES, 'agent', 'manager', 'operations', 'accounts']
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY

/**
 * Google Places text search for hotels (Places API — New).
 * GET /api/places/search?q=hotels in srinagar
 */
export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const denied = requireRoles(authResult.user.role, ADD_ROLES)
    if (denied) return Response.json({ error: denied.error }, { status: denied.status })

    if (!PLACES_KEY) {
      return Response.json(
        {
          error: 'Google Places API is not configured',
          hint: 'Set GOOGLE_PLACES_API_KEY in your environment to enable hotel search.',
          configured: false,
          results: [],
        },
        { status: 200 }
      )
    }

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()
    if (!q) return Response.json({ error: 'Query is required', results: [] }, { status: 400 })

    const textQuery = /hotel|resort|stay|lodge|inn/i.test(q) ? q : `hotels in ${q}`

    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_KEY,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.rating',
          'places.userRatingCount',
          'places.priceLevel',
          'places.types',
          'places.photos',
          'places.nationalPhoneNumber',
          'places.websiteUri',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery,
        includedType: 'lodging',
        maxResultCount: 15,
      }),
    })

    const data = await resp.json()
    if (!resp.ok) {
      console.error('Places search error:', data?.error?.message)
      return Response.json(
        { error: data?.error?.message || 'Places search failed', results: [] },
        { status: 502 }
      )
    }

    const priceLevelMap = {
      PRICE_LEVEL_FREE: 0,
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4,
    }

    const results = (data.places || []).map((p) => ({
      placeId: p.id,
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      location: p.location
        ? { lat: p.location.latitude, lng: p.location.longitude }
        : undefined,
      googleRating: p.rating,
      googleReviews: p.userRatingCount,
      priceLevel: priceLevelMap[p.priceLevel] ?? undefined,
      phone: p.nationalPhoneNumber,
      website: p.websiteUri,
      // Proxy photos through our server so the API key is never exposed.
      photos: (p.photos || [])
        .slice(0, 3)
        .map((ph) => `/api/places/photo?ref=${encodeURIComponent(ph.name)}`),
    }))

    return Response.json({ configured: true, results })
  } catch (error) {
    console.error('Places search exception:', error)
    return Response.json({ error: 'Internal server error', results: [] }, { status: 500 })
  }
}
