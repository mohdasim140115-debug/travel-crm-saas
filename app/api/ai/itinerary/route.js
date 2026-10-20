import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb'
import Team from '@/models/Team'
import Hotel from '@/models/Hotel'
import Vehicle from '@/models/Vehicle'
import { authenticate, requireRoles } from '@/lib/middleware'
import { escapeRegex } from '@/lib/superadmin'
import { teamAiKey, generateItineraryDraft, friendlyAiError } from '@/lib/aiItinerary'

export const runtime = 'nodejs'

const BUILDER_ROLES = ['admin', 'manager', 'agent', 'itinerary_only']

async function guard(request) {
  const authResult = await authenticate(request)
  if (authResult.error) {
    return { res: Response.json({ error: authResult.error }, { status: authResult.status }) }
  }
  const denied = requireRoles(authResult.user.role, BUILDER_ROLES)
  if (denied) return { res: Response.json({ error: denied.error }, { status: denied.status }) }
  return { user: authResult.user }
}

/** GET — whether this agency has AI enabled (an Anthropic key on file). */
export async function GET(request) {
  try {
    const { user, res } = await guard(request)
    if (res) return res
    await connectDB()
    const team = await Team.findById(user.teamId).select('ai.anthropicKeyEnc').lean()
    return Response.json({ enabled: Boolean(team?.ai?.anthropicKeyEnc) })
  } catch (error) {
    console.error('AI itinerary status error:', error)
    return Response.json({ enabled: false })
  }
}

function parseInput(body) {
  const destination = String(body?.destination || '').trim()
  const nights = Math.round(Number(body?.nights))
  const startDate = String(body?.startDate || '').slice(0, 10)
  const adults = Math.round(Number(body?.adults))
  const children = Math.max(0, Math.round(Number(body?.children) || 0))
  if (!destination) return { error: 'Destination is required' }
  if (!(nights >= 1 && nights <= 20)) return { error: 'Nights must be between 1 and 20' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: 'Start date is required' }
  if (!(adults >= 1 && adults <= 50)) return { error: 'Adults must be between 1 and 50' }
  return {
    input: {
      destination: destination.slice(0, 120),
      nights,
      startDate,
      adults,
      children: Math.min(children, 50),
      packageCategory: String(body?.packageCategory || '').trim().slice(0, 60),
      preferences: String(body?.preferences || '').trim().slice(0, 1000),
    },
  }
}

/**
 * POST — draft an itinerary with the agency's own Anthropic key.
 *
 * Generation can take a minute or more, longer than a typical reverse-proxy
 * read timeout, so the response streams a whitespace heartbeat every 10s and
 * then the final JSON. Leading whitespace is valid JSON; the client just
 * reads the whole body and parses it. Errors after the stream starts are
 * reported inside that JSON (`{ error }`) since the status is already 200.
 */
export async function POST(request) {
  const { user, res } = await guard(request)
  if (res) return res

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  const parsed = parseInput(body)
  if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 })
  const { input } = parsed

  await connectDB()
  const team = await Team.findById(user.teamId).select('ai').lean()
  const apiKey = teamAiKey(team)
  if (!apiKey) {
    return Response.json(
      { error: 'AI Itinerary Builder is not enabled for your agency. Contact your platform admin.', code: 'NO_KEY' },
      { status: 400 }
    )
  }

  const teamId = new mongoose.Types.ObjectId(String(user.teamId))
  const place = new RegExp(escapeRegex(input.destination), 'i')
  const [hotels, vehicles] = await Promise.all([
    Hotel.find({
      teamId,
      isArchived: { $ne: true },
      isActive: { $ne: false },
      $or: [{ destination: place }, { city: place }, { address: place }, { country: place }],
    })
      .select('name city destination address country stars category roomType price priceCurrency rooms extraBedCharge cnbPrice photos amenities')
      .limit(80)
      .lean(),
    Vehicle.find({ teamId, isArchived: { $ne: true }, isActive: { $ne: false } })
      .select('name routes')
      .limit(40)
      .lean(),
  ])

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(' ')), 10000)
      try {
        const { patch, warnings, usage } = await generateItineraryDraft({ apiKey, input, hotels, vehicles })
        console.info('AI itinerary generated', {
          teamId: String(user.teamId),
          userId: user.userId,
          inputTokens: usage?.input_tokens,
          outputTokens: usage?.output_tokens,
        })
        controller.enqueue(encoder.encode(JSON.stringify({ patch, warnings })))
      } catch (error) {
        console.error('AI itinerary generation error:', error)
        controller.enqueue(encoder.encode(JSON.stringify({ error: friendlyAiError(error) })))
      } finally {
        clearInterval(heartbeat)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
