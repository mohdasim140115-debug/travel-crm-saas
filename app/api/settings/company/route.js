import connectDB from '@/lib/mongodb'
import Brand from '@/models/Brand'
import Team from '@/models/Team'
import { authenticate, requireOwnerRoles } from '@/lib/middleware'
import mongoose from 'mongoose'

// An itinerary-only account is a restricted agency owner (see Platform →
// Agencies → "Itinerary Account") — they still need to set their own logo
// and contact details so their PDFs aren't blank-branded, even though they
// have no access to the rest of Settings.
const OWNER_ROLES = ['admin', 'superadmin', 'itinerary_only']

/**
 * The "Company Profile" is the workspace's default brand — the agency whose
 * logo, contact, and bank details appear on itineraries & documents.
 */
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
    return Response.json({ company })
  } catch (error) {
    console.error('Get company error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const denied = requireOwnerRoles(authResult.user, OWNER_ROLES)
    if (denied) return Response.json({ error: denied.error }, { status: denied.status })

    await connectDB()
    const body = await request.json()
    const company = await getOrCreateCompany(authResult.user)

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return Response.json({ error: 'Company name is required' }, { status: 400 })
      company.name = name
    }

    const simpleFields = [
      'logo', 'website', 'phone', 'email', 'address', 'address2',
      'metaLink', 'scanner1', 'tagline', 'approvedBy', 'licenseNo', 'gstin',
    ]
    for (const f of simpleFields) {
      if (body[f] !== undefined) company[f] = body[f]
    }

    if (body.googleRating !== undefined) {
      const n = Number(body.googleRating)
      company.googleRating = Number.isFinite(n) && n > 0 ? Math.min(5, Math.round(n * 10) / 10) : undefined
    }

    if (body.socials !== undefined) {
      const s = body.socials || {}
      company.socials = {
        facebook: String(s.facebook || '').trim(),
        instagram: String(s.instagram || '').trim(),
        google: String(s.google || '').trim(),
        youtube: String(s.youtube || '').trim(),
      }
    }

    if (body.bankDetails !== undefined) {
      company.bankDetails = {
        bankName: body.bankDetails.bankName || '',
        accountName: body.bankDetails.accountName || '',
        accountNumber: body.bankDetails.accountNumber || '',
        ifscCode: body.bankDetails.ifscCode || '',
      }
    }

    if (body.currency !== undefined) {
      company.settings = { ...(company.settings || {}), currency: body.currency }
    }

    await company.save()
    return Response.json({ company })
  } catch (error) {
    console.error('Update company error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
