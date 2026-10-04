# Add student sign-in/logout and replace demo identity

Students previously selected a demo profile, and the backend trusted a demo identity header. The app now opens `/login` before protected pages, signs in as Rafi or Afsana with private local passwords, restores active sessions on reload, and shows the student name plus Log out in the header. Logging out revokes the server session and returns to sign-in; expired sessions also require a new login.

The user authorized backend authentication for this frontend task. The API contract now defines login/session/logout and credentialed cookie requests with CSRF protection. The live adapter, fixture adapter and consumers use the same methods. Backend passwords are salted hashes, session tokens are random and stored hashed, and login attempts are throttled. The demo selector, listing endpoint, accepted identity header, demo settings and legacy demo flag are removed. Existing post and connection records are preserved during migration; only Rafi and Afsana are provisioned as login accounts. Passwords, database files and the migration backup remain local and ignored.

Study and Security retain the agreed Person 2 page paths and shared API/components. University SSO, self-registration and password recovery remain outside the local prototype; the private Security analyzer is still pending. Setup and test-account instructions are in README.md.

Validation:

- `python -m pytest backend/tests -q`: 243 passing tests, including authentication, cookie/CSRF handling, logout replay rejection and legacy-data migration.
- `cd frontend && npm run check -- --maxWorkers=2`: TypeScript and 62 passing tests.
- `cd frontend && npm run build`: production build passed.
- Live Chrome: both student accounts, incorrect password, session reload, HttpOnly cookies, revoked logout cookies, edit ownership, same-route 10 PM matching at 100/100, and Rafi request → Afsana acceptance.
- Desktop/mobile login screenshots reviewed; synthetic browser-test posts cancelled, existing posts unchanged.
- `git diff --check`: clean.

Changes remain on the existing `feat/frontend` branch. This is a prepared PR description; no merge is performed.
