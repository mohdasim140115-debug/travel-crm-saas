/**
 * In-process 15-minute Meta lead pull.
 *
 * On Vercel the platform cron hits /api/cron/meta-sync (see vercel.json), so
 * this stays off there — a timer inside a serverless function would fire once
 * per instance and never at all when the app is idle. Everywhere else (local
 * dev, a VPS, Docker, any always-on Node host) there is no external scheduler,
 * so the server drives the sync itself and the agency never has to press
 * "Fetch Now".
 *
 * Calls the sync directly rather than fetching the cron route, so it needs no
 * CRON_SECRET and no assumption about the app's own public URL.
 */

import connectDB from '@/lib/mongodb'
import { findSyncEnabledTeams, syncTeamMetaLeads } from '@/lib/metaSync'

const INTERVAL_MS = Number(process.env.META_SYNC_INTERVAL_MS || 15 * 60 * 1000)
/** Boot delay — lets the DB connection and route compilation settle first. */
const FIRST_RUN_DELAY_MS = 30_000

// Kept on globalThis so dev-mode module reloads can't stack up timers.
const state = (globalThis.__metaSyncScheduler ??= {
  timer: null,
  running: false,
  lastRunAt: null,
  lastCreated: 0,
})

async function runOnce() {
  // A slow agency (many forms, Meta throttling) must not overlap with the next
  // tick and double-import.
  if (state.running) return
  state.running = true
  try {
    await connectDB()
    const teams = await findSyncEnabledTeams()
    if (!teams.length) return

    let created = 0
    for (const team of teams) {
      try {
        const r = await syncTeamMetaLeads(team)
        created += r.created || 0
        if (r.created) {
          console.log(`[meta-sync] ${team.name}: ${r.created} new lead(s)`)
        } else if (r.error && r.error !== 'No Meta access token saved') {
          // A team that simply hasn't connected Meta yet isn't an error worth
          // logging every 15 minutes — only surface real sync failures.
          console.warn(`[meta-sync] ${team.name}: ${r.error}`)
        }
      } catch (e) {
        console.error(`[meta-sync] ${team.name} failed:`, e.message)
      }
    }
    state.lastRunAt = new Date()
    state.lastCreated = created
  } catch (e) {
    console.error('[meta-sync] scheduler run failed:', e.message)
  } finally {
    state.running = false
  }
}

export function startMetaSyncScheduler() {
  if (state.timer) return state

  setTimeout(runOnce, FIRST_RUN_DELAY_MS)
  state.timer = setInterval(runOnce, INTERVAL_MS)
  // Never hold the process open just for this.
  state.timer.unref?.()

  console.log(`[meta-sync] auto-sync every ${Math.round(INTERVAL_MS / 60000)} min`)
  return state
}

export function schedulerState() {
  return {
    active: !!state.timer,
    intervalMs: INTERVAL_MS,
    running: state.running,
    lastRunAt: state.lastRunAt,
    lastCreated: state.lastCreated,
  }
}
