/** Browser-safe re-exports from permissions (no Node-only deps) */

export const ROLE_LABELS = {
  superadmin: 'AAP Super Admin',
  admin: 'Owner',
  manager: 'Sales Lead',
  agent: 'Sales Employee',
  operations: 'Operations',
  accounts: 'Accounts',
  user: 'User',
}

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

const NAV_DEFS = {
  platform: { label: 'Platform', href: '/dashboard/platform', roles: ['superadmin'] },
  demoRequests: { label: 'Demo Requests', href: '/dashboard/platform/demo-requests', roles: ['superadmin'] },
  agencies: { label: 'Agencies', href: '/dashboard/platform/agencies', roles: ['superadmin'] },
  platformUsers: { label: 'All Users', href: '/dashboard/platform/users', roles: ['superadmin'] },
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

const NAV_ORDER = [
  'platform', 'demoRequests', 'agencies', 'platformUsers',
  'owner', 'sales', 'operations', 'accounts',
  'leads', 'itineraries', 'builder', 'bookings',
  'vouchers', 'invoices', 'calendar', 'suppliers', 'drivers',
  'finance', 'analytics', 'admin', 'settings',
]

export function getNavItems(role) {
  return NAV_ORDER
    .map((key) => NAV_DEFS[key])
    .filter((item) => item && item.roles.includes(role))
}

export function canAccessLeads(role) {
  return !['operations', 'accounts'].includes(role)
}
