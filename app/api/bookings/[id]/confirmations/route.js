import connectDB from '@/lib/mongodb'
import Booking from '@/models/Booking'
import Supplier from '@/models/Supplier'
import SupplierLedgerEntry from '@/models/SupplierLedgerEntry'
import ItineraryDay from '@/models/ItineraryDay'
import { authenticate, requireRoles } from '@/lib/middleware'
import { findOrCreateHotelSupplier, findOrCreateTransportSupplier, computeNegotiatedPrice } from '@/lib/hotelSupplier'
import {
  computeHotelConfirmations,
  computeVehicleConfirmations,
  computeActivityConfirmations,
  deriveStatus,
} from '@/lib/bookingConfirmations'

/** Confirming a hotel charges the negotiated total (room + extra bed + CNB)
 * to the hotel's Supplier ledger — the Supplier record itself may already
 * exist from an earlier advance hand-off (see hotel-advance/route.js). One
 * ledger 'charge' entry is kept per (bookingId, hotelKey); re-confirming
 * with a different price updates that same entry and adjusts
 * Supplier.balanceDue by the delta instead of double-charging. */
async function chargeSupplierForHotel({ teamId, userId, booking, item }) {
  const supplier = await findOrCreateHotelSupplier(teamId, item.name)

  const description = item.extraCharge
    ? `Room charge — ${booking.bookingNumber} — ${item.roomType || 'Room'} (+ extra charge: ${item.extraChargeRemark})`
    : `Room charge — ${booking.bookingNumber} — ${item.roomType || 'Room'}`
  const existingEntry = await SupplierLedgerEntry.findOne({
    bookingId: booking._id,
    hotelKey: item.key,
    type: 'charge',
  })

  const delta = existingEntry ? item.negotiatedPrice - existingEntry.amount : item.negotiatedPrice
  // The advance is almost always paid *before* the hotel is confirmed (that's
  // the whole point of the advance-before-confirm flow), so this charge entry
  // often doesn't exist yet when the advance is marked paid — seed its
  // paidAmount from the advance now instead of losing that payment.
  const advancePaidAmount = item.advancePaid ? Math.min(item.negotiatedPrice, item.advanceAmount || 0) : 0

  if (existingEntry) {
    existingEntry.amount = item.negotiatedPrice
    existingEntry.leadId = booking.leadId
    existingEntry.roomType = item.roomType
    existingEntry.roomCount = item.roomCount
    existingEntry.nights = item.nights
    existingEntry.checkIn = item.checkIn
    existingEntry.checkOut = item.checkOut
    existingEntry.extraBeds = item.extraBeds
    existingEntry.cnbCount = item.cnbCount
    existingEntry.mealPlan = item.mealPlan
    existingEntry.description = description
    existingEntry.supplierId = supplier._id
    existingEntry.advanceRequired = item.advanceRequired
    existingEntry.advanceAmount = item.advanceRequired ? item.advanceAmount : undefined
    existingEntry.extraCharge = item.extraCharge || undefined
    existingEntry.extraChargeRemark = item.extraCharge ? item.extraChargeRemark : undefined
    if ((existingEntry.paidAmount || 0) < advancePaidAmount) existingEntry.paidAmount = advancePaidAmount
    await existingEntry.save()
  } else {
    await SupplierLedgerEntry.create({
      supplierId: supplier._id,
      teamId,
      type: 'charge',
      amount: item.negotiatedPrice,
      paidAmount: advancePaidAmount,
      currency: booking.currency,
      bookingId: booking._id,
      leadId: booking.leadId,
      hotelKey: item.key,
      roomType: item.roomType,
      roomCount: item.roomCount,
      nights: item.nights,
      checkIn: item.checkIn,
      checkOut: item.checkOut,
      extraBeds: item.extraBeds,
      cnbCount: item.cnbCount,
      mealPlan: item.mealPlan,
      description,
      advanceRequired: item.advanceRequired,
      advanceAmount: item.advanceRequired ? item.advanceAmount : undefined,
      extraCharge: item.extraCharge || undefined,
      extraChargeRemark: item.extraCharge ? item.extraChargeRemark : undefined,
      createdBy: userId,
    })
  }

  if (delta) {
    await Supplier.updateOne({ _id: supplier._id }, { $inc: { balanceDue: delta } })
  }

  return supplier._id
}

/** Same pattern as chargeSupplierForHotel — confirming a vehicle charges the
 * agreed price to the transport vendor's Supplier ledger, keyed by vehicle
 * number (falling back to driver name) so the same car's history spans
 * every booking it's used on. */
async function chargeSupplierForVehicle({ teamId, userId, booking, item, pax, arrivalDate, departureDate }) {
  // Vehicle number is the stable identity for a car's ledger across bookings
  // — normalized (no spaces, uppercase) so formatting differences never
  // split the same car into two Supplier records; driver name is only a
  // fallback when no vehicle number was ever entered.
  const identifier = item.vehicleNumber
    ? item.vehicleNumber.replace(/\s+/g, '').toUpperCase()
    : item.driverName || item.name
  const supplier = await findOrCreateTransportSupplier(teamId, identifier)

  // Keep the driver's name/phone on the Supplier record in sync with
  // whatever Operations most recently entered — the Drivers directory reads
  // straight from here instead of re-deriving it per booking.
  if (item.driverName || item.driverPhone) {
    supplier.contactPerson = { ...supplier.contactPerson, name: item.driverName || supplier.contactPerson?.name }
    if (item.driverPhone) supplier.phone = item.driverPhone
    await supplier.save()
  }

  const description = `Transport charge — ${booking.bookingNumber} — ${item.name || 'Vehicle'}${
    item.driverName ? ` (driver: ${item.driverName})` : ''
  }`
  const existingEntry = await SupplierLedgerEntry.findOne({
    bookingId: booking._id,
    vehicleKey: item.key,
    type: 'charge',
  })

  const delta = existingEntry ? item.price - existingEntry.amount : item.price

  if (existingEntry) {
    existingEntry.amount = item.price
    existingEntry.description = description
    existingEntry.supplierId = supplier._id
    existingEntry.leadId = booking.leadId
    existingEntry.pax = pax
    existingEntry.arrivalDate = arrivalDate
    existingEntry.departureDate = departureDate
    existingEntry.pickupLocation = booking.pickupLocation
    existingEntry.dropLocation = booking.dropLocation
    existingEntry.driverName = item.driverName
    existingEntry.driverPhone = item.driverPhone
    await existingEntry.save()
  } else {
    await SupplierLedgerEntry.create({
      supplierId: supplier._id,
      teamId,
      type: 'charge',
      amount: item.price,
      currency: booking.currency,
      bookingId: booking._id,
      leadId: booking.leadId,
      vehicleKey: item.key,
      pax,
      arrivalDate,
      departureDate,
      pickupLocation: booking.pickupLocation,
      dropLocation: booking.dropLocation,
      driverName: item.driverName,
      driverPhone: item.driverPhone,
      description,
      createdBy: userId,
    })
  }

  if (delta) {
    await Supplier.updateOne({ _id: supplier._id }, { $inc: { balanceDue: delta } })
  }

  return supplier._id
}

/** Toggles a single hotel or vehicle's confirmed flag on a booking. Only
 * Operations (who actually calls the hotel/transport supplier) or an admin
 * can confirm — this is what a hotel/transport voucher generation gates on.
 * For hotels, confirming books the room+extraBed+CNB total against the
 * hotel's Supplier ledger (see chargeSupplierForHotel above). When an
 * advance is required, it must already be paid (via the hotel-advance
 * hand-off flow) before the hotel can be confirmed — hotels routinely won't
 * hold a room until the advance lands. */
export async function PATCH(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const forbidden = requireRoles(authResult.user.role, ['operations', 'admin'])
    if (forbidden) {
      return Response.json({ error: 'Only Operations can confirm hotels/transport' }, { status: forbidden.status })
    }

    await connectDB()
    const { id } = await params
    const body = await request.json()
    const {
      type,
      key,
      confirmed,
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
      advanceRequired,
      advanceAmount,
      driverName,
      driverPhone,
      vehicleNumber,
      licenseNumber,
      price,
      quantity,
    } = body

    if (!['hotel', 'vehicle', 'activity'].includes(type) || !key) {
      return Response.json({ error: 'type (hotel|vehicle|activity) and key are required' }, { status: 400 })
    }

    if (type === 'activity' && confirmed) {
      if (!(Number(price) >= 0)) {
        return Response.json({ error: 'Enter the price agreed for this activity' }, { status: 400 })
      }
      if (!(Number(quantity) > 0)) {
        return Response.json({ error: 'Enter how many guests this activity is for' }, { status: 400 })
      }
    }
    if (type === 'hotel' && confirmed) {
      if (!(Number(roomPrice) > 0)) {
        return Response.json({ error: 'Enter the room price agreed with the hotel' }, { status: 400 })
      }
      if (checkIn && checkOut && new Date(checkOut) <= new Date(checkIn)) {
        return Response.json({ error: 'Check-out must be after check-in' }, { status: 400 })
      }
      if (advanceRequired && !(Number(advanceAmount) > 0)) {
        return Response.json({ error: 'Enter the advance amount required' }, { status: 400 })
      }
      if (Number(extraCharge) > 0 && !String(extraChargeRemark || '').trim()) {
        return Response.json({ error: 'Add a remark explaining the extra charge' }, { status: 400 })
      }
    }
    if (type === 'vehicle' && confirmed) {
      if (!String(driverName || '').trim() || !String(vehicleNumber || '').trim()) {
        return Response.json({ error: 'Driver name and vehicle number are required to confirm' }, { status: 400 })
      }
      if (!(Number(price) > 0)) {
        return Response.json({ error: 'Enter the price agreed with the driver/transport vendor' }, { status: 400 })
      }
    }

    const query = { _id: id, teamId: authResult.user.teamId }
    if (authResult.user.role === 'operations') query.opsAssignedTo = authResult.user.userId

    const booking = await Booking.findOne(query).populate(
      'itineraryId',
      'nightStays hotels vehicles vehicle activities numberOfAdults numberOfChildren startDate endDate'
    )
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Same day-wise-plan-derived dates as GET /api/bookings/[id] — keeps a
    // saved check-in/check-out consistent with what the trip-date dropdown
    // actually offers, instead of the itinerary's possibly-stale startDate.
    const dayDates = new Map()
    const itineraryIdForDates = booking.itineraryId?._id || booking.itineraryId
    if (itineraryIdForDates) {
      const days = await ItineraryDay.find({ itineraryId: itineraryIdForDates, date: { $ne: null } })
        .select('dayNumber date')
        .lean()
      for (const d of days) dayDates.set(d.dayNumber, d.date)
    }

    const field =
      type === 'hotel' ? 'hotelConfirmations' : type === 'vehicle' ? 'vehicleConfirmations' : 'activityConfirmations'
    const computeFn =
      type === 'hotel' ? computeHotelConfirmations : type === 'vehicle' ? computeVehicleConfirmations : computeActivityConfirmations

    if (type === 'hotel' && confirmed) {
      const current = computeFn(booking, booking.itineraryId, dayDates).find((item) => item.key === key)
      if (advanceRequired && !current?.advancePaid) {
        return Response.json(
          { error: 'The advance must be paid by Accounts before this hotel can be confirmed' },
          { status: 400 }
        )
      }
    }
    if (type === 'activity' && confirmed) {
      const current = computeFn(booking, booking.itineraryId, dayDates).find((item) => item.key === key)
      if (!current?.paymentPaid) {
        return Response.json(
          { error: 'The payment must be made by Accounts before this activity can be confirmed' },
          { status: 400 }
        )
      }
    }

    // Rebuild the full list from the itinerary (so every current hotel/vehicle
    // has an entry) then flip the one the caller toggled.
    let merged = computeFn(booking, booking.itineraryId, dayDates).map((item) => {
      if (item.key !== key) return item

      // roomPrice/extraBedPrice/cnbPrice are per-unit rates agreed on the
      // call (per room per night, per extra bed, per CNB) — the itinerary's
      // room count / nights / extra bed & CNB counts (never edited here,
      // always itinerary-sourced) turn those into the actual total charged
      // to the hotel's Supplier ledger.
      const newRoomPrice = type === 'hotel' ? Number(roomPrice) || item.roomPrice : item.roomPrice
      const newExtraBedPrice = type === 'hotel' ? Number(extraBedPrice) || item.extraBedPrice : item.extraBedPrice
      const newCnbPrice = type === 'hotel' ? Number(cnbPrice) || item.cnbPrice : item.cnbPrice
      const newExtraCharge = type === 'hotel' ? Number(extraCharge) || 0 : item.extraCharge
      const negotiatedPrice = computeNegotiatedPrice({
        roomPrice: newRoomPrice,
        extraBedPrice: newExtraBedPrice,
        cnbPrice: newCnbPrice,
        extraCharge: newExtraCharge,
        roomCount: item.roomCount,
        nights: item.nights,
        extraBeds: item.extraBeds,
        cnbCount: item.cnbCount,
      })

      return {
        ...item,
        roomType: type === 'hotel' ? roomType || item.roomType : item.roomType,
        checkIn: type === 'hotel' ? checkIn || item.checkIn : item.checkIn,
        checkOut: type === 'hotel' ? checkOut || item.checkOut : item.checkOut,
        returnCheckIn: type === 'hotel' && item.returnCheckIn ? returnCheckIn || item.returnCheckIn : item.returnCheckIn,
        returnCheckOut: type === 'hotel' && item.returnCheckIn ? returnCheckOut || item.returnCheckOut : item.returnCheckOut,
        mealPlan: type === 'hotel' ? mealPlan ?? item.mealPlan : item.mealPlan,
        roomPrice: newRoomPrice,
        extraBedPrice: newExtraBedPrice,
        cnbPrice: newCnbPrice,
        extraCharge: newExtraCharge,
        extraChargeRemark: type === 'hotel' ? extraChargeRemark ?? item.extraChargeRemark : item.extraChargeRemark,
        negotiatedPrice: type === 'hotel' ? negotiatedPrice || item.negotiatedPrice : undefined,
        advanceRequired: type === 'hotel' ? Boolean(advanceRequired) : undefined,
        advanceAmount: type === 'hotel' ? (advanceRequired ? Number(advanceAmount) || 0 : null) : undefined,
        driverName: type === 'vehicle' ? driverName ?? item.driverName : item.driverName,
        driverPhone: type === 'vehicle' ? driverPhone ?? item.driverPhone : item.driverPhone,
        vehicleNumber: type === 'vehicle' ? vehicleNumber ?? item.vehicleNumber : item.vehicleNumber,
        licenseNumber: type === 'vehicle' ? licenseNumber ?? item.licenseNumber : item.licenseNumber,
        price:
          type === 'activity' || type === 'vehicle'
            ? price !== undefined
              ? Number(price)
              : item.price
            : item.price,
        quantity: type === 'activity' ? Number(quantity) || item.quantity : item.quantity,
        confirmed: Boolean(confirmed),
        confirmedAt: confirmed ? new Date() : null,
        confirmedBy: confirmed ? authResult.user.userId : null,
      }
    })

    if (type === 'hotel' && confirmed) {
      const target = merged.find((item) => item.key === key)
      const supplierId = await chargeSupplierForHotel({
        teamId: authResult.user.teamId,
        userId: authResult.user.userId,
        booking,
        item: target,
      })
      merged = merged.map((item) => (item.key === key ? { ...item, supplierId } : item))
    }
    if (type === 'vehicle' && confirmed) {
      const target = merged.find((item) => item.key === key)
      const dayDateValues = Array.from(dayDates.values())
      const arrivalDate = dayDateValues.length
        ? new Date(Math.min(...dayDateValues.map((d) => new Date(d).getTime())))
        : booking.startDate
      const departureDate = dayDateValues.length
        ? new Date(Math.max(...dayDateValues.map((d) => new Date(d).getTime())))
        : booking.endDate
      const pax = (booking.itineraryId?.numberOfAdults || 0) + (booking.itineraryId?.numberOfChildren || 0)
      const supplierId = await chargeSupplierForVehicle({
        teamId: authResult.user.teamId,
        userId: authResult.user.userId,
        booking,
        item: target,
        pax,
        arrivalDate,
        departureDate,
      })
      merged = merged.map((item) => (item.key === key ? { ...item, supplierId } : item))
    }

    booking[field] = merged.map((item) => {
      if (type === 'hotel') {
        return {
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
      }
      if (type === 'vehicle') {
        return {
          key: item.key,
          name: item.name,
          route: item.route,
          confirmed: item.confirmed,
          confirmedAt: item.confirmedAt,
          confirmedBy: item.confirmedBy,
          driverName: item.driverName,
          driverPhone: item.driverPhone,
          vehicleNumber: item.vehicleNumber,
          licenseNumber: item.licenseNumber,
          price: item.price,
          supplierId: item.supplierId,
        }
      }
      return {
        key: item.key,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        quotedPrice: item.quotedPrice,
        quotedUnitPrice: item.quotedUnitPrice,
        confirmed: item.confirmed,
        confirmedAt: item.confirmedAt,
        confirmedBy: item.confirmedBy,
        paymentSentAt: item.paymentSentAt,
        paymentPaid: item.paymentPaid,
        paymentPaidAt: item.paymentPaidAt,
        paymentPaidScreenshot: item.paymentPaidScreenshot,
      }
    })
    await booking.save()

    return Response.json({
      [field]: merged,
      status: deriveStatus(merged),
    })
  } catch (error) {
    console.error('Update booking confirmation error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
