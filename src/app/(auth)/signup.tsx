import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { COLORS } from "@/lib/constants";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingType, setLoadingType] = useState<"email" | "google" | null>(null);

  const { signUpWithEmail, signInWithGoogle, loading: authLoading } = useAuth();
  const router = useRouter();

  const isLoading = loadingType !== null;

  const handleSignup = async () => {
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      Alert.alert("Missing details", "Please enter your email and password.");
      return;
    }

    if (cleanPassword.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    setLoadingType("email");

    try {
      await signUpWithEmail(cleanEmail, cleanPassword);
    } catch (error) {
      Alert.alert("Signup failed", (error as Error).message || "Unable to create account.");
    } finally {
      setLoadingType(null);
    }
  };

  const handleGoogle = async () => {
    setLoadingType("google");

    try {
      await signInWithGoogle();
    } catch (error) {
      Alert.alert(
        "Google signup failed",
        (error as Error).message || "Unable to continue with Google."
      );
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>MEMORA</Text>
          </View>

          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>
            Start saving notes, memories, prices, images, and documents you can retrieve through chat.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Join Memora</Text>

          {/* EMAIL */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={COLORS.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          {/* PASSWORD */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Create a password (6+ chars)"
                placeholderTextColor={COLORS.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />

              <Pressable style={styles.passwordToggle} onPress={() => setShowPassword((prev) => !prev)}>
                <Text style={styles.passwordToggleText}>
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* SIGNUP BUTTON */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || isLoading) && styles.buttonPressed,
              isLoading && styles.buttonDisabled,
            ]}
            onPress={handleSignup}
            disabled={isLoading}
          >
            {loadingType === "email" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Create Account</Text>
            )}
          </Pressable>

          {/* DIVIDER */}
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          {/* GOOGLE */}
          <Pressable
            style={({ pressed }) => [
              styles.googleButton,
              (pressed || isLoading) && styles.buttonPressed,
              isLoading && styles.buttonDisabled,
            ]}
            onPress={handleGoogle}
            disabled={isLoading}
          >
            {loadingType === "google" ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            )}
          </Pressable>

          <Text style={styles.privacyText}>
            Your Memora account helps keep your saved data connected and easy to retrieve anytime.
          </Text>
        </View>

        {/* LOGIN LINK */}
        <Pressable
          onPress={() => router.push("/(auth)/login")}
          disabled={isLoading}
          style={({ pressed }) => [styles.footerLinkWrap, pressed && styles.buttonPressed]}
        >
          <Text style={styles.link}>
            Already have an account? <Text style={styles.linkStrong}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  hero: {
    marginBottom: 28,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 18,
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.textSecondary,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },

  /* PASSWORD FIXED */
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: COLORS.background,
    minHeight: 56,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 15,
    paddingHorizontal: 0,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: "transparent",
  },
  passwordToggle: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  passwordToggleText: {
    color: COLORS.primary,
    fontWeight: "700",
  },

  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: 12,
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  googleButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  googleButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
  },
  privacyText: {
    marginTop: 16,
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
  footerLinkWrap: {
    alignItems: "center",
    marginTop: 20,
  },
  link: {
    color: COLORS.textSecondary,
    fontSize: 15,
  },
  linkStrong: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.text,
    fontSize: 16,
    marginTop: 14,
  },
});