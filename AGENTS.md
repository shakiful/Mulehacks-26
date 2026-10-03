# ConnectHub — shared development instructions

ConnectHub is a two-person hackathon prototype for the theme **Connection**.
Understand → Extract → Match → Connect → Protect.

Before changing code, inspect the repository and read:
1. docs/PROJECT_SPEC.md
2. docs/ARCHITECTURE.md
3. docs/API_CONTRACT.md
4. docs/TASKS.md

This package contains a proposed implementation contract derived from the source plan. Existing code may differ: report discrepancies and reconcile the documentation before changing interfaces. Do not assume the project is already implemented. Preserve existing files, tooling, and working features.

## Ownership
- Person 1: frontend platform, dashboard, reusable components, Ride/Food/Community UI, frontend API integration and UI tests.
- Person 2 (Rafi): backend, database, API, classification/extraction, embeddings, matching, Study functionality and cybersecurity analyzer; Study/Security UI within dedicated frontend page files agreed with Person 1.
- Person 1 owns shared frontend navigation, styling, dependencies and API client. Person 2 uses those components rather than creating parallel systems.
- Both review changes to the API contract. Make cross-owner changes only when necessary for the assigned task, explain them, and keep them small.

## Working rules
- Work on your role's branch; merge completed changes through pull requests.
- Keep main runnable. Never force-push shared branches or discard another person's changes.
- Update API_CONTRACT.md, fixtures and both consumers together when an interface changes.
- Keep AI providers behind service interfaces; never call providers directly from routes or the browser.
- Credentials stay in local .env files. Never commit credentials, database files or real private messages.
- Use explicitly labeled seed data and demo identity. No claim of verified identities or production authentication.
- Treat matching scores as compatibility scores, not probabilities. Security analysis is a risk assessment, not a safety guarantee.
- Never fetch user-submitted URLs in the security analyzer. Analyze text and URL structure only.
- Resolve relative time using the request's reference_time and timezone; ask for clarification rather than inventing dates, origins or availability.
- Run checks appropriate to the changed behavior. Test API shapes, matching exclusions, authorization of demo records, and security output where relevant. Report what passed and what remains incomplete.
- Prefer the working MVP. See PROJECT_SPEC.md for deferred scope.
