import mongoose from 'mongoose'

/**
 * Build MongoDB filter for workspace (team) + optional brand scope.
 * @param {object} authUser - decoded JWT user (teamId, brandId)
 */
export function tenantFilter(authUser) {
  const q = { teamId: new mongoose.Types.ObjectId(String(authUser.teamId)) }
  if (authUser.brandId) {
    q.brandId = new mongoose.Types.ObjectId(String(authUser.brandId))
  }
  return q
}

/**
 * Read-only variant of tenantFilter() for shared catalog data (hotels,
 * vehicles, activities, day-plan templates, marketing templates) that any
 * salesperson can be shown regardless of which single brand they're scoped
 * to. Plain tenantFilter() requires an exact brandId match, so anything the
 * owner added while viewing "All brands" (no brandId set at all) becomes
 * invisible to every brand-scoped user — the owner sees everything, a
 * salesperson pinned to one brand sees only the subset that happens to carry
 * their brandId. Here, a brand-scoped user instead sees their own brand's
 * items PLUS every workspace-wide item that has no brandId.
 * @param {object} authUser - decoded JWT user (teamId, brandId)
 */
export function tenantReadFilter(authUser) {
  const q = { teamId: new mongoose.Types.ObjectId(String(authUser.teamId)) }
  if (authUser.brandId) {
    const brandId = new mongoose.Types.ObjectId(String(authUser.brandId))
    q.$or = [{ brandId }, { brandId: null }, { brandId: { $exists: false } }]
  }
  return q
}

/**
 * Filter for opening ONE lead by id (detail page, timeline, edit). Unlike
 * tenantFilter() it does not require the lead's brand to match the brand
 * picked in the sidebar: new leads land in the default brand (or a Meta
 * form's brand) and round-robin assigns them team-wide, so the owner — or the
 * salesperson it was assigned to — got a notification whose link then said
 * "Lead not found" whenever a different brand was selected. Owners see any
 * lead in their workspace; sales/manager roles see the leads assigned to
 * them; any other role keeps the strict brand scope.
 * @param {object} authUser - decoded JWT user
 * @param {string} id - lead id
 * @param {(role: string) => boolean} ownLeadsOnly - canOnlyViewOwnLeads
 */
export function leadByIdFilter(authUser, id, ownLeadsOnly) {
  const teamId = new mongoose.Types.ObjectId(String(authUser.teamId))
  if (ownLeadsOnly(authUser.role)) {
    return { _id: id, teamId, assignedTo: new mongoose.Types.ObjectId(String(authUser.userId)) }
  }
  if (authUser.role === 'admin') return { _id: id, teamId }
  return { _id: id, ...tenantFilter(authUser) }
}

/**
 * Merge tenant scope into an update body (strip client-supplied teamId).
 */
export function withTenantBody(authUser, body) {
  const { teamId: _t, brandId: _b, ...rest } = body || {}
  const out = { ...rest, teamId: authUser.teamId }
  if (authUser.brandId) {
    out.brandId = authUser.brandId
  }
  return out
}
