/**
 * AI Itinerary Builder — drafts a day-wise itinerary with Claude, using the
 * agency's OWN Anthropic API key (bring-your-own-key: usage bills to the
 * agency's Anthropic account, not the platform's).
 *
 * The model only writes content and picks from the agency's own hotel and
 * vehicle masters by id. Every price is taken from those masters here on the
 * server — the model never invents a hotel, vehicle or price.
 */

import Anthropic from '@anthropic-ai/sdk'
import { encryptToken, decryptToken } from '@/lib/metaSync'
import { createNightStayFromHotelMaster, createDefaultRoomLine } from '@/modules/itinerary/studio'
import { DEFAULT_DAY } from '@/modules/itinerary/constants'
import { DURATION_PRESETS } from '@/lib/data/masterRepository'

export const AI_MODEL = 'claude-opus-5-5'

export const encryptAiKey = encryptToken
export const decryptAiKey = decryptToken

/** The agency's decrypted key, or null when none is configured. */
export function teamAiKey(team) {
  return decryptAiKey(team?.ai?.anthropicKeyEnc) || null
}

function makeClient(apiKey) {
  return new Anthropic({ apiKey, maxRetries: 2, timeout: 5 * 60 * 1000 })
}

/** Cheap credential check — throws the SDK's typed error on a bad key. */
export async function verifyAiKey(apiKey) {
  await makeClient(apiKey).models.retrieve(AI_MODEL)
}

/** Turn an Anthropic SDK error into a short message a travel agent can act on. */
export function friendlyAiError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'The AI key for this agency is invalid or was revoked. Ask your platform admin to update it.'
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return 'This AI key is not allowed to use the itinerary model. Ask your platform admin to check it.'
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'The AI is busy right now (rate limit reached). Please try again in a minute.'
  }
  if (err instanceof Anthropic.BadRequestError && /credit|billing|balance/i.test(err.message || '')) {
    return 'The agency’s Anthropic account is out of credits. Add credits in the Anthropic console and try again.'
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Could not reach the AI service. Check the server’s internet connection and try again.'
  }
  if (err instanceof Anthropic.APIError) {
    return `AI request failed (${err.status || 'error'}). Please try again.`
  }
  return err?.message || 'AI generation failed. Please try again.'
}

const SYSTEM_PROMPT = `You are an expert travel planner working inside a travel agency's CRM. You draft holiday itineraries that the agency's sales team will review, edit and send to their client.

How to write:
- Write in clear, warm, professional English suited to an Indian travel agency's client-facing itinerary.
- Day titles: short and in capital letters, e.g. "ARRIVAL IN SRINAGAR", "GULMARG EXCURSION", "DEPARTURE".
- Day descriptions: 60–120 words each, describing the day's flow — transfers, sightseeing, experiences and where the guests stay that night. Be specific to real places at the destination. Do not mention prices.
- The first day is the arrival and the last day is the departure.
- Overview: 2–3 sentences selling the package, suitable for the top of the itinerary.
- Inclusions and exclusions: short, practical bullet lines (5–8 each) matching what the plan actually covers.

Hotels and transport:
- You may ONLY use hotels and vehicles from the lists provided, referenced by their exact id. Never invent a hotel, vehicle, room type or price.
- Prefer hotels whose city matches where the guests sleep that night, and whose stars suit the requested package category.
- The nights across all stays must add up exactly to the trip's total nights, in travel order.
- Choose a room type that exists for that hotel, and enough rooms for the group (assume 2 adults per room).
- For transport, pick a vehicle that fits the group size and the route(s) that match the plan, with the number of days it is needed.
- If no suitable hotel or vehicle is provided, return an empty list for it — the agent will add those manually.

Respond only with the JSON object described by the schema.`

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overview', 'days', 'stays', 'transport', 'inclusions', 'exclusions'],
  properties: {
    overview: { type: 'string' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dayNumber', 'title', 'description'],
        properties: {
          dayNumber: { type: 'integer' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    stays: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['hotelId', 'roomType', 'nights', 'rooms'],
        properties: {
          hotelId: { type: 'string' },
          roomType: { type: 'string' },
          nights: { type: 'integer' },
          rooms: { type: 'integer' },
        },
      },
    },
    transport: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['vehicleId', 'routeIndex', 'acType', 'days'],
        properties: {
          vehicleId: { type: 'string' },
          routeIndex: { type: 'integer' },
          acType: { type: 'string', enum: ['AC', 'NonAC'] },
          days: { type: 'integer' },
        },
      },
    },
    inclusions: { type: 'array', items: { type: 'string' } },
    exclusions: { type: 'array', items: { type: 'string' } },
  },
}

function hotelForPrompt(h) {
  const rooms = (h.rooms?.length ? h.rooms : [{ roomType: h.roomType, price: h.price }])
    .filter((r) => r?.roomType)
    .map((r) => ({ roomType: r.roomType, pricePerNight: r.price || 0 }))
  return {
    id: String(h._id),
    name: h.name,
    city: h.city || h.destination || '',
    stars: h.stars || null,
    category: h.category || null,
    rooms,
  }
}

function vehicleForPrompt(v) {
  return {
    id: String(v._id),
    name: v.name,
    routes: (v.routes || []).map((r, index) => ({
      routeIndex: index,
      from: r.fromLocation || '',
      to: r.toLocation || '',
      priceAC: r.priceAC || 0,
      priceNonAC: r.priceNonAC || 0,
    })),
  }
}

function buildUserMessage(input, hotels, vehicles) {
  const lines = [
    'Draft an itinerary for this trip:',
    `- Destination: ${input.destination}`,
    `- Total: ${input.nights} nights / ${input.nights + 1} days`,
    `- Start date: ${input.startDate}`,
    `- Travellers: ${input.adults} adult(s)${input.children ? `, ${input.children} child(ren)` : ''}`,
    `- Package category: ${input.packageCategory || 'Standard'}`,
  ]
  if (input.preferences) lines.push(`- Client requests: ${input.preferences}`)
  lines.push('')
  lines.push(
    hotels.length
      ? `Agency's hotels (use only these, by id):\n${JSON.stringify(hotels.map(hotelForPrompt))}`
      : 'The agency has no hotels for this destination yet — return an empty stays list.'
  )
  lines.push('')
  lines.push(
    vehicles.length
      ? `Agency's vehicles (use only these, by id and routeIndex):\n${JSON.stringify(vehicles.map(vehicleForPrompt))}`
      : 'The agency has no vehicles configured yet — return an empty transport list.'
  )
  return lines.join('\n')
}

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function cleanList(list) {
  return (Array.isArray(list) ? list : []).map((s) => String(s || '').trim()).filter(Boolean)
}

/**
 * Map the model's JSON onto an Itinerary Studio form patch. Hotels/vehicles
 * are resolved against the masters by id (unknown ids are dropped) and every
 * price comes from the master record.
 */
export function draftToStudioPatch(draft, input, hotels, vehicles) {
  const warnings = []
  const nights = input.nights
  const dayCount = nights + 1

  const aiDays = [...(draft.days || [])].sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0))
  const days = Array.from({ length: dayCount }, (_, i) => {
    const src = aiDays[i] || {}
    return {
      ...DEFAULT_DAY,
      dayNumber: i + 1,
      sortOrder: i,
      title: String(src.title || (i === 0 ? 'ARRIVAL' : i === dayCount - 1 ? 'DEPARTURE' : `DAY ${i + 1}`)).trim(),
      description: String(src.description || '').trim(),
      date: addDays(input.startDate, i),
    }
  })

  // Night stays — resolved against the agency's own hotel masters.
  const hotelById = new Map(hotels.map((h) => [String(h._id), h]))
  const nightStays = []
  const hotelEntries = []
  let dayCursor = 1
  for (const s of draft.stays || []) {
    const master = hotelById.get(String(s.hotelId))
    const stayNights = Math.max(1, Math.round(Number(s.nights) || 0))
    if (!master) continue
    const stay = createNightStayFromHotelMaster(master, dayCursor)
    const rooms = master.rooms?.length ? master.rooms : [{ roomType: master.roomType, price: master.price }]
    const room =
      rooms.find((r) => String(r.roomType || '').toLowerCase() === String(s.roomType || '').toLowerCase()) ||
      rooms[0] ||
      {}
    stay.roomLines = [
      {
        ...createDefaultRoomLine(),
        roomType: room.roomType || '',
        pricePerNight: room.price || 0,
        nights: stayNights,
        roomCount: Math.max(1, Math.round(Number(s.rooms) || Math.ceil((input.adults || 2) / 2))),
      },
    ]
    nightStays.push(stay)
    dayCursor += stayNights
    if (!hotelEntries.some((e) => e.id === String(master._id))) {
      hotelEntries.push({
        id: String(master._id),
        name: master.name,
        location: master.city || master.destination || master.address || '',
        stars: master.stars || 3,
        images: master.photos?.length ? [master.photos[0]] : [],
        amenities: master.amenities || [],
        roomType: master.roomType || room.roomType || 'DELUXE',
        cost: master.price || room.price || 0,
        currency: master.priceCurrency || 'INR',
      })
    }
  }
  // Keep the stays' nights equal to the trip's nights — the Costing step
  // refuses to save otherwise. Fix small drift on the last stay.
  if (nightStays.length) {
    const booked = nightStays.reduce((sum, s) => sum + (Number(s.roomLines[0].nights) || 0), 0)
    if (booked !== nights) {
      const last = nightStays[nightStays.length - 1].roomLines[0]
      const adjusted = (Number(last.nights) || 0) + (nights - booked)
      if (adjusted >= 1) last.nights = adjusted
      else warnings.push('Hotel nights did not match the trip length — please check the stays in Costing.')
    }
  } else if (hotels.length) {
    warnings.push('The AI could not match any of your hotels — please pick hotels in the Hotels step.')
  } else {
    warnings.push('No hotels found for this destination in your rate master — add hotels in the Hotels step.')
  }

  // Transport — resolved against the agency's own vehicle masters.
  const vehicleById = new Map(vehicles.map((v) => [String(v._id), v]))
  const vehicleEntries = []
  for (const t of draft.transport || []) {
    const master = vehicleById.get(String(t.vehicleId))
    const route = master?.routes?.[Number(t.routeIndex)]
    if (!master || !route) continue
    // Same fare choices the Costing step offers: only a fare with a price,
    // and a plain (untyped) pick when the route has neither priced.
    const hasAC = route.priceAC > 0
    const hasNonAC = route.priceNonAC > 0
    let type = ''
    if (hasAC || hasNonAC) {
      type = t.acType === 'NonAC' ? 'Non-AC' : 'AC'
      if (type === 'AC' && !hasAC) type = 'Non-AC'
      if (type === 'Non-AC' && !hasNonAC) type = 'AC'
    }
    const vDays = Math.max(1, Math.round(Number(t.days) || 1))
    const price = type === 'AC' ? route.priceAC : type === 'Non-AC' ? route.priceNonAC : 0
    vehicleEntries.push({
      name: master.name,
      fromLocation: route.fromLocation || '',
      toLocation: route.toLocation || '',
      priceAC: route.priceAC || 0,
      priceNonAC: route.priceNonAC || 0,
      selectedType: type,
      days: vDays,
      cost: (price || 0) * vDays,
      currency: 'INR',
    })
  }

  const preset = DURATION_PRESETS.find((p) => p.nights === nights)
  const patch = {
    destination: input.destination,
    tripName: input.destination,
    duration: preset ? preset.value : 'custom',
    customDuration: preset ? '' : `${nights}N/${nights + 1}D`,
    startDate: input.startDate,
    endDate: addDays(input.startDate, nights),
    numberOfAdults: input.adults,
    numberOfChildren: input.children,
    marketingOverview: String(draft.overview || '').trim(),
    days,
    hotels: hotelEntries,
    nightStays,
    budgetTiers: false,
    vehicles: vehicleEntries,
    inclusions: cleanList(draft.inclusions),
    exclusions: cleanList(draft.exclusions),
    totalPriceOverride: null,
  }
  return { patch, warnings }
}

/** Ask Claude for a draft and return `{ patch, warnings, usage }`. */
export async function generateItineraryDraft({ apiKey, input, hotels, vehicles }) {
  const client = makeClient(apiKey)
  const stream = client.beta.messages.stream({
    model: AI_MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: 'user', content: buildUserMessage(input, hotels, vehicles) }],
  })
  const message = await stream.finalMessage()

  if (message.stop_reason === 'refusal') {
    throw new Error('The AI declined to draft this itinerary. Try rephrasing the client requests.')
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('The AI response was too long. Try fewer nights or shorter requests.')
  }
  const text = message.content.find((b) => b.type === 'text')?.text
  let draft
  try {
    draft = JSON.parse(text || '')
  } catch {
    throw new Error('The AI returned an unreadable draft. Please try again.')
  }
  const { patch, warnings } = draftToStudioPatch(draft, input, hotels, vehicles)
  return { patch, warnings, usage: message.usage }
}
