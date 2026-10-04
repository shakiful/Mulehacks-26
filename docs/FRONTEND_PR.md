# Add ConnectHub frontend and fixture-backed workflows

ConnectHub previously contained only planning documents and synthetic response fixtures. This change adds a runnable React/Vite/Tailwind frontend so Person 1 can develop and demonstrate the shared workflows while Person 2 builds the API.

The dashboard provides five category shortcuts, a demo profile selector, natural-language preview/correction, shared post/match cards and forms, Ride/Food/Community boards, post completion, and a connection inbox. The fixture SQL request can send a connection to the tutoring offer; switching from Rafi to Sarah lets the recipient accept or decline. Mock response controls demonstrate loading, empty and error behavior. Accepted requests express interest without reserving capacity or completing posts.

One typed API interface backs both the fixture mock and the live HTTP adapter, following the existing API contract. No API interfaces, fixtures or backend files changed. The mock is an in-memory demo: dates and scores are illustrative, new posts have no canned matches, and previews ask for missing facts instead of inferring relative times. The browser contains no matching engine or AI provider calls.

Person 2 owns `frontend/src/pages/StudyPage.tsx` (`/study`) and `frontend/src/pages/SecurityPage.tsx` (`/security`). These are reserved placeholders using shared infrastructure; the private analyzer still needs implementation. Security-classified previews route privately without publishing the text.

Validation:

- `cd frontend && npm run check`: TypeScript and 19 passing behavior tests.
- `cd frontend && npm run build`: production build passed.
- Headless Chrome dashboard checks at 1440px and 390px widths.
- `git diff --check`: clean.

For live integration, set `VITE_USE_MOCKS=false` and `VITE_API_BASE_URL=http://localhost:8000/api` in `frontend/.env.local`, restart Vite, and run the contracted backend with seeded identities and CORS allowing the frontend origin and demo identity header. Live backend integration and the dedicated Study/Security workflows remain pending.

The implementation stays on the user's existing `feat/frontend` branch. GitHub authentication was unavailable for fetching main or publishing a PR. This file is the prepared PR description; no merge was performed.
