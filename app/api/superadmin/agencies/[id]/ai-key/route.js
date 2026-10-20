import mongoose from 'mongoose'
import Anthropic from '@anthropic-ai/sdk'
import connectDB from '@/lib/mongodb'
import Team from '@/models/Team'
import { requireSuperadmin, denied, recordPlatformAudit } from '@/lib/superadmin'
import { encryptAiKey, verifyAiKey, friendlyAiError } from '@/lib/aiItinerary'

export const runtime = 'nodejs'

function aiStatus(team) {
  return {
    enabled: Boolean(team?.ai?.anthropicKeyEnc),
    keyLast4: team?.ai?.keyLast4 || null,
    keySavedAt: team?.ai?.keySavedAt || null,
  }
}

/** PUT — save (or replace) the agency's own Anthropic API key, after verifying it works. */
export async function PUT(request, { params }) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid agency id' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({}))
    const apiKey = String(body?.apiKey || '').trim()
    if (!apiKey.startsWith('sk-ant-') || apiKey.length < 20) {
      return Response.json({ error: 'Enter a valid Anthropic API key (it starts with sk-ant-)' }, { status: 400 })
    }

    await connectDB()
    const team = await Team.findById(id).select('name ai')
    if (!team) return Response.json({ error: 'Agency not found' }, { status: 404 })

    try {
      await verifyAiKey(apiKey)
    } catch (err) {
      const msg =
        err instanceof Anthropic.AuthenticationError
          ? 'This API key was rejected by Anthropic — check it was copied fully and is still active.'
          : friendlyAiError(err)
      return Response.json({ error: msg }, { status: 400 })
    }

    team.ai = {
      anthropicKeyEnc: encryptAiKey(apiKey),
      keyLast4: apiKey.slice(-4),
      keySavedAt: new Date(),
    }
    await team.save()

    await recordPlatformAudit(guard.user, {
      teamId: team._id,
      entity: 'team',
      entityId: team._id,
      action: 'update',
      summary: `Set AI Itinerary Builder key for ${team.name}`,
    })

    return Response.json({ ai: aiStatus(team) })
  } catch (error) {
    console.error('Save AI key error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE — remove the key, turning AI off for this agency. */
export async function DELETE(request, { params }) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid agency id' }, { status: 400 })
    }

    await connectDB()
    const team = await Team.findById(id).select('name ai')
    if (!team) return Response.json({ error: 'Agency not found' }, { status: 404 })

    team.ai = undefined
    await team.save()

    await recordPlatformAudit(guard.user, {
      teamId: team._id,
      entity: 'team',
      entityId: team._id,
      action: 'update',
      summary: `Removed AI Itinerary Builder key for ${team.name}`,
    })

    return Response.json({ ai: aiStatus(team) })
  } catch (error) {
    console.error('Remove AI key error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
