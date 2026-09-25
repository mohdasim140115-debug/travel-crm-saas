import connectDB from '@/lib/mongodb'
import Vehicle from '@/models/Vehicle'
import { authenticate, requireRoles } from '@/lib/middleware'
import { recordAudit } from '@/lib/audit'
import { tenantFilter, tenantReadFilter } from '@/lib/tenant'

const OWNER_ROLES = ['admin', 'superadmin']
// Sales / Operations / Accounts can add hotels & vehicles too (edit/delete stay owner-only).
const ADD_ROLES = [...OWNER_ROLES, 'agent', 'manager', 'operations', 'accounts']

/**
 * GET /api/settings/vehicles?search=
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
    const includeArchived = searchParams.get('includeArchived') === '1'

    // tenantReadFilter (not tenantFilter) so a brand-scoped salesperson also
    // sees workspace-wide vehicles the owner added without picking a brand
    // (see lib/tenant.js).
    const { $or: brandOr, ...tenantScope } = tenantReadFilter(authResult.user)
    const query = { ...tenantScope }
    if (!includeArchived) query.isArchived = false
    const andClauses = []
    if (brandOr) andClauses.push({ $or: brandOr })
    if (search) {
      andClauses.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { 'routes.fromLocation': { $regex: search, $options: 'i' } },
          { 'routes.toLocation': { $regex: search, $options: 'i' } },
        ],
      })
    }
    if (andClauses.length) query.$and = andClauses

    const vehicles = await Vehicle.find(query).sort({ name: 1 }).lean()
    return Response.json({ vehicles })
  } catch (error) {
    console.error('List vehicles error:', error)
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
      return Response.json({ error: 'Vehicle name is required' }, { status: 400 })
    }

    const routes = (Array.isArray(body.routes) ? body.routes : [])
      .filter((r) => r && (r.fromLocation || r.toLocation || r.priceAC || r.priceNonAC))
      .map((r) => ({
        fromLocation: r.fromLocation?.trim(),
        toLocation: r.toLocation?.trim(),
        priceAC: r.priceAC,
        priceNonAC: r.priceNonAC,
      }))

    const vehicle = await Vehicle.create({
      teamId: authResult.user.teamId,
      brandId: authResult.user.brandId || undefined,
      name: body.name.trim(),
      routes,
      priceCurrency: body.priceCurrency || 'INR',
      createdBy: authResult.user.userId,
    })

    await recordAudit({
      teamId: authResult.user.teamId,
      entity: 'vehicle',
      entityId: vehicle._id,
      action: 'create',
      summary: `Added vehicle "${vehicle.name}"`,
      actor: authResult.user,
    })

    return Response.json({ vehicle }, { status: 201 })
  } catch (error) {
    console.error('Create vehicle error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
