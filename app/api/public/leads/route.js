import crypto from 'crypto'
import connectDB from '@/lib/mongodb'
import Team from '@/models/Team'
import { hashInboundApiKey } from '@/lib/workspaceApiKey'
import { rateLimit } from '@/lib/rate-limit'
import { ingestLead } from '@/lib/leadIngest'
import { sanitizeAttribution } from '@/lib/googleLeadParser'
import { resolveGoogleMapping } from '@/lib/googleLeadMapping'
import GoogleLeadEvent from '@/models/GoogleLeadEvent'

/**
 * Public lead ingest API — agencies connect Meta/Zapier/website forms here.
 * Also the intake point for Google Ads → Landing Page / Website leads: when
 * the body carries gclid, a utm_ field, form_id, or landing_page_id (a
 * landing page's form posting here directly, or via a light client-side
 * relay), those are
 * captured and a campaign/form → owner mapping is resolved server-side —
 * additive to the existing behavior below, never overriding it for callers
 * that don't send Google fields.
 *
 * POST /api/public/leads
 * Headers: x-api-key: crm_xxxx (mint from Dashboard → Team & Weights → Generate Key)
 *
 * Body example:
 * {
 *   "firstName": "Rahul",
 *   "lastName": "Sharma",
 *   "phone": "9876543210",
 *   "email": "rahul@email.com",
 *   "city": "Delhi",
 *   "destination": "Kashmir Package",
 *   "travelDate": "2026-06-15",
 *   "source": "facebook_ads",
 *   "externalId": "meta_lead_123",
 *   "autoAssign": true
 * }
 *
 * Google Ads landing-page example (additive fields):
 * {
 *   "firstName": "Rahul", "phone": "9876543210",
 *   "source": "google_ads",
 *   "gclid": "Cj0KCQ...", "utm_source": "google", "utm_medium": "cpc",
 *   "utm_campaign": "kashmir-2026", "form_id": "FORM-009",
 *   "landing_page_id": "LP-KASHMIR-01", "page_url": "https://...", "referrer": "https://..."
 * }
 */
/** Every request this endpoint rejects or fails on is written to the same
 * inbound log the Google events use — before, a 401/400/500 left no trace at
 * all, so a lead a landing page "sent" but the CRM never stored (e.g. because
 * the request errored) could not be found afterwards. Never throws. */
async function logRejected({ team, body, error, status }) {
  try {
    await GoogleLeadEvent.create({
      teamId: team?._id,
      source: 'google_landing_page',
      formId: body?.form_id,
      landingPageId: body?.landing_page_id,
      status: 'error',
      error: `HTTP ${status}: ${error}`,
      rawPayload: body || {},
    })
  } catch (e) {
    console.error('Public lead reject log failed:', e.message)
  }
}

export async function POST(request) {
  let team = null
  let body = null
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'
    const rl = await rateLimit(`public-lead:${ip}`, { windowMs: 60_000, max: 60 })
    if (!rl.ok) {
      return Response.json({ error: 'Too many requests' }, { status: 429 })
    }

    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) {
      return Response.json(
        {
          error: 'Missing x-api-key header',
          hint: 'Generate API key from Dashboard → Team & Weights',
        },
        { status: 401 }
      )
    }

    await connectDB()
    const hash = hashInboundApiKey(apiKey)
    team = await Team.findOne({ inboundApiKeyHash: hash })
    if (!team) {
      return Response.json({ error: 'Invalid API key' }, { status: 401 })
    }

    body = await request.json()

    // Google Ads → Landing Page / Website: detected by an explicit source or
    // by the presence of Google-only fields, so an ordinary website/API
    // caller that never sends these is completely unaffected.
    const isGoogle =
      body.source === 'google_ads' ||
      !!(body.gclid || body.utm_source || body.form_id || body.landing_page_id)

    if (isGoogle) {
      const attribution = sanitizeAttribution(body)
      // No natural id from a plain form post — derive a stable one from
      // whatever's actually present, so a double-submit (double click,
      // client retry) can't create two leads. An explicit client-supplied
      // externalId always wins when given.
      const externalId =
        body.externalId ||
        crypto
          .createHash('sha256')
          .update(
            [attribution.gclid, attribution.formId, body.email, body.phone, attribution.submittedAt.slice(0, 10)]
              .filter(Boolean)
              .join('|')
          )
          .digest('hex')

      const mapping = await resolveGoogleMapping({
        teamId: team._id,
        formId: attribution.formId,
        landingPageId: attribution.landingPageId,
      })

      const result = await ingestLead({
        teamId: team._id,
        channel: 'google',
        body: {
          ...body,
          externalId,
          assignedTo: mapping?.ownerId || undefined,
          brandId: mapping?.brandId || undefined,
          // A mapping's owner always wins; with no mapping, fall back to the
          // same weighted round-robin every other lead source uses, same as
          // the webhook path — never left sitting unassigned.
          autoAssign: !mapping,
          metadata: { google: { sourceType: 'google_landing_page', ...attribution } },
        },
      })

      await GoogleLeadEvent.create({
        teamId: team._id,
        source: 'google_landing_page',
        googleSubmissionId: externalId,
        formId: attribution.formId,
        landingPageId: attribution.landingPageId,
        status: result.error ? 'error' : result.duplicate ? 'duplicate' : mapping ? 'processed' : 'unmapped',
        leadId: result.leadId,
        error: result.error,
        rawPayload: body,
      }).catch(() => {})

      if (result.error) {
        return Response.json({ error: result.error }, { status: result.status })
      }
      return Response.json(
        {
          message: result.message,
          leadId: result.leadId,
          assignedTo: result.lead?.assignedTo?._id || result.lead?.assignedTo,
          duplicate: result.duplicate || false,
          mapped: !!mapping,
        },
        { status: result.status }
      )
    }

    const channel = body.source === 'facebook_ads' || body.source === 'instagram' ? 'meta' : 'api'

    const result = await ingestLead({
      teamId: team._id,
      body,
      channel,
      autoAssign: body.autoAssign,
    })

    if (result.error) {
      await logRejected({ team, body, error: result.error, status: result.status })
      return Response.json({ error: result.error }, { status: result.status })
    }

    return Response.json(
      {
        message: result.message,
        leadId: result.leadId,
        assignedTo: result.lead?.assignedTo?._id || result.lead?.assignedTo,
        duplicate: result.duplicate || false,
      },
      { status: result.status }
    )
  } catch (error) {
    console.error('Public lead ingest error:', error)
    if (team) await logRejected({ team, body, error: error.message, status: 500 })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
