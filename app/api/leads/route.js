import connectDB from '@/lib/mongodb'
import Lead from '@/models/Lead'
import FollowUp from '@/models/FollowUp'
import { authenticate, requireLeadAccess } from '@/lib/middleware'
import { canOnlyViewOwnLeads } from '@/lib/permissions'
import { tenantFilter } from '@/lib/tenant'
import { ingestLead } from '@/lib/leadIngest'
import { rateLimit } from '@/lib/rate-limit'
import mongoose from 'mongoose'

// India (IST, UTC+5:30) calendar day — same fixed-offset day boundary the
// Sales dashboard uses, so "today" means the same thing in both places.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
function istStartOfDay(d) {
  const shifted = new Date(new Date(d).getTime() + IST_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - IST_OFFSET_MS)
}

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
    // date: overdue, today, or upcoming). "pending" → overdue: the scheduled
    // date/time has already passed. "today" → still due later today.
    // "Today" and "Pending" are non-overlapping buckets; "any" is their union.
    //
    // This has to bucket EXACTLY like the Sales dashboard tiles
    // (app/api/analytics/sales/route.js) — one follow-up per lead (the most
    // recently created pending one), "pending" = before right now, "today" =
    // from now to the end of the IST day — or the tile says 34 and the list
    // it links to shows a different set.
    const followUpFilter = searchParams.get('followUp')
    if (followUpFilter === 'any' || followUpFilter === 'today' || followUpFilter === 'pending') {
      const candidateLeadIds = await Lead.distinct('_id', query)
      const fuQuery = { leadId: { $in: candidateLeadIds }, status: 'pending' }
      if (canOnlyViewOwnLeads(authResult.user.role)) {
        fuQuery.assignedTo = new mongoose.Types.ObjectId(String(authResult.user.userId))
      }
      const pendingFus = await FollowUp.find(fuQuery).select('leadId scheduledDate createdAt').lean()
      const latestPerLead = new Map()
      for (const fu of pendingFus) {
        const key = String(fu.leadId)
        const existing = latestPerLead.get(key)
        if (!existing || new Date(fu.createdAt) > new Date(existing.createdAt)) latestPerLead.set(key, fu)
      }
      const now = new Date()
      const todayEnd = new Date(istStartOfDay(now).getTime() + 86400000)
      const matchingLeadIds = []
      for (const fu of latestPerLead.values()) {
        const d = new Date(fu.scheduledDate)
        const isPending = d < now
        const isToday = !isPending && d < todayEnd
        if (
          followUpFilter === 'any' ||
          (followUpFilter === 'pending' && isPending) ||
          (followUpFilter === 'today' && isToday)
        ) {
          matchingLeadIds.push(fu.leadId)
        }
      }
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
        // Most recently created first — the same follow-up the filters above
        // and the dashboard tiles treat as "the" pending one for a lead.
        .sort({ createdAt: -1 })
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
