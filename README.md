# Mulehacks-26

## ConnectHub

An AI-powered student connection platform for a hackathon themed **Connection**.
Students describe a need; ConnectHub extracts details and finds compatible people or resources. Suspicious messages go to a private risk analyzer.

**Status:** planning/handoff package. Application commands below are target commands for the implementation; dependencies and entry points must be created before they run.

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

## Target local development
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

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Target frontend: http://localhost:5173. Backend: http://localhost:8000.
API documentation after implementation: http://localhost:8000/docs.
Vite reads frontend/.env.local; set `VITE_API_BASE_URL=http://localhost:8000/api` there. Only public configuration belongs in VITE variables.

Each laptop runs its own frontend, backend and seeded SQLite database. Git shares code and fixtures; it does not synchronize live database state. During the final demo, run both services on one chosen laptop. Hosting or a shared backend is optional later work.

AI provider models are configurable. Select available models when implementing, then record tested names in .env.example and the README. A labeled offline heuristic fallback should keep the demo usable; it is not equivalent to semantic embeddings.
