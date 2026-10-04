# Chat security

Automatic checks are private and available offline. Every sent or read Message has a server-derived `security` result from local rules, including historical messages. Gemini is used only after **Review with AI → Analyze selected text**; users can redact the selected text first. Sender, thread IDs and other messages are not included. Results stay in the viewer's page memory. No pasted URL is visited, resolved or executed.

MEDIUM/HIGH results show warning signs and advice. Password/OTP requests, urgent login lures, payment/reward language, misleading user-info hosts, numeric/Unicode domains and script/data links are among the supported signals. Ordinary HTTPS does not establish legitimacy. Local rules may flag legitimate messages or miss contextual attacks; a LOW result or no warning is never a safety guarantee. Warnings do not accuse the sender or block delivery. An AI LOW result cannot remove an automatic warning.

## Current protections

- Only signed-in participants in an accepted connection/join can read or send messages; every page is scoped to that thread. Sender identity and assessments come from the server, with extra input fields rejected.
- HttpOnly, SameSite cookies, expiring/revocable server sessions, CSRF tokens, configured-origin checks and salted password hashes. Sign-in attempts are throttled.
- Bounded 1–2000-character plain text, escaped React rendering, and no clickable message links or automatic link previews. Private responses use `Cache-Control: no-store`; notifications do not include message text or safety results.
- Chat messages are stored in the ignored local SQLite database; automatic assessment is derived without another write. Viewer AI results, redacted copies and private drafts clear on close/navigation/account changes. Provider failures are labeled, and stale responses are ignored.

## Recommended next work

1. **Block and report:** recipient-owned block lists enforced on every send/request, with a report workflow and restricted moderator access. Preserve only needed evidence and make reporting explicit; do not silently forward private conversations.
2. **Abuse and cost limits:** account-based message and analysis rate limits, request-body limits at the deployment proxy, bounded message retention and provider spending caps. Current login throttling does not limit chat or AI usage. Use a shared limiter when running multiple backend processes. OWASP recommends rejecting excessive API requests with [429 rate limiting](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html).
3. **Deployment protection:** HTTPS throughout, `SESSION_COOKIE_SECURE=true`, security headers and a tested Content Security Policy, restricted backend/database access, encrypted backups and secret management. The localhost setup uses HTTP. Keep [safe text rendering](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) when adding richer messages.
4. **Account trust:** university SSO and MFA, registration/recovery controls, and session/device management before opening this to campus users. Rafi/Afsana are local test accounts, not verified university identities.
5. **Data lifecycle:** a clear retention/deletion policy and access controls for chat databases/backups, with metadata-only operational logging. Messages are currently readable by anyone with database access; this is not end-to-end encryption. End-to-end encryption needs a deliberate key-management design and changes to where automatic scanning runs.

For a concerning message, independently contact the person or university IT through a known channel and avoid submitting credentials, codes or payments through a message link. [NIST's phishing guidance](https://www.nist.gov/itl/smallbusinesscyber/guidance-topic/phishing) supports recognition, independent verification and reporting. Link-reputation services are optional later work: they introduce privacy/availability tradeoffs and must not fetch arbitrary submitted URLs from the application server.

## Verification

Tests use synthetic text and controlled providers. Backend checks cover both thread kinds, historical serialization, no analysis writes/provider/DNS calls, strict input, participants and CSRF. Frontend checks cover warnings/plain text, explicit redacted AI submission, retries, draft preservation and ignored results after close/logout. Live browser verification must use an isolated synthetic conversation; do not send phishing examples into a user's existing chat.
