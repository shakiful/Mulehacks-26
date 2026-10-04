You are implementing Person 2's work for ConnectHub. I am Rafi, Person 2.

Read AGENTS.md, README.md, docs/PROJECT_SPEC.md, docs/ARCHITECTURE.md, docs/API_CONTRACT.md and docs/TASKS.md. Inspect existing code, git status and current branch before editing. Reconcile existing behavior with this proposed contract; preserve working code. Do not assume this handoff is implemented.

First implement the backend foundation: FastAPI configuration, SQLite/SQLAlchemy models, validated post schemas, synthetic demo users/seed command, health, CORS, posts endpoints, standard errors and ownership checks. Follow API_CONTRACT.md. Add meaningful tests and update actual run commands. Keep provider calls out of routes.

Then implement connections, classify/extract preview, embedding service, category filtering/scoring, Study workflow and private security analysis in that order. Use a labeled heuristic fallback when configured AI is unavailable. Study/Security UI work must use Person 1's agreed dedicated page paths and shared client/components; avoid changing shared frontend infrastructure without coordination.

Work on person2/backend-ai or a new Person 2 task branch from updated main. Implement and validate each complete slice before continuing. Report completed behavior, checks run, contract changes and integration needs. Do not publish/deploy or merge without an explicit task to do so.
