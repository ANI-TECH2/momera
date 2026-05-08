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
import * as Linking from "expo-linking";
import { useAuth } from "@/lib/auth";
import { COLORS } from "@/lib/constants";
import AuthOnboarding from "./onboarding";
import { Ionicons, AntDesign } from "@expo/vector-icons";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingType, setLoadingType] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState("");
  const [remember, setRemember] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const { signInWithEmail, signInWithGoogle, loading: authLoading, supabase } = useAuth();
  const router = useRouter();

  const isLoading = loadingType !== null;

  // animation
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

  // keyboard detection
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const handleLogin = async () => {
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required");
      return;
    }

    setLoadingType("email");

    try {
      await signInWithEmail(email.trim(), password.trim());
    } catch (e: any) {
      setError(e.message || "Login failed");
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
      setError(e.message || "Google login failed");
    } finally {
      setLoadingType(null);
    }
  };

  const handleResetPassword = async () => {
    setResetMessage("");

    if (!resetEmail.trim()) {
      setResetMessage("Please enter your email");
      return;
    }

    setResetLoading(true);

    try {
      const resetUrl = Linking.createURL("/reset-password");

      const { error } = await supabase.auth.resetPasswordForEmail(
        resetEmail.trim(),
        {
          redirectTo: resetUrl,
        }
      );

      if (error) throw error;

      setResetMessage("✓ Check your email for reset instructions");
      setResetEmail("");
      setTimeout(() => setShowResetPassword(false), 2000);
    } catch (e: any) {
      setResetMessage(e.message || "Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  };

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Preparing your workspace...</Text>
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
              <Text style={styles.title}>Welcome back 👋</Text>
              <Text style={styles.subtitle}>Sign in to continue</Text>

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
                  placeholderTextColor={COLORS.textSecondary}
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
                  placeholder="Password"
                  placeholderTextColor={COLORS.textSecondary}
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

              {/* REMEMBER */}
              <Pressable
                style={styles.rememberRow}
                onPress={() => setRemember(!remember)}
              >
                <View style={[styles.checkbox, remember && styles.checked]}>
                  {remember && <Text style={styles.check}>✓</Text>}
                </View>
                <Text style={styles.rememberText}>Remember me</Text>
              </Pressable>

              {/* FORGOT PASSWORD */}
              <Pressable onPress={() => setShowResetPassword(true)}>
                <Text style={styles.forgotPassword}>Forgot password?</Text>
              </Pressable>

              {/* ERROR */}
              {error ? <Text style={styles.error}>{error}</Text> : null}

              {/* LOGIN */}
              <Pressable
                style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={isLoading}
              >
                {loadingType === "email" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Sign In</Text>
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
              <Pressable onPress={() => router.push("/(auth)/signup")}>
                <Text style={styles.link}>
                  Don’t have an account?{" "}
                  <Text style={styles.linkStrong}>Sign up</Text>
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>

        {/* ✅ RESET PASSWORD MODAL */}
        {showResetPassword && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Pressable
                style={styles.closeButton}
                onPress={() => setShowResetPassword(false)}
              >
                <Ionicons name="close" size={24} color={COLORS.text} />
              </Pressable>

              <Text style={styles.modalTitle}>Reset Password</Text>
              <Text style={styles.modalSubtitle}>
                Enter your email and we'll send you a reset link
              </Text>

              {/* EMAIL INPUT */}
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={COLORS.textSecondary}
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  keyboardType="email-address"
                />
              </View>

              {/* MESSAGE */}
              {resetMessage ? (
                <Text
                  style={[
                    styles.error,
                    resetMessage.includes("✓") && styles.success,
                  ]}
                >
                  {resetMessage}
                </Text>
              ) : null}

              {/* SEND BUTTON */}
              <Pressable
                style={[styles.primaryButton, resetLoading && styles.buttonDisabled]}
                onPress={handleResetPassword}
                disabled={resetLoading}
              >
                {resetLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Send Reset Link</Text>
                )}
              </Pressable>

              {/* BACK TO LOGIN */}
              <Pressable onPress={() => setShowResetPassword(false)}>
                <Text style={styles.link}>
                  <Text style={styles.linkStrong}>Back</Text> to login
                </Text>
              </Pressable>
            </View>
          </View>
        )}
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

  // ✅ spacing between onboarding & form
  formContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 10, // 🔥 spacing fix
  },

  title: { fontSize: 22, fontWeight: "700", color: COLORS.text },

  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },

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

  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  checked: {
    backgroundColor: COLORS.primary,
  },

  check: {
    color: "#fff",
    fontSize: 12,
  },

  rememberText: {
    color: COLORS.textSecondary,
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
    marginTop: 6,
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
    marginTop: 12,
    color: COLORS.textSecondary,
  },

  linkStrong: { color: COLORS.primary, fontWeight: "700" },

  buttonDisabled: { opacity: 0.7 },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  loadingText: { marginTop: 10, color: COLORS.text },

  // ✅ RESET PASSWORD MODAL
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    width: "85%",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  closeButton: {
    alignSelf: "flex-end",
    marginBottom: 12,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
  },

  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },

  forgotPassword: {
    color: COLORS.primary,
    fontWeight: "600",
    fontSize: 13,
    marginTop: 8,
    marginBottom: 12,
  },

  success: {
    color: "#10b981",
  },
});