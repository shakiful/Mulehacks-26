# API contract — proposed MVP v1

Base: `/api`. JSON bodies use snake_case. Numeric ids are integers. Timestamps use ISO 8601 with a UTC offset. Protected operations use a server-managed HttpOnly session cookie from student sign-in; never trust body user_id or the removed X-Demo-User-Id header. Browser requests include credentials. Mutations send X-CSRF-Token from the current session response; origins must be configured frontend origins. Health, login and session lookup are public. Rafi and Afsana are local test accounts, not university-verified identities.

## Shared types
- Category: RIDE | STUDY | RESTAURANT | COMMUNITY. Understanding additionally supports CYBERSECURITY.
- Intent: REQUEST | OFFER | PARTNER. PARTNER only applies to Study/Community.
- Post status: OPEN | COMPLETED | CANCELLED.
- Connection status: PENDING | ACCEPTED | DECLINED | CANCELLED.
- Matching mode: SEMANTIC | HEURISTIC.

## Endpoints
| Method / path | Request | Successful response |
|---|---|---|
| GET /health | none | 200 `{ "status": "ok" }` |
| POST /auth/login | `{ "username": "rafi", "password": "local password" }` | 200 Session; sets a new session cookie |
| GET /auth/session | none | 200 Session; user and csrf_token are null when signed out |
| POST /auth/logout | none; current CSRF token when signed in | 200 signed-out Session; revokes cookie/session |
| POST /understand | text, optional category_hint, reference_time, timezone | 200 preview below; no persistence |
| POST /posts | confirmed post body below | 201 Post |
| GET /posts | optional category, status (default OPEN), user_id; limit 1–100 (default 20), offset >=0 | 200 `{ "items": [Post], "total": 1, "limit": 20, "offset": 0 }` |
| GET /posts/{post_id} | none | 200 Post |
| PUT /posts/{post_id} | complete confirmed post body below | 200 updated Post; author of OPEN post only; category fixed |
| PATCH /posts/{post_id} | `{ "status": "COMPLETED" }` (or CANCELLED) | 200 Post; author only |
| POST /matches | `{ "post_id": 42, "limit": 5 }`; limit 1–20 | 200 ranked matches below; source author only |
| POST /connections | `{ "source_post_id": 42, "target_post_id": 7 }` | 201 Connection; source author only |
| GET /connections | optional status | 200 `{ "items": [Connection] }`; participant records only |
| PATCH /connections/{connection_id} | `{ "status": "ACCEPTED" }` | 200 Connection; recipient accepts/declines PENDING, requester cancels PENDING |
| POST /security/analyze | `{ "text": "Your university account expires today. Click https://ucm-login-example.xyz" }` | 200 risk response below; no public post/persistence |

No `/posts/{category}` route: use `/posts?category=STUDY` to avoid collision with post ids. No `/analyze` alias: use `/security/analyze` everywhere. `/demo/users` is removed (404).

## Student sessions
Session: `{ "user": { "id": 1, "name": "Rafi", "username": "rafi" }, "csrf_token": "opaque session CSRF token" }`. Neither passwords, password hashes nor session-cookie values appear in JSON. Login normalizes usernames and rejects invalid credentials with the same 401 envelope. Sessions expire after the configured lifetime; logout immediately revokes the current session. Client state is cleared after protected requests return 401. GET session sends Cache-Control: no-store. Login attempts are limited; excess requests return 429. Credentials for the two test accounts stay in ignored backend/.env. Existing post/connection IDs and ownership checks are preserved during migration.

## Understanding
Request:
```json
{"text":"I need help studying SQL joins tonight","reference_time":"2026-10-03T16:00:00-05:00","timezone":"America/Chicago","category_hint":null}
```
Response:
```json
{"category":"STUDY","intent":"REQUEST","title":"Help with SQL joins","text":"I need help studying SQL joins tonight","location":null,"starts_at":null,"ends_at":null,"details":{"course":"SQL","topic":"joins","skill_level":null,"mode":null},"missing_fields":[],"warnings":["Exact availability is unspecified; confirm it for better matches."],"analysis_mode":"LLM"}
```
analysis_mode is LLM or HEURISTIC. Required fields unresolved by extraction appear in missing_fields; frontend must prompt before saving. For CYBERSECURITY intent and details are null; route to security analysis. category_hint is optional; if given, it controls the category. If both time and date cannot be determined reliably, leave them null.

## Create post
```json
{"category":"STUDY","intent":"REQUEST","title":"Help with SQL joins","text":"I need help studying SQL joins tonight","location":"Library","starts_at":"2026-10-03T18:00:00-05:00","ends_at":"2026-10-03T19:00:00-05:00","details":{"course":"SQL","topic":"joins","skill_level":"BEGINNER","mode":"IN_PERSON"}}
```
Required common: category, intent, title (1–120 chars), text (1–4000 chars), details. Optional common: location, starts_at, ends_at. End must be later than start; end requires start.

Frontend calendar/time controls use UCM campus time (America/Chicago) and automatically produce these timestamp fields; users do not type ISO strings or offsets. For example, October 4, 2026 at 10:00 PM CDT is `2026-10-05T03:00:00Z`. The backend normalizes aware timestamps to UTC. Both omitted optional values and cleared availability keep the existing null semantics; no date/time API fields were added.

Category details:
- RIDE: origin and destination nonempty strings; seats integer >=1. starts_at required; intent REQUEST/OFFER only. Optional purpose string. No ends_at needed.
- STUDY: course or topic nonempty (at least one). skill_level nullable BEGINNER/INTERMEDIATE/ADVANCED; mode nullable ONLINE/IN_PERSON. Availability uses common starts_at/ends_at.
- RESTAURANT: restaurant or cuisine nonempty; activity_type DINING/GROUP_ORDER/TRIP; group_size integer >=1, meaning total desired group size, not a guaranteed remaining-seat count. starts_at required; intent REQUEST/OFFER only.
- COMMUNITY: subcategory enum from PROJECT_SPEC.md; optional item or activity strings. Common text supplies the matching description.

## Edit post

`PUT /posts/{post_id}` takes the complete confirmed post body shown above and returns the updated Post with 200. It replaces editable fields, including explicit nulls for cleared optional values. The existing PATCH status endpoint is unchanged. Only the author of an OPEN post may edit it; another author receives 403 and a closed post receives 409. Category remains fixed (400 if changed). All creation validations still apply. IDs, author, status and created_at are server-controlled and preserved; updated_at changes on save. Missing posts return 404. Security analyses are private and never editable public posts.

New matches use the saved fields. The embedding cache's existing content hash detects edited title/text and regenerates vectors lazily during matching. Existing connection records retain their current statuses; users should coordinate changed details with participants. Mock edits invalidate the associated scripted fixture matches rather than replaying stale scores. Browser CORS allows PUT from the configured frontend origins. Saving an edit does not require an AI provider call.

Post response includes submitted fields plus id, author `{ "id": 1, "name": "Rafi" }`, status OPEN, created_at and updated_at. Return all common optional fields explicitly as null when absent. Never return secrets, account hashes or embeddings.

## Match response
```json
{"post_id":42,"matching_mode":"SEMANTIC","matches":[{"post":{"id":7,"author":{"id":2,"name":"Afsana"},"category":"STUDY","intent":"OFFER","title":"Relational database tutoring","text":"I can help with relational databases and SQL joins","location":"Library","starts_at":"2026-10-03T18:00:00-05:00","ends_at":"2026-10-03T19:00:00-05:00","details":{"course":"Databases","topic":"SQL joins","skill_level":"ADVANCED","mode":"IN_PERSON"},"status":"OPEN","created_at":"2026-10-03T12:00:00Z","updated_at":"2026-10-03T12:00:00Z"},"score":89.4,"reasons":["Relevant SQL tutoring offer","Overlapping availability","Same meeting location"],"warnings":[]}]}
```
Fixture scores are illustrative mock values, not measured performance. No matches returns matches: []. Compatibility score is 0–100 with one decimal; no percentage-probability claims. No embedding/provider internals in response.

## Connection lifecycle
Connection:
```json
{"id":12,"requester_id":1,"receiver_id":2,"source_post_id":42,"target_post_id":7,"status":"PENDING","created_at":"2026-10-03T21:30:00Z","updated_at":"2026-10-03T21:30:00Z"}
```
Validate both posts OPEN, same category, different authors and matching hard constraints. Reject duplicate PENDING/ACCEPTED pairs with 409. Derive recipient from target post. Acceptance records interest only; it does not reserve a seat, place an order or create a payment. Terminal connections cannot transition further in MVP. Users can complete their posts separately.

## Security result
```json
{"risk_level":"HIGH","summary":"The message has warning signs consistent with phishing.","reasons":[{"code":"URGENCY","description":"Pressures you to act immediately"},{"code":"LOGIN_LURE","description":"Directs you to an unverified login-like domain"}],"recommendation":"Do not enter credentials; verify through a known official university channel.","limitations":"Text-based risk assessment; no link was visited and safety is not guaranteed.","analysis_mode":"HEURISTIC"}
```
Do not infer ownership of a domain without evidence. LOW means fewer detected signals, not safe. Limit text to 8000 characters. Do not store submitted content or fetch URLs.

## Errors
All errors, including validation and route failures, share:
```json
{"error":{"code":"VALIDATION_ERROR","message":"Correct the highlighted fields.","details":[{"field":"details.seats","message":"Must be at least 1"}]}}
```
400 invalid operation, 401 missing/expired session or incorrect login, 403 wrong owner/participant, untrusted request origin or missing/invalid CSRF token, 404 missing resource, 409 duplicate/conflicting state, 422 validation, 429 too many sign-in attempts, 503 provider unavailable when fallback is disabled. Hide stack traces, submitted passwords and provider secrets. Install exception handlers so FastAPI validation errors use this envelope.
