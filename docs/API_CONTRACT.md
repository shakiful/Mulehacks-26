# API contract — proposed MVP v1

Base: `/api`. JSON bodies use snake_case. Numeric ids are integers. Timestamps use ISO 8601 with a UTC offset. Every protected operation uses `X-Demo-User-Id` in local DEMO_MODE; never trust body user_id. Seed identities are synthetic. Health, demo-user listing and public dining menus require no header.

## Shared types
- Category: RIDE | STUDY | RESTAURANT | COMMUNITY. Understanding additionally supports CYBERSECURITY.
- Intent: REQUEST | OFFER | PARTNER. PARTNER only applies to Study/Community.
- Post status: OPEN | COMPLETED | CANCELLED.
- Connection status: PENDING | ACCEPTED | DECLINED | CANCELLED.
- Matching mode: SEMANTIC | HEURISTIC.

## Endpoints
| Method / path | Request | Successful response |
|---|---|---|
| GET /health | none | 200 `{ "status": "ok", "demo_mode": true }` |
| GET /demo/users | none; demo only | 200 `{ "items": [{ "id": 1, "name": "Rafi (demo)" }] }` |
| GET /dining/menus | none; public, always today's UCM date | 200 dining response below, with independent hall statuses |
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

No `/posts/{category}` route: use `/posts?category=STUDY` to avoid collision with post ids. No `/analyze` alias: use `/security/analyze` everywhere.

## UCM dining menus

`GET /api/dining/menus` is read-only public information. The server selects today's date in `America/Chicago`, independently of `DEMO_DATE`, device time zone and AI settings. It fetches only the fixed Todd/Ellis Sodexo feeds; callers cannot supply a URL or hall ID. It does not use the database or Gemini.

```json
{"date":"2026-10-04","timezone":"America/Chicago","fetched_at":"2026-10-04T15:00:00Z","halls":[{"id":"todd","name":"Todd Dining Center","source_url":"https://ucmo.sodexomyway.com/en-us/locations/todd-dining-center-in-todd-hall","status":"AVAILABLE","message":null,"meals":[{"name":"Brunch","stations":[{"name":"Synthetic demo station","items":["Example breakfast bowl"]}]}]},{"id":"ellis","name":"Ellis Dining Center","source_url":"https://ucmo.sodexomyway.com/en-us/locations/ellis-dining-center","status":"EMPTY","message":"Sodexo has not published a menu for this day.","meals":[]}]}
```

This example is synthetic. `halls` always contains Todd then Ellis. Each hall is `AVAILABLE` with meals, `EMPTY` when no items are published, or `UNAVAILABLE` on an upstream network/configuration/format failure. EMPTY does not mean the hall is closed. EMPTY/UNAVAILABLE have empty `meals` and a user-readable `message`; AVAILABLE has `message: null`. One failing hall does not hide the other. Feed failures return 200 with these statuses so both hall results and official links remain usable. API/transport failures follow the existing error envelope.

`fetched_at` is the server's check time, not a claim of when Sodexo last changed its menu. Complete responses are cached in memory for up to five minutes, keyed by campus date. Errors are retried on the next request; expired/yesterday's listings are never substituted. Responses use `Cache-Control: no-store` so the browser requests the current server result on refresh. Only station/item names are returned; ingredients, nutrition, allergens and hours remain on the linked official site. Fixture mode uses the separate, explicitly synthetic `dining_menus` example and never contacts Sodexo.

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
- RIDE: origin and destination nonempty labels; both origin_point and destination_point are required objects with numeric finite lat (-90 to 90) and lng (-180 to 180). Reject strings, booleans, missing coordinates and extra fields. For REQUEST and OFFER, pins can come from a validated, unambiguous MapTiler lookup of extracted names or explicit map/result selection, reviewed before posting. AI previews still return both as null in missing_fields and never invent coordinates. seats is integer >=1, meaning seats needed for REQUEST and total seats offered for OFFER. starts_at required; intent REQUEST/OFFER only. Optional purpose string. No ends_at needed.
- STUDY: course or topic nonempty (at least one). skill_level nullable BEGINNER/INTERMEDIATE/ADVANCED; mode nullable ONLINE/IN_PERSON. Availability uses common starts_at/ends_at.
- RESTAURANT: restaurant or cuisine nonempty; activity_type DINING/GROUP_ORDER/TRIP; group_size integer >=1, meaning total desired group size, not a guaranteed remaining-seat count. starts_at required; intent REQUEST/OFFER only.
- COMMUNITY: subcategory enum from PROJECT_SPEC.md; optional item or activity strings. Common text supplies the matching description.

## Edit post

`PUT /posts/{post_id}` takes the complete confirmed post body shown above and returns the updated Post with 200. It replaces editable fields, including explicit nulls for cleared optional values. The existing PATCH status endpoint is unchanged. Only the author of an OPEN post may edit it; another author receives 403 and a closed post receives 409. Category remains fixed (400 if changed). All creation validations still apply. IDs, author and created_at are server-controlled and preserved; status stays unchanged except a Ride capacity edit that fills the offer; updated_at changes on save. Missing posts return 404. Security analyses are private and never editable public posts.

For Ride, edits serialize with acceptance under the same SQLite write lock. A booked passenger request cannot be edited. Once an offer has reservations, intent, departure/end times, From/To labels and both pins are fixed (409 on changes). Title, description, purpose, general location and total capacity remain editable; capacity below reserved seats returns 409, capacity above them leaves the offer OPEN, and capacity equal to them marks it COMPLETED. Reservations and their seat snapshots are preserved. Unbooked legacy rides can add required pins through this editor.

New matches use the saved fields. The embedding cache's existing content hash detects edited title/text and regenerates vectors lazily during matching. Existing connection records retain their current statuses; users should coordinate changed details with participants. Mock edits invalidate the associated scripted fixture matches rather than replaying stale scores. Browser CORS allows PUT from the configured frontend origins. Saving an edit does not require an AI provider call.

Post response includes submitted fields plus id, author `{ "id": 1, "name": "Rafi (demo)" }`, status OPEN, created_at and updated_at. Return all common optional fields explicitly as null when absent. Never return secrets or embeddings.

Every Post also returns ride_availability: null except for Ride OFFER posts, where it is {"total_seats":4,"reserved_seats":1,"remaining_seats":3}. details.seats is the confirmed total capacity (editable within the booking safeguards); remaining capacity is computed from accepted reservations. Counts appear consistently in create/get/list/edit/status and nested match responses. Older posts without pins remain readable; they cannot participate in distance matching. An unmapped source returns 400 INVALID_OPERATION with instructions to edit the open ride to add pins or create a mapped ride.

Example confirmed Ride details: {"origin":"Campus pickup","destination":"Walmart dropoff","origin_point":{"lat":38.7625,"lng":-93.7395},"destination_point":{"lat":38.7905,"lng":-93.7390},"seats":4,"purpose":"groceries"}. Coordinates are synthetic demonstration points, not inferred from those labels.

The Ride UI resolves extracted names after understanding and sentence follow-ups. One exact, detailed, high-relevance MapTiler result can automatically fill its point/name; multiple branches, city-only/low-confidence results and unknown personal locations require a choice or manual selection. UCM/campus and an unspecified Walmart resolve around Warrensburg; explicitly qualified cities are honored. Manual labels/pins and newer previews win over late responses. Users review the editable map before confirming creation. Reverse geocoding supplies a nearby name without moving a clicked point. Lookup failure retains manual search/pins. Existing records and reserved routes are not rewritten. The separate public MapTiler frontend key and fixed-host geocoding service add no ConnectHub endpoint/JSON field; AI never invents coordinates. From → To summaries are computed in miles from stored points, without persisted distance fields.

## Match response
```json
{"post_id":42,"matching_mode":"SEMANTIC","matches":[{"post":{"id":7,"author":{"id":2,"name":"Sarah (demo)"},"category":"STUDY","intent":"OFFER","title":"Relational database tutoring","text":"I can help with relational databases and SQL joins","location":"Library","starts_at":"2026-10-03T18:00:00-05:00","ends_at":"2026-10-03T19:00:00-05:00","details":{"course":"Databases","topic":"SQL joins","skill_level":"ADVANCED","mode":"IN_PERSON"},"status":"OPEN","created_at":"2026-10-03T12:00:00Z","updated_at":"2026-10-03T12:00:00Z","ride_availability":null},"score":89.4,"reasons":["Relevant SQL tutoring offer","Overlapping availability","Same meeting location"],"warnings":[]}]}
```
Fixture scores are illustrative mock values, not measured performance. No matches returns matches: []. Compatibility score is 0–100 with one decimal; no percentage-probability claims. No embedding/provider internals in response.

Ride gates: different authors, opposite intents, both OPEN and mapped, unreserved passenger request, departures within 60 minutes, pickup pins within 5 km and destination pins within 5 km (about 3.11 miles each), remaining offered seats >= requested seats. Labels need not match. Haversine straight-line distances affect score: pickup proximity 25% + destination proximity 25% + time proximity 35% + enough remaining capacity 15%. Each distance term is max(0, 1 - distance_km/5); time is max(0, 1 - minutes/60). Internal km gates/scores are unchanged; reasons convert with exactly 1 mile = 1.609344 km and show miles to two decimals, time and remaining seats. Warnings distinguish straight-line distance from road routes/driving time. Fixture reasons use the same mile units. Ride mode remains HEURISTIC (deterministic structured scoring, no embeddings).

## Connection lifecycle
Connection:
```json
{"id":12,"requester_id":1,"receiver_id":2,"source_post_id":42,"target_post_id":7,"status":"PENDING","created_at":"2026-10-03T21:30:00Z","updated_at":"2026-10-03T21:30:00Z","reserved_seats":0}
```
Validate both posts OPEN, same category, different authors and matching hard constraints. Reject duplicate PENDING/ACCEPTED pairs with 409. Derive recipient from target post. Every Connection includes reserved_seats (0 for pending/non-Ride, requested seat count for an accepted Ride).

For Ride only, accepting PENDING atomically rechecks open state, map/time gates, remaining capacity and whether the request is already booked. It creates one persisted seat reservation, completes the passenger REQUEST, and leaves the OFFER OPEN until remaining seats reach zero; then the offer becomes COMPLETED. This applies whether the driver or passenger initiated the connection. A 4-seat offer can accept 1 + 1 + 2 seats from separate requests. Pending/declined/cancelled requests hold no seats. Stale/full/closed/already-booked acceptances return 409 CONFLICT; no partial reservation is saved. Authors can mark offers COMPLETED early with the existing post PATCH (the UI calls this Mark filled), stopping new matches and acceptances regardless of spare capacity.

Accepted connections remain terminal; seat release/reopening and booking cancellation are outside this prototype's current lifecycle. This is local demo capacity tracking, not a transport guarantee. Other categories still record interest only, never orders/payments/capacity. An additive startup migration counts older accepted Ride connections once per request, choosing the earliest if historical duplicates exist, without changing their posts or connection records.

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
400 invalid operation, 401 missing/unknown demo identity, 403 wrong owner/participant, 404 missing resource or demo-only endpoint disabled, 409 duplicate/conflicting state, 422 validation, 503 provider unavailable when fallback is disabled. Hide stack traces and provider secrets. Install exception handlers so FastAPI validation errors use this envelope.
