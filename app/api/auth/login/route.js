import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import Team from '@/models/Team'
import { comparePasswords } from '@/lib/auth'
import { issueSession, publicUser } from '@/lib/session'
import { isSubscriptionExpired } from '@/lib/subscription'

/** One transient Atlas blip (failover, dropped idle socket) used to bubble
 * straight up to the catch below and show the user "Internal server error"
 * even though nothing was actually wrong. Retry the connect + lookup once
 * after a short pause before giving up. */
async function findUserByEmail(email) {
  let lastErr
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await connectDB()
      return await User.findOne({ email })
    } catch (e) {
      lastErr = e
      if (attempt === 0) await new Promise((r) => setTimeout(r, 400))
    }
  }
  throw lastErr
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return Response.json(
        { error: 'Missing email or password' },
        { status: 400 }
      )
    }

    const user = await findUserByEmail(email.toLowerCase())
    if (!user) {
      return Response.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    if (!user.password) {
      return Response.json(
        {
          error: 'This account uses Google sign-in',
        },
        { status: 401 }
      )
    }

    const passwordMatch = await comparePasswords(password, user.password)
    if (!passwordMatch) {
      return Response.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Checked after the password so a wrong password and a suspended/pending
    // account are indistinguishable to someone probing for valid emails.
    if (user.approvalStatus === 'pending') {
      return Response.json(
        { error: 'Your account is awaiting super admin approval. You will be able to sign in once approved.' },
        { status: 403 }
      )
    }
    if (user.approvalStatus === 'rejected') {
      return Response.json(
        { error: 'Your account request was declined. Contact your administrator.' },
        { status: 403 }
      )
    }

    if (user.isBlocked || user.isActive === false) {
      return Response.json(
        { error: 'This account has been suspended. Contact your administrator.' },
        { status: 403 }
      )
    }

    // Super admins are platform-level — a workspace being suspended/expired
    // (they can even be seeded with a home teamId, e.g. the platform's own
    // "workspace") must never lock them out of the panel that manages it.
    if (user.teamId && user.role !== 'superadmin') {
      const team = await Team.findById(user.teamId)
        .select('isActive subscriptionExpiresAt')
        .lean()
      if (team && team.isActive === false) {
        return Response.json(
          { error: 'This workspace has been suspended. Contact support.' },
          { status: 403 }
        )
      }
      if (isSubscriptionExpired(team)) {
        return Response.json(
          { error: 'This workspace\'s subscription has expired. Contact your platform admin to renew.' },
          { status: 403 }
        )
      }
    }

    // Best-effort — a failed "last login" timestamp write must never block a
    // valid sign-in (it used to 500 the whole request on a transient blip).
    user.lastLogin = new Date()
    user.save().catch((e) => console.error('lastLogin update failed:', e.message))

    const ua = request.headers.get('user-agent') || ''
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      ''

    const { accessToken, refreshToken } = await issueSession(user, {
      userAgent: ua,
      ip,
    })

    return Response.json(
      {
        message: 'Login successful',
        token: accessToken,
        refreshToken,
        user: publicUser(user),
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Login error:', error)
    // A database connectivity hiccup isn't the user's fault — tell them to
    // retry rather than showing a scary generic error.
    const name = error?.name || ''
    const transient =
      /Mongo|Timeout|PoolCleared|ECONNRESET|ETIMEDOUT|connection/i.test(
        `${name} ${error?.message || ''}`
      )
    return Response.json(
      {
        error: transient
          ? 'Server is busy right now. Please try again in a moment.'
          : 'Internal server error',
      },
      { status: transient ? 503 : 500 }
    )
  }
}
