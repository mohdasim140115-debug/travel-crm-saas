import connectDB from '@/lib/mongodb'
import Booking from '@/models/Booking'
import ItineraryDay from '@/models/ItineraryDay'
import Payment from '@/models/Payment'
import Invoice from '@/models/Invoice'
import SupplierLedgerEntry from '@/models/SupplierLedgerEntry'
import { authenticate } from '@/lib/middleware'
import {
  computeHotelConfirmations,
  computeVehicleConfirmations,
  computeActivityConfirmations,
  deriveStatus,
} from '@/lib/bookingConfirmations'

/** Same scoping as the list endpoint — Operations/Accounts can only ever
 * reach a booking routed to them, everyone else is scoped to their team. */
function scopeFilter(id, user) {
  const query = { _id: id, teamId: user.teamId }
  if (user.role === 'operations') query.opsAssignedTo = user.userId
  if (user.role === 'accounts') query.accountsAssignedTo = user.userId
  return query
}

export async function GET(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    await connectDB()
    const { id } = await params
    const booking = await Booking.findOne(scopeFilter(id, authResult.user))
      .populate('leadId', 'firstName lastName email phone')
      .populate(
        'itineraryId',
        'tripName title destination totalPrice nightStays hotels vehicles vehicle transfers activities numberOfAdults numberOfChildren startDate endDate brandId'
      )
      .populate('assignedTo', 'name email')
      .populate('opsAssignedTo', 'name email')
      .populate('accountsAssignedTo', 'name email')
      .lean()

    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Arrival/departure — and each hotel's check-in/check-out — come from the
    // actual day-wise plan (dayNumber -> calendar date), not the itinerary's
    // top-level startDate/endDate — those can go stale if the plan was
    // edited afterward without updating them.
    let planStartDate = null
    let planEndDate = null
    const dayDates = new Map()
    const itineraryId = booking.itineraryId?._id || booking.itineraryId
    if (itineraryId) {
      const days = await ItineraryDay.find({ itineraryId, date: { $ne: null } })
        .select('dayNumber date')
        .sort({ date: 1 })
        .lean()
      if (days.length) {
        planStartDate = days[0].date
        planEndDate = days[days.length - 1].date
        for (const d of days) dayDates.set(d.dayNumber, d.date)
      }
    }

    let hotelConfirmations = computeHotelConfirmations(booking, booking.itineraryId, dayDates)
    let vehicleConfirmations = computeVehicleConfirmations(booking, booking.itineraryId)
    const activityConfirmations = computeActivityConfirmations(booking, booking.itineraryId)

    // Full client ledger for Accounts — the advance Sales collected, every
    // invoice raised against this booking, and what's owed downstream.
    const [advancePayment, invoices, charges] = await Promise.all([
      Payment.findOne({ bookingId: booking._id, type: 'advance' }).lean(),
      Invoice.find({ bookingId: booking._id })
        .select('invoiceNumber invoiceType totalAmount amountPaid paymentStatus status createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      SupplierLedgerEntry.find({ bookingId: booking._id, type: 'charge' })
        .select('hotelKey vehicleKey amount paidAmount')
        .lean(),
    ])

    // Accounts pays a supplier in lump sums, not per-booking, so a hotel or
    // vehicle's own "cleared vs balance" comes from its specific charge
    // entry's paidAmount (auto-allocated in app/api/suppliers/[id]/payments)
    // — not the supplier's overall running balance.
    const chargeByHotelKey = new Map(charges.filter((c) => c.hotelKey).map((c) => [c.hotelKey, c]))
    const chargeByVehicleKey = new Map(charges.filter((c) => c.vehicleKey).map((c) => [c.vehicleKey, c]))
    hotelConfirmations = hotelConfirmations.map((h) => {
      const charge = chargeByHotelKey.get(h.key)
      return charge ? { ...h, chargePaidAmount: charge.paidAmount || 0 } : h
    })
    vehicleConfirmations = vehicleConfirmations.map((v) => {
      const charge = chargeByVehicleKey.get(v.key)
      return charge ? { ...v, chargePaidAmount: charge.paidAmount || 0 } : v
    })

    return Response.json({
      booking: {
        ...booking,
        hotelConfirmations,
        vehicleConfirmations,
        activityConfirmations,
        hotelStatus: deriveStatus(hotelConfirmations),
        vehicleStatus: deriveStatus(vehicleConfirmations),
        activityStatus: deriveStatus(activityConfirmations),
        planStartDate: planStartDate || booking.itineraryId?.startDate || booking.startDate,
        planEndDate: planEndDate || booking.itineraryId?.endDate || booking.endDate,
        advancePayment,
        invoices,
      },
    })
  } catch (error) {
    console.error('Get booking error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Pickup/drop, and logging an ad-hoc on-ground expense, are the only things
 * directly editable here — everything else about a booking is either
 * itinerary-derived or goes through the confirmations flow
 * (app/api/bookings/[id]/confirmations). */
export async function PATCH(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    await connectDB()
    const { id } = await params
    const body = await request.json()

    if (body.otherExpense) {
      const amount = Number(body.otherExpense.amount)
      const remark = String(body.otherExpense.remark || '').trim()
      if (!(amount > 0)) {
        return Response.json({ error: 'Enter a valid expense amount' }, { status: 400 })
      }
      if (!remark) {
        return Response.json({ error: 'Add a remark explaining this expense' }, { status: 400 })
      }
      const booking = await Booking.findOneAndUpdate(
        scopeFilter(id, authResult.user),
        { $push: { otherExpenses: { amount, remark, addedAt: new Date(), addedBy: authResult.user.userId } } },
        { new: true }
      )
      if (!booking) {
        return Response.json({ error: 'Booking not found' }, { status: 404 })
      }
      return Response.json({ otherExpenses: booking.otherExpenses })
    }

    if (body.status === 'cancelled') {
      const cancelReason = String(body.cancelReason || '').trim()
      if (!cancelReason) {
        return Response.json({ error: 'Add a reason for cancelling this booking' }, { status: 400 })
      }
      const refundAmount = Number(body.refundAmount) || 0
      if (refundAmount < 0) {
        return Response.json({ error: 'Refund amount cannot be negative' }, { status: 400 })
      }
      const cancelled = await Booking.findOneAndUpdate(
        scopeFilter(id, authResult.user),
        {
          status: 'cancelled',
          cancelReason,
          cancelledAt: new Date(),
          cancelledBy: authResult.user.userId,
          refundAmount,
          refundStatus: refundAmount > 0 ? 'pending' : 'none',
        },
        { new: true }
      )
      if (!cancelled) {
        return Response.json({ error: 'Booking not found' }, { status: 404 })
      }
      return Response.json({ booking: cancelled })
    }

    // Only Operations/Accounts (who've actually confirmed things with
    // suppliers) or the Owner may lock/unlock Sales' ability to edit this
    // booking's itinerary — Sales can never flip its own lock back on.
    if (body.salesEditEnabled !== undefined) {
      if (!['operations', 'accounts', 'admin'].includes(authResult.user.role)) {
        return Response.json({ error: 'Not allowed' }, { status: 403 })
      }
      const booking = await Booking.findOneAndUpdate(
        scopeFilter(id, authResult.user),
        { salesEditEnabled: Boolean(body.salesEditEnabled) },
        { new: true }
      )
      if (!booking) {
        return Response.json({ error: 'Booking not found' }, { status: 404 })
      }
      return Response.json({ salesEditEnabled: booking.salesEditEnabled })
    }

    const update = {}
    if (body.pickupLocation !== undefined) update.pickupLocation = body.pickupLocation
    if (body.dropLocation !== undefined) update.dropLocation = body.dropLocation

    const booking = await Booking.findOneAndUpdate(scopeFilter(id, authResult.user), update, {
      new: true,
    })
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 })
    }

    return Response.json({
      pickupLocation: booking.pickupLocation,
      dropLocation: booking.dropLocation,
    })
  } catch (error) {
    console.error('Update booking error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
