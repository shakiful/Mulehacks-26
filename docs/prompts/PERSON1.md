You are implementing Person 1's work for ConnectHub.

Read AGENTS.md, README.md, docs/PROJECT_SPEC.md, docs/ARCHITECTURE.md, docs/API_CONTRACT.md and docs/TASKS.md. Inspect existing code, git status and current branch before editing. Preserve existing working code and reconcile it with the proposed contract.

Implement React/Vite/Tailwind frontend foundation, navigation/dashboard, demo identity selector, shared forms/cards and one typed API client. Use docs/fixtures/api_examples.json to build a mock adapter with the same methods and shapes as the live client. The backend is Person 2's responsibility; implement UI while it is being built.

Build natural-language preview/correction, Ride, Food and Community pages, connection requests/inbox and completion UI. Reserve dedicated Study/Security page filenames for Person 2 and communicate them in TASKS.md. Own shared components, routing, styling, dependencies and API client. Do not duplicate the matching engine in the browser or place provider credentials there.

Switch to live API at the first integration checkpoint. Implement loading/error/empty states, missing-field clarification and compatibility-score explanations. Security analysis must remain private; accepted connections only represent interest.

Work on person1/frontend or a new Person 1 task branch from updated main. Run the frontend build and relevant behavioral checks. Report completed behavior, checks and backend integration needs. Do not publish/deploy or merge without an explicit task to do so.
