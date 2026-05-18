## Problem

Signup fails with `500 — Database error saving new user`.

A trigger `on_auth_user_created` on `auth.users` calls `public.handle_new_user()`, which inserts a row into `public.profiles`. The function is declared `SECURITY DEFINER` but does **not** set `search_path`. When Supabase Auth's internal role fires the trigger, `profiles` can't be resolved, the insert errors, and Auth aborts the whole signup transaction.

## Fix

Run one migration that:

1. Replaces `public.handle_new_user()` with a hardened version:
   - Qualifies the table as `public.profiles`
   - Adds `SET search_path = public`
   - Wraps the insert in an exception block so a profile-row failure can never block signup again (logs a warning, still returns `NEW`)

2. Leaves the existing trigger `on_auth_user_created` in place (it's already wired correctly).

No schema changes to `profiles` are needed — `id` and `email` columns already exist and match what the function inserts.

No frontend changes needed.

## Verification

After applying:
- Sign up with `445011121@sm.imamu.edu.sa` → should succeed (200 from `/auth/v1/signup`)
- A row should appear in `public.profiles` with that user's `id` and `email`
- Subsequent sign-in works and redirects to the dashboard
