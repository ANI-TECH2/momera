# Supabase Setup Instructions

## 1. Get Keys from Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project
3. Settings > API
4. Copy:
   - **URL** → `EXPO_PUBLIC_SUPABASE_URL`
   - **anon/public** → `EXPO_PUBLIC_SUPABASE_ANON_KEY` 
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (optional for now)

## 2. Update .env.local
Replace placeholders in `.env.local` with real values.

## 3. Restart Expo
```bash
expo start --clear --web
```

## 4. For Production/Server (Railway/Vercel)
- Add `SUPABASE_SERVICE_ROLE_KEY` to platform env vars (private)
- Update src/server/supabase.ts serverSupabase to use service_role when available

## 5. Security Note
- anon key: Safe for client-side (uses RLS)
- service_role: Bypass RLS, only server-side

✅ Error should be fixed after restart!

