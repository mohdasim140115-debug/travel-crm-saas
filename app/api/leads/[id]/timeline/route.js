import connectDB from '@/lib/mongodb'
import Lead from '@/models/Lead'
import LeadTimeline from '@/models/LeadTimeline'
import { authenticate, requireLeadAccess } from '@/lib/middleware'
import { canOnlyViewOwnLeads } from '@/lib/permissions'
import { leadByIdFilter } from '@/lib/tenant'
import mongoose from 'mongoose'

function leadQuery(authUser, id) {
  return leadByIdFilter(authUser, id, canOnlyViewOwnLeads)
}

export async function GET(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const leadDenied = requireLeadAccess(authResult.user.role)
    if (leadDenied) {
      return Response.json({ error: leadDenied.error }, { status: leadDenied.status })
    }

    await connectDB()
    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid lead ID' }, { status: 400 })
    }

    const lead = await Lead.findOne(leadQuery(authResult.user, id))
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 })
    }

    const items = await LeadTimeline.find({ leadId: id, teamId: authResult.user.teamId })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email')
      .limit(200)

    return Response.json({ timeline: items })
  } catch (error) {
    console.error('Lead timeline error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const leadDenied = requireLeadAccess(authResult.user.role)
    if (leadDenied) {
      return Response.json({ error: leadDenied.error }, { status: leadDenied.status })
    }

    await connectDB()
    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid lead ID' }, { status: 400 })
    }

    const lead = await Lead.findOne(leadQuery(authResult.user, id))
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 })
    }

    const body = await request.json()
    const type = body.type || 'note'
    const title = body.title
    const text = body.body || body.note
    if (!text && type === 'note') {
      return Response.json({ error: 'body or note required' }, { status: 400 })
    }

    const entry = await LeadTimeline.create({
      leadId: lead._id,
      teamId: authResult.user.teamId,
      brandId: lead.brandId,
      type,
      title,
      body: text,
      metadata: body.metadata,
      createdBy: authResult.user.userId,
      callDurationSec: body.callDurationSec,
      callOutcome: body.callOutcome,
    })

    return Response.json({ timeline: entry }, { status: 201 })
  } catch (error) {
    console.error('Lead timeline create error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
