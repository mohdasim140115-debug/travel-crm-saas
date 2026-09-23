import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import { generateOTP, generateOTPExpiry } from '@/lib/auth'
import { sendOTPEmail } from '@/lib/email'

export async function POST(request) {
  try {
    await connectDB()
    const { email } = await request.json()

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 })
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() })
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    const otp = generateOTP()
    const otpExpiry = generateOTPExpiry()

    await User.updateOne(
      { _id: user._id },
      { otp, otpExpiry }
    )

    const emailSent = await sendOTPEmail(email, otp)
    if (!emailSent) {
      return Response.json(
        { error: 'Failed to send OTP email' },
        { status: 500 }
      )
    }

    return Response.json({
      message: 'OTP sent successfully',
      email: email,
    })
  } catch (error) {
    console.error('Send OTP error:', error)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
