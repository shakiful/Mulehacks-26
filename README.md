# Mulehacks-26

## ConnectHub

An AI-powered student connection platform for a hackathon themed **Connection**.
Students describe a need; ConnectHub extracts details and finds compatible people or resources. Suspicious messages go to a private risk analyzer.

**Status:** The React frontend and FastAPI/SQLite backend support sentence → preview → follow-up details → confirmed post → matches → connection request → recipient acceptance. Student sign-in/logout uses server sessions; Rafi and Afsana are the two local test accounts, and seed posts are labeled synthetic. Gemini is the default for understanding, security assessment and semantic embeddings; unavailable providers use a labeled heuristic fallback. OpenAI embeddings remain available. A versioned SQLite cache supports semantic ranking. The private Security page assesses pasted text without saving it or visiting submitted links. Food Connect also loads today's Todd/Ellis dining menus.

## Shared context
- [Netlify + Render deployment](docs/DEPLOYMENT.md) — import `production`; build/routing and persistent-backend templates are included.
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

Choose your own passwords in the ignored local file before running the seed command. Never commit credentials. Existing account hashes are preserved on startup; after changing passwords in .env, run `python -m backend.app.seed --reset-passwords` with your backend virtual environment. Normal seeding is repeatable and does not reset passwords or overwrite user posts.

Signing in restores the requested page; page reload keeps a valid session. The header shows the signed-in student and **Log out**, which revokes the session and returns to the login page. Sign out before testing as the other account. Expired sessions require sign-in again. Credentials/session tokens are not stored in browser localStorage. These are local test accounts without university SSO, enrollment verification or self-registration.

Existing SQLite data is migrated without deleting posts/connections. Rafi keeps id 1; the old Sarah record at id 2 becomes Afsana. Historical authors with existing records are retained without login accounts; new installations create only Rafi and Afsana. The legacy demo flag is removed. Keep database backups outside tracked files; `backend/backups/` is ignored.

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

To demonstrate fixture connections: sign in as **rafi** with the synthetic fixture password **fixture-only**, open **My posts**, find matches for SQL fixture post #42, and request Afsana's tutoring offer. Click **Log out**, sign in as **afsana** with **fixture-only**, open **Connections**, and accept or decline. This password works only in explicitly enabled mock mode; live accounts use your private backend/.env passwords. Study/Food/Community acceptance records interest. Ride acceptance reserves requested seats and completes the request; partially filled offers remain open until full or Mark filled. No restaurant order is placed. Mock Ride fixtures #51–54 show 1 + 1 + 2 seats shared with one four-seat offer. Each author can mark their own post completed.

To join without creating a post, sign in and choose **Join** on another student's open Ride, Study, Food or Community card. Review the details, choose seats for a Ride offer, or confirm you can drive for a Ride request, then **Send join request**. The author opens **Connections**, uses **Refresh** if already on the page, and chooses **Accept** or **Decline**. Joining students can cancel pending requests. After acceptance, both students have a **Message** button in Connections; accepted participants can also message from cards that remain open. Existing accepted match requests support the same private conversations. Replies refresh every four seconds; drafts survive send errors. Ride joins and matched requests share seat totals and reserved-route locks. Non-Ride joins record participation, without reserving food/group capacity.

Start the backend and frontend using the commands above after pulling these changes. Backend startup adds the join/message tables automatically and preserves existing records; no database reset, new dependency or provider key is needed. Live messages persist in the ignored SQLite database. Use separate browser profiles/windows for simultaneous Rafi/Afsana sessions; ordinary tabs share one login cookie. Mock mode follows the same join/accept/message flow with **fixture-only** and in-memory data, which clears when the page reloads. Messages are plain text, visible only to participants in accepted conversations. Automatic phishing checks run locally; only an explicit AI review sends the selected, editable text to Gemini. This is one-to-one chat, without delivery/read receipts or group chat.

Direct join/message validation: all **370 backend tests** and **167 frontend tests** pass, including TypeScript and the production build. Tests cover all public category/intent joins without extra posts, participant/CSRF guards, pending and terminal transitions, direct/matched shared Ride capacity with concurrent acceptance, reserved-route edits, private messaging in both directions, plain text, cursor pagination, polling, retries and logout/stale-response clearing. Live isolated Chrome sessions verified Rafi joining, Afsana accepting, both messaging, polling, persistence after reload, and desktop/mobile rendering. Only synthetic browser verification records were created and cleaned up; existing data was preserved. The existing optional MapLibre bundle still produces Vite's size warning.

The header **notification bell** shows incoming messages, invitation/connection requests and acceptance, with an unread badge and a short alert for new activity while the app is open. Click the bell to open the list, mark everything currently received as read, refresh or load earlier notifications. Clicking a notification opens its request or conversation and marks it read; viewing messages clears only those already displayed. Message text is shown in the conversation, not notification previews. Unread notifications persist across sign-out/reload in live mode and arrive within roughly four seconds while the app is open. Mock mode keeps them in memory. Notifications received while away appear on the next sign-in; older notifications do not replay as alerts. This uses in-app polling, without email, OS push permissions, new dependencies or provider keys. Restart the backend after pulling to create the additive notification table; existing posts, joins and messages are preserved.

Notification validation: all **381 backend tests**, **177 frontend tests**, TypeScript and the production build pass. Recipient/CSRF guards, atomic event rollback, pagination, read actions that preserve newer arrivals, conversation-specific read updates and logout clearing are covered. Live isolated Rafi/Afsana Chrome sessions verified automatic alerts and badges, request/conversation links, replies, reload persistence and desktop/mobile layout. Only the synthetic verification records were cleaned up. On this local setup, the full frontend check passed with `npm run check -- --maxWorkers=1` to avoid competing with CPU-intensive backend tests.

Chat phishing protection works automatically after pulling and restarting both services. New and historical messages include a private local rule check; **Possible phishing** appears for MEDIUM/HIGH risk with **Warning signs and advice**. Password/verification-code requests, urgency, login links and misleading URL formats are supported. Messages and links stay plain text, warnings do not block delivery, and no warning is not proof of safety. Checks do not call Gemini, fetch links, write assessments or require new settings/migrations.

For more context, choose **Review with AI** under a message, remove passwords/codes/personal details from **Text to check**, then click **Analyze selected text**. Only this edited text goes to the existing Gemini-first security API. Opening the panel never calls Gemini; the result stays private to the viewer, uses the configured fallback if needed, and clears on editing, close, navigation or logout. It does not change the original chat message or replace its automatic warning. Mock mode displays canned examples, not real assessments.

Chat security validation: **109 focused backend tests**, **188 frontend tests**, TypeScript and the production build pass. These cover both thread kinds, historical checks without writes, no provider/DNS calls even with Gemini configured and fallback disabled, forged assessments, participant/CSRF guards, plain-text rendering, explicit/redacted AI submission, failure/retry, and closed/logout late responses. See `docs/CHAT_SECURITY.md` for current protections and recommended next steps.

To edit an existing post, sign in as its author and choose **Edit post** from **My posts**, the dashboard, or its category board. Ride, Study, Food, and Community use the same prefilled editor. **Save changes** updates the existing post; **Cancel** discards the draft. Only the author's open posts can be edited, and their category stays fixed. Live edits persist in SQLite through [PUT /posts/{post_id}](docs/API_CONTRACT.md#edit-post), including cleared optional fields. Mock saves work in memory. Existing connections keep their statuses; future matches use updated details. Edited mock posts no longer replay stale fixture match scores. Restart an existing backend process to load updated routes; the login migration preserves saved posts and connections.

If the other student already requested a connection between your posts, the match card shows **Respond to request**. Open it to accept/decline in **Connections**, instead of sending a duplicate request. Your own pending requests show disabled **Request sent**. These states survive reloading the matches page and recognize both source/target orders; declined/cancelled requests permit a new request.

Dates and times use separate calendar and time pickers. Choose the date and time in **UCM campus time (America/Chicago)**; the form shows a readable confirmation such as **October 4, 2026 at 10:00 PM CDT**. That selection is sent as `2026-10-05T03:00:00Z`, and the backend's existing UTC storage keeps the exact instant. Saved posts and AI previews display the campus date/time even when the browser is in another timezone. Optional availability can be cleared together; partial dates/times, invalid end times and skipped daylight-saving times block saving. A repeated autumn time requires choosing its first or second occurrence. API request/response shapes are unchanged.

Person 2 owns `frontend/src/pages/StudyPage.tsx` (`/study`) and `frontend/src/pages/SecurityPage.tsx` (`/security`). They use `useApi()` and shared UI components. The Security page supports private assessment; security-classified dashboard previews open it without carrying text in browser history or publishing it. Paste the text there to request an assessment. Logging out clears private page drafts. The mock security API returns a clearly labeled canned risk response, never an assessment of the submitted content.

## Switch to the real backend

Create `frontend/.env.local`:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8000/api
```

Restart Vite after changing these values. One typed API interface covers both adapters; no page changes are required. The live adapter follows `docs/API_CONTRACT.md`, includes session cookies on requests and the current `X-CSRF-Token` on protected mutations, and uses the standard error envelope for form feedback. Only public configuration belongs in VITE variables.

The backend supplies the contracted health, student login/session/logout, posts (including saved-post editing), understanding, matches, connections, private `/security/analyze` and public `/dining/menus` endpoints. CORS allows the configured frontend origin, credentials, `X-CSRF-Token`, and PUT for edits. Open both services through localhost (or configure both with the same hostname). The shared live adapter and mock fixtures follow the [API contract](docs/API_CONTRACT.md). `/api` is a route prefix; open `/docs` for the interactive API or `/api/health` for a health check.

Production integration validation: 143 passing frontend tests, TypeScript checks, and a production build. Login/session, invalid credentials, logout/retry, expired-session redirects, direct-route ownership and stale request handling are covered. Tests also cover the live adapter's routes/headers/bodies and errors, fixture ownership/connections, account sign-in/logout, request states, editable previews, follow-up autofill with manual-edit preservation, explicit mock selection, saved-post editing across all four categories, calendar/time controls, campus-to-UTC conversion, daylight-saving clarification, and private Security assessment/privacy. Ride checks cover sentence geocoding, field autocomplete, stale-query cancellation, map-hidden previews, mile distances, shared seat reservations and reserved-route locks. Dining UI checks cover on-demand loading, both halls, preserved post drafts, empty/unavailable/error states, retry, synthetic labeling, plain-text rendering and campus midnight rollover. Backend validation: 341 passing tests cover login/cookie/CSRF handling, logout revocation, password hashing/redaction, expiry, throttling, legacy data migration, and post validation, repeatable seeding, CORS/errors, relative times and DST clarification, word-number clocks and ranges, Gemini-first configuration and recovery after fallback, provider output validation, matching gates, connection permissions, semantic weighting, versioned caches, edit ownership/validation, preserved connections, stale embedding regeneration, and PUT CORS. The merged suite also includes 49 Security checks for validation, supported evidence, provider failure/recovery, privacy and no submitted-link fetching, plus 17 dining checks for public responses, campus dates, cache expiry, partial failures and fixed-host bounded transport. Live browser checks verified both student accounts, invalid-login feedback, session restoration, logout revocation, owner-only editing, same-route 10 PM matching at 100/100, and a ride request through recipient acceptance and a Gemini SQL preview refined by a follow-up sentence into location, meeting mode and a start/end interval. Live browser editing checks verified Ride, Study, Food and Community saves, optional-field clearing, stable post IDs/counts, persistence after reload, and author/closed-post guards. Desktop and mobile editor screenshots were reviewed. The calendar/time browser check used Asia/Dhaka to verify that October 4 at 10 PM campus time persists as October 5 at 03:00 UTC, matches a compatible offer, and reloads correctly for editing. All synthetic editing verification posts were cancelled; existing posts were not edited. Automated provider tests use controlled vectors and HTTP responses and never require paid calls. An explicit live Google check on October 3, 2026 produced an LLM SQL preview and three 768-dimensional vectors: the SQL/relational-database example had cosine similarity 0.8267 versus 0.7385 for physics. These are synthetic smoke checks, not a model-quality benchmark.

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

### Ride locations and shared seats

After pulling, run `npm ci` in `frontend/`, then restart/rebuild Vite. No database reset is needed. The Ride form hides the map by default and uses **From** and **To** address suggestions. Configure their separate public MapTiler key in ignored `frontend/.env.local`:

```dotenv
VITE_MAPTILER_API_KEY=replace_with_your_public_maptiler_key
```

Keep existing environment settings when adding this line. This is a separate browser map key; never copy the Gemini key here. Restrict the MapTiler key to your frontend origins in its account settings. Vite embeds public map configuration when building, so restart the dev server or rebuild preview after changing it. The actual key is not committed; each teammate configures their own ignored environment.

On the dashboard, try **“I need a ride from UCM to Walmart tonight at 6 pm for one person.”** Click **Find my connections**. Gemini extracts the names; geocoding fills **From**, **To** and their valid coordinates automatically when each match is clear. The map stays hidden and the form displays straight-line distance in miles. UCM/campus and an unspecified Walmart mean Warrensburg; include the city for a distant destination. Review the addresses, then **Confirm & post**. Nothing is saved automatically. Missing pickup/time/seats still need an answer; “here” or “my dorm” never means the campus center.

In **Ride Connect → Create ride post**, type at least three characters in **From** or **To**, pause briefly, then select a street/address/place suggestion. Each selection fills the full name and validated coordinates. Arrow keys and Enter choose a highlighted suggestion; Escape closes the list. Enter never posts the form. [Autocomplete requests](https://docs.maptiler.com/cloud/api/geocoding/) wait for a 400 ms typing pause and cancel outdated queries; saved/automatically resolved names do not trigger typeahead. Editing a suggestion's name clears its old point and distance until another result is selected. Ambiguous sentence names offer choices beneath the corresponding field. Manual choices remain authoritative during lookups and follow-ups. Both valid locations are required for requests and offers; accepted-passenger routes are locked.

**Show map (optional)** opens the existing [satellite imagery with street/place labels](https://docs.maptiler.com/sdk-js/api/map-styles/) (`hybrid-v4`) and **Street map** toggle (`base-v4`). Clicking the map or using **Choose map center** fills the selected location through reverse geocoding. You see street/place names without numeric placeholders. If lookup fails, an explicitly clicked unnamed point can receive a manual name without losing its coordinates. A delayed lookup preserves manual corrections. Existing unbooked drafts with numeric placeholders can resolve names without opening the map, moving their points or automatically saving.

Without a MapTiler key, **Show map (optional)** uses [OpenFreeMap](https://openfreemap.org/quick_start/) Bright without registration/key configuration. MapTiler map load/auth/quota failures switch to this street map. Suggestions and automatic names require MapTiler; if lookup is unavailable, retry or use the optional map and manually name selected points. Internet access and WebGL are needed only for map selections; suggestions do not need WebGL. Attribution remains visible on the optional map. Searches and selected points are sent to MapTiler to find names. Confirmed locations are visible to signed-in students. No GPS permission or road routing is used.

### UCM daily dining menus

Open **Food Connect** at http://localhost:5173/food and click **Check dining menu**, beside **Create a post**. Today's [Todd](https://ucmo.sodexomyway.com/en-us/locations/todd-dining-center-in-todd-hall) and [Ellis](https://ucmo.sodexomyway.com/en-us/locations/ellis-dining-center) Sodexo menus appear inside the page, grouped by meal and station. Click a meal heading to expand/collapse its items. **Hide dining menu** closes the panel without clearing an open post draft.

Run the existing frontend and backend setup commands above; no new dependency, API key, database seed or environment setting is needed for menus. The backend needs internet access to UCM's Sodexo website and `api-prd.sodexomyway.net`. Restart the backend after pulling this feature. To check the endpoint in PowerShell:

```powershell
Invoke-RestMethod http://localhost:8000/api/dining/menus | ConvertTo-Json -Depth 8
```

The server uses today's date in UCM's `America/Chicago` time zone, independent of `SEED_DATE` and your device location. Complete menus are cached for up to five minutes; **Refresh menus** reloads the current server result. An open panel requests a new day's menus after campus midnight. Each hall has its own missing-menu/unavailable state, retry and official link. No menu is invented or replaced with yesterday's food. Consult Sodexo for changed items, ingredients, nutrition, allergens and hours. Mock mode clearly shows fixed synthetic menu examples, not today's food.

Settings load backend/.env, then root .env, then process environment. SQLite defaults to backend/connecthub.db. Startup adds the RideReservation table and idempotently counts older accepted rides without replacing existing posts/connections. Repeated seed adds pins only to labeled synthetic seed rides; user-created unmapped rides remain readable. Edit an open ride to add pins or create a mapped ride for matching. **--refresh** refreshes unbooked seed posts; Ride seed offers with accepted connections retain their dates, status and capacity. SEED_DATE can fix a rehearsal day; otherwise SEED_TIMEZONE supplies today.

For a live ride, use a sentence or **Ride Connect → Create ride post**, choose REQUEST or OFFER, and review both mapped places. Supply requested seats or total offered seats and a departure date/time, then **Confirm & post**. Forms/cards show From → To in miles; matching reasons show pickup and destination separation in miles. The previous 5 km matching gate is unchanged (about 3.11 miles each), with departures within 60 minutes and enough remaining seats. All displayed distances are straight-line, not driving distances/times. Log out, sign in as the recipient and accept in **Connections**. A four-seat offer accepts a one-seat request and stays OPEN with three seats remaining, supporting additional riders until full or **Mark filled**. Pending requests hold no capacity. Accepted Ride connections are terminal; seat release/reopening is deferred. Cookie sessions and CSRF checks authorize the signed-in account; the former demo identity header cannot authorize requests.

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

### Private Security assessment

Sign in as Rafi or Afsana, open http://localhost:5173/security, paste synthetic message or URL text, and click **Assess risk**. Try **“Your university account expires today. Click https://ucm-login-example.xyz to verify your account.”** The result shows HIGH risk, urgency/login-lure reasons, verification advice, limitations and **Analysis mode: llm** when Gemini is available. **Clear analysis** removes the local text/result. Editing the message hides stale results; leaving the page or logging out clears the private draft. A LOW result means fewer detected signals, never a safety guarantee.

The existing live client calls `POST /api/security/analyze` with `{ "text": "..." }`, the student session cookie and `X-CSRF-Token`. Input is 1–8000 characters; validation/auth/provider errors follow the standard envelope. Successful responses use `Cache-Control: no-store`. The analyzer has no database writes or content logging and never fetches submitted links, checks DNS, runs scripts, verifies domain ownership or persists results. The UI treats all supplied content as plain text and creates no public posts or clickable submitted links.

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

These are alternative commands for restricted runners. Current validation used `npm run check -- --maxWorkers=2` (77 tests and TypeScript), `npm run build`, and live Chrome checks. Reducing workers avoids competing with CPU-intensive password tests. Restart/rebuild the frontend after changing `.env.local`.

Each laptop runs its own frontend, backend and seeded SQLite database. Git shares code and fixtures; it does not synchronize live database state. For hosted use, follow [Netlify + Render deployment](docs/DEPLOYMENT.md): Netlify serves the frontend and proxies `/api` to the persistent FastAPI/SQLite service on Render. Private credentials belong in Render's service environment. Netlify needs `BACKEND_URL` and uses `VITE_API_BASE_URL=/api`; nested app routes have an automatic SPA fallback. The Render disk requires paid hosting. A deliberate `VITE_USE_MOCKS=true` deploy is a labeled in-memory fixture demo, not a live backend.

To create a Study post, open http://localhost:5173/study and click **Create study post**. Describe what you need, a partner you are looking for, or help you can offer, then click **Preview study post**. This uses the same AI extraction and editable form as the dashboard with Study selected. Review the course/topic, intent, meeting mode, location and campus date/time; add any missing details in a follow-up sentence or edit the fields yourself. **Confirm & post** saves the post and opens its matches. **Close form** clears the draft without posting. The existing Gemini setup and labeled heuristic fallback apply; no additional backend configuration is needed.

Ride Connect uses the same flow at http://localhost:5173/ride. Click **Create ride post**, describe your ride request or offer, then **Preview ride post**. For example: **“I need a ride from UCM to Walmart on October 4, 2026 at 10 PM for two people.”** AI fills the request/offer intent, origin, destination, departure date/time, seats and any stated trip purpose. Review or correct those values and the resolved From/To addresses, supply missing details in a follow-up sentence, then **Confirm & post** to save and see matches. Both locations require valid coordinates: select a place suggestion, or use **Show map (optional)** when automatic lookup is unavailable. Seats mean needed seats for a request and available seats for an offer. Unspecified facts require clarification; date/time controls use UCM campus time.
