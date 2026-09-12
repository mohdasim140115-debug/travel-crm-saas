import mongoose from 'mongoose'

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: String,
    logo: String,
    website: String,
    email: String,
    phone: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },
    members: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        role: {
          type: String,
          enum: ['admin', 'manager', 'agent'],
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    /**
     * Workspace / SaaS billing (Team = isolated workspace).
     * Not an enum — plan keys are rows in the Plan collection, which the
     * platform super admin can add to at runtime.
     */
    plan: {
      type: String,
      default: 'basic',
      lowercase: true,
      trim: true,
    },
    subscriptionStatus: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'cancelled'],
      default: 'trialing',
    },
    /**
     * When this agency's access runs out. Set on creation (1 month out) and
     * pushed forward by the super admin's "Renew" action. Past this date the
     * agency is locked out at login (and any live session is cut on its next
     * silent refresh) even if `isActive` hasn't flipped yet — the daily cron
     * (see app/api/cron/subscription-expiry) flips it so the agencies list
     * reflects "Suspended" without needing a login attempt first.
     */
    subscriptionExpiresAt: Date,
    /**
     * Per-agency limit overrides set by the super admin. Only the keys present
     * here deviate from the plan; everything else inherits. Resolved by
     * lib/plans.js → resolveTeamLimits().
     */
    planOverrides: {
      maxBrands: Number,
      maxAgents: Number,
      maxLeadsPerMonth: Number,
      automation: Boolean,
      whatsappAutomation: Boolean,
      apiIngest: Boolean,
    },
    /** Set when the super admin suspends the agency (isActive = false). */
    suspendedAt: Date,
    suspensionReason: String,
    /** Internal super-admin-only notes; never exposed to agency users. */
    platformNotes: String,
    walletCredits: {
      type: Number,
      default: 0,
    },
    usage: {
      leadsThisMonth: { type: Number, default: 0 },
      whatsappSentThisMonth: { type: Number, default: 0 },
      lastUsageResetAt: Date,
    },
    leadRoundRobinIndex: {
      type: Number,
      default: 0,
    },
    opsRoundRobinIndex: {
      type: Number,
      default: 0,
    },
    accountsRoundRobinIndex: {
      type: Number,
      default: 0,
    },
    inboundApiKeyHash: { type: String, sparse: true, unique: true },
    inboundApiKeyCreatedAt: Date,
    /** Meta Lead Ads — page ID for webhook routing to this agency */
    metaPageId: { type: String, sparse: true },

    /**
     * Google Ads Lead Form "Webhook" delivery — Google POSTs a shared secret
     * (`google_key`) in every submission instead of a page id; this is that
     * secret, doubling as the routing key (mirrors metaPageId's role for
     * Meta). Set once in the Google Ads integration settings UI and pasted
     * into the Lead Form asset's webhook config in Google Ads.
     */
    googleLeadFormKey: { type: String, sparse: true, unique: true },

    /**
     * Meta Lead Ads *pull* sync. The webhook above needs Meta to be configured
     * to call us; this is the opposite direction — the agency pastes a form ID
     * and a page access token, and the CRM polls the Graph API for new leads.
     * Useful when the agency can't (or won't) set up webhooks on their page.
     */
    metaSync: {
      enabled: { type: Boolean, default: false },
      /** One or more Lead Ads form IDs to poll. */
      formIds: [String],
      /** Per-form override: round-robin that form's leads among only the
       * chosen employees instead of the whole team. A form with no entry
       * here, or an empty `assignedTo` list, means "All employees" — keeps
       * auto-assigning across the whole team as before. `roundRobinIndex` is
       * this form's own rotation position, independent of the team-wide one. */
      formAssignments: [
        {
          _id: false,
          formId: String,
          assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
          roundRobinIndex: { type: Number, default: 0 },
        },
      ],
      /**
       * Page access token, AES-256-GCM encrypted at rest — it grants read
       * access to the agency's leads, so it never sits in the DB in plaintext
       * and is never returned to the browser.
       */
      accessTokenEnc: String,
      tokenSavedAt: Date,
      /** Only leads created after this are pulled, so each run stays cheap. */
      lastLeadCreatedTime: Date,
      lastSyncAt: Date,
      lastSyncStatus: {
        type: String,
        enum: ['ok', 'partial', 'error'],
      },
      lastSyncError: String,
      lastSyncCreated: { type: Number, default: 0 },
      totalSynced: { type: Number, default: 0 },
    },

    settings: {
      currency: {
        type: String,
        default: 'USD',
      },
      timezone: {
        type: String,
        default: 'UTC',
      },
      language: {
        type: String,
        default: 'en',
      },
      emailNotifications: {
        type: Boolean,
        default: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.models.Team || mongoose.model('Team', teamSchema)
