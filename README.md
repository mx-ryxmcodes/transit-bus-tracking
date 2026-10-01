# Smart Public Transport & Bus Tracking Platform

Phase 1 (roles/RBAC) + Phases 2–5 (engines, schema, modules, demo) in one codebase.

## 1. Folder structure (✱ = new or replaced since Phase 1)

```
transit/
├── transit.code-workspace          ✱ open THIS in VS Code
├── package.json  docker-compose.yml  .gitignore            ✱
├── .vscode/ extensions.json tasks.json launch.json         ✱
├── deploy/ ecosystem.config.js nginx.conf                  ✱  (PM2 + Nginx)
├── docs/PROJECT_EXPLANATION.md                             ✱
├── shared/
│   ├── rbac.ts                     (Phase 1, unchanged)
│   └── events.ts                   ✱ realtime contract
├── backend/
│   ├── .env.example  package.json  tsconfig.json           ✱ (package.json/.env changed)
│   ├── prisma/ schema.prisma ✱  seed.ts  seed-demo.ts ✱
│   └── src/
│       ├── app.ts                  ✱ replaced (HTTP + Socket.IO)
│       ├── config/env.ts           ✱ replaced
│       ├── lib/ errors.ts geo.ts time.ts                   ✱
│       ├── middleware/auth.ts      ✱ replaced (adds `allow`)
│       ├── realtime/ io.ts gateway.ts                      ✱
│       └── modules/
│           ├── auth/               (Phase 1, unchanged)
│           ├── operator/ operator.routes.ts ✱ replaced, catalog.routes.ts ✱, ops.routes.ts ✱
│           ├── eta/ eta.service.ts eta.test.ts             ✱
│           ├── tracking/ tracking.service.ts simulator.ts  ✱
│           ├── trips/ trips.service.ts                     ✱
│           ├── alerts/ alerts.service.ts alert.dto.ts      ✱
│           ├── search/ search.service.ts                   ✱
│           ├── driver/ driver.routes.ts                    ✱
│           └── public/ public.routes.ts                    ✱
└── frontend/
    ├── package.json tsconfig.json next.config.js tailwind.config.ts postcss.config.js .env.local.example  ✱
    └── src/
        ├── middleware.ts           ✱ MOVED here from frontend/middleware.ts (delete the old one)
        ├── app/ layout.tsx globals.css page.tsx            ✱
        │   ├── login/page.tsx  driver/login/page.tsx  driver/page.tsx
        │   ├── track/[busId]/page.tsx
        │   └── operator/page.tsx  operator/manage/page.tsx
        ├── components/ RoleGate.tsx (Phase 1)  Navbar.tsx LiveMap.tsx StopList.tsx
        │   └── admin/ ResourceManager.tsx RoutesAdmin.tsx DriversAdmin.tsx
        └── lib/ api.ts socket.ts device.ts types.ts shared-types.ts
```

## 2. VS Code setup (step by step)

**A. Get the files in place**
1. Unzip `transit-all-phases.zip` (or, if you are merging into your Phase 1 folder, unzip over it and **delete `frontend/middleware.ts`**).
2. VS Code → **File ▸ Open Workspace from File…** → pick `transit.code-workspace`. You'll see four roots: root, backend, frontend, shared.
3. When VS Code offers *“Install recommended extensions”*, click **Install** (Prisma, Tailwind CSS IntelliSense, ESLint, DotENV, Thunder Client, Docker).

*Creating folders by hand instead?* In the integrated terminal (**Ctrl+`**) at the project root:
```bash
# macOS / Linux / Git Bash
mkdir -p deploy docs .vscode backend/src/{lib,realtime} backend/src/modules/{eta,tracking,trips,alerts,search,driver,public} \
  frontend/src/app/{login,driver/login,operator/manage} "frontend/src/app/track/[busId]" frontend/src/components/admin frontend/src/lib
```
```powershell
# Windows PowerShell
"deploy","docs",".vscode","backend\src\lib","backend\src\realtime","backend\src\modules\eta","backend\src\modules\tracking",
"backend\src\modules\trips","backend\src\modules\alerts","backend\src\modules\search","backend\src\modules\driver","backend\src\modules\public",
"frontend\src\app\login","frontend\src\app\driver\login","frontend\src\app\operator\manage","frontend\src\app\track\[busId]",
"frontend\src\components\admin","frontend\src\lib" | % { New-Item -ItemType Directory -Force $_ | Out-Null }
```
Then create each file from the tree above (Explorer ▸ right-click folder ▸ **New File**) and paste its contents.

**B. Configure environment**
```bash
cp backend/.env.example backend/.env            # edit JWT_SECRET (>= 32 random chars)
cp frontend/.env.local.example frontend/.env.local   # JWT_SECRET here MUST be identical
```

**C. Install, database, migrate, seed** — run from the VS Code terminal, or **Terminal ▸ Run Task…** (each step exists as a task):
```bash
npm install                      # root (concurrently)
npm run install:all              # backend + frontend deps
docker compose up -d             # PostgreSQL on :5432   (or point DATABASE_URL at your own Postgres)
cd backend
npx prisma migrate dev --name transit      # creates tables (includes Phase 1 tables)
SEED_OPERATOR_EMAIL=you@example.com SEED_OPERATOR_PASSWORD='a-long-password' npm run seed
SEED_DRIVER_PASSWORD='another-long-password' npm run seed:demo     # Route 05/03/09, Bus 14/21/33, Driver 08
cd ..
```
(Windows PowerShell: set vars with `$env:SEED_OPERATOR_EMAIL='…'; $env:SEED_OPERATOR_PASSWORD='…'; npm run seed`.)

**D. Run**
- **Ctrl+Shift+B** → *dev: run everything* (API on :4000, web on :3000), or `npm run dev` at the root.
- **F5** → *Debug backend (tsx)* to debug the API with breakpoints.
- Tests: `npm test` (ETA formula + along-route distance).

## 3. Demo script (spec Phase 5)
1. **Approve the driver device.** Open http://localhost:3000/driver/login in a browser, sign in as `driver08@example.com` → "pending approval". In another window sign in at `/login` as the operator → **Manage ▸ Drivers ▸ Approve** the device → driver signs in again. (Shortcut: copy the Device ID shown on the driver login page and seed with `SEED_DEMO_DEVICE_FINGERPRINT=<id>`.)
2. **Passenger search:** home page, `City Center` → `University Gate` → Route 05 with Bus 14, ETA ≈ 7 min (off-peak; the traffic factor adds a little between 07–19h).
3. **Driver:** pick Bus 14 / Route 05, choose **Route simulator**, **Start trip** → bus becomes ON_ROUTE.
4. **Passenger:** click **Track live** → bus moves along the polyline (SIMULATED badge), stop list shows ETAs.
5. **Operator ▸ Publish service alert:** Route 05, impacted stop *Stop 7 – Kotri Link*, delay 15 → bus turns DELAYED, ETAs jump by 15 min, the passenger page shows the alert (+ browser notification if enabled).
6. **Driver ▸ End trip** → operator dashboard "Trips completed today" and delay charts update.
7. **Signal loss:** with a real-GPS trip, stop sending pings for 30 s → bus goes LOCATION_UNAVAILABLE, marker greys out, dispatcher gets a notice.
8. **Transfer:** search `Cantonment` → `Qasimabad Gate` → Route 03 → change at City Center → Route 09.

## 4. Production (Task 6.1)
`npm run build`, copy `deploy/nginx.conf` to Nginx (HTTPS via certbot — required for browser GPS), `pm2 start deploy/ecosystem.config.js`. Set `NODE_ENV=production`, `CORS_ORIGIN`, `NEXT_PUBLIC_WS_URL` to your domain, and `TZ`/`APP_TZ` to your local time zone.

## 5. API summary
| Area | Endpoints |
|---|---|
| Public | `GET /api/routes`, `/api/routes/:id`, `/api/stops/suggest?q=`, `/api/search?origin=&destination=`, `/api/buses/:id/live`, `/api/alerts` |
| Driver | `GET /api/driver/me`, `POST /api/driver/trips/start`, `PATCH …/trips/:id/status`, `POST …/trips/:id/end`, `PATCH /api/driver/duty` |
| Operator | `/api/operator/{buses,routes,schedules}` CRUD, `/drivers` (+`assign-bus`, device trust), `/fleet`, `/alerts` (+`resolve`), `/analytics/{summary,history}` |
| Realtime | client: `subscribe:route`, `subscribe:trip`, `subscribe:fleet`, `gps:ping` · server: `bus:position`, `trip:eta`, `trip:status`, `alert:new/resolved`, `bus:location_unavailable`, `dispatcher:notice` |
