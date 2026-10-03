# Ownership and build order

Unchecked boxes are planned work, not completed features. Source schedule assumes ~24 hours; adjust to actual time remaining.

## Shared checkpoint 0 — contract
- [ ] Inspect existing repository and reconcile this package with existing code.
- [ ] Confirm MVP API, identity mode, branch names and database paths.
- [ ] Person 1 agrees dedicated Study/Security page filenames for Person 2.
- [ ] Load JSON fixtures in the frontend mock client; same public API methods in live mode.

## Person 2 — Rafi
- [ ] P2-1: FastAPI app/config/CORS, SQLAlchemy/SQLite and seed command; /health and demo profiles.
- [ ] P2-2: Pydantic category schemas, post create/list/get/status, standard errors and ownership checks.
- [ ] P2-3: Connection create/list/transitions; duplicate checks and participant validation.
- [ ] P2-4: AI service interfaces, classify/extract preview, manual override, time clarification, provider JSON validation and offline fallback.
- [ ] P2-5: Embeddings and version metadata, candidate constraints, Study scoring, reasons and deterministic ordering.
- [ ] P2-6: Ride/Food/Community matching behind the same service.
- [ ] P2-7: Private security analyzer, evidence reasons, no URL fetching/logging; Security UI via shared components.
- [ ] P2-8: Study page using shared client/cards and corrected extracted fields.
- [ ] P2-9: Tests, edge cases, provider failures and backend integration fixes.

## Person 1
- [ ] P1-1: React/Vite/Tailwind foundation, dashboard/navigation and demo profile selector.
- [ ] P1-2: Shared PostCard/MatchCard/CreatePost/components, one typed API client and mock mode.
- [ ] P1-3: Natural-language preview, editable confirmation, category routing and missing-field UI.
- [ ] P1-4: Ride form/list/matches; request/offer and seats semantics.
- [ ] P1-5: Food form/groups; no booking/ordering claims.
- [ ] P1-6: Community page by reusing shared forms/cards.
- [ ] P1-7: Connection request/inbox/accept/decline and post completion UI.
- [ ] P1-8: Loading/error/empty states, accessible controls and frontend build check.

## Integration checkpoints
- Hours 0–2: contract/fixtures and skeletons; each person builds independently.
- Hours 2–5: connect frontend profile selector and posts to actual backend.
- Hours 5–11: preview → create → matches; validate SQL example and Ride gates together.
- Hours 11–14: private Security workflow and remaining category adapters.
- Hours 14–17: connection lifecycle on both demo identities; fix response differences.
- Hours 17–22: regression checks, offline/provider failure demonstration and UI polish.
- Final 2 hours: freeze scope, reseed data and rehearse demo.

Each PR describes behavior, changed contract (if any) and checks run. Prefer small complete vertical slices. If time runs short, keep Ride + Study + Security demonstrable and reuse minimal Food/Community cards.
