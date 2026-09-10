'use client'

import { format } from 'date-fns'
import {
  CalendarDays,
  Copy,
  Download,
  Edit,
  Eye,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plane,
  Share2,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getDurationDays } from '@/utils/itinerary'
import { PDF_THEME_OPTIONS } from '@/modules/itinerary/pdfThemes'

const DEFAULT_THEME = PDF_THEME_OPTIONS[0]
const themeFor = (id) => PDF_THEME_OPTIONS.find((t) => t.id === id) || DEFAULT_THEME

export default function ItineraryCard({
  itinerary,
  onEdit,
  onPreview,
  onDuplicate,
  onDelete,
  onExportPdf,
  onShare,
  previewLoading = false,
  downloadLoading = false,
}) {
  const tripName = itinerary.customerName || itinerary.tripName || itinerary.title
  const theme = themeFor(itinerary.pdfTheme)
  const duration = getDurationDays(itinerary.startDate, itinerary.endDate)
  const travelers = itinerary.numberOfTravelers ?? (itinerary.numberOfAdults || 0) + (itinerary.numberOfChildren || 0)
  const dayCount = itinerary.dayCount ?? itinerary.days?.length ?? duration

  return (
    <article
      className="group overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      style={{ borderColor: `color-mix(in oklab, ${theme.primary} 30%, var(--border))` }}
    >
      {/* Illustrated header — an inline SVG travel motif tinted with this
          itinerary's own PDF theme colour (not a photo), so the list stays
          fast and each card matches the design it was built with. */}
      <div
        className="relative overflow-hidden border-b border-border/60 px-5 pb-5 pt-4"
        style={{
          background: `linear-gradient(135deg, color-mix(in oklab, ${theme.primary} 22%, var(--card)), color-mix(in oklab, ${theme.secondary} 14%, var(--card)))`,
        }}
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full"
          viewBox="0 0 400 64"
          preserveAspectRatio="none"
        >
          <path
            d="M0 64 L60 26 L104 50 L150 14 L210 48 L268 20 L322 44 L400 12 L400 64 Z"
            fill={theme.primary}
            fillOpacity="0.28"
          />
          <path
            d="M0 64 L44 44 L120 60 L188 40 L256 58 L320 42 L400 60 L400 64 Z"
            fill={theme.secondary}
            fillOpacity="0.3"
          />
        </svg>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-3 h-10 w-24"
          viewBox="0 0 96 40"
          fill="none"
        >
          <path
            d="M2 34 C 30 6, 66 6, 94 30"
            stroke={theme.primary}
            strokeOpacity="0.5"
            strokeWidth="2"
            strokeDasharray="3 5"
            strokeLinecap="round"
          />
        </svg>
        <Plane className="absolute right-3 top-2 h-4 w-4 rotate-45" style={{ color: theme.primary }} />

        <div className="relative">
          <span
            className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] font-semibold"
            style={{
              color: theme.primary,
              borderColor: `color-mix(in oklab, ${theme.primary} 35%, transparent)`,
            }}
          >
            <CalendarDays className="h-3 w-3" />
            {dayCount} days
          </span>
          <h3 className="mt-2 line-clamp-1 text-lg font-bold text-foreground">{tripName}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {itinerary.destination}
            {itinerary.country ? `, ${itinerary.country}` : ''}
          </p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium">{dayCount} days</p>
          </div>
          <div>
            <p className="text-muted-foreground">Travelers</p>
            <p className="flex items-center gap-1 font-medium">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              {travelers || 1}
            </p>
          </div>
        </div>

        <div className="space-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <p className="flex flex-wrap items-center gap-x-2">
            <span>Created {itinerary.createdAt ? format(new Date(itinerary.createdAt), 'MMM d, yyyy') : '—'}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>Updated {itinerary.updatedAt ? format(new Date(itinerary.updatedAt), 'MMM d, yyyy') : '—'}</span>
          </p>
          {itinerary.assignedTo && (
            <p className="text-foreground/80">
              Sales: {itinerary.assignedTo.name || itinerary.assignedTo.email}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="min-h-10 flex-1" onClick={() => onEdit?.(itinerary)}>
            <Edit className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-10 flex-1"
            disabled={previewLoading}
            onClick={() => onPreview?.(itinerary)}
          >
            {previewLoading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="mr-1.5 h-3.5 w-3.5" />
            )}
            {previewLoading ? 'Opening…' : 'Preview'}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            title="Download PDF"
            disabled={downloadLoading}
            onClick={() => onExportPdf?.(itinerary)}
          >
            {downloadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onDuplicate?.(itinerary)}>
                <Copy className="mr-2 h-4 w-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onShare?.(itinerary)}>
                <Share2 className="mr-2 h-4 w-4" /> Share
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete?.(itinerary)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  )
}
