import connectDB from '@/lib/mongodb'
import Team from '@/models/Team'
import User from '@/models/User'
import { authenticate, requireRoles } from '@/lib/middleware'
import { encryptToken, decryptToken, maskToken } from '@/lib/metaSync'
import { schedulerState } from '@/lib/metaSyncScheduler'
import { recordAudit } from '@/lib/audit'

/**
 * Which scheduler is actually driving the sync, so the UI can say "every 15
 * min" honestly instead of promising automation that nothing is running.
 */
function autoMode() {
  if (process.env.META_SYNC_AUTO === 'off') {
    return { mode: 'off', active: false, intervalMinutes: null }
  }
  if (process.env.VERCEL) {
    return { mode: 'vercel-cron', active: !!process.env.CRON_SECRET, intervalMinutes: 15 }
  }
  const s = schedulerState()
  return {
    mode: 'in-process',
    active: s.active,
    intervalMinutes: Math.round(s.intervalMs / 60000),
    running: s.running,
    lastRunAt: s.lastRunAt,
  }
}

/** Config the browser is allowed to see — never the token itself. */
function publicConfig(team) {
  const cfg = team.metaSync || {}
  const token = decryptToken(cfg.accessTokenEnc)
  return {
    auto: autoMode(),
    enabled: !!cfg.enabled,
    formIds: cfg.formIds || [],
    // Per-form employee pool (round-robins across the whole team when this
    // list is empty — "All employees" — otherwise only among these ids).
    formAssignments: (cfg.formAssignments || []).map((a) => ({
      formId: a.formId,
      assignedTo: (a.assignedTo || []).map(String),
    })),
    hasToken: !!token,
    tokenPreview: maskToken(token),
    tokenSavedAt: cfg.tokenSavedAt || null,
    lastSyncAt: cfg.lastSyncAt || null,
    lastSyncStatus: cfg.lastSyncStatus || null,
    lastSyncError: cfg.lastSyncError || null,
    lastSyncCreated: cfg.lastSyncCreated || 0,
    totalSynced: cfg.totalSynced || 0,
    lastLeadCreatedTime: cfg.lastLeadCreatedTime || null,
    // Conversions API — CRM → Meta status feedback, this team's own dataset/token.
    capi: {
      enabled: !!cfg.capiEnabled,
      datasetId: cfg.capiDatasetId || '',
      hasToken: !!decryptToken(cfg.capiAccessTokenEnc),
      tokenPreview: maskToken(decryptToken(cfg.capiAccessTokenEnc)),
      tokenSavedAt: cfg.capiTokenSavedAt || null,
    },
  }
}

async function authorize(request) {
  const authResult = await authenticate(request)
  if (authResult.error) {
    return { response: Response.json({ error: authResult.error }, { status: authResult.status }) }
  }
  const forbidden = requireRoles(authResult.user.role, ['superadmin', 'admin'])
  if (forbidden) {
    return { response: Response.json({ error: forbidden.error }, { status: forbidden.status }) }
  }
  return { user: authResult.user }
}

export async function GET(request) {
  try {
    const auth = await authorize(request)
    if (auth.response) return auth.response

    await connectDB()
    const team = await Team.findById(auth.user.teamId).select('metaSync')
    if (!team) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 })
    }

    return Response.json(publicConfig(team))
  } catch (error) {
    console.error('Meta sync GET error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Save the agency's Meta pull-sync settings.
 *
 * `accessToken` is write-only: omit it to keep whatever is already stored, send
 * an empty string to clear it. That way the UI can re-save the form IDs without
 * ever having to hold the real token in the browser.
 */
export async function PATCH(request) {
  try {
    const auth = await authorize(request)
    if (auth.response) return auth.response

    const body = await request.json().catch(() => ({}))
    await connectDB()
    const team = await Team.findById(auth.user.teamId)
    if (!team) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 })
    }

    if (!team.metaSync) team.metaSync = {}

    if (body.formIds !== undefined) {
      const raw = Array.isArray(body.formIds)
        ? body.formIds
        : String(body.formIds).split(/[\s,]+/)
      const ids = [...new Set(raw.map((f) => String(f).trim()).filter(Boolean))]
      if (ids.some((id) => !/^\d{5,}$/.test(id))) {
        return Response.json(
          { error: 'Form IDs must be numeric (copy the ID from Meta Business Suite → Instant Forms)' },
          { status: 400 }
        )
      }
      if (ids.length > 20) {
        return Response.json({ error: 'At most 20 form IDs' }, { status: 400 })
      }
      team.metaSync.formIds = ids
    }

    if (body.formAssignments !== undefined) {
      const rows = Array.isArray(body.formAssignments) ? body.formAssignments : []
      const validFormIds = new Set(team.metaSync.formIds || [])
      const existingByForm = new Map(
        (team.metaSync.formAssignments || []).map((a) => [String(a.formId), a])
      )
      const assigneeIds = [
        ...new Set(rows.flatMap((r) => (Array.isArray(r.assignedTo) ? r.assignedTo : []).map(String))),
      ]
      const validAssignees =
        assigneeIds.length &&
        (await User.find({ _id: { $in: assigneeIds }, teamId: team._id, isActive: true }).select('_id').lean())
      const validAssigneeIds = new Set((validAssignees || []).map((u) => String(u._id)))
      team.metaSync.formAssignments = rows
        .filter((r) => r.formId && validFormIds.has(String(r.formId)))
        .map((r) => {
          const list = (Array.isArray(r.assignedTo) ? r.assignedTo : []).filter((id) =>
            validAssigneeIds.has(String(id))
          )
          // Keep this form's own rotation position — resetting it on every
          // unrelated save would keep re-favoring whoever's first in the list.
          const prior = existingByForm.get(String(r.formId))
          return {
            formId: String(r.formId),
            assignedTo: list,
            roundRobinIndex: prior?.roundRobinIndex || 0,
          }
        })
    }

    if (body.accessToken !== undefined) {
      const t = String(body.accessToken).trim()
      if (t) {
        team.metaSync.accessTokenEnc = encryptToken(t)
        team.metaSync.tokenSavedAt = new Date()
      } else {
        team.metaSync.accessTokenEnc = undefined
        team.metaSync.tokenSavedAt = undefined
        team.metaSync.enabled = false
      }
    }

    if (body.enabled !== undefined) {
      const wantOn = !!body.enabled
      if (wantOn && !team.metaSync.accessTokenEnc) {
        return Response.json({ error: 'Save an access token before turning sync on' }, { status: 400 })
      }
      if (wantOn && !(team.metaSync.formIds || []).length) {
        return Response.json({ error: 'Add at least one form ID before turning sync on' }, { status: 400 })
      }
      team.metaSync.enabled = wantOn
    }

    // Re-running history is an explicit choice, not something a settings save
    // should trigger by accident.
    if (body.resetWatermark === true) {
      team.metaSync.lastLeadCreatedTime = undefined
    }

    // Conversions API — this team's own Dataset ID + access token, saved the
    // same write-only way as the Page Access Token above (omit to keep what's
    // already stored, send an empty string to clear it).
    if (body.capiDatasetId !== undefined) {
      team.metaSync.capiDatasetId = String(body.capiDatasetId).trim() || undefined
    }
    if (body.capiAccessToken !== undefined) {
      const t = String(body.capiAccessToken).trim()
      if (t) {
        team.metaSync.capiAccessTokenEnc = encryptToken(t)
        team.metaSync.capiTokenSavedAt = new Date()
      } else {
        team.metaSync.capiAccessTokenEnc = undefined
        team.metaSync.capiTokenSavedAt = undefined
        team.metaSync.capiEnabled = false
      }
    }
    if (body.capiEnabled !== undefined) {
      const wantOn = !!body.capiEnabled
      if (wantOn && !team.metaSync.capiAccessTokenEnc) {
        return Response.json({ error: 'Save a Conversions API access token before turning it on' }, { status: 400 })
      }
      if (wantOn && !team.metaSync.capiDatasetId) {
        return Response.json({ error: 'Add a Dataset ID before turning Conversions API on' }, { status: 400 })
      }
      team.metaSync.capiEnabled = wantOn
    }

    await team.save()

    await recordAudit({
      teamId: team._id,
      entity: 'Team',
      entityId: team._id,
      action: 'meta_sync_settings_updated',
      summary: `Meta lead sync ${team.metaSync.enabled ? 'enabled' : 'disabled'} — ${
        (team.metaSync.formIds || []).length
      } form(s)${body.accessToken !== undefined ? ', token updated' : ''}`,
      actor: { userId: auth.user.userId, email: auth.user.email },
    })

    return Response.json({ message: 'Meta sync settings saved', ...publicConfig(team) })
  } catch (error) {
    console.error('Meta sync PATCH error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
