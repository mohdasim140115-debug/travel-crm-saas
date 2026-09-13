'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, ChevronLeft, ChevronRight, MapPin, Users, DollarSign, Calendar, Edit, Trash2, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/crm/PageHeader'
import { mutateJson } from '@/lib/mutate'

export default function TourCalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [tours, setTours] = useState([])
  const [showNewTourDialog, setShowNewTourDialog] = useState(false)
  const [viewMode, setViewMode] = useState('month')
  const [tourForm, setTourForm] = useState({
    tourName: '',
    destination: '',
    startDate: '',
    endDate: '',
    price: '',
  })

  const fetchTours = async () => {
    const token = localStorage.getItem('token')
    const [toursRes, bookingsRes] = await Promise.all([
      fetch('/api/tours?limit=50', { headers: { Authorization: `Bearer ${token}` } }),
      // Confirmed bookings already have real trip dates (the itinerary's
      // actual day-wise plan, not a stale field) and a lead/destination —
      // showing them here automatically means Operations doesn't have to
      // re-type every trip as a separate "Tour" just to see it on this
      // calendar.
      fetch('/api/bookings?status=confirmed&limit=500', { headers: { Authorization: `Bearer ${token}` } }),
    ])
    const toursData = await toursRes.json().catch(() => ({}))
    const bookingsData = await bookingsRes.json().catch(() => ({}))

    const manualTours = (toursData.tours || []).map((t) => ({
      id: t._id,
      source: 'tour',
      name: t.tourName,
      startDate: new Date(t.startDate),
      endDate: new Date(t.endDate),
      destination: t.destination,
      participants: t.participants?.length || 0,
      price: t.price,
      status: t.status || 'planning',
      color: 'bg-primary/10',
    }))

    const bookingEvents = (bookingsData.bookings || [])
      .filter((b) => b.startDate && b.endDate)
      .map((b) => {
        const leadName = [b.leadId?.firstName, b.leadId?.lastName].filter(Boolean).join(' ') || 'Guest'
        return {
          id: b._id,
          source: 'booking',
          name: `${leadName} — ${b.itineraryId?.destination || ''}`.trim(),
          startDate: new Date(b.startDate),
          endDate: new Date(b.endDate),
          destination: b.itineraryId?.destination || '',
          participants: b.numberOfTravelers || 0,
          price: b.totalAmount || 0,
          status: 'booked',
          color: 'bg-sky-500/20',
        }
      })

    setTours([...manualTours, ...bookingEvents])
  }

  useEffect(() => {
    fetchTours()
  }, [])

  const createTour = async () => {
    if (!tourForm.tourName.trim() || !tourForm.destination.trim()) {
      toast.error('Tour name and destination are required')
      return
    }
    if (!tourForm.startDate || !tourForm.endDate) {
      toast.error('Select start and end dates')
      return
    }
    try {
      // Was `if (res.ok) { ... }` with no else — a failed create just silently
      // did nothing, leaving the dialog open with no hint why.
      await mutateJson('/api/tours', {
        token: localStorage.getItem('token'),
        body: {
          tourName: tourForm.tourName,
          destination: tourForm.destination,
          startDate: tourForm.startDate,
          endDate: tourForm.endDate,
          price: Number(tourForm.price),
        },
      })
      toast.success('Tour added')
      setShowNewTourDialog(false)
      setTourForm({ tourName: '', destination: '', startDate: '', endDate: '', price: '' })
      fetchTours()
    } catch (e) {
      toast.error(e.message || 'Could not add the tour')
    }
  }

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
  }

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  const getToursForDate = (day) => {
    const dateStr = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    return tours.filter((tour) => {
      return dateStr >= tour.startDate && dateStr <= tour.endDate
    })
  }

  const monthDays = getDaysInMonth(currentMonth)
  const firstDay = getFirstDayOfMonth(currentMonth)
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const calendarDays = Array(firstDay).fill(null).concat(Array.from({ length: monthDays }, (_, i) => i + 1))

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Tour Calendar"
        description="Manage and schedule all your tours"
        actions={
          <Dialog open={showNewTourDialog} onOpenChange={setShowNewTourDialog}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Add Tour
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Tour</DialogTitle>
              <DialogDescription>Add a new tour to the calendar</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Tour Name</label>
                <Input
                  placeholder="e.g., Kashmir Spring Batch"
                  className="mt-2"
                  value={tourForm.tourName}
                  onChange={(e) => setTourForm((f) => ({ ...f, tourName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Destination</label>
                <Input
                  placeholder="e.g., Srinagar"
                  className="mt-2"
                  value={tourForm.destination}
                  onChange={(e) => setTourForm((f) => ({ ...f, destination: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Start Date</label>
                  <Input
                    type="date"
                    className="mt-2"
                    value={tourForm.startDate}
                    onChange={(e) => setTourForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">End Date</label>
                  <Input
                    type="date"
                    className="mt-2"
                    value={tourForm.endDate}
                    onChange={(e) => setTourForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Price Per Person (INR)</label>
                <Input
                  type="number"
                  placeholder="45000"
                  className="mt-2"
                  value={tourForm.price}
                  onChange={(e) => setTourForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <Button className="w-full" onClick={createTour}>Create Tour</Button>
            </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {['month', 'week', 'list'].map((mode) => (
          <Button
            key={mode}
            variant={viewMode === mode ? 'default' : 'outline'}
            onClick={() => setViewMode(mode)}
            className="capitalize"
          >
            {mode} View
          </Button>
        ))}
      </div>

      {/* Calendar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">{monthName}</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={goToPreviousMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToNextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Weekday Headers */}
          <div className="overflow-x-auto pb-2">
          <div className="min-w-[320px]">
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-4">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-center font-semibold text-sm text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {calendarDays.map((day, index) => {
              const dayTours = day ? getToursForDate(day) : []
              const isToday =
                day &&
                day === new Date().getDate() &&
                currentMonth.getMonth() === new Date().getMonth() &&
                currentMonth.getFullYear() === new Date().getFullYear()

              return (
                <div
                  key={index}
                  className={`min-h-16 sm:min-h-24 p-1 sm:p-2 rounded-lg border text-xs sm:text-sm ${
                    day ? 'bg-card' : 'bg-muted'
                  } ${isToday ? 'border-primary border-2' : 'border-border'}`}
                >
                  {day && (
                    <div>
                      <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-primary' : ''}`}>{day}</div>
                      <div className="space-y-1">
                        {dayTours.slice(0, 2).map((tour) => (
                          <div
                            key={tour.id}
                            className={`text-xs p-1 rounded cursor-pointer hover:opacity-80 ${tour.color} truncate`}
                            title={tour.name}
                          >
                            {tour.name}
                          </div>
                        ))}
                        {dayTours.length > 2 && (
                          <div className="text-xs text-muted-foreground px-1">+{dayTours.length - 2} more</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Tours */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Tours &amp; Bookings</CardTitle>
          <CardDescription>{tours.length} scheduled</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tours
              .sort((a, b) => a.startDate - b.startDate)
              .map((tour) => (
                <div
                  key={tour.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-start sm:gap-4"
                >
                  <div className={`hidden h-16 w-1 rounded sm:block ${tour.color}`} />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-foreground">{tour.name}</h4>
                    <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {tour.destination}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {tour.startDate.toLocaleDateString()} - {tour.endDate.toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {tour.participants} persons
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />₹{tour.price.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{tour.status}</Badge>
                    {/* A booking-sourced entry is edited/cancelled from the
                        Bookings page, not here — only manually-added Tours
                        get these controls. */}
                    {tour.source !== 'booking' && (
                      <>
                        <Button variant="ghost" size="sm" className="min-h-10 min-w-10">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="min-h-10 min-w-10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
