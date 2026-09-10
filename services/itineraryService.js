import Itinerary from '@/models/Itinerary'
import ItineraryDay from '@/models/ItineraryDay'
import ItineraryHotel from '@/models/ItineraryHotel'
import ItineraryActivity from '@/models/ItineraryActivity'
import Brand from '@/models/Brand'
import { tenantFilter, withTenantBody } from '@/lib/tenant'
import { generateShareToken } from '@/utils/itinerary'
import { canOnlyViewOwnLeads } from '@/lib/permissions'

/** Same resolution the PDF export uses: the itinerary's own brand if set,
 * otherwise the team's default (or oldest) active brand — so the preview
 * page always has a company to show in its footer. */
async function resolveBrand(itinerary) {
  if (!itinerary) return null
  let brand = null
  if (itinerary.brandId) {
    brand = await Brand.findOne({ _id: itinerary.brandId, teamId: itinerary.teamId, isActive: true }).lean()
  }
  if (!brand) {
    brand = await Brand.findOne({ teamId: itinerary.teamId, isActive: true })
      .sort({ isDefault: -1, name: 1 })
      .lean()
  }
  return brand
}

function parseDate(val) {
  if (!val) return undefined
  const d = new Date(val)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Normalize visa subdocument (coerce empty strings for numbers). */
function normalizeVisa(visa) {
  if (!visa || typeof visa !== 'object') return undefined
  const processingDays = visa.processingDays
  return {
    required: Boolean(visa.required),
    type: visa.type || '',
    processingDays:
      processingDays === '' || processingDays == null
        ? undefined
        : Number(processingDays),
    cost: Number(visa.cost) || 0,
    currency: visa.currency || 'USD',
    notes: visa.notes || '',
  }
}

export async function listItineraries(authUser, options = {}) {
  const { page = 1, limit = 12, status, destination, search, assignedTo, leadId } = options
  const query = { ...tenantFilter(authUser) }
  // Sales staff (agent/manager) only ever see itineraries they personally
  // built — not the owner's, not another sales person's — same boundary as
  // leads. Owner/operations/accounts/superadmin still see the whole workspace.
  if (canOnlyViewOwnLeads(authUser.role)) {
    query.createdBy = authUser.userId
  }
  if (status) query.status = status
  if (destination) query.destination = new RegExp(destination, 'i')
  if (assignedTo) query.assignedTo = assignedTo
  if (leadId) query.leadId = leadId
  if (search) {
    query.$or = [
      { tripName: new RegExp(search, 'i') },
      { title: new RegExp(search, 'i') },
      { destination: new RegExp(search, 'i') },
      { customerName: new RegExp(search, 'i') },
      { country: new RegExp(search, 'i') },
    ]
  }

  const skip = (page - 1) * limit
  const [items, total] = await Promise.all([
    Itinerary.find(query)
      // The list only renders a small card (name, dates, destination, status,
      // banner). The heavy embedded arrays — the full day-wise plan, hotels,
      // activities, gallery, the T&C / marketing prose — can be hundreds of KB
      // per document; pulling 12 of those was what made this page crawl. Drop
      // them here; the detail/edit page still loads the full document.
      .select(
        '-days -hotels -activities -flights -transfers -vehicles -gallery ' +
          '-inclusions -exclusions -termsAndConditions -marketingOverview ' +
          '-cancellationPolicy -supplements -categoryTotals -nightStays ' +
          '-extraCharges -vehicleDetails -notes'
      )
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('leadId', 'firstName lastName email')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Itinerary.countDocuments(query),
  ])

  const ids = items.map((i) => i._id)
  const dayCounts = await ItineraryDay.aggregate([
    { $match: { itineraryId: { $in: ids } } },
    { $group: { _id: '$itineraryId', count: { $sum: 1 } } },
  ])
  const countMap = Object.fromEntries(dayCounts.map((d) => [String(d._id), d.count]))

  const itineraries = items.map((item) => ({
    ...item,
    dayCount: countMap[String(item._id)] || 0,
  }))

  return {
    itineraries,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
  }
}

export async function getItineraryFull(id, authUser) {
  // Same ownership boundary as the list — a sales rep hitting another
  // itinerary's URL directly must not bypass the "own only" restriction.
  const ownerScope = canOnlyViewOwnLeads(authUser.role) ? { createdBy: authUser.userId } : {}

  // These 4 queries are independent (days/hotels/activities only need `id`,
  // already known) — fire them together instead of one-at-a-time.
  const [itinerary, days, hotels, activities] = await Promise.all([
    Itinerary.findOne({ _id: id, ...tenantFilter(authUser), ...ownerScope })
      .populate('assignedTo', 'name email phone')
      .populate('createdBy', 'name email')
      .populate('leadId', 'firstName lastName email phone')
      .lean(),
    ItineraryDay.find({ itineraryId: id }).sort({ sortOrder: 1, dayNumber: 1 }).lean(),
    ItineraryHotel.find({ itineraryId: id }).lean(),
    ItineraryActivity.find({ itineraryId: id }).lean(),
  ])

  if (!itinerary) return null

  const brand = await resolveBrand(itinerary)

  return {
    itinerary,
    days,
    hotels,
    activities,
    brand,
  }
}

export async function getItineraryByShareToken(token) {
  const itinerary = await Itinerary.findOne({ shareToken: token })
    .populate('assignedTo', 'name email phone')
    .lean()
  if (!itinerary) return null
  const [days, brand] = await Promise.all([
    ItineraryDay.find({ itineraryId: itinerary._id }).sort({ sortOrder: 1, dayNumber: 1 }).lean(),
    resolveBrand(itinerary),
  ])
  return { itinerary, days, brand }
}

async function syncDays(itineraryId, teamId, days = []) {
  await ItineraryDay.deleteMany({ itineraryId })
  await ItineraryActivity.deleteMany({ itineraryId })

  if (!days.length) return []

  const docs = days.map((day, index) => ({
    itineraryId,
    teamId,
    dayNumber: day.dayNumber ?? index + 1,
    sortOrder: day.sortOrder ?? index,
    title: day.title || `Day ${day.dayNumber ?? index + 1}`,
    description: day.description,
    date: parseDate(day.date),
    distance: day.distance,
    travelDuration: day.travelDuration,
    hotel: day.hotel,
    meals: day.meals || [],
    activities: day.activities || [],
    transfers: day.transfers || [],
    timelineBlocks: day.timelineBlocks || [],
    notes: day.notes,
    images: day.images || [],
  }))

  const created = await ItineraryDay.insertMany(docs)

  const activityDocs = []
  created.forEach((dayDoc, i) => {
    const acts = days[i]?.activities || []
    acts.forEach((act) => {
      if (act?.name) {
        activityDocs.push({
          itineraryId,
          dayId: dayDoc._id,
          teamId,
          name: act.name,
          time: act.time,
          duration: act.duration,
          description: act.description,
          location: act.location,
          cost: act.cost || 0,
          currency: act.currency || 'INR',
        })
      }
    })
  })
  if (activityDocs.length) await ItineraryActivity.insertMany(activityDocs)

  return created
}

async function syncTripHotels(itineraryId, teamId, hotels = []) {
  await ItineraryHotel.deleteMany({ itineraryId, $or: [{ dayId: null }, { dayId: { $exists: false } }] })
  if (!hotels?.length) return
  const docs = hotels
    .filter((h) => h?.name)
    .map((h) => ({
      itineraryId,
      teamId,
      name: h.name,
      location: h.location,
      checkIn: parseDate(h.checkIn),
      checkOut: parseDate(h.checkOut),
      roomType: h.roomType,
      stars: h.stars,
      category: h.category,
      cost: h.cost || 0,
      currency: h.currency || 'USD',
      images: h.images || [],
      amenities: h.amenities || [],
      notes: h.notes,
    }))
  if (docs.length) await ItineraryHotel.insertMany(docs)
}

export async function createItinerary(authUser, body) {
  const payload = withTenantBody(authUser, {
    ...body,
    tripName: body.tripName,
    title: body.tripName,
    startDate: parseDate(body.startDate),
    endDate: parseDate(body.endDate),
    shareToken: generateShareToken(),
    createdBy: authUser.userId,
    visa: normalizeVisa(body.visa),
  })
  delete payload.days

  const itinerary = await Itinerary.create(payload)
  const { days, hotels } = body
  await syncDays(itinerary._id, authUser.teamId, days)
  await syncTripHotels(itinerary._id, authUser.teamId, hotels || body.hotels)

  return getItineraryFull(itinerary._id, authUser)
}

export async function updateItinerary(id, authUser, body) {
  const ownerScope = canOnlyViewOwnLeads(authUser.role) ? { createdBy: authUser.userId } : {}
  const filter = { _id: id, ...tenantFilter(authUser), ...ownerScope }
  const { days, hotels, ...rest } = body
  const updates = { ...rest }
  if (updates.startDate) updates.startDate = parseDate(updates.startDate)
  if (updates.endDate) updates.endDate = parseDate(updates.endDate)
  if (updates.tripName) updates.title = updates.tripName
  if (updates.visa !== undefined) updates.visa = normalizeVisa(updates.visa)
  delete updates.teamId
  delete updates.brandId
  delete updates.createdBy
  delete updates.shareToken

  const itinerary = await Itinerary.findOneAndUpdate(filter, updates, { new: true })
  if (!itinerary) return null

  if (days !== undefined) await syncDays(id, authUser.teamId, days)
  if (hotels !== undefined) await syncTripHotels(id, authUser.teamId, hotels)

  return getItineraryFull(id, authUser)
}

export async function deleteItinerary(id, authUser) {
  const ownerScope = canOnlyViewOwnLeads(authUser.role) ? { createdBy: authUser.userId } : {}
  const filter = { _id: id, ...tenantFilter(authUser), ...ownerScope }
  const itinerary = await Itinerary.findOneAndDelete(filter)
  if (!itinerary) return null
  await Promise.all([
    ItineraryDay.deleteMany({ itineraryId: id }),
    ItineraryHotel.deleteMany({ itineraryId: id }),
    ItineraryActivity.deleteMany({ itineraryId: id }),
  ])
  return itinerary
}

export async function duplicateItinerary(id, authUser) {
  const full = await getItineraryFull(id, authUser)
  if (!full) return null

  const { itinerary, days } = full
  const copy = {
    ...itinerary,
    tripName: `${itinerary.tripName || itinerary.title} (Copy)`,
    status: 'draft',
    shareToken: generateShareToken(),
  }
  delete copy._id
  delete copy.createdAt
  delete copy.updatedAt

  return createItinerary(authUser, {
    ...copy,
    days: days.map((d) => {
      const { _id, itineraryId, createdAt, updatedAt, ...rest } = d
      return rest
    }),
  })
}

export function ensureShareToken(itinerary) {
  if (itinerary.shareToken) return itinerary.shareToken
  const token = generateShareToken()
  return token
}
