import connectDB from '@/lib/mongodb'
import Lead from '@/models/Lead'
import FollowUp from '@/models/FollowUp'
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

    // `?followUp=` — "any" → has an active follow-up scheduled at all (any
    // date: overdue, today, or upcoming). "today" → due today only.
    // "pending" → strictly overdue (date already passed). "Today" and
    // "Pending" are non-overlapping buckets; "any" is their union.
    const followUpFilter = searchParams.get('followUp')
    if (followUpFilter === 'any' || followUpFilter === 'today' || followUpFilter === 'pending') {
      const candidateLeadIds = await Lead.distinct('_id', query)
      const fuQuery = { leadId: { $in: candidateLeadIds }, status: 'pending' }
      const now = new Date()
      const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      if (followUpFilter === 'today') {
        const eod = new Date(sod.getTime() + 86400000)
        fuQuery.scheduledDate = { $gte: sod, $lt: eod }
      } else if (followUpFilter === 'pending') {
        fuQuery.scheduledDate = { $lt: sod }
      }
      // followUpFilter === 'any': no extra date bound — every active follow-up counts.
      const matchingLeadIds = await FollowUp.distinct('leadId', fuQuery)
      query._id = { $in: matchingLeadIds }
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

    // Attach each visible lead's current (pending) follow-up date, if any —
    // the list shows it in its own column so a sales person doesn't have to
    // open every lead to see what's scheduled.
    if (leads.length) {
      const pendingFollowUps = await FollowUp.find({
        leadId: { $in: leads.map((l) => l._id) },
        status: 'pending',
      })
        .select('leadId scheduledDate')
        .sort({ scheduledDate: 1 })
        .lean()
      const followUpByLead = new Map()
      for (const fu of pendingFollowUps) {
        const key = String(fu.leadId)
        if (!followUpByLead.has(key)) followUpByLead.set(key, fu.scheduledDate)
      }
      for (const lead of leads) {
        lead.nextFollowUpDate = followUpByLead.get(String(lead._id)) || null
      }
    }

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
