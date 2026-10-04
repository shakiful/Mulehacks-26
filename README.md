# Mulehacks-26

## ConnectHub

An AI-powered student connection platform for a hackathon themed **Connection**.
Students describe a need; ConnectHub extracts details and finds compatible people or resources. Suspicious messages go to a private risk analyzer.

**Status:** The React frontend and FastAPI/SQLite backend support sentence → preview → follow-up details → confirmed post → matches → connection request → recipient acceptance. Student sign-in/logout uses server sessions; Rafi and Afsana are the two local test accounts, and seed posts are labeled synthetic. Gemini is the default for understanding and semantic embeddings; unavailable providers use a labeled heuristic fallback. OpenAI embeddings remain available. A versioned SQLite cache supports semantic ranking. The private Security analyzer remains pending; security-classified previews open the existing private placeholder.

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

## Student sign-in and test accounts

Open http://localhost:5173/login. Sign in with username **rafi** (Rafi) or **afsana** (Afsana); use the corresponding password from your ignored local `backend/.env`:

```dotenv
RAFI_LOGIN_PASSWORD=your_private_password_at_least_10_characters
AFSANA_LOGIN_PASSWORD=another_private_password_at_least_10_characters
SESSION_COOKIE_SECURE=false
SESSION_LIFETIME_SECONDS=43200
```

The passwords for this workspace have been generated in the existing local file. On another laptop, choose your own passwords before running the seed command. Never commit credentials. Existing account hashes are preserved on startup; after changing passwords in .env, run `python -m backend.app.seed --reset-passwords` with your backend virtual environment. Normal seeding is repeatable and does not reset passwords or overwrite user posts.

Signing in restores the requested page; page reload keeps a valid session. The header shows the signed-in student and **Log out**, which revokes the session and returns to the login page. Sign out before testing as the other account. Expired sessions require sign-in again. Credentials/session tokens are not stored in browser localStorage. These are local test accounts without university SSO, enrollment verification or self-registration.

Existing SQLite data is migrated without deleting posts/connections. Rafi keeps id 1; the old Sarah record at id 2 becomes Afsana. Historical authors with existing records are retained without login accounts; new installations create only Rafi and Afsana. The legacy demo flag is removed. Back up an existing SQLite database before adopting the migration; this workspace's backup is under ignored `backend/backups/`.

## Frontend local development

Install Node.js 22.12 or newer (Node 22.20 was used for validation). From the repository root:

```bash
cd frontend
npm ci
# Optional: copy .env.example to .env.local to customize public settings.
npm run dev
```

Open http://localhost:5173 with the backend running. The live API is the default. Set `VITE_USE_MOCKS=true` in `frontend/.env.local` and restart Vite to explicitly use fixtures without a backend or provider credentials. `npm run build` checks TypeScript and creates `frontend/dist`; `npm run preview` serves that build. `npm run check` runs TypeScript and frontend behavior checks; `npm test` runs the tests alone. The lockfile pins the dependency versions.

The app includes dashboard navigation, five category shortcuts, student sign-in/logout, editable natural-language previews, shared category forms/cards, Ride/Food/Community boards, matches, a connection inbox, saved-post editing and post completion. In mock mode, use the sidebar **Response states** selector to exercise Normal, Empty and Error states. Loading states run on each request. On narrow screens the navigation scrolls horizontally; fixture response controls can also be exercised in tests or at a desktop width.

Mock data comes directly from `docs/fixtures/api_examples.json`. Dates and scores are fixed illustrative examples. Changes live in memory and reset on page reload. New posts intentionally return empty matches: the browser does not implement the backend matching engine. Mock previews recognize a few scripted keywords and reuse the exact SQL example's details; all other required facts and all dates require manual confirmation. No provider runs in the browser.

To demonstrate fixture connections: sign in as **rafi** with the synthetic fixture password **fixture-only**, open **My posts**, find matches for SQL fixture post #42, and request Afsana's tutoring offer. Click **Log out**, sign in as **afsana** with **fixture-only**, open **Connections**, and accept or decline. This password works only in explicitly enabled mock mode; live accounts use your private backend/.env passwords. Acceptance records interest only. It does not reserve seats, place orders, or close posts. Each author can mark their own post completed.

To edit an existing post, sign in as its author and choose **Edit post** from **My posts**, the dashboard, or its category board. Ride, Study, Food, and Community use the same prefilled editor. **Save changes** updates the existing post; **Cancel** discards the draft. Only the author's open posts can be edited, and their category stays fixed. Live edits persist in SQLite through [PUT /posts/{post_id}](docs/API_CONTRACT.md#edit-post), including cleared optional fields. Mock saves work in memory. Existing connections keep their statuses; future matches use updated details. Edited mock posts no longer replay stale fixture match scores. Restart an existing backend process to load updated routes; the login migration preserves saved posts and connections.

Dates and times use separate calendar and time pickers. Choose the date and time in **UCM campus time (America/Chicago)**; the form shows a readable confirmation such as **October 4, 2026 at 10:00 PM CDT**. That selection is sent as `2026-10-05T03:00:00Z`, and the backend's existing UTC storage keeps the exact instant. Saved posts and AI previews display the campus date/time even when the browser is in another timezone. Optional availability can be cleared together; partial dates/times, invalid end times and skipped daylight-saving times block saving. A repeated autumn time requires choosing its first or second occurrence. API request/response shapes are unchanged.

Person 2 owns `frontend/src/pages/StudyPage.tsx` (`/study`) and `frontend/src/pages/SecurityPage.tsx` (`/security`). They should use `useApi()` from the shared context, the existing form/card components, and `useResource()` for request states. The Security page is a placeholder; security-classified previews route there without publishing the text. The mock security API returns a clearly labeled canned risk response, never an assessment of the submitted content.

## Switch to the real backend

Create `frontend/.env.local`:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8000/api
```

Restart Vite after changing these values. One typed API interface covers both adapters; no page changes are required. The live adapter follows `docs/API_CONTRACT.md`, includes session cookies on requests and the current `X-CSRF-Token` on protected mutations, and uses the standard error envelope for form feedback. Only public configuration belongs in VITE variables.

The backend supplies the contracted health, student login/session/logout, posts (including saved-post editing), understanding, matches, and connections endpoints. CORS allows the configured frontend origin, credentials, `X-CSRF-Token`, and PUT for edits. Open both services through localhost (or configure both with the same hostname). The shared live adapter and mock fixtures follow the [API contract](docs/API_CONTRACT.md). `/api` is a route prefix; open `/docs` for the interactive API or `/api/health` for a health check.

Frontend validation: 62 passing tests, TypeScript checks, and a production build. Login/session, invalid credentials, logout/retry, expired-session redirects, direct-route ownership and stale request handling are covered. Tests also cover the live adapter's routes/headers/bodies and errors, fixture ownership/connections, account sign-in/logout, request states, editable previews, follow-up autofill with manual-edit preservation, explicit mock selection, saved-post editing across all four categories, calendar/time controls, campus-to-UTC conversion, daylight-saving clarification, and private Security routing. Backend validation: 243 tests cover login/cookie/CSRF handling, logout revocation, password hashing/redaction, expiry, throttling, legacy data migration, and post validation, repeatable seeding, CORS/errors, relative times and DST clarification, word-number clocks and ranges, Gemini-first configuration and recovery after fallback, provider output validation, matching gates, connection permissions, semantic weighting, versioned caches, edit ownership/validation, preserved connections, stale embedding regeneration, and PUT CORS. Live browser checks verified both student accounts, invalid-login feedback, session restoration, logout revocation, owner-only editing, same-route 10 PM matching at 100/100, and a ride request through recipient acceptance and a Gemini SQL preview refined by a follow-up sentence into location, meeting mode and a start/end interval. Live browser editing checks verified Ride, Study, Food and Community saves, optional-field clearing, stable post IDs/counts, persistence after reload, and author/closed-post guards. Desktop and mobile editor screenshots were reviewed. The calendar/time browser check used Asia/Dhaka to verify that October 4 at 10 PM campus time persists as October 5 at 03:00 UTC, matches a compatible offer, and reloads correctly for editing. All synthetic editing verification posts were cancelled; existing posts were not edited. Automated provider tests use controlled vectors and HTTP responses and never require paid calls. An explicit live Google check on October 3, 2026 produced an LLM SQL preview and three 768-dimensional vectors: the SQL/relational-database example had cosine similarity 0.8267 versus 0.7385 for physics. These are synthetic smoke checks, not a model-quality benchmark.

## Backend local development
Python backend: FastAPI + SQLAlchemy + SQLite. Frontend: React + Vite + Tailwind.

Use Python 3.11 or newer. From the repository root in Windows PowerShell:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
# Edit backend/.env and set both LOGIN_PASSWORD values before seeding.
backend/.venv/Scripts/python.exe -m backend.app.seed
backend/.venv/Scripts/python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Copy the example only for first setup; preserve an existing `.env`. On macOS/Linux activate with `source backend/.venv/bin/activate` after creating the environment, then use `python` for the same install, seed, and server commands. Run both services in separate terminals. Frontend: http://localhost:5173. API documentation: http://localhost:8000/docs. Health: http://localhost:8000/api/health.

Settings load `backend/.env`, then root `.env`, then process environment (later values win). SQLite defaults to `backend/connecthub.db`. The server creates the schema, including the connections table, on startup; the seed command creates only the Rafi/Afsana accounts and six labeled synthetic posts. Run the seed command repeatedly without duplicates. To move only seed posts to today's date and OPEN status, run `backend/.venv/Scripts/python.exe -m backend.app.seed --refresh`. Set `SEED_DATE=YYYY-MM-DD` for a fixed rehearsal day, or leave it blank to use today in `SEED_TIMEZONE`. User-created posts and connection records are preserved.

For the live ride demo, sign in as rafi, enter the Walmart request, confirm origin `UCM`, seats `1`, and the date/time. The seed offers depart at 17:45 and 18:15 on the seed date. Matching requires the same normalized origin/destination, enough seats, and departures within 60 minutes. A different day or route correctly returns no matches. Log out, sign in as afsana, and open Connections to accept. Ownership and connection roles come from the server session. The old demo profile selector, demo-user endpoint and identity header are removed.

Gemini is attempted on every understanding request by default. Missing credentials, offline connectivity, quota errors, timeouts, or invalid provider output use the labeled heuristic fallback when `AI_FALLBACK_ENABLED=true`; the next request tries Gemini again. `AI_PROVIDER=heuristic` explicitly selects offline understanding instead. Heuristics use fixed rules, keywords and explicit times: they are fast and keep the demo usable without Google, but understand fewer phrases. Unknown logistics stay blank. The request's `reference_time` and IANA `timezone` resolve relative dates, with ambiguous DST times left for clarification. Disabling fallback returns the standard 503 on provider failure.

### Google Gemini AI

Create a key in [Google AI Studio](https://aistudio.google.com/api-keys), then edit the ignored local `backend/.env`. Keep the key on the backend; never put it in a `VITE_` variable or commit it. These settings enable both request understanding and semantic matching:

```dotenv
AI_PROVIDER=gemini
AI_MODEL=gemini-3.5-flash-lite
AI_TIMEOUT_SECONDS=30
GEMINI_API_KEY=replace_with_your_local_key
EMBEDDING_PROVIDER=gemini
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768
EMBEDDING_TIMEOUT_SECONDS=10
AI_FALLBACK_ENABLED=true
```

`GOOGLE_API_KEY` is accepted as an alternative to `GEMINI_API_KEY`; use one key variable. Check root `.env` and process variables if local settings appear ignored. Restart the backend with the documented Uvicorn command after configuration changes. Google account quota/model access still applies; provider failures produce the labeled fallback, or a standard 503 with fallback disabled.

The [structured-output adapter](https://ai.google.dev/gemini-api/docs/structured-output) classifies the text and extracts category details. Server validation enforces the contract, computes missing required fields, preserves original text, honors manual category hints, and requires clarification for unspecified dates/clocks and recognized DST ambiguity. Preview results return `analysis_mode: LLM` only after valid Google output. They are not persisted. Review the editable fields before posting.

To try it at http://localhost:5173, enter **“I need help studying SQL joins tonight”**, click **Find my connections**, and verify **Preview mode: llm**. Supplied facts populate the form. The **A few details to finish** section asks only for missing facts; Study mode/time/location questions help matching and remain optional under the unchanged contract. In **Add missing details**, enter **“At the Library, in person tonight from six to seven pm”**, then click **Fill in my form**. Gemini fills the location, mode and interval while preserving any fields you manually edited. You can also supply everything in the first sentence to skip the questions.

Follow-up answers reuse `/api/understand` with the original reference time/timezone, so “tonight” keeps the same meaning throughout the preview. Your answers become part of the description; previews are not persisted. Required facts must be supplied before posting; unknown optional facts can remain blank. Click **Confirm & post** only after reviewing the form, then check **Matching mode: semantic** and Afsana's tutor if the seed date and availability overlap. Missing availability or location lowers compatibility; the app does not invent those facts.

The [Gemini embedding adapter](https://ai.google.dev/api/embeddings) supports `gemini-embedding-001` with `SEMANTIC_SIMILARITY` for every post in a batch. The task is included in the cache input version so incompatible vector spaces cannot mix. The deployed REST endpoint was verified using top-level `taskType` and `outputDimensionality`: its newer nested config returned 3072 dimensions instead of the requested 768. The adapter validates the actual response length before storing anything. No extra SDK dependency is needed. Both Google adapters use bounded responses, timeouts, redacted errors, and reject redirects.

### Semantic ranking

`EMBEDDING_PROVIDER=heuristic` keeps ranking offline and returns `HEURISTIC` with deterministic token overlap. To enable the server-side [OpenAI embeddings API](https://developers.openai.com/api/docs/guides/embeddings), set these values in local `backend/.env` (or root `.env` if it already overrides them), then restart the backend:

```dotenv
AI_PROVIDER=heuristic
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=replace_with_your_local_key
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBEDDING_TIMEOUT_SECONDS=10
AI_FALLBACK_ENABLED=true
```

The configurable model must support the dimensions parameter; the default follows the documented `text-embedding-3-small` format. Credentials stay on the server. No new frontend configuration or API fields are needed: Study/Food/Community matches return `SEMANTIC` when valid vectors are available. Hard constraints still run first. Ride uses structured scoring and returns `HEURISTIC` without calling an embedding provider; an empty candidate set also requires no provider call.

Vectors are generated lazily when finding matches, or explicitly backfilled for confirmed OPEN non-Ride posts:

```powershell
backend/.venv/Scripts/python.exe -m backend.app.ai.embeddings
# Optional: force regeneration of the current model's cache.
backend/.venv/Scripts/python.exe -m backend.app.ai.embeddings --refresh
```

The cache records provider, model, dimensions, input version (`title-text-v1` for OpenAI, plus the semantic-similarity task version for Google), a SHA-256 hash of confirmed title/text, and creation time. Repeated calls reuse valid vectors; changed text, model, dimensions, or encoding version triggers regeneration. Different models/dimensions are never compared. Preview text is not embedded or persisted. Provider requests batch up to 16 posts, use the configured timeout, and validate each provider's count/order metadata and finite nonzero vectors before storing any batch. OpenAI also validates returned model/index metadata. Provider errors and credentials are redacted.

If any required vector cannot be generated or validated, the entire ranked set falls back to `HEURISTIC` with a warning, or returns the standard 503 when fallback is disabled. Existing posts and valid cache rows are preserved. Scores remain compatibility scores, not probabilities. The adapter's HTTP format and ranking/cache behavior are tested with fakes; use a locally configured key to verify actual hosted-model quality and account access.

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

These are alternative commands for restricted runners. Current validation used `npm run check -- --maxWorkers=2` (62 tests and TypeScript), `npm run build`, and live Chrome checks. Reducing workers avoids competing with CPU-intensive password tests. Restart/rebuild the frontend after changing `.env.local`.

Each laptop runs its own frontend, backend and seeded SQLite database. Git shares code and fixtures; it does not synchronize live database state. During the final demo, run both services on one chosen laptop. Hosting or a shared backend is optional later work.

Next backend slices: private security analysis and the dedicated Study workflow. The next unchecked Person 2 task is P2-7 (private security analyzer and its dedicated page). The current Security page cannot assess submitted content yet.
