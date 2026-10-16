import connectDB from '@/lib/mongodb'
import DayPlanTemplate from '@/models/DayPlanTemplate'
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
    const template = await DayPlanTemplate.findOne(scope(user, id))
    if (!template) return Response.json({ error: 'Template not found' }, { status: 404 })

    const fields = ['title', 'distance', 'duration', 'description', 'isActive']
    for (const f of fields) {
      if (body[f] !== undefined) template[f] = body[f]
    }
    template.updatedBy = user.userId
    await template.save()

    await recordAudit({
      teamId: user.teamId,
      entity: 'day_plan_template',
      entityId: template._id,
      action: 'update',
      summary: `Updated day plan template "${template.title}"`,
      actor: user,
    })

    return Response.json({ template })
  } catch (error) {
    console.error('Update day plan template error:', error)
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
    const template = await DayPlanTemplate.findOne(scope(user, id))
    if (!template) return Response.json({ error: 'Template not found' }, { status: 404 })

    if (action === 'archive') {
      template.isArchived = true
      template.isActive = false
    } else if (action === 'restore') {
      template.isArchived = false
      template.isActive = true
    } else if (action === 'toggle') {
      template.isActive = !template.isActive
    } else {
      return Response.json({ error: 'Unknown action' }, { status: 400 })
    }
    template.updatedBy = user.userId
    await template.save()

    await recordAudit({
      teamId: user.teamId,
      entity: 'day_plan_template',
      entityId: template._id,
      action: action === 'archive' ? 'archive' : action === 'restore' ? 'restore' : 'update',
      summary: `${action} day plan template "${template.title}"`,
      actor: user,
    })

    return Response.json({ template })
  } catch (error) {
    console.error('Patch day plan template error:', error)
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
    const template = await DayPlanTemplate.findOneAndDelete(scope(user, id))
    if (!template) return Response.json({ error: 'Template not found' }, { status: 404 })

    await recordAudit({
      teamId: user.teamId,
      entity: 'day_plan_template',
      entityId: template._id,
      action: 'delete',
      summary: `Deleted day plan template "${template.title}"`,
      actor: user,
    })

    return Response.json({ deleted: true })
  } catch (error) {
    console.error('Delete day plan template error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
