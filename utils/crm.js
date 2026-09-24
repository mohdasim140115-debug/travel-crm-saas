export function leadDisplayName(lead) {
  if (!lead) return 'Unknown'
  if (typeof lead === 'string') return lead
  const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim()
  return name || lead.name || (isPlaceholderEmail(lead.email) ? '' : lead.email) || 'Unknown'
}

/**
 * A lead's `email` is a required DB field, so a Meta/Google submission that
 * only ever collected a phone number gets a synthetic
 * `lead_<timestamp>@placeholder.local` (see lib/leadIngest.js) just to
 * satisfy that. It was never meant to be shown to anyone — it's a schema
 * filler, not the person's real address.
 */
export function isPlaceholderEmail(email) {
  return /^lead_\d+@placeholder\.local$/i.test(String(email || ''))
}

/** What to actually show for a lead's email — blank instead of the filler. */
export function displayEmail(email) {
  return isPlaceholderEmail(email) ? '' : email || ''
}

export function formatInr(amount, currency = 'INR') {
  const n = Number(amount) || 0
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `₹${n.toLocaleString('en-IN')}`
  }
}

/** "Not Interested" / "Cancelled" leads — dead ends that need no further
 * action. Statuses are configurable per agency (Settings → Lead Statuses), so
 * this matches on the key/label rather than one fixed spelling. */
export function isInactiveLeadStatus(keyOrLabel) {
  return /not[\s_-]*interested|cancel/i.test(String(keyOrLabel || ''))
}

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'interested',
  'negotiating',
  'booked',
  'completed',
  'lost',
]
