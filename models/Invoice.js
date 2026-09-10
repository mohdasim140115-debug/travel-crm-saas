import mongoose from 'mongoose'

const invoiceSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    invoiceType: {
      type: String,
      enum: ['proforma', 'advance', 'tax_invoice', 'credit_note'],
      default: 'proforma',
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    /** Audit trail for corrections made after the invoice was raised — each
     * entry snapshots what the amount/due date/type were *before* this edit,
     * with a mandatory remark, so Accounts can always see what changed and
     * why instead of a number silently changing. */
    editHistory: [
      {
        previousTotalAmount: Number,
        previousDueDate: Date,
        previousInvoiceType: String,
        remark: String,
        editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        editedAt: { type: Date, default: Date.now },
      },
    ],

    // Client Info
    clientName: {
      type: String,
      required: true,
    },
    clientEmail: {
      type: String,
    },
    clientPhone: {
      type: String,
    },
    clientAddress: {
      type: String,
    },

    // Invoice Items
    items: [
      {
        description: String,
        quantity: Number,
        rate: Number,
        amount: Number,
      },
    ],

    // Amounts
    subtotal: {
      type: Number,
      required: true,
    },
    taxRate: {
      type: Number,
      default: 18, // GST percentage
    },
    taxAmount: {
      type: Number,
    },
    discount: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },

    // Payments
    amountPaid: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partial', 'paid', 'overdue'],
      default: 'unpaid',
    },
    payments: [
      {
        amount: Number,
        date: Date,
        method: {
          type: String,
          enum: ['cash', 'bank_transfer', 'cheque', 'card', 'razorpay', 'upi'],
        },
        reference: String,
        notes: String,
      },
    ],

    // Status
    status: {
      type: String,
      enum: ['draft', 'sent', 'viewed', 'paid', 'cancelled'],
      default: 'draft',
    },
    sentDate: {
      type: Date,
    },
    viewedDate: {
      type: Date,
    },
    paidDate: {
      type: Date,
    },

    // Instalment Plan
    isInstallment: {
      type: Boolean,
      default: false,
    },
    instalments: [
      {
        amount: Number,
        dueDate: Date,
        status: {
          type: String,
          enum: ['pending', 'paid'],
          default: 'pending',
        },
        paidDate: Date,
      },
    ],

    // Documents & Notes
    notes: {
      type: String,
    },
    terms: {
      type: String,
    },
    attachments: [
      {
        name: String,
        url: String,
      },
    ],

    // Payment Gateway
    razorpayOrderId: {
      type: String,
    },
    razorpayPaymentId: {
      type: String,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
)

invoiceSchema.index({ teamId: 1, createdAt: -1 })
// invoiceNumber is already indexed by its `unique: true` field option — a
// second declaration here only produces a duplicate-index warning on boot.
invoiceSchema.index({ teamId: 1, paymentStatus: 1, dueDate: 1 })
invoiceSchema.index({ teamId: 1, invoiceType: 1 })
invoiceSchema.index({ bookingId: 1 })

export default mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema)
