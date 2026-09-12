/**
 * Imports every model so `mongoose.models` is complete.
 *
 * Route handlers normally import only the models they touch, which is fine for
 * queries but not for operations that must sweep *all* tenant-scoped data (the
 * super admin's agency purge). Importing this module guarantees nothing is
 * missed just because a route didn't happen to reference it.
 */
import mongoose from 'mongoose'

import '@/models/Activity'
import '@/models/AuditLog'
import '@/models/Booking'
import '@/models/Brand'
import '@/models/CompanyExpense'
import '@/models/DayPlanTemplate'
import '@/models/FollowUp'
import '@/models/GoogleCampaignMapping'
import '@/models/GoogleIntegration'
import '@/models/GoogleLeadEvent'
import '@/models/Hotel'
import '@/models/Invoice'
import '@/models/Itinerary'
import '@/models/ItineraryActivity'
import '@/models/ItineraryDay'
import '@/models/ItineraryHotel'
import '@/models/Lead'
import '@/models/LeadTimeline'
import '@/models/MetaConversionEvent'
import '@/models/Notification'
import '@/models/Payment'
import '@/models/Plan'
import '@/models/RefreshToken'
import '@/models/SalaryPayment'
import '@/models/SettingOption'
import '@/models/Supplier'
import '@/models/SupplierLedgerEntry'
import '@/models/Team'
import '@/models/TourCalendar'
import '@/models/User'
import '@/models/Vehicle'
import '@/models/Voucher'

/**
 * Every registered model that stores a `teamId`, excluding Team itself (the
 * caller deletes that last, after the children are gone).
 */
export function tenantScopedModels() {
  return Object.entries(mongoose.models)
    .filter(([name, model]) => name !== 'Team' && Boolean(model.schema?.path('teamId')))
    .map(([name, model]) => ({ name, model }))
}

export default mongoose
