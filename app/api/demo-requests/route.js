import connectDB from '@/lib/mongodb'
import DemoRequest from '@/models/DemoRequest'
import { requireSuperadmin, denied, parsePaging } from '@/lib/superadmin'
import { rateLimit } from '@/lib/rate-limit'

/** POST — public: the "Book a Demo" form on the marketing page. */
export async function POST(request) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'
    const rl = await rateLimit(`demo-request:${ip}`, { windowMs: 60_000, max: 5 })
    if (!rl.ok) {
      return Response.json({ error: 'Too many requests, please try again shortly' }, { status: 429 })
    }

    const body = await request.json()
    const name = String(body?.name || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    const phone = String(body?.phone || '').trim()
    const address = String(body?.address || '').trim()
    const preferredDate = body?.preferredDate ? new Date(body.preferredDate) : undefined

    if (!name || !email || !phone) {
      return Response.json({ error: 'Name, email and phone are required' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Invalid email' }, { status: 400 })
    }

    await connectDB()
    const demoRequest = await DemoRequest.create({
      name,
      email,
      phone,
      address: address || undefined,
      preferredDate: preferredDate && !isNaN(preferredDate.getTime()) ? preferredDate : undefined,
    })

    return Response.json(
      { message: 'Demo request received', demoRequestId: demoRequest._id },
      { status: 201 }
    )
  } catch (error) {
    console.error('Demo request create error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** GET — super admin only: the incoming demo-request queue. */
export async function GET(request) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    await connectDB()
    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = parsePaging(searchParams, { defaultLimit: 50 })
    const status = searchParams.get('status')?.trim()
    const search = searchParams.get('search')?.trim()
    const from = searchParams.get('from')?.trim()
    const to = searchParams.get('to')?.trim()

    const filter = {}
    if (status && status !== 'all') filter.status = status
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { address: rx }]
    }
    if (from || to) {
      filter.createdAt = {}
      if (from) filter.createdAt.$gte = new Date(from)
      if (to) filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59, 999))
    }

    // Headline counts for the top cards — always across every request, not
    // just the current filter/page, so they don't move when you search.
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const [requests, total, totalAll, newThisMonth, contactedCount, pendingCount] = await Promise.all([
      DemoRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      DemoRequest.countDocuments(filter),
      DemoRequest.countDocuments({}),
      DemoRequest.countDocuments({ createdAt: { $gte: monthStart } }),
      DemoRequest.countDocuments({ status: 'contacted' }),
      DemoRequest.countDocuments({ status: 'new' }),
    ])

    return Response.json({
      requests,
      summary: { total: totalAll, newThisMonth, contacted: contactedCount, pending: pendingCount },
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    })
  } catch (error) {
    console.error('Demo request list error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
