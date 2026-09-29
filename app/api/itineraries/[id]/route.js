import connectDB from '@/lib/mongodb'
import mongoose from 'mongoose'
import { authenticate } from '@/lib/middleware'
import { parseBody, updateItinerarySchema } from '@/lib/validators/itinerary'
import {
  getItineraryFull,
  updateItinerary,
  deleteItinerary,
  SalesEditLockedError,
} from '@/services/itineraryService'

export async function GET(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid itinerary ID' }, { status: 400 })
    }

    await connectDB()
    const result = await getItineraryFull(id, authResult.user)
    if (!result) {
      return Response.json({ error: 'Itinerary not found' }, { status: 404 })
    }

    return Response.json({ success: true, ...result })
  } catch (error) {
    console.error('Get itinerary error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid itinerary ID' }, { status: 400 })
    }

    await connectDB()
    const body = await request.json()
    const parsed = parseBody(updateItinerarySchema, body)
    if (parsed.error) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }

    let result
    try {
      result = await updateItinerary(id, authResult.user, parsed.data)
    } catch (e) {
      if (e instanceof SalesEditLockedError) {
        return Response.json({ error: e.message }, { status: 403 })
      }
      throw e
    }
    if (!result) {
      return Response.json({ error: 'Itinerary not found' }, { status: 404 })
    }

    return Response.json({
      success: true,
      message: 'Itinerary updated successfully',
      ...result,
    })
  } catch (error) {
    console.error('Update itinerary error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Invalid itinerary ID' }, { status: 400 })
    }

    await connectDB()
    const deleted = await deleteItinerary(id, authResult.user)
    if (!deleted) {
      return Response.json({ error: 'Itinerary not found' }, { status: 404 })
    }

    return Response.json({ success: true, message: 'Itinerary deleted successfully' })
  } catch (error) {
    console.error('Delete itinerary error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
