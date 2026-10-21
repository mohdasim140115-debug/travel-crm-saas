import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb'
import Brand from '@/models/Brand'
import { authenticate, requireOwnerRoles } from '@/lib/middleware'

const OWNER_ROLES = ['admin', 'superadmin', 'itinerary_only']
const MAX_ASSOCIATE_LOGOS = 40
// Each logo arrives already shrunk in the browser; this is just a backstop.
const MAX_IMAGE_CHARS = 400 * 1024

async function guard(request) {
  const authResult = await authenticate(request)
  if (authResult.error) {
    return { res: Response.json({ error: authResult.error }, { status: authResult.status }) }
  }
  const denied = requireOwnerRoles(authResult.user, OWNER_ROLES)
  if (denied) return { res: Response.json({ error: denied.error }, { status: denied.status }) }
  return { user: authResult.user }
}

/** The workspace's Company Profile — its default (or oldest) brand. */
async function companyFor(user) {
  const teamId = new mongoose.Types.ObjectId(String(user.teamId))
  return (await Brand.findOne({ teamId, isDefault: true })) || (await Brand.findOne({ teamId }).sort({ createdAt: 1 }))
}

function validImage(value) {
  const v = String(value || '')
  return (v.startsWith('data:image/') || /^https?:\/\//.test(v)) && v.length <= MAX_IMAGE_CHARS
}

/**
 * POST { kind: 'associate' | 'registered', url } — add one associate logo,
 * or set the "Registered with" logo. Kept out of the main Company Profile
 * PUT so a wall of logos never has to fit in one request body.
 */
export async function POST(request) {
  try {
    const { user, res } = await guard(request)
    if (res) return res
    const body = await request.json().catch(() => ({}))
    if (!validImage(body?.url)) {
      return Response.json({ error: 'Upload an image (under 300 KB) or paste an image URL' }, { status: 400 })
    }
    await connectDB()
    const company = await companyFor(user)
    if (!company) return Response.json({ error: 'Save your company profile first' }, { status: 400 })

    if (body.kind === 'registered') {
      company.registeredLogo = body.url
    } else {
      if ((company.associateLogos || []).length >= MAX_ASSOCIATE_LOGOS) {
        return Response.json({ error: `You can add up to ${MAX_ASSOCIATE_LOGOS} associate logos` }, { status: 400 })
      }
      company.associateLogos.push({ url: body.url })
    }
    await company.save()
    return Response.json({ associateLogos: company.associateLogos, registeredLogo: company.registeredLogo || '' })
  } catch (error) {
    console.error('Add company logo error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE ?kind=associate&id=… | ?kind=registered — remove one logo. */
export async function DELETE(request) {
  try {
    const { user, res } = await guard(request)
    if (res) return res
    const { searchParams } = new URL(request.url)
    const kind = searchParams.get('kind')
    const id = searchParams.get('id')
    await connectDB()
    const company = await companyFor(user)
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 })

    if (kind === 'registered') {
      company.registeredLogo = undefined
    } else {
      if (!mongoose.Types.ObjectId.isValid(id)) return Response.json({ error: 'Invalid logo id' }, { status: 400 })
      company.associateLogos = (company.associateLogos || []).filter((l) => String(l._id) !== id)
    }
    await company.save()
    return Response.json({ associateLogos: company.associateLogos, registeredLogo: company.registeredLogo || '' })
  } catch (error) {
    console.error('Remove company logo error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
