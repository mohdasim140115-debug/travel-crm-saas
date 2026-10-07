import connectDB from '@/lib/mongodb'
import mongoose from 'mongoose'
import Brand from '@/models/Brand'
import { authenticate } from '@/lib/middleware'
import { getItineraryFull } from '@/services/itineraryService'
import { buildItineraryPdf } from '@/lib/pdf/itineraryPdf'

export const runtime = 'nodejs'

export async function GET(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid itinerary ID' }, { status: 400 })
    }
    const theme = new URL(request.url).searchParams.get('theme') || undefined

    await connectDB()
    const result = await getItineraryFull(id, authResult.user)
    if (!result) {
      return Response.json({ error: 'Itinerary not found' }, { status: 404 })
    }

    let brand = null
    const brandId = result.itinerary.brandId || authResult.user.activeBrandId
    if (brandId) {
      brand = await Brand.findOne({
        _id: brandId,
        teamId: authResult.user.teamId,
        isActive: true,
      }).lean()
    }
    if (!brand) {
      brand = await Brand.findOne({
        teamId: authResult.user.teamId,
        isActive: true,
      })
        .sort({ isDefault: -1, name: 1 })
        .lean()
    }

    const buffer = await buildItineraryPdf({
      itinerary: result.itinerary,
      days: result.days,
      activities: result.activities || [],
      hotels: result.hotels || [],
      brand: brand || { name: 'Travel Agency' },
      theme: theme || result.itinerary.pdfTheme,
    })

    const filename = `${(result.itinerary.customerName || result.itinerary.tripName || 'itinerary').replace(/[^a-z0-9]/gi, '_')}.pdf`
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // The browser must never serve a stale PDF for a just-saved edit —
        // this always reflects the itinerary's current DB state, so caching
        // it (even briefly) only risks showing an old version.
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('PDF export error:', error)
    return Response.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
