export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6371000

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/**
 * Great-circle destination point: starting at `origin`, travel `distanceM`
 * meters along the given initial bearing (degrees, clockwise from north).
 */
export function destinationPoint(origin: LatLng, bearingDeg: number, distanceM: number): LatLng {
  const delta = distanceM / EARTH_RADIUS_M
  const theta = toRad(bearingDeg)
  const phi1 = toRad(origin.lat)
  const lambda1 = toRad(origin.lng)

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
  )
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    )

  return {
    lat: toDeg(phi2),
    lng: ((toDeg(lambda2) + 540) % 360) - 180, // normalize to [-180, 180)
  }
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

/** Rough walking time using Naismith's rule: 4.8 km/h plus 1 min per 10 m of ascent. */
export function estimateWalkingMinutes(distanceM: number, ascentM: number): number {
  return (distanceM / 1000 / 4.8) * 60 + ascentM / 10
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}
