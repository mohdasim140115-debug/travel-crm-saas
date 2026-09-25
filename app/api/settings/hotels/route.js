import connectDB from '@/lib/mongodb'
import Hotel from '@/models/Hotel'
import { authenticate, requireRoles } from '@/lib/middleware'
import { recordAudit } from '@/lib/audit'
import { tenantFilter, tenantReadFilter } from '@/lib/tenant'

const OWNER_ROLES = ['admin', 'superadmin']
// Sales / Operations / Accounts can add hotels & vehicles too (edit/delete stay owner-only).
const ADD_ROLES = [...OWNER_ROLES, 'agent', 'manager', 'operations', 'accounts']

/**
 * GET /api/settings/hotels?search=&destination=&city=
 * Readable by any authenticated user (used in itinerary builder dropdowns);
 * writes are owner-only.
 */
export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    await connectDB()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()
    const destination = searchParams.get('destination')?.trim()
    const city = searchParams.get('city')?.trim()
    const includeArchived = searchParams.get('includeArchived') === '1'

    // tenantReadFilter (not tenantFilter) so a brand-scoped salesperson also
    // sees workspace-wide hotels the owner added without picking a brand —
    // otherwise those are invisible to them (see lib/tenant.js).
    const { $or: brandOr, ...tenantScope } = tenantReadFilter(authResult.user)
    const query = { ...tenantScope }
    if (!includeArchived) query.isArchived = false
    if (destination) query.destination = destination
    if (city) query.city = city
    const andClauses = []
    if (brandOr) andClauses.push({ $or: brandOr })
    if (search) {
      andClauses.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { city: { $regex: search, $options: 'i' } },
          { destination: { $regex: search, $options: 'i' } },
          { address: { $regex: search, $options: 'i' } },
        ],
      })
    }
    if (andClauses.length) query.$and = andClauses

    const hotels = await Hotel.find(query).sort({ destination: 1, city: 1, name: 1 }).lean()
    return Response.json({ hotels })
  } catch (error) {
    console.error('List hotels error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const denied = requireRoles(authResult.user.role, ADD_ROLES)
    if (denied) return Response.json({ error: denied.error }, { status: denied.status })

    await connectDB()
    const body = await request.json()
    if (!body.name || !body.name.trim()) {
      return Response.json({ error: 'Hotel name is required' }, { status: 400 })
    }

    // Dedup Google-imported hotels within the workspace.
    if (body.placeId) {
      const dup = await Hotel.findOne({
        teamId: authResult.user.teamId,
        placeId: body.placeId,
      })
      if (dup) {
        return Response.json({ error: 'This hotel is already saved', hotel: dup }, { status: 409 })
      }
    }

    const hotel = await Hotel.create({
      teamId: authResult.user.teamId,
      brandId: authResult.user.brandId || undefined,
      name: body.name.trim(),
      destination: body.destination?.trim(),
      city: body.city?.trim(),
      country: body.country?.trim(),
      address: body.address,
      category: body.category,
      stars: body.stars,
      roomType: body.rooms?.[0]?.roomType || body.roomType,
      price: body.rooms?.[0]?.price ?? body.price,
      priceCurrency: body.priceCurrency || 'INR',
      rooms: body.rooms || [],
      extraBedCharge: body.extraBedCharge,
      cnbPrice: body.cnbPrice,
      phone: body.phone,
      email: body.email,
      website: body.website,
      description: body.description,
      location: body.location,
      // Only set placeId when present — an explicit `undefined` still gets
      // stored as `null` by Mongoose, which collides with other hotels under
      // the { teamId, placeId } sparse-unique index.
      ...(body.placeId ? { placeId: body.placeId } : {}),
      googleRating: body.googleRating,
      googleReviews: body.googleReviews,
      priceLevel: body.priceLevel,
      photos: body.photos || [],
      amenities: body.amenities || [],
      source: body.placeId ? 'google_places' : 'manual',
      notes: body.notes,
      createdBy: authResult.user.userId,
    })

    await recordAudit({
      teamId: authResult.user.teamId,
      entity: 'hotel',
      entityId: hotel._id,
      action: 'create',
      summary: `Added hotel "${hotel.name}"${hotel.city ? ` (${hotel.city})` : ''}`,
      actor: authResult.user,
    })

    return Response.json({ hotel }, { status: 201 })
  } catch (error) {
    console.error('Create hotel error:', error)
    if (error?.code === 11000) {
      return Response.json({ error: 'This hotel is already saved' }, { status: 409 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
