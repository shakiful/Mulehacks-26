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
Preview understanding → editable confirmation → post validation/persistence → embedding generation → candidate filtering → weighted scoring → reasons → connection request.

No vector database is needed for the small demo dataset. Store embedding vector JSON and provider/model metadata and compare in memory. Never compare embeddings from different models or dimensions; regenerate or use a labeled heuristic fallback.

## Data model
- User: id, name, major, created_at. Email/password/trust fields are deferred.
- Post: id, user_id, category, intent, title, text, status, location, starts_at, ends_at, category details JSON, created_at, updated_at.
- PostEmbedding: post_id, provider, model, vector, created_at.
- Connection: id, requester_id, receiver_id, source_post_id, target_post_id, status, created_at, updated_at. Unique active pair prevents duplicate pending/accepted requests.
- Security analyses: do not persist submitted text in MVP. Return results directly; avoid logging private content.

For speed, use a validated category-specific JSON details column. Separate RideDetails/StudyDetails/FoodDetails tables from the source plan are an optional later normalization. Pydantic validation is mandatory either way. Matches are derived at query time; persisted Match records are deferred to avoid stale scores.

## Matching
Always exclude self, same author's posts, non-OPEN posts, other categories and incompatible intents. For Ride, require equivalent normalized origin/destination, same trip window (default ±60 minutes), and offered seats >= requested seats. An exact missing required field is a validation issue, never a guessed match. No geographic distance inference without geocoding.

Study score: semantic 0.40 + course/topic 0.25 + availability 0.20 + mode/location 0.15. Semantic component = clamp cosine similarity into [0,1]. Known overlapping availability scores 1, incompatible availability scores 0; two known disjoint intervals are excluded. Missing availability contributes 0, with a missing-data explanation. Course/topic uses normalized token overlap; documented semantic relevance can connect SQL to relational databases even without exact course names. Same known mode scores 1; incompatible known modes are excluded. IN_PERSON requires matching known location; missing location contributes 0.

Ride score: route 0.50 + time proximity 0.35 + capacity 0.15. Route and capacity are 1 after hard gates; time = max(0, 1 - absolute_minutes/60). Food/Community score: semantic 0.50 + activity/subcategory relevance 0.25 + time/location compatibility 0.25. Specify exact final component rules in code and update this document before integration. Unknown data scores 0; do not inflate by removing its weight. Return round(100 * weighted_sum, 1). Sort descending, break ties by target post id. Explanations come from actual score evidence.

Fallback mode replaces semantic similarity with deterministic normalized token overlap; label `HEURISTIC`. Semantic mode is `SEMANTIC`. Do not describe fallback as embedding-based.

## Operational choices
Demo mode is local only. X-Demo-User-Id selects an existing seed user; it is not authentication. Check ownership of posts and connection roles even in demo mode. Disable demo endpoints when DEMO_MODE=false until real authentication exists.

Use UTC in database; request timezone and reference_time for relative-language extraction. Return ISO 8601 timestamps with offsets, not ambiguous strings. DST ambiguity or missing dates triggers clarification.

CORS allows only configured frontend origins. Provider credentials stay on the server. Limit input length, validate provider JSON, use timeouts and redact content from logs. Tests inject a fake provider; they never require paid API calls.
