import connectDB from '@/lib/mongodb'
import FollowUp from '@/models/FollowUp'
import Lead from '@/models/Lead'
import { authenticate } from '@/lib/middleware'
import { tenantFilter } from '@/lib/tenant'
import { canOnlyViewOwnLeads } from '@/lib/permissions'
import { enqueueFollowUpReminder } from '@/lib/queue/bull'
import mongoose from 'mongoose'

export async function GET(request) {
  try {
    await connectDB()

    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page')) || 1
    const limit = parseInt(searchParams.get('limit')) || 10
    const status = searchParams.get('status')
    const leadId = searchParams.get('leadId')
    const overdue = searchParams.get('overdue') === 'true'

    const tf = tenantFilter(authResult.user)
    if (canOnlyViewOwnLeads(authResult.user.role)) {
      tf.assignedTo = new mongoose.Types.ObjectId(String(authResult.user.userId))
    }
    const leadIds = await Lead.distinct('_id', tf)
    const query = { leadId: { $in: leadIds } }
    if (status) query.status = status
    if (leadId) query.leadId = leadId
    const now = new Date()
    if (overdue) {
      query.scheduledDate = { $lt: now }
      query.status = 'pending'
    }

    // The Follow-ups list page asks for every lead's *current* follow-up (no
    // status, no leadId) and then keeps one row per lead client-side. Each
    // reschedule leaves a `cancelled` tombstone behind (see POST below), so
    // months in, those superseded records vastly outnumber the live ones —
    // sorted oldest-first and capped at `limit`, they'd crowd a freshly
    // scheduled (future-dated) follow-up right out of the response, and it
    // would look like it vanished from "All". Excluding them here, and
    // ordering by most-recently-touched, keeps the newest follow-ups in the
    // window. Per-lead history views (they pass leadId) still get everything.
    const isListView = !status && !leadId && !overdue
    if (isListView) {
      query.status = { $in: ['pending', 'completed'] }
    }

    const [totalFollowUps, followUps] = await Promise.all([
      FollowUp.countDocuments(query),
      FollowUp.find(query)
        .populate('leadId', 'firstName lastName email phone status destination')
        .populate('assignedTo', 'name email avatar')
        .sort(isListView ? { updatedAt: -1 } : { scheduledDate: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ])

    return Response.json({
      success: true,
      followUps,
      pagination: {
        page,
        limit,
        total: totalFollowUps,
        pages: Math.ceil(totalFollowUps / limit),
      },
    })
  } catch (error) {
    console.error('Get follow-ups error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await connectDB()

    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = await request.json()
    const { leadId, type, scheduledDate, description, priority } = body
    const assignedTo = body.assignedTo || authResult.user.userId

    if (!leadId || !type || !scheduledDate) {
      return Response.json(
        { error: 'Lead, type, and scheduled date are required' },
        { status: 400 }
      )
    }

    const lead = await Lead.findOne({
      _id: leadId,
      teamId: authResult.user.teamId,
    })

    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 })
    }

    // A lead should only ever have one *actionable* follow-up at a time —
    // every place that creates one here (lead edit, lost-lead follow-up,
    // status-change follow-up, this page) was leaving the previous pending
    // record untouched, so they piled up indefinitely. Whichever one has the
    // furthest-out date would then "win" in dedup'd views, silently burying
    // whatever the user just scheduled. Superseding old pending ones here —
    // once, centrally — fixes it for every caller at the source.
    await FollowUp.updateMany(
      { leadId, status: 'pending' },
      { status: 'cancelled' }
    )

    const followUp = await FollowUp.create({
      leadId,
      assignedTo,
      type,
      scheduledDate,
      description,
      priority: priority || 'medium',
      teamId: authResult.user.teamId,
      brandId: lead.brandId,
    })

    await enqueueFollowUpReminder({
      followUpId: String(followUp._id),
      teamId: String(authResult.user.teamId),
      scheduledAt: new Date(scheduledDate),
    }).catch(() => {})

    return Response.json(
      {
        message: 'Follow-up created successfully',
        followUp,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create follow-up error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
