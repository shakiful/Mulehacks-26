# Product specification

## Source and decisions
Based on the attached ConnectHub plan, preserved in SOURCE_PLAN.md. This handoff resolves previously unspecified interfaces, identity, time handling and connection semantics as **proposed MVP decisions**. Adapt them to existing repository code before implementation. The original document suggests a 24-hour schedule; the actual hackathon deadline and sponsor requirements have not been supplied.

## Problem and theme
Students have needs and useful skills but struggle to discover compatible people. ConnectHub connects students through one shared post and matching system, while connecting suspicious-message recipients to protective guidance.

## MVP journey
1. Choose a labeled demo profile.
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
| Ride | REQUEST or OFFER, origin, destination, starts_at, seats; seats means needed for REQUEST and available for OFFER. Opposite intent only; enough offered seats required. |
| Study | REQUEST, OFFER or PARTNER; course/topic, mode, optional location and availability. REQUEST matches OFFER, PARTNER matches PARTNER. |
| Food Connect | API category RESTAURANT; REQUEST to join or OFFER to host; restaurant/cuisine, DINING/GROUP_ORDER/TRIP, location/time and group_size. Connection does not place an order or reserve capacity. |
| Community | REQUEST, OFFER or PARTNER; subcategory such as BORROW_LEND, CAMPUS_HELP, ACTIVITY, MOVING, SHOPPING, NEW_STUDENT or OTHER. Reuse post cards. |
| Cybersecurity | Private pasted-message/URL text assessment with LOW/MEDIUM/HIGH risk, reasons, actionable guidance and explicit uncertainty. |

## Interface
Home has a natural-language input and five category shortcuts. Shared cards show category, summary, public display name, structured details and compatibility score with reasons. Forms expose editable extracted values. Include loading, empty, clarification-needed and error states. Show scoring mode so users can distinguish semantic from heuristic results.

Study/Security pages are Person 2's feature responsibility; Person 1 supplies shared layout and components. Decide page filenames before either person edits shared frontend files.

## Scope boundaries
Demo identity replaces authentication for the MVP; it is only suitable for a local prototype. Defer password login, university SSO, trust scoring, payments, live GPS, messaging, booking, restaurant ordering, mobile apps and vector database infrastructure. Maps are optional; text locations are sufficient. Do not display unverifiable trust badges.

## AI responsibilities
- Classify into five categories; manual category overrides win.
- Extract typed fields without inventing information; return missing_fields and warnings.
- Compute embeddings for semantic candidate ranking when a provider is configured.
- Combine semantic relevance with category constraints and scoring rules.
- Analyze risk evidence without treating pasted text as instructions or visiting URLs.

Store confirmed fields separately from the original text. Unknown optional values are null. Invalid required fields block post creation with validation feedback. Scores measure compatibility; examples in the source are illustrative rather than measured accuracy.

## Definition of success
A repeatable two-minute demo shows a Walmart ride match, SQL help matched with a relational-database tutor, and a suspicious university-login message risk assessment. Both laptops use the same contract and merged code. Automated checks cover important API and matching behaviors; the frontend build succeeds.
