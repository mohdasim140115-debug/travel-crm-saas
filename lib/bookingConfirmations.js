/** A booking's hotel/vehicle confirmation checklist is derived from its
 * linked itinerary (the source of what was actually quoted) merged with
 * whatever the booking itself has already recorded as confirmed — so the
 * list always reflects the current itinerary even if it changed after the
 * booking's confirmations were last saved, without losing prior confirms. */

function dedupeByKey(items) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    if (!item.key || seen.has(item.key)) continue
    seen.add(item.key)
    out.push(item)
  }
  return out
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** `itinerary.hotels[]` has real checkIn/checkOut/roomType/cost — the
 * "closed itinerary" data quoted to the client — so it's preferred whenever
 * present. `nightStays[]` may carry its own explicit checkIn/checkOut (set in
 * the Costing step) — used as-is when present, since that's the actual truth
 * for that visit. Older stays that predate those fields fall back to the
 * day-wise plan's calendar dates (`dayDates`, keyed by dayNumber), or
 * startDate + dayNumber offset as a last resort.
 *
 * Each entry in `nightStays[]` is its own confirmation row — deliberately
 * NOT merged by hotelId. A guest who stays at Hotel A, then Hotel B, then
 * re-checks into Hotel A later in the trip is two separate stays with a gap
 * in between, not one continuous stay spanning both — grouping by hotelId
 * alone used to average the two into a single, wrong date range. */
function hotelFromNightStays(itinerary, dayDates) {
  const start = itinerary.startDate ? new Date(itinerary.startDate) : null
  const dateForDay = (dayNumber) => {
    const d = dayDates?.get ? dayDates.get(dayNumber) : dayDates?.[dayNumber]
    return d ? new Date(d) : null
  }

  return (itinerary.nightStays || [])
    .map((stay, index) => {
      if (!stay.hotelName && !stay.hotelId) return null

      const roomTypes = new Set()
      let quotedPrice = 0
      let roomCount = 0
      let nights = 0
      for (const line of stay.roomLines || []) {
        if (line.roomType) roomTypes.add(line.roomType)
        quotedPrice += (line.pricePerNight || 0) * (line.nights || 1) * (line.roomCount || 1)
        roomCount += line.roomCount || 0
        nights = Math.max(nights, Number(line.nights) || 0)
      }

      const day = typeof stay.dayNumber === 'number' ? stay.dayNumber : null
      const checkIn =
        stay.checkIn ||
        (day != null && dateForDay(day)) ||
        (start && day != null ? addDays(start, day - 1) : null)
      const checkOutDay = day != null ? day + nights : null
      const checkOut =
        stay.checkOut ||
        (checkOutDay != null && dateForDay(checkOutDay)) ||
        (checkIn && nights ? addDays(checkIn, nights) : null)

      return {
        key: `${stay.hotelId || stay.hotelName}-${index}`,
        name: stay.hotelName || '',
        location: stay.location || '',
        roomType: Array.from(roomTypes).join(', '),
        checkIn,
        checkOut,
        quotedPrice: quotedPrice || null,
        roomCount: roomCount || null,
        extraBeds: stay.extraBeds || 0,
        quotedExtraBedPrice: stay.extraBedCharge || null,
        cnbCount: stay.cnbCount || 0,
        quotedCnbPrice: stay.cnbPrice || null,
        nights: nights || null,
        // Per-room-per-night rate — what "Room price" prefills with, since
        // negotiatedPrice = roomPrice × roomCount × nights (matches how a hotel
        // actually quotes a B2B rate on the call).
        quotedRoomPricePerNight:
          quotedPrice && roomCount && nights ? quotedPrice / (roomCount * nights) : null,
      }
    })
    .filter(Boolean)
}

export function hotelSourceList(itinerary, dayDates) {
  if (!itinerary) return []
  const fromStays = hotelFromNightStays(itinerary, dayDates)
  if (fromStays.length) return dedupeByKey(fromStays)
  return dedupeByKey(
    (itinerary.hotels || []).map((h) => ({
      key: h.id || h.name,
      name: h.name || '',
      location: h.location || '',
      roomType: h.roomType || '',
      checkIn: h.checkIn || null,
      checkOut: h.checkOut || null,
      quotedPrice: h.cost ?? null,
      roomCount: null,
      extraBeds: 0,
      quotedExtraBedPrice: null,
      cnbCount: 0,
      quotedCnbPrice: null,
      nights:
        h.checkIn && h.checkOut
          ? Math.max(0, Math.round((new Date(h.checkOut) - new Date(h.checkIn)) / 86400000))
          : null,
      quotedRoomPricePerNight: h.cost ?? null,
    }))
  )
}

export function vehicleSourceList(itinerary) {
  if (!itinerary) return []
  const fromList = (itinerary.vehicles || []).map((v, i) => ({
    key: `${v.name || 'vehicle'}-${v.fromLocation || ''}-${v.toLocation || ''}-${i}`,
    name: v.name || '',
    route: [v.fromLocation, v.toLocation].filter(Boolean).join(' to '),
    // What the itinerary quoted for this vehicle — prefills the "Agreed
    // price" field so Operations only has to change it if the vendor's
    // actual rate differs from what was closed with the client.
    quotedPrice: v.cost ?? null,
  }))
  if (fromList.length) return fromList
  if (itinerary.vehicle) {
    return [{ key: itinerary.vehicle, name: itinerary.vehicle, route: '', quotedPrice: itinerary.vehicleCost ?? null }]
  }
  return []
}

export function activitySourceList(itinerary) {
  if (!itinerary) return []
  return dedupeByKey(
    (itinerary.activities || []).map((a, i) => ({
      key: a.activityId ? String(a.activityId) : `${a.name || 'activity'}-${i}`,
      name: a.name || '',
      quantity: a.quantity || 1,
      quotedPrice: a.cost ?? (a.price != null ? a.price * (a.quantity || 1) : null),
      quotedUnitPrice: a.price ?? null,
    }))
  )
}

/** Merges a source list (from the itinerary) with previously-saved
 * confirmations on the booking, keyed by `key`. Anything not yet saved
 * defaults to unconfirmed. */
export function mergeConfirmations(source, saved) {
  const savedByKey = Object.fromEntries((saved || []).map((c) => [c.key, c]))
  return source.map((item) => {
    const existing = savedByKey[item.key]
    return {
      ...item,
      // Room type/quoted price/room count stay fresh from the itinerary, but
      // fall back to what was last saved in case the itinerary has since changed.
      roomType: item.roomType || existing?.roomType || '',
      quotedPrice: item.quotedPrice ?? existing?.quotedPrice ?? null,
      quotedRoomPricePerNight: item.quotedRoomPricePerNight ?? existing?.quotedRoomPricePerNight ?? null,
      roomCount: item.roomCount ?? existing?.roomCount ?? null,
      nights: item.nights ?? existing?.nights ?? null,
      extraBeds: item.extraBeds ?? existing?.extraBeds ?? 0,
      quotedExtraBedPrice: item.quotedExtraBedPrice ?? existing?.quotedExtraBedPrice ?? null,
      cnbCount: item.cnbCount ?? existing?.cnbCount ?? 0,
      quotedCnbPrice: item.quotedCnbPrice ?? existing?.quotedCnbPrice ?? null,
      // Operations picks the actual check-in/check-out from a dropdown
      // (constrained to the itinerary's trip dates) — once they've saved a
      // choice it wins over the itinerary-derived default.
      checkIn: existing?.checkIn || item.checkIn || null,
      checkOut: existing?.checkOut || item.checkOut || null,
      // Only ever set by Operations on confirm — never derived from the itinerary.
      mealPlan: existing?.mealPlan || '',
      roomPrice: existing?.roomPrice ?? null,
      extraBedPrice: existing?.extraBedPrice ?? null,
      cnbPrice: existing?.cnbPrice ?? null,
      extraCharge: existing?.extraCharge ?? null,
      extraChargeRemark: existing?.extraChargeRemark || '',
      negotiatedPrice: existing?.negotiatedPrice ?? null,
      advanceRequired: existing?.advanceRequired ?? false,
      advanceAmount: existing?.advanceAmount ?? null,
      advanceSentAt: existing?.advanceSentAt || null,
      advancePaid: Boolean(existing?.advancePaid),
      advancePaidAt: existing?.advancePaidAt || null,
      advancePaidScreenshot: existing?.advancePaidScreenshot || null,
      supplierId: existing?.supplierId || null,
      // Vehicle-only fields — collected once Operations calls the transport supplier.
      driverName: existing?.driverName || '',
      driverPhone: existing?.driverPhone || '',
      vehicleNumber: existing?.vehicleNumber || '',
      licenseNumber: existing?.licenseNumber || '',
      // Activity/vehicle price — defaults from whatever the itinerary quoted
      // (per-guest rate for activities, the vehicle's agreed cost for
      // transport) but Operations can edit it once actually booking it.
      quantity: existing?.quantity ?? item.quantity ?? 1,
      price: existing?.price ?? item.quotedUnitPrice ?? item.quotedPrice ?? null,
      quotedUnitPrice: item.quotedUnitPrice ?? existing?.quotedUnitPrice ?? null,
      // Activity-only payment hand-off — same pattern as a hotel advance.
      paymentSentAt: existing?.paymentSentAt || null,
      paymentPaid: Boolean(existing?.paymentPaid),
      paymentPaidAt: existing?.paymentPaidAt || null,
      paymentPaidScreenshot: existing?.paymentPaidScreenshot || null,
      confirmed: Boolean(existing?.confirmed),
      confirmedAt: existing?.confirmedAt || null,
      confirmedBy: existing?.confirmedBy || null,
    }
  })
}

/** 'confirmed' only when there's at least one item and every item is
 * confirmed; 'confirmed' (vacuously) when there's nothing to confirm at all
 * so a hotel-less/vehicle-less booking never shows a false "pending". */
export function deriveStatus(list) {
  if (!list.length) return 'confirmed'
  return list.every((c) => c.confirmed) ? 'confirmed' : 'pending'
}

export function computeHotelConfirmations(booking, itinerary, dayDates) {
  return mergeConfirmations(hotelSourceList(itinerary, dayDates), booking?.hotelConfirmations)
}

export function computeVehicleConfirmations(booking, itinerary) {
  return mergeConfirmations(vehicleSourceList(itinerary), booking?.vehicleConfirmations)
}

export function computeActivityConfirmations(booking, itinerary) {
  return mergeConfirmations(activitySourceList(itinerary), booking?.activityConfirmations)
}
