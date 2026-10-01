# Smart Public Transport & Bus Tracking — Project Explanation

## What it does
Passengers search origin → destination, see buses with live ETAs (direct routes, or a one-transfer suggestion), then follow a bus on a live map with per-stop arrival times and service alerts. Drivers authenticate from an approved device, start a trip and stream GPS (or run a route simulator for demos). Operators manage the fleet, routes, stops, drivers and schedules, publish alerts, watch the live fleet and review analytics.

## Architecture
Next.js (App Router) UI ⇄ Express REST API + Socket.IO ⇄ PostgreSQL (Prisma). Roles/permissions live in one shared file (`shared/rbac.ts`); the realtime contract in `shared/events.ts`.

| Engine | Where | Notes |
|---|---|---|
| Passenger journey | `modules/search` | Stop-name match, direct route with origin-before-destination, else transfer pairs (same name or ≤300 m) minimising stops + penalty |
| Telemetry ingestion | `modules/tracking` | Validates coordinates, timestamp skew (30 s), speed, out-of-order, impossible jumps; broadcasts via rooms; watchdog flags `LOCATION_UNAVAILABLE` after 30 s without a valid ping and notifies dispatchers; never animates a bus without fresh data |
| ETA | `modules/eta` | `Final = distance/speed·60 + delay + traffic`, distance measured along the route polyline; speed clamped 10–80 km/h; traffic = base × (peak multiplier − 1) |
| Trip lifecycle | `modules/trips` | start → status updates/alerts → end; persists duration, distance, delay, ETA error; analytics aggregate from completed trips |

## Key decisions and limits
- Server-side simulator (`isSimulated`) is flagged in every payload and shown as SIMULATED in the UI.
- Push notifications = in-page Socket.IO events + the browser Notification API (while the tab is open). Background web-push (VAPID/service worker) is a natural next step.
- Peak-hour multipliers are a static table; replace with values learned from `Trip` history.
- "ETA error" stored per trip = |planned route duration − actual duration| (an accuracy proxy, not per-stop prediction error).
- Seed coordinates are approximate placeholders — survey real stops before production use.
- Single API instance: live trip state is in memory (rehydrated on restart). Scale out with the Socket.IO Redis adapter and move the live-state map to Redis.
