

import mongoose from 'mongoose'

const brandSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      trim: true,
    },
    logo: String,
    website: String,
    /** Public contact shown on itineraries / documents. */
    phone: String,
    email: String,
    /** Social / Meta (Facebook / Instagram) page link. */
    metaLink: String,
    /** Payment QR scanner (image data-URL or URL). */
    scanner1: String,
    /** Background image shown behind the final contact/payment page of the itinerary PDF. */
    contactBackground: String,
    /** Short line under the brand name on PDFs, e.g. "The Soul of Kashmir". */
    tagline: String,
    /** Social profile links — shown as clickable icons on itinerary PDFs.
     * WhatsApp uses the brand phone, so it has no field of its own. */
    socials: {
      facebook: String,
      instagram: String,
      google: String,
      youtube: String,
    },
    /** "Our associate hotels & houseboats" logo wall on itinerary PDFs.
     * Saved one at a time (small compressed images) so no single request
     * carries the whole wall. */
    associateLogos: [{ url: String }],
    /** "Registered with" badge, e.g. the state tourism department logo. */
    registeredLogo: String,
    /** Credentials shown in the Sunset Coral PDF footer. */
    googleRating: { type: Number, min: 0, max: 5 },
    approvedBy: String,
    licenseNo: String,
    gstin: String,
    /** Cover-image picker shown in the itinerary builder — capped at 4 by the settings UI/API. */
    gallery: [
      {
        url: String,
        label: String,
      },
    ],
    isDefault: {
      type: Boolean,
      default: false,
    },
    address: String,
    /** Optional second office address. */
    address2: String,
    bankDetails: {
      bankName: String,
      accountName: String,
      accountNumber: String,
      ifscCode: String,
    },
    settings: {
      currency: { type: String, default: 'INR' },
      whatsappBusinessId: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

brandSchema.index({ teamId: 1, name: 1 }, { unique: true })

export default mongoose.models.Brand || mongoose.model('Brand', brandSchema)
