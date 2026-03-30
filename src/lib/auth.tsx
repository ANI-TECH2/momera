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

WebBrowser.maybeCompleteAuthSession();

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  supabase: SupabaseClient | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const client = createSupabaseClient();
        if (!mounted) return;

        setSupabase(client);

        const {
          data: { session },
          error,
        } = await client.auth.getSession();

        if (error) {
          console.error("[Auth] getSession error:", error);
        }

        if (mounted) {
          setSession(session ?? null);
          setLoading(false);
        }

        const {
          data: { subscription },
        } = client.auth.onAuthStateChange((_event, newSession) => {
          if (!mounted) return;
          setSession(newSession ?? null);
          setLoading(false);
        });

        return subscription;
      } catch (error) {
        console.error("[Auth] Failed to initialize Supabase client:", error);
        if (mounted) {
          setLoading(false);
        }
        return null;
      }
    };

    let authSubscription: { unsubscribe: () => void } | null = null;

    init().then((sub) => {
      authSubscription = sub;
    });

    return () => {
      mounted = false;
      authSubscription?.unsubscribe();
    };
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    if (!supabase) {
      throw new Error("Supabase not ready");
    }

    const cleanEmail = email.trim().toLowerCase();

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      console.error("[Auth] signInWithEmail error:", error);
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, password: string) => {
    if (!supabase) {
      throw new Error("Supabase not ready");
    }

    const cleanEmail = email.trim().toLowerCase();

    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    });

    if (error) {
      console.error("[Auth] signUpWithEmail error:", error);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    if (!supabase) {
      throw new Error("Supabase not ready");
    }

    const redirectTo = Linking.createURL("/");

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      console.error("[Auth] signInWithGoogle error:", error);
      throw error;
    }

    if (!data?.url) {
      throw new Error("No OAuth URL returned from Supabase");
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type !== "success") {
      throw new Error("Google sign-in was cancelled or failed");
    }

    const url = result.url;
    const parsed = Linking.parse(url);

    const access_token =
      typeof parsed.queryParams?.access_token === "string"
        ? parsed.queryParams.access_token
        : null;

    const refresh_token =
      typeof parsed.queryParams?.refresh_token === "string"
        ? parsed.queryParams.refresh_token
        : null;

    if (access_token && refresh_token) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (sessionError) {
        console.error("[Auth] setSession error:", sessionError);
        throw sessionError;
      }
    }
  };

  const signOut = async () => {
    if (!supabase) {
      throw new Error("Supabase not ready");
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("[Auth] signOut error:", error);
      throw error;
    }

    setSession(null);
  };

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      supabase,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
    }),
    [session, loading, supabase]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}