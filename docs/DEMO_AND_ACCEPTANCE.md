# Demo and acceptance

## Seed dataset (implementation target)
Two local sign-in accounts: 1 Rafi (`rafi`) and 2 Afsana (`afsana`). Passwords are set privately in ignored backend/.env; accounts are not university-verified. The six labeled synthetic seed posts belong to Afsana so Rafi can find compatible matches. There is no demo profile selector.
Seed ride offers to Walmart at 17:45 and 18:15 with enough seats, a SQL/relational-database tutor, a Python study partner, a food group and a calculator offer. Seed dates relative to a configurable SEED_DATE in America/Chicago; do not hardcode expired fixture dates into live demo data. Fixtures illustrate response shapes with fixed times.

## Two-minute demo
1. Rafi requests a UCM → Walmart ride at 18:00. Confirm extraction and see compatible offered rides with reasons.
2. Request help with SQL joins; show relational-database tutor and explain semantic ranking.
3. Send a connection request; log out, sign in as Afsana and accept it. Show acceptance as interest, with no seat-reservation claim.
4. Paste a synthetic university-account-expiry message with a login-like URL. Show evidence-based HIGH risk assessment and its limitations.

## Required checks after implementation
- Health, two-account seed and post create/list work from documented commands.
- Logged-out routes show the login page; Rafi/Afsana login, reload restoration, logout and recipient acceptance work. The demo-user endpoint returns 404, and its former identity header cannot authorize a request.
- Protected mutations reject missing/incorrect CSRF tokens and disallowed origins; logout revokes replayed cookies, expired sessions fail, and passwords never appear in API responses. Existing posts/connections survive the legacy migration.
- Manual category hint wins; extraction does not invent location/date.
- Invalid seats, malformed date, missing required category details and unknown enums return the standard 422 envelope.
- Own/closed/wrong-category posts never match. Ride capacity, route and time constraints exclude incompatible offers.
- SQL/relational-database example ranks a suitable tutor in semantic mode; fallback is clearly labeled HEURISTIC.
- Missing/expired/revoked sessions and incorrect passwords rejected; wrong user cannot complete a post or accept someone else's connection.
- Duplicate connection returns 409; invalid transitions rejected; participants only can see their records.
- Security analysis never visits submitted links, persists submitted messages or returns secrets; LOW is not labeled safe.
- Provider timeout/malformed output has a tested fallback or standard 503.
- UI works against real API as well as fixtures; loading/error/empty states behave correctly.
- Calendar/time controls accept October 4, 2026 at 10:00 PM campus time, persist the equivalent UTC instant, and reload as the same campus date/time. Partial date/time entries, invalid end ordering and daylight-saving ambiguity require correction or clarification. Same-route rides from different signed-in accounts at the selected instant match when capacity is sufficient.
- Backend tests pass and frontend production build passes. Record actual commands in README once code exists.

## Remaining project decisions
Actual hackathon duration/rules, repository structure, available AI provider/models and required sponsor tracks are unknown. They should refine implementation, not prevent documentation setup.
