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

  // Keep one stable client instance for the whole provider
  const supabase = useMemo(() => createSupabaseClient(), []);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: { session: currentSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("[Auth] getSession error:", error);
        }

        if (!isMounted) return;

        setSession(currentSession ?? null);
        setLoading(false);
      } catch (error) {
        console.error("[Auth] Failed to initialize auth:", error);

        if (!isMounted) return;
        setSession(null);
        setLoading(false);
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log("[Auth] onAuthStateChange:", event);

      if (!isMounted) return;

      setSession(newSession ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithEmail = async (email: string, password: string) => {
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

    const parsed = Linking.parse(result.url);

    const accessToken =
      typeof parsed.queryParams?.access_token === "string"
        ? parsed.queryParams.access_token
        : null;

    const refreshToken =
      typeof parsed.queryParams?.refresh_token === "string"
        ? parsed.queryParams.refresh_token
        : null;

    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        console.error("[Auth] setSession error:", sessionError);
        throw sessionError;
      }
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut({
      scope: "local",
    });

    if (error) {
      console.error("[Auth] signOut error:", error);
      throw error;
    }
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