'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import ItineraryCard from '@/components/itinerary/ItineraryCard'
import ItineraryFilters from '@/components/itinerary/ItineraryFilters'
import ItineraryEmpty from '@/components/itinerary/ItineraryEmpty'
import { ItineraryListSkeleton } from '@/components/itinerary/ItinerarySkeleton'
import { useItineraries } from '@/hooks/useItineraries'

// First, last and the pages around the current one, with "…" for the gaps —
// listing every page number overflows sideways once there are dozens.
function pageWindow(current, total) {
  const pages = new Set([1, total, current - 1, current, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…')
    out.push(p)
  })
  return out
}

export default function ItinerariesPage() {
  const router = useRouter()
  const {
    itineraries,
    pagination,
    loading,
    fetchItineraries,
    deleteItinerary,
    duplicateItinerary,
  } = useItineraries()
  const [members, setMembers] = useState([])
  const [pdfBusy, setPdfBusy] = useState(null) // { id, action: 'preview' | 'download' }
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    assignedTo: 'all',
    page: 1,
    limit: 12,
  })

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch('/api/team/members', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setMembers(d.members || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      fetchItineraries(filters)
    }, 300)
    return () => clearTimeout(t)
  }, [filters, fetchItineraries])

  const hasFilters =
    filters.search || filters.status !== 'all' || filters.assignedTo !== 'all'

  const handleExportPdf = async (itinerary) => {
    setPdfBusy({ id: itinerary._id, action: 'download' })
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/itineraries/${itinerary._id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        toast.error('PDF export failed')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${itinerary.customerName || itinerary.tripName || 'itinerary'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded')
    } finally {
      setPdfBusy(null)
    }
  }

  const handlePreview = async (itinerary) => {
    // Open the tab synchronously, inside the click handler — opening it AFTER
    // the await below loses the "user gesture" context and gets silently
    // popup-blocked (the loader would finish but no tab ever appears).
    const previewWindow = window.open('', '_blank')
    setPdfBusy({ id: itinerary._id, action: 'preview' })
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/itineraries/${itinerary._id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        previewWindow?.close()
        toast.error('PDF preview failed')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (previewWindow) {
        previewWindow.location.href = url
      } else {
        // Popup was blocked even for the blank tab — fall back to a direct
        // open, which at least surfaces the browser's "allow popups" prompt.
        window.open(url, '_blank')
      }
    } finally {
      setPdfBusy(null)
    }
  }

  const handleShare = async (itinerary) => {
    const token = itinerary.shareToken
    if (!token) {
      toast.error('Share link not available')
      return
    }
    const url = `${window.location.origin}/itinerary/${token}`
    await navigator.clipboard.writeText(url)
    toast.success('Share link copied to clipboard')
  }

  const handleDelete = async (itinerary) => {
    if (!confirm('Delete this itinerary permanently?')) return
    try {
      await deleteItinerary(itinerary._id)
      toast.success('Itinerary deleted')
      fetchItineraries(filters)
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleDuplicate = async (itinerary) => {
    try {
      const data = await duplicateItinerary(itinerary._id)
      toast.success('Itinerary duplicated')
      router.push(`/dashboard/itineraries/${data.itinerary._id}/edit`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  const setPage = (page) => setFilters((f) => ({ ...f, page }))

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground sm:text-base">
          Create, manage, and share professional travel itineraries
        </p>
        <Button asChild size="sm" className="shrink-0 gap-1.5 shadow-md">
          <Link href="/dashboard/itinerary-builder">
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">Create itinerary</span>
          </Link>
        </Button>
      </div>

      <ItineraryFilters filters={filters} onChange={setFilters} members={members} />

      {loading ? (
        <ItineraryListSkeleton />
      ) : itineraries.length === 0 ? (
        <ItineraryEmpty hasFilters={hasFilters} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {itineraries.map((it) => (
              <ItineraryCard
                key={it._id}
                itinerary={it}
                onEdit={() => router.push(`/dashboard/itinerary-builder?id=${it._id}`)}
                onPreview={handlePreview}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onExportPdf={handleExportPdf}
                onShare={handleShare}
                previewLoading={pdfBusy?.id === it._id && pdfBusy.action === 'preview'}
                downloadLoading={pdfBusy?.id === it._id && pdfBusy.action === 'download'}
              />
            ))}
          </div>

          {pagination.pages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      if (filters.page > 1) setPage(filters.page - 1)
                    }}
                  />
                </PaginationItem>
                {pageWindow(filters.page, pagination.pages).map((p, i) =>
                  p === '…' ? (
                    <PaginationItem key={`gap-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                  <PaginationItem key={p}>
                    <PaginationLink
                      href="#"
                      isActive={p === filters.page}
                      onClick={(e) => {
                        e.preventDefault()
                        setPage(p)
                      }}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                  )
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      if (filters.page < pagination.pages) setPage(filters.page + 1)
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}
    </div>
  )
}
