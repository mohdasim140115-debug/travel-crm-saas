/**
 * Business roles & permission matrix for Travel CRM.
 *
 * Role mapping:
 *   superadmin  → AAP (platform super admin)
 *   admin       → Agency Owner
 *   manager     → Sales Team Lead
 *   agent       → Sales Employee
 *   operations  → Operations Employee (post-sales)
 *   accounts    → Accounts Executive
 */

export const ROLES = {
  SUPERADMIN: 'superadmin',
  OWNER: 'admin',
  MANAGER: 'manager',
  SALES: 'agent',
  OPERATIONS: 'operations',
  ACCOUNTS: 'accounts',
  USER: 'user',
}

export const ROLE_LABELS = {
  superadmin: 'AAP Super Admin',
  admin: 'Owner',
  manager: 'Sales Lead',
  agent: 'Sales Employee',
  operations: 'Operations',
  accounts: 'Accounts',
  user: 'User',
}

/** Resource:action permission strings */
export const PERMISSIONS = {
  superadmin: ['*'],
  admin: [
    'team.manage',
    'employees.manage',
    'leads.view_all',
    'leads.manage',
    'leads.assign',
    'leads.weights',
    'bookings.view_all',
    'bookings.manage',
    'finance.view',
    'analytics.view',
    'settings.manage',
    'invoices.view',
    'itineraries.manage',
    'followups.manage',
  ],
  manager: [
    'leads.view_own',
    'leads.manage_own',
    'bookings.view_all',
    'bookings.create',
    'itineraries.manage',
    'followups.manage',
    'analytics.view',
  ],
  agent: [
    'leads.view_own',
    'leads.manage_own',
    'leads.status_change',
    'itineraries.send',
    'followups.manage_own',
    'bookings.create',
    'bookings.view_own',
  ],
  operations: [
    'bookings.view_all',
    'bookings.ops_manage',
    'vouchers.create',
    'vouchers.manage',
    'customers.view',
    'whatsapp.send',
    'email.send',
  ],
  accounts: [
    'invoices.create',
    'invoices.edit_draft',
    'invoices.send',
    'invoices.download',
    'payments.mark',
    'credit_note.create',
    'bookings.view_finance',
    'finance.view',
  ],
  user: ['view_own'],
}

export function hasPermission(role, permission) {
  const perms = PERMISSIONS[role] || []
  if (perms.includes('*')) return true
  return perms.includes(permission)
}

export function hasAnyPermission(role, permissionList) {
  return permissionList.some((p) => hasPermission(role, p))
}

/** Default landing dashboard per role */
export function getDashboardRoute(role) {
  switch (role) {
    case 'superadmin':
      return '/dashboard/platform'
    case 'admin':
      return '/dashboard/owner'
    case 'agent':
    case 'manager':
      return '/dashboard/sales'
    case 'operations':
      return '/dashboard/operations'
    case 'accounts':
      return '/dashboard/accounts'
    default:
      return '/dashboard'
  }
}

/** Sidebar nav items filtered by role */
export function getNavItems(role) {
  const all = {
    platform: { label: 'Platform', href: '/dashboard/platform', roles: ['superadmin'] },
    agencies: { label: 'Agencies', href: '/dashboard/platform/agencies', roles: ['superadmin'] },
    platformUsers: { label: 'All Users', href: '/dashboard/platform/users', roles: ['superadmin'] },
    plans: { label: 'Plans & Limits', href: '/dashboard/platform/plans', roles: ['superadmin'] },
    owner: { label: 'Business Dashboard', href: '/dashboard/owner', roles: ['admin'] },
    sales: { label: 'My Dashboard', href: '/dashboard/sales', roles: ['agent', 'manager'] },
    operations: { label: 'Operations', href: '/dashboard/operations', roles: ['operations'] },
    accounts: { label: 'Accounts', href: '/dashboard/accounts', roles: ['accounts'] },
    leads: { label: 'Leads', href: '/dashboard/leads', roles: ['superadmin', 'admin', 'manager', 'agent'] },
    itineraries: { label: 'Itineraries', href: '/dashboard/itineraries', roles: ['admin', 'manager', 'agent'] },
    builder: { label: 'Itinerary Builder', href: '/dashboard/itinerary-builder', roles: ['admin', 'manager', 'agent'] },
    bookings: {
      label: 'Bookings',
      href: '/dashboard/bookings',
      roles: ['superadmin', 'admin', 'operations', 'accounts'],
    },
    vouchers: { label: 'Vouchers', href: '/dashboard/vouchers', roles: ['admin', 'operations'] },
    invoices: { label: 'Invoices', href: '/dashboard/invoices', roles: ['admin', 'accounts'] },
    calendar: { label: 'Calendar', href: '/dashboard/tour-calendar', roles: ['admin', 'operations'] },
    suppliers: { label: 'Hotel Suppliers', href: '/dashboard/suppliers', roles: ['admin', 'accounts'] },
    drivers: { label: 'Transport Suppliers', href: '/dashboard/drivers', roles: ['admin', 'accounts'] },
    finance: { label: 'Company Finance', href: '/dashboard/finance', roles: ['admin', 'accounts'] },
    analytics: { label: 'Analytics', href: '/dashboard/analytics', roles: ['admin', 'manager'] },
    admin: { label: 'Team & Weights', href: '/dashboard/admin', roles: ['superadmin', 'admin'] },
    settings: { label: 'Settings', href: '/dashboard/settings', roles: ['superadmin', 'admin'] },
  }

  const order = [
    'platform',
    'agencies',
    'platformUsers',
    'plans',
    'owner',
    'sales',
    'operations',
    'accounts',
    'leads',
    'itineraries',
    'builder',
    'bookings',
    'vouchers',
    'invoices',
    'calendar',
    'suppliers',
    'drivers',
    'finance',
    'analytics',
    'admin',
    'settings',
  ]

  return order
    .map((key) => all[key])
    .filter((item) => item && item.roles.includes(role))
}

/** Roles that can receive auto-assigned leads */
export const LEAD_ASSIGNABLE_ROLES = ['agent', 'manager']

/** Roles blocked from lead APIs */
export const LEAD_BLOCKED_ROLES = ['operations', 'accounts']

export function canAccessLeads(role) {
  return !LEAD_BLOCKED_ROLES.includes(role)
}

export function canManageInvoices(role) {
  return hasAnyPermission(role, ['invoices.create', 'invoices.view', '*'])
}

/**
 * Sales staff (Sales Employee + Sales Lead) only see/manage leads assigned to
 * them. Only the Owner sees every lead and can (re)assign them.
 */
export function canOnlyViewOwnLeads(role) {
  return role === 'agent' || role === 'manager'
}
