import { verifyToken } from '@/lib/auth'
import { hasPermission, canAccessLeads } from '@/lib/permissions'

export async function authenticate(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 }
  }

  const token = authHeader.substring(7)
  const decoded = verifyToken(token)

  if (!decoded) {
    return { error: 'Invalid or expired token', status: 401 }
  }

  return { user: decoded, status: 200 }
}

export function checkRole(userRole, requiredRoles) {
  if (typeof requiredRoles === 'string') {
    return userRole === requiredRoles
  }
  return requiredRoles.includes(userRole)
}

/** Returns 403 response body if role not allowed, else null */
export function requireRoles(userRole, allowedList) {
  if (!userRole || !allowedList?.length) {
    return { error: 'Forbidden', status: 403 }
  }
  if (allowedList.includes(userRole)) {
    return null
  }
  return { error: 'Insufficient permissions', status: 403 }
}

/**
 * Same as requireRoles, but for owner-level routes (Settings, Team, …) that
 * list `itinerary_only` as allowed — those are meant for the agency owner
 * the super admin created, not a teammate that owner later added via Team.
 * Both share the exact same role, so the JWT's `requestedBy` claim (only set
 * on a teammate) is what tells them apart here.
 */
export function requireOwnerRoles(user, allowedList) {
  const denied = requireRoles(user?.role, allowedList)
  if (denied) return denied
  if (user?.role === 'itinerary_only' && user?.requestedBy) {
    return { error: 'Not available for your account', status: 403 }
  }
  return null
}

/** Returns 403 if user lacks permission, else null */
export function requirePermission(userRole, permission) {
  if (!hasPermission(userRole, permission)) {
    return { error: 'Insufficient permissions', status: 403 }
  }
  return null
}

/** Block operations/accounts from lead endpoints */
export function requireLeadAccess(userRole) {
  if (!canAccessLeads(userRole)) {
    return { error: 'Lead access denied for your role', status: 403 }
  }
  return null
}
