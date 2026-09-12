import connectDB from '@/lib/mongodb'
import Lead from '@/models/Lead'
import LeadTimeline from '@/models/LeadTimeline'
import Booking from '@/models/Booking'
import Itinerary from '@/models/Itinerary'
import FollowUp from '@/models/FollowUp'
import Invoice from '@/models/Invoice'
import Payment from '@/models/Payment'
import Voucher from '@/models/Voucher'
import Notification from '@/models/Notification'
import User from '@/models/User'
import { authenticate, requireLeadAccess } from '@/lib/middleware'
import { canOnlyViewOwnLeads } from '@/lib/permissions'
import { tenantFilter } from '@/lib/tenant'
import { notifyUser } from '@/lib/notify'
import { notifyMetaLeadStatusChange } from '@/lib/metaCapi/sendConversionEvent'
import mongoose from 'mongoose'

function leadAccessQuery(authUser, id) {
  const q = { _id: id, ...tenantFilter(authUser) }
  if (canOnlyViewOwnLeads(authUser.role)) {
    q.assignedTo = new mongoose.Types.ObjectId(String(authUser.userId))
  }
  return q
}

export async function GET(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const leadDenied = requireLeadAccess(authResult.user.role)
    if (leadDenied) {
      return Response.json({ error: leadDenied.error }, { status: leadDenied.status })
    }

    await connectDB()
    const { id } = await params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid lead ID' }, { status: 400 })
    }

    const lead = await Lead.findOne(leadAccessQuery(authResult.user, id)).populate(
      'assignedTo',
      'name email'
    )

    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 })
    }

    return Response.json({ lead })
  } catch (error) {
    console.error('Get lead error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const leadDenied = requireLeadAccess(authResult.user.role)
    if (leadDenied) {
      return Response.json({ error: leadDenied.error }, { status: leadDenied.status })
    }

    await connectDB()
    const { id } = await params
    const body = await request.json()

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid lead ID' }, { status: 400 })
    }

    // Sales employees cannot reassign leads or delete
    if (canOnlyViewOwnLeads(authResult.user.role)) {
      delete body.assignedTo
    }

    const lead = await Lead.findOne(leadAccessQuery(authResult.user, id))
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 })
    }

    const prevStatus = lead.status
    const statusChanged = body.status && body.status !== prevStatus
    const prevAssignedTo = lead.assignedTo ? String(lead.assignedTo) : null

    // Apply allowed fields.
    const editable = [
      'firstName', 'lastName', 'email', 'phone', 'whatsapp', 'city', 'destination',
      'travelDate', 'notes', 'destinationPreference', 'status', 'source', 'assignedTo',
      'numberOfTravelers', 'budget', 'travelDates', 'followUpDate', 'lostReason',
      'lostDetails', 'attachments', 'brandId',
    ]
    for (const f of editable) {
      if (body[f] !== undefined) lead[f] = body[f]
    }

    if (statusChanged) {
      lead.statusHistory = lead.statusHistory || []
      lead.statusHistory.push({
        from: prevStatus,
        to: body.status,
        changedBy: authResult.user.userId,
        changedAt: new Date(),
        note: body.statusNote,
      })
      // Clear lost details if moved out of lost.
      if (body.status !== 'lost' && body.lostDetails === undefined) {
        lead.lostReason = undefined
        lead.lostDetails = undefined
      }
    }

    await lead.save()
    await lead.populate('assignedTo', 'name email')

    // Fire-and-forget: report this status change to Meta if the lead came
    // from Meta and the new status is one that's mapped (see
    // lib/metaCapi/config.js). Never awaited for the response and never
    // allowed to fail the CRM update — see sendConversionEvent.js.
    if (statusChanged) {
      notifyMetaLeadStatusChange({ lead, newStatus: lead.status, previousStatus: prevStatus }).catch(() => {})
    }

    // Follow-ups are only actionable while a lead is still in play. Once the
    // status moves to a resting point, any still-pending follow-up on it must
    // be closed so it stops showing on the Follow-ups list:
    //  - back to "new"  → the lead is un-contacted again, the old plan is
    //    void → cancel.
    //  - "booked" / "completed" → the lead is won and handed off → complete.
    // "lost" is deliberately excluded: the lost-lead flow schedules its own
    // fresh follow-up right after this, and /api/follow-ups supersedes the
    // stale pending ones itself when it does.
    if (statusChanged && ['new', 'booked', 'completed'].includes(lead.status)) {
      await FollowUp.updateMany(
        { leadId: lead._id, status: 'pending' },
        {
          $set: {
            status: lead.status === 'new' ? 'cancelled' : 'completed',
            ...(lead.status === 'new' ? {} : { completedAt: new Date() }),
          },
        }
      )
    }

    // Reassigning a lead (e.g. via the dropdown in the leads table) didn't
    // used to notify anyone — the assignee only heard about it if they
    // happened to refresh the page. Tell them now, in-app and via push.
    const newAssignedTo = lead.assignedTo?._id ? String(lead.assignedTo._id) : null
    if (newAssignedTo && newAssignedTo !== prevAssignedTo) {
      const clientName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Lead'
      await notifyUser({
        userId: lead.assignedTo._id,
        teamId: authResult.user.teamId,
        type: 'lead_assigned',
        title: 'Lead Assigned To You',
        message: `${clientName}${lead.destination ? ` — ${lead.destination}` : ''}`,
        relatedId: lead._id,
        relatedModel: 'Lead',
        priority: 'high',
        action: { text: 'Open lead', link: `/dashboard/leads/${lead._id}` },
      })
    }

    // Record a timeline entry for status changes (best-effort).
    if (statusChanged) {
      try {
        await LeadTimeline.create({
          leadId: lead._id,
          teamId: authResult.user.teamId,
          brandId: lead.brandId,
          type: 'status_change',
          title: `Status changed to ${body.status}`,
          body:
            body.status === 'lost' && lead.lostReason
              ? `Lost reason: ${lead.lostReason}`
              : `From ${prevStatus} to ${body.status}`,
          createdBy: authResult.user.userId,
        })
      } catch (e) {
        console.error('Timeline write failed:', e?.message)
      }
    }

    // Booking is a revenue event — the sales employee who closed it gets a
    // confirmation, and the owner gets told a booking landed, on every device.
    if (statusChanged && lead.status === 'booked') {
      const clientName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Lead'
      const recipients = new Map()
      if (lead.assignedTo) recipients.set(String(lead.assignedTo._id || lead.assignedTo), lead.assignedTo._id || lead.assignedTo)
      const owners = await User.find({ teamId: authResult.user.teamId, role: 'admin', isActive: true })
        .select('_id')
        .lean()
      owners.forEach((o) => recipients.set(String(o._id), o._id))

      await Promise.all(
        [...recipients.values()].map((userId) =>
          notifyUser({
            userId,
            teamId: authResult.user.teamId,
            type: 'booking_confirmed',
            title: 'Lead Booked',
            message: `${clientName}${lead.destination ? ` — ${lead.destination}` : ''} was marked Booked.`,
            relatedId: lead._id,
            relatedModel: 'Lead',
            priority: 'high',
            action: { text: 'Open lead', link: `/dashboard/leads/${lead._id}` },
          })
        )
      )
    }

    return Response.json({
      message: 'Lead updated successfully',
      lead,
    })
  } catch (error) {
    console.error('Update lead error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const leadDenied = requireLeadAccess(authResult.user.role)
    if (leadDenied) {
      return Response.json({ error: leadDenied.error }, { status: leadDenied.status })
    }

    // Only the Owner (admin) / platform superadmin may delete leads.
    if (!['admin', 'superadmin'].includes(authResult.user.role)) {
      return Response.json({ error: 'Only the owner can delete leads' }, { status: 403 })
    }

    await connectDB()
    const { id } = await params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid lead ID' }, { status: 400 })
    }

    // Confirm the lead exists within this workspace before cascading.
    const lead = await Lead.findOne({ _id: id, ...tenantFilter(authResult.user) })
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Gather this lead's bookings so we can also remove their finance/ops records.
    const bookings = await Booking.find({ leadId: id }).select('_id').lean()
    const bookingIds = bookings.map((b) => b._id)

    // Cascade: delete everything tied to this lead (and its bookings).
    // leadId / bookingId are globally-unique ObjectIds, so scoping by them is safe.
    const [vouchers, payments, invoices, deletedBookings, itineraries, followUps, timeline, notifications] =
      await Promise.all([
        Voucher.deleteMany({ bookingId: { $in: bookingIds } }),
        Payment.deleteMany({ $or: [{ leadId: id }, { bookingId: { $in: bookingIds } }] }),
        Invoice.deleteMany({ $or: [{ leadId: id }, { bookingId: { $in: bookingIds } }] }),
        Booking.deleteMany({ leadId: id }),
        Itinerary.deleteMany({ leadId: id }),
        FollowUp.deleteMany({ leadId: id }),
        LeadTimeline.deleteMany({ leadId: id }),
        Notification.deleteMany({ relatedId: { $in: [new mongoose.Types.ObjectId(String(id)), ...bookingIds] } }),
      ])

    await Lead.deleteOne({ _id: id })

    return Response.json({
      message: 'Lead and all related records deleted',
      deleted: {
        bookings: deletedBookings.deletedCount,
        itineraries: itineraries.deletedCount,
        followUps: followUps.deletedCount,
        timeline: timeline.deletedCount,
        invoices: invoices.deletedCount,
        payments: payments.deletedCount,
        vouchers: vouchers.deletedCount,
        notifications: notifications.deletedCount,
      },
    })
  } catch (error) {
    console.error('Delete lead error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
