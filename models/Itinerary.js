import mongoose from 'mongoose'

const visaSchema = new mongoose.Schema(
  {
    required: { type: Boolean, default: false },
    type: { type: String, default: '' },
    processingDays: Number,
    cost: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    notes: String,
  },
  { _id: false }
)

const itinerarySchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
    },
    tripName: {
      type: String,
      required: true,
      trim: true,
    },
    title: String,
    customerName: { type: String, trim: true },
    customerEmail: { type: String, trim: true, lowercase: true },
    phone: String,
    destination: {
      type: String,
      required: true,
      trim: true,
    },
    country: { type: String, trim: true },
    bannerImage: String,
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    numberOfAdults: { type: Number, default: 1, min: 0 },
    numberOfChildren: { type: Number, default: 0, min: 0 },
    numberOfTravelers: { type: Number, default: 1, min: 1 },
    pricePerPerson: { type: Number, default: 0 },
    perPersonCost: Number,
    totalPrice: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    status: {
      type: String,
      enum: ['draft', 'sent', 'approved', 'rejected', 'published'],
      default: 'draft',
      index: true,
    },
    notes: String,
    hotels: [
      {
        id: String,
        name: String,
        location: String,
        checkIn: Date,
        checkOut: Date,
        roomType: String,
        stars: Number,
        cost: Number,
        currency: String,
        images: [String],
        amenities: [String],
        notes: String,
        /** Set when added under a budget tier in the Hotels step ('high' or
         * 'low') — links this hotel (and its night stay) to that tier. */
        category: String,
      },
    ],
    /** Whether this itinerary presents multiple budget tiers (a Low Budget
     * and a High Budget hotel option) instead of a single hotel choice. */
    budgetTiers: { type: Boolean, default: false },
    /** Per-category package totals when `budgetTiers` is on — computed once
     * client-side and persisted so the PDF doesn't need to recompute it. */
    categoryTotals: [
      {
        category: String,
        total: Number,
      },
    ],
    flights: [
      {
        airline: String,
        flightNumber: String,
        from: String,
        to: String,
        departure: Date,
        arrival: Date,
        class: String,
        cost: Number,
        currency: String,
        notes: String,
      },
    ],
    transfers: [
      {
        type: String,
        from: String,
        to: String,
        vehicle: String,
        date: Date,
        cost: Number,
        currency: String,
        notes: String,
      },
    ],
    visa: visaSchema,
    inclusions: [String],
    exclusions: [String],
    termsAndConditions: String,
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    shareToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    gallery: [String],
    pdfTheme: { type: String, default: 'classic' },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      index: true,
    },
    templateName: String,
    isTemplate: { type: Boolean, default: false },
    packageCategory: { type: String, trim: true, default: 'Silver' },
    duration: { type: String, trim: true },
    marketingOverview: String,
    supplements: [String],
    cancellationPolicy: [String],
    perChildPrice: { type: Number, default: 0 },
    numberOfRooms: { type: Number, default: 0 },
    extraBeds: { type: Number, default: 0 },
    extraBedCost: { type: Number, default: 0 },
    cnbCount: { type: Number, default: 0 },
    cnbCost: { type: Number, default: 0 },
    roomType: { type: String, default: 'DELUXE' },
    vehicle: String,
    vehicleCost: { type: Number, default: 0 },
    vehicleCurrency: { type: String, default: 'INR' },
    /** Full vehicle selection detail (from Vehicle Management), for a richer PDF section. */
    vehicleDetails: {
      name: String,
      fromLocation: String,
      toLocation: String,
      priceAC: Number,
      priceNonAC: Number,
      selectedType: String,
    },
    /** Multiple vehicle/route selections (a trip can use one vehicle across several routes). */
    vehicles: [
      {
        name: String,
        fromLocation: String,
        toLocation: String,
        priceAC: Number,
        priceNonAC: Number,
        selectedType: String,
        days: { type: Number, default: 1 },
        cost: Number,
        currency: String,
      },
    ],
    nightStays: [
      {
        location: String,
        hotelName: String,
        hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel' },
        dayNumber: Number,
        /** Explicit stay dates for this visit (auto-derived by default,
         * hand-set when `datesOverridden`). */
        checkIn: Date,
        checkOut: Date,
        datesOverridden: Boolean,
        /** The client returns to this same hotel later in the trip — a second
         * visit handled on the same card (no separate stay entry). Its own
         * dates are always entered by hand. */
        hasReCheckIn: Boolean,
        reCheckIn: Date,
        reCheckOut: Date,
        /** Mirrors the linked hotel's budget-tier category (see `hotels.category`). */
        category: String,
        /** Once per stay (not per room type) — shared across whichever room lines are booked at this hotel. */
        extraBeds: { type: Number, default: 0 },
        extraBedCharge: { type: Number, default: 0 },
        cnbCount: { type: Number, default: 0 },
        cnbPrice: { type: Number, default: 0 },
        /** Several travelers in the same stay can book different room types
         * at the same hotel (e.g. one Deluxe, one Super Deluxe). */
        roomLines: [
          {
            roomType: String,
            pricePerNight: { type: Number, default: 0 },
            nights: { type: Number, default: 1 },
            roomCount: { type: Number, default: 1 },
          },
        ],
      },
    ],
    /** Package-level activity add-ons selected from the Activity master (separate from per-day activities). */
    activities: [
      {
        activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity' },
        name: String,
        price: Number,
        currency: String,
        quantity: { type: Number, default: 1 },
        cost: Number,
      },
    ],
    /** Extra charges on top of hotel/vehicle/activity cost — either a flat amount or a % of the running total. */
    extraCharges: [
      {
        label: String,
        type: { type: String, enum: ['percent', 'flat'], default: 'flat' },
        percent: Number,
        amount: Number,
      },
    ],
    days: [mongoose.Schema.Types.Mixed],
  },
  { timestamps: true }
)

itinerarySchema.index({ teamId: 1, status: 1, createdAt: -1 })
itinerarySchema.index({ teamId: 1, destination: 1 })
// The Itineraries list sorts the whole workspace by most-recently-updated.
itinerarySchema.index({ teamId: 1, updatedAt: -1 })
itinerarySchema.index({ teamId: 1, createdBy: 1, updatedAt: -1 })
itinerarySchema.pre('save', function syncTitle() {
  if (this.tripName && !this.title) this.title = this.tripName
  if (this.title && !this.tripName) this.tripName = this.title
  const adults = this.numberOfAdults ?? 1
  const children = this.numberOfChildren ?? 0
  this.numberOfTravelers = adults + children || 1
  if (this.pricePerPerson != null) this.perPersonCost = this.pricePerPerson
  if (this.totalPrice != null) this.totalCost = this.totalPrice
})

export default mongoose.models.Itinerary || mongoose.model('Itinerary', itinerarySchema)
