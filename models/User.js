import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
    },
    password: {
      type: String,
      required: function passwordRequired() {
        return !this.googleId
      },
    },
    role: {
      type: String,
      enum: ['superadmin', 'admin', 'manager', 'agent', 'operations', 'accounts', 'user'],
      default: 'agent',
    },
    /** Lead distribution weight (0 = paused, e.g. training). Owner configures per sales employee. */
    leadAssignmentWeight: {
      type: Number,
      default: 1,
      min: 0,
      max: 10,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
    },
    /** Active brand for multi-brand UI (optional; null = all / default) */
    activeBrandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
    },
    // Profile
    avatar: {
      type: String,
    },
    department: {
      type: String,
    },
    designation: {
      type: String,
    },
    bio: {
      type: String,
    },

    // Authentication
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpiry: {
      type: Date,
    },

    // 2FA - TOTP
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
    },

    // OTP for email verification
    otp: {
      type: String,
    },
    otpExpiry: {
      type: Date,
    },

    // Password Reset
    passwordResetToken: {
      type: String,
    },
    passwordResetExpiry: {
      type: Date,
    },

    // OAuth
    googleId: {
      type: String,
    },
    googleAccessToken: {
      type: String,
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    /** Employees added by an agency owner sit here until a super admin approves them. */
    approvalStatus: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'approved',
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    lastLogin: {
      type: Date,
    },
    lastPasswordChange: {
      type: Date,
    },

    // Permissions & Access
    permissions: [
      {
        type: String,
      },
    ],

    // Preferences
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light',
      },
      language: {
        type: String,
        default: 'en',
      },
      timezone: {
        type: String,
        default: 'UTC',
      },
      notifications: {
        email: { type: Boolean, default: true },
        inApp: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
      },
    },

    // API Keys
    apiKeys: [
      {
        key: String,
        name: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
)

export default mongoose.models.User || mongoose.model('User', userSchema)
