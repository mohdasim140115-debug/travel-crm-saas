import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb'
import Team from '@/models/Team'
import User from '@/models/User'
import Lead from '@/models/Lead'
import Booking from '@/models/Booking'
import Payment from '@/models/Payment'
import Brand from '@/models/Brand'
import Plan from '@/models/Plan'
import RefreshToken from '@/models/RefreshToken'
import { requireSuperadmin, denied, recordPlatformAudit } from '@/lib/superadmin'
import { resolveTeamLimits, sanitizeLimits, LIMIT_KEYS } from '@/lib/plans'
import { addOneMonth } from '@/lib/subscription'
import { tenantScopedModels } from '@/lib/registerModels'

const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'cancelled']

function badId() {
  return Response.json({ error: 'Invalid agency id' }, { status: 400 })
}

/** GET — full agency profile: team, owner, staff, brands, usage vs limits. */
export async function GET(request, { params }) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) return badId()

    await connectDB()
    const team = await Team.findById(id).populate('owner', 'name email phone').lean()
    if (!team) {
      return Response.json({ error: 'Agency not found' }, { status: 404 })
    }

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [users, brands, leadCount, leadsThisMonth, bookingCount, revenueAgg, plans, limits] =
      await Promise.all([
        User.find({ teamId: team._id })
          .select('name email role isActive isBlocked lastLogin leadAssignmentWeight createdAt')
          .sort({ createdAt: 1 })
          .lean(),
        Brand.find({ teamId: team._id }).select('name isDefault isActive').lean(),
        Lead.countDocuments({ teamId: team._id }),
        Lead.countDocuments({ teamId: team._id, createdAt: { $gte: startOfMonth } }),
        Booking.countDocuments({ teamId: team._id }),
        Payment.aggregate([
          { $match: { teamId: new mongoose.Types.ObjectId(String(team._id)), status: 'completed' } },
          { $group: { _id: null, sum: { $sum: '$amount' } } },
        ]),
        Plan.find({}).select('key name priceMonthly limits isActive').sort({ sortOrder: 1 }).lean(),
        resolveTeamLimits(team),
      ])

    const agentCount = users.filter((u) =>
      ['agent', 'manager', 'operations', 'accounts'].includes(u.role)
    ).length

    // The encrypted AI key never leaves the server — only whether one is set.
    const { ai, ...agency } = team
    agency.ai = {
      enabled: Boolean(ai?.anthropicKeyEnc),
      keyLast4: ai?.keyLast4 || null,
      keySavedAt: ai?.keySavedAt || null,
    }

    return Response.json({
      agency,
      users,
      brands,
      plans,
      limits,
      usage: {
        brands: brands.length,
        agents: agentCount,
        leadsThisMonth,
        leads: leadCount,
        bookings: bookingCount,
        revenue: revenueAgg[0]?.sum || 0,
      },
    })
  } catch (error) {
    console.error('Superadmin agency detail error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PATCH — profile, plan, subscription, wallet, suspension and limit overrides. */
export async function PATCH(request, { params }) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) return badId()

    const body = await request.json()
    await connectDB()

    const team = await Team.findById(id)
    if (!team) {
      return Response.json({ error: 'Agency not found' }, { status: 404 })
    }

    const before = {
      name: team.name,
      plan: team.plan,
      subscriptionStatus: team.subscriptionStatus,
      subscriptionExpiresAt: team.subscriptionExpiresAt,
      isActive: team.isActive,
      walletCredits: team.walletCredits,
      planOverrides: team.planOverrides ? { ...team.planOverrides } : {},
    }

    // Renew — push access out another calendar month from whichever is later:
    // right now, or the current expiry (so renewing early doesn't waste the
    // time still left). Also flips the agency back on if it had lapsed.
    const isRenewal = body.renew === true
    if (isRenewal) {
      const base =
        team.subscriptionExpiresAt && new Date(team.subscriptionExpiresAt) > new Date()
          ? new Date(team.subscriptionExpiresAt)
          : new Date()
      team.subscriptionExpiresAt = addOneMonth(base)
      team.subscriptionStatus = 'active'
      if (!team.isActive) {
        team.isActive = true
        team.suspendedAt = undefined
        team.suspensionReason = undefined
      }
    }

    if (typeof body.name === 'string' && body.name.trim()) team.name = body.name.trim()
    if (typeof body.email === 'string') team.email = body.email.trim()
    if (typeof body.phone === 'string') team.phone = body.phone.trim()
    if (typeof body.platformNotes === 'string') team.platformNotes = body.platformNotes

    if (body.plan !== undefined) {
      const planKey = String(body.plan).toLowerCase()
      const exists = await Plan.exists({ key: planKey })
      if (!exists) {
        return Response.json({ error: `Unknown plan "${planKey}"` }, { status: 400 })
      }
      team.plan = planKey
    }

    if (body.subscriptionStatus !== undefined) {
      if (!SUBSCRIPTION_STATUSES.includes(body.subscriptionStatus)) {
        return Response.json({ error: 'Invalid subscription status' }, { status: 400 })
      }
      team.subscriptionStatus = body.subscriptionStatus
    }

    if (body.walletCredits !== undefined) {
      const credits = Number(body.walletCredits)
      if (!Number.isFinite(credits) || credits < 0) {
        return Response.json({ error: 'walletCredits must be a non-negative number' }, { status: 400 })
      }
      team.walletCredits = credits
    }

    if (typeof body.isActive === 'boolean' && body.isActive !== team.isActive) {
      team.isActive = body.isActive
      team.suspendedAt = body.isActive ? undefined : new Date()
      team.suspensionReason = body.isActive ? undefined : body.suspensionReason || 'Suspended by platform admin'
    }

    // `null` for a limit key clears the override so the agency inherits the
    // plan again; omitting the key leaves the existing override untouched.
    if (body.planOverrides && typeof body.planOverrides === 'object') {
      const patch = sanitizeLimits(body.planOverrides)
      const current = team.planOverrides ? { ...team.planOverrides.toObject?.() ?? team.planOverrides } : {}
      // Rebuilt whole rather than mutated key-by-key: assigning `undefined` to a
      // nested Mongoose path doesn't reliably unset it, but replacing the
      // subdocument with an object that omits the key does.
      const next = {}
      for (const key of LIMIT_KEYS) {
        const cleared = key in body.planOverrides && (body.planOverrides[key] === null || body.planOverrides[key] === '')
        if (cleared) continue
        if (key in patch) next[key] = patch[key]
        else if (current[key] !== undefined && current[key] !== null) next[key] = current[key]
      }
      team.planOverrides = next
      team.markModified('planOverrides')
    }

    await team.save()

    // Suspending an agency has to end its users' sessions too, otherwise their
    // existing refresh tokens keep minting fresh access tokens for a week.
    const reactivating = team.isActive && !before.isActive
    if (typeof body.isActive === 'boolean' && !body.isActive) {
      const memberIds = await User.find({ teamId: team._id }).distinct('_id')
      await User.updateMany({ teamId: team._id }, { isActive: false })
      await RefreshToken.updateMany(
        { userId: { $in: memberIds }, revokedAt: null },
        { revokedAt: new Date() }
      )
    } else if (reactivating) {
      // Restore access, but leave individually-blocked users blocked.
      await User.updateMany({ teamId: team._id, isBlocked: { $ne: true } }, { isActive: true })
    }

    const action = isRenewal
      ? 'renew'
      : typeof body.isActive === 'boolean'
        ? body.isActive
          ? 'activate'
          : 'suspend'
        : body.plan !== undefined && body.plan !== before.plan
          ? 'plan_change'
          : 'update'

    await recordPlatformAudit(guard.user, {
      teamId: team._id,
      entity: 'agency',
      entityId: team._id,
      action,
      summary: isRenewal
        ? `Renewed agency "${team.name}" through ${team.subscriptionExpiresAt.toDateString()}`
        : `Updated agency "${team.name}"`,
      changes: {
        before,
        after: {
          name: team.name,
          plan: team.plan,
          subscriptionStatus: team.subscriptionStatus,
          subscriptionExpiresAt: team.subscriptionExpiresAt,
          isActive: team.isActive,
          walletCredits: team.walletCredits,
          planOverrides: team.planOverrides ? { ...team.planOverrides } : {},
        },
      },
    })

    const limits = await resolveTeamLimits(team)
    const { ai, ...updated } = team.toObject()
    updated.ai = { enabled: Boolean(ai?.anthropicKeyEnc), keyLast4: ai?.keyLast4 || null, keySavedAt: ai?.keySavedAt || null }
    return Response.json({ message: 'Agency updated', agency: updated, limits })
  } catch (error) {
    console.error('Superadmin agency update error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE — suspends the agency by default.
 *
 * Passing `?purge=true&confirm=<exact agency name>` permanently erases the
 * tenant and every record scoped to it. The name check exists because this is
 * irreversible and there is no undo.
 */
export async function DELETE(request, { params }) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) return badId()

    const { searchParams } = new URL(request.url)
    const purge = searchParams.get('purge') === 'true'
    const confirm = searchParams.get('confirm') || ''

    await connectDB()
    const team = await Team.findById(id)
    if (!team) {
      return Response.json({ error: 'Agency not found' }, { status: 404 })
    }

    const memberIds = await User.find({ teamId: team._id }).distinct('_id')

    if (!purge) {
      team.isActive = false
      team.suspendedAt = new Date()
      team.suspensionReason = 'Deactivated by platform admin'
      await team.save()
      await User.updateMany({ teamId: team._id }, { isActive: false })
      await RefreshToken.updateMany(
        { userId: { $in: memberIds }, revokedAt: null },
        { revokedAt: new Date() }
      )

      await recordPlatformAudit(guard.user, {
        teamId: team._id,
        entity: 'agency',
        entityId: team._id,
        action: 'suspend',
        summary: `Deactivated agency "${team.name}"`,
      })

      return Response.json({ message: 'Agency deactivated' })
    }

    if (confirm.trim() !== team.name.trim()) {
      return Response.json(
        { error: 'Type the exact agency name to confirm permanent deletion' },
        { status: 400 }
      )
    }

    const teamObjectId = new mongoose.Types.ObjectId(String(team._id))
    const deleted = {}
    for (const { name, model } of tenantScopedModels()) {
      const res = await model.deleteMany({ teamId: teamObjectId })
      if (res.deletedCount) deleted[name] = res.deletedCount
    }
    // RefreshToken is keyed by user, not team, so it needs its own sweep.
    const tokenRes = await RefreshToken.deleteMany({ userId: { $in: memberIds } })
    if (tokenRes.deletedCount) deleted.RefreshToken = tokenRes.deletedCount

    const snapshot = { name: team.name, plan: team.plan, deleted }
    await Team.deleteOne({ _id: team._id })

    // Written last and without teamId — the workspace it referenced is gone.
    await recordPlatformAudit(guard.user, {
      entity: 'agency',
      entityId: team._id,
      action: 'delete',
      summary: `PERMANENTLY deleted agency "${snapshot.name}" and all its data`,
      changes: { before: snapshot },
    })

    return Response.json({ message: `Agency "${snapshot.name}" permanently deleted`, deleted })
  } catch (error) {
    console.error('Superadmin agency delete error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
