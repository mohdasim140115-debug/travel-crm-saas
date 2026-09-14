import connectDB from '@/lib/mongodb'
import Invoice from '@/models/Invoice'
import { authenticate, requireRoles } from '@/lib/middleware'

/** Supports three kinds of update:
 *  - { status: 'sent' } — the draft-to-sent hand-off, no remark needed.
 *  - { edit: { amount, dueDate, invoiceType, remark } } — a correction to an
 *    already-raised invoice. Always snapshots the pre-edit amount/due
 *    date/type into editHistory with a mandatory remark, so the change is
 *    auditable instead of a number silently changing.
 *  - { markPaid: { paymentScreenshot } } — record that the full invoice
 *    amount has actually been received (with optional proof), for an
 *    invoice that was raised as unpaid/partial and only settled afterward. */
export async function PATCH(request, { params }) {
  try {
    const authResult = await authenticate(request)
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status })
    }
    const forbidden = requireRoles(authResult.user.role, ['admin', 'accounts'])
    if (forbidden) {
      return Response.json({ error: forbidden.error }, { status: forbidden.status })
    }

    await connectDB()
    const { id } = await params
    const body = await request.json()

    if (body.edit) {
      const { amount, dueDate, invoiceType, remark } = body.edit
      const subtotal = Number(amount)
      if (!(subtotal > 0) || !dueDate) {
        return Response.json({ error: 'Enter a valid amount and due date' }, { status: 400 })
      }
      if (!String(remark || '').trim()) {
        return Response.json({ error: 'Add a remark explaining this edit' }, { status: 400 })
      }

      const invoice = await Invoice.findOne({ _id: id, teamId: authResult.user.teamId })
      if (!invoice) {
        return Response.json({ error: 'Invoice not found' }, { status: 404 })
      }

      invoice.editHistory.push({
        previousTotalAmount: invoice.totalAmount,
        previousDueDate: invoice.dueDate,
        previousInvoiceType: invoice.invoiceType,
        remark: remark.trim(),
        editedBy: authResult.user.userId,
        editedAt: new Date(),
      })

      const taxAmount = (subtotal * (invoice.taxRate || 0)) / 100
      const totalAmount = subtotal + taxAmount - (invoice.discount || 0)
      invoice.subtotal = subtotal
      invoice.taxAmount = taxAmount
      invoice.totalAmount = totalAmount
      invoice.dueDate = new Date(dueDate)
      if (invoiceType) invoice.invoiceType = invoiceType
      if (invoice.items?.[0]) {
        invoice.items[0].rate = subtotal
        invoice.items[0].amount = subtotal
      }
      const paid = Math.min(invoice.amountPaid || 0, totalAmount)
      invoice.amountPaid = paid
      invoice.paymentStatus = paid <= 0 ? 'unpaid' : paid >= totalAmount ? 'paid' : 'partial'

      await invoice.save()
      return Response.json({ invoice })
    }

    if (body.markPaid) {
      const invoice = await Invoice.findOne({ _id: id, teamId: authResult.user.teamId })
      if (!invoice) {
        return Response.json({ error: 'Invoice not found' }, { status: 404 })
      }
      invoice.amountPaid = invoice.totalAmount
      invoice.paymentStatus = 'paid'
      invoice.paidDate = new Date()
      if (body.markPaid.paymentScreenshot) {
        invoice.paymentScreenshot = body.markPaid.paymentScreenshot
      }
      await invoice.save()
      return Response.json({ invoice })
    }

    if (body.status !== 'sent') {
      return Response.json({ error: 'Unsupported status update' }, { status: 400 })
    }

    const invoice = await Invoice.findOneAndUpdate(
      { _id: id, teamId: authResult.user.teamId, status: 'draft' },
      { status: 'sent', sentDate: new Date() },
      { new: true }
    )
    if (!invoice) {
      return Response.json({ error: 'Invoice not found or already sent' }, { status: 404 })
    }

    return Response.json({ invoice })
  } catch (error) {
    console.error('Update invoice error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
