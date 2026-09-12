/**
 * Meta Lead Ads — pull sync.
 *
 * The webhook in app/api/webhooks/meta/leads only works if the agency can
 * configure a callback on their Meta page. Many can't, but every one of them
 * can copy a form ID and a page access token out of Meta Business Suite. This
 * module polls the Graph API with those two values and funnels whatever it
 * finds through the same ingestLead() path as every other source, so weight
 * assignment, notifications and dedupe behave identically.
 */

import crypto from 'crypto'
import Team from '@/models/Team'
import { ingestLead } from '@/lib/leadIngest'
import { parseMetaFieldData } from '@/lib/metaLeadParser'
import { assignLeadFromFormPool } from '@/lib/assignRoundRobin'

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0'
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`

/** Pages fetched per form per run — a hard stop against a runaway backfill. */
const MAX_PAGES = 20
const PAGE_SIZE = 100

/* ------------------------------------------------------------------ *
 * Token encryption
 * ------------------------------------------------------------------ */

/**
 * Derived from an existing server secret so no new env var is required to get
 * this working, while still allowing a dedicated key in production.
 */
function encryptionKey() {
  const secret =
    process.env.META_TOKEN_SECRET || process.env.JWT_SECRET || 'meta-token-fallback-secret'
  return crypto.createHash('sha256').update(secret, 'utf8').digest()
}

export function encryptToken(plain) {
  if (!plain) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

export function decryptToken(stored) {
  if (!stored) return null
  try {
    const [version, ivB64, tagB64, dataB64] = String(stored).split(':')
    if (version !== 'v1') return null
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(ivB64, 'base64')
    )
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // Wrong key or tampered value — treat as "no token configured" rather than
    // throwing, so a rotated JWT_SECRET degrades to "reconnect Meta".
    return null
  }
}

/** Last 6 characters, for showing the owner which token is saved. */
export function maskToken(plain) {
  if (!plain) return ''
  const s = String(plain)
  return s.length <= 6 ? '••••••' : `••••••${s.slice(-6)}`
}

/* ------------------------------------------------------------------ *
 * Graph API
 * ------------------------------------------------------------------ */

async function graphGet(path, params, { timeoutMs = 20000 } = {}) {
  const url = new URL(`${GRAPH}/${path}`)
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.error) {
      const err = json.error || {}
      return {
        ok: false,
        // Meta's messages are already user-facing ("Error validating access
        // token: Session has expired"), so pass them straight through.
        error: err.message || `Meta API error (HTTP ${res.status})`,
        code: err.code,
        subcode: err.error_subcode,
      }
    }
    return { ok: true, data: json }
  } catch (e) {
    return {
      ok: false,
      error: e.name === 'AbortError' ? 'Meta API timed out' : `Meta API unreachable: ${e.message}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Confirm a form ID + token pair works before saving it.
 * @returns {{ok: boolean, form?: {id, name, status, leadsCount}, error?: string}}
 */
export async function verifyMetaForm(formId, accessToken) {
  const id = String(formId || '').trim()
  if (!id) return { ok: false, error: 'Form ID required' }
  if (!accessToken) return { ok: false, error: 'Access token required' }

  const meta = await graphGet(id, {
    access_token: accessToken,
    fields: 'id,name,status,leads_count',
  })
  if (!meta.ok) return { ok: false, error: meta.error }

  // A page ID also answers the call above, but has no leads edge — checking it
  // here means the owner finds out now instead of on the first silent sync.
  const probe = await graphGet(`${id}/leads`, { access_token: accessToken, limit: 1 })
  if (!probe.ok) {
    return {
      ok: false,
      error: `${probe.error} — check this is a Lead Ads *form* ID and the token has leads_retrieval permission.`,
    }
  }

  return {
    ok: true,
    form: {
      id: meta.data.id,
      name: meta.data.name || `Form ${meta.data.id}`,
      status: meta.data.status || 'UNKNOWN',
      leadsCount: meta.data.leads_count ?? null,
    },
  }
}

/**
 * All leads for one form, newest-first from Meta, optionally only those created
 * after `since`. Returned oldest-first so ingestion order matches reality.
 */
export async function fetchFormLeads(formId, accessToken, since) {
  const collected = []
  const params = {
    access_token: accessToken,
    limit: PAGE_SIZE,
    fields: 'id,created_time,field_data,form_id,ad_id,ad_name,campaign_name,platform',
  }
  if (since instanceof Date && !isNaN(since.getTime())) {
    params.filtering = JSON.stringify([
      {
        field: 'time_created',
        operator: 'GREATER_THAN',
        value: Math.floor(since.getTime() / 1000),
      },
    ])
  }

  let next = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = next
      ? await graphGet(`${formId}/leads`, { access_token: accessToken, after: next, ...params })
      : await graphGet(`${formId}/leads`, params)

    if (!res.ok) return { ok: false, error: res.error, leads: collected }

    collected.push(...(res.data.data || []))
    next = res.data.paging?.cursors?.after
    if (!res.data.paging?.next || !next) break
  }

  collected.reverse()
  return { ok: true, leads: collected, truncated: collected.length >= MAX_PAGES * PAGE_SIZE }
}

/* ------------------------------------------------------------------ *
 * Sync
 * ------------------------------------------------------------------ */

/**
 * Pull new leads for one workspace and write them into the CRM.
 *
 * @param {object} team - a Team mongoose document
 * @param {object} [opts]
 * @param {boolean} [opts.full] - ignore the incremental watermark and re-scan
 *   everything (dedupe by externalId still stops re-imports)
 * @returns {{ok, created, duplicates, failed, forms, error}}
 */
export async function syncTeamMetaLeads(team, { full = false } = {}) {
  const cfg = team?.metaSync
  const accessToken = decryptToken(cfg?.accessTokenEnc)
  const formIds = (cfg?.formIds || []).map((f) => String(f).trim()).filter(Boolean)
  // Owner can round-robin a specific form's leads among only a chosen subset
  // of employees instead of the whole team — an empty/missing list means
  // "All employees" (the normal team-wide round robin).
  const employeePoolByForm = new Map(
    (cfg?.formAssignments || [])
      .filter((a) => a.formId && a.assignedTo?.length)
      .map((a) => [String(a.formId).trim(), a.assignedTo])
  )

  if (!accessToken) {
    return { ok: false, error: 'No Meta access token saved', created: 0, duplicates: 0, failed: 0, forms: [] }
  }
  if (!formIds.length) {
    return { ok: false, error: 'No Meta form IDs saved', created: 0, duplicates: 0, failed: 0, forms: [] }
  }

  const since = full ? null : cfg?.lastLeadCreatedTime
  const summary = { created: 0, duplicates: 0, failed: 0, forms: [] }
  let newestSeen = since instanceof Date ? new Date(since) : null
  const errors = []

  for (const formId of formIds) {
    const result = await fetchFormLeads(formId, accessToken, since)
    const perForm = { formId, fetched: result.leads.length, created: 0, duplicates: 0, failed: 0 }

    if (!result.ok) {
      perForm.error = result.error
      errors.push(`${formId}: ${result.error}`)
    }

    const formPool = employeePoolByForm.get(String(formId))

    for (const raw of result.leads) {
      const parsed = parseMetaFieldData(raw.field_data || [])
      const createdTime = raw.created_time ? new Date(raw.created_time) : null

      // Each lead rotates through the form's own chosen pool — computed
      // per-lead (not once per form) so a batch of several leads from the
      // same run actually round-robins between them instead of all landing
      // on whoever the pool pointed to first.
      const pinnedAssignee = formPool ? await assignLeadFromFormPool(team._id, formId, formPool) : null

      try {
        const ingested = await ingestLead({
          teamId: team._id,
          body: {
            ...parsed,
            externalId: raw.id,
            source: 'facebook_ads',
            ...(pinnedAssignee ? { assignedTo: pinnedAssignee } : {}),
            metadata: {
              meta: {
                leadgen_id: raw.id,
                form_id: raw.form_id || formId,
                ad_id: raw.ad_id,
                ad_name: raw.ad_name,
                campaign_name: raw.campaign_name,
                platform: raw.platform,
                created_time: raw.created_time,
                synced_via: 'form_pull',
              },
            },
          },
          channel: 'meta',
        })

        if (ingested.duplicate) {
          perForm.duplicates++
          summary.duplicates++
        } else if (ingested.error) {
          // Usually "email or phone required" — a form that collects neither.
          perForm.failed++
          summary.failed++
        } else {
          perForm.created++
          summary.created++
        }
      } catch (e) {
        perForm.failed++
        summary.failed++
        console.error('Meta sync ingest failed:', formId, raw.id, e.message)
      }

      // Advanced even for duplicates and failures: a lead that can't be
      // ingested now won't succeed on the next run either, and leaving the
      // watermark behind would refetch it forever.
      if (createdTime && !isNaN(createdTime.getTime())) {
        if (!newestSeen || createdTime > newestSeen) newestSeen = createdTime
      }
    }

    summary.forms.push(perForm)
  }

  const ok = errors.length === 0
  team.metaSync.lastSyncAt = new Date()
  team.metaSync.lastSyncStatus = ok ? 'ok' : summary.created > 0 ? 'partial' : 'error'
  team.metaSync.lastSyncError = ok ? undefined : errors.join(' | ').slice(0, 500)
  team.metaSync.lastSyncCreated = summary.created
  team.metaSync.totalSynced = (team.metaSync.totalSynced || 0) + summary.created
  if (newestSeen) team.metaSync.lastLeadCreatedTime = newestSeen
  await team.save()

  return { ok, ...summary, error: ok ? undefined : errors.join(' | ') }
}

/** Every workspace with the pull sync switched on. */
export async function findSyncEnabledTeams() {
  return Team.find({
    'metaSync.enabled': true,
    'metaSync.accessTokenEnc': { $exists: true, $ne: null },
    isActive: { $ne: false },
  })
}
