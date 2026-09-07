'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bell, BellRing, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { enablePushNotifications, getPushPermission, pushSupported } from '@/lib/push-client'

const POLL_MS = 30_000

/** Two-tone "ding" generated with the Web Audio API — no audio file to ship. */
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ctx.resume().catch(() => {})
    const now = ctx.currentTime
    ;[880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = now + i * 0.12
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.32)
    })
    setTimeout(() => ctx.close().catch(() => {}), 700)
  } catch {}
}

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const pollRef = useRef(null)
  const seenIdsRef = useRef(null)
  const [pushPermission, setPushPermission] = useState('default')
  const [pushBusy, setPushBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)

  useEffect(() => {
    const perm = getPushPermission()
    setPushPermission(perm)
    // If the browser already has permission, silently make sure the server
    // actually has a live subscription for this device — the two can drift
    // apart (site data cleared, subscription rotated/expired, or an earlier
    // "Enable" that granted permission but never saved). enablePushNotifications
    // is idempotent (reuses an existing subscription, upserts server-side),
    // so this just heals that state on every load instead of the user being
    // stuck with "permission on, but nothing arrives".
    if (perm === 'granted' && pushSupported()) {
      const token = localStorage.getItem('token')
      if (token) enablePushNotifications(token).catch(() => {})
    }
  }, [])

  // Turn every failure reason into a plain-language message — a swallowed
  // reason is why "granted but nothing arrives" was so hard to place.
  const enableReasonMessage = (reason) =>
    ({
      unsupported:
        "This browser can't do push notifications. Open the site in Chrome directly (not inside another app's browser), then try again.",
      'not-configured':
        'Push isn\'t set up on the server yet (VAPID key missing from the build). Tell your admin.',
      denied:
        "Notifications are blocked for this site. Turn them on in the browser's site settings, then try again.",
      'save-failed': 'Could not save this device. Check your connection and try again.',
    })[reason] || 'Could not turn on notifications on this device. Please try again.'

  const handleEnablePush = async () => {
    setPushBusy(true)
    const token = localStorage.getItem('token')
    try {
      const result = await enablePushNotifications(token)
      setPushPermission(getPushPermission())
      if (result.ok) {
        toast.success('Notifications on for this device.')
      } else {
        alert(enableReasonMessage(result.reason))
      }
    } catch (err) {
      alert(`Could not turn on notifications: ${err?.message || 'unknown error'}`)
    } finally {
      setPushBusy(false)
    }
  }

  const handleTestPush = async () => {
    setTestBusy(true)
    try {
      const token = localStorage.getItem('token')
      // Always (re)register the subscription first — permission being granted
      // doesn't mean the server has a live subscription for this device.
      const reg = await enablePushNotifications(token).catch((e) => ({ ok: false, reason: e?.message }))
      if (!reg.ok) {
        alert(enableReasonMessage(reg.reason))
        return
      }
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Test failed.')
        return
      }
      if (data.sent > 0) {
        toast.success('Test sent — check your screen in a few seconds.')
      } else {
        alert(
          'The server sent it but the push service rejected every device.\n\n' +
            (data.failed?.[0]?.message ||
              `status ${data.failed?.[0]?.statusCode || '?'} — the VAPID public/private keys may not match.`)
        )
      }
    } catch (err) {
      alert(`Test failed: ${err?.message || 'could not reach the server'}`)
    } finally {
      setTestBusy(false)
    }
  }

  const markRead = async (id) => {
    const token = localStorage.getItem('token')
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {}
  }

  const load = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      // Only unread ones — once a notification has been seen it drops out of
      // this list on its own instead of piling up.
      const res = await fetch('/api/notifications?limit=15&isRead=false', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const list = data.notifications || []

        // Skip the very first load — only alert for notifications that show
        // up on a *later* poll, i.e. actually just arrived.
        if (seenIdsRef.current) {
          const fresh = list.filter((n) => !seenIdsRef.current.has(n._id))
          fresh.forEach((n) => {
            playChime()
            // Custom render (instead of the plain toast(title, {description})
            // form) so we can put the "Powered by" brand line above the
            // title and size the whole card up a notch.
            toast.custom(
              (id) => (
                <div className="flex w-full max-w-sm flex-col gap-1 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg sm:max-w-md">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                    Powered by Deenx Consultancy &middot; 9667266614
                  </p>
                  <p className="text-base font-semibold leading-snug">{n.title}</p>
                  {n.message && <p className="text-sm text-muted-foreground">{n.message}</p>}
                  {n.action?.link && (
                    <button
                      type="button"
                      onClick={() => {
                        router.push(n.action.link)
                        toast.dismiss(id)
                      }}
                      className="mt-1 self-start text-sm font-medium text-primary hover:underline"
                    >
                      {n.action.text || 'Open'}
                    </button>
                  )}
                </div>
              ),
              { position: 'top-right', duration: 8000 }
            )
          })
        }
        seenIdsRef.current = new Set(list.map((n) => n._id))

        setNotifications(list)
        setUnreadCount(data.unreadCount || 0)
      }
    } catch {}
  }, [router])

  // Polling a hidden tab buys nothing — the toast and chime would fire at a
  // window nobody is looking at, and browsers throttle the timer anyway. Stop
  // while hidden, then catch up immediately on return.
  useEffect(() => {
    const start = () => {
      if (pollRef.current) return
      pollRef.current = setInterval(load, POLL_MS)
    }
    const stop = () => {
      if (!pollRef.current) return
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        load()
        start()
      } else {
        stop()
      }
    }

    load()
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  const handleClick = (n) => {
    setNotifications((prev) => prev.filter((x) => x._id !== n._id))
    setUnreadCount((c) => Math.max(0, c - 1))
    markRead(n._id)
    setOpen(false)
    if (n.action?.link) router.push(n.action.link)
  }

  const markAllRead = async () => {
    if (!notifications.length) return
    setLoading(true)
    const ids = notifications.map((n) => n._id)
    setNotifications([])
    setUnreadCount(0)
    await Promise.all(ids.map((id) => markRead(id)))
    setLoading(false)
  }

  // Opening the bell is "seeing" the notifications — once the panel is
  // closed again they've been read and shouldn't linger in the list.
  const handleOpenChange = (next) => {
    setOpen(next)
    if (!next && notifications.length) {
      markAllRead()
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="relative shrink-0" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={loading}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Mark all read'}
            </button>
          )}
        </div>
        {pushSupported() && pushPermission !== 'granted' && (
          <div className="flex items-center justify-between gap-2 border-b bg-primary/5 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Get alerts on this phone/laptop even when the CRM isn't open.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1 text-xs"
              onClick={handleEnablePush}
              disabled={pushBusy || pushPermission === 'denied'}
            >
              {pushBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <BellRing className="h-3 w-3" />
              )}
              {pushPermission === 'denied' ? 'Blocked' : 'Enable'}
            </Button>
          </div>
        )}
        {pushSupported() && pushPermission === 'granted' && (
          <div className="flex items-center justify-between gap-2 border-b bg-primary/5 px-3 py-2">
            <p className="text-xs text-muted-foreground">Alerts on for this device.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1 text-xs"
              onClick={handleTestPush}
              disabled={testBusy}
            >
              {testBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellRing className="h-3 w-3" />}
              Test now
            </Button>
          </div>
        )}
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No new notifications</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n._id}
                type="button"
                onClick={() => handleClick(n)}
                className="block w-full border-b bg-primary/5 px-3 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-accent"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{n.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
