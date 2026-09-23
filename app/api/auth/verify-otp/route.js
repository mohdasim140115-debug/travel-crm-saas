import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import { issueSession, publicUser } from '@/lib/session'

export async function POST(request) {
  try {
    await connectDB()
    const { email, otp } = await request.json()

    if (!email || !otp) {
      return Response.json(
        { error: 'Email and OTP are required' },
        { status: 400 }
      )
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() })
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.otp !== otp) {
      return Response.json({ error: 'Invalid OTP' }, { status: 400 })
    }

    if (new Date() > user.otpExpiry) {
      return Response.json({ error: 'OTP expired' }, { status: 400 })
    }

    await User.updateOne(
      { _id: user._id },
      {
        otp: null,
        otpExpiry: null,
        isEmailVerified: true,
      }
    )

    const ua = request.headers.get('user-agent') || ''
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      ''

    user.isEmailVerified = true
    user.otp = null
    user.otpExpiry = null
    await user.save()

    const { accessToken, refreshToken } = await issueSession(user, {
      userAgent: ua,
      ip,
    })

    return Response.json({
      message: 'OTP verified successfully',
      token: accessToken,
      refreshToken,
      user: publicUser(user),
    })
  } catch (error) {
    console.error('Verify OTP error:', error)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
