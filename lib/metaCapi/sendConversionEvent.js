/**
 * CRM → Meta Conversions API: report a Meta-origin lead's status change back
 * to Meta (e.g. "contacted" → Contact, "booked" → Purchase) so Meta's ad
 * delivery can optimize for leads that actually convert, not just form fills.
 *
 * This is one-directional and additive — it never touches, and does not run
 * inside, the existing Meta → CRM lead-import path (lib/metaSync.js,
 * app/api/webhooks/meta/leads). It only reuses the Meta lead identifier that
 * import already stores (Lead.externalId, the Graph API leadgen_id).
 *
 * Call sites (the CRM's two places a lead's status actually changes):
 *   - app/api/leads/[id]/route.js  (PUT — any status edit)
 *   - app/api/bookings/route.js    (POST — lead flipped to "booked")
 * Both call `notifyMetaLeadStatusChange` fire-and-forget-safe: this function
 * never throws, so a Meta outage can never fail the user's CRM update.
 */

import connectDB from '@/lib/mongodb'
import Team from '@/models/Team'
import MetaConversionEvent from '@/models/MetaConversionEvent'
import { metaCapiConfigForTeam, isMetaCapiConfiguredForTeam, META_STATUS_EVENT_MAP, metaCapiActionSource } from './config'
import { hashEmail, hashPhone, hashName, hashExternalId, sha256Hex } from './hash'

/**
 * @param {Object} params
 * @param {Object} params.lead — the Lead document (or a lean object) *after*
 *   the status change was saved. Must include: _id, ingestChannel,
 *   externalId, email, phone, firstName, lastName, teamId.
 * @param {string} params.newStatus
 * @param {string} [params.previousStatus]
 * @param {{ value?: number, currency?: string }} [params.custom] — optional
 *   deal value (e.g. a booking's totalAmount/currency), attached to
 *   custom_data when present.
 */
export async function notifyMetaLeadStatusChange({ lead, newStatus, previousStatus, custom }) {
  try {
    if (!lead || !newStatus) return

    // Not a Meta-origin lead — nothing to report back, and nothing to log;
    // this is the normal case for the large majority of leads.
    if (lead.ingestChannel !== 'meta') return

    const eventName = META_STATUS_EVENT_MAP[newStatus]
    if (!eventName) return // status not mapped — deliberate no-op, see config.js

    const metaLeadId = lead.externalId ? String(lead.externalId) : ''
    if (!metaLeadId) {
      console.warn('[META_CAPI_EVENT_SKIPPED] Meta-origin lead has no stored Meta lead id (Lead.externalId)', {
        leadId: String(lead._id),
        status: newStatus,
        eventName,
      })
      return
    }

    await connectDB()

    // Per-team credentials — every agency configures its own Meta dataset +
    // Conversions API token in its own Settings, so one team's Meta data
    // never touches another's. See lib/metaCapi/config.js.
    const team = await Team.findById(lead.teamId).select('metaSync.capiEnabled metaSync.capiDatasetId metaSync.capiAccessTokenEnc')
    if (!isMetaCapiConfiguredForTeam(team)) {
      console.warn('[META_CAPI_EVENT_SKIPPED] Conversions API not configured/enabled for this team', {
        leadId: String(lead._id),
        teamId: String(lead.teamId || ''),
        metaLeadId,
        status: newStatus,
        eventName,
      })
      return
    }

    // Idempotency: this lead/status/event has already been reported
    // successfully — never re-send it (e.g. editing the lead back and forth,
    // or the status being re-saved with the same value).
    const already = await MetaConversionEvent.findOne({
      leadId: lead._id,
      status: newStatus,
      eventName,
      success: true,
    })
      .select('_id')
      .lean()
    if (already) {
      console.log('[META_CAPI_EVENT_SKIPPED] already sent — skipping duplicate', {
        leadId: String(lead._id),
        metaLeadId,
        status: newStatus,
        eventName,
      })
      return
    }

    // Deterministic per lead+status+event — a retry reuses the same id
    // instead of minting a new one, so Meta's own dedup can catch it too.
    const eventId = sha256Hex(`${metaLeadId}:${eventName}:${newStatus}`).slice(0, 40)

    const userData = {
      lead_id: metaLeadId, // NOT hashed — Meta's Lead Ads match key
    }
    const em = hashEmail(lead.email)
    if (em) userData.em = [em]
    const ph = hashPhone(lead.phone)
    if (ph) userData.ph = [ph]
    const fn = hashName(lead.firstName)
    if (fn) userData.fn = [fn]
    const ln = hashName(lead.lastName)
    if (ln) userData.ln = [ln]
    const extId = hashExternalId(lead._id)
    if (extId) userData.external_id = [extId]

    const event = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: metaCapiActionSource(),
      user_data: userData,
      ...(custom?.value != null
        ? { custom_data: { value: Number(custom.value), currency: custom.currency || 'INR' } }
        : {}),
    }

    const { accessToken, datasetId, apiVersion } = metaCapiConfigForTeam(team)
    const url = `https://graph.facebook.com/${apiVersion}/${datasetId}/events`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    let res, json
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // access_token in the body (not the URL) so it never lands in a
        // request-log line that captures the URL.
        body: JSON.stringify({ data: [event], access_token: accessToken }),
        signal: controller.signal,
      })
      json = await res.json().catch(() => ({}))
    } finally {
      clearTimeout(timer)
    }

    const success = Boolean(res?.ok && !json?.error)

    try {
      await MetaConversionEvent.create({
        leadId: lead._id,
        teamId: lead.teamId,
        metaLeadId,
        status: newStatus,
        eventName,
        eventId,
        success,
        responseStatus: res?.status,
        errorMessage: success ? undefined : json?.error?.message || `HTTP ${res?.status}`,
      })
    } catch (logErr) {
      // The unique partial index rejects a rare double-send race — that's the
      // idempotency guard doing its job, not a real failure.
      if (logErr?.code !== 11000) {
        console.error('[META_CAPI] failed to record event log:', logErr?.message)
      }
    }

    if (success) {
      console.log('[META_CAPI_EVENT_SENT]', {
        leadId: String(lead._id),
        metaLeadId,
        status: newStatus,
        eventName,
        eventId,
        httpStatus: res?.status,
      })
    } else {
      console.error('[META_CAPI_EVENT_FAILED]', {
        leadId: String(lead._id),
        metaLeadId,
        status: newStatus,
        eventName,
        eventId,
        httpStatus: res?.status,
        error: json?.error?.message || `HTTP ${res?.status}`,
      })
    }
  } catch (error) {
    // Belt-and-braces: this function must NEVER throw into its caller — a
    // Meta CAPI problem must never fail a CRM status update.
    console.error('[META_CAPI_EVENT_FAILED] unexpected error', error?.message)
  }
}
