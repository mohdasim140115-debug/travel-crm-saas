import mongoose from 'mongoose'

const tourCalendarSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
    },
    tourName: {
      type: String,
      required: true,
    },
    destination: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number, // in days
      required: true,
    },
    maxParticipants: {
      type: Number,
    },
    currentParticipants: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['planning', 'confirmed', 'ongoing', 'completed', 'cancelled'],
      default: 'planning',
    },

    // Tour Details
    price: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    costBreakdown: {
      accommodation: Number,
      transport: Number,
      meals: Number,
      activities: Number,
      other: Number,
    },

    // Itinerary
    itinerary: [
      {
        day: Number,
        date: Date,
        activities: [String],
        meals: [String],
        accommodation: String,
        notes: String,
      },
    ],

    // Participants
    participants: [
      {
        leadId: mongoose.Schema.Types.ObjectId,
        name: String,
        email: String,
        phone: String,
        status: {
          type: String,
          enum: ['booked', 'pending', 'confirmed', 'cancelled'],
          default: 'pending',
        },
      },
    ],

    // Suppliers
    suppliers: [
      {
        supplierId: mongoose.Schema.Types.ObjectId,
        type: String,
        status: String,
      },
    ],

    // Documents
    documents: [
      {
        name: String,
        url: String,
        type: String,
      },
    ],

    // Assigned Team Members
    assignedMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    notes: {
      type: String,
    },

    color: {
      type: String,
      default: '#0066cc',
    },

    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
)

tourCalendarSchema.index({ teamId: 1, startDate: -1 })

export default mongoose.models.TourCalendar || mongoose.model('TourCalendar', tourCalendarSchema)
