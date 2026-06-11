import { useCallback, useEffect, useRef, useState } from 'react'
import MapView from './components/MapView'
import DanceParty from './components/DanceParty'
import { generateLoop } from './lib/loop'
import { downloadGpx } from './lib/gpx'
import { geocode } from './lib/geocode'
import { approximateLocation } from './lib/iplocate'
import {
  estimateWalkingMinutes,
  formatDistance,
  formatDuration,
  type LatLng,
} from './lib/geo'
import type { RouteResult } from './lib/brouter'

type Status = 'idle' | 'loading' | 'error'

const NOICE = new URLSearchParams(window.location.search).has('noice')

export default function App() {
  const [start, setStart] = useState<LatLng | null>(null)
  const [distanceKm, setDistanceKm] = useState(5)
  const [preferUnpaved, setPreferUnpaved] = useState(false)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [flyTo, setFlyTo] = useState<{ point: LatLng; zoom: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Once the user has picked a point or searched, the IP-based startup
  // recentering must not yank the map away from where they are working.
  const userNavigatedRef = useRef(false)

  const handleSetStart = useCallback((point: LatLng) => {
    userNavigatedRef.current = true
    setStart(point)
    setRoute(null)
    setStatus('idle')
  }, [])

  useEffect(() => {
    let cancelled = false
    approximateLocation().then((point) => {
      // IP positions are often off by a city or two, so stay at a
      // state-level zoom and let the user narrow down from there.
      if (point && !cancelled && !userNavigatedRef.current) {
        setFlyTo({ point, zoom: 7 })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const generate = async () => {
    if (!start) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus('loading')
    setError('')
    try {
      const result = await generateLoop(
        start,
        distanceKm * 1000,
        preferUnpaved,
        undefined,
        controller.signal,
      )
      setRoute(result.route)
      setStatus('idle')
    } catch (err) {
      if (controller.signal.aborted) return
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Route generation failed.')
    }
  }

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    const query = searchQuery.trim()
    if (!query || searching) return
    setSearching(true)
    setError('')
    try {
      const result = await geocode(query)
      if (result) {
        userNavigatedRef.current = true
        setFlyTo({ point: result.point, zoom: 14 })
      } else {
        setStatus('error')
        setError(`No results for “${query}”.`)
      }
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      setSearching(false)
    }
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setStatus('error')
      setError('Geolocation is not available in this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        handleSetStart(point)
        setFlyTo({ point, zoom: 15 })
      },
      () => {
        setStatus('error')
        setError('Could not determine your location.')
      },
    )
  }

  const walkingMinutes = route ? estimateWalkingMinutes(route.distance, route.ascent) : 0

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>🥾 Walker</h1>
          <p className="tagline">Generate a circular walking route from any starting point.</p>
        </header>

        <form className="search" onSubmit={search}>
          <input
            type="search"
            placeholder="Search a place…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search a place"
          />
          <button type="submit" disabled={searching}>
            {searching ? '…' : 'Go'}
          </button>
        </form>

        <button className="secondary" type="button" onClick={useMyLocation}>
          📍 Use my location
        </button>

        <div className="hint">
          {start
            ? `Start: ${start.lat.toFixed(5)}, ${start.lng.toFixed(5)} — drag the marker or click the map to move it.`
            : 'Click the map to choose your starting point.'}
        </div>

        <label className="field">
          <span>
            Loop distance: <strong>{distanceKm} km</strong>
          </span>
          <input
            type="range"
            min={1}
            max={30}
            step={0.5}
            value={distanceKm}
            onChange={(e) => setDistanceKm(Number(e.target.value))}
          />
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={preferUnpaved}
            onChange={(e) => setPreferUnpaved(e.target.checked)}
          />
          <span>Prefer trails &amp; unpaved paths</span>
        </label>

        <button
          className="primary"
          type="button"
          onClick={generate}
          disabled={!start || status === 'loading'}
        >
          {status === 'loading' ? 'Generating…' : route ? '🔄 Generate another loop' : '✨ Generate loop'}
        </button>

        {status === 'error' && <div className="error">{error}</div>}

        {route && (
          <div className="stats">
            <div className="stat">
              <span className="stat-label">Distance</span>
              <span className="stat-value">{formatDistance(route.distance)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Ascent</span>
              <span className="stat-value">{route.ascent} m</span>
            </div>
            <div className="stat">
              <span className="stat-label">Est. time</span>
              <span className="stat-value">{formatDuration(walkingMinutes)}</span>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => downloadGpx(route, `walker-loop-${distanceKm}km`)}
            >
              ⬇️ Download GPX
            </button>
          </div>
        )}

        <footer>
          Routing by <a href="https://brouter.de" target="_blank" rel="noreferrer">BRouter</a> · data ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>{' '}
          contributors
        </footer>
      </aside>

      <main className="map-wrap">
        <MapView start={start} route={route} flyTo={flyTo} onSetStart={handleSetStart} />
      </main>

      {NOICE && <DanceParty />}
    </div>
  )
}
