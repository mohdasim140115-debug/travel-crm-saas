/**
 * Meta Conversions API config — PER TEAM, not a single shared env var.
 *
 * This CRM is multi-tenant: every agency (Team) has its own Meta Business
 * dataset and its own Conversions API access token, exactly like each team
 * already has its own Meta Lead Ads Page Access Token (Team.metaSync.accessTokenEnc).
 * A single global token would leak one agency's Meta credentials into every
 * other agency's conversion events — so the Dataset ID + access token are
 * saved per team, encrypted at rest, from Settings → Meta Lead Ads → Conversions API
 * (same admin card, same "write-only, never shown again" pattern as the
 * existing Page Access Token field). See app/api/admin/meta-sync/route.js.
 *
 * META_API_VERSION and META_CAPI_ACTION_SOURCE are NOT secrets — just shared
 * defaults — so those two alone may still come from env vars.
 */
import { decryptToken } from '@/lib/metaSync'

export function metaCapiConfigForTeam(team) {
  const cfg = team?.metaSync || {}
  const accessToken = decryptToken(cfg.capiAccessTokenEnc)
  const datasetId = cfg.capiDatasetId || ''
  const apiVersion = process.env.META_API_VERSION || 'v21.0'
  return { accessToken, datasetId, apiVersion, enabled: !!cfg.capiEnabled }
}

export function isMetaCapiConfiguredForTeam(team) {
  const { accessToken, datasetId, enabled } = metaCapiConfigForTeam(team)
  return Boolean(enabled && accessToken && datasetId)
}

/**
 * Which CRM lead status changes are meaningful enough to report back to Meta,
 * and what standard Meta event each one becomes. Edit this map to change the
 * behavior — nothing else needs to change. Shared across all teams (the
 * status vocabulary itself — new/contacted/interested/.../booked/lost — is
 * the same seeded set for every workspace; only the credentials are per-team).
 *
 * The CRM's actual lead statuses (see hooks/useMasters 'lead_status' seed and
 * models/Lead.js) are: new, contacted, interested, negotiating, booked,
 * completed, lost. Only two are mapped by default, deliberately conservative:
 *
 *   - "contacted"  → "Contact"  Meta standard event — a real sales touch,
 *                      distinct from the automatic Lead event Meta already
 *                      fires the moment the Lead Ad form is submitted.
 *   - "booked"     → "Purchase" Meta standard event — the actual conversion:
 *                      the client paid / the deal closed. This is the single
 *                      most valuable signal for Meta's ad optimization, and
 *                      is sent with the booking's value + currency when known.
 *
 * "interested" is intentionally left unmapped (too close to the Lead event
 * Meta already recorded), as are "negotiating" (no clear standard event),
 * "completed" (the conversion was already reported at "booked"), "lost", and
 * "new". A status with no entry here is a silent no-op — nothing is sent.
 */
export const META_STATUS_EVENT_MAP = {
  contacted: 'Contact',
  booked: 'Purchase',
}

/**
 * One of Meta's fixed action_source values for a CRM-triggered (not
 * browser/app) event: phone_call | chat | physical_store | system_generated | other.
 * "system_generated" fits a status change made inside the CRM.
 */
export function metaCapiActionSource() {
  return process.env.META_CAPI_ACTION_SOURCE || 'system_generated'
}
