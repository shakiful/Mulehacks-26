# Ownership and build order

Unchecked boxes are planned work, not completed features. Source schedule assumes ~24 hours; adjust to actual time remaining.

## Shared checkpoint 0 — contract
- [x] Person 1 inspected the repository: documentation and fixtures only; no existing application code to reconcile. API interfaces unchanged.
- [x] Original MVP used synthetic demo identity. The October 4 user request supersedes this with student session authentication; API contract and both consumers updated together. SQLite remains `backend/connecthub.db`.
- [x] Person 1 reserved dedicated Study/Security page filenames for Person 2 (paths below).
- [x] Load JSON fixtures in the frontend mock client; same public API methods in live mode.

## Person 2 — Rafi
- [x] P2-1: FastAPI app/config/CORS, SQLAlchemy/SQLite and seed command; /health. Demo profiles subsequently replaced by student login (P1-11).
- [x] P2-2: Pydantic category schemas, post create/list/get/status, standard errors and ownership checks.
- [x] P2-3: Connection create/list/transitions; duplicate checks and participant validation.
- [x] P2-4: Understanding service interface, Gemini-first hosted classify/extract previews, focused missing-detail questions and sentence follow-up autofill, manual-edit preservation, word-number clocks/ranges, provider validation and labeled offline fallback. Synthetic live Google extraction and browser autofill verified; API contract unchanged.
- [x] P2-5: Configurable OpenAI/Gemini embedding service, SQLite cache with provider/model/dimensions/input version/hash, repeatable backfill, semantic Study scoring, candidate constraints, reasons and deterministic ordering. Offline fallback retained; provider format/cache/ranking tested with fakes. Live Gemini SQL/relational-database versus physics smoke check passed with 768-dimensional vectors; no accuracy benchmark claimed.
- [x] P2-6: Heuristic Ride/Food/Community matching behind the same service; rules recorded in ARCHITECTURE.md.
- [ ] P2-7: Private security analyzer, evidence reasons, no URL fetching/logging; Security UI via shared components.
- [ ] P2-8: Study page using shared client/cards and corrected extracted fields.
- [x] P2-9: 206 backend tests for routes, edge cases, provider failures/recovery, Gemini defaults, word clocks/ranges, semantic weights, versioned caches and integration fixes. Google wire formats, structured extraction, time guards and secret redaction are covered. Live browser request → confirmed ride → matches → recipient acceptance verified; Security checks await that feature. Synthetic hosted Google calls passed; the live frontend showed an LLM SQL preview and Afsana's tutor in SEMANTIC mode at 87.1/100, plus missing-detail questions and follow-up sentence autofill. Frontend checks total 30 tests, TypeScript and production build.

## Person 1
- [x] P1-1: React/Vite/Tailwind foundation and dashboard/navigation. The original demo profile selector is removed by P1-11.
- [x] P1-2: Shared PostCard/MatchCard/CreatePost/components, one typed API client and mock mode.
- [x] P1-3: Natural-language preview, editable confirmation, category routing and missing-field UI (scripted mock previews).
- [x] P1-4: Ride form/list/matches; request/offer and seats semantics (new mock posts return empty matches).
- [x] P1-5: Food form/groups; no booking/ordering claims.
- [x] P1-6: Community page by reusing shared forms/cards.
- [x] P1-7: Connection request/inbox/accept/decline/cancel and post completion UI (fixture workflow).
- [x] P1-8: Loading/error/empty states, accessible controls and frontend checks.
- [x] P1-9: Shared saved-post editor for Ride/Study/Food/Community, owner-only open-post links, prefilled fields, Save/Cancel, validation/retry, success feedback, mock persistence and typed live adapter. Frontend checks: 41 tests, TypeScript and production build passed.
- [x] P1-10: Separate calendar/time controls with readable AM/PM summaries, shared campus-time conversion, preview/edit prefill, manual-date preservation, optional clearing and daylight-saving clarification. Dashboard previews and cards consistently use America/Chicago. All 52 frontend tests, TypeScript and production build passed; five focused backend UTC/create/edit checks passed. API shapes and backend UTC storage are unchanged. Live browser create/edit/reload and matching passed for October 4 at 10 PM with browser timezone Asia/Dhaka. Desktop/mobile picker screenshots were reviewed; synthetic verification posts were cancelled.
- [x] P1-11: `/login` student sign-in, protected app routes, server session restoration, signed-in name/avatar, logout and session expiration handling. Two local test accounts: `rafi` (Rafi) and `afsana` (Afsana); passwords configured only in ignored backend/.env. Removed demo selector/list endpoint/header and demo settings. User-authorized backend account/session tables, salted password hashing, cookie/CSRF validation, throttling and explicit password reset command. Existing post/connection records preserved; legacy author id 2 renamed to Afsana, other historical authors have no login account. Contract, fixtures, live/mock consumers and setup documents reconciled. Authentication, ownership and migration checks added alongside existing workflow coverage. Validation: all 243 backend tests, 62 frontend tests, TypeScript and production build passed; live Chrome verified both logins, reload/logout, owner guards, same-time Ride matching and recipient acceptance. Desktop/mobile login screenshots reviewed; synthetic verification posts cancelled.
- [x] Saved-post live persistence: user-authorized `PUT /posts/{post_id}` and CORS extension applied with creation validation, author/OPEN/category guards and an atomic update. Status PATCH and existing connections remain unchanged; no database migration or reseeding is needed. All 230 backend tests and 41 frontend tests, TypeScript, and the production build passed. Live browser saves/reloads passed for all four categories, including optional-field clearing, stable IDs/counts and author/closed-post guards. Desktop/mobile editor screenshots were reviewed. Synthetic verification posts were cancelled; existing posts were not edited.

### Person 2 frontend handoff

- **Study:** `frontend/src/pages/StudyPage.tsx`, route `/study`. Placeholder currently displays the shared Study post board. Person 2 owns the dedicated Study workflow.
- **Security:** `frontend/src/pages/SecurityPage.tsx`, route `/security`. Private placeholder only. Person 2 owns the analyzer UI; do not create public posts or persist/fetch pasted messages/URLs.
- Shared API (cookie session and CSRF handled centrally; `useApi()` exposes the signed-in user and `signOut`): `frontend/src/api/types.ts` defines `ApiClient`; `frontend/src/context/ApiContext.tsx` exports `useApi()`. Call `api.understand`, `api.createPost`, `api.getMatches`, or `api.analyzeSecurity` rather than creating another client.
- Shared UI: `components/CreatePost.tsx`, `PostCard.tsx`, `MatchCard.tsx`, `PostBoard.tsx`, `Field.tsx`, `States.tsx`; async loader: `hooks/useResource.ts`. Pages render inside the existing layout.
- Person 1 owns `App.tsx`, navigation, styles, dependencies and API adapters. Coordinate any shared-file edits.
- Live API mode is the default. Set `VITE_USE_MOCKS=true` in `frontend/.env.local` to explicitly choose fixtures. The live base URL defaults to `http://localhost:8000/api`; restart Vite after changing environment settings. Mock matching replays only supplied fixture candidates/scores; newly created posts have no canned matches.
- Live API/CORS integration, Gemini-first understanding/embeddings with heuristic fallback, connection acceptance and saved-post editing now work. Rafi's user-authorized shared-form changes add missing-detail questions and sentence follow-up autofill in CreatePost, preserve manual edits, and retain the original preview clock from DashboardPage. ApiContext requires explicit mock opt-in. Clarification uses the existing understanding API; saved-post editing adds PUT with matching typed adapters, contract and fixtures. Remaining: private Security analyzer and dedicated Study workflow. Configure Google only in the ignored backend environment.
- Rafi's current changes are on `AI-backend`, refreshed from the verified main commit `c0b9d50`. Earlier Person 1 frontend work was on `feat/frontend`.
- Frontend validation: 62 tests, TypeScript and production build passed. Existing desktop (1440px) and mobile (390px) dashboard smoke checks passed in headless Chrome; sentence clarification and four-category saved-post editing were verified in the live browser. Editor screenshots passed desktop/mobile review. Backend validation: 243 tests, including 13 authentication checks and 24 editing checks; earlier provider coverage is recorded under P2-9 above.

## Integration checkpoints
- Hours 0–2: contract/fixtures and skeletons; each person builds independently.
- Hours 2–5: connect frontend sign-in/session and posts to actual backend.
- Hours 5–11: preview → create → matches; validate SQL example and Ride gates together.
- Hours 11–14: private Security workflow and remaining category adapters.
- Hours 14–17: connection lifecycle on both student test accounts; fix response differences.
- Hours 17–22: regression checks, offline/provider failure demonstration and UI polish.
- Final 2 hours: freeze scope, reseed data and rehearse demo.

Each PR describes behavior, changed contract (if any) and checks run. Prefer small complete vertical slices. If time runs short, keep Ride + Study + Security demonstrable and reuse minimal Food/Community cards.
