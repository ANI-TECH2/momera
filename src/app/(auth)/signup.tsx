import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Keyboard,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { COLORS } from "@/lib/constants";
import AuthOnboarding from "./onboarding";
import { Ionicons, AntDesign } from "@expo/vector-icons";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingType, setLoadingType] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const { signUpWithEmail, signInWithGoogle, loading: authLoading } = useAuth();
  const router = useRouter();

  const isLoading = loadingType !== null;

  // 🔥 animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // 🔥 keyboard fix
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const handleSignup = async () => {
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoadingType("email");

    try {
      await signUpWithEmail(email.trim(), password.trim());
    } catch (e: any) {
      setError(e.message || "Signup failed");
    } finally {
      setLoadingType(null);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoadingType("google");

    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(e.message || "Google signup failed");
    } finally {
      setLoadingType(null);
    }
  };

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Preparing your account...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
        {/* ✅ ONBOARDING */}
        {!keyboardOpen && (
          <View style={styles.onboardingSection}>
            <AuthOnboarding compact />
          </View>
        )}

        {/* ✅ FORM */}
        <Animated.View
          style={[
            styles.formWrapper,
            { opacity: fadeAnim, transform: [{ translateY }] },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <Text style={styles.title}>Create account 🚀</Text>
              <Text style={styles.subtitle}>Start using Memora</Text>

              {/* EMAIL */}
              <View
                style={[
                  styles.inputWrapper,
                  focused === "email" && styles.inputFocused,
                ]}
              >
                <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                />
              </View>

              {/* PASSWORD */}
              <View
                style={[
                  styles.inputWrapper,
                  focused === "password" && styles.inputFocused,
                ]}
              >
                <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="Password (6+ characters)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)}>
                  <Text style={styles.toggleText}>
                    {showPassword ? "Hide" : "Show"}
                  </Text>
                </Pressable>
              </View>

              {/* ERROR */}
              {error ? <Text style={styles.error}>{error}</Text> : null}

              {/* SIGNUP */}
              <Pressable
                style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                onPress={handleSignup}
                disabled={isLoading}
              >
                {loadingType === "email" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Create Account</Text>
                )}
              </Pressable>

              {/* DIVIDER */}
              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.divider} />
              </View>

              {/* GOOGLE */}
              <Pressable style={styles.googleButton} onPress={handleGoogle}>
                <AntDesign name="google" size={18} />
                <Text style={styles.googleText}> Continue with Google</Text>
              </Pressable>

              {/* LINK */}
              <Pressable onPress={() => router.push("/(auth)/login")}>
                <Text style={styles.link}>
                  Already have an account?{" "}
                  <Text style={styles.linkStrong}>Sign in</Text>
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 20 },

  // ✅ dynamic onboarding (flexShrink allows natural sizing)
  onboardingSection: {
    flexShrink: 1,
    minHeight: 160,
    maxHeight: 280,
    marginBottom: 24,
    justifyContent: "center",
  },

  // ✅ form fills remaining space
  formWrapper: {
    flex: 1,
  },

  formContent: {
    padding: 20,
    paddingBottom: 60,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  title: { fontSize: 22, fontWeight: "700", color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 20 },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
  },

  inputFocused: {
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },

  input: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
  },

  toggleText: {
    color: COLORS.primary,
    fontWeight: "600",
  },

  error: {
    color: "red",
    marginBottom: 10,
  },

  primaryButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
  },

  primaryText: { color: "#fff", fontWeight: "700" },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
  },

  divider: { flex: 1, height: 1, backgroundColor: COLORS.border },

  dividerText: { marginHorizontal: 10, color: COLORS.textSecondary },

  googleButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    borderRadius: 14,
  },

  googleText: { fontWeight: "600", color: COLORS.text },

  link: {
    textAlign: "center",
    marginTop: 14,
    color: COLORS.textSecondary,
  },

  linkStrong: {
    color: COLORS.primary,
    fontWeight: "700",
  },

  buttonDisabled: { opacity: 0.7 },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  loadingText: { marginTop: 10, color: COLORS.text },
});