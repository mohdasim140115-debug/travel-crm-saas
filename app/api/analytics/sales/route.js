import connectDB from '@/lib/mongodb'
import Lead from '@/models/Lead'
import Booking from '@/models/Booking'
import FollowUp from '@/models/FollowUp'
import { authenticate, requireRoles } from '@/lib/middleware'
import mongoose from 'mongoose'

function startOfDay(d) {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

// The server (Vercel) runs in UTC, but "today" for this CRM's users means
// the calendar day in India (IST, UTC+5:30) — the timezone the scheduledDate
// pickers, the phone in the sales agent's hand, and `toLocaleString()` in
// their browser all use. Bucketing "today" by raw UTC would put IST's first
// ~5.5 hours of each day (00:00–05:30 IST) on the *previous* UTC day, so a
// follow-up an agent sees as "today" at 12:30 AM IST would get filed as
// pending/overdue instead. IST has no DST, so a fixed offset is safe.
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

    const forbidden = requireRoles(authResult.user.role, ['agent', 'manager'])
    if (forbidden) {
      return Response.json({ error: forbidden.error }, { status: forbidden.status })
    }

    await connectDB()
    const tid = new mongoose.Types.ObjectId(String(authResult.user.teamId))
    const uid = new mongoose.Types.ObjectId(String(authResult.user.userId))

    // Activity metrics (new leads, itineraries sent, bookings closed) can be
    // scoped to a date range so Sales can see how much work happened in a
    // given period — with no range given, they show all-time totals.
    // Pending follow-ups / not-contacted are current backlog snapshots, not
    // period activity, so they're never date-scoped.
    const { searchParams } = new URL(request.url)
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const inRange = fromParam || toParam
      ? {
          ...(fromParam ? { $gte: startOfDay(fromParam) } : {}),
          ...(toParam
            ? { $lte: new Date(new Date(toParam).setUTCHours(23, 59, 59, 999)) }
            : {}),
        }
      : null

    const base = { teamId: tid, assignedTo: uid }

    const now = new Date()
    const todayStart = istStartOfDay(now)
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

    const [newLeadsInRange, pendingFollowUpDocs, bookingDocs, notContacted] =
      await Promise.all([
        Lead.countDocuments({ ...base, ...(inRange ? { createdAt: inRange } : {}) }),
        // All pending follow-ups — deduped to one per lead below, same rule
        // the Follow-ups page uses, so this never double-counts a lead that
        // ended up with more than one pending follow-up record.
        FollowUp.find({ teamId: tid, assignedTo: uid, status: 'pending' })
          .select('leadId scheduledDate createdAt')
          .lean(),
        // This sales person's own bookings, optionally scoped to the range —
        // deduped by itinerary below (a double-submit on "Confirm booking"
        // can otherwise leave two Booking records for the same itinerary).
        Booking.find({
          teamId: tid,
          assignedTo: uid,
          ...(inRange ? { createdAt: inRange } : {}),
        })
          .select('itineraryId')
          .lean(),
        // Leads still sitting at 'new' — nobody's called them yet, since any
        // real contact would have moved the status forward.
        Lead.countDocuments({ ...base, status: 'new' }),
      ])

    // One pending follow-up per lead — whichever was created/edited most
    // recently wins (that's the one representing the sales person's current
    // intent), not whichever happens to have the furthest-out date. POST
    // /api/follow-ups now cancels a lead's older pending entries when a new
    // one is scheduled, so this is mostly a safety net for any that predate
    // that fix.
    const latestPendingPerLead = new Map()
    for (const fu of pendingFollowUpDocs) {
      const key = String(fu.leadId)
      const existing = latestPendingPerLead.get(key)
      if (!existing || new Date(fu.createdAt) > new Date(existing.createdAt)) {
        latestPendingPerLead.set(key, fu)
      }
    }
    let pendingFollowUps = 0
    let todayFollowUps = 0
    for (const fu of latestPendingPerLead.values()) {
      const d = new Date(fu.scheduledDate)
      // A follow-up due earlier today (time already passed) is just as
      // overdue as one from a previous day — only a still-upcoming time
      // today counts as "today", not "pending".
      if (d < now) pendingFollowUps++
      else if (d < todayEnd) todayFollowUps++
    }

    // One booking per itinerary.
    const seenItineraries = new Set()
    let bookingsClosed = 0
    for (const b of bookingDocs) {
      const key = String(b.itineraryId || b._id)
      if (seenItineraries.has(key)) continue
      seenItineraries.add(key)
      bookingsClosed++
    }

    // Closed leads (booked/completed) have moved on to Bookings — same rule
    // the Leads page uses to drop them off the active list, so a just-closed
    // lead doesn't crowd out what Sales should actually be working next.
    const recentLeads = await Lead.find({ ...base, status: { $nin: ['booked', 'completed'] } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('firstName lastName email phone status source destination travelDate createdAt')
      .lean()

    const dueFollowUpDocs = await FollowUp.find({
      teamId: tid,
      assignedTo: uid,
      status: 'pending',
      scheduledDate: { $lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    })
      .populate('leadId', 'firstName lastName phone')
      .sort({ scheduledDate: 1 })
      .lean()
    // Same one-per-lead rule for the "Due Follow-Ups" list shown below the
    // cards — otherwise a lead with two pending records shows up twice.
    const seenLeadsForDue = new Set()
    const dueFollowUps = []
    for (const fu of dueFollowUpDocs) {
      const key = String(fu.leadId?._id || fu.leadId)
      if (seenLeadsForDue.has(key)) continue
      seenLeadsForDue.add(key)
      dueFollowUps.push(fu)
      if (dueFollowUps.length >= 5) break
    }

    // Performance trend — bookings this sales person closed per month, for
    // the last 6 months (always this fixed window, independent of the
    // today-range filter above, since it's meant to show a trend over time).
    const trendStart = new Date()
    trendStart.setUTCMonth(trendStart.getUTCMonth() - 5, 1)
    trendStart.setUTCHours(0, 0, 0, 0)
    const monthlyBookingsAgg = await Booking.aggregate([
      { $match: { teamId: tid, assignedTo: uid, createdAt: { $gte: trendStart } } },
      {
        $group: {
          _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
    ])
    const countsByKey = new Map(monthlyBookingsAgg.map((r) => [`${r._id.y}-${r._id.m}`, r.count]))
    const monthlyBookings = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setUTCMonth(d.getUTCMonth() - i, 1)
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`
      monthlyBookings.push({
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        count: countsByKey.get(key) || 0,
      })
    }

    return Response.json({
      today: {
        newLeads: newLeadsInRange,
        pendingFollowUps,
        todayFollowUps,
        bookingsClosed,
        notContacted,
      },
      recentLeads,
      dueFollowUps,
      monthlyBookings,
    })
  } catch (error) {
    console.error('Sales analytics error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
