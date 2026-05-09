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
import { useAuth } from "@/lib/auth";
import { COLORS } from "@/lib/constants";
import { Ionicons, AntDesign } from "@expo/vector-icons";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingType, setLoadingType] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<"email" | "password" | null>(null);

  // 🔥 Fix: Track mount status to prevent WindowManager crashes
  const isMounted = useRef(true);

  const { signUpWithEmail, signInWithGoogle, loading: authLoading } = useAuth();
  const router = useRouter();

  const isLoading = loadingType !== null;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    isMounted.current = true;
    
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

    return () => {
      isMounted.current = false; // Set to false when component unmounts
    };
  }, []);

  const handleSignup = async () => {
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required");
      return;
    }
    
    setLoadingType("email");
    try {
      await signUpWithEmail(email.trim(), password.trim());
    } catch (e: any) {
      if (isMounted.current) {
        setError(e.message || "Signup failed");
      }
    } finally {
      if (isMounted.current) setLoadingType(null);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoadingType("google");
    try {
      await signInWithGoogle();
      // If sign in is successful and triggers a redirect, 
      // the code below might run after unmount, causing the crash.
    } catch (e: any) {
      if (isMounted.current) {
        setError(e.message || "Google signup failed");
      }
    } finally {
      if (isMounted.current) setLoadingType(null);
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
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
              <Animated.View
                style={[
                  styles.card,
                  { opacity: fadeAnim, transform: [{ translateY }] },
                ]}
              >
                <Text style={styles.title}>Create account 🚀</Text>
                <Text style={styles.subtitle}>Start using Memora</Text>

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
                    placeholder="Password (6+ characters)"
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

                {error ? <Text style={styles.error}>{error}</Text> : null}

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

                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.divider} />
                </View>

                <Pressable style={styles.googleButton} onPress={handleGoogle}>
                  <AntDesign name="google" size={18} color={COLORS.text} />
                  <Text style={styles.googleText}> Continue with Google</Text>
                </Pressable>

                <Pressable onPress={() => router.push("/(auth)/login")}>
                  <Text style={styles.link}>
                    Already have an account? <Text style={styles.linkStrong}>Sign in</Text>
                  </Text>
                </Pressable>
              </Animated.View>
            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContainer: { flexGrow: 1 },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: { fontSize: 24, fontWeight: "700", color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, marginBottom: 24 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 56,
  },
  inputFocused: {
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  toggleText: { color: COLORS.primary, fontWeight: "600" },
  error: { color: "#FF4D4D", marginBottom: 12, fontSize: 14, textAlign: "center" },
  primaryButton: {
    backgroundColor: COLORS.primary,
    height: 56,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 24 },
  divider: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginHorizontal: 12, color: COLORS.textSecondary, fontSize: 12 },
  googleButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 56,
    borderRadius: 14,
  },
  googleText: { fontWeight: "600", color: COLORS.text, fontSize: 16 },
  link: { textAlign: "center", marginTop: 24, color: COLORS.textSecondary, fontSize: 14 },
  linkStrong: { color: COLORS.primary, fontWeight: "700" },
  buttonDisabled: { opacity: 0.6 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  loadingText: { marginTop: 12, color: COLORS.text, fontWeight: "500" },
});