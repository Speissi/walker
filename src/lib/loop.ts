import { destinationPoint, type LatLng } from './geo'
import { fetchRoute, type RouteResult } from './brouter'

export interface LoopResult {
  route: RouteResult
  waypoints: LatLng[]
}

const NUM_WAYPOINTS = 4
const MAX_ITERATIONS = 4
const ACCEPTABLE_ERROR = 0.08 // accept routes within 8% of the target length

/**
 * Waypoints evenly spaced on a circle that passes through `start`. The circle
 * center lies `radius` meters from the start in the `bearing` direction, so
 * varying the bearing rotates the loop around the start point.
 */
function circleWaypoints(
  start: LatLng,
  radius: number,
  bearing: number,
  clockwise: boolean,
): LatLng[] {
  const center = destinationPoint(start, bearing, radius)
  const startAngle = bearing + 180 // angle from center back to the start point
  const step = 360 / (NUM_WAYPOINTS + 1)
  const waypoints: LatLng[] = []
  for (let i = 1; i <= NUM_WAYPOINTS; i++) {
    const angle = startAngle + (clockwise ? 1 : -1) * step * i
    waypoints.push(destinationPoint(center, angle, radius))
  }
  return waypoints
}

/**
 * Generate a loop route that starts and ends at `start` with a routed length
 * close to `targetDistance` (meters). A circle with circumference equal to
 * the target distance is seeded in a random (or given) direction; after each
 * routing attempt the radius is rescaled by the ratio of target to actual
 * length until the result is acceptably close.
 */
export async function generateLoop(
  start: LatLng,
  targetDistance: number,
  preferUnpaved: boolean,
  bearing: number = Math.random() * 360,
  signal?: AbortSignal,
): Promise<LoopResult> {
  const clockwise = Math.random() < 0.5
  let radius = targetDistance / (2 * Math.PI)
  let best: (LoopResult & { error: number }) | null = null

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const waypoints = circleWaypoints(start, radius, bearing, clockwise)
    const route = await fetchRoute([start, ...waypoints, start], preferUnpaved, signal)
    const error = Math.abs(route.distance - targetDistance) / targetDistance

    if (!best || error < best.error) {
      best = { route, waypoints, error }
    }
    if (error <= ACCEPTABLE_ERROR) break

    // Routed length rarely scales perfectly linearly with the circle radius,
    // so damp the correction to avoid oscillating between too long and short.
    const factor = Math.min(1.6, Math.max(0.55, targetDistance / route.distance))
    radius *= factor
  }

  return { route: best!.route, waypoints: best!.waypoints }
}
