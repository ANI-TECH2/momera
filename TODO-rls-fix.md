# Fix RLS "row violates row-level security policy for table notes"

**Issue:** API routes use anon key (respects RLS), but needs service role to bypass for server-side.

**Quick Fix:**
1. Supabase Dashboard → Settings → API → service_role key
2. Add to `.env.local`:
```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```
3. Update `src/server/supabase.ts` serverSupabase to:
```
process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
```
4. `expo start --clear --web`

**Alternative:** Run schema.sql if not applied (Dashboard → SQL Editor → Paste schema.sql → Run).

**Why?** Anon key respects RLS (user_id must match auth.uid()). Service role bypasses for API.

Test: "save my number 333333333" → Success!

