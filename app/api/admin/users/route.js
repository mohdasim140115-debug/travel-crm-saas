import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import { authenticate, requireRoles } from '@/lib/middleware'
import { hashPassword } from '@/lib/auth'
import { notifyUser } from '@/lib/notify'
import mongoose from 'mongoose'

const ROLE_LABELS = {
  agent: 'Sales Employee',
  manager: 'Sales Lead',
  operations: 'Operations',
  accounts: 'Accounts',
  admin: 'Owner',
}

const ASSIGNABLE_ROLES = ['agent', 'manager', 'operations', 'accounts', 'admin']

export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const forbidden = requireRoles(authResult.user.role, ['superadmin', 'admin'])
    if (forbidden) {
      return Response.json({ error: forbidden.error }, { status: forbidden.status })
    }

    await connectDB()
    const users = await User.find({ teamId: authResult.user.teamId })
      .select('-password -otp -twoFactorSecret -apiKeys')
      .sort({ createdAt: -1 })
      .lean()

    return Response.json({ users })
  } catch (error) {
    console.error('Admin list users error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const forbidden = requireRoles(authResult.user.role, ['superadmin', 'admin'])
    if (forbidden) {
      return Response.json({ error: forbidden.error }, { status: forbidden.status })
    }

    const body = await request.json()
    const { name, email, password, role = 'agent', leadAssignmentWeight = 1 } = body

    if (!name || !email || !password) {
      return Response.json({ error: 'name, email, password required' }, { status: 400 })
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 })
    }

    await connectDB()
    const normalizedEmail = email.trim().toLowerCase()
    const existing = await User.findOne({ email: normalizedEmail })
    if (existing) {
      return Response.json({ error: 'Email already registered' }, { status: 409 })
    }

    // Owners can't self-approve staff — the account stays inactive until a
    // super admin reviews it. Super admins creating a user directly need no
    // approval loop.
    const needsApproval = authResult.user.role === 'admin'

    const user = await User.create({
      name,
      email: normalizedEmail,
      password: await hashPassword(password),
      role,
      teamId: authResult.user.teamId,
      leadAssignmentWeight: ['agent', 'manager'].includes(role) ? leadAssignmentWeight : 0,
      isActive: !needsApproval,
      approvalStatus: needsApproval ? 'pending' : 'approved',
      requestedBy: needsApproval ? authResult.user.userId : undefined,
    })

    if (needsApproval) {
      const [superadmins, owner] = await Promise.all([
        User.find({ role: 'superadmin', isActive: true }).select('_id').lean(),
        User.findById(authResult.user.userId).select('name email').lean(),
      ])
      const ownerName = owner?.name || owner?.email || 'An agency owner'
      await Promise.all(
        superadmins.map((sa) =>
          notifyUser({
            userId: sa._id,
            type: 'employee_approval_requested',
            title: 'Employee approval needed',
            message: `${ownerName} wants to add ${name} as ${ROLE_LABELS[role] || role}.`,
            relatedId: user._id,
            relatedModel: 'User',
            priority: 'high',
            action: { text: 'Review request', link: '/dashboard/platform/users?status=pending' },
          })
        )
      )
    }

    return Response.json(
      {
        message: needsApproval
          ? 'Employee request sent to the super admin for approval. They will be added once approved.'
          : 'Employee added',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          leadAssignmentWeight: user.leadAssignmentWeight,
          approvalStatus: user.approvalStatus,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Admin create user error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const forbidden = requireRoles(authResult.user.role, ['superadmin', 'admin'])
    if (forbidden) {
      return Response.json({ error: forbidden.error }, { status: forbidden.status })
    }

    const body = await request.json()
    const { userId, role, isActive, isBlocked, leadAssignmentWeight, resetPassword } = body
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return Response.json({ error: 'userId required' }, { status: 400 })
    }
    // A password was intended (the field wasn't left blank) but failed the
    // length check — silently ignoring it used to still respond "User
    // updated", so a browser-autofilled or otherwise-not-applied value read
    // as a successful reset even though nothing changed.
    if (resetPassword && (typeof resetPassword !== 'string' || resetPassword.length < 6)) {
      return Response.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
    }

    await connectDB()
    const target = await User.findOne({
      _id: userId,
      teamId: authResult.user.teamId,
    })
    if (!target) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    if (authResult.user.role === 'admin' && target.role === 'superadmin') {
      return Response.json({ error: 'Cannot modify superadmin' }, { status: 403 })
    }

    // The owner's own account is fixed — no self-demotion, self-suspension or
    // self-block. (Password reset for yourself is still fine and allowed.)
    const isSelf = String(target._id) === String(authResult.user.userId)
    if (isSelf && target.role === 'admin') {
      if (role && role !== target.role) {
        return Response.json({ error: 'You cannot change your own owner role' }, { status: 400 })
      }
      if (isActive === false) {
        return Response.json({ error: 'You cannot suspend yourself' }, { status: 400 })
      }
      if (isBlocked === true) {
        return Response.json({ error: 'You cannot block yourself' }, { status: 400 })
      }
    }

    if (role) {
      const allowed = [...ASSIGNABLE_ROLES, 'superadmin']
      if (authResult.user.role === 'admin' && role === 'superadmin') {
        return Response.json({ error: 'Cannot promote to superadmin' }, { status: 403 })
      }
      if (!allowed.includes(role)) {
        return Response.json({ error: 'Invalid role' }, { status: 400 })
      }
      target.role = role
    }
    if (typeof isActive === 'boolean') target.isActive = isActive
    if (typeof isBlocked === 'boolean') target.isBlocked = isBlocked
    if (typeof leadAssignmentWeight === 'number') {
      target.leadAssignmentWeight = Math.max(0, Math.min(10, leadAssignmentWeight))
    }
    if (resetPassword && typeof resetPassword === 'string' && resetPassword.length >= 6) {
      target.password = await hashPassword(resetPassword)
      target.lastPasswordChange = new Date()
    }

    await target.save()

    return Response.json({
      message: 'User updated',
      user: {
        id: target._id,
        name: target.name,
        email: target.email,
        role: target.role,
        isActive: target.isActive,
        isBlocked: target.isBlocked,
        leadAssignmentWeight: target.leadAssignmentWeight,
      },
    })
  } catch (error) {
    console.error('Admin update user error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const forbidden = requireRoles(authResult.user.role, ['superadmin', 'admin'])
    if (forbidden) {
      return Response.json({ error: forbidden.error }, { status: forbidden.status })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return Response.json({ error: 'userId required' }, { status: 400 })
    }

    if (String(userId) === String(authResult.user.userId)) {
      return Response.json({ error: 'Cannot remove yourself' }, { status: 400 })
    }

    await connectDB()
    const target = await User.findOne({
      _id: userId,
      teamId: authResult.user.teamId,
    })
    if (!target) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }
    if (target.role === 'superadmin') {
      return Response.json({ error: 'Cannot remove superadmin' }, { status: 403 })
    }

    target.isActive = false
    target.isBlocked = true
    target.leadAssignmentWeight = 0
    await target.save()

    return Response.json({ message: 'Employee removed (deactivated)' })
  } catch (error) {
    console.error('Admin delete user error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
