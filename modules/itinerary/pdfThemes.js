/**
 * Client-safe PDF design metadata for the template-picker modal. Kept
 * separate from lib/pdf/itineraryPdf.js (which pulls in pdfkit/sharp — server
 * only) so this can be imported from client components without bundling
 * server-only Node deps. `id` values here must match PDF_THEMES ids in
 * lib/pdf/itineraryPdf.js for the ones marked `available`.
 */
/** Can this agency export with theme `id`? Premium themes need unlocking. */
export function isPdfThemeUsable(id, unlocked = []) {
  const t = PDF_THEME_OPTIONS.find((o) => o.id === id)
  if (!t || !t.available) return false
  return !t.premium || unlocked.includes(id)
}

export const PREMIUM_PDF_THEMES = () => PDF_THEME_OPTIONS.filter((t) => t.premium && t.available)

export const PDF_THEME_OPTIONS = [
  {
    id: 'classic',
    label: 'Classic Red',
    description: 'Bold red & orange — the signature look.',
    primary: '#E4181F',
    secondary: '#F5921E',
    available: true,
  },
  {
    id: 'ocean',
    label: 'Ocean Blue',
    description: 'Calm blue & teal — a cooler, corporate feel.',
    primary: '#1170B3',
    secondary: '#14B8A6',
    available: true,
  },
  {
    id: 'emerald',
    label: 'Emerald Luxury',
    description: 'Deep green & gold — a premium, upscale feel.',
    primary: '#0F7A4D',
    secondary: '#C9A227',
    available: true,
  },
  {
    id: 'sunset',
    label: 'Sunset Coral',
    description: 'Clean white brochure with coral accents — photo-led and personal.',
    primary: '#E8603C',
    secondary: '#F59E6C',
    available: true,
    // Premium: off for every agency until the platform super admin unlocks it.
    premium: true,
  },
  {
    id: 'midnight',
    label: 'Midnight Slate',
    description: 'Coming soon',
    primary: '#1e293b',
    secondary: '#475569',
    available: false,
  },
  {
    id: 'violet',
    label: 'Royal Violet',
    description: 'Coming soon',
    primary: '#7c3aed',
    secondary: '#a78bfa',
    available: false,
  },
  {
    id: 'rose',
    label: 'Rose Gold',
    description: 'Coming soon',
    primary: '#be185d',
    secondary: '#f472b6',
    available: false,
  },
  {
    id: 'forest',
    label: 'Forest Trail',
    description: 'Coming soon',
    primary: '#166534',
    secondary: '#84cc16',
    available: false,
  },
  {
    id: 'desert',
    label: 'Desert Sand',
    description: 'Coming soon',
    primary: '#92400e',
    secondary: '#d97706',
    available: false,
  },
  {
    id: 'monochrome',
    label: 'Monochrome',
    description: 'Coming soon',
    primary: '#111827',
    secondary: '#6b7280',
    available: false,
  },
]
