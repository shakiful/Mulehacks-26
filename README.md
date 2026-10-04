# Mulehacks-26

## ConnectHub backend

Implemented: FastAPI, SQLite/SQLAlchemy, synthetic demo users, validated posts
for Ride/Study/Food/Community, ownership checks, CORS and standard API errors.
AI understanding, matching, connections and security analysis are later tasks.
This slice changes only backend files and this README; frontend belongs to Person 1.

Requires Python 3.11+ (tested on 3.12). Run from the repository root:

```bash
python -m venv backend/.venv
```

Windows PowerShell:

```powershell
.\backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
python -m backend.app.seed
python -m uvicorn backend.app.main:app --reload --port 8000
```

macOS/Linux:

```bash
source backend/.venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
cp backend/.env.example backend/.env
python -m backend.app.seed
python -m uvicorn backend.app.main:app --reload --port 8000
```

For server-only installs use `backend/requirements.txt`. For the exact tested
dependency snapshot use `backend/requirements-lock.txt`. Preserve an existing
local `.env` when updating. `backend/.env` is ignored by Git. A root `.env`, if
present, overrides it; process environment overrides both. Keep credentials and
SQLite files local. Each laptop uses its own database.

| Configuration | Default / meaning |
| --- | --- |
| `DEMO_MODE` | `true`; synthetic local identity, not production authentication |
| `DATABASE_URL` | SQLite file at `backend/connecthub.db`; explicit relative URLs resolve from the working directory |
| `CORS_ORIGINS` | `http://localhost:5173`; comma-separated explicit frontend origins |
| `DEMO_DATE` | Empty: today in `DEMO_TIMEZONE`; otherwise ISO date, e.g. `2026-10-03` |
| `DEMO_TIMEZONE` | `America/Chicago`; IANA timezone for seed dates |

Startup creates tables. Seed separately to add identities 1 Rafi, 2 Sarah,
3 Alex, 4 Jamie (each labeled demo) and six synthetic posts: two Walmart rides,
SQL tutoring, a Python partner, a food group and a calculator offer.
Repeating the command adds no duplicates and preserves edited/user-created posts.
Use `python -m backend.app.seed --refresh` after changing `DEMO_DATE` to reset
only seed posts to that date and OPEN. Conflicting identity IDs stop the seed
transaction without overwriting records.

## Person 1 integration

Base: `http://localhost:8000/api`. [Interactive API schemas](http://localhost:8000/docs).
Set `VITE_API_BASE_URL=http://localhost:8000/api` and `VITE_USE_MOCKS=false` in
`frontend/.env.local`. Keep server credentials out of VITE variables.
Choose a profile from `/api/demo/users`; send `X-Demo-User-Id: 1` (or another
listed ID) on every post request. Body `user_id`/`author` overrides are rejected.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/health` | Public `{ "status": "ok", "demo_mode": true }` |
| `GET /api/demo/users` | Public `{ "items": [{ "id": 1, "name": "Rafi (demo)" }, ...] }` |
| `POST /api/posts` | Confirmed category-specific body; 201 Post |
| `GET /api/posts` | Optional category, status (default OPEN), user_id; limit 1–100 (default 20), offset >=0 |
| `GET /api/posts/{id}` | Post visible to any selected demo profile |
| `PATCH /api/posts/{id}` | Author sets COMPLETED/CANCELLED; already closed returns 409 |

List shape: `{ "items": [...], "total": n, "limit": 20, "offset": 0 }`.
Posts are ordered newest first, descending ID for ties. Post responses include
author/status/timestamps and explicit null common optional fields. Input times
require UTC offsets; returned times are UTC. There is no `/posts/{category}`
endpoint; use category query filters.

Validation: RIDE requires origin/destination/seats/time; STUDY requires course or
topic; RESTAURANT requires restaurant or cuisine/activity_type/group_size/time;
COMMUNITY requires its documented subcategory. PARTNER applies only to
Study/Community. Title/text lengths are 1–120/1–4000. End requires start and
must be later. Use Swagger UI for the complete category schemas.

All errors use `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "field": "details.seats", "message": "..." }] } }`.
Handle 401 missing/unknown identity, 403 wrong owner, 404 missing resource,
409 closed-post conflict and 422 validation. Use `details[].field` for form feedback.
`DEMO_MODE=false` hides demo profiles (404) and rejects post access (401)
until real authentication exists.

PowerShell smoke check in a second activated terminal:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
Invoke-RestMethod http://localhost:8000/api/demo/users
$headers = @{ 'X-Demo-User-Id' = '1' }
$body = @{
    category = 'STUDY'; intent = 'REQUEST'; title = 'Help with SQL joins'
    text = 'Synthetic demo: I need help with SQL joins'
    details = @{ course = 'SQL'; topic = 'joins' }
} | ConvertTo-Json
$post = Invoke-RestMethod http://localhost:8000/api/posts -Method Post -Headers $headers -ContentType 'application/json' -Body $body
Invoke-RestMethod http://localhost:8000/api/posts -Headers $headers
Invoke-RestMethod "http://localhost:8000/api/posts/$($post.id)" -Headers $headers
Invoke-RestMethod "http://localhost:8000/api/posts/$($post.id)" -Method Patch -Headers $headers -ContentType 'application/json' -Body '{"status":"COMPLETED"}'
```

## Checks and contract source

```bash
python -m pytest backend/tests -q
python -m pip check
```

Tests use temporary SQLite databases and synthetic data without AI/network calls.
The project documents were read from `docs/connecthub-handoff`, since `main`
currently contains only this README. The [API contract](https://github.com/shakiful/Mulehacks-26/blob/docs/connecthub-handoff/docs/API_CONTRACT.md)
and [project specification](https://github.com/shakiful/Mulehacks-26/blob/docs/connecthub-handoff/docs/PROJECT_SPEC.md)
are unchanged. Review/merge that handoff separately. AI preview, matching,
connections, security and frontend implementation are outside this first slice.
