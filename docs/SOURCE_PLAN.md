For a **2-person hackathon team**, I would design ConnectHub so you are **not actually building five separate systems**. Build **one common connection engine**, then Ride, Study, Restaurant, Cybersecurity, and Other Needs become modules that reuse it.

# ConnectHub

> **An AI-powered student connection platform that understands what a student needs and connects them with the right people, opportunities, or safety resources.**

### Core flow

```
Student enters a request
        ↓
"I need a ride to Walmart around 6 tonight"
        ↓
AI Intent Classification
        ↓
Category = Ride
        ↓
AI Information Extraction
        ↓
Destination = Walmart
Time = 6 PM
Need = Ride
        ↓
Database Search
        ↓
Semantic + Rule-Based Matching
        ↓
Best Connections
        ↓
92% Sarah — Walmart — 5:45 PM
87% Alex — Walmart — 6:15 PM
```

---

# 1. Recommended Tech Stack

For a hackathon, prioritize **speed of development**.

| Component         | Recommendation                      |
| ----------------- | ----------------------------------- |
| Frontend          | React + Vite                        |
| Styling           | Tailwind CSS                        |
| Backend           | Python FastAPI                      |
| Database          | SQLite                              |
| ORM               | SQLAlchemy                          |
| AI                | OpenAI API or another available LLM |
| Semantic Matching | Embeddings + cosine similarity      |
| Maps              | Leaflet + OpenStreetMap             |
| Authentication    | Simple email/password prototype     |
| API testing       | Postman                             |
| Version control   | Git + GitHub                        |

I especially like **Python + FastAPI** for your project because your AI/matching logic can live directly in Python.

For the hackathon, **don't spend hours configuring production infrastructure**. SQLite is enough for the demo.

---

# 2. Main Dashboard

The homepage should immediately explain ConnectHub.

```
┌───────────────────────────────────────────┐
│               CONNECTHUB                  │
│                                           │
│      What do you need today?              │
│                                           │
│ ┌───────────────────────────────────────┐ │
│ │ I need help studying SQL tonight...  │ │
│ └───────────────────────────────────────┘ │
│                                           │
│           ✨ Find Connections             │
│                                           │
│ OR                                        │
│                                           │
│ 🚗 Ride       📚 Study                    │
│                                           │
│ 🍕 Restaurant 🔐 Cybersecurity            │
│                                           │
│ 🌎 Other Needs                            │
└───────────────────────────────────────────┘
```

This is important: users can either **choose a category manually OR simply describe what they need and let AI decide**.

---

# 3. 🚗 Ride Module

### Student can post

**Need a ride**

```
From: UCM
To: Walmart
Date: Today
Time: 6:00 PM
Seats: 1
```

or:

**Offering a ride**

```
From: UCM
To: Walmart
Date: Today
Time: 5:45 PM
Available seats: 3
```

### Core prototype features

- Create ride request
- Offer ride
- Starting location
- Destination
- Date/time
- Available seats
- View potential matches
- Match percentage
- Connect/request button
- Mark request completed

### AI example

User doesn't fill out the form and instead writes:

> “Anyone going to Walmart around 6 tonight? I need groceries.”

AI extracts:

```
{
  "category": "ride",
  "type": "request",
  "destination": "Walmart",
  "time": "6:00 PM",
  "purpose": "groceries"
}
```

---

# 4. 📚 Study Module

Students connect based on academic needs.

### Student posts

> “Looking for someone to study Python loops with tomorrow.”

Information:

```
Course: Python
Topic: Loops
Need: Study Partner
Time: Tomorrow
Mode: In person
```

### Core features

- Find study partner
- Offer tutoring/help
- Course
- Topic
- Skill level
- Availability
- Online/in-person
- Match students

### AI semantic matching

This is where embeddings become useful.

Student A:

> “I need help understanding SQL joins.”

Student B:

> “I can help students with relational databases.”

Those sentences don't contain exactly the same words.

Semantic matching can recognize that they're related.

```
Student A
     ↓
Embedding

Student B
     ↓
Embedding

Cosine similarity
     ↓

Similarity = 0.89

89% MATCH
```

---

# 5. 🍕 Restaurant Module

I would call this **Food Connect** in the UI because it gives you more possibilities than restaurants alone.

Students can create:

### Dining request

> “Anyone want Korean food tonight?”

### Group order

> “I'm ordering Chipotle at 7 PM. Anyone want to join?”

### Restaurant trip

> “Going to Kansas City for dinner. Two seats available.”

Core features:

- Restaurant/cuisine
- Dining partner
- Group order
- Time
- Number of people
- Location
- Join group

AI could understand:

> “Anyone interested in getting Indian food around 8?”

and extract:

```
{
  "category": "restaurant",
  "intent": "dining_group",
  "cuisine": "Indian",
  "time": "8 PM"
}
```

---

# 6. 🔐 Cybersecurity Module

This section works differently because you're connecting the student with **information/protection**, rather than necessarily another student.

Have a big:

**Check Something Suspicious**

box.

Student pastes:

> “Your university account expires today. Click ucm-login-example.xyz immediately.”

System returns:

```
SECURITY ANALYSIS

Risk Level: HIGH ⚠️

Possible issues:

✓ Urgency language
✓ Suspicious domain
✓ Credential request
✓ Possible university impersonation

Recommendation:

DO NOT enter your university credentials.
Verify the message through official university channels.
```

### Prototype features

Analyze:

- suspicious messages
- suspicious URLs
- phishing emails
- scam job offers
- fake account warnings

Don't claim your prototype definitively determines whether something is malicious. Present it as a **risk assessment**.

---

# 7. 🌎 Other Needs

Call this something like:

## Community Connect

Students can post miscellaneous needs:

> “Does anyone have a calculator I can borrow?”

> “I need help moving.”

> “Looking for people to play soccer.”

> “I'm new here and don't know how to get groceries.”

> “Does anyone know where I can print?”

> “Looking for furniture.”

AI can classify them further:

```
Community
   │
   ├── Campus Help
   ├── Borrow/Lend
   ├── Activities
   ├── New Student Help
   ├── Shopping
   ├── Moving
   └── Other
```

You don't need separate pages for each.

---

# 8. Database Design

Keep your database manageable.

### USER

```
user_id PK
name
email
password_hash
major
verified
trust_score
created_at
```

### POST

This becomes the heart of ConnectHub.

```
post_id PK
user_id FK
category

title
description

location
destination

date
time

status
created_at
```

`category`:

```
RIDE
STUDY
RESTAURANT
COMMUNITY
```

Cybersecurity analyses don't need to be public posts.

### RIDE_DETAILS

```
ride_id PK
post_id FK

ride_type
start_location
destination
departure_time
available_seats
```

### STUDY_DETAILS

```
study_id PK
post_id FK

course
topic
skill_level
mode
availability
```

### FOOD_DETAILS

```
food_id PK
post_id FK

restaurant
cuisine
activity_type
time
group_size
```

### MATCH

```
match_id PK

post_id FK
matched_post_id FK

match_score
status
created_at
```

### CONNECTION

Once users actually accept:

```
connection_id PK

requester_id FK
receiver_id FK
post_id FK

status
created_at
```

### CYBER_ANALYSIS

```
analysis_id PK
user_id FK

submitted_text
risk_level
analysis_summary
created_at
```

---

# 9. AI Architecture

This is the most important technical part.

Don't tell judges:

> “We integrated AI.”

Explain exactly what AI does.

## AI #1 — Intent Classification

Input:

> “Anyone heading to Walmart tonight?”

Output:

```
{
    "category": "RIDE"
}
```

Another:

> “I need help with SQL.”

returns:

```
{
    "category": "STUDY"
}
```

Possible labels:

```
RIDE
STUDY
RESTAURANT
CYBERSECURITY
COMMUNITY
```

---

# 10. AI #2 — Information Extraction

After classification, extract structured information.

Input:

> “Looking for someone to study Python loops tomorrow around 6 in the library.”

Output:

```
{
    "category": "STUDY",
    "subject": "Python",
    "topic": "loops",
    "date": "tomorrow",
    "time": "6 PM",
    "location": "library"
}
```

Then store this in your database.

This is a strong demonstration of using **unstructured text → structured data**.

---

# 11. AI #3 — Semantic Matching

This should be your most important AI feature.

Convert posts into embeddings.

For example:

```
Post A

"Need help understanding SQL joins."

            ↓

       AI embedding

            ↓

[0.21, -0.52, 0.17, ...]
```

Compare against existing posts.

```
"Can help with relational databases"

Similarity → 0.91
```

Then combine semantic similarity with normal rules.

For Study:

```
Match Score =

Semantic similarity       40%
Course/topic              25%
Availability              20%
Location/mode             15%
```

Result:

> **91% match**

---

# 12. Don't Use AI for Everything

This will actually make your system better.

For example, ride matching should rely heavily on structured data.

Two people:

```
A → Walmart at 6:00
B → Walmart at 5:55
```

Clearly match.

You don't need an LLM deciding that.

Use:

```
AI
↓
Understand request

Traditional algorithm
↓
Apply constraints

Embeddings
↓
Semantic similarity

Final scoring
↓
Recommended connection
```

That's a more defensible technical architecture.

---

# 13. Divide the Work Between TWO PEOPLE

This is where I'd be very deliberate.

Don't assign:

> Person 1 → Frontend\
> Person 2 → Backend

That can create a bottleneck where Person 1 waits for Person 2.

Instead, give each person ownership of features while sharing the core architecture.

## 👩‍💻 PERSON 1 — Platform + Ride + Restaurant

### Phase 1

Set up:

- React/Vite project
- Tailwind
- Navigation
- Dashboard
- Git repository structure

### Phase 2

Build shared UI components:

```
Navbar
PostCard
CreatePost
MatchCard
ProfileCard
CategoryCard
```

### Phase 3 — Ride

Build:

- Create ride form
- Offer/request toggle
- Ride cards
- Ride search/results
- Match display

### Phase 4 — Restaurant

Build:

- Restaurant/food form
- Dining groups
- Join button
- Restaurant cards

### Phase 5

Integrate frontend with backend APIs.

---

# 👨‍💻 PERSON 2 — Backend + AI + Study + Cybersecurity

### Phase 1

Set up:

```
FastAPI
SQLite
SQLAlchemy
```

Create database models and endpoints.

For example:

```
POST /posts

GET /posts

GET /posts/{category}

POST /matches

POST /analyze
```

### Phase 2 — AI

Implement:

**Intent classification**

```
Text → Category
```

**Information extraction**

```
Text → JSON
```

**Embeddings**

```
Post → Vector
```

**Semantic matching**

```
Post A ↔ Post B
```

### Phase 3 — Study

Implement:

- study posts
- topic extraction
- course matching
- semantic similarity
- match scores

### Phase 4 — Cybersecurity

Implement:

```
POST /security/analyze
```

Return:

```
{
    "risk": "HIGH",
    "reasons": [
        "Urgency language",
        "Suspicious URL",
        "Credential request"
    ],
    "recommendation": "Do not enter credentials."
}
```

---

# 14. BOTH PEOPLE — Community Connect

Don't assign a lot of development time to Other Needs.

Reuse the existing `POST` system.

Person 1 builds the page.

Person 2 connects classification/matching.

Therefore:

```
"I need someone to play soccer."

       ↓

COMMUNITY

       ↓

Search related community posts

       ↓

Find people
```

Very little extra architecture is necessary.

---

# 15. Git Structure

You can organize your project:

```
connecthub/
│
├── frontend/
│
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── Home
│   │   │   ├── Ride
│   │   │   ├── Study
│   │   │   ├── Food
│   │   │   ├── Security
│   │   │   └── Community
│   │   └── services/
│
├── backend/
│   ├── main.py
│   ├── models/
│   ├── routes/
│   ├── database/
│   ├── ai/
│   │   ├── classifier.py
│   │   ├── extractor.py
│   │   ├── embeddings.py
│   │   └── matcher.py
│   └── security/
│
└── README.md
```

---

# 16. What NOT to Build

With two people, scope control will determine whether you finish.

I would **not** try to implement:

- real payments
- actual Uber integration
- live GPS tracking
- production authentication
- real university SSO
- full messaging system
- restaurant ordering
- complicated maps/navigation
- mobile apps
- dozens of AI agents

Fake/sample data is completely reasonable for demonstrating your matching engine.

---

# 17. Minimum Viable Product

If time becomes limited, your **must-have prototype** is only:

1. Student enters a natural-language request.
2. AI classifies it into Ride/Study/Restaurant/Cybersecurity/Community.
3. AI extracts relevant information.
4. Request gets stored.
5. System searches existing posts.
6. Semantic/rule-based matching calculates matches.
7. UI shows top connections.
8. Cybersecurity analyzer demonstrates phishing-risk analysis.

Everything else is optional.

---

# 18. Hackathon Timeline for 2 People

If you have roughly **24 hours**, I'd organize it like this:

| Time      | Person 1               | Person 2                     |
| --------- | ---------------------- | ---------------------------- |
| Hours 0–2 | React/UI setup         | FastAPI/database setup       |
| 2–5       | Dashboard + components | Database + APIs              |
| 5–8       | Ride module            | AI classification/extraction |
| 8–11      | Restaurant             | Study + semantic matching    |
| 11–14     | Community UI           | Cybersecurity analyzer       |
| 14–17     | Connect APIs/UI        | Connect AI/UI                |
| 17–20     | Styling + UX           | Matching improvements        |
| 20–22     | Testing/bug fixing     | Testing/bug fixing           |
| 22–24     | Demo + presentation    | Demo + presentation          |

If you have 48 hours, spend the additional time on maps, authentication, better matching, and UI polish—not on adding five more features.

---

# 19. The Demo Story

Your presentation shouldn't demonstrate every button.

Start with:

> **“Students don't just need information. They need connections.”**

Then enter:

> **“I'm new here, don't have a car, and need to go to Walmart around 6 tonight.”**

ConnectHub:

```
AI UNDERSTANDING

Category: 🚗 Ride
Destination: Walmart
Time: ~6 PM
Additional need: New student assistance
```

Then:

```
TOP CONNECTIONS

Sarah
🚗 Offering ride → Walmart
🕐 5:45 PM
██████████ 94%

Walmart Grocery Group
👥 4 students
🕐 6:15 PM
█████████░ 89%
```

Then quickly demonstrate:

> “I don't understand SQL joins and need someone to study with.”

→ **Study match**

Then:

> “Your university account expires today—click this link.”

→ **Cybersecurity warning**

Now in about two minutes you've demonstrated **social connection + transportation + AI + networking + cybersecurity**.

The technical story becomes especially compelling because ConnectHub isn't five unrelated buttons. The architecture is essentially:

**Understand → Extract → Match → Connect → Protect.**

That is the idea I would build the entire hackathon pitch around.