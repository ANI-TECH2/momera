import "react-native-url-polyfill/auto";
import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { getStorage } from "@/lib/storage";

const expoExtra = Constants.expoConfig?.extra ?? {};
const supabaseUrl =
  (expoExtra as { expoPublicSupabaseUrl?: string }).expoPublicSupabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  (expoExtra as { expoPublicSupabaseAnonKey?: string }).expoPublicSupabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Service role key — only available server-side (no EXPO_PUBLIC_ prefix = never exposed to client)
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "Missing Supabase URL. Define EXPO_PUBLIC_SUPABASE_URL in your environment."
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    "Missing Supabase anon key. Define EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment."
  );
}

if (!serviceRoleKey) {
  console.warn(
    "Warning: SUPABASE_SERVICE_ROLE_KEY is not defined. serverSupabase will not be available for server-side operations."
  );
}

// ─── SERVER CLIENT ────────────────────────────────────────────────────────────
// Uses service role key to bypass RLS for trusted API route operations.
// Never expose this client or key to the frontend/browser.
export const serverSupabase = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// ─── CLIENT CREATOR ───────────────────────────────────────────────────────────
// Uses anon key — safe for frontend. RLS protects all data access.
export const createSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase configuration. Check your .env file."
    );
  }

  if (Platform.OS === "web") {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } else {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: getStorage(),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
};