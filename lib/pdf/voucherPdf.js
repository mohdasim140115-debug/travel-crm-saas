import { createRequire } from 'module'
import { getThemeColors } from '@/lib/pdf/itineraryPdf'

const require = createRequire(import.meta.url)

function createPdfDocument(options) {
  const PDFDocument = require('pdfkit')
  return new PDFDocument(options)
}

const PAGE = { margin: 40, width: 595.28, height: 841.89 }
// "Ocean Blue" theme — dark blue primary + teal/blue accent, per request.
// Reuses the same theme system as the itinerary PDF so vouchers still share
// a consistent design language with the rest of the app's documents.
const COLORS = getThemeColors('ocean')

function leadName(lead) {
  if (!lead) return 'Guest'
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Guest'
}

function formatDate(d) {
  if (!d) return '-'
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '-'
  }
}

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '-'
  const n = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000)
  return n > 0 ? `${String(n).padStart(2, '0')}-Night stay` : '-'
}

/** Full-width brand header — contact bar + greeting line. Only drawn on the
 * first page; later pages get a slim continuation header instead so the
 * document doesn't repeat the whole intro every time content spills over. */
function drawMainHeader(doc, brand, greeting) {
  const w = PAGE.width - PAGE.margin * 2
  let y = 0
  doc.rect(0, y, PAGE.width, 50).fill(COLORS.red)
  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text((brand.name || 'Travel Agency').toUpperCase(), PAGE.margin, y + 10)
  const contactLine = [brand.email, brand.website].filter(Boolean).join('   ·   ')
  doc.font('Helvetica').fontSize(9.5).text(contactLine, PAGE.margin, y + 30)
  if (brand.phone) {
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(brand.phone, PAGE.width - PAGE.margin - 180, y + 18, { width: 180, align: 'right' })
  }
  y = 50 + 20

  doc
    .fillColor(COLORS.black)
    .font('Helvetica')
    .fontSize(11)
    .text(greeting, PAGE.margin, y, { width: w })
  return doc.y + 14
}

/** Slim repeated header for continuation pages (2nd page onward) — just
 * enough branding to orient the reader, without redrawing the full intro. */
function drawContinuationHeader(doc, brand) {
  doc.rect(0, 0, PAGE.width, 30).fill(COLORS.redDark)
  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .text(`${(brand.name || 'Travel Agency').toUpperCase()} — Voucher (continued)`, PAGE.margin, 9)
  return 30 + 20
}

/** Adds a page when the next block won't fit, redrawing the slim
 * continuation header — call before starting any self-contained block
 * (a section header, a hotel/cab card) so that block is never split across
 * a page boundary mid-way through. */
function ensureSpace(doc, y, needed, brand) {
  const bottom = PAGE.height - PAGE.margin - 36 // leave room for the footer/page number
  if (y + needed <= bottom) return y
  doc.addPage()
  return drawContinuationHeader(doc, brand)
}

function sectionHeader(doc, title, y, w) {
  doc.rect(PAGE.margin, y, w, 26).fill(COLORS.red)
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(11.5).text(title.toUpperCase(), PAGE.margin + 10, y + 7)
  return y + 26 + 12
}

/** Two label:value pairs side by side — halves the vertical space a plain
 * one-per-line list would take, which is most of what keeps a hotel/cab
 * card from spilling across a page break in the first place. */
function pairRow(doc, label1, value1, label2, value2, y, w, x = PAGE.margin) {
  const colW = w / 2 - 8
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.gray).text(label1, x, y, { width: 85 })
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(COLORS.black)
    .text(String(value1 ?? '-'), x + 85, y - 1, { width: colW - 85 })
  if (label2) {
    const x2 = x + colW + 16
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.gray).text(label2, x2, y, { width: 85 })
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(COLORS.black)
      .text(String(value2 ?? '-'), x2 + 85, y - 1, { width: colW - 85 })
  }
  return y + 22
}

function guestDetailsCard(doc, y, w, { lead, booking, itinerary }) {
  const cardH = 140
  doc.roundedRect(PAGE.margin, y, w, cardH, 4).fillAndStroke(COLORS.boxGray, COLORS.grayLight)
  let ry = y + 14
  const cx = PAGE.margin + 14
  const cw = w - 28
  doc.fillColor(COLORS.red).font('Helvetica-Bold').fontSize(9.5).text('GUEST DETAILS', cx, ry)
  ry += 16
  doc
    .fillColor(COLORS.black)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(leadName(lead).toUpperCase(), cx, ry, { width: cw })
  ry += 20
  ry = pairRow(doc, 'No of Pax:', booking.numberOfTravelers ?? '-', 'Contact:', lead?.phone || '-', ry, cw, cx)
  ry = pairRow(
    doc,
    'Adults:',
    itinerary?.numberOfAdults ?? '-',
    'Child/Infant:',
    itinerary?.numberOfChildren ?? '-',
    ry,
    cw,
    cx
  )
  ry = pairRow(
    doc,
    'Arrival Date:',
    formatDate(booking.startDate),
    'Departure Date:',
    formatDate(booking.endDate),
    ry,
    cw,
    cx
  )
  return y + cardH + 16
}

/** Driver Details section — one compact row per confirmed vehicle, listed
 * before the cab confirmation cards so the reader sees who's picking them
 * up and on what vehicle before the route/type breakdown. */
function driverDetailsCard(doc, c, index, y, w, brand) {
  const cardH = 90
  y = ensureSpace(doc, y, cardH, brand)

  doc.roundedRect(PAGE.margin, y, w, cardH, 4).fillAndStroke('#ffffff', COLORS.grayLight)
  doc.rect(PAGE.margin, y, 5, cardH).fill(COLORS.red)

  const cx = PAGE.margin + 16
  const cw = w - 32
  let ry = y + 14
  doc.fillColor(COLORS.red).font('Helvetica-Bold').fontSize(9.5).text(`VEHICLE ${String(index + 1).padStart(2, '0')} — ${c.name || '-'}`, cx, ry, { width: cw })
  ry += 20
  ry = pairRow(doc, 'Driver Name:', c.driverName || '-', 'Driver Contact:', c.driverPhone || '-', ry, cw, cx)
  ry = pairRow(doc, 'Vehicle Number:', c.vehicleNumber || '-', null, null, ry, cw, cx)

  return y + cardH + 14
}

/** One bordered card per hotel — voucher number + hotel name in a solid
 * highlight strip, then the stay details as compact paired rows. */
function hotelCard(doc, h, index, y, w, brand) {
  const hasReturn = Boolean(h.returnCheckIn)
  const cardH = hasReturn ? 232 : 210
  y = ensureSpace(doc, y, cardH, brand)

  doc.roundedRect(PAGE.margin, y, w, cardH, 4).fillAndStroke('#ffffff', COLORS.grayLight)
  doc.rect(PAGE.margin, y, 5, cardH).fill(COLORS.orange)

  doc.rect(PAGE.margin + 5, y, w - 5, 30).fill(COLORS.orange)
  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .text(`VOUCHER NO. ${String(index + 1).padStart(2, '0')}`, PAGE.margin + 16, y + 6)
  doc.font('Helvetica-Bold').fontSize(13).text(h.hotelName || '-', PAGE.margin + 16, y + 16, { width: w - 140 })
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .text('CONFIRMED', PAGE.width - PAGE.margin - 100, y + 11, { width: 90, align: 'right' })

  const cx = PAGE.margin + 16
  const cw = w - 32
  let ry = y + 44
  ry = pairRow(doc, 'Destination:', h.location || '-', 'Room Type:', h.roomType || '-', ry, cw, cx)
  ry = pairRow(doc, 'Check-in:', formatDate(h.checkIn), 'Check-out:', formatDate(h.checkOut), ry, cw, cx)
  if (hasReturn) {
    ry = pairRow(
      doc,
      'Re-check-in:',
      formatDate(h.returnCheckIn),
      'Re-check-out:',
      h.returnCheckOut ? formatDate(h.returnCheckOut) : '-',
      ry,
      cw,
      cx
    )
  }
  ry = pairRow(
    doc,
    'Duration:',
    nightsBetween(h.checkIn, h.checkOut),
    'Meal Plan:',
    h.meals || 'MAP (Breakfast + Dinner)',
    ry,
    cw,
    cx
  )
  ry = pairRow(
    doc,
    'No. of Rooms:',
    h.roomCount ?? '-',
    'Extra Beds:',
    h.extraBeds > 0 ? h.extraBeds : '-',
    ry,
    cw,
    cx
  )
  ry = pairRow(doc, 'No. of CNB:', h.cnbCount > 0 ? h.cnbCount : '-', null, null, ry, cw, cx)

  return y + cardH + 14
}

function cabCard(doc, c, index, y, w, brand) {
  const cardH = 118
  y = ensureSpace(doc, y, cardH, brand)

  doc.roundedRect(PAGE.margin, y, w, cardH, 4).fillAndStroke('#ffffff', COLORS.grayLight)
  doc.rect(PAGE.margin, y, 5, cardH).fill(COLORS.orange)

  doc.rect(PAGE.margin + 5, y, w - 5, 30).fill(COLORS.orange)
  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .text(`VOUCHER NO. ${String(index + 1).padStart(2, '0')}`, PAGE.margin + 16, y + 6)
  doc.font('Helvetica-Bold').fontSize(13).text(c.name || '-', PAGE.margin + 16, y + 16, { width: w - 140 })
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .text('CONFIRMED', PAGE.width - PAGE.margin - 100, y + 11, { width: 90, align: 'right' })

  const cx = PAGE.margin + 16
  const cw = w - 32
  const route = [c.fromLocation, c.toLocation].filter(Boolean).join('  →  ')
  let ry = y + 44
  ry = pairRow(doc, 'Route:', route || '-', 'Vehicle Type:', c.selectedType || '-', ry, cw, cx)

  return y + cardH + 14
}

function signatureFooter(doc, y, w, brand, issuedBy) {
  y = ensureSpace(doc, y, 90, brand)
  doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + w, y).lineWidth(1).strokeColor(COLORS.grayLight).stroke()
  y += 16
  doc.fillColor(COLORS.red).font('Helvetica-Bold').fontSize(13).text('THANK YOU FOR CHOOSING US', PAGE.margin, y)
  y = doc.y + 10
  if (issuedBy?.name) {
    doc.fillColor(COLORS.black).font('Helvetica-Bold').fontSize(11).text(issuedBy.name, PAGE.margin, y)
    y = doc.y + 1
    doc.fillColor(COLORS.gray).font('Helvetica').fontSize(9.5).text(issuedBy.designation || 'Operations Manager', PAGE.margin, y)
    y = doc.y + 1
    const contactBits = [issuedBy.email, issuedBy.phone ? `Mobile: ${issuedBy.phone}` : null].filter(Boolean)
    if (contactBits.length) doc.text(contactBits.join('   ·   '), PAGE.margin, y)
  }
}

function stampPageNumbers(doc, brand) {
  const range = doc.bufferedPageRange()
  if (range.count <= 1) return
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    doc
      .fillColor(COLORS.gray)
      .font('Helvetica')
      .fontSize(8.5)
      .text(`${brand.name || ''}  ·  Page ${i + 1} of ${range.count}`, PAGE.margin, PAGE.height - 26, {
        width: PAGE.width - PAGE.margin * 2,
        align: 'center',
      })
  }
}

/**
 * Hotel confirmation voucher — Guest Details + one card per selected hotel.
 * Every block checks remaining page space before it starts drawing, so a
 * hotel's details are never split across a page boundary.
 */
export async function buildHotelVoucherPdf({ voucher, booking, lead, itinerary, brand, issuedBy }) {
  const w = PAGE.width - PAGE.margin * 2
  const hotels = voucher.details?.hotels || []

  const doc = createPdfDocument({ size: 'A4', margin: 0, bufferPages: true })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  let y = drawMainHeader(
    doc,
    brand,
    `Dear Guest, thank you for choosing "${brand.name || 'our agency'}" — please find your hotel reservation confirmed below.`
  )

  y = guestDetailsCard(doc, y, w, { lead, booking, itinerary })

  y = ensureSpace(doc, y, 26 + 12, brand)
  y = sectionHeader(doc, 'Hotel Confirmation Details', y, w)
  if (!hotels.length) {
    doc.fillColor(COLORS.gray).font('Helvetica').fontSize(11).text('No hotels attached to this voucher.', PAGE.margin, y)
    y = doc.y + 10
  }
  hotels.forEach((h, i) => {
    y = hotelCard(doc, h, i, y, w, brand)
  })

  signatureFooter(doc, y, w, brand, issuedBy)
  stampPageNumbers(doc, brand)

  doc.end()
  return done
}

/**
 * Cab confirmation voucher — same card-based layout as the hotel voucher,
 * just a shorter details block per vehicle.
 */
export async function buildCabVoucherPdf({ voucher, booking, lead, itinerary, brand, issuedBy }) {
  const w = PAGE.width - PAGE.margin * 2
  const cabs = voucher.details?.cabs || []

  const doc = createPdfDocument({ size: 'A4', margin: 0, bufferPages: true })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  let y = drawMainHeader(
    doc,
    brand,
    `Dear Guest, thank you for choosing "${brand.name || 'our agency'}" — please find your cab arrangement confirmed below.`
  )

  y = guestDetailsCard(doc, y, w, { lead, booking, itinerary })

  y = ensureSpace(doc, y, 26 + 12, brand)
  y = sectionHeader(doc, 'Driver Details', y, w)
  if (!cabs.length) {
    doc.fillColor(COLORS.gray).font('Helvetica').fontSize(11).text('No vehicle attached to this voucher.', PAGE.margin, y)
    y = doc.y + 10
  }
  cabs.forEach((c, i) => {
    y = driverDetailsCard(doc, c, i, y, w, brand)
  })

  y = ensureSpace(doc, y, 26 + 12, brand)
  y = sectionHeader(doc, 'Cab Confirmation Details', y, w)
  if (!cabs.length) {
    doc.fillColor(COLORS.gray).font('Helvetica').fontSize(11).text('No vehicle attached to this voucher.', PAGE.margin, y)
    y = doc.y + 10
  }
  cabs.forEach((c, i) => {
    y = cabCard(doc, c, i, y, w, brand)
  })

  signatureFooter(doc, y, w, brand, issuedBy)
  stampPageNumbers(doc, brand)

  doc.end()
  return done
}

/** One card per itinerary day — date, title, the actual plan description
 * (so the driver knows what stops/sightseeing the day involves, not just a
 * heading), route (from→to), and overnight hotel if any. */
function dayPlanRow(doc, day, y, w, brand) {
  const textW = w - 100
  const title = day.title || `Day ${day.dayNumber}`
  const route = (day.transfers || []).map((t) => [t.from, t.to].filter(Boolean).join(' → ')).filter(Boolean).join(', ')
  const activityNames = (day.activities || []).map((a) => a.name).filter(Boolean).join(', ')
  const metaParts = [
    route ? `Route: ${route}` : null,
    day.hotel?.name ? `Overnight: ${day.hotel.name}` : null,
    activityNames ? `Includes: ${activityNames}` : null,
  ].filter(Boolean)
  const meta = metaParts.join('   ·   ')

  const titleH = doc.font('Helvetica-Bold').fontSize(10.5).heightOfString(title, { width: textW })
  const descH = day.description
    ? doc.font('Helvetica').fontSize(9.5).heightOfString(day.description, { width: textW })
    : 0
  const metaH = meta ? doc.font('Helvetica-Bold').fontSize(9).heightOfString(meta, { width: textW }) : 0
  const contentH = titleH + (descH ? descH + 4 : 0) + (metaH ? metaH + 4 : 0)
  const rowH = Math.max(36, contentH + 20)

  y = ensureSpace(doc, y, rowH, brand)

  doc.rect(PAGE.margin, y, w, rowH).fillAndStroke(COLORS.boxGray, COLORS.grayLight)
  doc.fillColor(COLORS.red).font('Helvetica-Bold').fontSize(10).text(`DAY ${day.dayNumber}`, PAGE.margin + 10, y + 10, { width: 60 })
  doc.fillColor(COLORS.gray).font('Helvetica').fontSize(9).text(formatDate(day.date), PAGE.margin + 10, y + 24, { width: 60 })

  let ty = y + 10
  doc.fillColor(COLORS.black).font('Helvetica-Bold').fontSize(10.5).text(title, PAGE.margin + 80, ty, { width: textW })
  ty += titleH + 4
  if (day.description) {
    doc.fillColor(COLORS.black).font('Helvetica').fontSize(9.5).text(day.description, PAGE.margin + 80, ty, { width: textW })
    ty += descH + 4
  }
  if (meta) {
    doc.fillColor(COLORS.gray).font('Helvetica-Bold').fontSize(9).text(meta, PAGE.margin + 80, ty, { width: textW })
  }

  return y + rowH + 6
}

/** Hotel + total nights per stay — the summary a driver needs to know where
 * the group overnights along the route, without the full room/meal detail
 * that goes on the hotel voucher itself. */
function hotelNightsRow(doc, h, y, w) {
  const rowH = 26
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.black).text(h.name || '-', PAGE.margin, y, { width: w - 160 })
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(COLORS.gray)
    .text(h.location || '', PAGE.margin, y + 14, { width: w - 160 })
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(COLORS.red)
    .text(h.nights ? `${h.nights} Night${h.nights > 1 ? 's' : ''}` : '-', PAGE.margin + w - 150, y + 4, {
      width: 150,
      align: 'right',
    })
  doc.moveTo(PAGE.margin, y + rowH).lineTo(PAGE.margin + w, y + rowH).lineWidth(0.5).strokeColor(COLORS.grayLight).stroke()
  return y + rowH + 8
}

/**
 * Driver voucher — the enroute plan handed to the driver: guest details,
 * the day-wise route plan, and which hotel the group overnights at (with
 * how many nights) so the driver knows the schedule without needing the
 * full client-facing itinerary or the hotel/cab vouchers.
 */
export async function buildDriverVoucherPdf({ voucher, booking, lead, itinerary, days, hotelStays, brand, issuedBy }) {
  const w = PAGE.width - PAGE.margin * 2

  const doc = createPdfDocument({ size: 'A4', margin: 0, bufferPages: true })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  let y = drawMainHeader(
    doc,
    brand,
    `Dear Driver, please find the enroute plan for "${leadName(lead)}"'s trip below.`
  )

  y = guestDetailsCard(doc, y, w, { lead, booking, itinerary })

  y = ensureSpace(doc, y, 26 + 12, brand)
  y = sectionHeader(doc, 'Day-wise Enroute Plan', y, w)
  if (!days?.length) {
    doc.fillColor(COLORS.gray).font('Helvetica').fontSize(11).text('No day plan available for this booking.', PAGE.margin, y)
    y = doc.y + 10
  }
  ;(days || []).forEach((day) => {
    y = dayPlanRow(doc, day, y, w, brand)
  })

  y += 6
  y = ensureSpace(doc, y, 26 + 12, brand)
  y = sectionHeader(doc, 'Hotel Stay Summary', y, w)
  if (!hotelStays?.length) {
    doc.fillColor(COLORS.gray).font('Helvetica').fontSize(11).text('No hotels on this itinerary.', PAGE.margin, y)
    y = doc.y + 10
  }
  ;(hotelStays || []).forEach((h) => {
    y = ensureSpace(doc, y, 34, brand)
    y = hotelNightsRow(doc, h, y, w)
  })

  signatureFooter(doc, y, w, brand, issuedBy)
  stampPageNumbers(doc, brand)

  doc.end()
  return done
}
