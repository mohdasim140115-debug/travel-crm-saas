'use client'

import { useCallback, useState } from 'react'

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export function useItineraries() {
  const [itineraries, setItineraries] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchItineraries = useCallback(async (filters = {}) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => {
        if (v != null && v !== '' && v !== 'all') params.set(k, String(v))
      })
      const res = await fetch(`/api/itineraries?${params}`, { headers: getAuthHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load itineraries')
      setItineraries(data.itineraries || [])
      setPagination(data.pagination || { page: 1, limit: 12, total: 0, pages: 1 })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const deleteItinerary = useCallback(async (id) => {
    const res = await fetch(`/api/itineraries/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Delete failed')
    return data
  }, [])

  const duplicateItinerary = useCallback(async (id) => {
    const res = await fetch(`/api/itineraries/${id}/duplicate`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Duplicate failed')
    return data
  }, [])

  return {
    itineraries,
    pagination,
    loading,
    error,
    fetchItineraries,
    deleteItinerary,
    duplicateItinerary,
  }
}

export function useItinerary(id) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchItinerary = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/itineraries/${id}`, { headers: getAuthHeaders(), cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load itinerary')
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  const saveItinerary = useCallback(
    async (payload, itineraryId = id) => {
      const isNew = !itineraryId
      const url = isNew ? '/api/itineraries/create' : `/api/itineraries/${itineraryId}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      return json
    },
    [id]
  )

  return { data, loading, error, fetchItinerary, saveItinerary, setData }
}
