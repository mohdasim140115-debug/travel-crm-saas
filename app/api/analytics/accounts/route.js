import connectDB from '@/lib/mongodb'
import Invoice from '@/models/Invoice'
import Payment from '@/models/Payment'
import Booking from '@/models/Booking'
import ItineraryDay from '@/models/ItineraryDay'
import Lead from '@/models/Lead' // eslint-disable-line no-unused-vars -- registers the schema so Booking.populate('leadId') resolves
import User from '@/models/User' // eslint-disable-line no-unused-vars -- registers the schema so Booking.populate('assignedTo') resolves
import { authenticate, requireRoles } from '@/lib/middleware'
import mongoose from 'mongoose'

export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const forbidden = requireRoles(authResult.user.role, ['accounts', 'admin'])
    if (forbidden) {
      return Response.json({ error: forbidden.error }, { status: forbidden.status })
    }

    await connectDB()
    const tid = new mongoose.Types.ObjectId(String(authResult.user.teamId))

    // Each booking round-robins to exactly one Accounts employee — an
    // individual accounts user should only see the bookings routed to them,
    // not the whole team's queue. Admin/owner still gets the full workspace view.
    const bookingScope =
      authResult.user.role === 'accounts' ? { accountsAssignedTo: authResult.user.userId } : {}
    // Invoices don't have a round-robin assignee — whoever created it owns it.
    const invoiceScope = authResult.user.role === 'accounts' ? { createdBy: authResult.user.userId } : {}

    // "Pending Payments" = invoices with a balance still due whose due date is
    // within the next 24 hours (or already passed) — the payments an accounts
    // person actually needs to chase right now, not just any unpaid invoice.
    const dueWindow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const duePaymentsQuery = {
      teamId: tid,
      paymentStatus: { $in: ['unpaid', 'partial'] },
      dueDate: { $lte: dueWindow },
      ...invoiceScope,
    }

    // Ongoing/upcoming/arriving-tomorrow — date-only comparison so
    // time-of-day never puts a booking in the wrong bucket.
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 86400000 - 1)
    const tomorrowStart = new Date(todayStart.getTime() + 86400000)
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 86400000 - 1)

    // A booking only counts as "in queue" until it's been invoiced at all —
    // once any invoice (Partial/Advance/Final) exists for it, its billing has
    // started and it drops out of this queue, rather than sitting in the
    // count forever just because status stays 'confirmed'.
    const invoicedBookingIds = await Invoice.find({ teamId: tid }).distinct('bookingId')

    // These tiles used to count off each Booking's own startDate/endDate —
    // which go stale the moment the day-wise plan is edited afterward
    // without updating them. The Invoices page (what these tiles link to)
    // already uses the itinerary's actual plan dates via GET /api/bookings,
    // so counting off the same source here is what keeps the tile's number
    // and the list you land on actually matching.
    const confirmedBookings = await Booking.find({ teamId: tid, status: 'confirmed', ...bookingScope })
      .select('startDate endDate itineraryId leadId bookingNumber totalAmount')
      .populate('leadId', 'firstName lastName phone')
      .lean()

    const itineraryIds = confirmedBookings.map((b) => b.itineraryId).filter(Boolean)
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

    let bookingsInQueue = 0
    let ongoingClients = 0
    let upcomingClients = 0
    let arrivingTomorrowCount = 0
    const arrivingTomorrow = []
    for (const b of confirmedBookings) {
      const planRange = planRangeByItinerary.get(String(b.itineraryId))
      const startDate = planRange?.start || b.startDate
      const endDate = planRange?.end || b.endDate
      if (!invoicedBookingIds.some((id) => String(id) === String(b._id))) bookingsInQueue++
      if (startDate && new Date(startDate) <= todayEnd && endDate && new Date(endDate) >= todayStart) {
        ongoingClients++
      } else if (startDate && new Date(startDate) > todayEnd) {
        upcomingClients++
      }
      if (startDate && new Date(startDate) >= tomorrowStart && new Date(startDate) <= tomorrowEnd) {
        arrivingTomorrowCount++
        arrivingTomorrow.push({ ...b, startDate, endDate })
      }
    }
    arrivingTomorrow.sort((a, b) => new Date(a.startDate) - new Date(b.startDate))

    const [pendingPayments, advanceInvoices, finalInvoices, creditNotes] = await Promise.all([
      Invoice.countDocuments(duePaymentsQuery),
      Invoice.countDocuments({ teamId: tid, invoiceType: 'advance' }),
      Invoice.countDocuments({ teamId: tid, invoiceType: 'tax_invoice' }),
      Invoice.countDocuments({ teamId: tid, invoiceType: 'credit_note' }),
    ])

    const duePayments = await Invoice.find(duePaymentsQuery)
      .sort({ dueDate: 1 })
      .limit(10)
      .select('invoiceNumber clientName totalAmount amountPaid dueDate')
      .lean()

    const revenueCollected = await Payment.aggregate([
      { $match: { teamId: tid, status: 'completed' } },
      { $group: { _id: null, sum: { $sum: '$amount' } } },
    ])

    const pendingAmount = await Invoice.aggregate([
      { $match: { teamId: tid, paymentStatus: { $in: ['unpaid', 'partial', 'overdue'] } } },
      { $group: { _id: null, sum: { $sum: { $subtract: ['$totalAmount', '$amountPaid'] } } } },
    ])

    const recentInvoices = await Invoice.find({ teamId: tid })
      .sort({ createdAt: -1 })
      .limit(8)
      .select('invoiceNumber invoiceType clientName totalAmount amountPaid paymentStatus status createdAt')
      .lean()

    const recentBookings = await Booking.find({
      teamId: tid,
      status: 'confirmed',
      ...bookingScope,
      _id: { $nin: invoicedBookingIds },
    })
      .populate('leadId', 'firstName lastName')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean()

    // New advance payments Sales has taken (with proof screenshot) that
    // Accounts hasn't yet turned into an advance invoice — the "you have a
    // new booking to invoice" queue. A booking counts as handled once an
    // advance invoice exists for it.
    const advanceInvoicedBookingIds = await Invoice.find({ teamId: tid, invoiceType: 'advance' }).distinct(
      'bookingId'
    )
    let pendingAdvancePayments = await Payment.find({
      teamId: tid,
      type: 'advance',
      bookingId: { $nin: advanceInvoicedBookingIds },
    })
      .populate('leadId', 'firstName lastName phone')
      .populate('bookingId', 'bookingNumber totalAmount accountsAssignedTo')
      .populate('processedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
    if (authResult.user.role === 'accounts') {
      pendingAdvancePayments = pendingAdvancePayments.filter(
        (p) => String(p.bookingId?.accountsAssignedTo || '') === String(authResult.user.userId)
      )
    }

    // Cancelled bookings still owing a refund to the client — Operations
    // enters the amount at cancel time, Accounts settles it here.
    const refundsPending = await Booking.find({
      teamId: tid,
      status: 'cancelled',
      refundStatus: 'pending',
      ...bookingScope,
    })
      .populate('leadId', 'firstName lastName phone')
      .select('bookingNumber totalAmount cancelReason cancelledAt refundAmount leadId')
      .sort({ cancelledAt: -1 })
      .lean()

    return Response.json({
      pendingPayments,
      bookingsInQueue,
      refundsPending,
      ongoingClients,
      upcomingClients,
      arrivingTomorrowCount,
      arrivingTomorrow,
      invoiceTypes: {
        advance: advanceInvoices,
        taxInvoice: finalInvoices,
        creditNote: creditNotes,
      },
      finance: {
        revenueCollected: revenueCollected[0]?.sum || 0,
        pendingAmount: pendingAmount[0]?.sum || 0,
      },
      recentInvoices,
      recentBookings,
      duePayments,
      pendingAdvancePayments,
    })
  } catch (error) {
    console.error('Accounts analytics error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
