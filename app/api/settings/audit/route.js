import connectDB from '@/lib/mongodb'
import AuditLog from '@/models/AuditLog'
import { authenticate, requireOwnerRoles } from '@/lib/middleware'
import mongoose from 'mongoose'

const OWNER_ROLES = ['admin', 'superadmin', 'itinerary_only']

/** GET /api/settings/audit?entity=setting_option&category=lead_status&limit=50 */
export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const denied = requireOwnerRoles(authResult.user, OWNER_ROLES)
    if (denied) return Response.json({ error: denied.error }, { status: denied.status })

    await connectDB()
    const { searchParams } = new URL(request.url)
    const entity = searchParams.get('entity')
    const category = searchParams.get('category')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

    const query = { teamId: new mongoose.Types.ObjectId(String(authResult.user.teamId)) }
    if (entity) query.entity = entity
    if (category) query.entityCategory = category

    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit).lean()
    return Response.json({ logs })
  } catch (error) {
    console.error('Get audit error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
