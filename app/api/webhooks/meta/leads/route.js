import connectDB from '@/lib/mongodb'
import Team from '@/models/Team'
import { ingestLead } from '@/lib/leadIngest'
import { parseMetaFieldData } from '@/lib/metaLeadParser'
import { assignLeadFromFormPool } from '@/lib/assignRoundRobin'
import crypto from 'crypto'

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'travel_crm_verify'
const APP_SECRET = process.env.META_APP_SECRET

/** Meta webhook verification (GET) */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return Response.json({ error: 'Verification failed' }, { status: 403 })
}

function verifyMetaSignature(rawBody, signature) {
  if (!APP_SECRET || !signature) return true
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', APP_SECRET).update(rawBody, 'utf8').digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

/** Fetch lead from Meta Graph API using leadgen_id */
async function fetchMetaLeadgen(leadgenId, pageAccessToken) {
  const token = pageAccessToken || process.env.META_PAGE_ACCESS_TOKEN
  if (!token) return null

  const url = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${token}`
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json()
}

/**
 * Meta Lead Ads webhook (POST)
 *
 * Flow:
 *   Meta Form Submit → Meta POST webhook → CRM fetches leadgen data → weight assign → notify sales
 *
 * Also accepts flat JSON relay from Zapier/n8n (same as public API body + x-team-id header).
 */
export async function POST(request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-hub-signature-256')

    if (APP_SECRET && !verifyMetaSignature(rawBody, signature)) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody || '{}')
    await connectDB()

    // --- Zapier / n8n relay: flat JSON with x-api-key ---
    const apiKey = request.headers.get('x-api-key')
    if (apiKey && body.email) {
      const { hashInboundApiKey } = await import('@/lib/workspaceApiKey')
      const team = await Team.findOne({ inboundApiKeyHash: hashInboundApiKey(apiKey) })
      if (!team) {
        return Response.json({ error: 'Invalid API key' }, { status: 401 })
      }
      const result = await ingestLead({
        teamId: team._id,
        body: { ...body, source: body.source || 'facebook_ads' },
        channel: 'meta',
      })
      if (result.error) {
        return Response.json({ error: result.error }, { status: result.status })
      }
      return Response.json(
        { message: result.message, leadId: result.leadId, duplicate: result.duplicate },
        { status: result.status }
      )
    }

    // --- Standard Meta webhook payload ---
    const entries = body.entry || []
    const results = []

    for (const entry of entries) {
      const pageId = String(entry.id || '')
      const team =
        (await Team.findOne({ metaPageId: pageId })) ||
        (await Team.findOne({ metaPageId: { $exists: true } }).sort({ createdAt: 1 }))

      if (!team) {
        results.push({ pageId, error: 'No agency mapped to this Meta page' })
        continue
      }

      for (const change of entry.changes || []) {
        if (change.field !== 'leadgen') continue
        const leadgenId = change.value?.leadgen_id
        if (!leadgenId) continue

        const graphLead = await fetchMetaLeadgen(leadgenId, team.settings?.metaPageAccessToken)
        const parsed = graphLead?.field_data
          ? parseMetaFieldData(graphLead.field_data)
          : { firstName: 'Lead', lastName: '', email: null, phone: null }

        // Owner can round-robin a specific form's leads among only a chosen
        // subset of employees — same mapping the polling sync (lib/metaSync.js) uses.
        const formId = change.value?.form_id ? String(change.value.form_id) : null
        const formPool = formId
          ? (team.metaSync?.formAssignments || []).find((a) => String(a.formId) === formId)?.assignedTo
          : null
        const pinned = formPool?.length ? await assignLeadFromFormPool(team._id, formId, formPool) : null

        const result = await ingestLead({
          teamId: team._id,
          body: {
            ...parsed,
            externalId: leadgenId,
            source: 'facebook_ads',
            ...(pinned ? { assignedTo: pinned } : {}),
            metadata: {
              meta: {
                leadgen_id: leadgenId,
                form_id: change.value?.form_id,
                page_id: pageId,
                ad_id: change.value?.ad_id,
                created_time: change.value?.created_time,
              },
            },
          },
          channel: 'meta',
        })

        results.push({
          leadgenId,
          leadId: result.leadId,
          duplicate: result.duplicate,
          error: result.error,
        })
      }
    }

    if (!entries.length && body.firstName) {
      return Response.json({ error: 'Use x-api-key header for relay payloads' }, { status: 400 })
    }

    return Response.json({ message: 'Webhook processed', results }, { status: 200 })
  } catch (error) {
    console.error('Meta webhook error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
