# Architecture

## Components
- frontend/: React/Vite/Tailwind; one shared API client, category pages, shared cards and forms.
- backend/app/: FastAPI routes → domain services → SQLAlchemy repositories/SQLite.
- backend/app/ai/: provider interfaces for classification, extraction and embedding; validated output and timeouts.
- backend/app/matching/: filtering and category scoring; no LLM decides hard constraints.
- backend/app/security/: text/URL-structure risk assessment; never fetch submitted links.
- backend/tests/: route, matching, provider-validation and security tests.

Proposed module paths are targets, not mandatory replacements for a working existing structure. Keep the current layout where practical.

## Pipeline
Preview understanding → editable confirmation → post validation/persistence → candidate filtering → embedding generation/cache validation → weighted scoring → reasons → connection request. Embeddings are generated lazily for compatible confirmed posts or with the explicit backfill command; preview and post creation remain usable offline.

No vector database is needed for the small demo dataset. Store embedding vector JSON and provider/model metadata and compare in memory. Never compare embeddings from different models or dimensions; regenerate or use a labeled heuristic fallback.

## Data model
- User: id, name, major, created_at. Email/password/trust fields are deferred.
- Post: id, user_id, category, intent, title, text, status, location, starts_at, ends_at, category details JSON, created_at, updated_at.
- PostEmbedding: post_id (primary key), provider, model, dimensions, input_version, input_hash, vector, created_at. One current vector per post; incompatible/stale metadata requires regeneration.
- Connection: id, requester_id, receiver_id, source_post_id, target_post_id, status, created_at, updated_at. Unique active pair prevents duplicate pending/accepted requests.
- Security analyses: do not persist submitted text in MVP. Return results directly; avoid logging private content.

For speed, use a validated category-specific JSON details column. Separate RideDetails/StudyDetails/FoodDetails tables from the source plan are an optional later normalization. Pydantic validation is mandatory either way. Matches are derived at query time; persisted Match records are deferred to avoid stale scores.

## Matching
Always exclude self, same author's posts, non-OPEN posts, other categories and incompatible intents. For Ride, require equivalent normalized origin/destination, same trip window (default ±60 minutes), and offered seats >= requested seats. An exact missing required field is a validation issue, never a guessed match. No geographic distance inference without geocoding.

Study score: semantic 0.40 + course/topic 0.25 + availability 0.20 + mode/location 0.15. Semantic component = clamp cosine similarity into [0,1]. Known overlapping availability scores 1, incompatible availability scores 0; two known disjoint intervals are excluded. Missing availability contributes 0, with a missing-data explanation. Course/topic uses normalized token overlap; documented semantic relevance can connect SQL to relational databases even without exact course names. Same known mode scores 1; incompatible known modes are excluded. IN_PERSON requires matching known location; missing location contributes 0.

Ride score: route 0.50 + time proximity 0.35 + capacity 0.15. Route and capacity are 1 after hard gates; time = max(0, 1 - absolute_minutes/60). Food/Community score: semantic 0.50 + activity/subcategory relevance 0.25 + time/location compatibility 0.25. Unknown data scores 0; do not inflate by removing its weight. Return round(100 * weighted_sum, 1). Sort descending, break ties by target post id. Explanations come from actual score evidence.

Implemented Food/Community rules: opposite REQUEST/OFFER intents, or Community PARTNER/PARTNER; matching Food activity_type or Community subcategory is a hard gate. Two complete known disjoint intervals are excluded. Food relevance = 0.5 for the same activity + 0.5 times the maximum normalized token overlap of restaurant or cuisine; Community relevance = 1 after the subcategory gate. The time/location component averages time and location with equal weights. Time = 1 for two known overlapping complete intervals; otherwise two known start times use max(0, 1 - absolute_minutes/60); an unknown start contributes 0. Location = 1 for equal normalized nonempty locations, otherwise 0. group_size is descriptive and never treated as reservable capacity.

Fallback mode replaces semantic similarity with deterministic normalized token overlap; label `HEURISTIC`. Semantic mode is `SEMANTIC`. Do not describe fallback as embedding-based.

Heuristic mode uses Jaccard overlap of case-folded word tokens after removing common filler words. Semantic mode replaces only that title/text component with cosine similarity clamped to [0,1]. Study course/topic overlap still compares confirmed detail terms; availability, mode/location, category weights, and hard gates remain unchanged. Semantic reasons describe model relevance; heuristic reasons describe shared words. No geographic inference is performed. The current understanding provider is conservative offline extraction behind a validated service interface; its hosted adapter remains deferred. Routes call the services. The connection table uses an unordered post-id pair with a SQLite partial unique index for PENDING/ACCEPTED, including requests made in reverse order. Transitions update only PENDING rows; adding the table on startup preserves existing post/user rows.

Embedding settings are independent of understanding: EMBEDDING_PROVIDER defaults to heuristic and optionally selects OpenAI, with model, dimensions, timeout, and server-only key. The input format title-text-v1 is confirmed title + newline + text, hashed with SHA-256. A cache row is reusable only when provider/model/dimensions/input version/hash all agree and its vector is finite, nonzero, and the expected length. All required vectors are validated before any regeneration is committed. SQLite upserts make repeated backfills and concurrent writes safe; cache version checks prevent comparing mixed spaces. Model/dimension/input changes regenerate rows. A provider failure makes the entire candidate set HEURISTIC with a warning or raises a standard 503 when fallback is disabled, without overwriting old rows. Ride and empty candidate sets never call providers. Provider HTTP responses are bounded, validated, and not logged; redirects are rejected. Embedding values/metadata stay out of API responses.

## Operational choices
Demo mode is local only. X-Demo-User-Id selects an existing seed user; it is not authentication. Check ownership of posts and connection roles even in demo mode. Disable demo endpoints when DEMO_MODE=false until real authentication exists.

Use UTC in database; request timezone and reference_time for relative-language extraction. Return ISO 8601 timestamps with offsets, not ambiguous strings. DST ambiguity or missing dates triggers clarification.

CORS allows only configured frontend origins. Provider credentials stay on the server. Limit input length, validate provider JSON, use timeouts and redact content from logs. Tests inject a fake provider; they never require paid API calls.
