# 🥾 Walker — loop route generator

A small web app that generates **circular walking routes**: pick a starting
point and a distance, and Walker computes a loop that starts and ends there
with approximately the requested length. Optionally it prefers **trails and
unpaved paths** over paved roads.

## Features

- 🗺️ Interactive map (Leaflet + OpenStreetMap) — click anywhere or drag the
  marker to set the start, search for a place, or use your current location
- 📌 Opens at a state-level view of your approximate location on load
  (IP-based, via [geojs.io](https://www.geojs.io) — no permission prompt)
- 📏 Target distance from 1 to 30 km via slider
- 🌲 "Prefer trails & unpaved paths" toggle
- 🔄 Every generation picks a new direction, so you can keep regenerating
  until you like the loop
- 📊 Distance, total ascent and estimated walking time (Naismith's rule)
- ⬇️ GPX export for your watch or phone

## How it works

Routing is done by the public [BRouter](https://brouter.de) instance
(worldwide OpenStreetMap coverage, no API key). Walker places three waypoints
on a circle through the start point whose circumference matches the target
distance, routes through them and back, then rescales the circle a few times
until the routed length is within ~8% of the target.

The trail preference switches the BRouter profile from `shortest` to
`hiking-beta`, which strongly favors paths, tracks and unpaved surfaces.

Everything runs in the browser — there is no backend, which is what makes
GitHub Pages hosting possible.

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # production build in dist/
```

Stack: [Vite](https://vite.dev) · [React 19](https://react.dev) ·
TypeScript · [Leaflet](https://leafletjs.com)

## Deploying to GitHub Pages

A workflow in `.github/workflows/deploy.yml` builds and publishes the site on
every push to `main`. One-time setup: in the repository settings, under
**Settings → Pages**, set **Source** to **GitHub Actions**. The app is built
with a relative base path, so it works under the `/walker/` project path
without further configuration.

## Credits

- Routing: [BRouter](https://brouter.de)
- Geocoding: [Nominatim](https://nominatim.org)
- IP geolocation: [GeoJS](https://www.geojs.io)
- Map data & tiles: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
