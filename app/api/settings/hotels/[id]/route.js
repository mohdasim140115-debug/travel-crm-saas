import connectDB from '@/lib/mongodb'
import Hotel from '@/models/Hotel'
import { authenticate, requireOwnerRoles } from '@/lib/middleware'
import { recordAudit } from '@/lib/audit'
import mongoose from 'mongoose'

const OWNER_ROLES = ['admin', 'superadmin', 'itinerary_only']
// Sales/Operations/Accounts can now edit an existing hotel's details (not
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
    const hotel = await Hotel.findOne(scope(user, id))
    if (!hotel) return Response.json({ error: 'Hotel not found' }, { status: 404 })

    const fields = [
      'name', 'destination', 'city', 'country', 'address', 'category', 'stars',
      'roomType', 'price', 'priceCurrency', 'rooms', 'extraBedCharge', 'cnbPrice',
      'phone', 'email', 'website', 'description', 'location', 'photos', 'amenities',
      'isActive', 'notes',
    ]
    for (const f of fields) {
      if (body[f] !== undefined) hotel[f] = body[f]
    }
    // Keep the legacy single roomType/price mirrored to the primary room entry
    // for older itinerary flows that still read hotel.price / hotel.roomType directly.
    if (body.rooms?.length) {
      hotel.roomType = body.rooms[0].roomType || hotel.roomType
      hotel.price = body.rooms[0].price ?? hotel.price
    }
    hotel.updatedBy = user.userId
    await hotel.save()

    await recordAudit({
      teamId: user.teamId,
      entity: 'hotel',
      entityId: hotel._id,
      action: 'update',
      summary: `Updated hotel "${hotel.name}"`,
      actor: user,
    })

    return Response.json({ hotel })
  } catch (error) {
    console.error('Update hotel error:', error)
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
    const hotel = await Hotel.findOne(scope(user, id))
    if (!hotel) return Response.json({ error: 'Hotel not found' }, { status: 404 })

    if (action === 'archive') {
      hotel.isArchived = true
      hotel.isActive = false
    } else if (action === 'restore') {
      hotel.isArchived = false
      hotel.isActive = true
    } else if (action === 'toggle') {
      hotel.isActive = !hotel.isActive
    } else {
      return Response.json({ error: 'Unknown action' }, { status: 400 })
    }
    hotel.updatedBy = user.userId
    await hotel.save()

    await recordAudit({
      teamId: user.teamId,
      entity: 'hotel',
      entityId: hotel._id,
      action: action === 'archive' ? 'archive' : action === 'restore' ? 'restore' : 'update',
      summary: `${action} hotel "${hotel.name}"`,
      actor: user,
    })

    return Response.json({ hotel })
  } catch (error) {
    console.error('Patch hotel error:', error)
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
    const hotel = await Hotel.findOneAndDelete(scope(user, id))
    if (!hotel) return Response.json({ error: 'Hotel not found' }, { status: 404 })

    await recordAudit({
      teamId: user.teamId,
      entity: 'hotel',
      entityId: hotel._id,
      action: 'delete',
      summary: `Deleted hotel "${hotel.name}"`,
      actor: user,
    })

    return Response.json({ deleted: true })
  } catch (error) {
    console.error('Delete hotel error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
