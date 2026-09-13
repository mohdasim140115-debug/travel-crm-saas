import connectDB from '@/lib/mongodb'
import Booking from '@/models/Booking'
import Voucher from '@/models/Voucher'
import ItineraryDay from '@/models/ItineraryDay'
import { authenticate, requireRoles } from '@/lib/middleware'
import {
  computeHotelConfirmations,
  computeVehicleConfirmations,
  deriveStatus,
} from '@/lib/bookingConfirmations'
import mongoose from 'mongoose'

export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const forbidden = requireRoles(authResult.user.role, ['operations', 'admin'])
    if (forbidden) {
      return Response.json({ error: forbidden.error }, { status: forbidden.status })
    }

    await connectDB()
    const tid = new mongoose.Types.ObjectId(String(authResult.user.teamId))
    const now = new Date()
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    // Each booking round-robins to exactly one Operations employee — an
    // individual operations user should only see (and be counted against)
    // the bookings routed to them, not the whole team's queue. Admin/owner
    // still gets the full workspace view.
    const scope = authResult.user.role === 'operations' ? { opsAssignedTo: authResult.user.userId } : {}

    // Hotel/cab confirmation status is only ever accurate when derived live
    // from the itinerary (same helpers the Bookings list & confirmation
    // modal use) — the `opsStatus` enum on the booking is not kept in sync
    // with actual confirmations, so counting off it here would drift from
    // what Operations actually sees when they open a booking.
    const scopedBookings = await Booking.find({ teamId: tid, ...scope, status: { $ne: 'cancelled' } })
      .select('opsStatus status startDate endDate hotelConfirmations vehicleConfirmations itineraryId')
      .populate('itineraryId', 'nightStays hotels vehicles vehicle')
      .limit(500)
      .lean()

    // The Dates column on the Bookings list shows the actual day-wise plan's
    // first/last day, not the booking's own startDate/endDate — those go
    // stale if the plan is edited afterward without updating them. This tile
    // must use the same source, or "Running Tours" here can disagree with
    // what actually shows as running when the tile is clicked through to.
    const itineraryIds = scopedBookings.map((b) => b.itineraryId?._id || b.itineraryId).filter(Boolean)
    const days = itineraryIds.length
      ? await ItineraryDay.find({ itineraryId: { $in: itineraryIds }, date: { $ne: null } })
          .select('itineraryId date')
          .sort({ date: 1 })
          .lean()
      : []
    const planRangeByItinerary = new Map()
    for (const d of days) {
      const key = String(d.itineraryId)
      const range = planRangeByItinerary.get(key)
      if (!range) planRangeByItinerary.set(key, { start: d.date, end: d.date })
      else if (d.date > range.end) range.end = d.date
    }

    let newBookings = 0
    let hotelPending = 0
    let cabPending = 0
    let upcomingArrivals = 0
    let runningTours = 0
    for (const b of scopedBookings) {
      if (b.opsStatus === 'awaiting_ops') newBookings++
      if (deriveStatus(computeHotelConfirmations(b, b.itineraryId)) === 'pending') hotelPending++
      if (deriveStatus(computeVehicleConfirmations(b, b.itineraryId)) === 'pending') cabPending++
      const planRange = planRangeByItinerary.get(String(b.itineraryId?._id || b.itineraryId))
      const startDate = planRange?.start || b.startDate
      const endDate = planRange?.end || b.endDate
      if (b.status === 'confirmed' && startDate) {
        const sd = new Date(startDate)
        if (sd >= now && sd <= weekAhead) upcomingArrivals++
        if (sd <= now && endDate && new Date(endDate) >= now) runningTours++
      }
    }

    // Scoped to only this operations person's own bookings — previously this
    // counted every pending voucher in the whole team regardless of who it
    // was routed to.
    const bookingIds = scopedBookings.map((b) => b._id)
    const [voucherPending, recentBookings] = await Promise.all([
      Voucher.countDocuments({
        teamId: tid,
        bookingId: { $in: bookingIds },
        status: { $in: ['pending', 'confirmed'] },
      }),
      Booking.find({
        teamId: tid,
        opsStatus: { $in: ['awaiting_ops', 'in_progress'] },
        ...scope,
      })
        .select('opsStatus status startDate endDate createdAt leadId assignedTo itineraryId bookingNumber')
        .populate('leadId', 'firstName lastName phone email')
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ])

    return Response.json({
      newBookings,
      voucherPending,
      hotelConfirmationPending: hotelPending,
      cabConfirmationPending: cabPending,
      upcomingArrivals,
      runningTours,
      recentBookings,
    })
  } catch (error) {
    console.error('Operations analytics error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
