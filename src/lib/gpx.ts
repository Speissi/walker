import type { RouteResult } from './brouter'
import { downloadBlob, safeFilename } from './download'

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function routeToGpx(route: RouteResult, name: string): string {
  const points = route.coordinates
    .map(([lon, lat, ele]) => {
      const eleTag = ele !== undefined ? `<ele>${ele}</ele>` : ''
      return `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">${eleTag}</trkpt>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Walker" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`
}

export function downloadGpx(route: RouteResult, name: string): void {
  downloadBlob(routeToGpx(route, name), 'application/gpx+xml', `${safeFilename(name)}.gpx`)
}
