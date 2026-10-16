import connectDB from '@/lib/mongodb'
import Brand from '@/models/Brand'
import Team from '@/models/Team'
import { authenticate, requireOwnerRoles } from '@/lib/middleware'
import mongoose from 'mongoose'

const OWNER_ROLES = ['admin', 'superadmin', 'itinerary_only']
const MAX_GALLERY_IMAGES = 4

/** Same default-brand resolution as /api/settings/company — the gallery lives on the workspace's default brand. */
async function getOrCreateCompany(user) {
  const teamId = new mongoose.Types.ObjectId(String(user.teamId))
  let brand = await Brand.findOne({ teamId, isDefault: true })
  if (!brand) {
    brand = await Brand.findOne({ teamId }).sort({ createdAt: 1 })
  }
  if (!brand) {
    const team = await Team.findById(teamId).select('name').lean()
    brand = await Brand.create({
      teamId,
      name: team?.name || 'My Company',
      isDefault: true,
    })
  }
  return brand
}

export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const denied = requireOwnerRoles(authResult.user, OWNER_ROLES)
    if (denied) return Response.json({ error: denied.error }, { status: denied.status })

    await connectDB()
    const company = await getOrCreateCompany(authResult.user)
    return Response.json({ gallery: company.gallery || [] })
  } catch (error) {
    console.error('Get gallery error:', error)
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

    const body = await request.json()
    // Accepts either a single { url, label } or a batch { images: [{ url, label }] }
    // so a multi-file upload lands in one write instead of racing requests.
    const incoming = Array.isArray(body?.images)
      ? body.images
      : body?.url
        ? [{ url: body.url, label: body.label || '' }]
        : []
    const valid = incoming.filter((i) => i?.url)
    if (!valid.length) return Response.json({ error: 'Image url is required' }, { status: 400 })

    await connectDB()
    const company = await getOrCreateCompany(authResult.user)
    const gallery = company.gallery || []
    if (gallery.length + valid.length > MAX_GALLERY_IMAGES) {
      return Response.json(
        { error: `You can only add up to ${MAX_GALLERY_IMAGES} images` },
        { status: 400 }
      )
    }

    company.gallery = [...gallery, ...valid.map((i) => ({ url: i.url, label: i.label || '' }))]
    await company.save()
    return Response.json({ gallery: company.gallery })
  } catch (error) {
    console.error('Add gallery image error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const denied = requireOwnerRoles(authResult.user, OWNER_ROLES)
    if (denied) return Response.json({ error: denied.error }, { status: denied.status })

    // Deleting by the raw data-URL (a base64 image, easily several KB) as a
    // query param blows past the server's max URL/header length and fails
    // before this handler even runs — delete by the subdocument's own _id
    // instead, which stays a short, fixed-length string.
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return Response.json({ error: 'Image id is required' }, { status: 400 })

    await connectDB()
    const company = await getOrCreateCompany(authResult.user)
    company.gallery = (company.gallery || []).filter((g) => String(g._id) !== id)
    await company.save()
    return Response.json({ gallery: company.gallery })
  } catch (error) {
    console.error('Remove gallery image error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
