/** Browser-safe re-exports from permissions (no Node-only deps) */

export const ROLE_LABELS = {
  superadmin: 'AAP Super Admin',
  admin: 'Owner',
  manager: 'Sales Lead',
  agent: 'Sales Employee',
  operations: 'Operations',
  accounts: 'Accounts',
  user: 'User',
  itinerary_only: 'Itinerary Creator',
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
    case 'itinerary_only':
      return '/dashboard/itinerary-builder'
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
  myBookings: {
    label: 'Booking Closed',
    href: '/dashboard/sales/bookings',
    roles: ['agent', 'manager'],
  },
  operations: { label: 'Operations', href: '/dashboard/operations', roles: ['operations'] },
  accounts: { label: 'Accounts', href: '/dashboard/accounts', roles: ['accounts'] },
  leads: { label: 'Leads', href: '/dashboard/leads', roles: ['superadmin', 'admin', 'manager', 'agent'] },
  itineraries: { label: 'Itineraries', href: '/dashboard/itineraries', roles: ['admin', 'manager', 'agent', 'itinerary_only'] },
  builder: { label: 'Itinerary Builder', href: '/dashboard/itinerary-builder', roles: ['admin', 'manager', 'agent', 'itinerary_only'] },
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
  admin: { label: 'Team', href: '/dashboard/admin', roles: ['superadmin', 'admin', 'itinerary_only'] },
  rates: {
    label: 'Hotels & Vehicles',
    href: '/dashboard/rates',
    roles: ['agent', 'manager', 'operations', 'accounts'],
  },
  settings: { label: 'Settings', href: '/dashboard/settings', roles: ['superadmin', 'admin', 'itinerary_only'] },
}

const NAV_ORDER = [
  'platform', 'demoRequests', 'agencies', 'platformUsers',
  'owner', 'sales', 'myBookings', 'operations', 'accounts',
  'leads', 'itineraries', 'builder', 'bookings',
  'vouchers', 'invoices', 'calendar', 'suppliers', 'drivers',
  'finance', 'analytics', 'admin', 'rates', 'settings',
]

// An itinerary-only teammate (added via Team by the owner, not the original
// account the super admin created) shares the exact same `role` as the
// owner — `requestedBy` (set only on the teammate) is what tells them apart.
export function isItinStaff(user) {
  return user?.role === 'itinerary_only' && !!user?.requestedBy
}

const STAFF_ONLY_KEYS = ['itineraries', 'builder']

export function getNavItems(user) {
  const role = typeof user === 'string' ? user : user?.role
  const staff = typeof user === 'string' ? false : isItinStaff(user)
  return NAV_ORDER
    .filter((key) => !staff || STAFF_ONLY_KEYS.includes(key))
    .map((key) => NAV_DEFS[key])
    .filter((item) => item && item.roles.includes(role))
}

export function canAccessLeads(role) {
  return !['operations', 'accounts', 'itinerary_only'].includes(role)
}
