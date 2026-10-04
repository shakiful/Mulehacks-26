# Mulehacks-26

## ConnectHub

An AI-powered student connection platform for a hackathon themed **Connection**.
Students describe a need; ConnectHub extracts details and finds compatible people or resources. Suspicious messages go to a private risk analyzer.

**Status:** React/Vite/Tailwind frontend implemented with synthetic mock responses. Backend implementation and live integration belong to Person 2. Study and Security have reserved page files; the private analyzer is not implemented in the frontend foundation.

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

Person 2 must supply the contracted endpoints, seed the demo identities, and allow `http://localhost:5173` in backend CORS, including the `X-Demo-User-Id` header. Validate preview → corrected post → ranked matches → recipient acceptance against the live service, then implement Study and the private Security analyzer in the reserved files. Live matching, backend authorization, and private analyzer behavior have not yet been verified. Fixtures remain unchanged and there are no API interface changes in this frontend implementation.

Validated on Node 22.20: `npm run check` (19 passing tests) and `npm run build`. Tests cover the live adapter's exact routes/headers/bodies and standard errors, fixture mock ownership and connection transitions, post validation, profile switching, loading/error/empty states, editable previews, and private Security routing. Headless Chrome checks at 1440px and 390px widths confirmed the responsive dashboard. Backend acceptance checks remain pending.

## Target backend local development
Python backend: FastAPI + SQLAlchemy + SQLite. Frontend: React + Vite + Tailwind.

After implementation, from the repository root:

```bash
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r backend/requirements.txt
# Copy .env.example to .env and choose local settings.
python -m backend.app.seed
python -m uvicorn backend.app.main:app --reload --port 8000
```

Frontend: http://localhost:5173. Target backend: http://localhost:8000.
API documentation after implementation: http://localhost:8000/docs.
Vite reads frontend/.env.local; set `VITE_API_BASE_URL=http://localhost:8000/api` there. Only public configuration belongs in VITE variables.

Each laptop runs its own frontend, backend and seeded SQLite database. Git shares code and fixtures; it does not synchronize live database state. During the final demo, run both services on one chosen laptop. Hosting or a shared backend is optional later work.

AI provider models are configurable. Select available models when implementing, then record tested names in .env.example and the README. A labeled offline heuristic fallback should keep the demo usable; it is not equivalent to semantic embeddings.
