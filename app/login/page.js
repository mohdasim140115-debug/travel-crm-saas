'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { AlertCircle } from 'lucide-react'
import { getDashboardRoute } from '@/lib/permissions-client'

export default function LoginPage() {
  const router = useRouter()
  const gsiDivRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  const renderGoogleButton = () => {
    if (!googleClientId || typeof window === 'undefined' || !window.google?.accounts?.id) {
      return
    }
    const el = gsiDivRef.current
    if (!el) return
    el.innerHTML = ''
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (res) => {
        if (!res?.credential) return
        setLoading(true)
        setError('')
        try {
          const response = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: res.credential }),
          })
          const data = await response.json()
          if (!response.ok) {
            setError(data.error || 'Google sign-in failed')
            return
          }
          localStorage.setItem('token', data.token)
          localStorage.setItem('refreshToken', data.refreshToken)
          localStorage.setItem('user', JSON.stringify(data.user))
          router.push(getDashboardRoute(data.user?.role))
        } catch (err) {
          setError('Google sign-in error')
          console.error(err)
        } finally {
          setLoading(false)
        }
      },
    })
    window.google.accounts.id.renderButton(el, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      width: Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 80 : 320),
    })
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Login failed')
        return
      }

      localStorage.setItem('token', data.token)
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken)
      }
      localStorage.setItem('user', JSON.stringify(data.user))

      router.push(getDashboardRoute(data.user?.role))
    } catch (err) {
      setError('An error occurred. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-primary/15 flex items-center justify-center p-4">
      {googleClientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => setTimeout(renderGoogleButton, 0)}
        />
      )}

      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold sm:text-3xl">Sign In</h1>
          <p className="text-muted-foreground mt-2">Workspace access for your travel brands</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {googleClientId && (
          <div className="mb-6 space-y-3">
            <p className="text-xs text-muted-foreground text-center">Continue with Google</p>
            <div ref={gsiDivRef} className="flex justify-center min-h-[44px]" />
            <div className="relative text-center text-xs text-muted-foreground">
              <span className="bg-card px-2 relative z-[1]">or email</span>
              <div className="absolute inset-x-0 top-1/2 h-px bg-border -z-0" aria-hidden />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Email Address</label>
            <Input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <PasswordInput
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter password"
              required
              disabled={loading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Admin can mint inbound API keys after login (Standard+ plans enable ingest).
        </p>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/?demo=1" className="text-primary hover:underline font-medium">
            Book a demo
          </Link>
        </p>
      </Card>
    </div>
  )
}
