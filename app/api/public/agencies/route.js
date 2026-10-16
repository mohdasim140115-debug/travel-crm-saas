import connectDB from '@/lib/mongodb'
import Team from '@/models/Team'
import Brand from '@/models/Brand'

/** GET — public: the "Trusted by" logo strip on the marketing homepage.
 * Only name + logo for active agencies that actually have a logo set —
 * never exposes anything else about a tenant (plan, usage, contact info).
 * The logo itself lives on a team's default Brand (see Settings → Company
 * Profile), not on Team — Team has no logo of its own. */
export async function GET() {
  try {
    await connectDB()
    const activeTeamIds = await Team.find({ isActive: true }).distinct('_id')
    const brands = await Brand.find({
      teamId: { $in: activeTeamIds },
      logo: { $exists: true, $ne: '' },
    })
      .sort({ isDefault: -1, createdAt: 1 })
      .select('teamId name logo')
      .lean()

    // One logo per agency — its default brand if it has one with a logo,
    // otherwise whichever of its brands has a logo (sort above already puts
    // isDefault first, so the first hit per teamId wins).
    const seen = new Set()
    const agencies = []
    for (const b of brands) {
      const key = String(b.teamId)
      if (seen.has(key)) continue
      seen.add(key)
      agencies.push({ name: b.name, logo: b.logo })
      if (agencies.length >= 40) break
    }

    return Response.json({ agencies })
  } catch (error) {
    console.error('Public agencies list error:', error)
    return Response.json({ agencies: [] })
  }
}
