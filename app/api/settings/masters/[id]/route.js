import connectDB from '@/lib/mongodb'
import SettingOption from '@/models/SettingOption'
import { authenticate, requireOwnerRoles } from '@/lib/middleware'
import { recordAudit } from '@/lib/audit'
import { isLockedOption } from '@/lib/masterCategories'
import mongoose from 'mongoose'

const OWNER_ROLES = ['admin', 'superadmin', 'itinerary_only']

function tenantScope(user, id) {
  return { _id: id, teamId: new mongoose.Types.ObjectId(String(user.teamId)) }
}

async function authOwner(request) {
  const authResult = await authenticate(request)
  if (authResult.error) {
    return { res: Response.json({ error: authResult.error }, { status: authResult.status }) }
  }
  const denied = requireOwnerRoles(authResult.user, OWNER_ROLES)
  if (denied) {
    return { res: Response.json({ error: denied.error }, { status: denied.status }) }
  }
  return { user: authResult.user }
}

/** Update label/color/icon/order/active */
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

    const existing = await SettingOption.findOne(tenantScope(user, id))
    if (!existing) return Response.json({ error: 'Option not found' }, { status: 404 })

    // Locked system defaults may only be reordered — never renamed/edited.
    if (isLockedOption(existing)) {
      const protectedFields = ['label', 'description', 'color', 'icon', 'isActive', 'metadata']
      if (protectedFields.some((f) => body[f] !== undefined)) {
        return Response.json(
          { error: 'This is a locked system default and cannot be edited.' },
          { status: 403 }
        )
      }
    }

    const before = existing.toObject()
    const fields = ['label', 'description', 'color', 'icon', 'order', 'isActive', 'metadata']
    for (const f of fields) {
      if (body[f] !== undefined) existing[f] = body[f]
    }
    existing.updatedBy = user.userId
    await existing.save()

    await recordAudit({
      teamId: user.teamId,
      entity: 'setting_option',
      entityCategory: existing.category,
      entityId: existing._id,
      action: 'update',
      summary: `Updated "${existing.label}" in ${existing.category}`,
      changes: { before, after: existing.toObject() },
      actor: user,
    })

    return Response.json({ option: existing })
  } catch (error) {
    console.error('Update master error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Archive / restore / toggle active */
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

    const option = await SettingOption.findOne(tenantScope(user, id))
    if (!option) return Response.json({ error: 'Option not found' }, { status: 404 })

    if (isLockedOption(option)) {
      return Response.json(
        { error: 'This is a locked system default and cannot be changed.' },
        { status: 403 }
      )
    }

    let auditAction = 'update'
    if (action === 'archive') {
      option.isArchived = true
      option.isActive = false
      auditAction = 'archive'
    } else if (action === 'restore') {
      option.isArchived = false
      option.isActive = true
      auditAction = 'restore'
    } else if (action === 'toggle') {
      option.isActive = !option.isActive
    } else {
      return Response.json({ error: 'Unknown action' }, { status: 400 })
    }
    option.updatedBy = user.userId
    await option.save()

    await recordAudit({
      teamId: user.teamId,
      entity: 'setting_option',
      entityCategory: option.category,
      entityId: option._id,
      action: auditAction,
      summary: `${action} "${option.label}" in ${option.category}`,
      actor: user,
    })

    return Response.json({ option })
  } catch (error) {
    console.error('Patch master error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Delete (system defaults are archived instead of hard-deleted) */
export async function DELETE(request, { params }) {
  try {
    const { user, res } = await authOwner(request)
    if (res) return res
    await connectDB()
    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    const option = await SettingOption.findOne(tenantScope(user, id))
    if (!option) return Response.json({ error: 'Option not found' }, { status: 404 })

    if (isLockedOption(option)) {
      return Response.json(
        { error: 'This is a locked system default and cannot be deleted.' },
        { status: 403 }
      )
    }

    if (option.isSystem) {
      // Protect seeded defaults — archive instead of destroying.
      option.isArchived = true
      option.isActive = false
      option.updatedBy = user.userId
      await option.save()
      await recordAudit({
        teamId: user.teamId,
        entity: 'setting_option',
        entityCategory: option.category,
        entityId: option._id,
        action: 'archive',
        summary: `Archived system option "${option.label}" in ${option.category}`,
        actor: user,
      })
      return Response.json({ archived: true, option })
    }

    await option.deleteOne()
    await recordAudit({
      teamId: user.teamId,
      entity: 'setting_option',
      entityCategory: option.category,
      entityId: option._id,
      action: 'delete',
      summary: `Deleted "${option.label}" in ${option.category}`,
      changes: { before: option.toObject() },
      actor: user,
    })

    return Response.json({ deleted: true })
  } catch (error) {
    console.error('Delete master error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
