# Mulehacks-26

## ConnectHub

An AI-powered student connection platform for a hackathon themed **Connection**.
Students describe a need; ConnectHub extracts details and finds compatible people or resources. Suspicious messages go to a private risk analyzer.

**Status:** The React frontend and FastAPI/SQLite backend support live preview → confirmed post → heuristic matches → connection request → recipient acceptance. Demo profiles and seed posts are synthetic. Hosted AI providers, semantic embeddings, and the private Security analyzer remain pending; security-classified previews open the existing private placeholder.

## Shared context
- [Product scope](docs/PROJECT_SPEC.md)
- [Architecture and data](docs/ARCHITECTURE.md)
- [API contract](docs/API_CONTRACT.md)
- [Task ownership](docs/TASKS.md)
- [Two-laptop setup and Git workflow](docs/TEAM_SETUP.md)
- [Demo and acceptance checks](docs/DEMO_AND_ACCEPTANCE.md)
- [Person 2 Codex prompt](docs/prompts/PERSON2.md)
- [Person 1 Codex prompt](docs/prompts/PERSON1.md)
- [Original planning text](docs/SOURCE_PLAN.md)

## Frontend local development

Install Node.js 22.12 or newer (Node 22.20 was used for validation). From the repository root:

```bash
cd frontend
npm ci
# Optional: copy .env.example to .env.local to customize public settings.
npm run dev
```

Open http://localhost:5173. Mock mode is the default and requires no backend or provider credentials. `npm run build` checks TypeScript and creates `frontend/dist`; `npm run preview` serves that build. `npm run check` runs TypeScript and frontend behavior checks; `npm test` runs the tests alone. The lockfile pins the dependency versions.

The app includes dashboard navigation, five category shortcuts, a demo profile selector, editable natural-language previews, shared category forms/cards, Ride/Food/Community boards, matches, a connection inbox and post completion. Use the sidebar **Demo responses** selector to exercise Normal, Empty and Error states. Loading states run on each request. On narrow screens the navigation scrolls horizontally; demo response controls can also be exercised in tests or at a desktop width.

Mock data comes directly from `docs/fixtures/api_examples.json`. Dates and scores are fixed illustrative examples. Changes live in memory and reset on page reload. New posts intentionally return empty matches: the browser does not implement the backend matching engine. Mock previews recognize a few scripted keywords and reuse the exact SQL example's details; all other required facts and all dates require manual confirmation. No provider runs in the browser.

To demonstrate connections: select **Rafi (demo)**, open **My posts**, find matches for the SQL fixture post #42, and request Sarah's tutoring offer. Select **Sarah (demo)**, open **Connections**, and accept or decline. Acceptance records interest only. It does not reserve seats, place orders, or close posts. Each author can mark their own post completed.

Person 2 owns `frontend/src/pages/StudyPage.tsx` (`/study`) and `frontend/src/pages/SecurityPage.tsx` (`/security`). They should use `useApi()` from the shared context, the existing form/card components, and `useResource()` for request states. The Security page is a placeholder; security-classified previews route there without publishing the text. The mock security API returns a clearly labeled canned risk response, never an assessment of the submitted content.

## Switch to the real backend

Create `frontend/.env.local`:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8000/api
```

Restart Vite after changing these values. One typed API interface covers both adapters; no page changes are required. The live adapter follows `docs/API_CONTRACT.md`, sends `X-Demo-User-Id` on protected operations, and uses the standard error envelope for form feedback. Only public configuration belongs in VITE variables.

The backend supplies the contracted health, demo profiles, posts, understanding, matches, and connections endpoints. CORS allows `http://localhost:5173` and `X-Demo-User-Id`. The shared live adapter works without frontend changes. The API contract and fixtures are unchanged. `/api` is a route prefix; open `/docs` for the interactive API or `/api/health` for a health check.

Frontend validation: 19 passing tests, TypeScript checks, and a production build. Tests cover the live adapter's exact routes/headers/bodies and standard errors, fixture mock ownership and connection transitions, post validation, profile switching, loading/error/empty states, editable previews, and private Security routing. Backend validation: 113 tests cover post validation, repeatable seeding, CORS/errors, relative times and DST clarification, provider failure/output validation, category matching gates, duplicate connections, and participant permissions. A live browser check submitted “I need a ride to Walmart around 6 tonight,” confirmed synthetic UCM origin and one seat, displayed both seeded offers, and accepted the request as Sarah.

## Backend local development
Python backend: FastAPI + SQLAlchemy + SQLite. Frontend: React + Vite + Tailwind.

Use Python 3.11 or newer. From the repository root in Windows PowerShell:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
backend/.venv/Scripts/python.exe -m backend.app.seed
backend/.venv/Scripts/python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Copy the example only for first setup; preserve an existing `.env`. On macOS/Linux activate with `source backend/.venv/bin/activate` after creating the environment, then use `python` for the same install, seed, and server commands. Run both services in separate terminals. Frontend: http://localhost:5173. API documentation: http://localhost:8000/docs. Health: http://localhost:8000/api/health.

Settings load `backend/.env`, then root `.env`, then process environment (later values win). SQLite defaults to `backend/connecthub.db`. The server creates the schema, including the connections table, on startup; the seed command creates four profiles and six labeled posts. Run the seed command repeatedly without duplicates. To move only seed posts to today's date and OPEN status, run `backend/.venv/Scripts/python.exe -m backend.app.seed --refresh`. Set `DEMO_DATE=YYYY-MM-DD` for a fixed rehearsal day, or leave it blank to use today in `DEMO_TIMEZONE`. User-created posts and connection records are preserved.

For the live ride demo, select Rafi, enter the Walmart request, confirm origin `UCM`, seats `1`, and the date/time. The seed offers depart at 17:45 and 18:15 on the seed date. Matching requires the same normalized origin/destination, enough seats, and departures within 60 minutes. A different day or route correctly returns no matches. Switch to Sarah and open Connections to accept. Demo identity is selected by `X-Demo-User-Id`; ownership still applies. With `DEMO_MODE=false`, protected operations reject demo identities until real authentication is implemented.

`AI_PROVIDER=heuristic` runs entirely offline. Understanding uses conservative keywords and explicit times; unknown origin, seats, dates, and other required facts remain missing for confirmation. The request's `reference_time` and IANA `timezone` resolve relative dates, with ambiguous DST times left for clarification. Ranking uses documented deterministic rules and token overlap and returns `HEURISTIC`, with evidence-based reasons and scores, rather than semantic embeddings. The provider interface validates category output and manual overrides. An unavailable/unimplemented provider falls back when `AI_FALLBACK_ENABLED=true`, or returns the standard 503 when disabled. No hosted provider adapter or tested model is included yet.

Run backend checks from the repository root:

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
```

In a restricted runner where Vite's default config bundler cannot read parent directories, Node 24 can use the native config loader. From `frontend/`, after `npm ci`:

```bash
node node_modules/typescript/bin/tsc -b
node node_modules/vitest/vitest.mjs run --configLoader native
node node_modules/vite/bin/vite.js build --configLoader native
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5173 --strictPort --configLoader native
```

These commands were used for this workspace's TypeScript checks, 19 frontend tests, production build, and live browser check. Restart/rebuild the frontend after changing `.env.local`.

Each laptop runs its own frontend, backend and seeded SQLite database. Git shares code and fixtures; it does not synchronize live database state. During the final demo, run both services on one chosen laptop. Hosting or a shared backend is optional later work.

Next backend slices: a hosted understanding adapter, embeddings with model/version metadata, the dedicated Study workflow, and private security analysis. The current Security page cannot assess submitted content yet.
