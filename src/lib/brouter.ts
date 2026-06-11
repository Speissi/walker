import { haversineMeters, type LatLng } from './geo'

const BROUTER_URL = 'https://brouter.de/brouter'

type Position = [number, number, number?]

export interface RouteResult {
  /** Route geometry as [lon, lat, ele?] positions. */
  coordinates: Position[]
  /** Total length in meters. */
  distance: number
  /** Filtered total ascent in meters. */
  ascent: number
}

const samePoint = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1]

/**
 * Remove out-and-back spurs: when a generated waypoint snaps to a point off
 * the natural loop (e.g. into a dead-end side street), the route walks in,
 * makes a 180° turn at the waypoint and walks back out over the exact same
 * nodes. Repeatedly collapsing X,Y,X patterns removes the whole spur while
 * keeping the track connected, because whatever preceded the spur was
 * already directly connected to whatever follows it.
 */
function removeUTurnSpurs(coords: Position[]): Position[] {
  const out: Position[] = []
  for (const c of coords) {
    if (out.length > 0 && samePoint(out[out.length - 1], c)) continue
    if (out.length > 1 && samePoint(out[out.length - 2], c)) {
      out.pop()
      continue
    }
    out.push(c)
  }
  return out
}

function polylineMeters(coords: Position[]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(
      { lat: coords[i - 1][1], lng: coords[i - 1][0] },
      { lat: coords[i][1], lng: coords[i][0] },
    )
  }
  return total
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
  const raw: Position[] = feature.geometry.coordinates
  const coordinates = removeUTurnSpurs(raw)
  // BRouter's track-length covers the full track including spurs; after
  // trimming, measure the remaining geometry instead.
  const distance =
    coordinates.length === raw.length
      ? Number.parseInt(feature.properties?.['track-length'] ?? '0', 10)
      : Math.round(polylineMeters(coordinates))
  return {
    coordinates,
    distance,
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
