import User from '@/models/User'
import Team from '@/models/Team'
import mongoose from 'mongoose'
import { LEAD_ASSIGNABLE_ROLES } from '@/lib/permissions'

/**
 * Build weighted pool: user with weight 3 appears 3 times in the ring.
 * Weight 0 = excluded (e.g. employee in training).
 */
function buildWeightedPool(candidates) {
  const pool = []
  for (const c of candidates) {
    const w = Math.max(0, c.leadAssignmentWeight ?? 1)
    for (let i = 0; i < w; i++) {
      pool.push(c._id)
    }
  }
  return pool
}

/**
 * Pick next assignee using weighted round-robin among sales employees.
 */
export async function assignLeadRoundRobin(teamId) {
  const tid = new mongoose.Types.ObjectId(String(teamId))
  const candidates = await User.find({
    teamId: tid,
    isActive: true,
    isBlocked: false,
    role: { $in: LEAD_ASSIGNABLE_ROLES },
    leadAssignmentWeight: { $gt: 0 },
  })
    .sort({ _id: 1 })
    .select('_id leadAssignmentWeight')
    .lean()

  if (!candidates.length) {
    return null
  }

  const pool = buildWeightedPool(candidates)
  if (!pool.length) return null

  const team = await Team.findById(tid).select('leadRoundRobinIndex')
  if (!team) return null

  const idx = (team.leadRoundRobinIndex || 0) % pool.length
  const assignee = pool[idx]

  team.leadRoundRobinIndex = (team.leadRoundRobinIndex || 0) + 1
  await team.save()

  return assignee
}

/**
 * Weighted round-robin restricted to one Meta Lead Ads form's chosen
 * employees (Settings → Meta Lead Ads → per-form assignment), instead of the
 * whole team. Keeps its own rotation position (`roundRobinIndex` on that
 * form's entry) so it doesn't share state with — or get thrown off by — the
 * team-wide round robin every other lead source uses.
 */
export async function assignLeadFromFormPool(teamId, formId, employeeIds) {
  const tid = new mongoose.Types.ObjectId(String(teamId))
  const ids = (employeeIds || []).map((id) => new mongoose.Types.ObjectId(String(id)))
  if (!ids.length) return null

  const candidates = await User.find({
    _id: { $in: ids },
    teamId: tid,
    isActive: true,
    isBlocked: false,
    leadAssignmentWeight: { $gt: 0 },
  })
    .sort({ _id: 1 })
    .select('_id leadAssignmentWeight')
    .lean()

  if (!candidates.length) return null

  const pool = buildWeightedPool(candidates)
  if (!pool.length) return null

  const team = await Team.findById(tid).select('metaSync.formAssignments')
  if (!team) return null

  const entry = (team.metaSync?.formAssignments || []).find((a) => a.formId === String(formId))
  if (!entry) return null

  const idx = (entry.roundRobinIndex || 0) % pool.length
  const assignee = pool[idx]
  entry.roundRobinIndex = (entry.roundRobinIndex || 0) + 1
  await team.save()

  return assignee
}

/**
 * Plain (unweighted) round-robin among all active users of a given role —
 * used to hand a new booking to exactly one Operations person and one
 * Accounts person, instead of every teammate in that role seeing it.
 */
export async function assignByRoleRoundRobin(teamId, role, indexField) {
  const tid = new mongoose.Types.ObjectId(String(teamId))
  const candidates = await User.find({
    teamId: tid,
    isActive: true,
    isBlocked: false,
    role,
  })
    .sort({ _id: 1 })
    .select('_id')
    .lean()

  if (!candidates.length) return null

  const team = await Team.findById(tid).select(indexField)
  if (!team) return null

  const idx = (team[indexField] || 0) % candidates.length
  const assignee = candidates[idx]._id

  team[indexField] = (team[indexField] || 0) + 1
  await team.save()

  return assignee
}

export { buildWeightedPool }
