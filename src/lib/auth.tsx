import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { Session, User, SupabaseClient } from "@supabase/supabase-js";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { createSupabaseClient } from "@/server/supabase";
import {
  saveOfflineUserId,
  clearOfflineUserId,
  saveOfflineUserPlan,
  clearOfflineUserPlan,
} from "@/lib/storage";

WebBrowser.maybeCompleteAuthSession();

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  plan: 'free' | 'pro' | 'premium' | null;
  supabase: SupabaseClient;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<'free' | 'pro' | 'premium' | null>(null);

  const supabase = useMemo(() => createSupabaseClient(), []);

  const persistUserId = async (userId: string | null) => {
    try {
      if (userId) {
        await saveOfflineUserId(userId);
      } else {
        await clearOfflineUserId();
      }
    } catch (error) {
      console.warn("[Auth] Could not persist offline user ID:", error);
    }
  };

  // 1. Fixed Fetch Logic to point to 'profiles' table
  const fetchPlan = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles') // Fixed table name
        .select('plan')
        .eq('id', userId) // Fixed column name (id instead of user_id)
        .single();

      if (error) {
        console.warn('[Auth] No profile found or error:', error.message);
        setPlan('free'); 
        await saveOfflineUserPlan('free');
      } else {
        const userPlan = data?.plan || 'free';
        setPlan(userPlan);
        await saveOfflineUserPlan(userPlan);
      }
    } catch (error) {
      console.error('[Auth] Fetch plan failed:', error);
      setPlan('free');
      await saveOfflineUserPlan('free');
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (isMounted) {
          setSession(currentSession);
          await persistUserId(currentSession?.user?.id ?? null);
          if (currentSession?.user) {
            await fetchPlan(currentSession.user.id);
          }
          setLoading(false);
        }
      } catch (error) {
        console.error("[Auth] Init error:", error);
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    // 2. Realtime Listener: Updates UI immediately if you change plan in SQL editor
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      setSession(newSession);
      await persistUserId(newSession?.user?.id ?? null);
      
      if (newSession?.user) {
        await fetchPlan(newSession.user.id);
      } else {
        setPlan(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
    await persistUserId(data?.session?.user?.id ?? null);
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
    await persistUserId(data?.user?.id ?? data?.session?.user?.id ?? null);
  };

  const signInWithGoogle = async () => {
    const redirectTo = Linking.createURL("/");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });

    if (error) throw error;
    if (!data?.url) throw new Error("No OAuth URL");

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === "success") {
      const parsed = Linking.parse(result.url);
      const accessToken = parsed.queryParams?.access_token as string;
      const refreshToken = parsed.queryParams?.refresh_token as string;

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
    }
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    await clearOfflineUserId();
    await clearOfflineUserPlan();
    setSession(null);
    setPlan(null);
    setLoading(false);
  };

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      plan,
      supabase,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
    }),
    [session, loading, plan, supabase]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}