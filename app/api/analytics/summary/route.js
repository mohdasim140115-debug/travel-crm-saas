import connectDB from '@/lib/mongodb'
import Lead from '@/models/Lead'
import Payment from '@/models/Payment'
import Booking from '@/models/Booking'
import { authenticate } from '@/lib/middleware'
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

    await connectDB()
    const tid = new mongoose.Types.ObjectId(String(authResult.user.teamId))

    const q = { teamId: tid }
    if (authResult.user.brandId) {
      q.brandId = new mongoose.Types.ObjectId(String(authResult.user.brandId))
    }

    const now = new Date()
    const sod = startOfDay(now)
    const som = startOfMonth(now)

    // Ranges: 7d / 15d / month (calendar month so far) / all.
    const params = new URL(request.url).searchParams
    const startFor = (range) =>
      range === '7d' ? new Date(sod.getTime() - 6 * 86400000)
      : range === '15d' ? new Date(sod.getTime() - 14 * 86400000)
      : range === 'month' ? som
      : null

    // Top stat cards, scoped to the selected range (leads today stays today).
    if (params.get('only') === 'cards') {
      const cardStart = startFor(params.get('cardRange') || 'month')
      const created = cardStart ? { createdAt: { $gte: cardStart } } : {}
      const [leadsToday, leadsInRange, bookedInRange, revenueRows] = await Promise.all([
        Lead.countDocuments({ ...q, createdAt: { $gte: sod } }),
        Lead.countDocuments({ ...q, ...created }),
        Lead.countDocuments({ ...q, ...created, status: 'booked' }),
        Payment.aggregate([
          { $match: { teamId: tid, status: 'completed', ...created } },
          { $group: { _id: null, sum: { $sum: '$amount' } } },
        ]).catch(() => []),
      ])
      return Response.json({
        leadsToday,
        leadsInRange,
        conversionRate: leadsInRange ? Math.round((bookedInRange / leadsInRange) * 1000) / 10 : 0,
        revenueCollected: revenueRows[0]?.sum || 0,
      })
    }

    const rangeStart = startFor(params.get('agentRange') || 'all')
    const agentMatch = {
      teamId: tid,
      status: { $ne: 'cancelled' },
      assignedTo: { $exists: true, $ne: null },
      ...(rangeStart ? { createdAt: { $gte: rangeStart } } : {}),
    }
    const agentPipeline = [
      { $match: agentMatch },
      { $group: { _id: '$assignedTo', bookings: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
      { $project: { userId: '$_id', name: { $arrayElemAt: ['$u.name', 0] }, bookings: 1 } },
      { $sort: { bookings: -1 } },
      { $limit: 10 },
    ]

    // The chart's range filter only needs this one series.
    if (params.get('only') === 'agents') {
      return Response.json({ agentPerformance: await Booking.aggregate(agentPipeline) })
    }

    const [leadsToday, leadsMonth, bySource, statusMix, booked, total, perAgent, revenuePay] =
      await Promise.all([
        Lead.countDocuments({ ...q, createdAt: { $gte: sod } }),
        Lead.countDocuments({ ...q, createdAt: { $gte: som } }),
        Lead.aggregate([{ $match: q }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
        Lead.aggregate([{ $match: q }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
        Lead.countDocuments({ ...q, status: 'booked' }),
        Lead.countDocuments(q),
        // Bookings per agent — "Booked by" is booking.assignedTo, the same
        // field the Bookings page and owner dashboard count. (Counting leads
        // assigned here showed lead totals under a "bookings" label.)
        Booking.aggregate(agentPipeline),
        Payment.aggregate([
          { $match: { teamId: tid, status: 'completed' } },
          { $group: { _id: null, sum: { $sum: '$amount' } } },
        ]).catch(() => []),
      ])

    const conversionRate = total ? Math.round((booked / total) * 1000) / 10 : 0
    const revenueCollected = revenuePay[0]?.sum || 0

    return Response.json({
      leadsToday,
      leadsMonth,
      conversionRate,
      bySource,
      statusMix,
      agentPerformance: perAgent,
      revenueCollectedApprox: revenueCollected,
    })
  } catch (error) {
    console.error('Analytics summary error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
