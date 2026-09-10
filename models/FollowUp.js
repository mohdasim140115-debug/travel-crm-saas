import mongoose from 'mongoose'

const followUpSchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['call', 'email', 'whatsapp', 'meeting', 'site_visit'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled', 'rescheduled'],
      default: 'pending',
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    completedDate: {
      type: Date,
    },
    description: {
      type: String,
    },
    notes: {
      type: String,
    },
    outcome: {
      type: String,
      enum: ['interested', 'not_interested', 'no_response', 'callback_later'],
    },

    // Recurring follow-ups
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurringPattern: {
      type: String,
      enum: ['daily', 'weekly', 'biweekly', 'monthly'],
    },
    recurringUntil: {
      type: Date,
    },
    recurringEndDate: {
      type: Date,
    },

    // Reminders
    reminderSent: {
      type: Boolean,
      default: false,
    },
    reminderTime: {
      type: String,
      enum: ['15min', '30min', '1hour', '1day'],
    },

    // Priority
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },

    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      index: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
    },

    // Attachments
    attachments: [
      {
        url: String,
        name: String,
        type: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
)

followUpSchema.index({ leadId: 1, status: 1 })
followUpSchema.index({ teamId: 1, assignedTo: 1, status: 1, scheduledDate: 1 })
followUpSchema.index({ status: 1, scheduledDate: 1, reminderSent: 1 })

export default mongoose.models.FollowUp || mongoose.model('FollowUp', followUpSchema)
