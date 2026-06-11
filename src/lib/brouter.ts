import type { LatLng } from './geo'

const BROUTER_URL = 'https://brouter.de/brouter'

export interface RouteResult {
  /** Route geometry as [lon, lat, ele?] positions. */
  coordinates: [number, number, number?][]
  /** Total length in meters. */
  distance: number
  /** Filtered total ascent in meters. */
  ascent: number
}

// The hiking profile was renamed from hiking-beta to hiking-mountain in
// BRouter 1.7; keep the old name as a fallback for instances running
// older releases. Both strongly prefer trails, tracks and unpaved paths.
const UNPAVED_PROFILES = ['hiking-mountain', 'hiking-beta', 'trekking']
const PLAIN_PROFILES = ['shortest']

// Remembers which profile the server accepted so fallbacks only cost one
// extra request per session.
const workingProfile: Record<string, string> = {}

async function requestRoute(
  lonlats: string,
  profile: string,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const url = `${BROUTER_URL}?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text.trim() || `Routing request failed (HTTP ${res.status})`)
  }
  const data = await res.json()
  const feature = data?.features?.[0]
  if (!feature?.geometry?.coordinates?.length) {
    throw new Error('No route found between the generated waypoints.')
  }
  return {
    coordinates: feature.geometry.coordinates,
    distance: Number.parseInt(feature.properties?.['track-length'] ?? '0', 10),
    ascent: Number.parseInt(feature.properties?.['filtered ascend'] ?? '0', 10) || 0,
  }
}

/**
 * Fetch a walking route through the given points from the public BRouter
 * instance (worldwide OSM coverage, no API key required).
 */
export async function fetchRoute(
  points: LatLng[],
  preferUnpaved: boolean,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const lonlats = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join('|')
  const candidates = preferUnpaved ? UNPAVED_PROFILES : PLAIN_PROFILES
  const key = preferUnpaved ? 'unpaved' : 'plain'
  const known = workingProfile[key]
  const profiles = known ? [known] : candidates

  let lastError: unknown
  for (const profile of profiles) {
    try {
      const route = await requestRoute(lonlats, profile, signal)
      workingProfile[key] = profile
      return route
    } catch (err) {
      if (signal?.aborted) throw err
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Routing failed.')
}
