import connectDB from '@/lib/mongodb'
import Team from '@/models/Team'
import User from '@/models/User'
import Lead from '@/models/Lead'
import Booking from '@/models/Booking'
import Payment from '@/models/Payment'
import Brand from '@/models/Brand'
import Plan from '@/models/Plan'
import { hashPassword } from '@/lib/auth'
import {
  requireSuperadmin,
  denied,
  recordPlatformAudit,
  escapeRegex,
  parsePaging,
} from '@/lib/superadmin'
import { seedDefaultPlans } from '@/lib/plans'
import { addOneMonth } from '@/lib/subscription'

/** GET /api/superadmin/agencies — paged, searchable list of every tenant. */
export async function GET(request) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    await connectDB()
    await seedDefaultPlans()

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = parsePaging(searchParams)
    const search = searchParams.get('search')?.trim()
    const plan = searchParams.get('plan')?.trim()
    const status = searchParams.get('status')?.trim()

    const filter = {}
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i')
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }]
    }
    if (plan && plan !== 'all') filter.plan = plan
    const now = new Date()
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    if (status === 'suspended') filter.isActive = false
    else if (status === 'active') filter.isActive = { $ne: false }
    else if (status === 'expired') filter.subscriptionExpiresAt = { $lt: now }
    else if (status === 'expiring') filter.subscriptionExpiresAt = { $gte: now, $lte: in7Days }
    else if (status === 'running') {
      filter.isActive = { $ne: false }
      filter.subscriptionExpiresAt = { $gte: now }
    }
    else if (status && status !== 'all') filter.subscriptionStatus = status

    // Headline counts for the top cards — across every agency, so they don't
    // change when a search or filter is applied.
    const [suspendedCount, expiredCount, expiringCount, activeTeamIds] = await Promise.all([
      Team.countDocuments({ isActive: false }),
      Team.countDocuments({ subscriptionExpiresAt: { $lt: now } }),
      Team.countDocuments({ subscriptionExpiresAt: { $gte: now, $lte: in7Days } }),
      // Agencies whose plan is still running (not expired, not suspended).
      Team.find({ isActive: { $ne: false }, subscriptionExpiresAt: { $gte: now } }).distinct('_id'),
    ])
    const totalCount = await Team.countDocuments({})
    const activeUsersCount = activeTeamIds.length
      ? await User.countDocuments({ teamId: { $in: activeTeamIds } })
      : 0

    const [agencies, total, plans] = await Promise.all([
      Team.find(filter)
        .select(
          'name email phone plan subscriptionStatus subscriptionExpiresAt isActive walletCredits usage createdAt suspendedAt owner'
        )
        .populate('owner', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Team.countDocuments(filter),
      Plan.find({}).select('key name priceMonthly isActive').sort({ sortOrder: 1 }).lean(),
    ])

    // One grouped aggregation per collection over just this page's agencies,
    // rather than four queries per row.
    const teamIds = agencies.map((a) => a._id)
    const [userCounts, leadCounts, bookingCounts, revenueRows] = await Promise.all([
      User.aggregate([{ $match: { teamId: { $in: teamIds } } }, { $group: { _id: '$teamId', n: { $sum: 1 } } }]),
      Lead.aggregate([{ $match: { teamId: { $in: teamIds } } }, { $group: { _id: '$teamId', n: { $sum: 1 } } }]),
      Booking.aggregate([{ $match: { teamId: { $in: teamIds } } }, { $group: { _id: '$teamId', n: { $sum: 1 } } }]),
      Payment.aggregate([
        { $match: { teamId: { $in: teamIds }, status: 'completed' } },
        { $group: { _id: '$teamId', sum: { $sum: '$amount' } } },
      ]),
    ])
    const toMap = (rows, key = 'n') => new Map(rows.map((r) => [String(r._id), r[key]]))
    const usersMap = toMap(userCounts)
    const leadsMap = toMap(leadCounts)
    const bookingsMap = toMap(bookingCounts)
    const revenueMap = toMap(revenueRows, 'sum')

    return Response.json({
      agencies: agencies.map((a) => {
        const key = String(a._id)
        return {
          ...a,
          userCount: usersMap.get(key) || 0,
          leadCount: leadsMap.get(key) || 0,
          bookingCount: bookingsMap.get(key) || 0,
          revenue: revenueMap.get(key) || 0,
        }
      }),
      plans,
      summary: {
        total: totalCount,
        suspended: suspendedCount,
        expired: expiredCount,
        expiring: expiringCount,
        active: activeTeamIds.length,
        activeUsers: activeUsersCount,
      },
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    })
  } catch (error) {
    console.error('Superadmin agencies list error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/superadmin/agencies — provision a new tenant.
 * Creates the Team, its owner (role `admin`) and a default Brand together, so
 * the agency is immediately usable rather than half-built.
 */
export async function POST(request) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    const body = await request.json()
    const name = String(body?.name || '').trim()
    const ownerName = String(body?.ownerName || '').trim()
    const ownerEmail = String(body?.ownerEmail || '').trim().toLowerCase()
    const ownerPassword = String(body?.ownerPassword || '')

    if (!name || !ownerName || !ownerEmail || !ownerPassword) {
      return Response.json(
        { error: 'name, ownerName, ownerEmail and ownerPassword are required' },
        { status: 400 }
      )
    }
    if (ownerPassword.length < 8) {
      return Response.json({ error: 'Owner password must be at least 8 characters' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      return Response.json({ error: 'Invalid owner email' }, { status: 400 })
    }

    await connectDB()
    await seedDefaultPlans()

    if (await User.exists({ email: ownerEmail })) {
      return Response.json({ error: 'That owner email is already registered' }, { status: 409 })
    }

    const planKey = String(body?.plan || 'basic').toLowerCase()
    const planDoc = await Plan.findOne({ key: planKey }).lean()
    if (!planDoc) {
      return Response.json({ error: `Unknown plan "${planKey}"` }, { status: 400 })
    }

    // Super admin can pick the access end date directly in the form; falls
    // back to the standard 1-month window if left blank or unparseable.
    let subscriptionExpiresAt = addOneMonth()
    if (body?.subscriptionExpiresAt) {
      const parsed = new Date(body.subscriptionExpiresAt)
      if (!Number.isNaN(parsed.getTime())) subscriptionExpiresAt = parsed
    }

    const owner = await User.create({
      name: ownerName,
      email: ownerEmail,
      phone: body?.ownerPhone || undefined,
      password: await hashPassword(ownerPassword),
      role: 'admin',
      isActive: true,
    })

    let team
    let brand
    try {
      team = await Team.create({
        name,
        email: body?.email || ownerEmail,
        phone: body?.phone || undefined,
        owner: owner._id,
        plan: planKey,
        subscriptionStatus: body?.subscriptionStatus || 'trialing',
        // Defaults to 1 month of access from creation (editable in the form);
        // the super admin extends it from the agency detail page after that.
        subscriptionExpiresAt,
        platformNotes: body?.platformNotes || undefined,
        isActive: true,
      })

      brand = await Brand.create({
        teamId: team._id,
        name: body?.brandName?.trim() || name,
        isDefault: true,
      })

      owner.teamId = team._id
      owner.activeBrandId = brand._id
      await owner.save()
    } catch (err) {
      // Roll back the partial tenant so a failed create doesn't strand an
      // owner account with no workspace (and block the email forever).
      if (brand?._id) await Brand.deleteOne({ _id: brand._id }).catch(() => {})
      if (team?._id) await Team.deleteOne({ _id: team._id }).catch(() => {})
      await User.deleteOne({ _id: owner._id }).catch(() => {})
      throw err
    }

    await recordPlatformAudit(guard.user, {
      teamId: team._id,
      entity: 'agency',
      entityId: team._id,
      action: 'create',
      summary: `Created agency "${team.name}" on plan ${planKey} with owner ${ownerEmail}`,
      changes: { after: { name: team.name, plan: planKey, ownerEmail } },
    })

    return Response.json(
      {
        message: 'Agency created',
        agency: { ...team.toObject(), owner: { _id: owner._id, name: owner.name, email: owner.email } },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Superadmin agency create error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
