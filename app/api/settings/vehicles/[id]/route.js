import connectDB from '@/lib/mongodb'
import Vehicle from '@/models/Vehicle'
import { authenticate, requireOwnerRoles } from '@/lib/middleware'
import { recordAudit } from '@/lib/audit'
import mongoose from 'mongoose'

const OWNER_ROLES = ['admin', 'superadmin', 'itinerary_only']
// Sales/Operations/Accounts can now edit an existing vehicle's details (not
// just add new ones) — archive/restore/toggle-active and delete stay
// Owner-only since those are destructive/visibility-wide actions.
const EDIT_ROLES = [...OWNER_ROLES, 'agent', 'manager', 'operations', 'accounts']

function scope(user, id) {
  return { _id: id, teamId: new mongoose.Types.ObjectId(String(user.teamId)) }
}

async function authWithRoles(request, roles) {
  const authResult = await authenticate(request)
  if (authResult.error) {
    return { res: Response.json({ error: authResult.error }, { status: authResult.status }) }
  }
  const denied = requireOwnerRoles(authResult.user, roles)
  if (denied) return { res: Response.json({ error: denied.error }, { status: denied.status }) }
  return { user: authResult.user }
}

const authOwner = (request) => authWithRoles(request, OWNER_ROLES)
const authEdit = (request) => authWithRoles(request, EDIT_ROLES)

export async function PUT(request, { params }) {
  try {
    const { user, res } = await authEdit(request)
    if (res) return res
    await connectDB()
    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }
    const body = await request.json()
    const vehicle = await Vehicle.findOne(scope(user, id))
    if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 })

    const fields = ['name', 'priceCurrency', 'isActive']
    for (const f of fields) {
      if (body[f] !== undefined) vehicle[f] = body[f]
    }
    if (Array.isArray(body.routes)) {
      vehicle.routes = body.routes
        .filter((r) => r && (r.fromLocation || r.toLocation || r.priceAC || r.priceNonAC))
        .map((r) => ({
          fromLocation: r.fromLocation?.trim(),
          toLocation: r.toLocation?.trim(),
          priceAC: r.priceAC,
          priceNonAC: r.priceNonAC,
        }))
    }
    vehicle.updatedBy = user.userId
    await vehicle.save()

    await recordAudit({
      teamId: user.teamId,
      entity: 'vehicle',
      entityId: vehicle._id,
      action: 'update',
      summary: `Updated vehicle "${vehicle.name}"`,
      actor: user,
    })

    return Response.json({ vehicle })
  } catch (error) {
    console.error('Update vehicle error:', error)
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
    const vehicle = await Vehicle.findOne(scope(user, id))
    if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 })

    if (action === 'archive') {
      vehicle.isArchived = true
      vehicle.isActive = false
    } else if (action === 'restore') {
      vehicle.isArchived = false
      vehicle.isActive = true
    } else if (action === 'toggle') {
      vehicle.isActive = !vehicle.isActive
    } else {
      return Response.json({ error: 'Unknown action' }, { status: 400 })
    }
    vehicle.updatedBy = user.userId
    await vehicle.save()

    await recordAudit({
      teamId: user.teamId,
      entity: 'vehicle',
      entityId: vehicle._id,
      action: action === 'archive' ? 'archive' : action === 'restore' ? 'restore' : 'update',
      summary: `${action} vehicle "${vehicle.name}"`,
      actor: user,
    })

    return Response.json({ vehicle })
  } catch (error) {
    console.error('Patch vehicle error:', error)
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
    const vehicle = await Vehicle.findOneAndDelete(scope(user, id))
    if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 })

    await recordAudit({
      teamId: user.teamId,
      entity: 'vehicle',
      entityId: vehicle._id,
      action: 'delete',
      summary: `Deleted vehicle "${vehicle.name}"`,
      actor: user,
    })

    return Response.json({ deleted: true })
  } catch (error) {
    console.error('Delete vehicle error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
