# Add this package to your existing repository

## Existing files first
Extract the ZIP outside your repository. The `ConnectHub-Handoff` directory contains files intended for your repository root. Copy its **contents**, rather than nesting the folder itself. If README.md, AGENTS.md, .gitignore, .env.example or docs already exist, merge the relevant sections instead of replacing them. The original handoff package contained planning documents and sample responses. The current repository includes the React frontend, FastAPI backend and student login; use README.md for application setup.

## Easiest route: GitHub website
1. Open your existing repository, and select its default branch (often main).
2. Create a branch named `docs/connecthub-handoff` using the branch selector.
3. Choose Add file → Upload files.
4. Upload the extracted files/folders while preserving `docs/` paths. Check that AGENTS.md is at the repository root. Merge any colliding files with the existing versions before uploading.
5. Commit the documentation to the new branch.
6. Open a pull request against your repository's default branch, inspect the diff, and merge the handoff.

Uploading the ZIP itself does not unpack its files for Codex; upload the extracted contents.

## Git route on your laptop
If the repository is not already local:
```bash
git clone https://github.com/shakiful/Mulehacks-26.git
cd Mulehacks-26
```
Use your actual URL/name. If already cloned, open that folder. Check uncommitted work before switching branches:
```bash
git status
git switch main
git pull --ff-only origin main
git switch -c docs/connecthub-handoff
```
Substitute your actual default branch if it is not main. If local work is present, commit it on its appropriate branch before switching; do not discard it.

Copy/merge the extracted contents now, then:
```bash
git diff
git add AGENTS.md README.md docs .env.example .gitignore
git diff --cached
git commit -m "Add ConnectHub specification and team handoff"
git push -u origin docs/connecthub-handoff
```
Open and merge a GitHub PR. Both people pull the merged default branch before implementing.

## Invite Person 1
For a personal GitHub repository: Settings → Collaborators (under Access) → Add people. Search their GitHub username or email and send the invitation. They accept with their own account. Organization repositories may show Collaborators and teams / Manage access instead.
Official guide: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository

## Separate laptops / separate Codex tasks
Both clone the same repository after the handoff merges. Each opens their own local repository in their coding environment and signs in with their own account. Paste the relevant prompt from docs/prompts. Explicitly tell Codex to read AGENTS.md and the referenced documents.

Person 2:
```bash
git switch main
git pull --ff-only origin main
git switch -c person2/backend-ai
```
Person 1:
```bash
git switch main
git pull --ff-only origin main
git switch -c person1/frontend
```
Create these branches once. Later use `git switch` without `-c`.

## Daily integration cycle
Commit your feature on your branch, inspect staged files, then push:
```bash
git status
git add PATH_TO_CHANGED_FILES
git diff --cached
git commit -m "Describe the completed feature"
git push -u origin YOUR_BRANCH
```
Open a PR into main; teammate reviews, then merge. Bring merged work into your active branch from a clean working tree:
```bash
git fetch origin
git merge origin/main
```
Resolve conflicts together in shared contracts/components, run relevant checks, commit and push. Do not force push shared branches. If a feature branch was deleted after its PR merged, create a new task branch from updated main.

## Data and secrets
Each local SQLite database is independent. Both run the same seed script, but changes to records on one laptop will not appear on the other. Use one laptop for the final integrated demo unless a shared backend is deliberately configured. localhost on Person 1's laptop never refers to Person 2's laptop.

Each laptop uses its own local .env files. Keep provider keys on backend only. The .gitignore template does not untrack secrets already committed; inspect tracked files before publishing changes. Do not upload real private data for seed examples.

## Student accounts on each laptop

Create or preserve `backend/.env`, then set private passwords of at least 10 characters in `RAFI_LOGIN_PASSWORD` and `AFSANA_LOGIN_PASSWORD`. Run `python -m backend.app.seed` with the backend virtual environment before starting the services. Sign in at http://localhost:5173/login as `rafi` or `afsana`. Click Log out before testing the other account; there is no demo identity selector. Each laptop has its own account hashes and data. After intentionally changing a password setting, use `python -m backend.app.seed --reset-passwords` to apply it.

Keep frontend and backend on the same hostname, such as localhost:5173 and localhost:8000. The shared API client includes session cookies and CSRF headers; the backend CORS configuration must allow the frontend origin and credentials. For an HTTPS deployment set SESSION_COOKIE_SECURE=true. Registration and university SSO remain outside the local prototype.
