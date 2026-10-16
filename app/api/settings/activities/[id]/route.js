import connectDB from '@/lib/mongodb'
import Activity from '@/models/Activity'
import { authenticate, requireOwnerRoles } from '@/lib/middleware'
import { recordAudit } from '@/lib/audit'
import mongoose from 'mongoose'

const OWNER_ROLES = ['admin', 'superadmin', 'itinerary_only']

function scope(user, id) {
  return { _id: id, teamId: new mongoose.Types.ObjectId(String(user.teamId)) }
}

async function authOwner(request) {
  const authResult = await authenticate(request)
  if (authResult.error) {
    return { res: Response.json({ error: authResult.error }, { status: authResult.status }) }
  }
  const denied = requireOwnerRoles(authResult.user, OWNER_ROLES)
  if (denied) return { res: Response.json({ error: denied.error }, { status: denied.status }) }
  return { user: authResult.user }
}

export async function PUT(request, { params }) {
  try {
    const { user, res } = await authOwner(request)
    if (res) return res
    await connectDB()
    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }
    const body = await request.json()
    const activity = await Activity.findOne(scope(user, id))
    if (!activity) return Response.json({ error: 'Activity not found' }, { status: 404 })

    const fields = ['name', 'duration', 'price', 'priceCurrency', 'description', 'isActive']
    for (const f of fields) {
      if (body[f] !== undefined) activity[f] = body[f]
    }
    activity.updatedBy = user.userId
    await activity.save()

    await recordAudit({
      teamId: user.teamId,
      entity: 'activity',
      entityId: activity._id,
      action: 'update',
      summary: `Updated activity "${activity.name}"`,
      actor: user,
    })

    return Response.json({ activity })
  } catch (error) {
    console.error('Update activity error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  try {
    const { user, res } = await authOwner(request)
    if (res) return res
    await connectDB()
    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }
    const { action } = await request.json()
    const activity = await Activity.findOne(scope(user, id))
    if (!activity) return Response.json({ error: 'Activity not found' }, { status: 404 })

    if (action === 'archive') {
      activity.isArchived = true
      activity.isActive = false
    } else if (action === 'restore') {
      activity.isArchived = false
      activity.isActive = true
    } else if (action === 'toggle') {
      activity.isActive = !activity.isActive
    } else {
      return Response.json({ error: 'Unknown action' }, { status: 400 })
    }
    activity.updatedBy = user.userId
    await activity.save()

    await recordAudit({
      teamId: user.teamId,
      entity: 'activity',
      entityId: activity._id,
      action: action === 'archive' ? 'archive' : action === 'restore' ? 'restore' : 'update',
      summary: `${action} activity "${activity.name}"`,
      actor: user,
    })

    return Response.json({ activity })
  } catch (error) {
    console.error('Patch activity error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const { user, res } = await authOwner(request)
    if (res) return res
    await connectDB()
    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }
    const activity = await Activity.findOneAndDelete(scope(user, id))
    if (!activity) return Response.json({ error: 'Activity not found' }, { status: 404 })

    await recordAudit({
      teamId: user.teamId,
      entity: 'activity',
      entityId: activity._id,
      action: 'delete',
      summary: `Deleted activity "${activity.name}"`,
      actor: user,
    })

    return Response.json({ deleted: true })
  } catch (error) {
    console.error('Delete activity error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
