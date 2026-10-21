'use client'

import { useEffect, useState } from 'react'

/** Premium PDF designs the platform super admin has unlocked for this agency. */
export function useUnlockedPdfThemes() {
  const [unlocked, setUnlocked] = useState([])
  useEffect(() => {
    let cancelled = false
    fetch('/api/team/pdf-themes', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then((r) => (r.ok ? r.json() : { unlocked: [] }))
      .then((d) => !cancelled && setUnlocked(Array.isArray(d.unlocked) ? d.unlocked : []))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return unlocked
}
