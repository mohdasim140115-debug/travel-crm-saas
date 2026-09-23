import { z } from 'zod'

export const ITINERARY_STATUSES = ['draft', 'sent', 'approved', 'rejected', 'published']

const timelineBlockSchema = z.object({
  time: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
})

export const itineraryDaySchema = z.object({
  _id: z.string().optional(),
  dayNumber: z.number().int().min(1),
  sortOrder: z.number().int().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  date: z.union([z.string(), z.date()]).optional(),
  distance: z.string().optional(),
  travelDuration: z.string().optional(),
  hotel: z
    .object({
      name: z.string().optional(),
      location: z.string().optional(),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      stars: z.number().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  meals: z
    .array(
      z.object({
        type: z.string().optional(),
        venue: z.string().optional(),
        time: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  activities: z
    .array(
      z.object({
        name: z.string().optional(),
        time: z.string().optional(),
        duration: z.string().optional(),
        description: z.string().optional(),
        cost: z.number().optional(),
        location: z.string().optional(),
      })
    )
    .optional(),
  transfers: z
    .array(
      z.object({
        type: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        time: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  timelineBlocks: z.array(timelineBlockSchema).optional(),
  notes: z.string().optional(),
  images: z.array(z.string()).optional(),
})

export const createItinerarySchema = z.object({
  tripName: z.string().min(1, 'Trip name is required'),
  customerName: z.string().optional(),
  customerEmail: z
    .string()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Invalid email'),
  phone: z.string().optional(),
  destination: z.string().min(1, 'Destination is required'),
  country: z.string().optional(),
  bannerImage: z.string().optional(),
  startDate: z.union([z.string(), z.date()]),
  endDate: z.union([z.string(), z.date()]),
  numberOfAdults: z.number().int().min(0).optional(),
  numberOfChildren: z.number().int().min(0).optional(),
  pricePerPerson: z.number().min(0).optional(),
  totalPrice: z.number().min(0).optional(),
  currency: z.string().optional(),
  status: z.enum(ITINERARY_STATUSES).optional(),
  notes: z.string().optional(),
  leadId: z.string().optional(),
  assignedTo: z.string().optional(),
  hotels: z.array(z.record(z.unknown())).optional(),
  flights: z.array(z.record(z.unknown())).optional(),
  transfers: z.array(z.record(z.unknown())).optional(),
  visa: z.record(z.unknown()).optional(),
  inclusions: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
  termsAndConditions: z.string().optional(),
  gallery: z.array(z.string()).optional(),
  packageCategory: z.string().optional(),
  packageCategories: z.array(z.string()).optional(),
  budgetTierLabels: z.object({ high: z.string().optional(), low: z.string().optional() }).optional(),
  duration: z.string().optional(),
  marketingOverview: z.string().optional(),
  supplements: z.array(z.string()).optional(),
  cancellationPolicy: z.array(z.string()).optional(),
  perChildPrice: z.number().min(0).optional(),
  numberOfRooms: z.number().int().min(0).optional(),
  extraBeds: z.number().int().min(0).optional(),
  extraBedCost: z.number().min(0).optional(),
  cnbCount: z.number().int().min(0).optional(),
  cnbCost: z.number().min(0).optional(),
  roomType: z.string().optional(),
  vehicle: z.string().optional(),
  vehicleCost: z.number().min(0).optional(),
  vehicleCurrency: z.string().optional(),
  vehicleDetails: z.record(z.unknown()).nullable().optional(),
  vehicles: z.array(z.record(z.unknown())).optional(),
  nightStays: z.array(z.record(z.unknown())).optional(),
  budgetTiers: z.boolean().optional(),
  categoryTotals: z.array(z.object({ category: z.string(), total: z.number() })).optional(),
  activities: z.array(z.record(z.unknown())).optional(),
  extraCharges: z.array(z.record(z.unknown())).optional(),
  days: z.array(itineraryDaySchema).optional(),
  pdfTheme: z.string().optional(),
})

export const updateItinerarySchema = createItinerarySchema.partial()

export const listItineraryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(ITINERARY_STATUSES).optional(),
  destination: z.string().optional(),
  search: z.string().optional(),
  assignedTo: z.string().optional(),
  leadId: z.string().optional(),
})

export function parseBody(schema, body) {
  const result = schema.safeParse(body)
  if (!result.success) {
    const message = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
    return { error: message, data: null }
  }
  return { error: null, data: result.data }
}
