import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb'
import Team from '@/models/Team'
import { requireSuperadmin, denied, recordPlatformAudit } from '@/lib/superadmin'
import { PREMIUM_PDF_THEMES } from '@/modules/itinerary/pdfThemes'

/** PUT { themes: ['sunset', ...] } — which premium PDF designs this agency may use. */
export async function PUT(request, { params }) {
  try {
    const guard = await requireSuperadmin(request)
    if (guard.error) return denied(guard)

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid agency id' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({}))
    const allowed = PREMIUM_PDF_THEMES().map((t) => t.id)
    const themes = [...new Set((Array.isArray(body?.themes) ? body.themes : []).filter((t) => allowed.includes(t)))]

    await connectDB()
    const team = await Team.findById(id).select('name unlockedPdfThemes')
    if (!team) return Response.json({ error: 'Agency not found' }, { status: 404 })
    team.unlockedPdfThemes = themes
    await team.save()

    await recordPlatformAudit(guard.user, {
      teamId: team._id,
      entity: 'team',
      entityId: team._id,
      action: 'update',
      summary: `Premium PDF designs for ${team.name}: ${themes.length ? themes.join(', ') : 'none'}`,
    })

    return Response.json({ unlockedPdfThemes: themes })
  } catch (error) {
    console.error('Update PDF themes error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
