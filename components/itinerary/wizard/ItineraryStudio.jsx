'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import WizardHeader from './WizardHeader'
import WizardStepper from './WizardStepper'
import WizardFooter from './WizardFooter'
import PdfTemplateModal from './PdfTemplateModal'
import StepDetails from './steps/StepDetails'
import StepVisuals from './steps/StepVisuals'
import StepPlan from './steps/StepPlan'
import StepHotels from './steps/StepHotels'
import StepCosting, { tripNightsFromForm } from './steps/StepCosting'
import StepInclusions from './steps/StepInclusions'
import StepTerms from './steps/StepTerms'
import {
  DEFAULT_STUDIO_FORM,
  STUDIO_STEPS,
  itineraryToStudioForm,
  studioFormToPayload,
  getRoomLines,
  BUDGET_TIERS,
} from '@/modules/itinerary/studio'
import { useItinerary } from '@/hooks/useItineraries'
import { DURATION_PRESETS } from '@/lib/data/masterRepository'
import { DEFAULT_DAY } from '@/modules/itinerary/constants'

const STEP_COMPONENTS = {
  1: StepDetails,
  2: StepVisuals,
  3: StepPlan,
  4: StepHotels,
  5: StepCosting,
  6: StepInclusions,
  7: StepTerms,
}

export default function ItineraryStudio({ itineraryId = null, initialData = null, leadPrefill = null }) {
  const router = useRouter()
  const { saveItinerary } = useItinerary(itineraryId)
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(DEFAULT_STUDIO_FORM)
  const [savedId, setSavedId] = useState(itineraryId)
  const [saving, setSaving] = useState(false)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  // Set the moment Continue is blocked on a blank day, so StepPlan can
  // highlight exactly which day/field is still empty — clears itself the
  // instant the day is filled in (see StepPlan's live re-check).
  const [showPlanErrors, setShowPlanErrors] = useState(false)

  // Continuing to the next step used to leave the page scrolled wherever the
  // previous step's Continue button happened to be — the new step then
  // rendered starting mid-scroll instead of from its own top. The dashboard
  // shell scrolls its own <main>, not the window, so both need resetting.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'auto' })
  }, [step])

  // A single floating button, on every step, that jumps to the bottom of
  // this (often long) step and back — instead of hand-scrolling through a
  // whole day plan or costing form just to reach Continue and back up again.
  // Which element actually scrolls varies by screen size (the dashboard
  // shell's own <main>, or the window) — whichever one genuinely overflows
  // is the real one; picking blindly made this always read as "at bottom".
  const [atBottom, setAtBottom] = useState(false)

  const getScroller = useCallback(() => {
    const mainEl = document.querySelector('main')
    if (mainEl && mainEl.scrollHeight > mainEl.clientHeight + 10) return mainEl
    return window
  }, [])

  const scrollMetrics = useCallback((scroller) => {
    if (scroller === window) {
      return { top: window.scrollY, height: document.documentElement.scrollHeight, view: window.innerHeight }
    }
    return { top: scroller.scrollTop, height: scroller.scrollHeight, view: scroller.clientHeight }
  }, [])

  useEffect(() => {
    const mainEl = document.querySelector('main')
    const onScroll = () => {
      const { top, height, view } = scrollMetrics(getScroller())
      setAtBottom(top + view >= height - 40)
    }
    onScroll()
    // Content (images, async-loaded options) can grow the page after the
    // first paint, changing which element is the real scroller — recheck
    // shortly after mount/step change, not just on scroll events.
    const t = setTimeout(onScroll, 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    mainEl?.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(t)
      window.removeEventListener('scroll', onScroll)
      mainEl?.removeEventListener('scroll', onScroll)
    }
  }, [step, getScroller, scrollMetrics])

  const jumpScroll = () => {
    const scroller = getScroller()
    const { height } = scrollMetrics(scroller)
    scroller.scrollTo({ top: atBottom ? 0 : height, behavior: 'smooth' })
  }

  useEffect(() => {
    if (initialData?.itinerary) {
      setForm(itineraryToStudioForm(initialData))
    } else if (leadPrefill) {
      setForm((prev) => ({ ...prev, ...leadPrefill }))
    }
  }, [initialData, leadPrefill])

  const update = useCallback((patch) => {
    setForm((prev) => ({ ...prev, ...patch }))
  }, [])

  // Keep the day-wise plan in exact sync with the selected trip duration —
  // pick "4 Nights / 5 Days" and there should be exactly 5 day cards, no
  // more, no less.
  useEffect(() => {
    const preset = DURATION_PRESETS.find((p) => p.value === form.duration)
    const targetCount = preset?.days
    if (!targetCount) return
    setForm((prev) => {
      const current = prev.days || []
      if (current.length === targetCount) return prev
      if (current.length > targetCount) {
        return { ...prev, days: current.slice(0, targetCount) }
      }
      const additions = []
      for (let i = current.length; i < targetCount; i++) {
        additions.push({
          ...DEFAULT_DAY,
          dayNumber: i + 1,
          sortOrder: i,
          title: i === 0 ? 'ARRIVAL' : `Day ${i + 1}`,
        })
      }
      return { ...prev, days: [...current, ...additions] }
    })
  }, [form.duration])

  // `includeCosting` also runs the Costing checks no matter which step the
  // agent is on — used when saving, so a package can't be saved from an
  // earlier step while a night's cost or the extra-bed/CNB rate is missing.
  const validateStep = (includeCosting = false) => {
    if (step === 1) {
      if (!form.leadId) {
        toast.error('Select a client from the dropdown list')
        return false
      }
      if (!form.destination?.trim()) {
        toast.error('Destination is required')
        return false
      }
      if (!form.packageCategory?.trim()) {
        toast.error('Package category is required')
        return false
      }
      if (!form.duration?.trim()) {
        toast.error('Duration is required')
        return false
      }
      if (form.duration === 'custom' && !form.customDuration?.trim()) {
        toast.error('Enter the custom duration')
        return false
      }
      // The destination doubles as the package name — there's no separate
      // "package name" field in the UI, so keep tripName in sync with it.
      if (form.tripName !== form.destination) {
        setForm((prev) => ({ ...prev, tripName: prev.destination }))
      }
    }
    if (step === 3) {
      const days = form.days || []
      const blankIndex = days.findIndex(
        (d) => !d.title?.trim() || !d.description?.trim()
      )
      if (blankIndex !== -1) {
        setShowPlanErrors(true)
        toast.error(`Fill in Day ${blankIndex + 1}'s activity title and description before continuing`)
        return false
      }
      setShowPlanErrors(false)
    }
    if (step === 5 || includeCosting) {
      const stays = form.nightStays || []
      for (const stay of stays) {
        const lines = stay.roomLines || []
        const bad = lines.find(
          (l) => !l.roomType || !(Number(l.pricePerNight) > 0) || !(Number(l.roomCount) > 0) || !(Number(l.nights) > 0)
        )
        if (bad) {
          toast.error(
            `Fill in Room Type, Price/night, No. of Rooms and Nights for ${stay.hotelName || 'a hotel'} before continuing`
          )
          return false
        }
      }

      // Extra bed / CNB counts were entered but a stay has no rate for them —
      // those charges would silently count as ₹0 in the package total.
      const extraBedsN = Number(form.extraBeds) || 0
      const cnbN = Number(form.cnbCount) || 0
      for (const stay of stays) {
        if (extraBedsN > 0 && !(Number(stay.extraBedCharge) > 0)) {
          toast.error(`Extra bed rate is missing for ${stay.hotelName || 'a hotel'} — fill it in Costing before saving`)
          return false
        }
        if (cnbN > 0 && !(Number(stay.cnbPrice) > 0)) {
          toast.error(`CNB rate is missing for ${stay.hotelName || 'a hotel'} — fill it in Costing before saving`)
          return false
        }
      }

      // Whatever nights the trip's Duration says (e.g. "6N/7D" = 6 nights)
      // is exactly what the hotel stays should add up to — short or over,
      // either way the itinerary doesn't actually cover the trip.
      const tripNights = tripNightsFromForm(form)
      if (tripNights != null && form.budgetTiers) {
        for (const tier of BUDGET_TIERS) {
          const tierStays = stays.filter((s) => s.category === tier.key)
          if (tierStays.length === 0) continue
          const booked = tierStays.reduce(
            (sum, s) => sum + Math.max(0, ...getRoomLines(s).map((l) => Number(l.nights) || 0)),
            0
          )
          if (booked !== tripNights) {
            toast.error(
              `${tier.label}'s hotel nights (${booked}) don't add up to the trip's ${tripNights} nights`
            )
            return false
          }
        }
      } else if (tripNights != null && stays.length > 0) {
        const booked = stays.reduce(
          (sum, s) => sum + Math.max(0, ...getRoomLines(s).map((l) => Number(l.nights) || 0)),
          0
        )
        if (booked !== tripNights) {
          toast.error(`Hotel nights (${booked}) don't add up to the trip's ${tripNights} nights`)
          return false
        }
      }
    }
    return true
  }

  const persist = async (theme = null) => {
    if (theme && !validateStep(true)) return null
    setSaving(true)
    try {
      const payload = studioFormToPayload(form)
      if (theme) payload.pdfTheme = theme
      const result = await saveItinerary(payload, savedId)
      const id = result.itinerary._id
      setSavedId(id)
      if (!itineraryId) {
        window.history.replaceState(null, '', `/dashboard/itinerary-builder?id=${id}`)
      }
      if (theme) {
        const token = localStorage.getItem('token')
        const res = await fetch(`/api/itineraries/${id}/pdf?theme=${encodeURIComponent(theme)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('PDF generation failed')
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${payload.customerName || payload.tripName || 'itinerary'}.pdf`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Itinerary saved and PDF downloaded')
        setTemplateModalOpen(false)
        router.push('/dashboard/itineraries')
      } else {
        toast.success('Progress saved')
      }
      return id
    } catch (e) {
      toast.error(e.message || 'Save failed')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleNext = async () => {
    if (!validateStep()) return
    if (step >= STUDIO_STEPS.length) {
      setTemplateModalOpen(true)
      return
    }
    setStep((s) => s + 1)
  }

  const handleCommit = () => {
    if (!validateStep(true)) return
    setTemplateModalOpen(true)
  }

  const StepComponent = STEP_COMPONENTS[step]

  return (
    <div className="space-y-6 pb-40 sm:pb-0">
      <WizardHeader
        tripName={form.customerName || form.tripName || 'Unnamed trip'}
        step={step}
        totalSteps={STUDIO_STEPS.length}
        onCancel={() => router.push('/dashboard/itineraries')}
        onCommit={handleCommit}
        saving={saving}
      />
      <WizardStepper
        currentStep={step}
        // Editing a saved itinerary: jump straight to whichever section needs
        // the change. A brand-new one can still only revisit steps it has
        // already been through (later steps aren't filled in yet).
        onStepClick={(id) => setStep(id)}
        canJumpTo={(id) => Boolean(savedId || itineraryId) || id < step}
      />
      <div className="-mx-3 sm:mx-0 max-sm:[&_[data-slot=card-content]]:px-3 max-sm:[&_[data-slot=card-header]]:px-3">
        {StepComponent && <StepComponent form={form} update={update} showErrors={showPlanErrors} />}
      </div>
      <WizardFooter
        step={step}
        totalSteps={STUDIO_STEPS.length}
        onBack={() => setStep((s) => Math.max(1, s - 1))}
        onNext={handleNext}
        nextLabel={step >= STUDIO_STEPS.length ? 'Finalize & export' : 'Continue'}
        saving={saving}
      />
      <PdfTemplateModal
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
        onConfirm={(theme) => persist(theme)}
        generating={saving}
        form={form}
        update={update}
      />
      <Button
        type="button"
        size="icon"
        onClick={jumpScroll}
        title={atBottom ? 'Scroll to top' : 'Scroll to bottom'}
        className="fixed bottom-40 right-4 z-40 h-11 w-11 rounded-full shadow-lg sm:bottom-6 sm:right-6"
      >
        {atBottom ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </Button>
    </div>
  )
}
