import connectDB from '@/lib/mongodb'
import Lead from '@/models/Lead'
import Booking from '@/models/Booking'
import Payment from '@/models/Payment'
import User from '@/models/User'
import FollowUp from '@/models/FollowUp'
import { authenticate, requireRoles } from '@/lib/middleware'
import mongoose from 'mongoose'

function startOfDay(d) {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function startOfMonth(d) {
  const x = new Date(d)
  x.setUTCDate(1)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const forbidden = requireRoles(authResult.user.role, ['admin', 'superadmin'])
    if (forbidden) {
      return Response.json({ error: forbidden.error }, { status: forbidden.status })
    }

    await connectDB()
    const tid = new mongoose.Types.ObjectId(String(authResult.user.teamId))
    const q = { teamId: tid }
    if (authResult.user.brandId) {
      q.brandId = new mongoose.Types.ObjectId(String(authResult.user.brandId))
    }

    const now = new Date()
    const sod = startOfDay(now)
    const eod = new Date(sod)
    eod.setUTCDate(eod.getUTCDate() + 1)
    const som = startOfMonth(now)

    // Follow-ups are scoped by their lead (a follow-up predates the teamId
    // field on some records), same boundary the /api/follow-ups list uses.
    const teamLeadIds = await Lead.distinct('_id', q)
    const fuScope = { leadId: { $in: teamLeadIds } }
    const fuPending = { ...fuScope, status: 'pending' }

    const [
      leadsToday,
      contactedToday,
      quotesToday,
      bookingsToday,
      leadsMonth,
      bookingsMonth,
      followUpsAll,
      followUpsPending,
      followUpsToday,
    ] = await Promise.all([
      Lead.countDocuments({ ...q, createdAt: { $gte: sod } }),
      Lead.countDocuments({ ...q, status: 'contacted', updatedAt: { $gte: sod } }),
      Lead.countDocuments({ ...q, status: { $in: ['quoted', 'proposal_sent'] }, updatedAt: { $gte: sod } }),
      Booking.countDocuments({ teamId: tid, createdAt: { $gte: sod } }),
      Lead.countDocuments({ ...q, createdAt: { $gte: som } }),
      Booking.countDocuments({ teamId: tid, createdAt: { $gte: som } }),
      FollowUp.countDocuments({ ...fuScope, status: { $ne: 'cancelled' } }),
      FollowUp.countDocuments(fuPending),
      FollowUp.countDocuments({ ...fuPending, scheduledDate: { $gte: sod, $lt: eod } }),
    ])

    const salesUsers = await User.find({
      teamId: tid,
      role: { $in: ['agent', 'manager'] },
      isActive: true,
    })
      .select('name email leadAssignmentWeight role')
      .lean()

    const [
      payToday,
      payMonth,
      perfRows,
      bookingsTodayByUserRows,
      bookingsMonthByUserRows,
      upcomingTours,
      currentTours,
      completedTours,
      cancelledTours,
      pendingPayments,
    ] = await Promise.all([
      Payment.aggregate([
        { $match: { teamId: tid, status: 'completed', createdAt: { $gte: sod } } },
        { $group: { _id: null, sum: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        { $match: { teamId: tid, status: 'completed', createdAt: { $gte: som } } },
        { $group: { _id: null, sum: { $sum: '$amount' } } },
      ]),
      // One aggregation across every sales user instead of 4 queries per user (N+1).
      Lead.aggregate([
        { $match: { ...q, assignedTo: { $in: salesUsers.map((u) => u._id) } } },
        {
          $group: {
            _id: '$assignedTo',
            assigned: { $sum: 1 },
            contacted: { $sum: { $cond: [{ $ne: ['$status', 'new'] }, 1, 0] } },
            quotes: {
              $sum: { $cond: [{ $in: ['$status', ['quoted', 'proposal_sent']] }, 1, 0] },
            },
            bookings: { $sum: { $cond: [{ $eq: ['$status', 'booked'] }, 1, 0] } },
          },
        },
      ]),
      // Per-employee bookings closed today — "Booked by" is booking.assignedTo
      // (the sales person who converted the lead), same field the Bookings
      // list page reads to show "Booked by: X".
      Booking.aggregate([
        {
          $match: {
            teamId: tid,
            createdAt: { $gte: sod },
            assignedTo: { $in: salesUsers.map((u) => u._id) },
          },
        },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
      // Same, but for this month — feeds the "This Month" top-3 card.
      Booking.aggregate([
        {
          $match: {
            teamId: tid,
            createdAt: { $gte: som },
            assignedTo: { $in: salesUsers.map((u) => u._id) },
          },
        },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
      Booking.countDocuments({ teamId: tid, status: 'confirmed', startDate: { $gte: now } }),
      Booking.countDocuments({
        teamId: tid,
        status: 'confirmed',
        startDate: { $lte: now },
        endDate: { $gte: now },
      }),
      Booking.countDocuments({ teamId: tid, status: 'completed' }),
      Booking.countDocuments({ teamId: tid, status: 'cancelled' }),
      Payment.countDocuments({ teamId: tid, status: 'pending' }),
    ])

    const perfByUser = new Map(perfRows.map((r) => [String(r._id), r]))
    const bookingsTodayByUser = new Map(bookingsTodayByUserRows.map((r) => [String(r._id), r.count]))
    const bookingsMonthByUser = new Map(bookingsMonthByUserRows.map((r) => [String(r._id), r.count]))
    const teamPerformance = salesUsers.map((u) => {
      const p = perfByUser.get(String(u._id))
      return {
        userId: u._id,
        name: u.name,
        role: u.role,
        weight: u.leadAssignmentWeight ?? 1,
        assignedLeads: p?.assigned || 0,
        contacted: p?.contacted || 0,
        quotes: p?.quotes || 0,
        bookings: p?.bookings || 0,
        bookingsToday: bookingsTodayByUser.get(String(u._id)) || 0,
        bookingsMonth: bookingsMonthByUser.get(String(u._id)) || 0,
      }
    })

    return Response.json({
      today: {
        newLeads: leadsToday,
        contacted: contactedToday,
        quotationsSent: quotesToday,
        bookings: bookingsToday,
        revenue: payToday[0]?.sum || 0,
      },
      thisMonth: {
        leads: leadsMonth,
        bookings: bookingsMonth,
        revenue: payMonth[0]?.sum || 0,
      },
      followUps: {
        all: followUpsAll,
        pending: followUpsPending,
        today: followUpsToday,
      },
      teamPerformance,
      tours: {
        upcoming: upcomingTours,
        current: currentTours,
        completed: completedTours,
        cancelled: cancelledTours,
      },
      finance: {
        revenueMonth: payMonth[0]?.sum || 0,
        pendingPayments,
      },
    })
  } catch (error) {
    console.error('Owner analytics error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
