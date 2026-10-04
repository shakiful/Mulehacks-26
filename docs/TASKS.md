# Ownership and build order

Unchecked boxes are planned work, not completed features. Source schedule assumes ~24 hours; adjust to actual time remaining.

## Shared checkpoint 0 — contract
- [x] Person 1 inspected the repository: documentation and fixtures only; no existing application code to reconcile. API interfaces unchanged.
- [x] MVP API unchanged; local synthetic demo identity, branch `AI-backend`, SQLite `backend/connecthub.db`.
- [x] Person 1 reserved dedicated Study/Security page filenames for Person 2 (paths below).
- [x] Load JSON fixtures in the frontend mock client; same public API methods in live mode.

## Person 2 — Rafi
- [x] P2-1: FastAPI app/config/CORS, SQLAlchemy/SQLite and seed command; /health and demo profiles.
- [x] P2-2: Pydantic category schemas, post create/list/get/status, standard errors and ownership checks.
- [x] P2-3: Connection create/list/transitions; duplicate checks and participant validation.
- [x] P2-4: Understanding service interface, Gemini-first hosted classify/extract previews, focused missing-detail questions and sentence follow-up autofill, manual-edit preservation, word-number clocks/ranges, provider validation and labeled offline fallback. Synthetic live Google extraction and browser autofill verified; API contract unchanged.
- [x] P2-5: Configurable OpenAI/Gemini embedding service, SQLite cache with provider/model/dimensions/input version/hash, repeatable backfill, semantic Study scoring, candidate constraints, reasons and deterministic ordering. Offline fallback retained; provider format/cache/ranking tested with fakes. Live Gemini SQL/relational-database versus physics smoke check passed with 768-dimensional vectors; no accuracy benchmark claimed.
- [x] P2-6: Heuristic Ride/Food/Community matching behind the same service; rules recorded in ARCHITECTURE.md.
- [x] P2-7: Private Gemini-first security analyzer with validated evidence, typed risk/reasons/guidance/limitations, labeled heuristic fallback, input/auth checks and no URL fetching, content logging or persistence. Dedicated Security page uses shared API/components, displays request states/modes and clears private drafts. Synthetic live HIGH/LOW checks and browser assessment passed.
- [ ] P2-8: Study page using shared client/cards and corrected extracted fields.
- [x] P2-9: 328 backend tests for implemented routes, edge cases, provider failures/recovery, Gemini defaults, clocks/ranges, semantic ranking/caches, private Security and daily dining menus. The 49 Security checks cover input/auth, no writes/logging/link visits, URL structure and invalid/invented evidence. The 17 dining checks cover public API shape/no database access, campus dates/DST, cache expiry/midnight, partial failure/recovery, empty/malformed feed and fixed-host bounded transport. Synthetic Google HIGH account-expiry/login-lure and LOW study/security-education checks passed; a live browser assessment displayed LLM HIGH with urgency/login-lure reasons. Earlier ride acceptance, SQL semantic tutor and follow-up autofill checks remain valid. Frontend total: 77 tests, TypeScript and production build, including seven private Security and six dining UI tests.

### Additional requested feature
- [x] Mapped Ride routes and shared seats (2026-10-04): explicit From/To pins required for REQUEST/OFFER, MapTiler preferred with a public local key and OpenFreeMap fallback, 5 km pickup/destination gates and distance-weighted compatibility. Atomic reservations support 1 + 1 + 2 riders in a four-seat offer; requests complete on acceptance, offers remain open until full or Mark filled. Existing posts/connection records are preserved, old accepted rides backfill once, unmapped posts stay readable, and booked seed offers are not reset. Accepted routes/times and reserved capacity are protected during saved-post edits, including concurrent edit/acceptance. Contract, fixtures, live/mock consumers, form/cards and setup docs change together. Shared frontend edits are necessary for the user's requested Ride workflow; MapLibre is the only new dependency. 328 backend and 77 frontend tests, TypeScript and production build pass.
- [x] UCM dining menus: Food Connect's **Check dining menu** button beside **Create a post** loads today's Todd/Ellis Sodexo listings through the shared client. Separate hall cards and expandable meal sections preserve an open post draft; source links, refresh, empty/unavailable states, mock labeling and Central-time midnight refresh are included. The additive public API contract, fixtures, live/mock adapters, setup docs and tests were updated together. Live Brunch/Dinner feeds and the browser panel were verified on 2026-10-04. No dining key, new dependency, AI call or database write is needed. Shared frontend changes are limited to the requested Food button and the API extension; layout/styles/dependencies remain unchanged.

## Person 1
- [x] P1-1: React/Vite/Tailwind foundation, dashboard/navigation and demo profile selector.
- [x] P1-2: Shared PostCard/MatchCard/CreatePost/components, one typed API client and mock mode.
- [x] P1-3: Natural-language preview, editable confirmation, category routing and missing-field UI (scripted mock previews).
- [x] P1-4: Ride form/list/matches; request/offer and seats semantics (new mock posts return empty matches).
- [x] P1-5: Food form/groups; no booking/ordering claims.
- [x] P1-6: Community page by reusing shared forms/cards.
- [x] P1-7: Connection request/inbox/accept/decline/cancel and post completion UI (fixture workflow).
- [x] P1-8: Loading/error/empty states, accessible controls and frontend checks.
- [x] P1-9: Shared saved-post editor for Ride/Study/Food/Community, owner-only open-post links, prefilled fields, Save/Cancel, validation/retry, success feedback, mock persistence and typed live adapter. Frontend checks: 41 tests, TypeScript and production build passed.
- [x] P1-10: Separate calendar/time controls with readable AM/PM summaries, shared campus-time conversion, preview/edit prefill, manual-date preservation, optional clearing and daylight-saving clarification. Dashboard previews and cards consistently use America/Chicago. All 52 frontend tests, TypeScript and production build passed; five focused backend UTC/create/edit checks passed. API shapes and backend UTC storage are unchanged. Live browser create/edit/reload and matching passed for October 4 at 10 PM with browser timezone Asia/Dhaka. Desktop/mobile picker screenshots were reviewed; synthetic verification posts were cancelled.
- [x] Saved-post live persistence: user-authorized `PUT /posts/{post_id}` and CORS extension applied with creation validation, author/OPEN/category guards and an atomic update. Status PATCH and existing connections remain unchanged; no database migration or reseeding is needed. All 230 backend tests and 41 frontend tests, TypeScript, and the production build passed. Live browser saves/reloads passed for all four categories, including optional-field clearing, stable IDs/counts and author/closed-post guards. Desktop/mobile editor screenshots were reviewed. Synthetic verification posts were cancelled; existing posts were not edited.

### Person 2 frontend handoff

- **Study:** `frontend/src/pages/StudyPage.tsx`, route `/study`. Placeholder currently displays the shared Study post board. Person 2 owns the dedicated Study workflow.
- **Security:** `frontend/src/pages/SecurityPage.tsx`, route `/security`. Implemented private analyzer with shared client/components. Pasted text and results stay in mounted-page memory; profile changes/clearing/navigation remove the draft. No public posts, persisted content or submitted-link fetching.
- Shared API: `frontend/src/api/types.ts` defines `ApiClient`; `frontend/src/context/ApiContext.tsx` exports `useApi()`. Call `api.understand`, `api.createPost`, `api.getMatches`, or `api.analyzeSecurity` rather than creating another client.
- Shared UI: `components/CreatePost.tsx`, `PostCard.tsx`, `MatchCard.tsx`, `PostBoard.tsx`, `Field.tsx`, `States.tsx`; async loader: `hooks/useResource.ts`. Pages render inside the existing layout.
- Person 1 owns `App.tsx`, navigation, styles, dependencies and API adapters. Coordinate any shared-file edits.
- Live API mode is the default. Set `VITE_USE_MOCKS=true` in `frontend/.env.local` to explicitly choose fixtures. The live base URL defaults to `http://localhost:8000/api`; restart Vite after changing environment settings. Mock matching replays only supplied fixture candidates/scores; newly created posts have no canned matches.
- Live API/CORS, Gemini-first understanding/embeddings/security with heuristic fallback, connections, daily dining menus and saved-post editing work. The mapped Ride contract adds required coordinates, computed availability and reserved connection seats; both consumers and fixtures are updated. MapLibre loads only for Ride forms. Next: P2-8 dedicated Study workflow.
- Rafi's current changes are on `AI-backend`, incorporating main's post editor/calendar work through verified merge `bfaa5c0`. Person 1 frontend work remains preserved.
- Validation: 328 backend and 77 frontend tests, TypeScript and production build. Live MapTiler creation, matching, one-seat acceptance and an OPEN four-seat offer with three remaining seats were checked. Google belongs only in the ignored backend environment; the separate public MapTiler browser key belongs in ignored `frontend/.env.local`. Without that key the map uses OpenFreeMap.

## Integration checkpoints
- Hours 0–2: contract/fixtures and skeletons; each person builds independently.
- Hours 2–5: connect frontend profile selector and posts to actual backend.
- Hours 5–11: preview → create → matches; validate SQL example and Ride gates together.
- Hours 11–14: private Security workflow and remaining category adapters.
- Hours 14–17: connection lifecycle on both demo identities; fix response differences.
- Hours 17–22: regression checks, offline/provider failure demonstration and UI polish.
- Final 2 hours: freeze scope, reseed data and rehearse demo.

Each PR describes behavior, changed contract (if any) and checks run. Prefer small complete vertical slices. If time runs short, keep Ride + Study + Security demonstrable and reuse minimal Food/Community cards.
