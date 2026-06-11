import type { LatLng } from './geo'

export interface GeocodeResult {
  point: LatLng
  label: string
}

/** Forward-geocode a free-text query via OSM Nominatim. */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`)
  const results = await res.json()
  if (!Array.isArray(results) || results.length === 0) return null
  const r = results[0]
  return {
    point: { lat: Number.parseFloat(r.lat), lng: Number.parseFloat(r.lon) },
    label: r.display_name as string,
  }
}
