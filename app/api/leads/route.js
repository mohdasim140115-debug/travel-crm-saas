import connectDB from '@/lib/mongodb'
import Lead from '@/models/Lead'
import { authenticate, requireLeadAccess } from '@/lib/middleware'
import { canOnlyViewOwnLeads } from '@/lib/permissions'
import { tenantFilter } from '@/lib/tenant'
import { ingestLead } from '@/lib/leadIngest'
import { rateLimit } from '@/lib/rate-limit'
import mongoose from 'mongoose'

export async function GET(request) {
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
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    let assignedTo = searchParams.get('assignedTo')
    const source = searchParams.get('source')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    const base = tenantFilter(authResult.user)
    const query = { ...base }
    if (status) query.status = status
    if (source) query.source = source
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      query.$or = [{ firstName: re }, { lastName: re }, { email: re }, { phone: re }]
    }

    if (canOnlyViewOwnLeads(authResult.user.role)) {
      query.assignedTo = new mongoose.Types.ObjectId(String(authResult.user.userId))
    } else if (assignedTo === 'unassigned') {
      query.assignedTo = null
    } else if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
      query.assignedTo = new mongoose.Types.ObjectId(String(assignedTo))
    }

    // `?counts=1` → just the per-status breakdown (for the filter dropdown),
    // done as one aggregation instead of shipping every lead document to the
    // client to be counted there.
    if (searchParams.get('counts')) {
      const { status: _s, ...countQuery } = query
      const rows = await Lead.aggregate([
        { $match: countQuery },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ])
      const counts = {}
      for (const r of rows) counts[r._id] = r.n
      return Response.json({ counts })
    }

    const skip = (page - 1) * limit

    const [leads, total] = await Promise.all([
      Lead.find(query)
        // The list renders a compact row — the status-history log, attachments
        // and freeform metadata blob are only needed on the lead detail page.
        .select('-statusHistory -attachments -metadata')
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Lead.countDocuments(query),
    ])

    return Response.json({
      leads,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get leads error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Manual lead create from CRM dashboard */
export async function POST(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const leadDenied = requireLeadAccess(authResult.user.role)
    if (leadDenied) {
      return Response.json({ error: leadDenied.error }, { status: leadDenied.status })
    }

    const rl = await rateLimit(`lead-create:${authResult.user.teamId}:${authResult.user.userId}`, {
      windowMs: 60_000,
      max: 120,
    })
    if (!rl.ok) {
      return Response.json({ error: 'Too many requests' }, { status: 429 })
    }

    await connectDB()
    const body = await request.json()
    const { autoAssign, assignedTo, ...rest } = body

    // Sales staff only ever see their own leads (canOnlyViewOwnLeads), so a
    // lead they create by hand must land on themselves — not whoever wins the
    // round-robin — or it silently vanishes from their own dashboard.
    const finalAssignedTo =
      assignedTo || (canOnlyViewOwnLeads(authResult.user.role) ? authResult.user.userId : undefined)

    const result = await ingestLead({
      teamId: authResult.user.teamId,
      body: {
        ...rest,
        brandId: rest.brandId || authResult.user.brandId || null,
        assignedTo: finalAssignedTo,
        source: rest.source || 'direct',
      },
      channel: 'manual',
      createdBy: authResult.user.userId,
      autoAssign: finalAssignedTo ? false : autoAssign,
    })

    if (result.error) {
      return Response.json({ error: result.error }, { status: result.status })
    }

    return Response.json(
      {
        message: 'Lead created successfully',
        lead: result.lead,
      },
      { status: result.status }
    )
  } catch (error) {
    console.error('Create lead error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
