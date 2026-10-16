import connectDB from '@/lib/mongodb'
import SettingOption from '@/models/SettingOption'
import { authenticate, requireOwnerRoles } from '@/lib/middleware'
import { ensureSeeded } from '@/lib/masters'
import { recordAudit } from '@/lib/audit'
import { getCategory, slugifyKey } from '@/lib/masterCategories'

const OWNER_ROLES = ['admin', 'superadmin', 'itinerary_only']

/**
 * Owner master management.
 * GET  /api/settings/masters?category=lead_status   → full list (incl. inactive/archived)
 * POST /api/settings/masters                          → create option
 */
export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const denied = requireOwnerRoles(authResult.user, OWNER_ROLES)
    if (denied) return Response.json({ error: denied.error }, { status: denied.status })

    await connectDB()
    const teamId = authResult.user.teamId
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    if (!category || !getCategory(category)) {
      return Response.json({ error: 'Invalid or missing category' }, { status: 400 })
    }

    await ensureSeeded(teamId, category, authResult.user.userId)
    const options = await SettingOption.find({ teamId, category })
      .sort({ order: 1, label: 1 })
      .lean()

    return Response.json({ category, options })
  } catch (error) {
    console.error('Get masters error:', error)
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
    const teamId = authResult.user.teamId
    const body = await request.json()
    const { category, label } = body

    if (!getCategory(category)) {
      return Response.json({ error: 'Invalid category' }, { status: 400 })
    }
    if (!label || !label.trim()) {
      return Response.json({ error: 'Label is required' }, { status: 400 })
    }

    const key = (body.key && slugifyKey(body.key)) || slugifyKey(label)
    if (!key) {
      return Response.json({ error: 'Could not derive a key from label' }, { status: 400 })
    }

    const exists = await SettingOption.findOne({ teamId, category, key })
    if (exists) {
      // A "deleted" system default was really only archived (see DELETE
      // below) — the record, and its key, are still sitting in the DB. Typing
      // the same label back in reads to the owner as "re-add", not "restore
      // a hidden record", so make it act that way: revive it with whatever
      // was just submitted instead of a confusing permanent "already exists".
      if (exists.isArchived) {
        exists.isArchived = false
        exists.isActive = body.isActive !== false
        exists.label = label.trim()
        exists.description = body.description
        exists.color = body.color || exists.color || '#64748b'
        exists.icon = body.icon ?? exists.icon
        exists.updatedBy = authResult.user.userId
        await exists.save()

        await recordAudit({
          teamId,
          entity: 'setting_option',
          entityCategory: category,
          entityId: exists._id,
          action: 'restore',
          summary: `Re-added "${exists.label}" in ${category} (restored from archive)`,
          actor: authResult.user,
        })

        return Response.json({ option: exists }, { status: 201 })
      }
      return Response.json({ error: 'An option with this key already exists' }, { status: 409 })
    }

    const last = await SettingOption.findOne({ teamId, category })
      .sort({ order: -1 })
      .select('order')
      .lean()

    const option = await SettingOption.create({
      teamId,
      brandId: authResult.user.brandId || undefined,
      category,
      key,
      label: label.trim(),
      description: body.description,
      color: body.color || '#64748b',
      icon: body.icon,
      order: body.order ?? (last ? last.order + 1 : 0),
      isActive: body.isActive !== false,
      metadata: body.metadata || {},
      createdBy: authResult.user.userId,
    })

    await recordAudit({
      teamId,
      entity: 'setting_option',
      entityCategory: category,
      entityId: option._id,
      action: 'create',
      summary: `Created "${option.label}" in ${category}`,
      changes: { after: option.toObject() },
      actor: authResult.user,
    })

    return Response.json({ option }, { status: 201 })
  } catch (error) {
    console.error('Create master error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
