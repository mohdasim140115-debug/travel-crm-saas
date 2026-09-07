function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function getPushPermission() {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

function keysMatch(subscription, applicationServerKey) {
  const existing = subscription?.options?.applicationServerKey
  if (!existing) return false
  const a = new Uint8Array(existing)
  const b = applicationServerKey
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Must run from a user gesture (click) — browsers block the permission prompt otherwise. */
export async function enablePushNotifications(token) {
  try {
    if (!pushSupported()) return { ok: false, reason: 'unsupported' }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!publicKey) return { ok: false, reason: 'not-configured' }
    const appServerKey = urlBase64ToUint8Array(publicKey)

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: 'denied' }

    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    let sub = await reg.pushManager.getSubscription()
    // A subscription left over from an earlier VAPID key can't be reused, and
    // trying to subscribe() over it throws "different applicationServerKey" —
    // drop it and start fresh.
    if (sub && !keysMatch(sub, appServerKey)) {
      await sub.unsubscribe().catch(() => {})
      sub = null
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      })
    }

    // The subscribe object above is created locally in the browser regardless —
    // it only really "counts" once the server has it saved, so a failed
    // response here must NOT be reported back as success.
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    })
    if (!res.ok) return { ok: false, reason: 'save-failed' }

    return { ok: true }
  } catch (err) {
    // Surface the real browser error (e.g. the OS push service being
    // unavailable) instead of a rejected promise the caller can't read.
    return { ok: false, reason: 'error', detail: err?.message || String(err) }
  }
}
