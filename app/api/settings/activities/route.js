import connectDB from '@/lib/mongodb'
import Activity from '@/models/Activity'
import { authenticate, requireOwnerRoles } from '@/lib/middleware'
import { recordAudit } from '@/lib/audit'
import { tenantFilter, tenantReadFilter } from '@/lib/tenant'

const OWNER_ROLES = ['admin', 'superadmin', 'itinerary_only']

/**
 * GET /api/settings/activities?search=
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
    // sees workspace-wide activities the owner added without picking a brand
    // (see lib/tenant.js).
    const { $or: brandOr, ...tenantScope } = tenantReadFilter(authResult.user)
    const query = { ...tenantScope }
    if (!includeArchived) query.isArchived = false
    if (search) query.name = { $regex: search, $options: 'i' }
    if (brandOr) query.$or = brandOr

    const activities = await Activity.find(query).sort({ name: 1 }).lean()
    return Response.json({ activities })
  } catch (error) {
    console.error('List activities error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const denied = requireOwnerRoles(authResult.user, OWNER_ROLES)
    if (denied) return Response.json({ error: denied.error }, { status: denied.status })

    await connectDB()
    const body = await request.json()
    if (!body.name || !body.name.trim()) {
      return Response.json({ error: 'Activity name is required' }, { status: 400 })
    }

    const activity = await Activity.create({
      teamId: authResult.user.teamId,
      brandId: authResult.user.brandId || undefined,
      name: body.name.trim(),
      duration: body.duration?.trim(),
      price: body.price,
      priceCurrency: body.priceCurrency || 'INR',
      description: body.description,
      createdBy: authResult.user.userId,
    })

    await recordAudit({
      teamId: authResult.user.teamId,
      entity: 'activity',
      entityId: activity._id,
      action: 'create',
      summary: `Added activity "${activity.name}"`,
      actor: authResult.user,
    })

    return Response.json({ activity }, { status: 201 })
  } catch (error) {
    console.error('Create activity error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
