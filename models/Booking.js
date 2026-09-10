import mongoose from 'mongoose'

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: {
      type: String,
      required: true,
      unique: true,
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
    },
    itineraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Itinerary',
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    numberOfTravelers: Number,
    totalAmount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled'],
      default: 'pending',
    },
    /** Set only when status is cancelled — why, and by whom, for an audit trail. */
    cancelReason: String,
    cancelledAt: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    /** How much the company owes the client back after a cancellation —
     * entered by Operations at cancel time, settled by Accounts afterward.
     * 'none' when no refund is owed (e.g. client forfeits the advance). */
    refundAmount: Number,
    refundStatus: {
      type: String,
      enum: ['none', 'pending', 'paid'],
      default: 'none',
    },
    refundPaidAt: Date,
    refundPaidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    refundScreenshot: String,
    refundNote: String,
    opsStatus: {
      type: String,
      enum: [
        'awaiting_ops',
        'in_progress',
        'hotel_pending',
        'cab_pending',
        'activity_pending',
        'vouchers_ready',
        'travel_kit_sent',
        'completed',
      ],
      default: 'awaiting_ops',
    },
    bookingDetails: {
      flights: [
        {
          airline: String,
          flightNumber: String,
          departureDate: Date,
          departureTime: String,
          arrivalTime: String,
          seats: [String],
          price: Number,
        },
      ],
      hotels: [
        {
          name: String,
          checkInDate: Date,
          checkOutDate: Date,
          rooms: Number,
          nights: Number,
          price: Number,
        },
      ],
      activities: [
        {
          name: String,
          date: Date,
          time: String,
          price: Number,
          tickets: Number,
        },
      ],
    },
    /** Per-hotel confirmation with the actual property — set by Operations
     * once rooms are truly booked with the hotel (not just quoted in the
     * itinerary). `key` matches a night stay's hotelId (stringified) or
     * falls back to hotelName. A hotel voucher can't be generated until
     * every entry here is confirmed. */
    hotelConfirmations: [
      {
        key: String,
        name: String,
        location: String,
        confirmed: { type: Boolean, default: false },
        confirmedAt: Date,
        confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        /** Room type, stay dates, and pricing captured when Operations calls
         * the hotel to confirm — mirrors what's quoted in the itinerary
         * (`quotedPrice`) alongside what was actually agreed on the call
         * (`negotiatedPrice`), which is what gets charged to the supplier
         * ledger (see lib/bookingConfirmations.js, app/api/bookings/[id]/confirmations). */
        roomType: String,
        roomCount: Number,
        checkIn: Date,
        checkOut: Date,
        quotedPrice: Number,
        negotiatedPrice: Number,
        supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
        /** Not tracked anywhere upstream — Operations picks it on the call, same as price. */
        mealPlan: String,
        /** Breakdown of what was actually agreed with the hotel — negotiatedPrice
         * is always their sum (room+extraBed+CNB can shift independently since
         * B2B rates change per call). */
        roomPrice: Number,
        extraBedPrice: Number,
        cnbPrice: Number,
        /** One-off hotel charge outside the usual room/extra-bed/CNB breakdown
         * (e.g. a late check-out fee, festival surcharge) — remark is required
         * whenever this is non-zero so it's clear later why it was charged. */
        extraCharge: Number,
        extraChargeRemark: String,
        /** Whether the hotel needs an advance to hold the booking, and how much —
         * a hint surfaced to Accounts on the Supplier ledger, not a separate payment record. */
        advanceRequired: Boolean,
        advanceAmount: Number,
        /** Operations explicitly hands this off to Accounts once the hotel is
         * confirmed — Accounts only ever sees/acts on it after this is set. */
        advanceSentAt: Date,
        advancePaid: { type: Boolean, default: false },
        advancePaidAt: Date,
        advancePaidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        /** Proof Accounts uploads when marking the advance paid — visible to
         * both Accounts and Operations so Operations can forward it to the
         * hotel. Compressed client-side to well under 30KB. */
        advancePaidScreenshot: String,
      },
    ],
    /** Same idea as `hotelConfirmations`, for vehicles/transport — gates
     * cab/transport voucher generation. */
    vehicleConfirmations: [
      {
        key: String,
        name: String,
        route: String,
        confirmed: { type: Boolean, default: false },
        confirmedAt: Date,
        confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        /** Collected once Operations calls the transport supplier — the
         * itinerary only ever has the vehicle type/route, not who's driving. */
        driverName: String,
        driverPhone: String,
        vehicleNumber: String,
        licenseNumber: String,
        /** Agreed price for this vehicle for the whole trip — charged to the
         * transport Supplier ledger on confirm, same pattern as hotels. */
        price: Number,
        supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
      },
    ],
    /** Package-level add-on activities (e.g. trekking, rafting) from the
     * itinerary — booked by Operations once confirmed with the activity
     * supplier; a booking with no add-on activities is vacuously "confirmed". */
    activityConfirmations: [
      {
        key: String,
        name: String,
        /** Itinerary-quoted reference values — quantity/price below are what
         * Operations actually books, editable since the supplier's rate or
         * headcount can change by the time it's actually confirmed. */
        quotedPrice: Number,
        quotedUnitPrice: Number,
        quantity: Number,
        price: Number,
        confirmed: { type: Boolean, default: false },
        confirmedAt: Date,
        confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        /** Activity payments go through Accounts, same hand-off as a hotel
         * advance — Operations sends the request once price/qty are set,
         * Accounts pays and uploads proof, and only then can Operations
         * confirm the activity. */
        paymentSentAt: Date,
        paymentPaid: { type: Boolean, default: false },
        paymentPaidAt: Date,
        paymentPaidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        paymentPaidScreenshot: String,
      },
    ],
    paymentSchedule: [
      {
        dueDate: Date,
        amount: Number,
        status: {
          type: String,
          enum: ['pending', 'paid', 'overdue', 'cancelled'],
          default: 'pending',
        },
      },
    ],
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    /** Round-robin assigned Operations employee — only this person sees the booking in their queue. */
    opsAssignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    /** Round-robin assigned Accounts employee — only this person sees the booking in their queue. */
    accountsAssignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
    },
    notes: String,
    /** Defaults from the itinerary's vehicles/transfers but editable by
     * Operations on the booking detail page — not always predictable. */
    pickupLocation: String,
    dropLocation: String,
    /** Ad-hoc on-ground costs outside the usual hotel/transport/activity
     * charges (e.g. a breakdown, a permit fee) — logged against this
     * specific booking so Booking Profitability reflects real spend. */
    otherExpenses: [
      {
        amount: Number,
        remark: String,
        addedAt: { type: Date, default: Date.now },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      },
    ],
  },
  { timestamps: true }
)

// Booking is read on every Ops / Accounts / Owner / Finance / Sales dashboard
// load — without these it was a full collection scan each time.
bookingSchema.index({ teamId: 1, status: 1, createdAt: -1 })
bookingSchema.index({ teamId: 1, assignedTo: 1, createdAt: -1 })
bookingSchema.index({ teamId: 1, opsAssignedTo: 1 })
bookingSchema.index({ teamId: 1, accountsAssignedTo: 1 })
bookingSchema.index({ teamId: 1, startDate: 1 })
bookingSchema.index({ leadId: 1 })
bookingSchema.index({ itineraryId: 1 })

export default mongoose.models.Booking || mongoose.model('Booking', bookingSchema)
