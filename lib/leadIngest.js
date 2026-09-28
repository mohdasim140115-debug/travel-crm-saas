import Lead from '@/models/Lead'
import LeadTimeline from '@/models/LeadTimeline'
import Brand from '@/models/Brand'
import Team from '@/models/Team'
import { assignLeadRoundRobin } from '@/lib/assignRoundRobin'
import { notifyLeadAssigned } from '@/lib/notifyLeadAssigned'
import { enqueueFollowUpReminder } from '@/lib/queue/bull'
import { normalizeInboundBody } from '@/lib/metaLeadParser'
import mongoose from 'mongoose'

const SOURCE_TO_CHANNEL = {
  facebook_ads: 'meta',
  instagram: 'meta',
  google_ads: 'google',
  api: 'api',
  website: 'website',
  direct: 'manual',
  referral: 'manual',
  social: 'manual',
  other: 'manual',
}

/**
 * Unified lead ingestion — used by manual CRM, public API, Meta webhook, and
 * Google Ads (Lead Form webhook + landing-page/website form) intake.
 *
 * @param {Object} opts
 * @param {string|ObjectId} opts.teamId
 * @param {Object} opts.body — raw request body
 * @param {'manual'|'api'|'meta'|'google'} opts.channel — how lead entered
 * @param {string} [opts.createdBy] — userId for manual creates
 * @param {boolean} [opts.autoAssign=true]
 */
export async function ingestLead({ teamId, body, channel = 'api', createdBy, autoAssign = true }) {
  const tid = new mongoose.Types.ObjectId(String(teamId))
  const normalized = normalizeInboundBody(body)

  if (!normalized.email && !normalized.phone) {
    return { error: 'email or phone required', status: 400 }
  }

  // Dedupe Meta/API leads
  if (normalized.externalId) {
    const dup = await Lead.findOne({
      teamId: tid,
      externalId: String(normalized.externalId),
    }).lean()
    if (dup) {
      return {
        duplicate: true,
        leadId: dup._id,
        lead: dup,
        message: 'Lead already exists',
        status: 200,
      }
    }
  }

  let brandId = body.brandId || null
  if (!brandId) {
    const def = await Brand.findOne({ teamId: tid, isDefault: true })
    brandId = def?._id || null
  }

  const source =
    channel === 'meta'
      ? 'facebook_ads'
      : channel === 'google'
        ? 'google_ads'
        : channel === 'manual'
          ? body.source || 'direct'
          : normalized.source || 'api'

  const ingestChannel = SOURCE_TO_CHANNEL[source] || channel

  let assignedTo = body.assignedTo || body.assignee || null
  if (!assignedTo && autoAssign !== false && autoAssign !== 'false') {
    assignedTo = await assignLeadRoundRobin(tid)
  }

  const travelDate = normalized.travelDate ? new Date(normalized.travelDate) : undefined
  const destinationList = normalized.destination
    ? [normalized.destination]
    : body.destinationPreference || []

  // Manual creates may set an initial pipeline status (e.g. Lost) + lost details.
  const initialStatus = channel === 'manual' && body.status ? body.status : 'new'
  const isLost = initialStatus === 'lost'

  const lead = await Lead.create({
    firstName: normalized.firstName,
    lastName: normalized.lastName || '',
    email: normalized.email || `lead_${Date.now()}@placeholder.local`,
    phone: normalized.phone,
    city: normalized.city,
    destination: normalized.destination,
    travelDate: travelDate && !isNaN(travelDate.getTime()) ? travelDate : undefined,
    destinationPreference: destinationList,
    source,
    ingestChannel,
    externalId: normalized.externalId ? String(normalized.externalId) : undefined,
    teamId: tid,
    brandId,
    assignedTo,
    notes: normalized.notes || body.notes,
    lostReason: isLost ? body.lostReason : undefined,
    lostDetails: isLost ? body.lostDetails : undefined,
    statusHistory:
      initialStatus !== 'new'
        ? [
            {
              from: 'new',
              to: initialStatus,
              changedBy: createdBy ? new mongoose.Types.ObjectId(String(createdBy)) : undefined,
              changedAt: new Date(),
            },
          ]
        : [],
    metadata: {
      ...normalized.metadata,
      ...(channel === 'meta' ? { meta: normalized.rawFields || body.metadata?.meta } : {}),
      ...(channel === 'google' ? { google: body.metadata?.google } : {}),
    },
    status: initialStatus,
  })

  const timelineTitle =
    channel === 'meta'
      ? 'Lead captured from Meta'
      : channel === 'google'
        ? 'Lead captured from Google Ads'
        : channel === 'manual'
          ? 'Lead added manually'
          : 'Lead captured via API'

  await LeadTimeline.create({
    leadId: lead._id,
    teamId: tid,
    brandId,
    type: assignedTo ? 'assignment' : 'system',
    title: timelineTitle,
    body: assignedTo ? `Assigned via weight system` : `Source: ${source}`,
    createdBy: createdBy ? new mongoose.Types.ObjectId(String(createdBy)) : undefined,
    metadata: { assignedTo, channel, source },
  }).catch(() => {})

  // A note typed in "Remarks / Conversation notes" while adding a lead by hand
  // used to live only on lead.notes — the Remarks (💬) dialog reads the
  // timeline, so it showed nothing. Write it there as the lead's first remark.
  const initialRemark = channel === 'manual' ? String(body.notes || '').trim() : ''
  if (initialRemark) {
    await LeadTimeline.create({
      leadId: lead._id,
      teamId: tid,
      brandId,
      type: 'note',
      title: 'Remark',
      body: initialRemark,
      createdBy: createdBy ? new mongoose.Types.ObjectId(String(createdBy)) : undefined,
    }).catch(() => {})
  }

  // Notifies the assignee (if any) and always notifies the owner that a lead
  // came in — covers manual adds, API/website ingest, and Meta lead ads alike.
  await notifyLeadAssigned({ lead, teamId: tid })

  const team = await Team.findById(tid)
  if (team?.usage) {
    team.usage.leadsThisMonth = (team.usage.leadsThisMonth || 0) + 1
    await team.save()
  }

  await enqueueFollowUpReminder({
    leadId: String(lead._id),
    teamId: String(tid),
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
  }).catch(() => {})

  const populated = await lead.populate('assignedTo', 'name email')

  return {
    lead: populated,
    leadId: lead._id,
    message: 'Lead created',
    status: 201,
  }
}
