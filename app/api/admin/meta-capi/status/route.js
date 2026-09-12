import { authenticate, requireRoles } from '@/lib/middleware'
import { isMetaCapiConfiguredForTeam, META_STATUS_EVENT_MAP, metaCapiActionSource, metaCapiConfigForTeam } from '@/lib/metaCapi/config'
import connectDB from '@/lib/mongodb'
import Team from '@/models/Team'
import MetaConversionEvent from '@/models/MetaConversionEvent'

/**
 * Read-only diagnostic, scoped to the caller's own team (this team's Meta
 * dataset + token — never another team's, never the token itself). Lets the
 * owner confirm their Conversions API settings are actually saved/enabled
 * and see the recent send history, without SSH access to the server.
 */
export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const forbidden = requireRoles(authResult.user.role, ['superadmin', 'admin'])
    if (forbidden) {
      return Response.json({ error: forbidden.error }, { status: forbidden.status })
    }

    await connectDB()
    const team = await Team.findById(authResult.user.teamId).select('metaSync')
    const { datasetId, apiVersion } = metaCapiConfigForTeam(team)
    const recent = await MetaConversionEvent.find({ teamId: authResult.user.teamId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('leadId status eventName success responseStatus errorMessage sentAt')
      .lean()

    return Response.json({
      configured: isMetaCapiConfiguredForTeam(team),
      datasetId: datasetId || null,
      apiVersion,
      actionSource: metaCapiActionSource(),
      statusEventMap: META_STATUS_EVENT_MAP,
      recentEvents: recent,
    })
  } catch (error) {
    console.error('Meta CAPI status error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
