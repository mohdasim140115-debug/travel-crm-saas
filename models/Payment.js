import mongoose from 'mongoose'

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      required: true,
      unique: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    paymentMethod: {
      type: String,
      enum: ['bank_transfer', 'credit_card', 'cash', 'upi', 'cheque', 'other'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'partial', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
    transactionId: String,
    dueDate: Date,
    paidDate: Date,
    invoiceNumber: String,
    notes: String,
    /** Set on the advance payment captured while Sales confirms a booking —
     * distinguishes it from later balance/installment payments Accounts logs. */
    type: {
      type: String,
      enum: ['advance', 'balance', 'other'],
      default: 'other',
    },
    /** Client-compressed (~70KB) screenshot of the payment, stored as a data
     * URL — same pattern as Brand.gallery/scanner1. Proof for the advance. */
    screenshotUrl: String,
    /** Required when Sales records a zero advance — why nothing was collected. */
    zeroReason: String,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
    },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
)

paymentSchema.index({ teamId: 1, status: 1, createdAt: -1 })
paymentSchema.index({ teamId: 1, type: 1 })
paymentSchema.index({ bookingId: 1 })

export default mongoose.models.Payment || mongoose.model('Payment', paymentSchema)
