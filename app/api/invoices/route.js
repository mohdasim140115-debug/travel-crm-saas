import connectDB from '@/lib/mongodb'
import Invoice from '@/models/Invoice'
import { authenticate, requireRoles } from '@/lib/middleware'

function generateInvoiceNumber(teamId) {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0')
  return `INV-${year}${month}-${random}`
}

export async function GET(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const forbidden = requireRoles(authResult.user.role, ['admin', 'accounts', 'superadmin'])
    if (forbidden) {
      return Response.json({ error: forbidden.error }, { status: forbidden.status })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page')) || 1
    const limit = parseInt(searchParams.get('limit')) || 10
    const status = searchParams.get('status')
    const paymentStatus = searchParams.get('paymentStatus')
    const invoiceType = searchParams.get('invoiceType')

    const query = { teamId: authResult.user.teamId }
    if (status) query.status = status
    if (paymentStatus) query.paymentStatus = paymentStatus
    if (invoiceType) query.invoiceType = invoiceType

    const [totalInvoices, invoices] = await Promise.all([
      Invoice.countDocuments(query),
      Invoice.find(query)
        .populate('bookingId', 'bookingNumber totalAmount status')
        .populate('leadId', 'name email')
        .populate('createdBy', 'name email')
        .sort({ invoiceDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ])

    return Response.json({
      success: true,
      invoices,
      pagination: {
        page,
        limit,
        total: totalInvoices,
        pages: Math.ceil(totalInvoices / limit),
      },
    })
  } catch (error) {
    console.error('Get invoices error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }

    const forbidden = requireRoles(authResult.user.role, ['admin', 'accounts'])
    if (forbidden) {
      return Response.json({ error: 'Only accounts team can create invoices' }, { status: forbidden.status })
    }

    await connectDB()

    const body = await request.json()
    const {
      leadId,
      bookingId,
      clientName,
      clientEmail,
      clientPhone,
      items,
      subtotal,
      taxRate = 0,
      discount = 0,
      dueDate,
      invoiceType = 'proforma',
      amountPaid = 0,
      paymentScreenshot = '',
    } = body

    if (!clientName || !items || !subtotal || !dueDate) {
      return Response.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const taxAmount = (subtotal * taxRate) / 100
    const totalAmount = subtotal + taxAmount - discount
    const paid = Math.min(Number(amountPaid) || 0, totalAmount)
    const paymentStatus = paid <= 0 ? 'unpaid' : paid >= totalAmount ? 'paid' : 'partial'

    const invoice = await Invoice.create({
      teamId: authResult.user.teamId,
      leadId,
      bookingId,
      invoiceNumber: generateInvoiceNumber(authResult.user.teamId),
      invoiceType,
      clientName,
      clientEmail,
      clientPhone,
      items,
      subtotal,
      taxRate,
      taxAmount,
      discount,
      totalAmount,
      amountPaid: paid,
      paymentScreenshot: paymentScreenshot || '',
      paymentStatus,
      dueDate: new Date(dueDate),
      createdBy: authResult.user.userId,
    })

    return Response.json(
      {
        message: 'Invoice created successfully',
        invoice,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create invoice error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
