## Problem

Login succeeds on the server (auth logs show 200), but the app navigates the user straight back to `/auth`. The `beforeLoad` guards in `src/routes/index.tsx` and `src/routes/auth.tsx` call `supabase.auth.getSession()` unconditionally. During SSR (and before the browser client has hydrated the session from `localStorage`), that call returns `null`, so the index route throws `redirect({ to: "/auth" })` immediately after sign-in.

## Fix

Move the auth gate out of `beforeLoad` and into the component, using a hydrated session check. This matches the TanStack + Supabase pattern (gate only after `getUser()`/session hydration completes on the client).

### `src/routes/index.tsx`
- Remove the `beforeLoad` redirect.
- In the `Dashboard` component, use the existing `useAuth()` hook: while `loading`, render a spinner; once loaded, if `!user`, `navigate({ to: "/auth" })`. Only render dashboard content when `user` exists.
- Keep all data queries gated on `enabled: !!user` (already done for progress; apply same to courses/prerequisites so RLS-protected queries never fire pre-auth).

### `src/routes/auth.tsx`
- Remove the `beforeLoad` redirect.
- In `AuthPage`, use `useAuth()`; if `user` exists after loading, `navigate({ to: "/" })`.

### `src/routes/__root.tsx`
- Add a one-time `onAuthStateChange` listener that calls `router.invalidate()` and `queryClient.invalidateQueries()` so cached data refreshes on sign in/out.

## Why this works

`localStorage`-persisted sessions only exist in the browser. The `useAuth` hook already subscribes to `onAuthStateChange` and calls `getSession()` on mount, so it correctly reports `loading → user`. Gating in the component avoids the SSR/prerender false-negative that's currently bouncing you to `/auth`.

No database, RLS, or business-logic changes — purely a frontend auth-flow fix.
