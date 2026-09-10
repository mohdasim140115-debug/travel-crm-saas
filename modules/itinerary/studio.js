/** A night stay's room lines, falling back to its legacy flat fields
 * (pre-roomLines itineraries) as a single line. */
export function getRoomLines(stay) {
  if (stay?.roomLines?.length) return stay.roomLines
  if (!stay) return []
  return [
    {
      roomType: stay.roomType || '',
      pricePerNight: stay.pricePerNight || 0,
      nights: stay.nights || 1,
      roomCount: stay.rooms || 1,
    },
  ]
}

/** A stay's extra-bed/CNB cost — the trip-level extra bed/CNB counts, priced at this
 * hotel's rate and charged across the stay's longest room-line duration.
 *
 * The hotel master (when available, e.g. live in the Costing step) is the
 * source of truth for the rate — a stay's own extraBedCharge/cnbPrice is
 * normally just a snapshot taken when the hotel was picked, kept in sync with
 * the master automatically. Once the agent hand-edits the rate for this one
 * stay (stay.extraChargeOverridden), that snapshot wins instead and the
 * auto-sync leaves it alone — same override pattern as the vehicle/activity
 * price edits elsewhere in Costing. */
export function getStayExtraCost(stay, master, extraBeds = 0, cnbCount = 0) {
  const nights = Math.max(0, ...getRoomLines(stay).map((l) => Number(l.nights) || 0))
  const useMaster = !!master && !stay?.extraChargeOverridden
  const extraBedCharge = Number(useMaster ? master.extraBedCharge : stay?.extraBedCharge) || 0
  const cnbPrice = Number(useMaster ? master.cnbPrice : stay?.cnbPrice) || 0
  return nights * ((Number(extraBeds) || 0) * extraBedCharge + (Number(cnbCount) || 0) * cnbPrice)
}

/** A blank room line for a new night stay / added room type row. */
export function createDefaultRoomLine() {
  return { roomType: '', pricePerNight: 0, nights: '', roomCount: '' }
}

/** The two budget tiers a "Multiple budget options" itinerary splits into —
 * fixed to exactly these two (not per-star), each with its own hotel picks,
 * night stays, and package total. */
export const BUDGET_TIERS = [
  { key: 'high', label: 'High Budget' },
  { key: 'low', label: 'Low Budget' },
]

export function budgetTierLabel(key) {
  return BUDGET_TIERS.find((t) => t.key === key)?.label || key
}

/** Builds a night-stay entry from a hotel master record, mirroring what
 * picking that hotel in the Night stays dropdown would produce — used so
 * adding a hotel under a budget tier in the Hotels step can seed a matching
 * stay without the user having to open Costing and pick it manually. */
export function createNightStayFromHotelMaster(master, dayNumber = 1, category = undefined) {
  const firstRoom = master?.rooms?.[0]
  return {
    location: master?.city || master?.destination || '',
    hotelName: master?.name || '',
    hotelId: master?._id || '',
    extraBedCharge: master?.extraBedCharge || 0,
    cnbPrice: master?.cnbPrice || 0,
    roomLines: [
      {
        ...createDefaultRoomLine(),
        roomType: firstRoom?.roomType || master?.roomType || '',
        pricePerNight: firstRoom?.price ?? master?.price ?? 0,
      },
    ],
    dayNumber,
    ...(category ? { category } : {}),
  }
}

/** Per-budget-tier package totals — hotel cost is split by the night stay's
 * `category` ('high' / 'low', set in the Hotels/Costing steps when
 * `budgetTiers` is on), while vehicle/activity/extra-charge costs are shared
 * across every tier since they're booked once for the whole trip regardless
 * of which hotel tier the client picks. Returns [] unless at least two
 * distinct categories are in use, so a normal single-hotel itinerary is
 * unaffected. */
export function computeCategoryTotals(form, hotelMasters = []) {
  const nightStays = form.nightStays || []
  const categories = BUDGET_TIERS.map((t) => t.key).filter((key) =>
    nightStays.some((s) => s.category === key)
  )
  if (categories.length < 2) return []

  const extraBeds = Number(form.extraBeds) || 0
  const cnbCount = Number(form.cnbCount) || 0
  // Vehicle/activity are booked once for the whole trip regardless of which
  // hotel tier the client ends up picking, so those stay shared across both.
  // Extra charges, though, are now scoped per tier (a 15% high-budget markup
  // is meaningless applied to the low-budget total too) — only a charge
  // tagged with this exact category counts toward it.
  const vehicleTotal = (form.vehicles || []).reduce((sum, v) => sum + (Number(v.cost) || 0), 0)
  const activityTotal = (form.activities || []).reduce((sum, a) => sum + (Number(a.cost) || 0), 0)
  const sharedTotal = vehicleTotal + activityTotal

  return categories
    .map((category) => {
      const hotelTotal = nightStays
        .filter((s) => s.category === category)
        .reduce((sum, s) => {
          const roomsTotal = getRoomLines(s).reduce((lineSum, l) => {
            const nights = Number(l.nights) || 0
            const perNight = (Number(l.roomCount) || 1) * (Number(l.pricePerNight) || 0)
            return lineSum + nights * perNight
          }, 0)
          const master = hotelMasters.find((h) => h._id === s.hotelId)
          return sum + roomsTotal + getStayExtraCost(s, master, extraBeds, cnbCount)
        }, 0)
      const extraChargesTotal = (form.extraCharges || [])
        .filter((e) => e.category === category)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
      return { category, hotelTotal, total: hotelTotal + sharedTotal + extraChargesTotal }
    })
}

function defaultDates() {
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + 6)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

export const STUDIO_STEPS = [
  { id: 1, key: 'details', label: 'Details' },
  { id: 2, key: 'visuals', label: 'Visuals' },
  { id: 3, key: 'plan', label: 'Plan' },
  { id: 4, key: 'hotels', label: 'Hotels' },
  { id: 5, key: 'costing', label: 'Costing' },
  { id: 6, key: 'inclusions', label: 'Inclusions' },
  { id: 7, key: 'terms', label: 'Terms' },
]

export function leadToStudioPrefill(lead) {
  if (!lead) return {}
  const dest = lead.destinationPreference?.[0] || 'Kashmir'
  const start = lead.travelDates?.startDate
    ? new Date(lead.travelDates.startDate).toISOString().slice(0, 10)
    : undefined
  const end = lead.travelDates?.endDate
    ? new Date(lead.travelDates.endDate).toISOString().slice(0, 10)
    : undefined
  return {
    leadId: String(lead._id),
    customerName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
    customerEmail: lead.email || '',
    phone: lead.phone || lead.whatsapp || '',
    destination: dest,
    numberOfAdults: lead.numberOfTravelers || 2,
    ...(start && { startDate: start }),
    ...(end && { endDate: end }),
    tripName: dest ? `Explore ${dest}` : '',
  }
}

export const DEFAULT_STUDIO_FORM = {
  ...defaultDates(),
  leadId: '',
  tripName: '',
  customerName: '',
  customerEmail: '',
  phone: '',
  destination: 'Kashmir',
  country: 'India',
  packageCategory: 'Silver',
  duration: '6N/7D',
  customDuration: '',
  bannerImage: '',
  gallery: [],
  marketingOverview: '',
  marketingTemplate: '',
  days: [
    {
      dayNumber: 1,
      sortOrder: 0,
      title: 'ARRIVAL',
      description: '',
      date: '',
      distance: '',
      travelDuration: '',
      hotel: { name: '', location: '', stars: 0, notes: '' },
      meals: [],
      activities: [],
      transfers: [],
      timelineBlocks: [],
      notes: '',
      images: [],
    },
  ],
  hotels: [],
  budgetTiers: false,
  numberOfAdults: 2,
  numberOfChildren: 0,
  extraBeds: 0,
  cnbCount: 0,
  totalPrice: 0,
  // Lets Costing's total box be hand-edited (e.g. to round off the price)
  // instead of always showing the auto-summed value. Null = not overridden.
  totalPriceOverride: null,
  currency: 'INR',
  vehicle: '',
  vehicleCost: 0,
  vehicleDetails: null,
  vehicles: [],
  nightStays: [],
  activities: [],
  extraCharges: [],
  inclusions: [],
  exclusions: [],
  supplements: [],
  termsAndConditions: '',
  cancellationPolicy: [],
  status: 'draft',
  notes: '',
  pdfTheme: 'classic',
}

export function studioFormToPayload(form) {
  const duration =
    form.duration === 'custom' ? form.customDuration || form.duration : form.duration
  const gallery = (form.gallery || []).filter(Boolean)
  const adults = Number(form.numberOfAdults) || 0
  const children = Number(form.numberOfChildren) || 0
  const extraBeds = Number(form.extraBeds) || 0
  const cnbCount = Number(form.cnbCount) || 0
  const nightStayTotal = (form.nightStays || []).reduce((sum, s) => {
    const roomsTotal = getRoomLines(s).reduce((lineSum, line) => {
      const nights = Number(line.nights) || 0
      const perNight = (Number(line.roomCount) || 1) * (Number(line.pricePerNight) || 0)
      return lineSum + nights * perNight
    }, 0)
    return sum + roomsTotal + getStayExtraCost(s, undefined, extraBeds, cnbCount)
  }, 0)
  const vehicleTotal = (form.vehicles || []).reduce((sum, v) => sum + (Number(v.cost) || 0), 0)
  const activityTotal = (form.activities || []).reduce((sum, a) => sum + (Number(a.cost) || 0), 0)
  const extraChargesTotal = (form.extraCharges || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const autoTotal = nightStayTotal + vehicleTotal + activityTotal + extraChargesTotal
  const total =
    form.totalPriceOverride !== null && form.totalPriceOverride !== undefined && form.totalPriceOverride !== ''
      ? Number(form.totalPriceOverride)
      : autoTotal

  const autoTripName = [form.destination, form.packageCategory, 'Package'].filter(Boolean).join(' ')

  return {
    tripName: form.tripName || autoTripName || 'Unnamed Trip',
    leadId: form.leadId || undefined,
    customerName: form.customerName,
    customerEmail: form.customerEmail,
    phone: form.phone,
    destination: form.destination || 'Kashmir',
    country: form.country || 'India',
    packageCategory: form.packageCategory,
    duration,
    marketingOverview: form.marketingOverview,
    bannerImage: gallery[0] || form.bannerImage,
    gallery,
    startDate: form.startDate,
    endDate: form.endDate,
    numberOfAdults: adults,
    numberOfChildren: children,
    extraBeds,
    cnbCount,
    totalPrice: total,
    currency: form.currency || 'INR',
    vehicle: form.vehicle || '',
    vehicleCost: Number(form.vehicleCost) || 0,
    vehicleDetails: form.vehicleDetails || undefined,
    vehicles: form.vehicles || [],
    // Extra bed/CNB count is entered once for the whole trip (Costing step)
    // but needs to travel with each stay too — Operations later reads
    // nightStay.extraBeds/cnbCount directly when confirming a hotel, and it
    // was never being stamped there, only the per-stay charge rate was.
    nightStays: (form.nightStays || []).map((s) => ({
      ...s,
      extraBeds: s.extraBeds || extraBeds,
      cnbCount: s.cnbCount || cnbCount,
    })),
    activities: form.activities || [],
    extraCharges: form.extraCharges || [],
    hotels: form.hotels || [],
    budgetTiers: Boolean(form.budgetTiers),
    categoryTotals: computeCategoryTotals(form),
    inclusions: (form.inclusions || []).filter(Boolean),
    exclusions: (form.exclusions || []).filter(Boolean),
    supplements: (form.supplements || []).filter(Boolean),
    termsAndConditions: form.termsAndConditions || '',
    cancellationPolicy: (form.cancellationPolicy || []).filter(Boolean),
    status: form.status || 'draft',
    notes: form.notes || form.marketingOverview || '',
    days: form.days || [],
    pdfTheme: form.pdfTheme || 'classic',
  }
}

export function itineraryToStudioForm(data) {
  if (!data?.itinerary) return { ...DEFAULT_STUDIO_FORM }
  const it = data.itinerary
  const preset = ['3N/4D', '4N/5D', '5N/6D', '6N/7D', '7N/8D'].includes(it.duration)
    ? it.duration
    : it.duration
      ? 'custom'
      : '6N/7D'

  // leadId comes back populated (an object with firstName/email/etc, not a
  // bare id) whenever the itinerary was loaded via getItineraryFull — a plain
  // String() on that object gave the literal string "[object Object]", which
  // then failed the ObjectId cast on save.
  const leadObj = it.leadId && typeof it.leadId === 'object' ? it.leadId : null
  const leadName = leadObj
    ? [leadObj.firstName, leadObj.lastName].filter(Boolean).join(' ').trim()
    : ''

  return {
    ...DEFAULT_STUDIO_FORM,
    tripName: it.tripName || it.title || '',
    // Older itineraries didn't persist customerName separately — fall back to
    // the linked lead's name so the "Client name" field isn't blank on edit.
    customerName: it.customerName || leadName || '',
    leadId: it.leadId ? String(it.leadId._id || it.leadId) : '',
    customerEmail: it.customerEmail || leadObj?.email || '',
    phone: it.phone || leadObj?.phone || '',
    destination: it.destination || 'Kashmir',
    country: it.country || 'India',
    packageCategory: it.packageCategory || 'Silver',
    duration: preset,
    customDuration: preset === 'custom' ? it.duration || '' : '',
    bannerImage: it.bannerImage || DEFAULT_STUDIO_FORM.bannerImage,
    gallery: it.gallery?.length ? it.gallery : DEFAULT_STUDIO_FORM.gallery,
    marketingOverview: it.marketingOverview || it.notes || '',
    startDate: it.startDate ? new Date(it.startDate).toISOString().slice(0, 10) : DEFAULT_STUDIO_FORM.startDate,
    endDate: it.endDate ? new Date(it.endDate).toISOString().slice(0, 10) : DEFAULT_STUDIO_FORM.endDate,
    numberOfAdults: it.numberOfAdults ?? 2,
    numberOfChildren: it.numberOfChildren ?? 0,
    extraBeds: it.extraBeds ?? 0,
    cnbCount: it.cnbCount ?? 0,
    totalPrice: it.totalPrice ?? it.totalCost ?? 0,
    currency: it.currency || 'INR',
    vehicle: it.vehicle || '',
    vehicleCost: it.vehicleCost ?? 0,
    vehicleDetails: it.vehicleDetails || null,
    vehicles: it.vehicles?.length ? it.vehicles : [],
    nightStays: it.nightStays || [],
    activities: it.activities || [],
    extraCharges: it.extraCharges || [],
    hotels: it.hotels?.length ? it.hotels : [],
    budgetTiers: Boolean(it.budgetTiers),
    inclusions: it.inclusions?.length ? it.inclusions : DEFAULT_STUDIO_FORM.inclusions,
    exclusions: it.exclusions?.length ? it.exclusions : DEFAULT_STUDIO_FORM.exclusions,
    supplements: it.supplements?.length ? it.supplements : DEFAULT_STUDIO_FORM.supplements,
    termsAndConditions: it.termsAndConditions || DEFAULT_STUDIO_FORM.termsAndConditions,
    cancellationPolicy: it.cancellationPolicy?.length
      ? it.cancellationPolicy
      : DEFAULT_STUDIO_FORM.cancellationPolicy,
    status: it.status || 'draft',
    days: data.days?.length ? data.days : DEFAULT_STUDIO_FORM.days,
    pdfTheme: it.pdfTheme || 'classic',
  }
}
