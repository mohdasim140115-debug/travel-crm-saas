import connectDB from '@/lib/mongodb'
import Booking from '@/models/Booking'
import Lead from '@/models/Lead'
import LeadTimeline from '@/models/LeadTimeline'
import FollowUp from '@/models/FollowUp'
import User from '@/models/User'
import Itinerary from '@/models/Itinerary'
import Payment from '@/models/Payment'
import Invoice from '@/models/Invoice'
import ItineraryDay from '@/models/ItineraryDay'
import mongoose from 'mongoose'
import { authenticate, requireRoles } from '@/lib/middleware'
import { assignByRoleRoundRobin } from '@/lib/assignRoundRobin'
import {
  computeHotelConfirmations,
  computeVehicleConfirmations,
  computeActivityConfirmations,
  deriveStatus,
} from '@/lib/bookingConfirmations'

/** Confirms a manually-picked assignee is a real, active team member with the right role — never trust the client's id blindly. */
async function validateAssignee(id, teamId, role) {
  if (!id) return null
  const user = await User.findOne({ _id: id, teamId, role, isActive: true, isBlocked: false }).select('_id').lean()
  return user ? user._id :   null
}

export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    await connectDB()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const leadId = searchParams.get('leadId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    const query = { teamId: authResult.user.teamId }
    if (status) query.status = status
    if (leadId && mongoose.Types.ObjectId.isValid(leadId)) query.leadId = leadId
    // Each booking round-robins to exactly one Operations and one Accounts
    // employee — without this filter every teammate in that role would see
    // every booking in the workspace, not just the one routed to them.
    if (authResult.user.role === 'operations') query.opsAssignedTo = authResult.user.userId
    if (authResult.user.role === 'accounts') query.accountsAssignedTo = authResult.user.userId

    const skip = (page - 1) * limit

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('leadId', 'firstName lastName email phone')
        .populate(
          'itineraryId',
          'tripName title destination totalPrice nightStays hotels vehicles vehicle activities startDate'
        )
        .populate('assignedTo', 'name email')
        .populate('opsAssignedTo', 'name email')
        .populate('accountsAssignedTo', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments(query),
    ])

    // The Dates column shows the actual day-wise plan's first/last day, not
    // the itinerary's top-level startDate/endDate — those go stale if the
    // plan is edited afterward without updating them.
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
      if (!range) planRangeByItinerary.set(key, { start: d.date, end: d.date })
      else if (d.date > range.end) range.end = d.date
    }

    // Accounts doesn't care about Hotel/Transport confirmation — they need
    // to know (a) whether the advance invoice for this booking has been
    // created/paid, and (b) whether Operations has sent a hotel advance
    // request that's waiting on them to pay. Only computed when needed.
    let advanceInvoiceByBooking = new Map()
    let invoicedBookingIds = new Set()
    if (authResult.user.role === 'accounts' || authResult.user.role === 'admin') {
      const advanceInvoices = await Invoice.find({
        teamId: authResult.user.teamId,
        invoiceType: 'advance',
        bookingId: { $in: bookings.map((b) => b._id) },
      })
        .select('bookingId status paymentStatus')
        .lean()
      advanceInvoiceByBooking = new Map(advanceInvoices.map((inv) => [String(inv.bookingId), inv]))

      // Any invoice at all (Partial/Advance/Final) — this is what "Bookings
      // in Queue" on the Accounts dashboard means: still zero invoices raised.
      const anyInvoiceBookingIds = await Invoice.find({
        teamId: authResult.user.teamId,
        bookingId: { $in: bookings.map((b) => b._id) },
      }).distinct('bookingId')
      invoicedBookingIds = new Set(anyInvoiceBookingIds.map(String))
    }

    function hotelAdvanceStatus(booking) {
      // Only counts once Operations has actually clicked "Send to
      // Accountant" (advanceSentAt set) — a toggled-on-but-unsent advance
      // isn't Accounts' problem yet.
      const sent = (booking.hotelConfirmations || []).filter((h) => h.advanceSentAt)
      if (!sent.length) return 'none'
      return sent.some((h) => !h.advancePaid) ? 'pending' : 'paid'
    }

    function activityPaymentStatus(activityConfirmations) {
      const sent = activityConfirmations.filter((a) => a.paymentSentAt)
      if (!sent.length) return 'none'
      return sent.some((a) => !a.paymentPaid) ? 'pending' : 'paid'
    }

    // Hotel/Transport Status columns — derived per booking so the list
    // always reflects the current itinerary, not a possibly-stale snapshot.
    const withStatus = bookings.map((b) => {
      const planRange = planRangeByItinerary.get(String(b.itineraryId?._id || b.itineraryId))
      const advInv = advanceInvoiceByBooking.get(String(b._id))
      const activityConfirmations = computeActivityConfirmations(b, b.itineraryId)
      // The confirmation arrays (some carry base64 screenshots) and the
      // itinerary's full night-stay/hotel data are only needed to *derive* the
      // status flags below — the list page never renders the raw rows, so keep
      // them out of the response payload.
      const {
        hotelConfirmations,
        vehicleConfirmations,
        activityConfirmations: _ac,
        paymentSchedule,
        bookingDetails,
        otherExpenses,
        itineraryId,
        ...slim
      } = b
      return {
        ...slim,
        itineraryId: itineraryId
          ? {
              _id: itineraryId._id || itineraryId,
              tripName: itineraryId.tripName,
              title: itineraryId.title,
              destination: itineraryId.destination,
              totalPrice: itineraryId.totalPrice,
            }
          : null,
        startDate: planRange?.start || b.startDate,
        endDate: planRange?.end || b.endDate,
        hotelStatus: deriveStatus(computeHotelConfirmations(b, b.itineraryId)),
        vehicleStatus: deriveStatus(computeVehicleConfirmations(b, b.itineraryId)),
        activityStatus: deriveStatus(activityConfirmations),
        hasActivities: activityConfirmations.length > 0,
        advanceInvoiceStatus: !advInv
          ? 'not_created'
          : advInv.paymentStatus === 'paid'
            ? 'paid'
            : advInv.status === 'draft'
              ? 'draft'
              : 'sent',
        hotelAdvancePaymentStatus: hotelAdvanceStatus(b),
        activityPaymentStatus: activityPaymentStatus(activityConfirmations),
        hasAnyInvoice: invoicedBookingIds.has(String(b._id)),
      }
    })

    return Response.json({
      bookings: withStatus,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get bookings error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const forbidden = requireRoles(authResult.user.role, ['admin', 'manager', 'agent'])
    if (forbidden) {
      return Response.json({ error: 'Only sales team can create bookings' }, { status: forbidden.status })
    }

    await connectDB()
    const body = await request.json()

    if (!body.itineraryId) {
      return Response.json(
        { error: 'Select the itinerary the client booked on' },
        { status: 400 }
      )
    }

    // The itinerary is the single source of truth for trip dates, traveler
    // count, and amount — never trust these from the client, so a booking
    // can never end up with numbers that drift from what was actually quoted
    // and closed with the client.
    const itinerary = await Itinerary.findOne({
      _id: body.itineraryId,
      teamId: authResult.user.teamId,
    }).lean()
    if (!itinerary) {
      return Response.json({ error: 'Itinerary not found' }, { status: 404 })
    }

    // Advance payment is optional at the API level (older callers like the
    // per-itinerary "Book" button don't send it) but once provided it must
    // be backed by either a screenshot (amount > 0) or a reason (amount 0) —
    // enforced here, not just client-side, so it can't be bypassed.
    const hasAdvance = body.advanceAmount !== undefined && body.advanceAmount !== null && body.advanceAmount !== ''
    let advanceAmount = 0
    if (hasAdvance) {
      advanceAmount = Number(body.advanceAmount)
      if (Number.isNaN(advanceAmount) || advanceAmount < 0) {
        return Response.json({ error: 'Enter a valid advance amount' }, { status: 400 })
      }
      if (advanceAmount === 0 && !String(body.advanceZeroReason || '').trim()) {
        return Response.json({ error: 'Explain why the advance is 0' }, { status: 400 })
      }
      if (advanceAmount > 0 && !body.advanceScreenshot) {
        return Response.json({ error: 'Upload a screenshot of the advance payment' }, { status: 400 })
      }
    }

    // Idempotency guard: a slow request + impatient double-click on "Confirm
    // booking" (or a retried request) must never create two Booking records
    // for the same itinerary — return the existing one instead of duplicating.
    const existingBooking = await Booking.findOne({
      itineraryId: itinerary._id,
      teamId: authResult.user.teamId,
    })
      .populate('leadId', 'firstName lastName email phone')
      .populate('itineraryId', 'tripName title destination totalPrice')
      .populate('assignedTo', 'name email')
      .populate('opsAssignedTo', 'name email')
      .populate('accountsAssignedTo', 'name email')
    if (existingBooking) {
      return Response.json({
        message: 'Booking already exists for this itinerary',
        booking: existingBooking,
      })
    }

    // Generate unique booking number
    const bookingNumber = `BK-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

    // Whoever is booking can hand-pick the Operations/Accounts person; leaving
    // it blank (or picking someone invalid) falls back to round-robin so the
    // booking never ends up unassigned.
    const [pickedOps, pickedAccounts] = await Promise.all([
      validateAssignee(body.opsAssignedTo, authResult.user.teamId, 'operations'),
      validateAssignee(body.accountsAssignedTo, authResult.user.teamId, 'accounts'),
    ])
    const [opsAssignedTo, accountsAssignedTo] = await Promise.all([
      pickedOps || assignByRoleRoundRobin(authResult.user.teamId, 'operations', 'opsRoundRobinIndex'),
      pickedAccounts || assignByRoleRoundRobin(authResult.user.teamId, 'accounts', 'accountsRoundRobinIndex'),
    ])

    const booking = await Booking.create({
      leadId: body.leadId,
      itineraryId: itinerary._id,
      startDate: itinerary.startDate,
      endDate: itinerary.endDate,
      numberOfTravelers:
        itinerary.numberOfTravelers ||
        (itinerary.numberOfAdults || 0) + (itinerary.numberOfChildren || 0) ||
        1,
      totalAmount: itinerary.totalPrice || itinerary.totalCost || 0,
      currency: itinerary.currency || 'INR',
      paymentSchedule: body.paymentSchedule,
      notes: body.notes,
      bookingNumber,
      teamId: authResult.user.teamId,
      assignedTo: body.assignedTo || authResult.user.userId,
      opsAssignedTo,
      accountsAssignedTo,
      // Sales confirming here means the deal is confirmed — `status` drives
      // Accounts' and Owner's "confirmed bookings" counts, while `opsStatus`
      // separately tracks Operations' own fulfillment workflow.
      status: 'confirmed',
      opsStatus: 'awaiting_ops',
    })

    if (body.leadId) {
      await Lead.findOneAndUpdate(
        { _id: body.leadId, teamId: authResult.user.teamId },
        { status: 'booked' }
      )
      // The lead is booked now — any still-pending follow-up on it is done.
      // Closing them here, at the one place every booking path goes through
      // (Leads list, Lead detail, Follow-ups page), is what actually keeps a
      // booked lead from lingering in the Follow-ups list; the client-side
      // cleanup only ever covered one of those entry points and was
      // fire-and-forget on top of that.
      await FollowUp.updateMany(
        { leadId: body.leadId, status: 'pending' },
        { $set: { status: 'completed', completedAt: new Date() } }
      )
      await LeadTimeline.create({
        leadId: body.leadId,
        teamId: authResult.user.teamId,
        type: 'system',
        title: 'Booking confirmed',
        description: `Booking ${bookingNumber} created`,
        createdBy: authResult.user.userId,
      })
    }

    if (hasAdvance) {
      await Payment.create({
        paymentNumber: `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        bookingId: booking._id,
        leadId: body.leadId,
        amount: advanceAmount,
        currency: itinerary.currency || 'INR',
        paymentMethod: 'other',
        status: advanceAmount > 0 ? 'completed' : 'pending',
        type: 'advance',
        screenshotUrl: advanceAmount > 0 ? body.advanceScreenshot : undefined,
        zeroReason: advanceAmount === 0 ? body.advanceZeroReason : undefined,
        processedBy: authResult.user.userId,
        teamId: authResult.user.teamId,
        paidDate: new Date(),
      })
    }

    const populatedBooking = await Booking.findById(booking._id)
      .populate('leadId', 'firstName lastName email phone')
      .populate('itineraryId', 'tripName title destination totalPrice')
      .populate('assignedTo', 'name email')
      .populate('opsAssignedTo', 'name email')
      .populate('accountsAssignedTo', 'name email')

    return Response.json(
      {
        message: 'Booking created successfully',
        booking: populatedBooking,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create booking error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
