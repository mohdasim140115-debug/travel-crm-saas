import connectDB from '@/lib/mongodb'
import Booking from '@/models/Booking'
import Voucher from '@/models/Voucher'
import ItineraryDay from '@/models/ItineraryDay'
// Not referenced directly below, but required so mongoose has these schemas
// registered before the .populate('leadId', ...) / .populate('itineraryId', ...)
// calls run — without it, a cold serverless instance that hasn't handled any
// other route yet throws "Schema hasn't been registered for model" here.
import '@/models/Lead'
import '@/models/Itinerary'
import { authenticate, requireRoles } from '@/lib/middleware'
import {
  computeHotelConfirmations,
  computeVehicleConfirmations,
  deriveStatus,
} from '@/lib/bookingConfirmations'

/** Read-only "my closed clients" list for Sales — deliberately separate from
 * the full /api/bookings endpoint (which exposes ops-only actions and every
 * booking in the team). Sales only ever sees their own bookings, and the
 * status shown here is computed live from what Operations has actually done
 * (hotel + transport confirmed, vouchers sent) rather than the loosely
 * maintained `opsStatus` enum — so it can never say "Done" prematurely. */
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
    const rawBookings = await Booking.find({
      teamId: authResult.user.teamId,
      assignedTo: authResult.user.userId,
    })
      .select('-activityConfirmations -paymentSchedule -otherExpenses -bookingDetails')
      .populate('leadId', 'firstName lastName email phone')
      .populate('itineraryId', 'tripName title destination nightStays hotels vehicles vehicle')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()

    // Older double-submits could have created more than one Booking for the
    // same itinerary (see the idempotency guard in POST /api/bookings) — keep
    // only the most recent one per itinerary so Sales never sees the same
    // closed client listed twice. Bookings without an itinerary (shouldn't
    // normally happen) are kept as-is.
    const seenItineraries = new Set()
    const bookings = rawBookings.filter((b) => {
      const key = String(b.itineraryId?._id || b.itineraryId || '')
      if (!key) return true
      if (seenItineraries.has(key)) return false
      seenItineraries.add(key)
      return true
    })

    const bookingIds = bookings.map((b) => b._id)
    const sentVouchers = await Voucher.find({
      bookingId: { $in: bookingIds },
      status: 'sent',
    })
      .select('bookingId type')
      .lean()
    const sentTypesByBooking = new Map()
    for (const v of sentVouchers) {
      const key = String(v.bookingId)
      if (!sentTypesByBooking.has(key)) sentTypesByBooking.set(key, new Set())
      sentTypesByBooking.get(key).add(v.type)
    }

    // Arrival/departure come from the actual day-wise plan (its first and
    // last day), not the itinerary's top-level startDate/endDate — those can
    // go stale if the plan was edited afterward without updating them.
    const itineraryIds = bookings.map((b) => b.itineraryId?._id || b.itineraryId).filter(Boolean)
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
      if (!range) {
        planRangeByItinerary.set(key, { start: d.date, end: d.date })
      } else {
        if (d.date < range.start) range.start = d.date
        if (d.date > range.end) range.end = d.date
      }
    }

    const result = bookings.map((b) => {
      const hotelConfirmations = computeHotelConfirmations(b, b.itineraryId)
      const vehicleConfirmations = computeVehicleConfirmations(b, b.itineraryId)
      const hotelConfirmed = deriveStatus(hotelConfirmations) === 'confirmed'
      const vehicleConfirmed = deriveStatus(vehicleConfirmations) === 'confirmed'
      const sentTypes = sentTypesByBooking.get(String(b._id)) || new Set()
      // Vacuously satisfied when the booking never needed that voucher type.
      const hotelVoucherSent = hotelConfirmations.length === 0 || sentTypes.has('hotel')
      const cabVoucherSent = vehicleConfirmations.length === 0 || sentTypes.has('cab')
      const opsComplete = hotelConfirmed && vehicleConfirmed && hotelVoucherSent && cabVoucherSent
      const planRange = planRangeByItinerary.get(String(b.itineraryId?._id || b.itineraryId))

      return {
        _id: b._id,
        bookingNumber: b.bookingNumber,
        leadId: b.leadId,
        startDate: planRange?.start || b.startDate,
        endDate: planRange?.end || b.endDate,
        opsStatus: opsComplete ? 'done' : 'processing',
      }
    })

    return Response.json({ bookings: result })
  } catch (error) {
    console.error('Get my bookings error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
