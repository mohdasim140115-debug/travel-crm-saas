import connectDB from '@/lib/mongodb'
import Team from '@/models/Team'
import { authenticate } from '@/lib/middleware'

/** GET — premium PDF designs unlocked for the caller's agency. */
export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    await connectDB()
    const team = await Team.findById(authResult.user.teamId).select('unlockedPdfThemes').lean()
    return Response.json({ unlocked: team?.unlockedPdfThemes || [] })
  } catch (error) {
    console.error('PDF themes status error:', error)
    return Response.json({ unlocked: [] })
  }
}
