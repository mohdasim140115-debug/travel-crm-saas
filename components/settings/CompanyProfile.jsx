'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Upload, X, Building2, QrCode, MapPin, Landmark, Share2, Images, BadgeCheck, Plus } from 'lucide-react'

const token = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null)

const readAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

const dataUrlBytes = (dataUrl) => Math.floor(((dataUrl.split(',')[1] || '').length) * 0.75)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Statuses worth a retry — a proxy/gateway hiccup, not a real rejection.
// Never retry a 4xx like 400/401/403/413 (except 408/429): those mean the
// request itself was rejected and will fail again identically.
const isRetryableStatus = (status) => status === 408 || status === 429 || status >= 500

const SAVE_URL = '/api/settings/company'
const MAX_RETRIES = 2 // up to 3 attempts total
const RETRY_DELAY_MS = 900
const REQUEST_TIMEOUT_MS = 20000

/**
 * PUT the company profile with real error classification instead of a
 * blanket "Network error", plus a bounded retry for genuinely transient
 * failures. Safe to retry: this PUT always writes the full current form as
 * one document update (see getOrCreateCompany in the API route) — retrying
 * re-applies the same snapshot, it never creates a second record or a
 * duplicate charge.
 */
async function putCompanyProfile(payload, attempt = 0) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const retry = async (reason) => {
    clearTimeout(timeoutId)
    if (attempt >= MAX_RETRIES) throw reason
    await sleep(RETRY_DELAY_MS * (attempt + 1))
    return putCompanyProfile(payload, attempt + 1)
  }

  let res
  try {
    res = await fetch(SAVE_URL, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      console.error('[CompanyProfile] Save timed out', { url: SAVE_URL, attempt, timeoutMs: REQUEST_TIMEOUT_MS })
      return retry(new Error('The save request timed out. Check your connection and try again.'))
    }
    // fetch() only ever throws a TypeError for a genuine network-level
    // failure (DNS, connection refused/reset, offline) — an HTTP error
    // status resolves normally instead, with res.ok === false.
    console.error('[CompanyProfile] Network-level failure', { url: SAVE_URL, attempt, message: err.message })
    return retry(new Error('Could not reach the server. Check your internet connection and try again.'))
  }
  clearTimeout(timeoutId)

  const rawText = await res.text()
  let data = null
  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    // A response that isn't JSON at all didn't come from our API route (it
    // always returns Response.json(...)) — it's a reverse proxy's own error
    // page in front of it, most commonly a 413 from a body-size limit (the
    // logo/QR images here are base64 and can run to several hundred KB
    // each) or a 502/504 while the app server was briefly unreachable.
    console.error('[CompanyProfile] Non-JSON response (likely a proxy error page)', {
      url: SAVE_URL, status: res.status, statusText: res.statusText, bodyPreview: rawText.slice(0, 300), attempt,
    })
    if (isRetryableStatus(res.status)) {
      return retry(new Error(`Server error (${res.status}). Please try again.`))
    }
    if (res.status === 413) {
      throw new Error('The logo or QR image is too large for the server to accept. Try a smaller image.')
    }
    throw new Error(`Unexpected server response (${res.status}).`)
  }

  if (!res.ok) {
    console.error('[CompanyProfile] Save rejected', { url: SAVE_URL, status: res.status, error: data?.error, attempt })
    if (isRetryableStatus(res.status)) {
      return retry(new Error(data?.error || `Server error (${res.status}). Please try again.`))
    }
    throw new Error(data?.error || `Save failed (${res.status})`)
  }

  return data
}

/**
 * Take any image file and return a PNG data-URL that fits within maxBytes,
 * shrinking the dimensions until it does. No size limit on the input.
 * Capped well under a typical reverse-proxy body-size limit (nginx's 1 MB
 * default): the logo and QR scanner are both sent together in one save
 * request, so their combined base64 size — not just one image alone — is
 * what has to stay small enough to get through.
 */
async function compressToPng(file, maxBytes = 300 * 1024, startDim = 900) {
  const img = await loadImage(await readAsDataURL(file))
  let scale = Math.min(1, startDim / Math.max(img.width, img.height))
  let out = ''
  for (let i = 0; i < 12; i++) {
    const cw = Math.max(1, Math.round(img.width * scale))
    const ch = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, cw, ch)
    out = canvas.toDataURL('image/png')
    if (dataUrlBytes(out) <= maxBytes) return out
    scale *= 0.8
  }
  return out // best effort after max shrink attempts
}

/**
 * Logo-wall images: any size in → a small JPEG data-URL out (≤ maxBytes,
 * ~10 KB). JPEG on a white background keeps a logo far crisper than PNG at
 * this size, and the PDF draws these on white anyway. Lowers quality first,
 * then the dimensions, until it fits.
 */
async function compressLogoToJpeg(file, maxBytes = 10 * 1024, startDim = 320) {
  const img = await loadImage(await readAsDataURL(file))
  let scale = Math.min(1, startDim / Math.max(img.width, img.height))
  let out = ''
  for (let i = 0; i < 10; i++) {
    const cw = Math.max(1, Math.round(img.width * scale))
    const ch = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cw, ch)
    ctx.drawImage(img, 0, 0, cw, ch)
    for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
      out = canvas.toDataURL('image/jpeg', q)
      if (dataUrlBytes(out) <= maxBytes) return out
    }
    scale *= 0.8
  }
  return out // best effort after max shrink attempts
}

const EMPTY = {
  name: '',
  logo: '',
  website: '',
  phone: '',
  email: '',
  metaLink: '',
  address: '',
  address2: '',
  scanner1: '',
  tagline: '',
  socials: { facebook: '', instagram: '', google: '', youtube: '' },
  bankDetails: { bankName: '', accountName: '', accountNumber: '', ifscCode: '' },
}

const LOGOS_URL = '/api/settings/company/logos'

const SOCIAL_FIELDS = [
  { key: 'facebook', label: 'Facebook page', placeholder: 'https://facebook.com/yourpage' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
  { key: 'google', label: 'Google reviews / Maps', placeholder: 'https://g.page/r/...' },
  { key: 'youtube', label: 'YouTube channel', placeholder: 'https://youtube.com/@yourchannel' },
]

export function CompanyProfile() {
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)
  const scanner1Ref = useRef(null)
  const associateRef = useRef(null)
  const registeredRef = useRef(null)
  // Saved instantly through their own endpoint (one image per request), not
  // with the main Save button — a wall of logos would overflow one request.
  const [associateLogos, setAssociateLogos] = useState([])
  const [registeredLogo, setRegisteredLogo] = useState('')
  const [logoBusy, setLogoBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/settings/company', {
          headers: { Authorization: `Bearer ${token()}` },
        })
        const data = await res.json()
        if (res.ok && data.company) {
          const c = data.company
          setForm({
            name: c.name || '',
            logo: c.logo || '',
            website: c.website || '',
            phone: c.phone || '',
            email: c.email || '',
            metaLink: c.metaLink || '',
            address: c.address || '',
            address2: c.address2 || '',
            scanner1: c.scanner1 || '',
            tagline: c.tagline || '',
            socials: {
              facebook: c.socials?.facebook || '',
              instagram: c.socials?.instagram || '',
              google: c.socials?.google || '',
              youtube: c.socials?.youtube || '',
            },
            bankDetails: {
              bankName: c.bankDetails?.bankName || '',
              accountName: c.bankDetails?.accountName || '',
              accountNumber: c.bankDetails?.accountNumber || '',
              ifscCode: c.bankDetails?.ifscCode || '',
            },
          })
          setAssociateLogos(c.associateLogos || [])
          setRegisteredLogo(c.registeredLogo || '')
        } else {
          toast.error(data.error || 'Failed to load company')
        }
      } catch {
        toast.error('Network error')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }))
  const setBank = (patch) =>
    setForm((prev) => ({ ...prev, bankDetails: { ...prev.bankDetails, ...patch } }))

  const onImageFile = async (e, field) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      e.target.value = ''
      return
    }
    try {
      // Any size in → auto-shrunk PNG under 300 KB out.
      const dataUrl = await compressToPng(file)
      set({ [field]: dataUrl })
    } catch {
      toast.error('Could not process this image')
    }
    e.target.value = '' // allow re-selecting the same file
  }

  const setSocial = (patch) => setForm((prev) => ({ ...prev, socials: { ...prev.socials, ...patch } }))

  const logoRequest = async (method, body, query = '') => {
    const res = await fetch(`${LOGOS_URL}${query}`, {
      method,
      headers: { Authorization: `Bearer ${token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Could not save the logo')
    setAssociateLogos(data.associateLogos || [])
    setRegisteredLogo(data.registeredLogo || '')
  }

  const onAssociateFiles = async (e) => {
    const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'))
    e.target.value = ''
    if (!files.length) return
    setLogoBusy(true)
    try {
      for (const file of files) {
        const url = await compressLogoToJpeg(file)
        await logoRequest('POST', { kind: 'associate', url })
      }
      toast.success(files.length > 1 ? `${files.length} logos added` : 'Logo added')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLogoBusy(false)
    }
  }

  const onRegisteredFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    setLogoBusy(true)
    try {
      const url = await compressLogoToJpeg(file)
      await logoRequest('POST', { kind: 'registered', url })
      toast.success('Registered-with logo saved')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLogoBusy(false)
    }
  }

  const removeLogo = async (kind, id) => {
    setLogoBusy(true)
    try {
      await logoRequest('DELETE', null, `?kind=${kind}${id ? `&id=${id}` : ''}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLogoBusy(false)
    }
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Company name is required')
      return
    }
    setSaving(true)
    try {
      await putCompanyProfile(form)
      toast.success('Company profile saved')
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const renderScanner = (field, inputRef, label) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-start gap-3">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {form[field] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form[field]} alt={label} className="h-full w-full object-contain" />
          ) : (
            <QrCode className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onImageFile(e, field)}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> Upload
            </Button>
            {form[field] && (
              <Button size="sm" variant="ghost" onClick={() => set({ [field]: '' })}>
                <X className="mr-1 h-4 w-4" /> Remove
              </Button>
            )}
          </div>
          <Input
            value={form[field]?.startsWith('data:') ? '' : form[field]}
            onChange={(e) => set({ [field]: e.target.value })}
            placeholder="or paste QR image URL"
            className="max-w-xs"
          />
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Company Profile</h3>
        <p className="text-sm text-muted-foreground">
          Your agency’s branding — this logo and these details appear on every itinerary and PDF.
        </p>
      </div>

      {/* Logo */}
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card/60 p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {form.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logo} alt="Logo" className="h-full w-full object-contain" />
          ) : (
            <Building2 className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="w-full min-w-0 flex-1 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onImageFile(e, 'logo')}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> Upload logo
            </Button>
            {form.logo && (
              <Button size="sm" variant="ghost" onClick={() => set({ logo: '' })}>
                <X className="mr-1 h-4 w-4" /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Any image — auto-resized to PNG under 300 KB. Or paste a URL below.
          </p>
          <Input
            value={form.logo?.startsWith('data:') ? '' : form.logo}
            onChange={(e) => set({ logo: e.target.value })}
            placeholder="https://your-logo-url.png"
            className="w-full sm:max-w-sm"
          />
        </div>
      </div>

      {/* Basic details */}
      <div className="space-y-3 rounded-xl border bg-card/60 p-3 shadow-sm sm:p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><span className="h-4 w-1 rounded-full bg-primary" /><Building2 className="h-4 w-4 text-primary" /> Basic details</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Company name *</Label>
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Website</Label>
          <Input value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="www.example.com" />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+91 ..." />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="hello@example.com" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Meta link (Facebook / Instagram)</Label>
          <Input
            value={form.metaLink}
            onChange={(e) => set({ metaLink: e.target.value })}
            placeholder="https://facebook.com/yourpage"
          />
        </div>
      </div>

      </div>

      <div className="space-y-3 rounded-xl border bg-card/60 p-3 shadow-sm sm:p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><span className="h-4 w-1 rounded-full bg-primary" /><MapPin className="h-4 w-4 text-primary" /> Office addresses</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Address 1</Label>
          <Textarea
            value={form.address}
            onChange={(e) => set({ address: e.target.value })}
            placeholder="Primary office address shown on itineraries"
            className="min-h-[70px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Address 2 (optional)</Label>
          <Textarea
            value={form.address2}
            onChange={(e) => set({ address2: e.target.value })}
            placeholder="Second office / branch address"
            className="min-h-[70px]"
          />
        </div>
      </div>

      </div>

      {/* PDF branding: tagline + social links */}
      <div className="space-y-3 rounded-xl border bg-card/60 p-3 shadow-sm sm:p-4">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold"><span className="h-4 w-1 rounded-full bg-primary" /><Share2 className="h-4 w-4 text-primary" /> Tagline &amp; social links</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Shown under the cover photo of the Sunset Coral PDF as clickable icons. WhatsApp uses your phone number above.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tagline</Label>
            <Input value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="e.g. The Soul of Kashmir" />
          </div>
          {SOCIAL_FIELDS.map((s) => (
            <div key={s.key} className="space-y-1.5">
              <Label>{s.label}</Label>
              <Input value={form.socials[s.key]} onChange={(e) => setSocial({ [s.key]: e.target.value })} placeholder={s.placeholder} />
            </div>
          ))}
        </div>
      </div>

      {/* Associate hotels + registered-with logos (saved instantly) */}
      <div className="space-y-4 rounded-xl border bg-card/60 p-3 shadow-sm sm:p-4">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold"><span className="h-4 w-1 rounded-full bg-primary" /><Images className="h-4 w-4 text-primary" /> Associate hotels &amp; registered with</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Logos shown under the cover photo of the Sunset Coral PDF. These save instantly — no need to press Save.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Our associate hotels &amp; houseboats ({associateLogos.length})</Label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {associateLogos.map((l) => (
              <div key={l._id} className="relative flex h-16 items-center justify-center rounded-lg border bg-white p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.url} alt="Associate logo" className="h-full w-full object-contain" />
                <button
                  type="button"
                  onClick={() => removeLogo('associate', l._id)}
                  disabled={logoBusy}
                  className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow"
                  aria-label="Remove logo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => associateRef.current?.click()}
              disabled={logoBusy}
              className="flex h-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-secondary"
            >
              {logoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add logos
            </button>
          </div>
          <input ref={associateRef} type="file" accept="image/*" multiple className="hidden" onChange={onAssociateFiles} />
          <p className="text-xs text-muted-foreground">You can pick several images at once — any size, each is auto-compressed to about 10 KB.</p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-primary" /> Registered with (e.g. tourism department logo)</Label>
          <div className="flex items-center gap-3">
            <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white p-1.5">
              {registeredLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={registeredLogo} alt="Registered with" className="h-full w-full object-contain" />
              ) : (
                <BadgeCheck className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={logoBusy} onClick={() => registeredRef.current?.click()}>
                <Upload className="mr-1 h-4 w-4" /> Upload
              </Button>
              {registeredLogo && (
                <Button size="sm" variant="ghost" disabled={logoBusy} onClick={() => removeLogo('registered')}>
                  <X className="mr-1 h-4 w-4" /> Remove
                </Button>
              )}
            </div>
            <input ref={registeredRef} type="file" accept="image/*" className="hidden" onChange={onRegisteredFile} />
          </div>
        </div>
      </div>

      {/* Bank details */}
      <div className="rounded-xl border bg-card/60 p-3 shadow-sm sm:p-4">
        <div className="mb-3"><h4 className="flex items-center gap-2 text-sm font-semibold"><span className="h-4 w-1 rounded-full bg-primary" /><Landmark className="h-4 w-4 text-primary" /> Bank details</h4><p className="mt-1 text-xs text-muted-foreground">Shown on the itinerary for client payments.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Bank name</Label>
            <Input value={form.bankDetails.bankName} onChange={(e) => setBank({ bankName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Account name</Label>
            <Input value={form.bankDetails.accountName} onChange={(e) => setBank({ accountName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Account number</Label>
            <Input value={form.bankDetails.accountNumber} onChange={(e) => setBank({ accountNumber: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>IFSC code</Label>
            <Input value={form.bankDetails.ifscCode} onChange={(e) => setBank({ ifscCode: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Payment scanner (QR code) */}
      <div className="rounded-xl border bg-card/60 p-3 shadow-sm sm:p-4">
        <div className="mb-1"><h4 className="flex items-center gap-2 text-sm font-semibold"><span className="h-4 w-1 rounded-full bg-primary" /><QrCode className="h-4 w-4 text-primary" /> Payment scanner (QR)</h4></div>
        <p className="mb-3 text-xs text-muted-foreground">
          Your payment QR code (e.g. UPI / GPay) shown on the itinerary.
        </p>
        {renderScanner('scanner1', scanner1Ref, 'Scanner')}
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save company profile
        </Button>
      </div>
    </div>
  )
}
