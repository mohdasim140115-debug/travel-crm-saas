import connectDB from '@/lib/mongodb'
import Booking from '@/models/Booking'
import Supplier from '@/models/Supplier'
import SupplierLedgerEntry from '@/models/SupplierLedgerEntry'
import ItineraryDay from '@/models/ItineraryDay'
import { authenticate, requireRoles } from '@/lib/middleware'
import { findOrCreateHotelSupplier, computeNegotiatedPrice } from '@/lib/hotelSupplier'
import { computeHotelConfirmations, deriveStatus } from '@/lib/bookingConfirmations'

function scopeFilter(id, user) {
  const query = { _id: id, teamId: user.teamId }
  if (user.role === 'operations') query.opsAssignedTo = user.userId
  if (user.role === 'accounts') query.accountsAssignedTo = user.userId
  return query
}

/** Many hotels won't hold a room until the advance lands — so Operations
 * sends the advance request (with whatever price was negotiated so far)
 * *before* the hotel is formally confirmed, not after. This saves the
 * negotiated figures + finds/creates the Supplier right here, the same way
 * a full confirm would, but leaves `confirmed: false` — the actual "Confirm
 * hotel" (and its ledger charge) only happens once Accounts marks this paid. */
export async function POST(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const forbidden = requireRoles(authResult.user.role, ['operations', 'admin'])
    if (forbidden) {
      return Response.json({ error: 'Only Operations can send an advance request' }, { status: forbidden.status })
    }

    await connectDB()
    const { id } = await params
    const body = await request.json()
    const {
      key,
      roomType,
      checkIn,
      checkOut,
      returnCheckIn,
      returnCheckOut,
      mealPlan,
      roomPrice,
      extraBedPrice,
      cnbPrice,
      extraCharge,
      extraChargeRemark,
      advanceAmount,
    } = body

    if (!key) return Response.json({ error: 'key is required' }, { status: 400 })
    if (!(Number(roomPrice) > 0)) {
      return Response.json({ error: 'Enter the room price agreed with the hotel' }, { status: 400 })
    }
    if (!(Number(advanceAmount) > 0)) {
      return Response.json({ error: 'Enter the advance amount required' }, { status: 400 })
    }
    if (checkIn && checkOut && new Date(checkOut) <= new Date(checkIn)) {
      return Response.json({ error: 'Check-out must be after check-in' }, { status: 400 })
    }
    if (Number(extraCharge) > 0 && !String(extraChargeRemark || '').trim()) {
      return Response.json({ error: 'Add a remark explaining the extra charge' }, { status: 400 })
    }

    const booking = await Booking.findOne(scopeFilter(id, authResult.user)).populate(
      'itineraryId',
      'nightStays hotels vehicles vehicle startDate endDate'
    )
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 })
    }

    const dayDates = new Map()
    const itineraryIdForDates = booking.itineraryId?._id || booking.itineraryId
    if (itineraryIdForDates) {
      const days = await ItineraryDay.find({ itineraryId: itineraryIdForDates, date: { $ne: null } })
        .select('dayNumber date')
        .lean()
      for (const d of days) dayDates.set(d.dayNumber, d.date)
    }

    const merged = computeHotelConfirmations(booking, booking.itineraryId, dayDates)
    const current = merged.find((item) => item.key === key)
    if (!current) return Response.json({ error: 'Hotel not found on this booking' }, { status: 404 })
    if (current.confirmed) {
      return Response.json({ error: 'This hotel is already confirmed' }, { status: 400 })
    }

    const negotiatedPrice = computeNegotiatedPrice({
      roomPrice,
      extraBedPrice,
      cnbPrice,
      extraCharge,
      roomCount: current.roomCount,
      nights: current.nights,
      extraBeds: current.extraBeds,
      cnbCount: current.cnbCount,
    })

    const supplier = await findOrCreateHotelSupplier(authResult.user.teamId, current.name)

    const updatedList = merged.map((item) =>
      item.key === key
        ? {
            key: item.key,
            name: item.name,
            location: item.location,
            confirmed: false,
            confirmedAt: null,
            confirmedBy: null,
            roomType: roomType || item.roomType,
            roomCount: item.roomCount,
            checkIn: checkIn || item.checkIn,
            checkOut: checkOut || item.checkOut,
            returnCheckIn: item.returnCheckIn ? returnCheckIn || item.returnCheckIn : null,
            returnCheckOut: item.returnCheckIn ? returnCheckOut || item.returnCheckOut : null,
            quotedPrice: item.quotedPrice,
            mealPlan: mealPlan ?? item.mealPlan,
            roomPrice: Number(roomPrice) || item.roomPrice,
            extraBedPrice: Number(extraBedPrice) || item.extraBedPrice || 0,
            cnbPrice: Number(cnbPrice) || item.cnbPrice || 0,
            extraCharge: Number(extraCharge) || 0,
            extraChargeRemark: extraChargeRemark || '',
            negotiatedPrice,
            advanceRequired: true,
            advanceAmount: Number(advanceAmount),
            advanceSentAt: new Date(),
            advancePaid: false,
            advancePaidAt: null,
            advancePaidScreenshot: null,
            supplierId: supplier._id,
          }
        : {
            key: item.key,
            name: item.name,
            location: item.location,
            confirmed: item.confirmed,
            confirmedAt: item.confirmedAt,
            confirmedBy: item.confirmedBy,
            roomType: item.roomType,
            roomCount: item.roomCount,
            checkIn: item.checkIn,
            checkOut: item.checkOut,
            returnCheckIn: item.returnCheckIn || null,
            returnCheckOut: item.returnCheckOut || null,
            quotedPrice: item.quotedPrice,
            mealPlan: item.mealPlan,
            roomPrice: item.roomPrice,
            extraBedPrice: item.extraBedPrice,
            cnbPrice: item.cnbPrice,
            extraCharge: item.extraCharge,
            extraChargeRemark: item.extraChargeRemark,
            negotiatedPrice: item.negotiatedPrice,
            advanceRequired: item.advanceRequired,
            advanceAmount: item.advanceAmount,
            advanceSentAt: item.advanceSentAt,
            advancePaid: item.advancePaid,
            advancePaidAt: item.advancePaidAt,
            advancePaidScreenshot: item.advancePaidScreenshot,
            supplierId: item.supplierId,
          }
    )

    booking.hotelConfirmations = updatedList
    await booking.save()

    return Response.json({
      hotelConfirmations: updatedList,
      status: deriveStatus(updatedList),
    })
  } catch (error) {
    console.error('Send hotel advance request error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Accounts marks a sent advance as paid — logs the actual payment against
 * the hotel's Supplier ledger (same effect as Suppliers → Record payment)
 * and flags it back on the booking so Operations can now confirm the hotel. */
export async function PATCH(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const forbidden = requireRoles(authResult.user.role, ['accounts', 'admin'])
    if (forbidden) {
      return Response.json({ error: 'Only Accounts can mark an advance as paid' }, { status: forbidden.status })
    }

    await connectDB()
    const { id } = await params
    const { key, screenshotUrl } = await request.json()
    if (!key) return Response.json({ error: 'key is required' }, { status: 400 })
    if (!screenshotUrl) {
      return Response.json(
        { error: 'Upload a screenshot of the payment made to the hotel before marking this as paid' },
        { status: 400 }
      )
    }

    const booking = await Booking.findOne(scopeFilter(id, authResult.user))
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 })
    }

    const entry = booking.hotelConfirmations.find((h) => h.key === key)
    if (!entry) return Response.json({ error: 'Hotel not found on this booking' }, { status: 404 })
    if (!entry.advanceSentAt) {
      return Response.json({ error: 'Operations has not sent this advance request yet' }, { status: 400 })
    }
    if (entry.advancePaid) {
      return Response.json({ error: 'This advance is already marked as paid' }, { status: 400 })
    }
    if (!entry.supplierId) {
      return Response.json({ error: 'No supplier linked to this hotel yet' }, { status: 400 })
    }

    const supplier = await Supplier.findOne({ _id: entry.supplierId, teamId: authResult.user.teamId })
    if (!supplier) return Response.json({ error: 'Supplier not found' }, { status: 404 })

    await SupplierLedgerEntry.create({
      supplierId: supplier._id,
      teamId: authResult.user.teamId,
      type: 'payment',
      amount: entry.advanceAmount,
      bookingId: booking._id,
      leadId: booking.leadId,
      hotelKey: key,
      note: `Advance payment — ${entry.name}`,
      screenshotUrl,
      date: new Date(),
      createdBy: authResult.user.userId,
    })
    supplier.balanceDue = (supplier.balanceDue || 0) - entry.advanceAmount
    await supplier.save()

    // This payment is specifically for this booking's hotel charge — apply
    // it directly to that charge entry's paidAmount (not the FIFO spread
    // used for general supplier payments) so its ledger row shows accurately.
    const charge = await SupplierLedgerEntry.findOne({ bookingId: booking._id, hotelKey: key, type: 'charge' })
    if (charge) {
      charge.paidAmount = Math.min(charge.amount, (charge.paidAmount || 0) + entry.advanceAmount)
      await charge.save()
    }

    entry.advancePaid = true
    entry.advancePaidAt = new Date()
    entry.advancePaidBy = authResult.user.userId
    entry.advancePaidScreenshot = screenshotUrl
    await booking.save()

    return Response.json({
      advancePaid: true,
      advancePaidAt: entry.advancePaidAt,
      advancePaidScreenshot: entry.advancePaidScreenshot,
      supplierBalanceDue: supplier.balanceDue,
    })
  } catch (error) {
    console.error('Mark hotel advance paid error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
