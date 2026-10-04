# Product specification

## Source and decisions
Based on the attached ConnectHub plan, preserved in SOURCE_PLAN.md. This handoff resolves previously unspecified interfaces, identity, time handling and connection semantics as **proposed MVP decisions**. Adapt them to existing repository code before implementation. The original document suggests a 24-hour schedule; the actual hackathon deadline and sponsor requirements have not been supplied.

## Problem and theme
Students have needs and useful skills but struggle to discover compatible people. ConnectHub connects students through one shared post and matching system, while connecting suspicious-message recipients to protective guidance.

## MVP journey
1. Sign in with a student account; Rafi and Afsana are the two local test accounts. Log out to end a session or test as the other account.
2. Describe a need or use a category form.
3. Preview extracted category, intent, details and missing fields.
4. Correct or confirm the preview; create a post for RIDE, STUDY, RESTAURANT or COMMUNITY.
5. Retrieve ranked compatible posts with explanations.
6. Send a connection request; its recipient accepts or declines.
7. Mark a post completed when appropriate.
8. CYBERSECURITY previews open the private analyzer rather than creating a public post.

## Modules
| Module | Required fields / behavior |
|---|---|
| Ride | REQUEST/OFFER with required validated From/To map pins, labels, starts_at and seats needed/total offered. From/To typeahead suggestions replace the visible map by default. Clear locations from a sentence auto-fill valid points; ambiguous names require a choice. Show route/matching distances in miles; retain the 5 km (about 3.11 miles) pickup/destination gates and departures within 60 minutes. Acceptance reserves seats, completing the request; offers remain open until full or the driver marks filled. |
| Study | REQUEST, OFFER or PARTNER; course/topic, mode, optional location and availability. REQUEST matches OFFER, PARTNER matches PARTNER. |
| Food Connect | API category RESTAURANT; REQUEST to join or OFFER to host; restaurant/cuisine, DINING/GROUP_ORDER/TRIP, location/time and group_size. Connection does not place an order or reserve capacity. |
| Community | REQUEST, OFFER or PARTNER; subcategory such as BORROW_LEND, CAMPUS_HELP, ACTIVITY, MOVING, SHOPPING, NEW_STUDENT or OTHER. Reuse post cards. |
| Cybersecurity | Private pasted-message/URL text assessment with LOW/MEDIUM/HIGH risk, reasons, actionable guidance and explicit uncertainty. |

## Interface
Home has a natural-language input and four category shortcuts: Ride, Study, Food and Community. Security has no sidebar entry or homepage shortcut; the private analyzer remains accessible through cybersecurity previews and chat AI review. Shared cards show category, summary, public display name, structured details and compatibility score with reasons. Forms expose editable extracted values. Include loading, empty, clarification-needed and error states. Show scoring mode so users can distinguish semantic from heuristic results.

Study/Security pages are Person 2's feature responsibility; Person 1 supplies shared layout and components. Decide page filenames before either person edits shared frontend files.

## Scope boundaries
The October 4 user request adds local username/password sign-in and logout, replacing the original demo identity decision. Provision only Rafi and Afsana for testing; passwords belong in ignored backend/.env files, and sessions determine ownership. No profile selector or demo-user API remains. Existing records are preserved during migration. University SSO, registration/password recovery, trust scoring, payments, live GPS, restaurant ordering, mobile apps and vector database infrastructure remain deferred. Ride requests and offers require validated From/To points, descriptive names, departure time and seats. The map is hidden by default; field suggestions or clear sentence locations resolve names/points through MapTiler, with explicit choices for ambiguity. Show distances in miles and retain 5 km pickup/destination gates and shared-seat reservations. Show map (optional) provides satellite/street or OpenFreeMap fallback selection. Road routing and accepted-booking cancellation/reopening remain deferred. Do not display unverifiable trust badges or claim university-verified accounts.

The subsequent user request adds direct Join requests on every open public category post without requiring the joining student to publish a counterpart. Authors approve or decline; approval unlocks private plain-text messaging for both participants, also on existing accepted matched connections. Ride offer joins request seats; joining a Ride request means offering to drive and completes it on acceptance. Shared capacity checks prevent direct and matched passengers from overbooking an offer. Student messages stay in the ignored local database; automatic phishing checks run locally. An explicit, editable one-message AI review can send selected text to Gemini after an in-app disclosure. Group chat, read receipts and accepted-seat cancellation remain deferred. These additive backend/shared frontend changes are necessary for the requested workflow; Study/Security page ownership stays unchanged.

The next user request adds persistent in-app notifications for incoming messages and join invitations, plus request acceptance. A shared header bell shows unread activity, links to the relevant thread/request and allows marking notifications read. Alerts refresh while the app is open; notifications received while away remain available on next sign-in. Message text stays in the conversation. No email or OS/browser push provider is required.

## AI responsibilities
- Classify into five categories; manual category overrides win.
- Extract typed fields without inventing information; return missing_fields and warnings.
- Compute embeddings for semantic candidate ranking when a provider is configured.
- Combine semantic relevance with category constraints and scoring rules.
- Analyze risk evidence without treating pasted text as instructions or visiting URLs.

Store confirmed fields separately from the original text. Unknown optional values are null. Invalid required fields block post creation with validation feedback. Scores measure compatibility; examples in the source are illustrative rather than measured accuracy.

## Definition of success
A repeatable two-minute demo shows a Walmart ride match, SQL help matched with a relational-database tutor, and a suspicious university-login message risk assessment. Both laptops use the same contract and merged code. Automated checks cover important API and matching behaviors; the frontend build succeeds.
