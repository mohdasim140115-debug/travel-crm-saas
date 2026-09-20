import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import Team from '@/models/Team'
import Brand from '@/models/Brand'
import RefreshToken from '@/models/RefreshToken'
import { notifyUser } from '@/lib/notify'
import { hashPassword } from '@/lib/auth'
import {
  requireSuperadmin,
  denied,
  recordPlatformAudit,
  escapeRegex,
  parsePaging,
} from '@/lib/superadmin'

const ASSIGNABLE_ROLES = ['agent', 'manager', 'operations', 'accounts', 'admin', 'superadmin', 'user']
const SAFE_FIELDS = '-password -otp -twoFactorSecret -apiKeys -emailVerificationToken -passwordResetToken'

/** GET — every user on the platform, filterable by agency, role and status. */
export async function GET(request) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    await connectDB()

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = parsePaging(searchParams, { defaultLimit: 50 })
    const search = searchParams.get('search')?.trim()
    const role = searchParams.get('role')?.trim()
    const teamId = searchParams.get('teamId')?.trim()
    const status = searchParams.get('status')?.trim()

    const filter = {}
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i')
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }]
    }
    if (role && role !== 'all') filter.role = role
    if (teamId && teamId !== 'all') {
      if (!mongoose.Types.ObjectId.isValid(teamId)) {
        return Response.json({ error: 'Invalid teamId' }, { status: 400 })
      }
      filter.teamId = new mongoose.Types.ObjectId(teamId)
    }
    if (status === 'active') filter.isActive = true
    else if (status === 'suspended') filter.$and = [{ $or: [{ isActive: false }, { isBlocked: true }] }]
    else if (status === 'pending') filter.approvalStatus = 'pending'

    const [users, total, agencies, totalUsers, activeUsers, pendingUsers, suspendedUsers] =
      await Promise.all([
        User.find(filter)
          .select(SAFE_FIELDS)
          .populate('teamId', 'name plan isActive')
          .populate('requestedBy', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(filter),
        Team.find({}).select('name').sort({ name: 1 }).lean(),
        // Platform-wide counters for the summary cards — always unfiltered,
        // so they read as "the whole platform" no matter what's searched.
        User.countDocuments({}),
        User.countDocuments({ isActive: true, isBlocked: { $ne: true } }),
        User.countDocuments({ approvalStatus: 'pending' }),
        User.countDocuments({ $or: [{ isActive: false }, { isBlocked: true }] }),
      ])

    return Response.json({
      users,
      agencies,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      stats: {
        totalUsers,
        activeUsers,
        pendingUsers,
        suspendedUsers,
      },
    })
  } catch (error) {
    console.error('Superadmin users list error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST — create a user inside any agency (or a platform-level superadmin). */
export async function POST(request) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    const body = await request.json()
    const name = String(body?.name || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    const password = String(body?.password || '')
    const role = String(body?.role || 'agent')
    const teamId = body?.teamId

    if (!name || !email || !password) {
      return Response.json({ error: 'name, email and password are required' }, { status: 400 })
    }
    if (password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 })
    }
    // Every role except the platform superadmin belongs to exactly one agency.
    if (role !== 'superadmin' && !teamId) {
      return Response.json({ error: 'An agency is required for this role' }, { status: 400 })
    }

    await connectDB()
    if (await User.exists({ email })) {
      return Response.json({ error: 'Email already registered' }, { status: 409 })
    }

    let team = null
    if (teamId) {
      if (!mongoose.Types.ObjectId.isValid(teamId)) {
        return Response.json({ error: 'Invalid teamId' }, { status: 400 })
      }
      team = await Team.findById(teamId).lean()
      if (!team) {
        return Response.json({ error: 'Agency not found' }, { status: 404 })
      }
    }

    const defaultBrand = team
      ? await Brand.findOne({ teamId: team._id, isActive: true }).sort({ isDefault: -1 }).lean()
      : null

    const user = await User.create({
      name,
      email,
      phone: body?.phone || undefined,
      password: await hashPassword(password),
      role,
      teamId: team?._id,
      activeBrandId: defaultBrand?._id,
      leadAssignmentWeight: ['agent', 'manager'].includes(role)
        ? Math.max(0, Math.min(10, Number(body?.leadAssignmentWeight ?? 1)))
        : 0,
      isActive: true,
    })

    await recordPlatformAudit(guard.user, {
      teamId: team?._id,
      entity: 'user',
      entityId: user._id,
      action: 'create',
      summary: `Created ${role} "${email}"${team ? ` in agency "${team.name}"` : ' (platform)'}`,
    })

    return Response.json(
      {
        message: 'User created',
        user: { _id: user._id, name: user.name, email: user.email, role: user.role, teamId: user.teamId },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Superadmin user create error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PATCH — role, status, password reset, lead weight, or move between agencies. */
export async function PATCH(request) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    const body = await request.json()
    const { userId } = body
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return Response.json({ error: 'userId is required' }, { status: 400 })
    }

    await connectDB()
    const target = await User.findById(userId)
    if (!target) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    const isSelf = String(target._id) === String(guard.user.userId)
    const before = {
      role: target.role,
      isActive: target.isActive,
      isBlocked: target.isBlocked,
      teamId: target.teamId,
    }

    if (body.role !== undefined && body.role !== target.role) {
      if (!ASSIGNABLE_ROLES.includes(body.role)) {
        return Response.json({ error: 'Invalid role' }, { status: 400 })
      }
      // Losing your own superadmin rights mid-session would lock you out of
      // the panel that grants it back.
      if (isSelf && target.role === 'superadmin' && body.role !== 'superadmin') {
        return Response.json({ error: 'You cannot change your own super admin role' }, { status: 400 })
      }
      if (target.role === 'superadmin' && body.role !== 'superadmin') {
        const remaining = await User.countDocuments({
          role: 'superadmin',
          _id: { $ne: target._id },
          isActive: true,
        })
        if (remaining === 0) {
          return Response.json({ error: 'At least one active super admin must remain' }, { status: 400 })
        }
      }
      target.role = body.role
      if (!['agent', 'manager'].includes(body.role)) target.leadAssignmentWeight = 0
    }

    if (body.teamId !== undefined) {
      if (body.teamId === null || body.teamId === '') {
        if (target.role !== 'superadmin') {
          return Response.json({ error: 'Only a super admin can be agency-less' }, { status: 400 })
        }
        target.teamId = undefined
        target.activeBrandId = undefined
      } else {
        if (!mongoose.Types.ObjectId.isValid(body.teamId)) {
          return Response.json({ error: 'Invalid teamId' }, { status: 400 })
        }
        const team = await Team.findById(body.teamId).lean()
        if (!team) {
          return Response.json({ error: 'Agency not found' }, { status: 404 })
        }
        if (String(target.teamId || '') !== String(team._id)) {
          target.teamId = team._id
          // The old brand belongs to the previous agency — repoint it or the
          // user would stay scoped to a brand they can no longer see.
          const brand = await Brand.findOne({ teamId: team._id, isActive: true })
            .sort({ isDefault: -1 })
            .lean()
          target.activeBrandId = brand?._id
        }
      }
    }

    let approvalNotice = null
    if (body.approvalStatus && ['approved', 'rejected'].includes(body.approvalStatus)) {
      if (target.approvalStatus !== 'pending') {
        return Response.json({ error: 'This account is not awaiting approval' }, { status: 400 })
      }
      target.approvalStatus = body.approvalStatus
      target.isActive = body.approvalStatus === 'approved'
      approvalNotice = body.approvalStatus
    }

    if (typeof body.isActive === 'boolean') {
      if (isSelf && !body.isActive) {
        return Response.json({ error: 'You cannot deactivate yourself' }, { status: 400 })
      }
      target.isActive = body.isActive
    }
    if (typeof body.isBlocked === 'boolean') {
      if (isSelf && body.isBlocked) {
        return Response.json({ error: 'You cannot block yourself' }, { status: 400 })
      }
      target.isBlocked = body.isBlocked
    }
    if (body.leadAssignmentWeight !== undefined) {
      target.leadAssignmentWeight = Math.max(0, Math.min(10, Number(body.leadAssignmentWeight) || 0))
    }
    if (typeof body.name === 'string' && body.name.trim()) target.name = body.name.trim()
    if (typeof body.phone === 'string') target.phone = body.phone.trim()

    let passwordReset = false
    if (body.resetPassword) {
      if (typeof body.resetPassword !== 'string' || body.resetPassword.length < 8) {
        return Response.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
      }
      target.password = await hashPassword(body.resetPassword)
      target.lastPasswordChange = new Date()
      passwordReset = true
    }

    await target.save()

    if (approvalNotice && target.requestedBy) {
      await notifyUser({
        userId: target.requestedBy,
        teamId: target.teamId,
        type: approvalNotice === 'approved' ? 'employee_approved' : 'employee_rejected',
        title: approvalNotice === 'approved' ? 'Employee approved' : 'Employee request declined',
        message:
          approvalNotice === 'approved'
            ? `${target.name} (${target.email}) has been approved and can now sign in.`
            : `The request to add ${target.name} (${target.email}) was declined by the super admin.`,
        relatedId: target._id,
        relatedModel: 'User',
        priority: 'high',
        action: { text: 'View team', link: '/dashboard/admin' },
      })
    }

    // A password reset, block or deactivation is meaningless while the old
    // refresh token can still mint access tokens.
    if (passwordReset || target.isBlocked || !target.isActive) {
      await RefreshToken.updateMany(
        { userId: target._id, revokedAt: null },
        { revokedAt: new Date() }
      )
    }

    await recordPlatformAudit(guard.user, {
      teamId: target.teamId,
      entity: 'user',
      entityId: target._id,
      action: passwordReset ? 'password_reset' : 'update',
      summary: `${passwordReset ? 'Reset password for' : 'Updated'} user "${target.email}"`,
      changes: {
        before,
        after: {
          role: target.role,
          isActive: target.isActive,
          isBlocked: target.isBlocked,
          teamId: target.teamId,
        },
      },
    })

    return Response.json({
      message: approvalNotice
        ? approvalNotice === 'approved'
          ? 'Employee approved'
          : 'Employee request declined'
        : passwordReset
          ? 'Password reset'
          : 'User updated',
      user: {
        _id: target._id,
        name: target.name,
        email: target.email,
        role: target.role,
        teamId: target.teamId,
        isActive: target.isActive,
        isBlocked: target.isBlocked,
        leadAssignmentWeight: target.leadAssignmentWeight,
        approvalStatus: target.approvalStatus,
      },
    })
  } catch (error) {
    console.error('Superadmin user update error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE — deactivate, or `?purge=true` to remove the record entirely. */
export async function DELETE(request) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const purge = searchParams.get('purge') === 'true'

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return Response.json({ error: 'userId is required' }, { status: 400 })
    }
    if (String(userId) === String(guard.user.userId)) {
      return Response.json({ error: 'You cannot remove yourself' }, { status: 400 })
    }

    await connectDB()
    const target = await User.findById(userId)
    if (!target) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    if (target.role === 'superadmin') {
      const remaining = await User.countDocuments({
        role: 'superadmin',
        _id: { $ne: target._id },
        isActive: true,
      })
      if (remaining === 0) {
        return Response.json({ error: 'At least one active super admin must remain' }, { status: 400 })
      }
    }

    // Removing the owner would leave the agency with a dangling `owner` ref
    // and nobody able to administer it.
    const ownedTeam = await Team.findOne({ owner: target._id }).select('name').lean()
    if (ownedTeam) {
      return Response.json(
        { error: `This user owns agency "${ownedTeam.name}" — transfer ownership first` },
        { status: 409 }
      )
    }

    await RefreshToken.updateMany({ userId: target._id, revokedAt: null }, { revokedAt: new Date() })

    if (purge) {
      await User.deleteOne({ _id: target._id })
      await recordPlatformAudit(guard.user, {
        teamId: target.teamId,
        entity: 'user',
        entityId: target._id,
        action: 'delete',
        summary: `Permanently deleted user "${target.email}"`,
      })
      return Response.json({ message: 'User permanently deleted' })
    }

    target.isActive = false
    target.isBlocked = true
    target.leadAssignmentWeight = 0
    await target.save()

    await recordPlatformAudit(guard.user, {
      teamId: target.teamId,
      entity: 'user',
      entityId: target._id,
      action: 'suspend',
      summary: `Deactivated user "${target.email}"`,
    })

    return Response.json({ message: 'User deactivated' })
  } catch (error) {
    console.error('Superadmin user delete error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
