import connectDB from '@/lib/mongodb'
import Booking from '@/models/Booking'
import Itinerary from '@/models/Itinerary' // eslint-disable-line no-unused-vars -- registers the schema so Booking.populate('itineraryId') resolves
import Invoice from '@/models/Invoice'
import Payment from '@/models/Payment'
import Lead from '@/models/Lead' // eslint-disable-line no-unused-vars -- registers the schema so Booking.populate('leadId') resolves
import CompanyExpense from '@/models/CompanyExpense'
import SalaryPayment from '@/models/SalaryPayment'
import { authenticate, requireRoles } from '@/lib/middleware'
import {
  computeHotelConfirmations,
  computeVehicleConfirmations,
  computeActivityConfirmations,
  deriveStatus,
} from '@/lib/bookingConfirmations'

function dateKey(d) {
  const date = new Date(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Per-booking real profit (revenue minus only vendor charges Operations has
 * actually confirmed, same rule as the client ledger page) and how much of
 * the package has actually been invoiced+received so far. A booking's
 * profit only counts as "current" (realized) once nothing is left owing —
 * until then it's "upcoming" (projected, not yet in hand). */
function bookingFinance(booking, invoicesForBooking) {
  const hotelExpense = (booking.hotelConfirmations || []).reduce(
    (sum, h) => sum + (h.negotiatedPrice ? Number(h.negotiatedPrice) : 0),
    0
  )
  const vehicleExpense = (booking.vehicleConfirmations || []).reduce(
    (sum, v) => sum + (v.confirmed && v.price ? Number(v.price) : 0),
    0
  )
  const activityExpense = (booking.activityConfirmations || []).reduce(
    (sum, a) => sum + (a.confirmed && a.price != null ? Number(a.price) * (Number(a.quantity) || 1) : 0),
    0
  )
  const otherExpense = (booking.otherExpenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const totalExpense = hotelExpense + vehicleExpense + activityExpense + otherExpense
  const revenue = booking.totalAmount || 0
  const profit = revenue - totalExpense
  const received = invoicesForBooking.reduce((sum, i) => sum + (i.amountPaid || 0), 0)
  const dueBalance = Math.max(0, revenue - received)
  return { revenue, totalExpense, profit, received, dueBalance }
}

export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const forbidden = requireRoles(authResult.user.role, ['admin', 'accounts'])
    if (forbidden) {
      return Response.json({ error: forbidden.error }, { status: forbidden.status })
    }

    await connectDB()
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = Number(searchParams.get('year')) || now.getFullYear()
    const monthParam = searchParams.get('month')
    const month = monthParam ? Number(monthParam) : null

    const teamId = authResult.user.teamId

    // --- Profit (current vs upcoming), all-time — a booking's profit is
    // realized once fully paid, not tied to a calendar period.
    const bookings = await Booking.find({ teamId, status: { $ne: 'cancelled' } })
      .populate('itineraryId', 'vehicles vehicle activities nightStays hotels startDate')
      .populate('leadId', 'firstName lastName')
      .select(
        'totalAmount hotelConfirmations vehicleConfirmations activityConfirmations otherExpenses itineraryId leadId bookingNumber'
      )
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean()

    const bookingIds = bookings.map((b) => b._id)
    const invoices = await Invoice.find({ bookingId: { $in: bookingIds } })
      .select('bookingId amountPaid invoiceDate')
      .lean()
    const invoicesByBooking = new Map()
    for (const inv of invoices) {
      const key = String(inv.bookingId)
      if (!invoicesByBooking.has(key)) invoicesByBooking.set(key, [])
      invoicesByBooking.get(key).push(inv)
    }

    let currentProfit = 0
    let upcomingProfit = 0
    for (const booking of bookings) {
      if (!booking.totalAmount) continue
      const itinerary = booking.itineraryId

      // Nothing to sell yet (no hotels/vehicle/activities on the itinerary at
      // all) — can't know a real cost, so skip rather than count the whole
      // package as profit.
      const hasVendorItems =
        itinerary?.hotels?.length ||
        itinerary?.nightStays?.length ||
        itinerary?.vehicles?.length ||
        itinerary?.vehicle ||
        itinerary?.activities?.length
      if (!hasVendorItems) continue

      const hotelConfirmations = computeHotelConfirmations(booking, itinerary, new Map())
      const vehicleConfirmations = computeVehicleConfirmations(booking, itinerary)
      const activityConfirmations = computeActivityConfirmations(booking, itinerary)

      // Only count a booking's profit once Operations has actually confirmed
      // every vendor item — until then the real cost isn't known, so an
      // unconfirmed booking has 0 recorded expense and would otherwise show
      // its *entire* package price as "profit", which is wrong.
      const fullyConfirmed =
        deriveStatus(hotelConfirmations) === 'confirmed' &&
        deriveStatus(vehicleConfirmations) === 'confirmed' &&
        deriveStatus(activityConfirmations) === 'confirmed'
      if (!fullyConfirmed) continue

      const { profit, dueBalance } = bookingFinance(
        { ...booking, hotelConfirmations, vehicleConfirmations, activityConfirmations },
        invoicesByBooking.get(String(booking._id)) || []
      )
      if (dueBalance <= 0) currentProfit += profit
      else upcomingProfit += profit
    }

    // --- Revenue received (cash actually invoiced+collected), all-time —
    // sourced from Invoice.amountPaid only, so a booking's Sales-side advance
    // and its later formal invoice for that same money are never both counted.
    const revenueReceivedAllTime = invoices.reduce((sum, i) => sum + (i.amountPaid || 0), 0)

    // --- Uninvoiced advances — money Sales already collected (Payment,
    // type='advance') that Accounts hasn't formally invoiced yet. Shown as
    // its own figure, deliberately kept OUT of revenue/profit above so the
    // same cash is never counted twice once it is invoiced.
    const advancePayments = await Payment.find({ bookingId: { $in: bookingIds }, type: 'advance' })
      .select('bookingId amount')
      .lean()
    const bookingById = new Map(bookings.map((b) => [String(b._id), b]))
    let uninvoicedAdvanceTotal = 0
    const uninvoicedAdvances = []
    for (const payment of advancePayments) {
      const key = String(payment.bookingId)
      const invoicedSoFar = (invoicesByBooking.get(key) || []).reduce((sum, i) => sum + (i.amountPaid || 0), 0)
      const uninvoiced = Math.max(0, (payment.amount || 0) - invoicedSoFar)
      if (uninvoiced > 0) {
        uninvoicedAdvanceTotal += uninvoiced
        const booking = bookingById.get(key)
        const lead = booking?.leadId
        uninvoicedAdvances.push({
          bookingId: key,
          clientName: lead ? [lead.firstName, lead.lastName].filter(Boolean).join(' ') : booking?.bookingNumber || '—',
          amount: uninvoiced,
        })
      }
    }

    // --- Company expenses (salaries + overheads + refunds paid out on
    // cancelled bookings), all-time totals for the summary cards, plus
    // day-wise (selected month) / month-wise (selected year) breakdowns.
    const [allExpenses, allSalaries, refundedBookings] = await Promise.all([
      CompanyExpense.find({ teamId }).select('amount date').lean(),
      SalaryPayment.find({ teamId }).select('amount date').lean(),
      Booking.find({ teamId, status: 'cancelled', refundStatus: 'paid' })
        .select('refundAmount refundPaidAt')
        .lean(),
    ])
    const totalOverhead = allExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
    const totalSalary = allSalaries.reduce((sum, s) => sum + (s.amount || 0), 0)
    const totalRefunds = refundedBookings.reduce((sum, b) => sum + (b.refundAmount || 0), 0)

    // Income entries (for day/month bucketing) — invoice collections dated
    // by when they were raised.
    const incomeEntries = invoices
      .filter((i) => i.amountPaid > 0)
      .map((i) => ({ date: i.invoiceDate, amount: i.amountPaid }))
    const expenseEntries = [
      ...allExpenses.map((e) => ({ date: e.date, amount: e.amount })),
      ...allSalaries.map((s) => ({ date: s.date, amount: s.amount })),
      ...refundedBookings.map((b) => ({ date: b.refundPaidAt, amount: b.refundAmount || 0 })),
    ]

    // Month-wise totals for the selected year (12 buckets).
    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, income: 0, expense: 0 }))
    for (const e of incomeEntries) {
      const d = new Date(e.date)
      if (d.getFullYear() === year) months[d.getMonth()].income += e.amount
    }
    for (const e of expenseEntries) {
      const d = new Date(e.date)
      if (d.getFullYear() === year) months[d.getMonth()].expense += e.amount
    }
    for (const m of months) m.net = m.income - m.expense

    // Day-wise totals for the selected month (if given).
    let days = []
    if (month) {
      const daysInMonth = new Date(year, month, 0).getDate()
      const dayMap = new Map()
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        dayMap.set(key, { date: key, income: 0, expense: 0 })
      }
      for (const e of incomeEntries) {
        const d = new Date(e.date)
        if (d.getFullYear() === year && d.getMonth() + 1 === month) {
          const key = dateKey(d)
          if (dayMap.has(key)) dayMap.get(key).income += e.amount
        }
      }
      for (const e of expenseEntries) {
        const d = new Date(e.date)
        if (d.getFullYear() === year && d.getMonth() + 1 === month) {
          const key = dateKey(d)
          if (dayMap.has(key)) dayMap.get(key).expense += e.amount
        }
      }
      days = Array.from(dayMap.values()).map((d) => ({ ...d, net: d.income - d.expense }))
    }

    return Response.json({
      profit: { current: currentProfit, upcoming: upcomingProfit },
      expenses: {
        total: totalOverhead + totalSalary + totalRefunds,
        salary: totalSalary,
        overhead: totalOverhead,
        refunds: totalRefunds,
      },
      revenueReceivedAllTime,
      uninvoicedAdvances: { total: uninvoicedAdvanceTotal, items: uninvoicedAdvances },
      period: { year, month, months, days },
    })
  } catch (error) {
    console.error('Finance summary error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
