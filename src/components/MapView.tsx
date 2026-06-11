import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { LatLng } from '../lib/geo'
import type { RouteResult } from '../lib/brouter'

interface MapViewProps {
  start: LatLng | null
  route: RouteResult | null
  /** Imperative pan request (e.g. after a search); changes recenter the map. */
  flyTo: { point: LatLng; zoom: number } | null
  onSetStart: (point: LatLng) => void
}

const startIcon = L.divIcon({
  className: '',
  html: '<div class="start-marker"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

export default function MapView({ start, route, flyTo, onSetStart }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const startMarkerRef = useRef<L.Marker | null>(null)
  const routeLayerRef = useRef<L.Polyline | null>(null)
  const onSetStartRef = useRef(onSetStart)
  onSetStartRef.current = onSetStart

  useEffect(() => {
    const map = L.map(containerRef.current!, { zoomControl: true }).setView([51.0, 9.0], 5)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · routing by <a href="https://brouter.de">BRouter</a>',
    }).addTo(map)
    map.on('click', (e: L.LeafletMouseEvent) => {
      onSetStartRef.current({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    startMarkerRef.current?.remove()
    startMarkerRef.current = null
    if (start) {
      const marker = L.marker([start.lat, start.lng], { icon: startIcon, draggable: true })
      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        onSetStartRef.current({ lat: pos.lat, lng: pos.lng })
      })
      marker.addTo(map)
      startMarkerRef.current = marker
      if (map.getZoom() < 13) map.flyTo([start.lat, start.lng], 14)
    }
  }, [start])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    routeLayerRef.current?.remove()
    routeLayerRef.current = null
    if (route) {
      const latlngs = route.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
      const line = L.polyline(latlngs, { color: '#e8590c', weight: 5, opacity: 0.85 })
      line.addTo(map)
      routeLayerRef.current = line
      map.fitBounds(line.getBounds(), { padding: [40, 40] })
    }
  }, [route])

  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.flyTo([flyTo.point.lat, flyTo.point.lng], flyTo.zoom)
    }
  }, [flyTo])

  return <div ref={containerRef} className="map" />
}
