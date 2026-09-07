import connectDB from '@/lib/mongodb'
import PushSubscription from '@/models/PushSubscription'
import { authenticate } from '@/lib/middleware'
import webpush, { pushConfigured } from '@/lib/webpush'

/**
 * Fires a push to every device the current user has subscribed on — a
 * self-serve way to confirm the whole chain (VAPID keys, saved subscription,
 * service worker) actually works, without having to orchestrate a real lead
 * across two accounts. Returns per-device results so a failure is legible.
 */
export async function POST(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    if (!pushConfigured) {
      return Response.json(
        { error: 'Push is not configured on the server (VAPID keys missing).', configured: false },
        { status: 503 }
      )
    }

    await connectDB()
    const subs = await PushSubscription.find({ userId: authResult.user.userId }).lean()
    if (!subs.length) {
      return Response.json(
        { error: 'No subscribed device found — tap "Enable" first.', subscriptions: 0 },
        { status: 400 }
      )
    }

    const payload = JSON.stringify({
      title: 'Test notification',
      body: 'If you can see this on your screen, push notifications are working.',
      url: '/dashboard',
      tag: 'push-test',
    })

    const results = await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload)
          return { ok: true }
        } catch (err) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {})
          }
          return { ok: false, statusCode: err?.statusCode, message: err?.body || err?.message }
        }
      })
    )

    const sent = results.filter((r) => r.ok).length
    return Response.json({
      configured: true,
      subscriptions: subs.length,
      sent,
      failed: results.filter((r) => !r.ok),
    })
  } catch (error) {
    console.error('Push test error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
