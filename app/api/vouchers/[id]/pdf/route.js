import connectDB from '@/lib/mongodb'
import mongoose from 'mongoose'
import Voucher from '@/models/Voucher'
import Booking from '@/models/Booking'
import Lead from '@/models/Lead'
import Itinerary from '@/models/Itinerary'
import ItineraryDay from '@/models/ItineraryDay'
import Brand from '@/models/Brand'
import User from '@/models/User'
import { authenticate } from '@/lib/middleware'
import { hotelSourceList } from '@/lib/bookingConfirmations'
import { buildHotelVoucherPdf, buildCabVoucherPdf, buildDriverVoucherPdf } from '@/lib/pdf/voucherPdf'

export const runtime = 'nodejs'

const TYPE_LABELS = { hotel: 'Hotel', cab: 'Cab', driver: 'Driver' }

export async function GET(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid voucher ID' }, { status: 400 })
    }

    await connectDB()
    const voucher = await Voucher.findOne({ _id: id, teamId: authResult.user.teamId })
      .populate('issuedBy', 'name email phone designation')
      .lean()
    if (!voucher) {
      return Response.json({ error: 'Voucher not found' }, { status: 404 })
    }
    if (!['hotel', 'cab', 'driver'].includes(voucher.type)) {
      return Response.json({ error: 'PDF export is only available for hotel/cab/driver vouchers' }, { status: 400 })
    }

    const booking = await Booking.findOne({ _id: voucher.bookingId, teamId: authResult.user.teamId }).lean()
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 })
    }

    const [lead, itinerary] = await Promise.all([
      booking.leadId ? Lead.findById(booking.leadId).lean() : null,
      booking.itineraryId ? Itinerary.findById(booking.itineraryId).lean() : null,
    ])

    // Arrival/departure on the voucher must match the actual day-wise plan
    // (same source the booking detail page's Client Details card uses) —
    // booking.startDate/endDate can go stale once the plan is edited.
    let days = []
    let planStartDate = booking.startDate
    let planEndDate = booking.endDate
    if (booking.itineraryId) {
      days = await ItineraryDay.find({ itineraryId: booking.itineraryId })
        .select('dayNumber title description date hotel transfers activities')
        .sort({ dayNumber: 1 })
        .lean()
      const dated = days.filter((d) => d.date)
      if (dated.length) {
        planStartDate = dated[0].date
        planEndDate = dated[dated.length - 1].date
      }
    }
    const bookingForPdf = { ...booking, startDate: planStartDate, endDate: planEndDate }

    let brand = null
    const brandId = itinerary?.brandId || authResult.user.brandId
    if (brandId) {
      brand = await Brand.findOne({ _id: brandId, teamId: authResult.user.teamId, isActive: true }).lean()
    }
    if (!brand) {
      brand = await Brand.findOne({ teamId: authResult.user.teamId, isActive: true })
        .sort({ isDefault: -1, name: 1 })
        .lean()
    }

    let buffer
    if (voucher.type === 'cab') {
      buffer = await buildCabVoucherPdf({
        voucher,
        booking: bookingForPdf,
        lead,
        itinerary,
        brand: brand || { name: 'Travel Agency' },
        issuedBy: voucher.issuedBy,
      })
    } else if (voucher.type === 'driver') {
      const dayDates = new Map(days.filter((d) => d.date).map((d) => [d.dayNumber, d.date]))
      const hotelStays = itinerary ? hotelSourceList(itinerary, dayDates) : []
      buffer = await buildDriverVoucherPdf({
        voucher,
        booking: bookingForPdf,
        lead,
        itinerary,
        days,
        hotelStays,
        brand: brand || { name: 'Travel Agency' },
        issuedBy: voucher.issuedBy,
      })
    } else {
      buffer = await buildHotelVoucherPdf({
        voucher,
        booking: bookingForPdf,
        lead,
        itinerary,
        brand: brand || { name: 'Travel Agency' },
        issuedBy: voucher.issuedBy,
      })
    }

    const filename = `${TYPE_LABELS[voucher.type]}-Voucher-${booking.bookingNumber}.pdf`
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Regenerating a voucher reuses the same URL (same voucher _id) —
        // never let the browser serve an earlier download for it instead of
        // the one that matches what was just saved.
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Voucher PDF export error:', error)
    return Response.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
