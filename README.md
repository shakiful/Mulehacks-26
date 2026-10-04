# Mulehacks-26

## ConnectHub

An AI-powered student connection platform for a hackathon themed **Connection**.
Students describe a need; ConnectHub extracts details and finds compatible people or resources. Suspicious messages go to a private risk analyzer.

**Status:** The React frontend and FastAPI/SQLite backend support sentence → preview → follow-up details → confirmed post → matches → connection request → recipient acceptance. Demo profiles and seed posts are synthetic. Gemini is the default for understanding, security assessment and semantic embeddings; unavailable providers use a labeled heuristic fallback. OpenAI embeddings remain available. A versioned SQLite cache supports semantic ranking. The private Security page assesses pasted text without saving it or visiting submitted links.

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

Open http://localhost:5173 with the backend running. The live API is the default. Set `VITE_USE_MOCKS=true` in `frontend/.env.local` and restart Vite to explicitly use fixtures without a backend or provider credentials. `npm run build` checks TypeScript and creates `frontend/dist`; `npm run preview` serves that build. `npm run check` runs TypeScript and frontend behavior checks; `npm test` runs the tests alone. The lockfile pins the dependency versions.

The app includes dashboard navigation, five category shortcuts, a demo profile selector, editable natural-language previews, shared category forms/cards, Ride/Food/Community boards, matches, a connection inbox, saved-post editing and post completion. In mock mode, use the sidebar **Demo responses** selector to exercise Normal, Empty and Error states. Loading states run on each request. On narrow screens the navigation scrolls horizontally; demo response controls can also be exercised in tests or at a desktop width.

Mock data comes directly from `docs/fixtures/api_examples.json`. Dates and scores are fixed illustrative examples. Changes live in memory and reset on page reload. New posts intentionally return empty matches: the browser does not implement the backend matching engine. Mock previews recognize a few scripted keywords and reuse the exact SQL example's details; all other required facts and all dates require manual confirmation. No provider runs in the browser.

To demonstrate Study connections: select **Rafi (demo)**, open **My posts**, find matches for SQL fixture #42, and request Sarah's tutoring offer. Switch to Sarah and accept. Study/Food/Community acceptance records interest. Ride acceptance now reserves requested seats, completes the request, and keeps a partially occupied offer open; the last seats or **Mark filled** close it. Mock Ride fixtures #51–54 demonstrate a four-seat offer shared by three requests for 1 + 1 + 2 seats.

Person 2 owns `frontend/src/pages/StudyPage.tsx` (`/study`) and `frontend/src/pages/SecurityPage.tsx` (`/security`). They use `useApi()` and shared UI components. The Security page supports private assessment; security-classified dashboard previews open it without carrying text in browser history or publishing it. Paste the text there to request an assessment. The mock security API returns a clearly labeled canned risk response, never an assessment of the submitted content.
To edit an existing post, select its author's demo profile and choose **Edit post** from **My posts**, the dashboard, or its category board. Ride, Study, Food, and Community use the same prefilled editor. **Save changes** updates the existing post; **Cancel** discards the draft. Only the author's open posts can be edited, and their category stays fixed. Live edits persist in SQLite through [PUT /posts/{post_id}](docs/API_CONTRACT.md#edit-post), including cleared optional fields. Mock saves work in memory. Existing connections keep their statuses; future matches use updated details. Edited mock posts no longer replay stale fixture match scores. Restart an existing backend process to load the new route; no database migration or reseeding is required.

Dates and times use separate calendar and time pickers. Choose the date and time in **UCM campus time (America/Chicago)**; the form shows a readable confirmation such as **October 4, 2026 at 10:00 PM CDT**. That selection is sent as `2026-10-05T03:00:00Z`, and the backend's existing UTC storage keeps the exact instant. Saved posts and AI previews display the campus date/time even when the browser is in another timezone. Optional availability can be cleared together; partial dates/times, invalid end times and skipped daylight-saving times block saving. A repeated autumn time requires choosing its first or second occurrence. API request/response shapes are unchanged.

Person 2 owns `frontend/src/pages/StudyPage.tsx` (`/study`) and `frontend/src/pages/SecurityPage.tsx` (`/security`). They should use `useApi()` from the shared context, the existing form/card components, and `useResource()` for request states. The Security page is a placeholder; security-classified previews route there without publishing the text. The mock security API returns a clearly labeled canned risk response, never an assessment of the submitted content.

## Switch to the real backend

Create `frontend/.env.local`:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8000/api
```

Restart Vite after changing these values. One typed API interface covers both adapters; no page changes are required. The live adapter follows `docs/API_CONTRACT.md`, sends `X-Demo-User-Id` on protected operations, and uses the standard error envelope for form feedback. Only public configuration belongs in VITE variables.

The backend supplies the contracted health, demo profiles, posts, understanding, matches, connections, `/security/analyze` and public `/dining/menus` endpoints. CORS allows `http://localhost:5173` and `X-Demo-User-Id`. The dining extension is documented in the API contract, fixtures and both client adapters. `/api` is a route prefix; open `/docs` for the interactive API or `/api/health` for a health check.

Validation: **328 backend tests** passed for the mapped Ride/seat feature; this frontend update passes **99 frontend tests**, TypeScript and the production build. Ride checks cover geographic ranking, 5 km exclusions, multiple passengers, concurrent last-seat acceptance and editing safeguards. UI checks include explicit pins, satellite/street styles, business/address searches, both From/To names, cancellation/stale responses, manual corrections, legacy numeric labels, offline lookup and quota fallback. Live checks include mapped Ride creation/matching/acceptance and the new MapTiler place search and satellite map. Existing Gemini extraction, Security and Sodexo checks are recorded in TASKS.md. Automated tests use fakes and never require paid provider calls.

Saved-post editing and campus calendar/time controls are also integrated. Accepted ride routes, labels, offer type and times are protected; capacity cannot drop below reserved seats, and setting capacity to the reserved count marks the offer filled. Edits and acceptance share a SQLite write lock. The editor preserves IDs and connections, uses America/Chicago across browser timezones, and clarifies daylight-saving gaps or repeated times.

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

### Ride maps and shared seats

After pulling, run `npm ci` in `frontend/` to install MapLibre, then restart/rebuild Vite. The backend must be running for live posts and matches. No database reset is needed. The map defaults to [MapTiler satellite imagery with street/place labels](https://docs.maptiler.com/sdk-js/api/map-styles/) (`hybrid-v4`), with a **Street map** toggle (`base-v4`), when its key is configured in ignored `frontend/.env.local`:

```dotenv
VITE_MAPTILER_API_KEY=replace_with_your_public_maptiler_key
```

Keep existing environment settings when adding this line. This is a separate browser map key; never copy the Gemini key here. Restrict the MapTiler key to your frontend origins in its account settings. Vite embeds public map configuration when building, so restart the dev server or rebuild preview after changing it. The actual key is not committed; each teammate configures their own ignored environment.

Use **Ride Connect → Create a post → A · From**, search a street, address or place (for example `University of Central Missouri, Warrensburg`), and select a result. The map moves there and fills **From**; the selector then switches to **B · To**. Search your destination (for example `Walmart, Warrensburg`) and select its result to fill **To**. Search runs only when you click **Search places** or press Enter; Enter does not submit the post. Both pins require your explicit selection, including when AI already supplied a destination name.

Clicking the map or using **Choose map center** also fills the selected field through [MapTiler reverse geocoding](https://docs.maptiler.com/cloud/api/geocoding/). You see street/place names, with no latitude/longitude placeholders. Check the selected result or nearby name and correct the field if necessary; a delayed lookup preserves manual corrections. Existing unbooked drafts with numeric placeholders can resolve names when opened without moving their pins; nothing is automatically saved.

Without a MapTiler key, [OpenFreeMap](https://openfreemap.org/quick_start/) Bright works without registration/key configuration. MapTiler map load/auth/quota failures switch to this street map. Search and automatic names require MapTiler; if lookup is unavailable, choose pins and type names manually or retry. Internet access and WebGL are needed for new map selections. Attribution remains visible. Searches and selected points are sent to MapTiler to find names. Selected pins and labels are public within the local demo. No GPS permission or road routing is used.

### UCM daily dining menus

Open **Food Connect** at http://localhost:5173/food and click **Check dining menu**, beside **Create a post**. Today's [Todd](https://ucmo.sodexomyway.com/en-us/locations/todd-dining-center-in-todd-hall) and [Ellis](https://ucmo.sodexomyway.com/en-us/locations/ellis-dining-center) Sodexo menus appear inside the page, grouped by meal and station. Click a meal heading to expand/collapse its items. **Hide dining menu** closes the panel without clearing an open post draft.

Run the existing frontend and backend setup commands above; no new dependency, API key, database seed or environment setting is needed for menus. The backend needs internet access to UCM's Sodexo website and `api-prd.sodexomyway.net`. Restart the backend after pulling this feature. To check the endpoint in PowerShell:

```powershell
Invoke-RestMethod http://localhost:8000/api/dining/menus | ConvertTo-Json -Depth 8
```

The server uses today's date in UCM's `America/Chicago` time zone, independent of `DEMO_DATE` and your device location. Complete menus are cached for up to five minutes; **Refresh menus** reloads the current server result. An open panel requests a new day's menus after campus midnight. Each hall has its own missing-menu/unavailable state, retry and official link. No menu is invented or replaced with yesterday's food. Consult Sodexo for changed items, ingredients, nutrition, allergens and hours. Mock mode clearly shows fixed synthetic menu examples, not today's food.

Settings load backend/.env, then root .env, then process environment. SQLite defaults to backend/connecthub.db. Startup adds the RideReservation table and idempotently counts older accepted rides without replacing existing posts/connections. Repeated seed adds pins only to labeled synthetic seed rides; user-created unmapped rides remain readable. Edit an open ride to add pins or create a mapped ride for matching. **--refresh** refreshes unbooked seed posts; Ride seed offers with accepted connections retain their dates, status and capacity. DEMO_DATE can fix a rehearsal day; otherwise DEMO_TIMEZONE supplies today.

For a live ride, open **Ride Connect → Create a post**, choose REQUEST or OFFER, enter a title/description and select both mapped places as above. Enter requested seats or total offered seats and a departure date/time, then **Confirm & post**. Nearby pickups and destinations within 5 km each match if departures are within 60 minutes and enough seats remain. Closer pins increase compatibility; reasons show straight-line km, not road distance or driving time. Switch to the recipient profile and accept in **Connections**. A four-seat offer accepts a one-seat request and stays OPEN with three seats remaining, supporting additional riders until full or the driver uses **Mark filled**. Pending requests hold no capacity. Accepted Ride connections are terminal in this prototype; seat release/reopening is deferred. Demo identity still uses X-Demo-User-Id, not production authentication.

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

Follow-up answers reuse `/api/understand` with the original reference time/timezone, so “tonight” keeps the same meaning throughout the preview. Your answers become part of the description; previews are not persisted. Required facts must be supplied before posting; unknown optional facts can remain blank. Click **Confirm & post** only after reviewing the form, then check **Matching mode: semantic** and Sarah's tutor if the seed date and availability overlap. Missing availability or location lowers compatibility; the app does not invent those facts.

The [Gemini embedding adapter](https://ai.google.dev/api/embeddings) supports `gemini-embedding-001` with `SEMANTIC_SIMILARITY` for every post in a batch. The task is included in the cache input version so incompatible vector spaces cannot mix. The deployed REST endpoint was verified using top-level `taskType` and `outputDimensionality`: its newer nested config returned 3072 dimensions instead of the requested 768. The adapter validates the actual response length before storing anything. No extra SDK dependency is needed. Both Google adapters use bounded responses, timeouts, redacted errors, and reject redirects.

### Private Security assessment

Open http://localhost:5173/security, choose a demo profile, paste synthetic message or URL text, and click **Assess risk**. Try **“Your university account expires today. Click https://ucm-login-example.xyz to verify your account.”** The result shows HIGH risk, urgency/login-lure reasons, verification advice, limitations and **Analysis mode: llm**. **Clear analysis** removes the local text/result. Editing the message hides stale results; leaving the page or switching profiles clears the private draft. A LOW result means fewer detected signals, never a safety guarantee.

The existing live client calls `POST /api/security/analyze` with `{ "text": "..." }` and `X-Demo-User-Id`. Input is 1–8000 characters; validation/auth/provider errors follow the standard envelope. Successful responses use `Cache-Control: no-store`. The analyzer has no database writes or content logging and never fetches submitted links, checks DNS, runs scripts, verifies domain ownership or persists results. The UI treats all supplied content as plain text and creates no public posts or clickable submitted links.

Security uses the same `AI_PROVIDER`, `AI_MODEL`, server-only key, timeout and fallback settings as previews. Gemini returns typed risk/evidence codes; evidence snippets must occur in the input, and URL claims must agree with parsed structure. The server supplies fixed descriptions, advice and limitations rather than accepting arbitrary model instructions or URLs. Online analysis sends text to Google; Google's data policies apply. Remove credentials and identifying details before submitting. Explicit `AI_PROVIDER=heuristic` stays offline. A missing key, provider error or invalid assessment produces a labeled rule-based result; fallback disabled returns 503, and later requests retry Gemini.

Offline rules recognize urgency, credential/payment requests, reward claims, login-like links and structural URL signals such as user-info, numeric hosts, Unicode/punycode and HTTP. They do not check reputation or infer legitimate domain ownership. The verification advice follows [NIST's phishing guidance](https://www.nist.gov/itl/smallbusinesscyber/guidance-topic/phishing). These limited rules can miss contextual or novel threats; the result is a risk assessment, not a verdict.

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

These commands were used for this workspace's TypeScript checks, 99 frontend tests, production build, and live browser checks. Restart/rebuild the frontend after changing `.env.local`.

Each laptop runs its own frontend, backend and seeded SQLite database. Git shares code and fixtures; it does not synchronize live database state. During the final demo, run both services on one chosen laptop. Hosting or a shared backend is optional later work.

The next unchecked Person 2 task is P2-8: the dedicated Study workflow. Its existing page currently displays the shared Study post board; the backend already supports Study previews, matches and connections.
