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
- [ ] P2-7: Private security analyzer, evidence reasons, no URL fetching/logging; Security UI via shared components.
- [ ] P2-8: Study page using shared client/cards and corrected extracted fields.
- [x] P2-9: 206 backend tests for routes, edge cases, provider failures/recovery, Gemini defaults, word clocks/ranges, semantic weights, versioned caches and integration fixes. Google wire formats, structured extraction, time guards and secret redaction are covered. Live browser request → confirmed ride → matches → recipient acceptance verified; Security checks await that feature. Synthetic hosted Google calls passed; the live frontend showed an LLM SQL preview and Sarah's tutor in SEMANTIC mode at 87.1/100, plus missing-detail questions and follow-up sentence autofill. Frontend checks total 30 tests, TypeScript and production build.

## Person 1
- [x] P1-1: React/Vite/Tailwind foundation, dashboard/navigation and demo profile selector.
- [x] P1-2: Shared PostCard/MatchCard/CreatePost/components, one typed API client and mock mode.
- [x] P1-3: Natural-language preview, editable confirmation, category routing and missing-field UI (scripted mock previews).
- [x] P1-4: Ride form/list/matches; request/offer and seats semantics (new mock posts return empty matches).
- [x] P1-5: Food form/groups; no booking/ordering claims.
- [x] P1-6: Community page by reusing shared forms/cards.
- [x] P1-7: Connection request/inbox/accept/decline/cancel and post completion UI (fixture workflow).
- [x] P1-8: Loading/error/empty states, accessible controls and frontend checks.

### Person 2 frontend handoff

- **Study:** `frontend/src/pages/StudyPage.tsx`, route `/study`. Placeholder currently displays the shared Study post board. Person 2 owns the dedicated Study workflow.
- **Security:** `frontend/src/pages/SecurityPage.tsx`, route `/security`. Private placeholder only. Person 2 owns the analyzer UI; do not create public posts or persist/fetch pasted messages/URLs.
- Shared API: `frontend/src/api/types.ts` defines `ApiClient`; `frontend/src/context/ApiContext.tsx` exports `useApi()`. Call `api.understand`, `api.createPost`, `api.getMatches`, or `api.analyzeSecurity` rather than creating another client.
- Shared UI: `components/CreatePost.tsx`, `PostCard.tsx`, `MatchCard.tsx`, `PostBoard.tsx`, `Field.tsx`, `States.tsx`; async loader: `hooks/useResource.ts`. Pages render inside the existing layout.
- Person 1 owns `App.tsx`, navigation, styles, dependencies and API adapters. Coordinate any shared-file edits.
- Live API mode is the default. Set `VITE_USE_MOCKS=true` in `frontend/.env.local` to explicitly choose fixtures. The live base URL defaults to `http://localhost:8000/api`; restart Vite after changing environment settings. Mock matching replays only supplied fixture candidates/scores; newly created posts have no canned matches.
- Live API/CORS integration, Gemini-first understanding/embeddings with heuristic fallback, and connection acceptance now work. Rafi's user-authorized shared-form changes add missing-detail questions and sentence follow-up autofill in CreatePost, preserve manual edits, and retain the original preview clock from DashboardPage. ApiContext now requires explicit mock opt-in. Existing API types/adapters, contract and fixtures are unchanged. Remaining: private Security analyzer and dedicated Study workflow. Configure Google only in the ignored backend environment.
- Rafi's current changes are on `AI-backend`, refreshed from the verified main commit `c0b9d50`. Earlier Person 1 frontend work was on `feat/frontend`.
- Frontend validation: 30 tests, TypeScript and production build passed. Existing desktop (1440px) and mobile (390px) dashboard smoke checks passed in headless Chrome; the new sentence clarification flow was verified in the live browser. Backend validation is recorded under P2-9 above.

## Integration checkpoints
- Hours 0–2: contract/fixtures and skeletons; each person builds independently.
- Hours 2–5: connect frontend profile selector and posts to actual backend.
- Hours 5–11: preview → create → matches; validate SQL example and Ride gates together.
- Hours 11–14: private Security workflow and remaining category adapters.
- Hours 14–17: connection lifecycle on both demo identities; fix response differences.
- Hours 17–22: regression checks, offline/provider failure demonstration and UI polish.
- Final 2 hours: freeze scope, reseed data and rehearse demo.

Each PR describes behavior, changed contract (if any) and checks run. Prefer small complete vertical slices. If time runs short, keep Ride + Study + Security demonstrable and reuse minimal Food/Community cards.
