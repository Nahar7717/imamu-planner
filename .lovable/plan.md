## Add Visitor Mode

Let users explore the planner without signing in. Progress is saved in the browser only, with a banner inviting them to create an account to save it permanently.

### Changes

**1. `src/routes/auth.tsx`** — Add a "Continue as visitor" button below the sign-in form. Clicking it sets `localStorage.visitorMode = "true"` and navigates to `/`.

**2. `src/hooks/useAuth.tsx`** — Add an `isVisitor` flag (reads from localStorage). Update the auth gate logic so visitor mode counts as "allowed in" without a real Supabase user.

**3. `src/routes/index.tsx`** — When `isVisitor` is true (and no user):
- Skip the redirect to `/auth`.
- Replace the Supabase `progress` query with a localStorage-backed store (key: `visitor_progress`, an array of completed course codes).
- Replace the `toggle` mutation with a local state update that writes to localStorage.
- Show a dismissible banner at the top: "You're browsing as a visitor. Progress is saved only in this browser — [Sign up] to save it to your account."
- Change the header: replace email with "Visitor"; change "Sign out" to "Exit visitor mode" (clears localStorage and returns to `/auth`).

**4. Course completion logic** — Abstract the read/write so the same UI works for both modes. A small helper hook (`useProgress`) returns `{ completedCodes, toggle }` and picks the backend based on `isVisitor` vs authenticated user.

### Out of scope
- Migrating visitor progress into the account on sign-up (can be added later).
- No DB/schema changes.
