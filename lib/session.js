import crypto from 'crypto'
import { generateToken } from '@/lib/auth'
import RefreshToken from '@/models/RefreshToken'
import User from '@/models/User'
import Team from '@/models/Team'
import { isSubscriptionExpired } from '@/lib/subscription'

const REFRESH_DAYS = 7

/**
 * How long a just-rotated refresh token still buys you a session.
 *
 * Two tabs (or a request that raced the silent refresh) can present the same
 * token within milliseconds of each other. Rotation revokes on first use, so
 * without a grace window the loser of that race is logged out for no reason.
 * Outside the window a rotated token is treated as leaked — see below.
 */
const ROTATION_GRACE_MS = 60_000

export function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex')
}

/**
 * @param {object} user
 * @param {object} [impersonatedBy] - superadmin JWT payload, when this token is
 *   a support-impersonation session. Stamped into the `imp` claim so every
 *   downstream route can tell a real login from an assumed identity.
 */
export function buildAccessPayload(user, impersonatedBy = null) {
  const teamId = user.teamId ? String(user.teamId) : null
  const brandId = user.activeBrandId ? String(user.activeBrandId) : null
  const payload = {
    userId: String(user._id),
    email: user.email,
    role: user.role,
    teamId,
    workspaceId: teamId,
    brandId,
    // Set only for an itinerary-only teammate added via Team (not the
    // original owner the super admin created) — lets routes tell the two
    // apart even though they share the same `role`.
    requestedBy: user.requestedBy ? String(user.requestedBy) : null,
  }
  if (impersonatedBy) {
    payload.imp = {
      by: String(impersonatedBy.userId),
      byEmail: impersonatedBy.email,
    }
  }
  return payload
}

export async function issueSession(user, { userAgent, ip, familyId } = {}) {
  const accessToken = generateToken(buildAccessPayload(user))
  const rawRefresh = crypto.randomBytes(48).toString('hex')
  const tokenHash = hashRefreshToken(rawRefresh)
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000)

  await RefreshToken.create({
    userId: user._id,
    tokenHash,
    familyId: familyId || crypto.randomUUID(),
    expiresAt,
    userAgent: userAgent || null,
    ip: ip || null,
  })

  return { accessToken, refreshToken: rawRefresh, expiresAt }
}

export async function rotateRefreshToken(oldRaw, { userAgent, ip } = {}) {
  const oldHash = hashRefreshToken(oldRaw)
  // Looked up regardless of state: an already-revoked token still has to be
  // told apart from an unknown one, since one is a race and the other is theft.
  const existing = await RefreshToken.findOne({ tokenHash: oldHash })
  if (!existing || existing.expiresAt <= new Date()) {
    return null
  }

  // A token killed by reuse detection is dead permanently — the grace window
  // below must not resurrect it, or one stolen token would take the whole
  // family down and then hand the thief a brand new session anyway.
  if (existing.revokedReason === 'reuse-detected') {
    return null
  }

  if (existing.revokedAt) {
    const age = Date.now() - existing.revokedAt.getTime()
    if (age > ROTATION_GRACE_MS) {
      // Rotated long ago and presented again — the token leaked. Kill every
      // live token from the same login, not just this one.
      if (existing.familyId) {
        await RefreshToken.updateMany(
          { familyId: existing.familyId },
          { $set: { revokedAt: new Date(), revokedReason: 'reuse-detected' } }
        )
      }
      return null
    }
    // Inside the window: a concurrent refresh, not an attack. Fall through and
    // hand out a fresh session in the same family.
  }

  const user = await User.findById(existing.userId)
  if (!user || !user.isActive || user.isBlocked) {
    if (!existing.revokedAt) {
      existing.revokedAt = new Date()
      await existing.save()
    }
    return null
  }

  // Cuts an already-open session within one silent-refresh cycle (~15 min) of
  // the workspace being suspended or its subscription lapsing — not just new
  // logins. Super admins are platform-level and exempt, same as at login.
  if (user.teamId && user.role !== 'superadmin') {
    const team = await Team.findById(user.teamId).select('isActive subscriptionExpiresAt').lean()
    if (team && (team.isActive === false || isSubscriptionExpired(team))) {
      if (!existing.revokedAt) {
        existing.revokedAt = new Date()
        await existing.save()
      }
      return null
    }
  }

  if (!existing.revokedAt) {
    existing.revokedAt = new Date()
    await existing.save()
  }

  const session = await issueSession(user, {
    userAgent,
    ip,
    familyId: existing.familyId,
  })
  return { ...session, user: publicUser(user) }
}

export function publicUser(user) {
  return {
    id: user._id,
    userId: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    teamId: user.teamId,
    workspaceId: user.teamId,
    activeBrandId: user.activeBrandId || null,
    requestedBy: user.requestedBy ? String(user.requestedBy) : null,
  }
}
