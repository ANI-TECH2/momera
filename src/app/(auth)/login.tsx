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
  TouchableWithoutFeedback,
} from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useAuth } from "@/lib/auth";
import { COLORS } from "@/lib/constants";
import { Ionicons, AntDesign } from "@expo/vector-icons";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingType, setLoadingType] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState("");
  const [remember, setRemember] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  // Plan is now available directly from useAuth
  const { signInWithEmail, signInWithGoogle, loading: authLoading, supabase, plan } = useAuth();
  const router = useRouter();

  const isLoading = loadingType !== null;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
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
      // AuthContext handles the fetchPlan automatically on sign in
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
      // The redirect logic in AuthProvider will trigger onAuthStateChange
      // which calls fetchPlan('profiles') automatically.
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
        { redirectTo: resetUrl }
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
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.wrapper}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <Animated.View
              style={[
                styles.container,
                { opacity: fadeAnim, transform: [{ translateY }] },
              ]}
            >
              <View style={styles.header}>
                <Text style={styles.title}>Welcome back 👋</Text>
                <Text style={styles.subtitle}>
                  Sign in to continue {plan === 'pro' && " (Pro User)"}
                </Text>
              </View>

              <View style={styles.card}>
                <View style={[styles.inputWrapper, focused === "email" && styles.inputFocused]}>
                  <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={COLORS.textSecondary}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setFocused("email")}
                    onBlur={() => setFocused(null)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={[styles.inputWrapper, focused === "password" && styles.inputFocused]}>
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
                    <Text style={styles.toggleText}>{showPassword ? "Hide" : "Show"}</Text>
                  </Pressable>
                </View>

                <View style={styles.row}>
                  <Pressable style={styles.rememberRow} onPress={() => setRemember(!remember)}>
                    <View style={[styles.checkbox, remember && styles.checked]}>
                      {remember && <Text style={styles.check}>✓</Text>}
                    </View>
                    <Text style={styles.rememberText}>Remember me</Text>
                  </Pressable>
                  <Pressable onPress={() => setShowResetPassword(true)}>
                    <Text style={styles.forgotPassword}>Forgot password?</Text>
                  </Pressable>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

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

                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.divider} />
                </View>

                <Pressable style={styles.googleButton} onPress={handleGoogle}>
                  <AntDesign name="google" size={18} color={COLORS.text} />
                  <Text style={styles.googleText}> Continue with Google</Text>
                </Pressable>

                <Pressable onPress={() => router.push("/(auth)/signup")}>
                  <Text style={styles.link}>
                    Don’t have an account? <Text style={styles.linkStrong}>Sign up</Text>
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </ScrollView>

        {/* RESET PASSWORD MODAL */}
        {showResetPassword && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Pressable style={styles.closeButton} onPress={() => setShowResetPassword(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </Pressable>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <Text style={styles.modalSubtitle}>Enter your email for reset instructions</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={COLORS.textSecondary}
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              {resetMessage ? (
                <Text style={[styles.error, resetMessage.includes("✓") && styles.success]}>
                  {resetMessage}
                </Text>
              ) : null}
              <Pressable
                style={[styles.primaryButton, resetLoading && styles.buttonDisabled]}
                onPress={handleResetPassword}
                disabled={resetLoading}
              >
                {resetLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send Reset Link</Text>}
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  wrapper: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingVertical: 40 },
  container: { paddingHorizontal: 24 },
  header: { marginBottom: 32 },
  title: { fontSize: 28, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 56,
    backgroundColor: COLORS.background,
  },
  inputFocused: { borderColor: COLORS.primary, borderWidth: 2 },
  input: { flex: 1, height: "100%", paddingLeft: 12, fontSize: 16, color: COLORS.text },
  toggleText: { color: COLORS.primary, fontWeight: "700", fontSize: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  rememberRow: { flexDirection: "row", alignItems: "center" },
  checkbox: { width: 20, height: 20, borderWidth: 2, borderColor: COLORS.border, borderRadius: 6, marginRight: 10, alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  check: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  rememberText: { color: COLORS.textSecondary, fontSize: 14 },
  forgotPassword: { color: COLORS.primary, fontWeight: "700", fontSize: 14 },
  error: { color: "#ef4444", marginBottom: 16, fontSize: 14, fontWeight: "500" },
  success: { color: "#10b981" },
  primaryButton: { backgroundColor: COLORS.primary, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 8 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 24 },
  divider: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginHorizontal: 16, color: COLORS.textSecondary, fontSize: 12, fontWeight: "600" },
  googleButton: { flexDirection: "row", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.border, height: 56, borderRadius: 16, backgroundColor: COLORS.card },
  googleText: { fontWeight: "700", color: COLORS.text, fontSize: 15 },
  link: { textAlign: "center", marginTop: 24, color: COLORS.textSecondary, fontSize: 14 },
  linkStrong: { color: COLORS.primary, fontWeight: "800" },
  buttonDisabled: { opacity: 0.6 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  loadingText: { marginTop: 16, color: COLORS.textSecondary, fontWeight: "500" },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "center", alignItems: "center", padding: 20, zIndex: 100 },
  modalContent: { backgroundColor: COLORS.card, borderRadius: 30, padding: 28, width: "100%", maxWidth: 400 },
  closeButton: { alignSelf: "flex-end", padding: 4 },
  modalTitle: { fontSize: 24, fontWeight: "800", color: COLORS.text, marginBottom: 8 },
  modalSubtitle: { fontSize: 15, color: COLORS.textSecondary, marginBottom: 24, lineHeight: 20 },
});