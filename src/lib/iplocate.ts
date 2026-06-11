import type { LatLng } from './geo'

/**
 * Approximate (city-level) location from the client's IP address via the
 * free geojs.io API — no key and no browser permission prompt required.
 * Returns null when the lookup fails; callers keep their default view.
 */
export async function approximateLocation(): Promise<LatLng | null> {
  try {
    const res = await fetch('https://get.geojs.io/v1/ip/geo.json')
    if (!res.ok) return null
    const data = await res.json()
    const lat = Number.parseFloat(data.latitude)
    const lng = Number.parseFloat(data.longitude)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}
