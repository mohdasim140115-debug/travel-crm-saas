import mongoose from 'mongoose'

/**
 * Log of every Meta Conversions API event this CRM has sent (or tried to
 * send) back to Meta when a Meta-origin lead's status changed — e.g.
 * "contacted" → Contact, "booked" → Purchase. Doubles as the idempotency
 * ledger: a lead/status/event combination that already succeeded is never
 * re-sent (see the partial unique index below), so editing a lead back and
 * forth, or a retried request, can't double-count a conversion on Meta's side.
 *
 * Never store the customer's raw PII or the Meta access token here — only
 * identifiers and the outcome of the API call.
 */
const metaConversionEventSchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      index: true,
    },
    /** The Meta leadgen_id this lead was originally imported with (Lead.externalId) — reused, never invented. */
    metaLeadId: {
      type: String,
      required: true,
    },
    /** CRM status that triggered this event (e.g. "contacted", "booked"). */
    status: {
      type: String,
      required: true,
    },
    /** Meta event name sent (e.g. "Contact", "Purchase") — from the configurable status→event map. */
    eventName: {
      type: String,
      required: true,
    },
    /** Deterministic id sent as `event_id` in the CAPI payload. */
    eventId: {
      type: String,
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    success: {
      type: Boolean,
      default: false,
    },
    /** HTTP status Meta's /events endpoint returned. */
    responseStatus: Number,
    /** Meta's own error message on failure — never the request payload (no PII). */
    errorMessage: String,
    retryCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
)

// The idempotency guarantee itself: at most one *successful* send per
// lead+status+event combination. Failed attempts are allowed to accumulate
// (each is its own document) so retries are still logged individually.
metaConversionEventSchema.index(
  { leadId: 1, status: 1, eventName: 1 },
  { unique: true, partialFilterExpression: { success: true } }
)

export default mongoose.models.MetaConversionEvent ||
  mongoose.model('MetaConversionEvent', metaConversionEventSchema)
