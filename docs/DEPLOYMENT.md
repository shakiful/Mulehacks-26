# Netlify + Render deployment

Import **shakiful/Mulehacks-26**, using the **production** branch on both platforms. Netlify builds the React frontend; Render runs FastAPI with SQLite on a persistent disk. This hosts the existing hackathon prototype with two student test accounts, without university SSO or public registration.

The root `netlify.toml` configures the frontend build. The root `render.yaml` is a ready-to-import backend Blueprint. The browser calls `/api` on the Netlify domain, and Netlify proxies those requests to Render. This keeps HttpOnly/Secure/SameSite session cookies on the frontend domain and preserves existing CSRF checks. See [Netlify proxy routing](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/) and [Render persistent disks](https://render.com/docs/disks).

## 1. Create the Netlify project

Import the GitHub repository and choose **production** as the production branch. The committed configuration sets these values automatically:

| Setting | Value |
|---|---|
| Base directory | `frontend` |
| Build command | `npm run build:netlify` |
| Publish directory | `dist`, relative to `frontend` |
| Node | 22 |
| Browser API URL | `/api` |

For the first deploy, set **VITE_USE_MOCKS=true** in Netlify's build environment while creating the backend. This explicitly publishes the labeled fixture demo. Sign in as `rafi` or `afsana` with `fixture-only`. Data is synthetic, stays in browser memory and clears on reload; Gemini and live chat are unavailable. No request is forwarded to the production database.

Choose a stable site address, such as `https://your-campus-site.netlify.app`. Copy its exact HTTPS origin **without a trailing slash** for the next step. You can use a custom domain instead.

## 2. Create the persistent Render backend

In Render, create a **Blueprint** from the same repository's **production** branch using `render.yaml`. Review the charges before confirming: the template selects a **paid Starter web service plus a 1 GB persistent disk**. An ephemeral/free service cannot preserve this SQLite database. Adding these files to Git does not create a paid hosting resource.

Supply the prompted Render environment values:

| Variable | Value |
|---|---|
| `CORS_ORIGINS` | Your exact Netlify HTTPS origin; comma-separated if also using a custom domain. No wildcard, path or trailing slash. |
| `RAFI_LOGIN_PASSWORD` | Your private password, at least 10 characters. |
| `AFSANA_LOGIN_PASSWORD` | Another private password, at least 10 characters. |

The template supplies `DATABASE_URL=sqlite:////var/data/connecthub/connecthub.db`, `SESSION_COOKIE_SECURE=true`, one instance and health check `/api/health`. Python is pinned in `.python-version`. Build command: `pip install -r backend/requirements.txt`. Start command: `python -m backend.app.deploy`, listening on Render's `PORT` and `0.0.0.0` with one worker.

Hosted startup rejects insecure cookies, missing passwords, invalid origins, relative/in-memory/source-folder database paths, missing data directories and invalid ports. Keep the disk attached at `/var/data/connecthub`; an absolute filename alone does not guarantee persistence. Keep this SQLite service on one instance. The disk is available at runtime, so do not seed during the build phase.

Startup provisions both accounts without resetting existing password hashes or seeding public posts. For optional synthetic examples, run `python -m backend.app.seed` in Render's service Shell after startup. Normal seeding is repeatable and preserves user posts/passwords. Use `--refresh` only to deliberately refresh unbooked synthetic examples. Changing environment passwords does not rotate existing accounts; the explicit `--reset-passwords` command applies both configured passwords only when intentionally run.

Copy the service's actual HTTPS origin, e.g. `https://your-connecthub-api.onrender.com`. Open its `/api/health` URL and verify `{"status":"ok"}`. The template's service name does not guarantee a particular public hostname.

## 3. Configure Gemini and Ride place search

Add **GEMINI_API_KEY** on the **Render service**. The template selects Gemini understanding/security and embeddings, with a labeled heuristic fallback for provider failures. Quota and model access still apply. Never put Gemini/OpenAI keys, passwords or session secrets in Netlify `VITE_` variables or Git.

Optionally add **VITE_MAPTILER_API_KEY** on **Netlify**, restricted in MapTiler to your deployed frontend origins. This public browser key enables Ride place suggestions, sentence location resolution and the optional map. Without it, the optional map uses OpenFreeMap, but automatic address search requires MapTiler; users can explicitly choose and name map points. It is separate from the server's Gemini key.

The template uses AI timeout **18 seconds** and embedding timeout **8 seconds**. Netlify's proxy has a [26-second deadline](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/#limitations); hosted startup requires AI <=20 and embeddings <=10. Large uncached matching batches may still exceed the deadline. Keep the prototype dataset small or backfill confirmed-post vectors in Render's Shell with `python -m backend.app.ai.embeddings`.

## 4. Enable Netlify's live API

Set these Netlify **build** environment values, then trigger a new deploy:

```dotenv
BACKEND_URL=https://your-connecthub-api.onrender.com
VITE_API_BASE_URL=/api
VITE_USE_MOCKS=false
```

`BACKEND_URL` is the Render **origin**, without `/api`, a path, query, credentials or fragment. The build validates it and generates `dist/_redirects`: `/api/*` proxies to the backend's `/api/:splat`, before the SPA fallback. Nested routes such as `/login`, `/ride` and `/messages/connection/5` survive direct visits/refreshes. API errors remain API responses. Do not point `VITE_API_BASE_URL` at localhost or the separate Render domain; use the same-origin proxy for session cookies.

Netlify installs dependencies using the committed frontend package/lockfile and publishes only `frontend/dist`. Python, `.env`, SQLite and local messages are not published. Static security headers and hashed-asset caching are configured; private API responses retain the backend's `Cache-Control: no-store`. Netlify static headers do not replace backend headers.

Deploy previews and other branch deploys default to explicit fixture mode. Keep them isolated from live data. A live preview requires a deliberate change to its `netlify.toml` context, a separate backend and its exact frontend origin in that backend's `CORS_ORIGINS`; do not add wildcard preview origins. TOML variables override UI variables, so production leaves the fixture switch configurable in the UI while preview contexts explicitly isolate their data. Changing Netlify build variables requires a rebuild; backend settings require a Render restart/redeploy.

## 5. Verify the hosted app

1. Open `https://your-campus-site.netlify.app/api/health`; expect JSON with `status: ok`.
2. Visit `/login`, use the private Render account password, and refresh. The session should survive. `fixture-only` is not a live password.
3. Create a synthetic post, then restart Render and verify that the post remains.
4. Use separate browser profiles for Rafi/Afsana to test requesting, acceptance, chat and notifications. Keep phishing examples out of existing private conversations.
5. Test a sentence preview and optional security review. `LLM`/`SEMANTIC` indicate valid Gemini output; a labeled heuristic result means the provider was unavailable/unconfigured. Test Ride suggestions and Food dining menus.
6. Log out and verify the session is revoked. Remove synthetic tests through the supported app workflow.

## Troubleshooting and data

- **Build requests BACKEND_URL:** set the Render HTTPS origin, or deliberately choose `VITE_USE_MOCKS=true` for a fixture demo.
- **403 on login/posting:** match `CORS_ORIGINS` to the browser's exact HTTPS origin. Keep CSRF and secure cookies enabled.
- **HTML instead of API JSON:** use the committed build command, which generates API routes before the SPA route. Do not replace `_redirects` with only a SPA fallback.
- **Data disappears:** check the persistent disk and absolute database path. Ephemeral storage is unsuitable.
- **Gemini falls back:** check the Render key/provider settings, model access/quota and backend logs. Do not paste keys into screenshots/logs.
- **Old laptop data is absent:** Git does not include the ignored local database or `.env`; hosting starts with its own database. A deliberate private migration/SQLite backup is separate work. Do not upload live databases to Git or Netlify.

Keep SQLite-consistent backups and restrict database/service access. This prepares the existing prototype for hosting; university verification, registration, end-to-end chat encryption and campus-scale abuse controls remain separate work. See [chat security](CHAT_SECURITY.md).

## Local validation

From the repository root, with your existing virtual environment:

```bash
python -m pytest backend/tests/test_deployment.py -q
cd frontend
npm ci
npm run test:deploy
npm run check -- --maxWorkers=2
# Set BACKEND_URL to your hosted HTTPS origin, then:
npm run build:netlify
```

Checks cover configuration guards, HTTPS cookies, Origin/CSRF, records/sessions across restarts, API-first redirects and the production bundle. Platform proxy behavior, disk attachment and provider access also require the hosted verification above after deployment.
